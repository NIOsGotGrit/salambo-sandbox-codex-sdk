import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';

type ProxyRuntime = {
  EnvHttpProxyAgent: new () => unknown;
  setGlobalDispatcher: (dispatcher: any) => void;
};

type ProxyLogger = Pick<Console, 'info'>;

const defaultRuntime: ProxyRuntime = {
  EnvHttpProxyAgent,
  setGlobalDispatcher,
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
  runtime.setGlobalDispatcher(new runtime.EnvHttpProxyAgent());

  (options?.logger ?? console).info(
    `[proxy] Installed global proxy dispatcher from ${env.HTTPS_PROXY ? 'HTTPS_PROXY' : 'HTTP_PROXY'}`,
  );

  installed = true;
  return true;
}

export function resetProxySupportForTests() {
  installed = false;
}
