import { promises as fs } from 'fs';
import path from 'path';
import { WORKSPACE_DIR } from '../config/env';
import { getSandboxConfig } from '../platform/load-sandbox-config';

const LOG_PREFIX = '[workspace-manager]';

export type WorkspacePaths = {
  root: string;
  workDir: string;
  outputsDir: string;
  filesDir: string;
  templatesDir: string;
};

function log(message: string, extra?: Record<string, unknown>) {
  const payload = extra ? ` ${JSON.stringify(extra)}` : '';
  console.log(`${LOG_PREFIX} ${new Date().toISOString()} ${message}${payload}`);
}

export function getWorkspacePaths(): WorkspacePaths {
  return {
    root: WORKSPACE_DIR,
    workDir: path.join(WORKSPACE_DIR, 'work'),
    outputsDir: path.join(WORKSPACE_DIR, 'outputs'),
    filesDir: path.join(WORKSPACE_DIR, 'work', 'files'),
    templatesDir: path.join(WORKSPACE_DIR, 'work', 'templates'),
  };
}

export async function setupWorkspace(): Promise<WorkspacePaths> {
  const workspace = getWorkspacePaths();
  const sandboxConfig = getSandboxConfig();

  for (const directory of sandboxConfig.workspace.directories) {
    await fs.mkdir(path.join(WORKSPACE_DIR, directory), { recursive: true });
  }

  log('Workspace ready', workspace);

  return workspace;
}
