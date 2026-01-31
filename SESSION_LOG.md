# AutoFork Console - Session Log

## Project Overview
A single-page tool for managing agent memory across long coding sessions. Detects when to "fork" (start fresh with a compact summary) and generates resume prompts to carry forward essential state.

## Completed This Session

### 1. Core Implementation (`app/page.tsx`)
- Transcript input with token estimation
- Anchor extraction (goals, plans, constraints, blockers)
- Fork detection signals:
  - **Success**: "deployed", "tests passed", "merged", etc.
  - **Drift**: "ignore that", "start over", repeated errors
  - **Token limit**: Configurable threshold (default 64k)
- Resume prompt generation with gold anchor fallback
- localStorage persistence for all state
- Load Transcript button (loads sample from `/public/transcripts/`)

### 2. Project Setup
- Next.js 14 + TypeScript + Tailwind
- Vercel-ready (build passes)
- GitHub repo: `HypernymAI/autofork-console` (private)

### 3. Claudestorm Integration Prep
- Created branch `autofork-integration` in claudestorm repo
- Explored claudestorm codebase - identified key integration points:
  - Session parsing (JSONL → structured data)
  - Conversation analysis (8 dimensions including error_cascade)
  - LMDB fast path for real-time data
  - Float processing pipeline

## Architecture Decisions
- Fork threshold: 64k tokens (was 6k, updated per user feedback)
- Threshold is user-configurable via UI
- All state in localStorage (no backend needed for MVP)

## Files Structure
```
hackathon_site/
├── app/
│   ├── page.tsx          # Main component (all logic)
│   ├── layout.tsx        # Root layout
│   └── globals.css       # Tailwind + custom scrollbar
├── public/
│   └── transcripts/
│       └── spacecar_excerpt_80k.txt  # Sample transcript
├── package.json
├── tsconfig.json
├── next.config.js
├── tailwind.config.js
└── postcss.config.js
```

## Session 1 Final Changes

### Added Claudestorm Integration
1. **Created `core/autofork_api.py` in claudestorm** (`autofork-integration` branch)
   - `GET /api/autofork/health` - Health check
   - `GET /api/autofork/sessions` - List active sessions
   - `GET /api/autofork/session/{id}` - Session detail with analysis
   - `GET /api/autofork/session/{id}/anchor` - Pre-computed anchor data
   - Runs on port 8100

2. **Updated AutoFork Console to consume API**
   - Auto-detects claudestorm connection (polls every 30s)
   - Session dropdown when connected
   - "Fetch Session" button creates anchor from API data
   - Uses claudestorm's conversation analysis (error_cascade, semantic_coherence)
   - Smarter drift/success detection via API signals

### To Run the Integration
```bash
# Terminal 1: Start claudestorm API
cd ~/Desktop/source/claudestorm
python -m uvicorn core.autofork_api:app --port 8100

# Terminal 2: Start AutoFork Console
cd ~/Desktop/source/hackathon_site
npm run dev
```

## Next Steps

### Immediate (Next Session)
1. Test the integration end-to-end (start claudestorm API, verify sessions appear)
2. Push claudestorm changes (review `autofork-integration` branch, merge if ready)
3. Polish UI (better session display with project name, loading states, error handling)
4. Deploy to Vercel for demo

### Future
- WebSocket for real-time session updates
- Auto-trigger fork when claudestorm detects drift
- Gold anchor sync across sessions
- Export anchors to file for external tools

## Integration Points in Claudestorm

Key files:
- `core/autofork_api.py` (NEW - created this session) - FastAPI endpoints for AutoFork
- `core/databases/session_database.py` - session queries (read-only access)
- `core/conversation_analysis/` - 8-dimension analysis (error_cascade, semantic_coherence, etc.)

Key data available:
- `SessionState` - tokens, timestamps, files touched
- Conversation analysis - error_cascade, lexical_diversity, semantic_coherence
- Float status - completion stages, proofs

## Running Locally
```bash
cd ~/Desktop/source/hackathon_site
npm run dev  # localhost:3000
```

## Git Status
- hackathon_site: `main` branch, pushed to HypernymAI/autofork-console
- claudestorm: `autofork-integration` branch, local only (not pushed)
