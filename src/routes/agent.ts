import { Router, type Request, type Response } from 'express';
import { WORKSPACE_DIR } from '../config/env.js';
import { setupWorkspace } from '../core/workspace.js';
import {
  buildStreamName,
  runAgentSandbox,
  type RunSandboxOptions,
} from '../core/agent-runner.js';
import { getEventBackend, getLocalEvents } from '../core/event-store.js';
import { ensureFileWatcher } from '../core/file-sync.js';
import {
  clearActiveSandbox,
  enqueue,
  getActiveSandbox,
  getQueueLength,
  type ActiveSandbox,
  setActiveSandbox,
} from '../core/session-state.js';
import { getSandboxConfig } from '../platform/load-sandbox-config.js';
import type { WorkspacePaths } from '../core/workspace.js';
import type { SandboxConfig } from '../platform/schema.js';

type AgentRouterDeps = {
  setupWorkspace: () => Promise<WorkspacePaths>;
  ensureFileWatcher: (workspace: WorkspacePaths) => Promise<void>;
  runAgentSandbox: (options: RunSandboxOptions) => Promise<void>;
  buildStreamName: (sandboxId: string) => string;
  getEventBackend: typeof getEventBackend;
  getLocalEvents: typeof getLocalEvents;
  clearActiveSandbox: typeof clearActiveSandbox;
  enqueue: typeof enqueue;
  getActiveSandbox: () => ActiveSandbox | null;
  getQueueLength: typeof getQueueLength;
  setActiveSandbox: typeof setActiveSandbox;
  getSandboxConfig: () => SandboxConfig;
};

const defaultDeps: AgentRouterDeps = {
  setupWorkspace,
  ensureFileWatcher,
  runAgentSandbox,
  buildStreamName,
  getEventBackend,
  getLocalEvents,
  clearActiveSandbox,
  enqueue,
  getActiveSandbox,
  getQueueLength,
  setActiveSandbox,
  getSandboxConfig,
};

export function createAgentRouter(deps: AgentRouterDeps = defaultDeps) {
  const router = Router();

  router.get('/health', (_req: Request, res: Response) => {
    const config = deps.getSandboxConfig();
    res.json({
      status: 'healthy',
      workspace: WORKSPACE_DIR,
      configProfile: config.configProfile,
      eventBackend: deps.getEventBackend(),
      timestamp: new Date().toISOString(),
    });
  });

  router.post('/agent/query', async (req: Request, res: Response) => {
    const { prompt, sandboxId, sdkSessionId, systemPrompt, metadata } = req.body ?? {};
    const agentToken = typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined;

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'prompt is required and must be a string' });
    }

    if (!sandboxId || typeof sandboxId !== 'string') {
      return res.status(400).json({ error: 'sandboxId is required and must be a string' });
    }

    const isResuming = typeof sdkSessionId === 'string' && sdkSessionId.length > 0;
    const streamName = deps.buildStreamName(sandboxId);
    const abortController = new AbortController();

    // Queue if another sandbox run is active
    if (deps.getActiveSandbox()) {
      const position = deps.getQueueLength() + 1;
      res.status(202).json({
        sandboxId,
        status: 'queued',
        position,
      });

      await deps.enqueue(sandboxId);
      // When we get here, the previous sandbox run is done — fall through to run
    } else {
      res.status(202).json({
        sandboxId,
        status: isResuming ? 'resuming' : 'accepted',
      });
    }

    try {
      const workspace = await deps.setupWorkspace();
      await deps.ensureFileWatcher(workspace);

      deps.setActiveSandbox({
        sandboxId,
        abortController,
        streamName,
        workspace,
        agentToken,
      });

      await deps.runAgentSandbox({
        sandboxId,
        sdkSessionId: isResuming ? sdkSessionId : undefined,
        prompt,
        systemPrompt,
        metadata,
        abortController,
        streamName,
        isResuming,
        workspace,
      });
    } catch (error) {
      deps.clearActiveSandbox();
      console.error(`[${new Date().toISOString()}] Sandbox ${sandboxId} failed unexpectedly`, error);
    }
  });

  router.post('/agent/interrupt', (req: Request, res: Response) => {
    const { sandboxId } = req.body ?? {};

    if (!sandboxId || typeof sandboxId !== 'string') {
      return res.status(400).json({ error: 'sandboxId is required' });
    }

    const active = deps.getActiveSandbox();
    if (!active || active.sandboxId !== sandboxId) {
      return res.status(404).json({ error: 'Sandbox not found or already completed' });
    }

    active.abortController.abort();
    deps.clearActiveSandbox();

    return res.json({ success: true, sandboxId });
  });

  router.get('/agent/status', (_req: Request, res: Response) => {
    const active = deps.getActiveSandbox();
    const config = deps.getSandboxConfig();

    res.json({
      hasActiveSandbox: !!active,
      sandbox: active
        ? {
            sandboxId: active.sandboxId,
            streamName: active.streamName,
            workspace: active.workspace.root,
          }
        : null,
      queueLength: deps.getQueueLength(),
      configProfile: config.configProfile,
      eventBackend: deps.getEventBackend(),
      timestamp: new Date().toISOString(),
    });
  });

  router.get('/agent/events/:sandboxId', (req: Request, res: Response) => {
    const rawSandboxId = req.params.sandboxId;
    const sandboxId = Array.isArray(rawSandboxId) ? rawSandboxId[0] : rawSandboxId;
    if (!sandboxId) {
      return res.status(400).json({ error: 'sandboxId parameter is required' });
    }

    const rawLimit = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
    const requestedLimit = Number(rawLimit ?? 200);
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(1000, Math.trunc(requestedLimit)))
      : 200;

    const events = deps.getLocalEvents(sandboxId, limit);
    if (!events) {
      return res.status(404).json({ error: 'No events found for sandbox' });
    }

    return res.json(events);
  });

  return router;
}
