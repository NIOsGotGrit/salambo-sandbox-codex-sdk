import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = process.cwd();
const testsRoot = path.join(root, 'tests');

async function collectTestFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectTestFiles(fullPath)));
      continue;
    }

    if (entry.isFile() && /\.test\.(ts|tsx|js|mjs|cjs)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files.sort();
}

const testFiles = await collectTestFiles(testsRoot);

if (testFiles.length === 0) {
  console.error('No test files found under tests/');
  process.exit(1);
}

const child = spawn(process.execPath, ['--import', 'tsx', '--test', ...testFiles], {
  stdio: 'inherit',
  cwd: root,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
