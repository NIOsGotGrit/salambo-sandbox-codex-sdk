import type { WorkspacePaths } from './workspace.js';
import { FILE_WATCH_STABILITY_MS } from '../config/env.js';

export type ActiveSandbox = {
  sandboxId: string;
  abortController: AbortController;
  streamName: string;
  workspace: WorkspacePaths;
  agentToken?: string;
};

type UploadContext = {
  sandboxId: string;
  agentToken: string;
  pendingOperations: number;
  runFinished: boolean;
  clearTimer: ReturnType<typeof setTimeout> | null;
};

let activeSandbox: ActiveSandbox | null = null;
let uploadContext: UploadContext | null = null;
const queue: Array<{
  sandboxId: string;
  resolve: () => void;
}> = [];
const FILE_SYNC_GRACE_MS = Math.max(FILE_WATCH_STABILITY_MS + 1000, 5000);

export function getActiveSandbox() {
  return activeSandbox;
}

export function setActiveSandbox(sandbox: ActiveSandbox | null) {
  activeSandbox = sandbox;

  if (sandbox?.agentToken) {
    clearUploadTimer(uploadContext);
    uploadContext = {
      sandboxId: sandbox.sandboxId,
      agentToken: sandbox.agentToken,
      pendingOperations: 0,
      runFinished: false,
      clearTimer: null,
    };
  }
}

export function clearActiveSandbox() {
  if (activeSandbox) {
    finishSandboxLifecycle(activeSandbox.sandboxId);
    return;
  }

  if (!uploadContext) {
    drainQueue();
  }
}

export function enqueue(sandboxId: string): Promise<void> {
  return new Promise((resolve) => {
    queue.push({ sandboxId, resolve });
  });
}

export function getQueueLength() {
  return queue.length;
}

export function hasActiveWork() {
  return Boolean(activeSandbox || uploadContext);
}

export function acquireUploadContext() {
  if (!uploadContext) {
    return null;
  }

  clearUploadTimer(uploadContext);
  uploadContext.pendingOperations += 1;

  return {
    sandboxId: uploadContext.sandboxId,
    agentToken: uploadContext.agentToken,
  };
}

export function releaseUploadContext(sandboxId: string) {
  if (!uploadContext || uploadContext.sandboxId !== sandboxId) {
    return;
  }

  uploadContext.pendingOperations = Math.max(0, uploadContext.pendingOperations - 1);
  maybeScheduleUploadCleanup(uploadContext);
}

export function finishSandboxLifecycle(sandboxId: string) {
  if (activeSandbox?.sandboxId === sandboxId) {
    activeSandbox = null;
  }

  if (!uploadContext || uploadContext.sandboxId !== sandboxId) {
    drainQueue();
    return;
  }

  uploadContext.runFinished = true;
  maybeScheduleUploadCleanup(uploadContext);
}

function drainQueue() {
  const next = queue.shift();
  if (next) {
    next.resolve();
  }
}

function maybeScheduleUploadCleanup(context: UploadContext) {
  if (!context.runFinished || context.pendingOperations > 0) {
    return;
  }

  clearUploadTimer(context);
  context.clearTimer = setTimeout(() => {
    if (uploadContext?.sandboxId !== context.sandboxId) {
      return;
    }

    uploadContext = null;
    drainQueue();
  }, FILE_SYNC_GRACE_MS);
}

function clearUploadTimer(context: UploadContext | null) {
  if (!context?.clearTimer) {
    return;
  }

  clearTimeout(context.clearTimer);
  context.clearTimer = null;
}
