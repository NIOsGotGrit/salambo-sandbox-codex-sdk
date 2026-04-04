import test from 'node:test';
import assert from 'node:assert/strict';

import {
  installGlobalProxySupport,
  resetProxySupportForTests,
} from '../../src/config/proxy.js';

test.afterEach(() => {
  resetProxySupportForTests();
});

test('installGlobalProxySupport is a no-op when no proxy env is set', () => {
  let calls = 0;

  const installed = installGlobalProxySupport({
    env: {},
    runtime: {
      EnvHttpProxyAgent: class {},
      setGlobalDispatcher() {
        calls += 1;
      },
    },
    logger: {
      info() {},
    },
  });

  assert.equal(installed, false);
  assert.equal(calls, 0);
});

test('installGlobalProxySupport installs a global dispatcher from proxy env', () => {
  let calls = 0;
  let dispatcher: unknown = null;
  const messages: string[] = [];

  const installed = installGlobalProxySupport({
    env: {
      HTTPS_PROXY: 'http://proxy.internal:8080',
    },
    runtime: {
      EnvHttpProxyAgent: class FakeProxyAgent {
        readonly kind = 'env-proxy-agent';
      },
      setGlobalDispatcher(value) {
        calls += 1;
        dispatcher = value;
      },
    },
    logger: {
      info(message) {
        messages.push(message);
      },
    },
  });

  assert.equal(installed, true);
  assert.equal(calls, 1);
  assert.equal(
    (dispatcher as { kind?: string } | null)?.kind,
    'env-proxy-agent',
  );
  assert.match(messages[0] ?? '', /Installed global proxy dispatcher/);
});

test('installGlobalProxySupport is idempotent', () => {
  let calls = 0;

  const runtime = {
    EnvHttpProxyAgent: class {},
    setGlobalDispatcher() {
      calls += 1;
    },
  };

  installGlobalProxySupport({
    env: {
      HTTP_PROXY: 'http://proxy.internal:8080',
    },
    runtime,
    logger: {
      info() {},
    },
  });

  const second = installGlobalProxySupport({
    env: {
      HTTP_PROXY: 'http://proxy.internal:8080',
    },
    runtime,
    logger: {
      info() {},
    },
  });

  assert.equal(second, false);
  assert.equal(calls, 1);
});
