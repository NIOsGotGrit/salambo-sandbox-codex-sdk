import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';

import express from 'express';

import { createWorkspaceRouter } from '../../src/routes/workspace.js';

function makeWorkspace(root: string) {
  return {
    root,
    workDir: path.join(root, 'work'),
    outputsDir: path.join(root, 'outputs'),
    filesDir: path.join(root, 'work', 'files'),
    templatesDir: path.join(root, 'work', 'templates'),
  };
}

async function withServer(app: express.Express, run: (baseUrl: string) => Promise<void>) {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to get server address');
  }

  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test('POST /workspace/files/sync rejects missing authorization', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'workspace-router-'));
  const app = express();
  app.use(express.json());
  app.use(
    createWorkspaceRouter({
      setupWorkspace: async () => makeWorkspace(root),
      stopFileWatcher: async () => {},
      clearActiveSandbox: () => {},
      getActiveSandbox: () => null,
      downloadFileToPath: async () => {},
      resolveSafeWorkspaceTargetPath: (targetPath) => targetPath,
      mkdir: fs.mkdir,
      writeFile: fs.writeFile,
    }),
  );

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/workspace/files/sync`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ files: [] }),
    });

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'Unauthorized' });
  });
});

test('POST /workspace/files/sync writes a file into the workspace', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'workspace-router-'));
  const app = express();
  app.use(express.json());
  app.use(
    createWorkspaceRouter({
      setupWorkspace: async () => makeWorkspace(root),
      stopFileWatcher: async () => {},
      clearActiveSandbox: () => {},
      getActiveSandbox: () => null,
      downloadFileToPath: async () => {},
      resolveSafeWorkspaceTargetPath: (targetPath) => targetPath,
      mkdir: fs.mkdir,
      writeFile: fs.writeFile,
    }),
  );

  const payload = Buffer.from('hello world').toString('base64');

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/workspace/files/sync`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer test',
      },
      body: JSON.stringify({
        files: [{ targetPath: 'work/files/test.txt', contentBase64: payload }],
      }),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      success: true,
      saved: ['/workspace/work/files/test.txt'],
    });

    const file = await fs.readFile(path.join(root, 'work', 'files', 'test.txt'), 'utf8');
    assert.equal(file, 'hello world');
  });
});

test('DELETE /workspace/sandbox/:sandboxId aborts active sandbox and clears watcher', async () => {
  const abortController = new AbortController();
  let cleared = false;
  let stopped = false;
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'workspace-router-'));

  const app = express();
  app.use(express.json());
  app.use(
    createWorkspaceRouter({
      setupWorkspace: async () => makeWorkspace(root),
      stopFileWatcher: async () => {
        stopped = true;
      },
      clearActiveSandbox: () => {
        cleared = true;
      },
      getActiveSandbox: () => ({
        sandboxId: 'sbx-1',
        abortController,
        streamName: 'agent-session:sbx-1',
        workspace: makeWorkspace(root),
      }),
      downloadFileToPath: async () => {},
      resolveSafeWorkspaceTargetPath: (targetPath) => targetPath,
      mkdir: fs.mkdir,
      writeFile: fs.writeFile,
    }),
  );

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/workspace/sandbox/sbx-1`, {
      method: 'DELETE',
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true, sandboxId: 'sbx-1' });
    assert.equal(abortController.signal.aborted, true);
    assert.equal(cleared, true);
    assert.equal(stopped, true);
  });
});
