import type { WorkspacePaths } from './workspace';

export type ActiveTask = {
  taskId: string;
  abortController: AbortController;
  streamName: string;
  workspace: WorkspacePaths;
  agentToken?: string;
};

let activeTask: ActiveTask | null = null;
const queue: Array<{
  taskId: string;
  resolve: () => void;
}> = [];

export function getActiveTask() {
  return activeTask;
}

export function setActiveTask(task: ActiveTask | null) {
  activeTask = task;
}

export function clearActiveTask() {
  activeTask = null;
  drainQueue();
}

export function enqueue(taskId: string): Promise<void> {
  return new Promise((resolve) => {
    queue.push({ taskId, resolve });
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
