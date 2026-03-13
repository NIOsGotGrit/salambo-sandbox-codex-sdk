import express, { Request, Response } from 'express';
import cors from 'cors';
import {
  createSession,
  type SalamboSession,
  type SessionOptions,
} from 'salambo-codex-agent-sdk';
import { AppendRecord, S2 } from '@s2-dev/streamstore';
import dotenv from 'dotenv';
import chokidar, { FSWatcher } from 'chokidar';
import path from 'path';
import { promises as fs } from 'fs';
import { setupWorkspace, WorkspacePaths } from './workspace';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const WORKSPACE_DIR = process.env.WORKSPACE_DIR || '/workspace';
const SANDBOX_FILE_LOGGING = process.env.SANDBOX_FILE_LOGGING !== 'false';
const SANDBOX_LOG_DIR = process.env.SANDBOX_LOG_DIR || '/tmp/sandbox-logs';
const SANDBOX_LOG_FILE = process.env.SANDBOX_LOG_FILE || 'agent-api.log';
const SANDBOX_LOG_PATH = path.join(SANDBOX_LOG_DIR, SANDBOX_LOG_FILE);

const originalConsole = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

let fileLogInitTried = false;
let fileLogEnabled = SANDBOX_FILE_LOGGING;

function stringifyLogArg(arg: unknown): string {
  if (typeof arg === 'string') {
    return arg;
  }

  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

async function appendLogToFile(level: 'INFO' | 'WARN' | 'ERROR', args: unknown[]) {
  if (!fileLogEnabled) {
    return;
  }

  try {
    if (!fileLogInitTried) {
      await fs.mkdir(SANDBOX_LOG_DIR, { recursive: true });
      fileLogInitTried = true;
    }

    const line = `[${new Date().toISOString()}] [${level}] ${args.map(stringifyLogArg).join(' ')}\n`;
    await fs.appendFile(SANDBOX_LOG_PATH, line, 'utf8');
  } catch (error) {
    fileLogEnabled = false;
    originalConsole.error('[file-logger] Failed to write log file, disabling file logger', error);
  }
}

function installFileLogger() {
  if (!SANDBOX_FILE_LOGGING) {
    return;
  }

  console.log = ((...args: unknown[]) => {
    originalConsole.log(...args);
    void appendLogToFile('INFO', args);
  }) as typeof console.log;

  console.warn = ((...args: unknown[]) => {
    originalConsole.warn(...args);
    void appendLogToFile('WARN', args);
  }) as typeof console.warn;

  console.error = ((...args: unknown[]) => {
    originalConsole.error(...args);
    void appendLogToFile('ERROR', args);
  }) as typeof console.error;

  originalConsole.log(`[file-logger] Writing sandbox logs to ${SANDBOX_LOG_PATH}`);
  void appendLogToFile('INFO', [`[file-logger] Writing sandbox logs to ${SANDBOX_LOG_PATH}`]);
}

installFileLogger();

const GATEWAY_BASE_URL = process.env.GATEWAY_BASE_URL;
if (!GATEWAY_BASE_URL) {
  console.warn('[workspace] GATEWAY_BASE_URL is not configured. File sync is disabled.');
}
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL;
const CODEX_MODEL = process.env.CODEX_MODEL || 'gpt-5.2-codex';
const CODEX_PROVIDER = process.env.CODEX_PROVIDER || 'openai';
const SALAMBO_CODEX_PATH = process.env.SALAMBO_CODEX_PATH;
const S2_ACCESS_TOKEN = process.env.S2_ACCESS_TOKEN;
const S2_BASIN = process.env.S2_BASIN;
const S2_STREAM_PREFIX = process.env.S2_STREAM_PREFIX || 'agent-session';
const S2_ENABLED = Boolean(S2_ACCESS_TOKEN && S2_BASIN);
const LOCAL_EVENT_MAX_EVENTS = Number(process.env.LOCAL_EVENT_MAX_EVENTS ?? 500);

if (!OPENAI_API_KEY && CODEX_PROVIDER === 'openai') {
  console.warn(
    'Warning: OPENAI_API_KEY is not set. Codex may still work if the runtime is already authenticated.',
  );
}

if (!S2_ENABLED) {
  console.warn(
    '[events] S2 is not configured. Falling back to the built-in local event store for testing.',
  );
}

// Create S2 client factory instead of singleton to avoid stale connections
function getS2Basin() {
  if (!S2_ACCESS_TOKEN || !S2_BASIN) {
    throw new Error('S2_ACCESS_TOKEN and S2_BASIN must be configured');
  }
  const s2Client = new S2({ accessToken: S2_ACCESS_TOKEN });
  return s2Client.basin(S2_BASIN);
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Single session model - one session per container
type ActiveSession = {
  sessionId: string;
  abortController: AbortController;
  streamName: string;
  workspace: WorkspacePaths;
  agentToken?: string;
};

let activeSession: ActiveSession | null = null;
let fileWatcher: FSWatcher | null = null;
type JsonEventPayload = Record<string, unknown>;
type LocalEventRecord = {
  sequence: number;
  streamName: string;
  payload: JsonEventPayload;
};
type LocalEventSession = {
  events: LocalEventRecord[];
  nextSequence: number;
  updatedAt: string;
};
type EventSink =
  | {
      kind: 's2';
      sessionId: string;
      streamName: string;
      stream: ReturnType<ReturnType<typeof getS2Basin>['stream']>;
    }
  | {
      kind: 'local';
      sessionId: string;
      streamName: string;
    };

const localEventSessions = new Map<string, LocalEventSession>();

function getEventBackend(): 's2' | 'local' {
  return S2_ENABLED ? 's2' : 'local';
}

function getOrCreateLocalEventSession(sessionId: string): LocalEventSession {
  const existing = localEventSessions.get(sessionId);
  if (existing) {
    return existing;
  }

  const created: LocalEventSession = {
    events: [],
    nextSequence: 1,
    updatedAt: new Date().toISOString(),
  };
  localEventSessions.set(sessionId, created);
  return created;
}

function recordLocalEvent(sessionId: string, streamName: string, payload: JsonEventPayload) {
  const session = getOrCreateLocalEventSession(sessionId);
  session.events.push({
    sequence: session.nextSequence++,
    streamName,
    payload: sanitizePayload(payload),
  });
  session.updatedAt = new Date().toISOString();

  if (session.events.length > LOCAL_EVENT_MAX_EVENTS) {
    session.events.splice(0, session.events.length - LOCAL_EVENT_MAX_EVENTS);
  }
}

function createEventSink(sessionId: string, streamName: string): EventSink {
  if (!S2_ENABLED) {
    return {
      kind: 'local',
      sessionId,
      streamName,
    };
  }

  const basin = getS2Basin();
  return {
    kind: 's2',
    sessionId,
    streamName,
    stream: basin.stream(streamName),
  };
}

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    workspace: WORKSPACE_DIR,
    model: CODEX_MODEL,
    provider: CODEX_PROVIDER,
    eventBackend: getEventBackend(),
    timestamp: new Date().toISOString()
  });
});

