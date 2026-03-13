import { Router, type Request, type Response } from 'express';
import path from 'path';
import { promises as fs } from 'fs';
import { setupWorkspace } from '../workspace';
import { stopFileWatcher } from '../services/file-sync';
import {
  clearActiveSession,
  getActiveSession,
} from '../services/session-state';
import {
  downloadFileToPath,
  resolveSafeWorkspaceTargetPath,
} from '../services/workspace-files';

export function createWorkspaceRouter() {
  const router = Router();

  router.delete('/workspace/session/:sessionId', async (req: Request, res: Response) => {
    const rawSessionId = req.params.sessionId;
    const sessionId = Array.isArray(rawSessionId) ? rawSessionId[0] : rawSessionId;
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId parameter is required' });
    }

    const activeSession = getActiveSession();
    if (activeSession && activeSession.sessionId === sessionId) {
      activeSession.abortController.abort();
      clearActiveSession();
    }

    try {
      await stopFileWatcher();
      return res.json({ success: true, sessionId });
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Cleanup failed`, error);
      return res.status(500).json({ error: 'Failed to cleanup session' });
    }
  });

  router.post('/workspace/files/sync', async (req: Request, res: Response) => {
    const authHeader = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
    if (!authHeader) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const files = Array.isArray((req.body as { files?: unknown[] } | undefined)?.files)
      ? ((req.body as { files: Array<{ targetPath?: unknown; contentBase64?: unknown }> }).files)
      : [];

    if (!files.length) {
      return res.status(400).json({ error: 'files are required' });
    }

    if (files.length > 20) {
      return res.status(400).json({ error: 'Too many files in one request' });
    }

    try {
      const workspace = await setupWorkspace();
      const saved: string[] = [];

      for (const file of files) {
        if (typeof file.targetPath !== 'string' || typeof file.contentBase64 !== 'string') {
          return res.status(400).json({ error: 'Invalid file payload' });
        }

        const safeRelativePath = resolveSafeWorkspaceTargetPath(file.targetPath);
        const absolutePath = path.join(workspace.root, safeRelativePath);
        const bytes = Buffer.from(file.contentBase64, 'base64');

        if (bytes.length > 1024 * 1024 * 100) {
          return res.status(413).json({ error: 'File exceeds max size 100MB' });
        }

        await fs.mkdir(path.dirname(absolutePath), { recursive: true });
        await fs.writeFile(absolutePath, bytes);
        saved.push(`/workspace/${safeRelativePath}`);
      }

      return res.json({ success: true, saved });
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Input file sync failed`, error);
      return res.status(500).json({ error: 'Failed to sync files' });
    }
  });

  router.post('/workspace/files/import', async (req: Request, res: Response) => {
    const authHeader = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
    if (!authHeader) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const files = Array.isArray((req.body as { files?: unknown[] } | undefined)?.files)
      ? ((req.body as { files: Array<{ targetPath?: unknown; sourceUrl?: unknown }> }).files)
      : [];

    if (!files.length) {
      return res.status(400).json({ error: 'files are required' });
    }

    if (files.length > 20) {
      return res.status(400).json({ error: 'Too many files in one request' });
    }

    try {
      const workspace = await setupWorkspace();
      const saved: string[] = [];

      for (const file of files) {
        if (typeof file.targetPath !== 'string' || typeof file.sourceUrl !== 'string') {
          return res.status(400).json({ error: 'Invalid file payload' });
        }

        if (!file.sourceUrl.startsWith('https://')) {
          return res.status(400).json({ error: 'sourceUrl must be https' });
        }

        const safeRelativePath = resolveSafeWorkspaceTargetPath(file.targetPath);
        const absolutePath = path.join(workspace.root, safeRelativePath);
        await fs.mkdir(path.dirname(absolutePath), { recursive: true });

        await downloadFileToPath(file.sourceUrl, absolutePath, 1024 * 1024 * 100);
        saved.push(`/workspace/${safeRelativePath}`);
      }

      return res.json({ success: true, saved });
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Input file import failed`, error);
      return res.status(500).json({ error: 'Failed to import files' });
    }
  });

  return router;
}
