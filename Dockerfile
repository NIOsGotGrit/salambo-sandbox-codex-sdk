# Use Node.js because salambo-codex-agent-sdk targets Node >= 20
FROM node:20-slim

# Install essential development tools
RUN apt-get update && apt-get install -y \
    git \
    python3 \
    python3-venv \
    python3-pip \
    curl \
    vim \
    && rm -rf /var/lib/apt/lists/*

# Create workspace directory and set permissions
RUN mkdir -p /workspace && \
    chown -R node:node /workspace

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Create isolated Python environment (PEP 668 compliant)
RUN python3 -m venv /opt/pyenv
ENV PATH="/opt/pyenv/bin:${PATH}"

# Install Python libraries for office/data workflows
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Copy source code
COPY src ./src
COPY tsconfig.json ./

# Copy initial workspace files (before switching to node user)
COPY --chown=node:node initial-workspace/ /workspace/

# Copy startup script, fix line endings, and make it executable
COPY start.sh /app/start.sh
RUN sed -i 's/\r$//' /app/start.sh && chmod +x /app/start.sh

# Switch to non-root user
USER node

# Set workspace as default directory for agent operations
ENV WORKSPACE_DIR=/workspace
ENV NODE_ENV=production

# Expose API port
EXPOSE 3000

# Health check using curl
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start API server
CMD ["/app/start.sh"]
