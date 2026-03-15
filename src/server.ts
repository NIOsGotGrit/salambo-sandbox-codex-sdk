import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { PORT, WORKSPACE_DIR, logStartupWarnings } from './config/env';
import { installFileLogger } from './logging/file-logger';
import { createAgentRouter } from './routes/agent';
import { createWorkspaceRouter } from './routes/workspace';
import { getSandboxConfig } from './platform/load-sandbox-config';

installFileLogger();

// Validate sandbox config at startup — fail fast
const config = getSandboxConfig();

logStartupWarnings();

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

app.listen(PORT, () => {
  console.log(`\nAgent Sandbox API running on port ${PORT}`);
  console.log(`  Model:     ${config.model} (${config.provider})`);
  console.log(`  Workspace: ${WORKSPACE_DIR}`);
  console.log(`  Sandbox:   ${config.sandbox}`);
  console.log(`\nCustomize: sandbox/agent.ts`);
  console.log(`\nEndpoints:`);
  console.log(`  GET  /health`);
  console.log(`  POST /agent/query            { taskId, prompt, systemPrompt?, sdkSessionId?, metadata? }`);
  console.log(`  POST /agent/interrupt         { taskId }`);
  console.log(`  GET  /agent/status`);
  console.log(`  GET  /agent/events/:taskId`);
  console.log(`  POST /workspace/files/sync`);
  console.log(`  POST /workspace/files/import`);
  console.log(`  DELETE /workspace/session/:taskId`);
});
