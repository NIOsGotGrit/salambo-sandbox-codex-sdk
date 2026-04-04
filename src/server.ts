import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { PORT, WORKSPACE_DIR, logStartupWarnings } from './config/env.js';
import { installGlobalProxySupport } from './config/proxy.js';
import { installFileLogger } from './logging/file-logger.js';
import { createAgentRouter } from './routes/agent.js';
import { createWorkspaceRouter } from './routes/workspace.js';
import { getSandboxConfig } from './platform/load-sandbox-config.js';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));

  app.use(createAgentRouter());
  app.use(createWorkspaceRouter());

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Server error:', err);
    res.status(500).json({
      error: 'Internal server error',
      message: err.message,
    });
  });

  return app;
}

export function startServer() {
  installFileLogger();
  installGlobalProxySupport();
  const config = getSandboxConfig();
  logStartupWarnings();
  const app = createApp();

  return app.listen(PORT, () => {
  console.log(`\nAgent Sandbox API running on port ${PORT}`);
  console.log(`  Profile:   ${config.configProfile}`);
  console.log(`  Workspace: ${WORKSPACE_DIR}`);
  console.log(`\nCustomize: harness-config/agent.ts`);
  console.log(`\nEndpoints:`);
  console.log(`  GET  /health`);
  console.log(`  POST /agent/query            { sandboxId, prompt, systemPrompt?, sessionId?, metadata? }`);
  console.log(`  POST /agent/interrupt         { sandboxId }`);
  console.log(`  GET  /agent/status`);
  console.log(`  GET  /agent/events/:sandboxId`);
  console.log(`  POST /workspace/files/sync`);
  console.log(`  POST /workspace/files/import`);
  console.log(`  DELETE /workspace/sandbox/:sandboxId`);
  });
}

const isEntrypoint =
  process.argv[1] &&
  new URL(import.meta.url).pathname.endsWith(process.argv[1].replace(/\\/g, '/'));

if (isEntrypoint) {
  startServer();
}
