# Use Node.js because salambo-codex-agent-sdk targets Node >= 20
FROM node:20-slim

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install
RUN find /app/node_modules -path '*/salambo-codex-bin-*/bin/*' -type f -exec chmod 755 {} \;

# Copy source + sandbox config for build
COPY src ./src
COPY sandbox ./sandbox
COPY tsconfig.json ./

# Build TypeScript
RUN npm run build

# Install sandbox system packages
COPY sandbox/docker/apt-packages.txt /tmp/apt-packages.txt
RUN apt-get update && \
    grep -Ev '^\s*(#|$)' /tmp/apt-packages.txt | xargs -r apt-get install -y && \
    rm -rf /var/lib/apt/lists/*

# Install sandbox npm tools
COPY sandbox/docker/npm-tools.txt /tmp/npm-tools.txt
RUN if grep -Eq '\S' /tmp/npm-tools.txt; then \
      grep -Ev '^\s*(#|$)' /tmp/npm-tools.txt | xargs -r npm install -g; \
    fi

# Install sandbox bootstrap script
COPY sandbox/docker/bootstrap.sh /tmp/docker-bootstrap.sh
RUN sed -i 's/\r$//' /tmp/docker-bootstrap.sh && chmod +x /tmp/docker-bootstrap.sh && /tmp/docker-bootstrap.sh

# Create workspace directory
RUN mkdir -p /workspace && chown -R node:node /workspace

# Create isolated Python environment (PEP 668 compliant)
RUN python3 -m venv /opt/pyenv
ENV PATH="/opt/pyenv/bin:${PATH}"

# Install Python packages
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Copy initial workspace files
COPY --chown=node:node sandbox/initial-workspace/ /workspace/

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
