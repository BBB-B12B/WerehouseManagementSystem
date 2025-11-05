#!/bin/bash
# WMS Development Environment Setup Script

echo "🚀 Setting up WMS development environment..."

# Activate conda environment with Python 3.11
if command -v conda &> /dev/null; then
    echo "📦 Activating Python 3.11 conda environment..."
    conda activate wms-python311
    echo "✅ Python version: $(python --version)"
fi

# Switch to Node.js 20 if using nvm
if command -v nvm &> /dev/null; then
    echo "📦 Switching to Node.js 20..."
    nvm use 20
    echo "✅ Node version: $(node --version)"
fi

# Ensure Poetry is in PATH
export PATH="$HOME/.local/bin:$PATH"

echo "🛠️  Development tools:"
echo "  - Poetry: $(poetry --version 2>/dev/null || echo 'Not found')"
echo "  - FastAPI: $(poetry run python -c 'import fastapi; print(f\"Version {fastapi.__version__}\")' 2>/dev/null || echo 'Not found')"
echo "  - Python: $(poetry run python --version 2>/dev/null || echo 'Not found')"

echo ""
echo "🏗️  Project commands:"
echo "  Backend server:    poetry run uvicorn src.main:app --reload"
echo "  Frontend dev:      cd frontend && npm run dev"
echo "  Mobile scanner:    cd mobile-scanner && npx expo start"
echo "  Run tests:         poetry run pytest"
echo "  Format code:       poetry run black src tests"
echo "  Lint code:         poetry run ruff check src tests"
echo ""
echo "✨ Environment ready! Happy coding!"/