import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import {
  CODEX_MODEL,
  CODEX_PROVIDER,
  OPENAI_BASE_URL,
  PORT,
  SALAMBO_CODEX_PATH,
  WORKSPACE_DIR,
  logStartupWarnings,
} from './config';
import { installFileLogger } from './logging/file-logger';
import { createAgentRouter } from './routes/agent';
import { createWorkspaceRouter } from './routes/workspace';

installFileLogger();
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
  console.log(`Agent Sandbox API running on port ${PORT}`);
  console.log(`Workspace directory: ${WORKSPACE_DIR}`);
  console.log(`Codex model: ${CODEX_MODEL}`);
  console.log(`Codex provider: ${CODEX_PROVIDER}`);
  if (SALAMBO_CODEX_PATH) {
    console.log(`Codex binary override: ${SALAMBO_CODEX_PATH}`);
  }
  if (OPENAI_BASE_URL) {
    console.log(`OpenAI Base URL: ${OPENAI_BASE_URL}`);
  }
  console.log('\nEndpoints:');
  console.log('  GET  /health - Health check');
  console.log('  POST /agent/query - Send task to agent');
  console.log('  POST /agent/interrupt - Interrupt agent execution');
  console.log('  GET  /agent/status - Get agent status');
  console.log('  GET  /agent/events/:sessionId - Read local event history');
  console.log('  POST /workspace/files/sync - Upload base64 files into workspace');
  console.log('  POST /workspace/files/import - Download files into workspace');
  console.log('  DELETE /workspace/session/:sessionId - Cleanup session state');
});
