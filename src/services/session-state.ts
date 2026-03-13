import type { WorkspacePaths } from '../workspace';

export type ActiveSession = {
  sessionId: string;
  abortController: AbortController;
  streamName: string;
  workspace: WorkspacePaths;
  agentToken?: string;
};

let activeSession: ActiveSession | null = null;

export function getActiveSession() {
  return activeSession;
}

export function setActiveSession(session: ActiveSession | null) {
  activeSession = session;
}

export function clearActiveSession() {
  activeSession = null;
}
