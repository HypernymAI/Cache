# Caché

**Self-improving agents through cached successes.**

Agents forget everything between sessions. Caché captures what works and makes it queryable—so future agents start smarter.

## The Problem

- AI agents lose context between sessions (token limits, no memory)
- Successful patterns vanish—every session starts from scratch
- Teams repeat the same mistakes; agents never learn from wins

## The Solution

```
Agent succeeds → Caché detects → Push to Weave → Future agents query via MCP
```

Caché creates a feedback loop where:
1. **Claudestorm** monitors agent sessions for success signals (commits, deploys, tests)
2. **Caché** captures and categorizes successful patterns
3. **Weave (W&B)** stores patterns org-wide
4. **MCP** lets any agent query "what worked before"

## Quick Demo

```bash
# Just run:
npm install && npm run dev

# Open demo mode:
open http://localhost:3000?demo=true
```

Demo mode shows:
- The self-improving loop visualization
- Live event detection (events animate in)
- Sample MCP queries showing what agents retrieve
- Org cache statistics

## Live Mode (with Claudestorm)

```bash
# Terminal 1: Claudestorm API
cd ~/Desktop/source/claudestorm
CLAUDESTORM_DB_DIR=. .venv/bin/python -m uvicorn core.autofork_api:app --port 8100

# Terminal 2: Caché
npm run dev
open http://localhost:3000
```

Live mode monitors real Claude Code sessions and pushes actual successes to Weave.

## Tech Stack

- **Frontend**: Next.js 14, React 18, TypeScript, Tailwind CSS
- **Backend**: Next.js API routes + Python (Weave SDK)
- **Detection**: Claudestorm API for session monitoring
- **Storage**: W&B Weave for org-wide patterns
- **Retrieval**: W&B MCP Server for agent queries

## Key Features

- **Auto-detection**: Commits, deploys, tests, "magic" keywords
- **Auto-push**: No approval needed—successes go straight to Weave
- **Multi-session**: Watches all active sessions simultaneously
- **Categorization**: Patterns tagged by type (deploy, auth, bugfix) and tech stack
- **MCP Ready**: Patterns immediately queryable via `wandb-mcp-server`

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   Claude Code ←───────── MCP ←───────── Weave              │
│   (agent working)    (query patterns)   (org store)        │
│        │                                    ↑               │
│        ↓                                    │               │
│   Claudestorm ──────→ Caché ────────────────┘               │
│   (track sessions)    (detect & push)                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Files

```
app/page.tsx                              # Main UI
app/api/push-to-weave/route.ts            # Push to Weave
app/api/weave-history/route.ts            # Fetch from Weave
app/api/success-events/[sessionId]/route.ts  # Success detection
scripts/push_to_weave.py                  # Weave SDK integration
```

## Why This Matters

Every agent session is a learning opportunity. Caché ensures those lessons aren't lost—they compound. The more agents use it, the smarter they all become.

---

Built for W&B Hackathon 2025
