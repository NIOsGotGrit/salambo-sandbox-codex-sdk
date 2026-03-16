import type { WorkspacePaths } from './workspace';

export type ActiveSandbox = {
  sandboxId: string;
  abortController: AbortController;
  streamName: string;
  workspace: WorkspacePaths;
  agentToken?: string;
};

let activeSandbox: ActiveSandbox | null = null;
const queue: Array<{
  sandboxId: string;
  resolve: () => void;
}> = [];

export function getActiveSandbox() {
  return activeSandbox;
}

export function setActiveSandbox(sandbox: ActiveSandbox | null) {
  activeSandbox = sandbox;
}

export function clearActiveSandbox() {
  activeSandbox = null;
  drainQueue();
}

export function enqueue(sandboxId: string): Promise<void> {
  return new Promise((resolve) => {
    queue.push({ sandboxId, resolve });
  });
}

export function getQueueLength() {
  return queue.length;
}

function drainQueue() {
  const next = queue.shift();
  if (next) {
    next.resolve();
  }
}
