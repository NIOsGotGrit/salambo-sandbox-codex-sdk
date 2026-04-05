import { readFileSync } from 'node:fs';
import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';

type ProxyRuntime = {
  EnvHttpProxyAgent: new (options?: {
    proxyTls?: {
      ca?: string;
    };
    requestTls?: {
      ca?: string;
    };
  }) => unknown;
  setGlobalDispatcher: (dispatcher: any) => void;
  readFileSync: (path: string, encoding: BufferEncoding) => string;
};

type ProxyLogger = Pick<Console, 'info'>;

const defaultRuntime: ProxyRuntime = {
  EnvHttpProxyAgent,
  setGlobalDispatcher,
  readFileSync,
};

let installed = false;

export function installGlobalProxySupport(options?: {
  env?: NodeJS.ProcessEnv;
  runtime?: ProxyRuntime;
  logger?: ProxyLogger;
}) {
  if (installed) {
    return false;
  }

  const env = options?.env ?? process.env;
  const proxyUrl = env.HTTPS_PROXY || env.HTTP_PROXY;

  if (!proxyUrl) {
    return false;
  }

  const runtime = options?.runtime ?? defaultRuntime;
  const trustBundlePath = resolveTrustBundlePath(env);
  const trustBundle =
    trustBundlePath ? runtime.readFileSync(trustBundlePath, 'utf8') : undefined;

  runtime.setGlobalDispatcher(
    new runtime.EnvHttpProxyAgent({
      proxyTls: trustBundle ? { ca: trustBundle } : undefined,
      requestTls: trustBundle ? { ca: trustBundle } : undefined,
    }),
  );

  (options?.logger ?? console).info(
    `[proxy] Installed global proxy dispatcher from ${env.HTTPS_PROXY ? 'HTTPS_PROXY' : 'HTTP_PROXY'}`,
  );

  installed = true;
  return true;
}

export function resetProxySupportForTests() {
  installed = false;
}

function resolveTrustBundlePath(env: NodeJS.ProcessEnv) {
  return (
    firstNonEmpty(env.NODE_EXTRA_CA_CERTS) ??
    firstNonEmpty(env.SSL_CERT_FILE) ??
    firstNonEmpty(env.REQUESTS_CA_BUNDLE)
  );
}

function firstNonEmpty(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