// Query endpoint - Send tasks to AgentSDK (now streaming to S2)
app.post('/agent/query', async (req: Request, res: Response) => {
  const requestStartTime = Date.now();
  console.log(`[${new Date().toISOString()}] === DÉBUT NOUVELLE REQUÊTE /agent/query ===`);
  console.log(`[${new Date().toISOString()}] Headers reçus:`, JSON.stringify(req.headers, null, 2));
  console.log(`[${new Date().toISOString()}] Corps de la requête brut:`, JSON.stringify(req.body, null, 2));

  const { prompt, sessionId, context, ourSessionId } = req.body ?? {};
  const agentTokenHeader = typeof req.headers.authorization === 'string' ? req.headers.authorization : null;

  console.log(`[${new Date().toISOString()}] Paramètres extraits:`);
  console.log(`  - prompt: ${prompt ? `[${prompt.length} caractères]` : 'undefined'}`);
  console.log(`  - sessionId: ${sessionId ? `"${sessionId}"` : 'undefined'}`);
  console.log(`  - ourSessionId: ${ourSessionId ? `"${ourSessionId}"` : 'undefined'}`);
  console.log(`  - context: ${context ? `type: ${typeof context}` : 'undefined'}`);

  if (!prompt || typeof prompt !== 'string') {
    console.log(`[${new Date().toISOString()}] ❌ ERREUR: Prompt invalide - prompt:`, prompt);
    return res.status(400).json({ error: 'Prompt is required and must be a string' });
  }

  if (!ourSessionId || typeof ourSessionId !== 'string') {
    console.log(`[${new Date().toISOString()}] ❌ ERREUR: ourSessionId manquant ou invalide`);
    return res.status(400).json({ error: 'ourSessionId is required for stream identification' });
  }

  // If sessionId is provided, we're resuming an existing SDK session
  // If not provided, this is a new session - use ourSessionId for stream naming
  const isResuming = typeof sessionId === 'string' && sessionId.length > 0;
  console.log(`[${new Date().toISOString()}] 📋 Analyse de la requête:`);
  console.log(`  - Reprise de session (isResuming): ${isResuming}`);
  console.log(`  - SessionId SDK fourni: ${isResuming ? `"${sessionId}"` : 'non'}`);

  // For stream naming, always use ourSessionId (our internal tracking ID = threadId)
  // This ensures client and sandbox use the same stream name
  const streamSessionId = ourSessionId || `session-${Date.now()}`;
  console.log(`[${new Date().toISOString()}] 🏷️  ID de session interne pour streaming: "${streamSessionId}"`);

  console.log(`[${new Date().toISOString()}] 📝 Résumé requête:`);
  console.log(`  - Type: ${isResuming ? 'REPRISE' : 'NOUVELLE'}`);
  console.log(`  - Session SDK: ${isResuming ? `"${sessionId}"` : 'sera généré'}`);
  console.log(`  - Session streaming: "${streamSessionId}"`);
  console.log(`  - Prompt preview: "${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}"`);

  const abortController = new AbortController();
  const streamName = buildStreamName(streamSessionId);
  console.log(`[${new Date().toISOString()}] 🚀 Création AbortController et nom de stream S2: "${streamName}"`);

  // Single session per container - check if one is already running
  if (activeSession) {
    console.log(`[${new Date().toISOString()}] ⚠️  CONFLIT: Une session est déjà active dans ce sandbox`);
    return res.status(409).json({ error: 'A session is already running in this sandbox' });
  }

  let workspace: WorkspacePaths;
  try {
    workspace = await setupWorkspace();
    console.log(
      `[${new Date().toISOString()}] 🗂️  Workspace prêt: ${workspace.root}`
    );
    await ensureFileWatcher(workspace);
  } catch (error) {
    console.error(
      `[${new Date().toISOString()}] 💥 ERREUR lors de la préparation du workspace:`,
      error
    );
    return res.status(500).json({ error: 'Failed to prepare workspace' });
  }

  console.log(`[${new Date().toISOString()}] ✅ Enregistrement session active: ${streamSessionId}`);
  activeSession = {
    sessionId: streamSessionId,
    abortController,
    streamName,
    workspace,
    agentToken: agentTokenHeader || undefined,
  };

  if (isResuming) {
    // Resuming existing SDK session - use the provided SDK session ID
    console.log(`[${new Date().toISOString()}] 🔄 DÉMARRAGE REPRISE:`);
    console.log(`  - Session interne: "${streamSessionId}"`);
    console.log(`  - Session SDK: "${sessionId}"`);
    console.log(`  - Stream S2: "${streamName}"`);

    void runAgentSession({
      sessionId: streamSessionId,      // Our tracking ID for stream
      sdkSessionId: sessionId,          // SDK session ID for resume
      prompt,
      context,
      abortController,
      streamName,
      captureSdkSessionId: false,
      ourSessionId: streamSessionId,
      isResuming: true,
      workspace,
    }).catch((error) => {
      console.error(`[${new Date().toISOString()}] 💥 ERREUR INATTENDUE lors de la reprise session ${streamSessionId}:`, error);
    });

    const responseTime = Date.now() - requestStartTime;
    console.log(`[${new Date().toISOString()}] 📤 RÉPONSE REPRISE envoyée (${responseTime}ms):`);
    console.log(`  - sessionId: "${streamSessionId}"`);
    console.log(`  - status: "ready"`);

    return res.status(202).json({
      sessionId: streamSessionId,
      status: 'ready',
    });
  } else {
    // New session - let SDK create its own session ID, we'll capture it
    console.log(`[${new Date().toISOString()}] 🆕 DÉMARRAGE NOUVELLE SESSION:`);
    console.log(`  - Session interne: "${streamSessionId}"`);
    console.log(`  - Stream S2: "${streamName}"`);
    console.log(`  - SDK générera session ID automatiquement`);

    void runAgentSession({
      sessionId: streamSessionId,
      prompt,
      context,
      abortController,
      streamName,
      captureSdkSessionId: true,
      ourSessionId: streamSessionId,
      isResuming: false,
      workspace,
    }).catch((error) => {
      console.error(`[${new Date().toISOString()}] 💥 ERREUR INATTENDUE lors de la nouvelle session ${streamSessionId}:`, error);
    });

    const responseTime = Date.now() - requestStartTime;
    console.log(`[${new Date().toISOString()}] 📤 RÉPONSE NOUVELLE SESSION envoyée (${responseTime}ms):`);
    console.log(`  - sessionId: "${streamSessionId}"`);
    console.log(`  - status: "pending"`);

    return res.status(202).json({
      sessionId: streamSessionId,
      status: 'pending',
    });
  }
});

