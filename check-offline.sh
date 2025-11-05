#!/bin/bash
# Offline Project Health Check
# Run this to verify what's working without network dependencies

echo "🔍 WMS Project - Offline Health Check"
echo "====================================="

# Check project structure
echo -e "\n📁 Project Structure:"
if [ -d "src/requests" ] && [ -d "src/inventory" ] && [ -d "src/logistics" ] && [ -d "src/shared" ]; then
    echo "✅ Backend structure complete"
else
    echo "❌ Backend structure missing"
fi

if [ -d "frontend/src" ] && [ -d "mobile-scanner/src" ]; then
    echo "✅ Frontend structures complete"
else
    echo "❌ Frontend structures missing"
fi

if [ -d "tests/unit" ] && [ -d "tests/integration" ]; then
    echo "✅ Test structure complete"
else
    echo "❌ Test structure missing"
fi

# Check key files exist
echo -e "\n📄 Key Implementation Files:"
key_files=(
    "src/main.py"
    "src/requests/schemas/catalog.py"
    "src/requests/schemas/request.py"
    "src/requests/routers/catalog.py"
    "src/requests/routers/request.py"
    "src/shared/firebase/client.py"
    "src/shared/storage/r2_client.py"
    "frontend/src/App.tsx"
    "frontend/src/pages/CatalogPage.tsx"
    "frontend/src/components/CartDrawer.tsx"
    "Dockerfile"
    "docker-compose.yml"
    ".dockerignore"
)

for file in "${key_files[@]}"; do
    if [ -f "$file" ]; then
        echo "✅ $file"
    else
        echo "❌ $file"
    fi
done

# Check Python environment (basic)
echo -e "\n🐍 Python Environment:"
if command -v python &> /dev/null; then
    echo "✅ Python available: $(python --version 2>&1)"
else
    echo "❌ Python not found"
fi

# Check Node environment  
echo -e "\n📦 Node Environment:"
if command -v node &> /dev/null; then
    echo "✅ Node available: $(node --version)"
else
    echo "❌ Node not found"
fi

if command -v npm &> /dev/null; then
    echo "✅ npm available: $(npm --version)"
else
    echo "❌ npm not found"
fi

# Check conda environment
echo -e "\n🔬 Conda Environment:"
if command -v conda &> /dev/null; then
    echo "✅ Conda available"
    if conda env list | grep -q "wms-python311"; then
        echo "✅ wms-python311 environment exists"
    else
        echo "❌ wms-python311 environment not found"
    fi
else
    echo "❌ Conda not found"
fi

# Basic syntax checks (if possible)
echo -e "\n🔧 Syntax Validation:"

# Check Python syntax for main files
if command -v python &> /dev/null; then
    if python -m py_compile src/main.py 2>/dev/null; then
        echo "✅ src/main.py syntax OK"
    else
        echo "❌ src/main.py syntax error"
    fi
    
    if python -m py_compile src/shared/config.py 2>/dev/null; then
        echo "✅ src/shared/config.py syntax OK"
    else
        echo "❌ src/shared/config.py syntax error"
    fi
fi

# Check TypeScript/React syntax (basic)
if [ -f "frontend/src/App.tsx" ]; then
    if grep -q "import.*{.*}" frontend/src/App.tsx; then
        echo "✅ frontend/src/App.tsx has proper imports"
    else
        echo "⚠️ frontend/src/App.tsx missing imports"
    fi
fi

# Check package files
echo -e "\n📋 Package Configuration:"
if [ -f "requirements.txt" ]; then
    echo "✅ requirements.txt exists ($(wc -l < requirements.txt) packages)"
else
    echo "❌ requirements.txt missing"
fi

if [ -f "frontend/package.json" ]; then
    echo "✅ frontend/package.json exists"
else
    echo "❌ frontend/package.json missing"
fi

if [ -f "mobile-scanner/package.json" ]; then
    echo "✅ mobile-scanner/package.json exists"
else
    echo "❌ mobile-scanner/package.json missing"
fi

echo -e "\n🚀 Next Steps:"
echo "1. Restore network connectivity"
echo "2. Run: pip install --default-timeout=120 --no-cache-dir -r requirements.txt"
echo "3. Run: npm install in frontend/ and mobile-scanner/"
echo "4. Execute: PYTHONPATH=. pytest -v"
echo "5. Test: npm run build and npm run lint"
echo ""
echo "📖 See NETWORK_RECOVERY.md for detailed recovery steps"