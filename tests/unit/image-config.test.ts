import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile } from 'node:fs/promises';

import { getImageConfig, assertValidImageConfig } from '../../src/platform/load-image-config.js';
import {
  materializeImageConfig,
  writeMaterializedImageConfig,
} from '../../src/platform/materialize-image-config.js';

test('getImageConfig loads the typed harness machine config', () => {
  const config = getImageConfig();

  assert.deepEqual(config.apt.slice(0, 3), ['git', 'python3', 'python3-venv']);
  assert.ok(config.apt.includes('ca-certificates'));
  assert.equal(config.setup, '');
  assert.ok(config.npm.includes('@openai/codex'));
  assert.ok(
    config.npm.includes('@openai/codex-linux-x64@npm:@openai/codex@0.115.0-linux-x64'),
  );
  assert.ok(config.pip.includes('pandas==2.2.3'));
});

test('assertValidImageConfig rejects invalid config shapes', () => {
  assert.throws(
    () =>
      assertValidImageConfig({
        apt: ['git', 123] as unknown as string[],
        npm: [],
        pip: [],
        setup: '',
      }),
    /apt\[1\] must be a string/,
  );

  assert.throws(
    () =>
      assertValidImageConfig({
        apt: [],
        npm: [],
        pip: [],
        setup: 123 as unknown as string,
      }),
    /setup must be a string/,
  );
});

test('materializeImageConfig renders deterministic build artifacts from docker.ts', () => {
  const config = getImageConfig();
  const materialized = materializeImageConfig(config);

  assert.match(materialized.aptPackagesText, /^git\r?\npython3\r?\npython3-venv/m);
  assert.equal(
    materialized.npmToolsText,
    '@openai/codex\n@openai/codex-linux-x64@npm:@openai/codex@0.115.0-linux-x64\n',
  );
  assert.match(materialized.pythonRequirementsText, /^pandas==2.2.3/m);
  assert.equal(materialized.bootstrapScriptText, '#!/bin/sh\nset -eu\n');
});

test('writeMaterializedImageConfig writes the generated docker build files', async () => {
  const config = getImageConfig();
  const outDir = await mkdtemp(path.join(os.tmpdir(), 'salambo-image-config-'));

  await writeMaterializedImageConfig(outDir, materializeImageConfig(config));

  assert.equal(await readFile(path.join(outDir, 'apt-packages.txt'), 'utf8'), 'git\npython3\npython3-venv\npython3-pip\ncurl\nca-certificates\nvim\n');
  assert.equal(
    await readFile(path.join(outDir, 'npm-tools.txt'), 'utf8'),
    '@openai/codex\n@openai/codex-linux-x64@npm:@openai/codex@0.115.0-linux-x64\n',
  );
  assert.match(await readFile(path.join(outDir, 'requirements.txt'), 'utf8'), /^pandas==2.2.3/m);
  assert.equal(await readFile(path.join(outDir, 'bootstrap.sh'), 'utf8'), '#!/bin/sh\nset -eu\n');
});
