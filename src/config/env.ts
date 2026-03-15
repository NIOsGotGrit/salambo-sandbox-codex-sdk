import dotenv from 'dotenv';
import { initializeCodexHome } from './codex-home';
import { DEFAULT_WORKSPACE_DIR } from './paths';

dotenv.config();

export const PORT = process.env.PORT || '3000';
export const WORKSPACE_DIR = process.env.WORKSPACE_DIR || DEFAULT_WORKSPACE_DIR;
export const CODEX_HOME = initializeCodexHome();

export const SANDBOX_FILE_LOGGING = process.env.SANDBOX_FILE_LOGGING !== 'false';
export const SANDBOX_LOG_DIR = process.env.SANDBOX_LOG_DIR || '/tmp/sandbox-logs';
export const SANDBOX_LOG_FILE = process.env.SANDBOX_LOG_FILE || 'agent-api.log';

export const GATEWAY_BASE_URL = process.env.GATEWAY_BASE_URL;
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export const S2_ACCESS_TOKEN = process.env.S2_ACCESS_TOKEN;
export const S2_BASIN = process.env.S2_BASIN;
export const S2_STREAM_PREFIX = process.env.S2_STREAM_PREFIX || 'agent-session';
export const S2_ENABLED = Boolean(S2_ACCESS_TOKEN && S2_BASIN);
export const LOCAL_EVENT_MAX_EVENTS = Number(process.env.LOCAL_EVENT_MAX_EVENTS ?? 500);

export const FILE_WATCH_STABILITY_MS = Number(process.env.FILE_WATCH_STABILITY_MS ?? 2000);

export function logStartupWarnings() {
  if (!GATEWAY_BASE_URL) {
    console.warn('[config] GATEWAY_BASE_URL not set — file sync disabled');
  }

  if (!OPENAI_API_KEY) {
    console.warn('[config] OPENAI_API_KEY not set — agent may fail if provider requires it');
  }

  if (!S2_ENABLED) {
    console.warn('[config] S2 not configured — using local event store');
  }

  console.log(`[config] CODEX_HOME: ${CODEX_HOME}`);
}
