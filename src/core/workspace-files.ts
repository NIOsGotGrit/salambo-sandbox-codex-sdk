import { promises as fs } from 'fs';

export async function downloadFileToPath(sourceUrl: string, absolutePath: string, maxBytes: number) {
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`Failed to download source file (${response.status})`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > maxBytes) {
    throw new Error('File exceeds max size 100MB');
  }

  await fs.writeFile(absolutePath, bytes);
}

export function resolveSafeWorkspaceTargetPath(inputPath: string): string {
  const normalized = inputPath.replace(/\\/g, '/').trim();
  const withoutLeading = normalized.replace(/^\/+/, '');

  if (!withoutLeading.startsWith('work/files/')) {
    throw new Error('targetPath must be inside work/files/');
  }

  const segments = withoutLeading.split('/').filter(Boolean);
  const safeSegments: string[] = [];

  for (const segment of segments) {
    if (segment === '.' || segment === '') {
      continue;
    }
    if (segment === '..') {
      throw new Error('Invalid targetPath segment');
    }
    safeSegments.push(segment);
  }

  return safeSegments.join('/');
}
