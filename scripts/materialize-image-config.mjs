import path from 'node:path';
import { getImageConfig } from '../src/platform/load-image-config.ts';
import {
  materializeImageConfig,
  writeMaterializedImageConfig,
} from '../src/platform/materialize-image-config.ts';

const outDir = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.resolve(process.cwd(), '.artifacts', 'materialized-image-config');

const imageConfig = getImageConfig();
const materialized = materializeImageConfig(imageConfig);

await writeMaterializedImageConfig(outDir, materialized);

console.log(`[harness-config] Materialized image config to ${outDir}`);
