import { Router, type Request, type Response } from 'express';
import { WORKSPACE_DIR } from '../config/env';
import { setupWorkspace } from '../core/workspace';
import { buildStreamName, runAgentTask } from '../core/agent-runner';
import { getEventBackend, getLocalEvents } from '../core/event-store';
import { ensureFileWatcher } from '../core/file-sync';
import {
  clearActiveTask,
  enqueue,
  getActiveTask,
  getQueueLength,
  setActiveTask,
} from '../core/session-state';
import { getSandboxConfig } from '../platform/load-sandbox-config';

export function createAgentRouter() {
  const router = Router();

  router.get('/health', (_req: Request, res: Response) => {
    const config = getSandboxConfig();
    res.json({
      status: 'healthy',
      workspace: WORKSPACE_DIR,
      model: config.model,
      provider: config.provider,
      eventBackend: getEventBackend(),
      timestamp: new Date().toISOString(),
    });
  });

  router.post('/agent/query', async (req: Request, res: Response) => {
    const { prompt, taskId, sdkSessionId, systemPrompt, metadata } = req.body ?? {};
    const agentToken = typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined;

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'prompt is required and must be a string' });
    }

    if (!taskId || typeof taskId !== 'string') {
      return res.status(400).json({ error: 'taskId is required and must be a string' });
    }

    const isResuming = typeof sdkSessionId === 'string' && sdkSessionId.length > 0;
    const streamName = buildStreamName(taskId);
    const abortController = new AbortController();

    // Queue if another task is running
    if (getActiveTask()) {
      const position = getQueueLength() + 1;
      res.status(202).json({
        taskId,
        status: 'queued',
        position,
      });

      await enqueue(taskId);
      // When we get here, previous task is done — fall through to run
    } else {
      res.status(202).json({
        taskId,
        status: isResuming ? 'resuming' : 'accepted',
      });
    }

    try {
      const workspace = await setupWorkspace();
      await ensureFileWatcher(workspace);

      setActiveTask({
        taskId,
        abortController,
        streamName,
        workspace,
        agentToken,
      });

      await runAgentTask({
        taskId,
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
      clearActiveTask();
      console.error(`[${new Date().toISOString()}] Task ${taskId} failed unexpectedly`, error);
    }
  });

  router.post('/agent/interrupt', (req: Request, res: Response) => {
    const { taskId } = req.body ?? {};

    if (!taskId || typeof taskId !== 'string') {
      return res.status(400).json({ error: 'taskId is required' });
    }

    const active = getActiveTask();
    if (!active || active.taskId !== taskId) {
      return res.status(404).json({ error: 'Task not found or already completed' });
    }

    active.abortController.abort();
    clearActiveTask();

    return res.json({ success: true, taskId });
  });

  router.get('/agent/status', (_req: Request, res: Response) => {
    const active = getActiveTask();
    const config = getSandboxConfig();

    res.json({
      hasActiveTask: !!active,
      task: active
        ? {
            taskId: active.taskId,
            streamName: active.streamName,
            workspace: active.workspace.root,
          }
        : null,
      queueLength: getQueueLength(),
      model: config.model,
      provider: config.provider,
      eventBackend: getEventBackend(),
      timestamp: new Date().toISOString(),
    });
  });

  router.get('/agent/events/:taskId', (req: Request, res: Response) => {
    const rawTaskId = req.params.taskId;
    const taskId = Array.isArray(rawTaskId) ? rawTaskId[0] : rawTaskId;
    if (!taskId) {
      return res.status(400).json({ error: 'taskId parameter is required' });
    }

    const rawLimit = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
    const requestedLimit = Number(rawLimit ?? 200);
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(1000, Math.trunc(requestedLimit)))
      : 200;

    const events = getLocalEvents(taskId, limit);
    if (!events) {
      return res.status(404).json({ error: 'No events found for task' });
    }

    return res.json(events);
  });

  return router;
}