// Interrupt endpoint - Stop current execution
app.post('/agent/interrupt', (req: Request, res: Response) => {
  console.log(`[${new Date().toISOString()}] 🛑 === REQUÊTE /agent/interrupt REÇUE ===`);
  console.log(`[${new Date().toISOString()}] Corps de la requête:`, JSON.stringify(req.body, null, 2));

  const { sessionId } = req.body;

  if (!sessionId) {
    console.log(`[${new Date().toISOString()}] ❌ ERREUR: sessionId manquant dans la requête d'interruption`);
    return res.status(400).json({ error: 'sessionId is required' });
  }

  console.log(`[${new Date().toISOString()}] 🔍 Recherche de la session "${sessionId}"`);
  console.log(`[${new Date().toISOString()}] Session active: ${activeSession?.sessionId || 'aucune'}`);

  if (!activeSession || activeSession.sessionId !== sessionId) {
    console.log(`[${new Date().toISOString()}] ❌ Session "${sessionId}" non trouvée ou déjà terminée`);
    return res.status(404).json({ error: 'Session not found or already completed' });
  }

  console.log(`[${new Date().toISOString()}] ⚡ INTERRUPTION de la session "${sessionId}"`);
  console.log(`  - Stream associé: "${activeSession.streamName}"`);
  console.log(`  - Workspace: "${activeSession.workspace.root}"`);

  activeSession.abortController.abort();
  activeSession = null;

  console.log(`[${new Date().toISOString()}] ✅ Session "${sessionId}" interrompue avec succès`);

  res.json({
    success: true,
    message: 'Session interrupted',
    sessionId
  });

  console.log(`[${new Date().toISOString()}] 📤 Réponse interruption envoyée`);
});

