import { Router, type Request, type Response } from 'express';
import path from 'path';
import { promises as fs } from 'fs';
import { setupWorkspace } from '../core/workspace.js';
import { stopFileWatcher } from '../core/file-sync.js';
import {
  clearActiveSandbox,
  getActiveSandbox,
  type ActiveSandbox,
} from '../core/session-state.js';
import {
  downloadFileToPath,
  resolveSafeWorkspaceTargetPath,
} from '../core/workspace-files.js';
import type { WorkspacePaths } from '../core/workspace.js';

type WorkspaceRouterDeps = {
  setupWorkspace: () => Promise<WorkspacePaths>;
  stopFileWatcher: typeof stopFileWatcher;
  clearActiveSandbox: typeof clearActiveSandbox;
  getActiveSandbox: () => ActiveSandbox | null;
  downloadFileToPath: typeof downloadFileToPath;
  resolveSafeWorkspaceTargetPath: typeof resolveSafeWorkspaceTargetPath;
  mkdir: typeof fs.mkdir;
  writeFile: typeof fs.writeFile;
};

const defaultDeps: WorkspaceRouterDeps = {
  setupWorkspace,
  stopFileWatcher,
  clearActiveSandbox,
  getActiveSandbox,
  downloadFileToPath,
  resolveSafeWorkspaceTargetPath,
  mkdir: fs.mkdir,
  writeFile: fs.writeFile,
};

export function createWorkspaceRouter(deps: WorkspaceRouterDeps = defaultDeps) {
  const router = Router();

  router.delete('/workspace/sandbox/:sandboxId', async (req: Request, res: Response) => {
    const rawSandboxId = req.params.sandboxId;
    const sandboxId = Array.isArray(rawSandboxId) ? rawSandboxId[0] : rawSandboxId;
    if (!sandboxId) {
      return res.status(400).json({ error: 'sandboxId parameter is required' });
    }

    const active = deps.getActiveSandbox();
    if (active && active.sandboxId === sandboxId) {
      active.abortController.abort();
      deps.clearActiveSandbox();
    }

    try {
      await deps.stopFileWatcher();
      return res.json({ success: true, sandboxId });
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Cleanup failed`, error);
      return res.status(500).json({ error: 'Failed to cleanup sandbox' });
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
      return res.status(400).json({ error: 'files[] is required' });
    }
    if (files.length > 20) {
      return res.status(400).json({ error: 'Max 20 files per request' });
    }

    try {
      const workspace = await deps.setupWorkspace();
      const saved: string[] = [];

      for (const file of files) {
        if (typeof file.targetPath !== 'string' || typeof file.contentBase64 !== 'string') {
          return res.status(400).json({ error: 'Each file needs targetPath and contentBase64' });
        }

        const safePath = deps.resolveSafeWorkspaceTargetPath(file.targetPath);
        const absolutePath = path.join(workspace.root, safePath);
        const bytes = Buffer.from(file.contentBase64, 'base64');

        if (bytes.length > 1024 * 1024 * 100) {
          return res.status(413).json({ error: 'File exceeds 100MB limit' });
        }

        await deps.mkdir(path.dirname(absolutePath), { recursive: true });
        await deps.writeFile(absolutePath, bytes);
        saved.push(`/workspace/${safePath}`);
      }

      return res.json({ success: true, saved });
    } catch (error) {
      console.error(`[${new Date().toISOString()}] File sync failed`, error);
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
      return res.status(400).json({ error: 'files[] is required' });
    }
    if (files.length > 20) {
      return res.status(400).json({ error: 'Max 20 files per request' });
    }

    try {
      const workspace = await deps.setupWorkspace();
      const saved: string[] = [];

      for (const file of files) {
        if (typeof file.targetPath !== 'string' || typeof file.sourceUrl !== 'string') {
          return res.status(400).json({ error: 'Each file needs targetPath and sourceUrl' });
        }
        if (!file.sourceUrl.startsWith('https://')) {
          return res.status(400).json({ error: 'sourceUrl must use https' });
        }

        const safePath = deps.resolveSafeWorkspaceTargetPath(file.targetPath);
        const absolutePath = path.join(workspace.root, safePath);
        await deps.mkdir(path.dirname(absolutePath), { recursive: true });
        await deps.downloadFileToPath(file.sourceUrl, absolutePath, 1024 * 1024 * 100);
        saved.push(`/workspace/${safePath}`);
      }

      return res.json({ success: true, saved });
    } catch (error) {
      console.error(`[${new Date().toISOString()}] File import failed`, error);
      return res.status(500).json({ error: 'Failed to import files' });
    }
  });

  return router;
}
