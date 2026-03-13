import fs from 'fs';
import os from 'os';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

function resolveDefaultUserCodexHome() {
  return path.join(os.homedir(), '.codex');
}

function initializeCodexHome() {
  const projectCodexHome = path.resolve(process.cwd(), '.codex-home');
  const configuredCodexHome = process.env.CODEX_HOME?.trim() || projectCodexHome;
  const userCodexHome = resolveDefaultUserCodexHome();

  process.env.CODEX_HOME = configuredCodexHome;
  fs.mkdirSync(configuredCodexHome, { recursive: true });

  const localAuthPath = path.join(configuredCodexHome, 'auth.json');
  const userAuthPath = path.join(userCodexHome, 'auth.json');

  if (
    configuredCodexHome !== userCodexHome &&
    !fs.existsSync(localAuthPath) &&
    fs.existsSync(userAuthPath)
  ) {
    fs.copyFileSync(userAuthPath, localAuthPath);
    console.log(`[codex] Seeded local auth into ${configuredCodexHome}`);
  }

  return configuredCodexHome;
}

export const PORT = process.env.PORT || '3000';
export const WORKSPACE_DIR = process.env.WORKSPACE_DIR || '/workspace';
export const CODEX_HOME = initializeCodexHome();

export const SANDBOX_FILE_LOGGING = process.env.SANDBOX_FILE_LOGGING !== 'false';
export const SANDBOX_LOG_DIR = process.env.SANDBOX_LOG_DIR || '/tmp/sandbox-logs';
export const SANDBOX_LOG_FILE = process.env.SANDBOX_LOG_FILE || 'agent-api.log';

export const GATEWAY_BASE_URL = process.env.GATEWAY_BASE_URL;
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
export const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL;

export const CODEX_MODEL = process.env.CODEX_MODEL || 'gpt-5.2-codex';
export const CODEX_PROVIDER = process.env.CODEX_PROVIDER || 'openai';
export const SALAMBO_CODEX_PATH = process.env.SALAMBO_CODEX_PATH;

export const S2_ACCESS_TOKEN = process.env.S2_ACCESS_TOKEN;
export const S2_BASIN = process.env.S2_BASIN;
export const S2_STREAM_PREFIX = process.env.S2_STREAM_PREFIX || 'agent-session';
export const S2_ENABLED = Boolean(S2_ACCESS_TOKEN && S2_BASIN);
export const LOCAL_EVENT_MAX_EVENTS = Number(process.env.LOCAL_EVENT_MAX_EVENTS ?? 500);

export const FILE_WATCH_STABILITY_MS = Number(process.env.FILE_WATCH_STABILITY_MS ?? 2000);

export function logStartupWarnings() {
  if (!GATEWAY_BASE_URL) {
    console.warn('[workspace] GATEWAY_BASE_URL is not configured. File sync is disabled.');
  }

  if (!OPENAI_API_KEY && CODEX_PROVIDER === 'openai') {
    console.warn(
      'Warning: OPENAI_API_KEY is not set. Codex may still work if the runtime is already authenticated.',
    );
  }

  if (!S2_ENABLED) {
    console.warn(
      '[events] S2 is not configured. Falling back to the built-in local event store for testing.',
    );
  }

  console.log(`[codex] Using CODEX_HOME: ${CODEX_HOME}`);
}
