import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ImageConfig } from './image-schema';

export type MaterializedImageConfig = {
  aptPackagesText: string;
  npmToolsText: string;
  pythonRequirementsText: string;
  bootstrapScriptText: string;
};

export function materializeImageConfig(config: ImageConfig): MaterializedImageConfig {
  return {
    aptPackagesText: renderListFile(config.apt),
    npmToolsText: renderListFile(config.npm),
    pythonRequirementsText: renderListFile(config.pip),
    bootstrapScriptText: renderBootstrapScript(config.setup),
  };
}

export async function writeMaterializedImageConfig(
  outDir: string,
  config: MaterializedImageConfig,
): Promise<void> {
  await mkdir(outDir, { recursive: true });

  await Promise.all([
    writeFile(path.join(outDir, 'apt-packages.txt'), config.aptPackagesText, 'utf8'),
    writeFile(path.join(outDir, 'npm-tools.txt'), config.npmToolsText, 'utf8'),
    writeFile(path.join(outDir, 'requirements.txt'), config.pythonRequirementsText, 'utf8'),
    writeFile(path.join(outDir, 'bootstrap.sh'), config.bootstrapScriptText, 'utf8'),
  ]);
}

function renderListFile(entries: string[]): string {
  if (entries.length === 0) {
    return '';
  }

  return `${entries.join('\n')}\n`;
}

function renderBootstrapScript(setup: string): string {
  const header = '#!/bin/sh\nset -eu\n';
  const body = setup.trim();

  if (!body) {
    return header;
  }

  return `${header}\n${body}\n`;
}
