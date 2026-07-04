# AI Video Dubber Pro — Clean Source Project

This is the cleaned and refactored development repository for **AI Video Dubber Pro**. All legacy codebases, PyInstaller temporary outputs, cache files, and experimental logs have been removed for an extremely clean and lightweight source layout.

## 📂 Project Structure

```
AI_Video_Dubber_Clean/
├── backend/            # FastAPI python application server code
├── frontend/           # React typescript UI client code
├── docs/               # System documentation & reports
├── models/             # Local machine learning models cache
├── icons/              # SVG / branding graphic assets
├── scripts/            # Background worker scripts and build automation helpers
├── requirements.txt    # Python runtime requirements (FastAPI, uvicorn, edge-tts, pydub, deep-translator)
├── package.json        # Unified root npm run commands
├── .gitignore          # Standard repository version control ignore rules
└── README.md           # This startup guide
```

## 🚀 Getting Started

### 1. Backend Setup
Create a Python virtual environment and install the dependencies:
```bash
python -m venv venv
source venv/Scripts/activate
pip install -r requirements.txt
```

### 2. Frontend Setup
Install frontend npm packages and compile the static assets:
```bash
npm install --prefix frontend
npm run build --prefix frontend
```

### 3. Run the Development Server
```bash
python -m uvicorn backend.app:app --host 127.0.0.1 --port 8765 --reload
```
Go to `http://127.0.0.1:8765/` in your browser.
