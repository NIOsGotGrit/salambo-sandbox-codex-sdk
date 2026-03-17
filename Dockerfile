# Use Node.js because salambo-codex-agent-sdk targets Node >= 20
FROM node:20-slim

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install
RUN find /app/node_modules -path '*/salambo-codex-bin-*/bin/*' -type f -exec chmod 755 {} \;

# Copy source + harness config for build
COPY src ./src
COPY harness-config ./harness-config
COPY scripts ./scripts
COPY tsconfig.json ./

# Build TypeScript
RUN npm run build

# Materialize docker build inputs from harness-config/docker.ts
RUN node --import tsx scripts/materialize-image-config.mjs /tmp/image-config

# Install harness system packages
RUN apt-get update && \
    grep -Ev '^\s*(#|$)' /tmp/image-config/apt-packages.txt | xargs -r apt-get install -y && \
    rm -rf /var/lib/apt/lists/*

# Install harness npm tools
RUN if grep -Eq '\S' /tmp/image-config/npm-tools.txt; then \
      grep -Ev '^\s*(#|$)' /tmp/image-config/npm-tools.txt | xargs -r npm install -g; \
    fi

# Install harness bootstrap script
RUN sed -i 's/\r$//' /tmp/image-config/bootstrap.sh && chmod +x /tmp/image-config/bootstrap.sh && /tmp/image-config/bootstrap.sh

# Create workspace directory
RUN mkdir -p /workspace && chown -R node:node /workspace

# Create isolated Python environment (PEP 668 compliant)
RUN python3 -m venv /opt/pyenv
ENV PATH="/opt/pyenv/bin:${PATH}"

# Install Python packages
RUN if grep -Eq '\S' /tmp/image-config/requirements.txt; then \
      pip install --no-cache-dir -r /tmp/image-config/requirements.txt; \
    fi

# Copy initial workspace files
COPY --chown=node:node harness-config/initial-workspace/ /workspace/

# Copy startup script
COPY start.sh /app/start.sh
RUN sed -i 's/\r$//' /app/start.sh && chmod +x /app/start.sh

# Switch to non-root user
USER node

ENV WORKSPACE_DIR=/workspace
ENV CODEX_HOME=/home/node/.codex-sandbox
ENV NODE_ENV=production

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

CMD ["/app/start.sh"]
