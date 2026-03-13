#!/bin/bash
# Salambo Sandbox - Development Environment Setup
# Run this script to set up and verify the development environment

set -e

echo "=== Salambo Sandbox Development Setup (Node) ==="
echo ""

# Check Node.js
echo "1. Checking Node.js..."
if command -v node &> /dev/null; then
    echo "   Node: $(node --version)"
else
    echo "   ERROR: Node.js not found. Install Node.js 20 or newer."
    exit 1
fi

# Install dependencies
echo ""
echo "2. Installing dependencies..."
npm install

# Type check
echo ""
echo "3. Running type check..."
npm run typecheck

echo "   Types OK!"

# Check for .env file
echo ""
echo "4. Checking environment..."
if [ -f ".env" ]; then
    echo "   .env file found"
else
    echo "   WARNING: No .env file found"
    echo "   Copy .env.example to .env and configure:"
    echo "   - OPENAI_API_KEY (usually required for provider=openai)"
    echo "   - S2_ACCESS_TOKEN / S2_BASIN only if you want real S2 streaming"
fi

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Available commands:"
echo "  npm run start       - Run server"
echo "  npm run dev         - Run with hot reload"
echo "  npm run typecheck   - Type check only"
echo ""
echo "Docker commands:"
echo "  npm run docker:build   - Build Docker image"
echo "  npm run compose:up     - Start with docker compose"
