import fs from 'fs';
import os from 'os';
import path from 'path';
import { DEFAULT_CODEX_HOME } from './paths';

function resolveDefaultUserCodexHome() {
  return path.join(os.homedir(), '.codex');
}

export function initializeCodexHome() {
  const configuredCodexHome = process.env.CODEX_HOME?.trim() || DEFAULT_CODEX_HOME;
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