// Workspace cleanup endpoint - simplified for single session model
app.delete('/workspace/session/:sessionId', async (req: Request, res: Response) => {
  const sessionId = req.params.sessionId;
  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId parameter is required' });
  }

  if (activeSession && activeSession.sessionId === sessionId) {
    console.log(
      `[${new Date().toISOString()}] 🧹 Nettoyage: interruption de la session active "${sessionId}"`
    );
    activeSession.abortController.abort();
    activeSession = null;
  }

  try {
    await stopFileWatcher();
    console.log(
      `[${new Date().toISOString()}] 🧼 Session "${sessionId}" nettoyée`
    );
    return res.json({ success: true, sessionId });
  } catch (error) {
    console.error(
      `[${new Date().toISOString()}] 💥 ERREUR lors du nettoyage "${sessionId}":`,
      error
    );
    return res.status(500).json({ error: 'Failed to cleanup session' });
  }
});

// Workspace input file sync endpoint
app.post('/workspace/files/sync', async (req: Request, res: Response) => {
  const authHeader = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
  if (!authHeader) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const files = Array.isArray((req.body as { files?: unknown[] } | undefined)?.files)
    ? ((req.body as { files: Array<{ targetPath?: unknown; contentBase64?: unknown; mimeType?: unknown }> }).files)
    : [];

  if (!files.length) {
    return res.status(400).json({ error: 'files are required' });
  }

  if (files.length > 20) {
    return res.status(400).json({ error: 'Too many files in one request' });
  }

  try {
    const workspace = await setupWorkspace();
    const saved: string[] = [];

    for (const file of files) {
      if (typeof file.targetPath !== 'string' || typeof file.contentBase64 !== 'string') {
        return res.status(400).json({ error: 'Invalid file payload' });
      }

      const safeRelativePath = resolveSafeWorkspaceTargetPath(file.targetPath);
      const absolutePath = path.join(workspace.root, safeRelativePath);
      const bytes = Buffer.from(file.contentBase64, 'base64');

      if (bytes.length > 1024 * 1024 * 100) {
        return res.status(413).json({ error: 'File exceeds max size 100MB' });
      }

      await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      await fs.writeFile(absolutePath, bytes);
      saved.push(`/workspace/${safeRelativePath}`);
    }

    return res.json({ success: true, saved });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Input file sync failed`, error);
    return res.status(500).json({ error: 'Failed to sync files' });
  }
});

// Workspace input file import endpoint (download signed URLs directly inside sandbox)
app.post('/workspace/files/import', async (req: Request, res: Response) => {
  const authHeader = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
  if (!authHeader) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const files = Array.isArray((req.body as { files?: unknown[] } | undefined)?.files)
    ? ((req.body as { files: Array<{ targetPath?: unknown; sourceUrl?: unknown; mimeType?: unknown }> }).files)
    : [];

  if (!files.length) {
    return res.status(400).json({ error: 'files are required' });
  }

  if (files.length > 20) {
    return res.status(400).json({ error: 'Too many files in one request' });
  }

  try {
    const workspace = await setupWorkspace();
    const saved: string[] = [];

    for (const file of files) {
      if (typeof file.targetPath !== 'string' || typeof file.sourceUrl !== 'string') {
        return res.status(400).json({ error: 'Invalid file payload' });
      }

      const sourceUrl = file.sourceUrl;
      if (!sourceUrl.startsWith('https://')) {
        return res.status(400).json({ error: 'sourceUrl must be https' });
      }

      const safeRelativePath = resolveSafeWorkspaceTargetPath(file.targetPath);
      const absolutePath = path.join(workspace.root, safeRelativePath);
      await fs.mkdir(path.dirname(absolutePath), { recursive: true });

      await downloadFileToPath(sourceUrl, absolutePath, 1024 * 1024 * 100);
      saved.push(`/workspace/${safeRelativePath}`);
    }

    return res.json({ success: true, saved });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Input file import failed`, error);
    return res.status(500).json({ error: 'Failed to import files' });
  }
});
// Status endpoint - Get active session
app.get('/agent/status', (req: Request, res: Response) => {
  console.log(`[${new Date().toISOString()}] 📊 === REQUÊTE /agent/status REÇUE ===`);

  console.log(`[${new Date().toISOString()}] 📋 État actuel:`);
  console.log(`  - Session active: ${activeSession ? activeSession.sessionId : 'aucune'}`);
  console.log(`  - Workspace: ${WORKSPACE_DIR}`);
  console.log(`  - Modèle: ${CODEX_MODEL}`);
  console.log(`  - Provider: ${CODEX_PROVIDER}`);
  console.log(`  - Event backend: ${getEventBackend()}`);

  res.json({
    hasActiveSession: !!activeSession,
    session: activeSession ? {
      sessionId: activeSession.sessionId,
      streamName: activeSession.streamName,
      workspaceRoot: activeSession.workspace.root,
    } : null,
    workspace: WORKSPACE_DIR,
    model: CODEX_MODEL,
    provider: CODEX_PROVIDER,
    eventBackend: getEventBackend(),
    timestamp: new Date().toISOString()
  });

  console.log(`[${new Date().toISOString()}] 📤 Réponse status envoyée`);
});

