import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import imageConfig from '../sandbox/image.config.mjs';

const PROJECT_ROOT = process.cwd();
const PACKAGE_JSON_PATH = path.join(PROJECT_ROOT, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));

function printHelp() {
  console.log(`Usage:
  npm run image:build
  npm run image:push
  npm run image:release

Extra flags:
  --tag <tag>         Override the default package.json version tag
  --latest            Also tag/push :latest
  --platform <value>  Override the configured docker platform
  --dry-run           Print commands without running them
  --no-typecheck      Skip typecheck during image:release
`);
}

function resolveOption(args, name) {
  const index = args.indexOf(name);
  if (index === -1) {
    return undefined;
  }

  return args[index + 1];
}

function hasFlag(args, flag) {
  return args.includes(flag);
}

function runCommand(command, args, options = {}) {
  const printable = [command, ...args].join(' ');
  console.log(`[image] ${printable}`);

  if (options.dryRun) {
    return;
  }

  const result = spawnSync(command, args, {
    stdio: 'inherit',
    cwd: PROJECT_ROOT,
    shell: false,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function resolveNpmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function buildContextTag(tag) {
  return `${imageConfig.repository}:${tag}`;
}

function assertRepositoryConfigured(command) {
  if (typeof imageConfig.repository !== 'string' || !imageConfig.repository.trim()) {
    throw new Error('sandbox/image.config.mjs must define a repository value');
  }

  if (
    (command === 'push' || command === 'release') &&
    imageConfig.repository.includes('YOUR_USERNAME')
  ) {
    throw new Error(
      'Set sandbox/image.config.mjs repository to your real image repository before pushing',
    );
  }
}

function buildDockerBuildArgs(params) {
  const args = ['build', '-t', params.versionTag];

  if (params.includeLatest) {
    args.push('-t', params.latestTag);
  }

  if (params.platform) {
    args.push('--platform', params.platform);
  }

  if (imageConfig.provenance === false) {
    args.push('--provenance=false');
  }

  if (imageConfig.sbom === false) {
    args.push('--sbom=false');
  }

  for (const [key, value] of Object.entries(imageConfig.buildArgs ?? {})) {
    args.push('--build-arg', `${key}=${value}`);
  }

  args.push('.');
  return args;
}

function main() {
  const [, , command = 'build', ...restArgs] = process.argv;

  if (command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  if (!['build', 'push', 'release', 'print'].includes(command)) {
    printHelp();
    process.exit(1);
  }

  assertRepositoryConfigured(command);

  const dryRun = hasFlag(restArgs, '--dry-run');
  const includeLatest = hasFlag(restArgs, '--latest') || imageConfig.pushLatest === true;
  const tag = resolveOption(restArgs, '--tag') || packageJson.version;
  const platform = resolveOption(restArgs, '--platform') || imageConfig.defaultPlatform || '';
  const versionTag = buildContextTag(tag);
  const latestTag = buildContextTag('latest');

  if (command === 'print') {
    console.log(
      JSON.stringify(
        {
          repository: imageConfig.repository,
          version: packageJson.version,
          resolvedTag: tag,
          versionTag,
          latestTag,
          includeLatest,
          platform,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (command === 'release' && !hasFlag(restArgs, '--no-typecheck')) {
    runCommand(resolveNpmCommand(), ['run', 'typecheck'], { dryRun });
  }

  if (command === 'build' || command === 'release') {
    runCommand('docker', buildDockerBuildArgs({ versionTag, latestTag, includeLatest, platform }), {
      dryRun,
    });
  }

  if (command === 'push' || command === 'release') {
    runCommand('docker', ['push', versionTag], { dryRun });

    if (includeLatest) {
      runCommand('docker', ['push', latestTag], { dryRun });
    }
  }
}

main();
