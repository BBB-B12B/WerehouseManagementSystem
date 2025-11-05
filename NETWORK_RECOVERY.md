# WMS Project - Network Recovery Checklist

## 🚨 Current Status
Network connectivity issues are preventing dependency installation from:
- PyPI (Python Package Index) - blocking `pip install`
- npm registry - blocking `npm install`

This affects the ability to install required packages and run development/test commands.

## 📋 Recovery Steps (When Network is Available)

### 1. Backend Python Dependencies
```bash
# Navigate to project root
cd /Volumes/BriteBrain/Projects/WarehouseManagmentSystem

# Activate Python environment
conda activate wms-python311
# OR
eval "$(/Users/dude/anaconda3/bin/conda shell.zsh hook)" && conda activate wms-python311

# Install with extended timeout and no cache to avoid corruption
pip install --default-timeout=120 --no-cache-dir -r requirements.txt

# Verify critical packages
python -c "import fastapi, firebase_admin, pydantic, google.cloud.firestore; print('✅ All critical packages installed')"
```

### 2. Frontend Dependencies  
```bash
cd frontend/

# Install with timeout settings
npm install --timeout=120000

# Verify critical packages
npm list @tanstack/react-query axios dayjs react react-dom

# Test build
npm run build
npm run lint
```

### 3. Mobile Scanner Dependencies
```bash
cd ../mobile-scanner/

# Install with timeout settings  
npm install --timeout=120000

# Verify Expo and React Native packages
npm list expo @react-native-async-storage/async-storage

# Test Expo setup
npx expo doctor
```

### 4. Run Comprehensive Tests

#### Backend Tests
```bash
cd /Volumes/BriteBrain/Projects/WarehouseManagmentSystem

# Run with proper Python path
PYTHONPATH=. pytest -v --tb=short

# Test API server startup
PYTHONPATH=. python -c "
from src.main import app
print('✅ FastAPI app loads successfully')
print('Available routes:')
for route in app.routes:
    if hasattr(route, 'path') and hasattr(route, 'methods'):
        print(f'  {route.methods} {route.path}')
"
```

#### Frontend Tests
```bash
cd frontend/

# Linting (with warnings acceptable for now)
npm run lint 2>&1 | tee lint-results.log

# Build test
npm run build 2>&1 | tee build-results.log

# Unit tests (if configured)
npm test 2>&1 | tee test-results.log
```

#### Mobile Tests
```bash
cd ../mobile-scanner/

# Expo environment check
npx expo doctor 2>&1 | tee expo-doctor.log

# Try starting development server (can cancel quickly)
timeout 10s npx expo start --web || echo "Expo start test completed"
```

### 5. Integration Testing
```bash
cd /Volumes/BriteBrain/Projects/WarehouseManagmentSystem

# Start API server in background
PYTHONPATH=. python -m uvicorn src.main:app --host 0.0.0.0 --port 8000 &
API_PID=$!

# Wait for startup
sleep 3

# Test API endpoints
echo "Testing API endpoints..."
curl -f http://localhost:8000/health && echo "✅ Health endpoint OK"
curl -f http://localhost:8000/api/catalog/categories && echo "✅ Categories endpoint OK"
curl -f http://localhost:8000/api/catalog/items && echo "✅ Items endpoint OK"

# Clean up
kill $API_PID
```

## 🔍 Missing Dependencies to Verify

### Backend (requirements.txt)
- ✅ fastapi==0.110.0
- ✅ uvicorn[standard]==0.27.0  
- ✅ pydantic==2.6.0
- ✅ pydantic-settings==2.2.1
- ✅ firebase-admin==6.4.0
- ✅ httpx==0.27.0
- ✅ python-dotenv==1.0.1
- 🔄 google-cloud-firestore==2.14.0 (needs network)

### Frontend (package.json)
- ✅ @tanstack/react-query
- ✅ axios
- 🔄 dayjs (needs network verification)
- ✅ react, react-dom
- ✅ react-router-dom

### Mobile (package.json)
- ✅ expo
- 🔄 @react-native-async-storage/async-storage (needs network)
- ✅ react-native

## 📊 Expected Test Results

### Passing Tests (when network restored):
1. **Backend**: 3 pytest tests (unit + integration)
2. **API Routes**: 5 endpoints working
3. **Frontend**: Build successful (minor lint warnings OK)
4. **Mobile**: Expo doctor with minimal issues
5. **Integration**: Health check + catalog endpoints responding

### Known Acceptable Issues:
- Frontend lint warnings about TypeScript versions
- Minor Expo warnings about asset files
- Some deprecation warnings (non-blocking)

## 🚨 Troubleshooting Commands

If issues persist after network recovery:

```bash
# Clear npm cache
npm cache clean --force

# Clear pip cache  
pip cache purge

# Reset node_modules
rm -rf frontend/node_modules mobile-scanner/node_modules
rm frontend/package-lock.json mobile-scanner/package-lock.json

# Reinstall Python environment from scratch
conda remove -n wms-python311 --all
conda create -n wms-python311 python=3.11
conda activate wms-python311
pip install -r requirements.txt
```

## ✅ Success Criteria

When network is restored and commands complete successfully:
- [ ] All Python packages install without errors
- [ ] All npm packages install without errors  
- [ ] `pytest -v` shows 3 passing tests
- [ ] API server starts and responds to health check
- [ ] Frontend builds successfully
- [ ] Expo project validates without critical errors

Once these are confirmed, all development phases (T100-T406) can be considered fully verified and ready for production development.