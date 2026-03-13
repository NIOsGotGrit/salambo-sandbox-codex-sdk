import { promises as fs } from 'fs';
import path from 'path';

const BASE_WORKSPACE_DIR = process.env.WORKSPACE_DIR || '/workspace';
const LOG_PREFIX = '[workspace-manager]';

export type WorkspacePaths = {
  root: string;
  workDir: string;
  outputsDir: string;
  filesDir: string;
};

function log(message: string, extra?: Record<string, unknown>) {
  const payload = extra ? ` ${JSON.stringify(extra)}` : '';
  console.log(`${LOG_PREFIX} ${new Date().toISOString()} ${message}${payload}`);
}

export async function setupWorkspace(): Promise<WorkspacePaths> {
  const workDir = path.join(BASE_WORKSPACE_DIR, 'work');
  const outputsDir = path.join(BASE_WORKSPACE_DIR, 'outputs');
  const filesDir = path.join(BASE_WORKSPACE_DIR, 'work', 'files');

  await fs.mkdir(workDir, { recursive: true });
  await fs.mkdir(outputsDir, { recursive: true });
  await fs.mkdir(filesDir, { recursive: true });

  log('Workspace ready', { root: BASE_WORKSPACE_DIR, workDir, outputsDir, filesDir });

  return {
    root: BASE_WORKSPACE_DIR,
    workDir,
    outputsDir,
    filesDir,
  };
}

export function getWorkspacePaths(): WorkspacePaths {
  return {
    root: BASE_WORKSPACE_DIR,
    workDir: path.join(BASE_WORKSPACE_DIR, 'work'),
    outputsDir: path.join(BASE_WORKSPACE_DIR, 'outputs'),
    filesDir: path.join(BASE_WORKSPACE_DIR, 'work', 'files'),
  };
}