app.get('/agent/events/:sessionId', (req: Request, res: Response) => {
  const rawSessionId = req.params.sessionId;
  const sessionId = Array.isArray(rawSessionId) ? rawSessionId[0] : rawSessionId;
  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId parameter is required' });
  }

  const rawLimit = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
  const requestedLimit = Number(rawLimit ?? 200);
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(1000, Math.trunc(requestedLimit)))
    : 200;

  const session = localEventSessions.get(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'No local events found for session' });
  }

  const events = session.events.slice(-limit);
  return res.json({
    sessionId,
    eventBackend: getEventBackend(),
    totalEvents: session.events.length,
    returnedEvents: events.length,
    updatedAt: session.updatedAt,
    events,
  });
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: Function) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

// Start server
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
  console.log(`\nEndpoints:`);
  console.log(`  GET  /health - Health check`);
  console.log(`  POST /agent/query - Send task to agent`);
  console.log(`  POST /agent/interrupt - Interrupt agent execution`);
  console.log(`  GET  /agent/status - Get agent status`);
});

// Helpers

function buildStreamName(sessionId: string): string {
  return `${S2_STREAM_PREFIX}:${sessionId}`;
}

async function downloadFileToPath(sourceUrl: string, absolutePath: string, maxBytes: number) {
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

function resolveSystemPrompt(context: unknown): string | undefined {
  if (typeof context === 'string' && context.trim()) {
    return context;
  }

  if (
    context &&
    typeof context === 'object' &&
    typeof (context as { systemPrompt?: unknown }).systemPrompt === 'string'
  ) {
    const systemPrompt = (context as { systemPrompt: string }).systemPrompt.trim();
    return systemPrompt || undefined;
  }

  return undefined;
}

function resolveSafeWorkspaceTargetPath(inputPath: string): string {
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
type RunSessionOptions = {
  sessionId: string;          // Our internal tracking ID (threadId) - used for stream naming
  sdkSessionId?: string;      // SDK session ID - only used for resume operations
  prompt: string;
  context?: unknown;
  abortController: AbortController;
  streamName: string;
  captureSdkSessionId?: boolean;
  ourSessionId?: string;
  isResuming: boolean;
  workspace: WorkspacePaths;
};

async function runAgentSession(options: RunSessionOptions) {
  const sessionStartTime = Date.now();
  console.log(`[${new Date().toISOString()}] ⚙️  DÉMARRAGE runAgentSession:`);
  console.log(`  - Session interne: "${options.sessionId}"`);
  console.log(`  - Session SDK: ${options.sdkSessionId ? `"${options.sdkSessionId}"` : 'sera généré'}`);
  console.log(`  - Stream S2: "${options.streamName}"`);
  console.log(`  - Type: ${options.isResuming ? 'REPRISE' : 'NOUVELLE'}`);
  console.log(`  - Capture SDK ID: ${options.captureSdkSessionId}`);
  console.log(`  - Prompt preview: "${options.prompt.substring(0, 100)}${options.prompt.length > 100 ? '...' : ''}"`);

  const stream = createEventSink(options.sessionId, options.streamName);
  const timestamp = () => new Date().toISOString();
  // Track SDK session and message stats for stream publishing
  let sdkSessionId: string | undefined = options.sdkSessionId;
  let messageCount = 0;
  const systemPrompt = resolveSystemPrompt(options.context);
  let sdkSession: SalamboSession | null = null;
  const abortSignal = options.abortController.signal;

  const interruptSdkSession = async () => {
    if (!sdkSession) {
      return;
    }

    try {
      await sdkSession.interrupt();
    } catch (error) {
      console.warn(`[${new Date().toISOString()}] Failed to interrupt SDK session`, error);
    }

    try {
      sdkSession.abort();
    } catch (error) {
      console.warn(`[${new Date().toISOString()}] Failed to abort SDK session`, error);
    }
  };

  const abortListener = () => {
    void interruptSdkSession();
  };

  abortSignal.addEventListener('abort', abortListener, { once: true });

  console.log(
    `[${new Date().toISOString()}] 📡 Event stream ready (${stream.kind}): "${options.streamName}"`,
  );

  try {
    console.log(`[${new Date().toISOString()}] 📝 Envoi événement session_init au stream S2...`);
    await appendJsonEvent(stream, {
      type: 'session_init',
      sessionId: options.sessionId,
      workspace: options.workspace.root,
      promptPreview: options.prompt.slice(0, 2000),
      context: sanitizePayload(options.context ?? null),
      timestamp: timestamp(),
    });
    console.log(`[${new Date().toISOString()}] ✅ Événement session_init envoyé avec succès`);
  } catch (streamError) {
    console.error(`[${new Date().toISOString()}] 💥 ERREUR lors de l'envoi session_init:`, streamError);
    throw streamError;
  }

  if (options.isResuming && sdkSessionId) {
    try {
      await appendJsonEvent(stream, {
        type: 'session_ready',
        ourSessionId: options.ourSessionId ?? options.sessionId,
        sdkSessionId,
        timestamp: timestamp(),
      });
      console.log(`[${new Date().toISOString()}] ✅ Événement session_ready envoyé pour reprise avec SDK session ID: ${sdkSessionId}`);
    } catch (streamError) {
      console.error(`[${new Date().toISOString()}] 💥 ERREUR lors de l'envoi session_ready (reprise):`, streamError);
      throw streamError;
    }
  }

  try {
    console.log(`[${new Date().toISOString()}] 🔧 Préparation options SDK:`);

    const queryOptions: SessionOptions = {
      model: CODEX_MODEL,
      provider: CODEX_PROVIDER,
      cwd: options.workspace.root,
      permissionMode: 'bypassPermissions',
      sandboxMode: 'workspace-write',
      codexPath: SALAMBO_CODEX_PATH || undefined,
      systemPrompt,
    };

    console.log(`  - model: ${CODEX_MODEL}`);
    console.log(`  - provider: ${CODEX_PROVIDER}`);
    console.log(`  - cwd: ${options.workspace.root}`);
    console.log(`  - permissionMode: bypassPermissions`);
    console.log(`  - sandboxMode: workspace-write`);
    if (SALAMBO_CODEX_PATH) {
      console.log(`  - codexPath: ${SALAMBO_CODEX_PATH}`);
    }
    if (systemPrompt) {
      console.log(`  - systemPrompt: [${systemPrompt.length} caractères]`);
    }

    // For new sessions, don't set 'resume' - let SDK create a new session
    // For resumed sessions, use 'resume' with the SDK session ID
    if (options.isResuming && options.sdkSessionId) {
      // Resumed session - resume from existing SDK session ID
      queryOptions.resume = options.sdkSessionId;
      console.log(`[${new Date().toISOString()}] 🔄 MODE REPRISE activé avec SDK session: ${options.sdkSessionId}`);
    } else {
      // New session - let SDK create and manage the session
      console.log(`[${new Date().toISOString()}] 🆕 MODE NOUVEAU: SDK va générer session ID automatiquement`);
    }

    console.log(`[${new Date().toISOString()}] 🚀 Initialisation session SDK v2 avec les options suivantes:`);
    console.log(`  - prompt: [${options.prompt.length} caractères]`);
    console.log(`  - options.resume: ${queryOptions.resume || 'non défini (nouvelle session)'}`);

    sdkSession = createSession(queryOptions);

    if (abortSignal.aborted) {
      throw new Error('Session aborted before prompt dispatch');
    }

    await sdkSession.send(options.prompt);

    if (options.captureSdkSessionId && !sdkSessionId) {
      const createdSessionId = sdkSession.sessionId || sdkSession.threadId;

      if (createdSessionId) {
        sdkSessionId = createdSessionId;
        console.log(`[${new Date().toISOString()}] 🎯 CAPTURE SDK Session ID depuis createSession: ${sdkSessionId}`);
        console.log(`  - Session interne: ${options.ourSessionId}`);
        console.log(`  - Session SDK: ${sdkSessionId}`);

        try {
          await appendJsonEvent(stream, {
            type: 'session_ready',
            ourSessionId: options.ourSessionId,
            sdkSessionId,
            timestamp: timestamp(),
          });

          console.log(`[${new Date().toISOString()}] ✅ Événement session_ready envoyé avec SDK session ID: ${sdkSessionId}`);
        } catch (streamError) {
          console.error(`[${new Date().toISOString()}] 💥 ERREUR lors de l'envoi session_ready:`, streamError);
          throw streamError;
        }
      }
    }

    console.log(`[${new Date().toISOString()}] 📡 Session SDK v2 prête, début lecture des messages...`);

    for await (const message of sdkSession.stream()) {
      messageCount++;

      if (abortSignal.aborted) {
        console.log(`[${new Date().toISOString()}] ⛔ SESSION INTERROMPUE par AbortController après ${messageCount} messages`);
        break;
      }

      console.log(`[${new Date().toISOString()}] 📥 Message #${messageCount} reçu:`);
      console.log(`  - type: ${message.type}`);
      console.log(`  - subtype: ${(message as any).subtype || 'non défini'}`);
      if ((message as any).session_id) {
        console.log(`  - session_id: ${(message as any).session_id}`);
      }

      // Capture SDK session ID from the first system message (only for new sessions)
      // We store it to use for future resume operations, but keep using the same stream
      if (options.captureSdkSessionId && !sdkSessionId && message.type === 'system' && (message as any).subtype === 'init' && (message as any).session_id) {
        sdkSessionId = (message as any).session_id;
        console.log(`[${new Date().toISOString()}] 🎯 CAPTURE SDK Session ID: ${sdkSessionId}`);
        console.log(`  - Session interne: ${options.ourSessionId}`);
        console.log(`  - Session SDK: ${sdkSessionId}`);

        try {
          // Send session_ready event on the same stream to inform the client
          await appendJsonEvent(stream, {
            type: 'session_ready',
            ourSessionId: options.ourSessionId,
            sdkSessionId: sdkSessionId,
            timestamp: timestamp(),
          });

          console.log(`[${new Date().toISOString()}] ✅ Événement session_ready envoyé avec SDK session ID: ${sdkSessionId}`);
        } catch (streamError) {
          console.error(`[${new Date().toISOString()}] 💥 ERREUR lors de l'envoi session_ready:`, streamError);
          throw streamError;
        }
      }

      // Always use the same stream throughout the session
      try {
        await sendAgentMessageToStream({
          stream,
          sessionId: options.sessionId,
          sdkSessionId,
          message,
          timestamp: timestamp(),
        });

        if (messageCount % 10 === 0 || message.type === 'result' || message.type === 'assistant') {
          console.log(`[${new Date().toISOString()}] ✅ Message #${messageCount} envoyé au stream (type: ${message.type})`);
        }
      } catch (streamError) {
        console.error(`[${new Date().toISOString()}] 💥 ERREUR lors de l'envoi message #${messageCount}:`, streamError);
        throw streamError;
      }
    }

    console.log(`[${new Date().toISOString()}] 🏁 Fin de l'itération SDK - Total messages: ${messageCount}`);

    if (abortSignal.aborted) {
      console.log(`[${new Date().toISOString()}] ⛔ SESSION CANCELLED - Envoi événement session_cancelled`);
      await appendJsonEvent(stream, {
        type: 'session_cancelled',
        sessionId: options.sessionId,
        sdkSessionId: sdkSessionId,
        timestamp: timestamp(),
      });
      return;
    }

    console.log(`[${new Date().toISOString()}] ✅ SESSION COMPLETÉE - Envoi événement session_complete`);
    await appendJsonEvent(stream, {
      type: 'session_complete',
      sessionId: options.sessionId,
      sdkSessionId: sdkSessionId,
      timestamp: timestamp(),
    });
  } catch (error) {
    const aborted = abortSignal.aborted;
    const sessionDuration = Date.now() - sessionStartTime;

    console.error(`[${new Date().toISOString()}] 💥 ERREUR SESSION ${options.sessionId}:`);
    console.error(`  - Type: ${aborted ? 'ANNULÉE' : 'ERREUR'}`);
    console.error(`  - Durée: ${sessionDuration}ms`);
    console.error(`  - Messages traités: ${messageCount}`);
    console.error(`  - SDK Session ID: ${sdkSessionId || 'non capturé'}`);
    console.error(`  - Erreur:`, error);

    try {
      await appendJsonEvent(stream, {
        type: aborted ? 'session_cancelled' : 'session_error',
        sessionId: options.sessionId,
        sdkSessionId: sdkSessionId,
        error: aborted ? undefined : serializeError(error),
        timestamp: timestamp(),
      });
      console.log(`[${new Date().toISOString()}] ✅ Événement session_${aborted ? 'cancelled' : 'error'} envoyé`);
    } catch (streamError) {
      console.error(`[${new Date().toISOString()}] 💥 ÉCHEC ENVOI ÉVÉNEMENT D'ERREUR:`, streamError);
    }
  } finally {
    abortSignal.removeEventListener('abort', abortListener);

    if (sdkSession) {
      try {
        await sdkSession[Symbol.asyncDispose]();
      } catch (error) {
        console.warn(`[${new Date().toISOString()}] Failed to dispose SDK session`, error);
      }
    }

    activeSession = null;
    const sessionDuration = Date.now() - sessionStartTime;
    console.log(`[${new Date().toISOString()}] 🧹 Nettoyage session ${options.sessionId} terminé`);
    console.log(`  - Durée totale: ${sessionDuration}ms`);
    console.log(`  - Messages traités: ${messageCount}`);
    console.log(`  - SDK Session ID: ${sdkSessionId || 'non capturé'}`);
    console.log(`=== FIN SESSION ${options.sessionId} ===`);
  }
}

const FILE_WATCH_STABILITY_MS = Number(process.env.FILE_WATCH_STABILITY_MS ?? 2000);

async function ensureFileWatcher(workspace: WorkspacePaths) {
  if (!GATEWAY_BASE_URL) {
    return;
  }

  if (fileWatcher) {
    return;
  }

  const outputsDir = workspace.outputsDir;
  await fs.mkdir(outputsDir, { recursive: true });

  const watcher = chokidar.watch(outputsDir, {
    ignoreInitial: true,
    depth: 10,
    awaitWriteFinish: {
      stabilityThreshold: FILE_WATCH_STABILITY_MS,
      pollInterval: 100,
    },
  });

  watcher.on('add', (targetPath) => {
    void handleFileUpload(outputsDir, targetPath, 'add');
  });

  watcher.on('change', (targetPath) => {
    void handleFileUpload(outputsDir, targetPath, 'change');
  });

  watcher.on('unlink', (targetPath) => {
    void handleFileDelete(outputsDir, targetPath);
  });

  watcher.on('error', (error) => {
    console.error(`[${new Date().toISOString()}] File watcher error`, { error });
  });

  fileWatcher = watcher;
  console.log(`[${new Date().toISOString()}] 📁 File watcher started`);
}

async function stopFileWatcher() {
  if (!fileWatcher) return;

  try {
    await fileWatcher.close();
  } catch (error) {
    console.warn(`[${new Date().toISOString()}] Failed to close file watcher`, error);
  }
  fileWatcher = null;
}

function buildDisplayPath(outputsDir: string, targetPath: string): string | null {
  const relative = path.relative(outputsDir, targetPath);
  if (!relative || relative.startsWith('..')) {
    return null;
  }
  const normalized = relative.split(path.sep).join('/');
  return normalized ? `/${normalized}` : null;
}

async function handleFileUpload(
  outputsDir: string,
  targetPath: string,
  event: 'add' | 'change',
) {
  const displayPath = buildDisplayPath(outputsDir, targetPath);
  if (!displayPath) {
    return;
  }

  const agentToken = activeSession?.agentToken;
  if (!agentToken) {
    return;
  }

  try {
    const buffer = await fs.readFile(targetPath);
    await sendFileUpload({
      displayPath,
      buffer,
      event,
      agentToken,
    });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Failed to sync file`, {
      path: displayPath,
      error,
    });
  }
}

async function handleFileDelete(outputsDir: string, targetPath: string) {
  const displayPath = buildDisplayPath(outputsDir, targetPath);
  if (!displayPath) {
    return;
  }

  const agentToken = activeSession?.agentToken;
  if (!agentToken) {
    return;
  }

  try {
    await sendFileDelete({
      displayPath,
      agentToken,
    });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Failed to notify delete`, {
      path: displayPath,
      error,
    });
  }
}

async function sendFileUpload(params: {
  displayPath: string;
  buffer: Buffer;
  event: 'add' | 'change';
  agentToken: string;
}) {
  if (!GATEWAY_BASE_URL) return;

  const formData = new FormData();
  formData.append('displayPath', params.displayPath);
  formData.append('event', params.event);
  formData.append(
    'file',
    new Blob([bufferToArrayBuffer(params.buffer)]),
    params.displayPath.split('/').pop() || 'file',
  );

  const response = await fetch(`${GATEWAY_BASE_URL}/api/daytona/files`, {
    method: 'POST',
    headers: {
      Authorization: params.agentToken,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'unknown error');
    console.warn(`[${new Date().toISOString()}] File upload sync failed`, {
      path: params.displayPath,
      status: response.status,
      errorText,
    });
  }
}

async function sendFileDelete(params: { displayPath: string; agentToken: string }) {
  if (!GATEWAY_BASE_URL) return;

  const response = await fetch(`${GATEWAY_BASE_URL}/api/daytona/files`, {
    method: 'DELETE',
    headers: {
      Authorization: params.agentToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ displayPath: params.displayPath }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'unknown error');
    console.warn(`[${new Date().toISOString()}] File delete sync failed`, {
      path: params.displayPath,
      status: response.status,
      errorText,
    });
  }
}

function bufferToArrayBuffer(buffer: Buffer) {
  const view = Uint8Array.from(buffer);
  return view.buffer;
}

function isAgentSdkMessage(payload: unknown): payload is { type: string } {
  return Boolean(payload && typeof (payload as { type?: unknown }).type === 'string');
}

async function sendAgentMessageToStream(params: {
  stream: EventSink;
  sessionId: string;
  sdkSessionId?: string;
  message: unknown;
  timestamp: string;
}) {
  const sanitizedMessage = sanitizePayload(params.message) as unknown;
  const messageType = isAgentSdkMessage(sanitizedMessage) ? sanitizedMessage.type : 'unknown';

  await appendJsonEvent(params.stream, {
    type: 'agent_message',
    sessionId: params.sessionId,
    sdkSessionId: params.sdkSessionId,
    messageType,
    message: sanitizedMessage,
    timestamp: params.timestamp,
  });
}

async function appendJsonEvent(stream: EventSink, payload: Record<string, unknown>, retryCount = 0) {
  if (retryCount === 0) {
    recordLocalEvent(stream.sessionId, stream.streamName, payload);
  }

  if (stream.kind === 'local') {
    if (retryCount === 0) {
      console.log(
        `[${new Date().toISOString()}] ✅ LOCAL - Event ${payload.type} stored for session ${stream.sessionId}`,
      );
    }
    return;
  }

  const maxRetries = 5;  // Increased from 3 to 5
  const baseDelay = 1000; // Base delay: 1 second
  const retryDelay = baseDelay * Math.pow(2, retryCount); // Exponential backoff: 1s, 2s, 4s, 8s, 16s

  try {
    const content = JSON.stringify(payload);
    const record = AppendRecord.make(content, {
      'content-type': 'application/json',
      'event-type': String(payload.type ?? 'event'),
    });

    if (retryCount > 0) {
      console.log(`[${new Date().toISOString()}] 🔄 S2 - Retry #${retryCount} pour événement ${payload.type}`);
    }

    await stream.stream.append(record);

    if (retryCount === 0) {
      console.log(`[${new Date().toISOString()}] ✅ S2 - Événement ${payload.type} envoyé avec succès`);
    } else {
      console.log(`[${new Date().toISOString()}] ✅ S2 - Événement ${payload.type} envoyé après ${retryCount} retry(s)`);
    }
  } catch (error: any) {
    const isNetworkError = error?.code === 'UND_ERR_SOCKET' || error?.cause?.code === 'UND_ERR_SOCKET' || error?.message?.includes('fetch failed');

    if (isNetworkError && retryCount < maxRetries) {
      console.warn(`[${new Date().toISOString()}] ⚠️ S2 - Erreur réseau, retry ${retryCount + 1}/${maxRetries} dans ${retryDelay}ms...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      return appendJsonEvent(stream, payload, retryCount + 1);
    }

    console.error(`[${new Date().toISOString()}] 💥 S2 - ERREUR lors de l'envoi événement ${payload.type}:`, error);
    throw error;
  }
}

function sanitizePayload<T>(value: T): T {
  try {
    return JSON.parse(
      JSON.stringify(value, (_key, jsonValue) => (typeof jsonValue === 'bigint' ? jsonValue.toString() : jsonValue)),
    );
  } catch {
    return value;
  }
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack,
    };
  }

  if (typeof error === 'string') {
    return { message: error };
  }

  return { message: 'Unknown error' };
}










