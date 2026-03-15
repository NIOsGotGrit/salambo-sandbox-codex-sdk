import chokidar, { type FSWatcher } from 'chokidar';
import path from 'path';
import { promises as fs } from 'fs';
import { FILE_WATCH_STABILITY_MS, GATEWAY_BASE_URL } from '../config/env';
import type { WorkspacePaths } from './workspace';
import { getActiveTask } from './session-state';

let fileWatcher: FSWatcher | null = null;

export async function ensureFileWatcher(workspace: WorkspacePaths) {
  if (!GATEWAY_BASE_URL || fileWatcher) {
    return;
  }

  await fs.mkdir(workspace.outputsDir, { recursive: true });

  const watcher = chokidar.watch(workspace.outputsDir, {
    ignoreInitial: true,
    depth: 10,
    awaitWriteFinish: {
      stabilityThreshold: FILE_WATCH_STABILITY_MS,
      pollInterval: 100,
    },
  });

  watcher.on('add', (targetPath) => {
    void handleFileUpload(workspace.outputsDir, targetPath, 'add');
  });

  watcher.on('change', (targetPath) => {
    void handleFileUpload(workspace.outputsDir, targetPath, 'change');
  });

  watcher.on('unlink', (targetPath) => {
    void handleFileDelete(workspace.outputsDir, targetPath);
  });

  watcher.on('error', (error) => {
    console.error(`[${new Date().toISOString()}] File watcher error`, { error });
  });

  fileWatcher = watcher;
  console.log(`[${new Date().toISOString()}] File watcher started`);
}

export async function stopFileWatcher() {
  if (!fileWatcher) {
    return;
  }

  try {
    await fileWatcher.close();
  } catch (error) {
    console.warn(`[${new Date().toISOString()}] Failed to close file watcher`, error);
  }

  fileWatcher = null;
}

function buildDisplayPath(outputsDir: string, targetPath: string): string | null {
  const relative = path.relative(outputsDir, targetPath);
  if (!relative || relative.startsWith('..')) {
    return null;
  }

  const normalized = relative.split(path.sep).join('/');
  return normalized ? `/${normalized}` : null;
}

async function handleFileUpload(
  outputsDir: string,
  targetPath: string,
  event: 'add' | 'change',
) {
  const displayPath = buildDisplayPath(outputsDir, targetPath);
  const agentToken = getActiveTask()?.agentToken;
  if (!displayPath || !agentToken) {
    return;
  }

  try {
    const buffer = await fs.readFile(targetPath);
    await sendFileUpload({
      displayPath,
      buffer,
      event,
      agentToken,
    });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Failed to sync file`, {
      path: displayPath,
      error,
    });
  }
}

async function handleFileDelete(outputsDir: string, targetPath: string) {
  const displayPath = buildDisplayPath(outputsDir, targetPath);
  const agentToken = getActiveTask()?.agentToken;
  if (!displayPath || !agentToken) {
    return;
  }

  try {
    await sendFileDelete({
      displayPath,
      agentToken,
    });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Failed to notify delete`, {
      path: displayPath,
      error,
    });
  }
}

async function sendFileUpload(params: {
  displayPath: string;
  buffer: Buffer;
  event: 'add' | 'change';
  agentToken: string;
}) {
  if (!GATEWAY_BASE_URL) {
    return;
  }

  const formData = new FormData();
  formData.append('displayPath', params.displayPath);
  formData.append('event', params.event);
  formData.append(
    'file',
    new Blob([bufferToArrayBuffer(params.buffer)]),
    params.displayPath.split('/').pop() || 'file',
  );

  const response = await fetch(`${GATEWAY_BASE_URL}/api/daytona/files`, {
    method: 'POST',
    headers: {
      Authorization: params.agentToken,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'unknown error');
    console.warn(`[${new Date().toISOString()}] File upload sync failed`, {
      path: params.displayPath,
      status: response.status,
      errorText,
    });
  }
}

async function sendFileDelete(params: { displayPath: string; agentToken: string }) {
  if (!GATEWAY_BASE_URL) {
    return;
  }

  const response = await fetch(`${GATEWAY_BASE_URL}/api/daytona/files`, {
    method: 'DELETE',
    headers: {
      Authorization: params.agentToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ displayPath: params.displayPath }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'unknown error');
    console.warn(`[${new Date().toISOString()}] File delete sync failed`, {
      path: params.displayPath,
      status: response.status,
      errorText,
    });
  }
}

function bufferToArrayBuffer(buffer: Buffer) {
  const view = Uint8Array.from(buffer);
  return view.buffer;
}
