import path from 'path';
import { promises as fs } from 'fs';
import {
  SANDBOX_FILE_LOGGING,
  SANDBOX_LOG_DIR,
  SANDBOX_LOG_FILE,
} from '../config/env';

const SANDBOX_LOG_PATH = path.join(SANDBOX_LOG_DIR, SANDBOX_LOG_FILE);

const originalConsole = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

let fileLogInitTried = false;
let fileLogEnabled = SANDBOX_FILE_LOGGING;

function stringifyLogArg(arg: unknown): string {
  if (typeof arg === 'string') {
    return arg;
  }

  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

async function appendLogToFile(level: 'INFO' | 'WARN' | 'ERROR', args: unknown[]) {
  if (!fileLogEnabled) {
    return;
  }

  try {
    if (!fileLogInitTried) {
      await fs.mkdir(SANDBOX_LOG_DIR, { recursive: true });
      fileLogInitTried = true;
    }

    const line = `[${new Date().toISOString()}] [${level}] ${args.map(stringifyLogArg).join(' ')}\n`;
    await fs.appendFile(SANDBOX_LOG_PATH, line, 'utf8');
  } catch (error) {
    fileLogEnabled = false;
    originalConsole.error('[file-logger] Failed to write log file, disabling file logger', error);
  }
}

export function installFileLogger() {
  if (!SANDBOX_FILE_LOGGING) {
    return;
  }

  console.log = ((...args: unknown[]) => {
    originalConsole.log(...args);
    void appendLogToFile('INFO', args);
  }) as typeof console.log;

  console.warn = ((...args: unknown[]) => {
    originalConsole.warn(...args);
    void appendLogToFile('WARN', args);
  }) as typeof console.warn;

  console.error = ((...args: unknown[]) => {
    originalConsole.error(...args);
    void appendLogToFile('ERROR', args);
  }) as typeof console.error;

  originalConsole.log(`[file-logger] Writing sandbox logs to ${SANDBOX_LOG_PATH}`);
  void appendLogToFile('INFO', [`[file-logger] Writing sandbox logs to ${SANDBOX_LOG_PATH}`]);
}
