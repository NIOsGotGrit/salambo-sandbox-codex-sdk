import { Router, type Request, type Response } from 'express';
import {
  CODEX_MODEL,
  CODEX_PROVIDER,
  WORKSPACE_DIR,
} from '../config/env';
import { setupWorkspace } from '../core/workspace';
import { buildStreamName, runAgentSession } from '../core/agent-runner';
import { getEventBackend, getLocalEvents } from '../core/event-store';
import { ensureFileWatcher } from '../core/file-sync';
import {
  clearActiveSession,
  getActiveSession,
  setActiveSession,
} from '../core/session-state';

export function createAgentRouter() {
  const router = Router();

  router.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      workspace: WORKSPACE_DIR,
      model: CODEX_MODEL,
      provider: CODEX_PROVIDER,
      eventBackend: getEventBackend(),
      timestamp: new Date().toISOString(),
    });
  });

  router.post('/agent/query', async (req: Request, res: Response) => {
    const requestStartTime = Date.now();
    const { prompt, sessionId, context, ourSessionId } = req.body ?? {};
    const agentTokenHeader = typeof req.headers.authorization === 'string' ? req.headers.authorization : null;

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Prompt is required and must be a string' });
    }

    if (!ourSessionId || typeof ourSessionId !== 'string') {
      return res.status(400).json({ error: 'ourSessionId is required for stream identification' });
    }

    const isResuming = typeof sessionId === 'string' && sessionId.length > 0;
    const streamSessionId = ourSessionId || `session-${Date.now()}`;
    const abortController = new AbortController();
    const streamName = buildStreamName(streamSessionId);

    if (getActiveSession()) {
      return res.status(409).json({ error: 'A session is already running in this sandbox' });
    }

    try {
      const workspace = await setupWorkspace();
      await ensureFileWatcher(workspace);

      setActiveSession({
        sessionId: streamSessionId,
        abortController,
        streamName,
        workspace,
        agentToken: agentTokenHeader || undefined,
      });

      void runAgentSession({
        sessionId: streamSessionId,
        sdkSessionId: isResuming ? sessionId : undefined,
        prompt,
        context,
        abortController,
        streamName,
        captureSdkSessionId: !isResuming,
        ourSessionId: streamSessionId,
        isResuming,
        workspace,
      }).catch((error) => {
        console.error(
          `[${new Date().toISOString()}] Unexpected session failure for ${streamSessionId}`,
          error,
        );
      });

      const responseTime = Date.now() - requestStartTime;
      console.log(
        `[${new Date().toISOString()}] Query accepted for ${streamSessionId} (${responseTime}ms)`,
      );

      return res.status(202).json({
        sessionId: streamSessionId,
        status: isResuming ? 'ready' : 'pending',
      });
    } catch (error) {
      clearActiveSession();
      console.error(`[${new Date().toISOString()}] Workspace preparation failed`, error);
      return res.status(500).json({ error: 'Failed to prepare workspace' });
    }
  });

  router.post('/agent/interrupt', (req: Request, res: Response) => {
    const { sessionId } = req.body ?? {};

    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    const activeSession = getActiveSession();
    if (!activeSession || activeSession.sessionId !== sessionId) {
      return res.status(404).json({ error: 'Session not found or already completed' });
    }

    activeSession.abortController.abort();
    clearActiveSession();

    return res.json({
      success: true,
      message: 'Session interrupted',
      sessionId,
    });
  });

  router.get('/agent/status', (_req: Request, res: Response) => {
    const activeSession = getActiveSession();

    res.json({
      hasActiveSession: !!activeSession,
      session: activeSession
        ? {
            sessionId: activeSession.sessionId,
            streamName: activeSession.streamName,
            workspaceRoot: activeSession.workspace.root,
          }
        : null,
      workspace: WORKSPACE_DIR,
      model: CODEX_MODEL,
      provider: CODEX_PROVIDER,
      eventBackend: getEventBackend(),
      timestamp: new Date().toISOString(),
    });
  });

  router.get('/agent/events/:sessionId', (req: Request, res: Response) => {
    const rawSessionId = req.params.sessionId;
    const sessionId = Array.isArray(rawSessionId) ? rawSessionId[0] : rawSessionId;
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId parameter is required' });
    }

    const rawLimit = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
    const requestedLimit = Number(rawLimit ?? 200);
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(1000, Math.trunc(requestedLimit)))
      : 200;

    const localEvents = getLocalEvents(sessionId, limit);
    if (!localEvents) {
      return res.status(404).json({ error: 'No local events found for session' });
    }

    return res.json(localEvents);
  });

  return router;
}
