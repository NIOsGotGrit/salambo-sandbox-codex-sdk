#!/bin/bash
# Start the API server (foreground) - v1.0.4

export PORT=${PORT:-3000}
echo "Starting Agent API on port $PORT..."
npm run start
