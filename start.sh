#!/bin/bash
# Start the API server (foreground) - v2.0.0

export PORT=${PORT:-3000}
export CODEX_HOME=${CODEX_HOME:-/home/node/.codex-sandbox}

mkdir -p "$CODEX_HOME"

if [ ! -f "$CODEX_HOME/config.toml" ] && [ -f /app/sandbox/codex-home/config.toml ]; then
  cp /app/sandbox/codex-home/config.toml "$CODEX_HOME/config.toml"
fi

if [ -n "${OPENAI_API_KEY:-}" ] && [ ! -f "$CODEX_HOME/auth.json" ]; then
  node -e 'const fs=require("fs"); const path=require("path"); const home=process.env.CODEX_HOME; const file=path.join(home,"auth.json"); fs.mkdirSync(home,{recursive:true}); fs.writeFileSync(file, JSON.stringify({ OPENAI_API_KEY: process.env.OPENAI_API_KEY }, null, 2));'
fi

echo "Starting Agent API on port $PORT..."
node dist/src/server.js
