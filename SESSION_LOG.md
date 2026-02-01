# Caché - Project History

## Why We're Building This

**Hackathon project** showcasing Claudestorm's value proposition:
- Agents forget everything between sessions
- Successful patterns vanish into token limits
- Every new session starts from scratch

**The pitch**: Cache what works. Surface it later. Agents get better over time.

**Claudestorm** does the heavy lifting (tracking, compression). **Caché** is the showcase UI that demonstrates the value of org-wide pattern caching.

---

## Resume Prompt (Start Here)

```
#magic #venus Continue work on Caché.

## What This Is
Hackathon project: Self-improving agents through cached successes.
Flow: Agent wins → Caché detects → Auto-push to Weave → Future agents query what worked

## Current State (Session 6 complete)
- Frontend: Next.js at localhost:3000 (judge-ready!)
- Backend: Claudestorm API at localhost:8100
- Storage: Weave (W&B) - WORKING, pushes confirmed

## What Works
✅ Demo mode (?demo=true) - ENHANCED for judges
✅ Visual "How It Works" loop diagram with animated arrows
✅ MCP Query demo showing what agents retrieve
✅ Live event animation in demo mode (events appear dynamically)
✅ Real-time session monitoring (watches all Claudestorm sessions)
✅ Master ticker showing commits/tests/deploys/builds/magic
✅ Auto-push to Weave on magic keywords + git commits
✅ Weave History panel pulling REAL data from Weave API
✅ Org Cache stats (patterns/commits/magic/gold/tokens)
✅ Contributions trophy case with gold ⭐ and undo
✅ Enhanced footer with tech badges
✅ README.md for judges

## For Judges
Open http://localhost:3000?demo=true to see:
1. The self-improving loop visualization (top)
2. Live events appearing in the ticker
3. MCP Query demo showing agent retrieval
4. Org cache statistics

## Run Commands
Terminal 1: cd ~/Desktop/source/claudestorm && CLAUDESTORM_DB_DIR=. .venv/bin/python -m uvicorn core.autofork_api:app --port 8100
Terminal 2: cd ~/Desktop/source/hackathon_site && npm run dev

## Key Files
- app/page.tsx - Main UI
- app/api/push-to-weave/route.ts - Push patterns to Weave
- app/api/weave-history/route.ts - Fetch history from Weave
- app/api/success-events/[sessionId]/route.ts - Detect success events
- README.md - Quick start for judges
```

---

## Session 6 Summary (2026-02-01 morning)

### Focus: Judge-Friendly Demo Mode

Since Claudestorm won't be shared, made demo mode the star of the show.

### Added

**Visual Loop Diagram**
- 5-step animated flow: Agent Works → Caché Detects → Push to Weave → Agents Query → Better Results
- Colored arrows with staggered pulse animations
- Loop-back arrow showing the cycle

**MCP Query Demo Section**
- Shows 3 sample queries ("How to deploy Next.js?", "Fix OAuth token refresh", etc.)
- Displays pattern results with type badges and usage counts
- Explains what agents actually retrieve from the cache

**Live Demo Animation**
- Events now appear dynamically in demo mode (4-7 second intervals)
- Toast notifications when new events detected
- Creates sense of "live" activity for judges

**Enhanced Header**
- Bigger, bolder title
- Improved tagline: "Agents that learn from wins"

**Enhanced Footer**
- Styled integration badges (Claudestorm, W&B Weave, MCP)
- Tech stack pills (Next.js, TypeScript, Tailwind, Python)
- Demo mode notice

**README.md**
- Quick start guide for judges
- Architecture diagram
- Feature list and file structure

**CSS Animations**
- Arrow flow animation for loop diagram
- Highlight animation for new events
- Glow pulse for active elements

### Files Changed
```
app/page.tsx           - Loop diagram, MCP demo, live animations, enhanced UI
app/globals.css        - New animations (arrow-flow, highlight-new, glow-pulse)
README.md              - NEW: Quick start for judges
SESSION_LOG.md         - This update
```

---

## Session 5 Summary (2026-02-01 ~3-4AM)

### Fixed Critical Bug
- Python boolean `false` vs `False` was breaking ALL Weave pushes for 12+ hours
- Now auto-push works on magic keywords and git commits

### Added
- `/api/weave-history` endpoint - fetches real data from Weave API
- Weave History panel in UI showing actual pushed patterns
- Auto-push deduplication (pushedEventsRef) to prevent spam
- Sorted Weave history newest-first
- Filter mock demo data from localStorage in real mode

### Files Changed
```
app/page.tsx - Auto-push logic, Weave history display, deduplication
app/api/push-to-weave/route.ts - Fixed Python boolean
app/api/weave-history/route.ts - NEW: Fetch from Weave
```

---

## Previous: Session 4 Summary

```
#magic Continue work on Caché (renamed from AutoFork Console).

## What This Is
Hackathon project: Self-improving agents through cached successes.
Flow: Agent wins → Caché detects → User approves → Weave stores → Future agents query what worked

## Current State
- Frontend: Next.js app at localhost:3000
- Backend: Claudestorm API at localhost:8100
- Storage: Weave (W&B) for patterns

## Run Commands
Terminal 1: cd ~/Desktop/source/claudestorm && CLAUDESTORM_DB_DIR=. .venv/bin/python -m uvicorn core.autofork_api:app --port 8100
Terminal 2: cd ~/Desktop/source/hackathon_site && npm run dev

## Technical Audit (Session 4)

### Data Sources Available

**Claudestorm API (localhost:8100)**
- GET /api/autofork/sessions?limit=10 → {session_id, message_count, total_tokens, last_timestamp, summary}
- GET /api/autofork/session/{id} → {stats, analysis.scores, drift_signals, success_signals, should_fork, error_count}
- GET /api/autofork/session/{id}/anchor → {goal, session_summary, recent_user_messages, recent_assistant_messages, blockers, files_touched, recent_tools}

**Local API (Next.js)**
- GET /api/success-events/{sessionId} → detects: git_commit, tests_passed, deploy_success, build_success, user_confirmation (magic keyword)
- POST /api/push-to-weave → accepts {anchor: {input, output, success_type, tokens, is_gold, session_id}} → pushes to Weave

### State Tracked (app/page.tsx)
- claudestormSessions (live) - sessions from API
- eventTicker (persisted) - detected events across all sessions
- pendingAnchors (live) - anchors awaiting user review
- anchors (persisted) - approved anchors
- eventLog (persisted) - weave push history

### Current UI Sections
1. Header - connection status, pending count
2. Sessions panel - session badges, stats counters (commits/tests/deploys/builds/magic), master ticker
3. Review Queue - approve/gold/discard anchors → pushes to Weave on approve
4. Event Log - shows WEAVE_PUSH messages

### Unused Data We Could Display
From Claudestorm (fetched but not shown):
- analysis.scores - 8-dimension conversation analysis
- drift_signals - session going off track warnings
- success_signals - positive indicators
- should_fork - recommendation to start new session
- blockers - current errors/issues
- recent_tools - tool usage counts
- files_touched - files being edited

### What's Missing for Hackathon Demo
- No visualization of the self-improving loop
- No Weave query demo (showing patterns coming back to agents)
- No session health/quality indicators
- Stats are just numbers, no charts/graphs
- No "before/after" showing agent improvement

Read full context: SESSION_LOG.md
```

---

## What This Is
A **self-improving agent memory system** — not just session management, but a learning layer that:

1. **Tracks positive outcomes** — Captures what works when agents succeed (deploys, tests pass, features complete)
2. **Compresses successful patterns** — Turns verbose transcripts into compact, reusable templates
3. **Builds a behavior cache** — Library of "good examples" that future sessions can reference
4. **Feeds back into agents** — Resume prompts that include proven approaches, not just raw context

The goal: Agents that get better over time by learning from their own successes.

---

## Session 1 Summary (2026-01-31)

### What We Built

**AutoFork Console (`hackathon_site/`)**
- Single-page Next.js app at `app/page.tsx`
- Transcript input with token estimation
- Anchor extraction (goals, plans, constraints, blockers)
- Fork detection: success signals, drift signals, token threshold (64k configurable)
- Gold anchor marking for stable checkpoints
- Resume prompt generation with recovery rules
- localStorage persistence
- Live Claudestorm integration with session dropdown

**Claudestorm API (`claudestorm/core/autofork_api.py`)**
- `GET /api/autofork/health` — Health check
- `GET /api/autofork/sessions` — List active sessions with token counts
- `GET /api/autofork/session/{id}` — Session detail with conversation analysis
- `GET /api/autofork/session/{id}/anchor` — Rich anchor data extraction
- Pulls: recent user messages, assistant messages, files touched, blockers, drift/success signals
- Uses claudestorm's 8-dimension conversation analysis

### Current State
- **Working**: API returns rich data, frontend displays it, anchors are created
- **GitHub**: `HypernymAI/autofork-console` (private)
- **Claudestorm branch**: `autofork-integration` (not pushed yet)

### Known Issues
1. **Blocker detection is noisy** — picks up console output as "errors"
2. **No auto-anchoring** — requires manual "Create Anchor" click
3. **Goal always shows first message** — by design, but could be confusing

---

## Session 2 Summary (2026-01-31)

### What We Built: Success Capture (Auto-Anchoring)

**Claudestorm API - Success Events Endpoint** (`autofork_api.py`)
- `GET /api/autofork/session/{id}/success-events` - Detects success events
- Detection types:
  - `git_commit` — Successful git commits via Bash tool
  - `tests_passed` — Test suite completions (pytest, jest patterns)
  - `deploy_success` — Deployment completions (vercel, netlify, URLs)
  - `user_confirmation` — User saying done/thanks/perfect
  - `build_success` — Build completions
- Returns confidence scores and auto-anchor recommendations
- Supports `since_timestamp` parameter for polling only new events

**Frontend - Auto-Anchor System** (`page.tsx`)
- Auto-anchor toggle in header (enabled by default)
- Polls success-events endpoint every 15 seconds when session selected
- Automatically creates anchors when success events detected
- Auto-marks as "gold" when strong signals (deploy, multiple events)
- Toast notifications for auto-created anchors
- Success events indicator showing recent detected events
- Reset timestamp on session change to avoid duplicate anchors

**Cleaned Up**
- Removed debug console.log statements
- Added CSS animations for notifications

### The Learning Loop Progress
```
[x] Session succeeds → Capture what worked (SUCCESS CAPTURE - DONE)
[x] Auto-detect success → deterministic fallback (SESSION 3)
[x] Auto-push to Weave → on gold anchors (SESSION 3)
[ ] Compress to pattern (Neptune/Claudestorm handles this)
[ ] MCP query → agents retrieve patterns from Weave
```

---

## Session 4 Summary (2026-02-01)

### What We Built

**Rebranded to Caché** - cleaner name for hackathon

**Multi-session Master Ticker**
- Watches ALL active Claudestorm sessions (not just one)
- Polls every 15 seconds for success events
- Dedupes by content to avoid duplicates
- Persists to localStorage across refreshes
- Shows: timestamp, session label (from summary), event type, details

**Direct Weave Push**
- Review queue for manual curation before pushing
- Approve/Gold/Discard buttons
- Approve → POST to /api/push-to-weave with full anchor payload
- Pushes directly to Weave (not through Claudestorm script)

**"magic" Keyword Trigger**
- Say "magic" anywhere in a message → detected as checkpoint
- Works for session starts (#magic Continue...) and mid-session

**Tightened Success Detection** (app/api/success-events/[sessionId]/route.ts)
- git_commit: requires actual `[branch hash] message` format
- tests_passed: requires count like "5 tests passed"
- deploy_success: requires actual URL (vercel.app, netlify.app)
- build_success: requires timing like "compiled in 2s"
- user_confirmation: just "magic" keyword now

**Cleanup**
- Removed: fork threshold, Latest Anchor panel, Anchor Timeline panel
- Removed: unused handlers (handleMarkGold, handleCopyResume, etc.)
- Simplified header to just connection status + pending count

### Files Changed
```
app/page.tsx                              - Main UI (Caché)
app/api/push-to-weave/route.ts            - Direct anchor push
app/api/success-events/[sessionId]/route.ts - Tightened detection
```

---

## Session 3 Summary (2026-02-01)

### Architecture Clarified

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   Claude Code ←───────── MCP ←───────── Weave              │
│   (agent working)    (query patterns)   (org aggregate)    │
│        │                                    ↑               │
│        ↓                                    │               │
│   Claudestorm ──────→ AutoFork ────────────┘               │
│   (track/compress)    (curate/push)                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

- **Claude Code**: The agent doing work (this session)
- **Claudestorm**: Tracks, categorizes, compresses in background
- **AutoFork Console**: Curates best patterns, pushes to Weave
- **Weave**: Org-wide aggregate store
- **W&B MCP**: Agents query successful patterns (already exists!)

### What We Built

**Local Success Detection** (`app/api/success-events/[sessionId]/route.ts`)
- Fallback when claudestorm endpoint unavailable
- Deterministic pattern matching:
  - `git_commit`: Bash tool + commit output patterns
  - `tests_passed`: "passed", "✓", "0 failed"
  - `deploy_success`: vercel/netlify URLs
  - `user_confirmation`: "done", "thanks", "perfect"
  - `build_success`: "compiled successfully"
- Returns confidence scores + should_auto_anchor flag

**Auto-Push to Weave** (`app/api/push-to-weave/route.ts`)
- Triggers push_to_weave.py script
- Called automatically when gold anchors created
- Manual "→ Weave" button in header

**Enhanced Weave Push** (`scripts/push_to_weave.py`)
- Auto-categorizes anchors:
  - `goal_type`: deploy, testing, auth, api, ui, bugfix, refactor, database, feature
  - `tech_stack`: nextjs, react, typescript, python, etc.
- Makes patterns queryable via W&B MCP

### The Flow (Fully Automatic)
```
Agent works → Success detected → Auto-anchor
                                     ↓
                              Gold marked (strong signals)
                                     ↓
                              Auto-push to Weave
                                     ↓
                              W&B MCP queryable
```

### W&B MCP Integration
The [wandb-mcp-server](https://github.com/wandb/wandb-mcp-server) provides:
- `query_weave_traces_tool` - Query successful patterns
- Agents can ask: "show Next.js deploy patterns"

**Setup** (add to Claude's MCP config or `~/.claude/claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "wandb": {
      "command": "npx",
      "args": ["-y", "@wandb/mcp-server"],
      "env": {
        "WANDB_API_KEY": "your-key-here"
      }
    }
  }
}
```

**Query examples**:
- "Show successful deploy patterns from autofork-console"
- "What commits worked for auth features?"
- "Find patterns with Next.js tech stack"

### Full Loop Validated ✓
```
Claude Code (this session)
    ↓
Claudestorm (tracking in background)
    ↓
AutoFork Console (success detection → auto-anchor)
    ↓
Weave (6 patterns pushed, queryable)
    ↓
MCP query (tested live: returned 5 patterns)
    ↓
Any agent can retrieve "what worked before"
```

---

## Action Plan: Next Steps

### 1. Test Workflows
- [ ] End-to-end test: Start fresh session → do work → commit → verify auto-anchor → verify Weave push
- [ ] Test success detection accuracy: run through 10 real sessions, measure precision/recall
- [ ] Test MCP retrieval: configure wandb-mcp-server, query from fresh Claude session
- [ ] Load test: push 100+ patterns to Weave, verify query performance

### 2. General Polish (Remove Manual Steps)
- [ ] **Auto-session selection**: Pick most recent active session automatically
- [ ] **Remove "→ Weave" button**: Push should be fully automatic on gold anchors (already implemented, just remove manual button?)
- [ ] **Remove session dropdown**: AutoFork should just watch ALL sessions, not require selection
- [ ] **Background polling**: Move from frontend polling to backend event stream
- [ ] **Remove transcript input**: It's a control panel, not an input form - the data comes from Claudestorm

### 3. Smarter Categorization (Claude's Pick)
- [ ] **Pattern similarity on session start**: When new session begins, automatically query Weave for similar past patterns based on initial task description
- [ ] Inject top 3 relevant patterns into the session context
- [ ] Track which injected patterns led to success (feedback loop for the feedback loop)
- [ ] Eventually: embeddings-based similarity instead of keyword matching

### 4. Nice-to-Haves
- [ ] Dashboard view: success rate by goal_type, tech_stack trends
- [ ] Pattern diff: compare two successful patterns
- [ ] Export patterns to markdown for documentation
- [ ] Slack/Discord webhook on gold anchor

---

## Technical Notes

### Why This Architecture?

**Claudestorm** handles the heavy lifting:
- Session tracking (already watching Claude Code)
- Compression (Neptune/hypernym - when available)
- Database storage

**AutoFork Console** is the curation layer:
- Deterministic success detection (fallback when claudestorm endpoint unavailable)
- Quality filter (gold anchors = high confidence successes)
- Weave push (org-wide persistence)

**Weave** is the org memory:
- Cross-user, cross-session patterns
- Already has MCP server (wandb-mcp-server)
- Queryable by any agent

**Key insight**: We don't build the whole platform. We build the glue between existing pieces:
- Claudestorm already tracks → we detect success
- Weave already stores → we push patterns
- MCP already queries → we categorize for retrieval

### Files Added This Session
```
app/api/success-events/[sessionId]/route.ts  - Local success detection
app/api/push-to-weave/route.ts               - Weave push endpoint
mcp-config.json                              - MCP server config
scripts/push_to_weave.py                     - Enhanced with categorization
```

### Success Detection Patterns
```typescript
git_commit:        /\[[\w-]+\s+[\da-f]+\]|committed/
tests_passed:      /(\d+)\s*pass(ed)?|✓|PASS|0 failed/
deploy_success:    /deployed|vercel\.app|netlify\.app/
user_confirmation: /^(done|thanks|perfect|lgtm)$/
build_success:     /compiled successfully|Build succeeded/
```

### Categorization Heuristics
```python
goal_type:  deploy|testing|auth|api|ui|bugfix|refactor|database|feature
tech_stack: nextjs|react|typescript|python|tailwind|sqlite|postgres|docker|vercel|git
```

---

## Weave Integration Plan

### Data Flow Architecture
```
User request → [+ compressed patterns injected] → Agent → Output
                         ↑                              ↓
                    AutoFork                      Weave observes
                    (pattern cache)              (input + output)
```

**Key principle**: Weave sees the **augmented input** (user request + injected patterns) and **output**, not the compression internals.

### Anchor Schema for Weave Export

```typescript
{
  // What Weave sees (public)
  input: string,           // User request + injected patterns (resume prompt)
  output: string,          // What agent produced (success summary)

  // Metadata for filtering
  success_type: string,    // "deploy", "tests_passed", "commit", "user_confirmation"
  project_context: string, // Project name or type
  timestamp: string,       // ISO timestamp
  tokens: number,          // Token count at anchor
  is_gold: boolean,        // Whether marked as stable checkpoint

  // Internal (NOT exposed to Weave)
  compression_id?: string  // Reference to Neptune compression, if available
}
```

### API Endpoint (To Build)
```
GET /api/autofork/anchors/export
```

Returns array of anchors in Weave-friendly format. Filters out compression internals.

Query params:
- `since`: ISO timestamp to get only new anchors
- `gold_only`: Boolean to filter to gold anchors only
- `success_type`: Filter by success type

### Integration Points

1. **AutoFork Console** creates anchors with success events
2. **Neptune** (separately) compresses successful patterns
3. **Export endpoint** provides Weave-friendly format
4. **Weave** pulls input/output pairs for observability
5. **Feedback injection** (future) injects compressed patterns into new session inputs

### What Weave DOES see:
- Augmented inputs (user request + any injected patterns)
- Agent outputs (success summaries, files changed)
- Success metadata (type, timestamp, project)

### What Weave DOES NOT see:
- Raw compression process
- Neptune internals
- Hypernym representations

---

## Next Steps

### Small (Quick Wins)
- [x] Remove debug console.log statements
- [ ] Clean up blocker detection — filter out console output, JSON, etc.
- [ ] Better labeling in UI — distinguish "Original Task" vs "Recent Activity"
- [ ] Commit claudestorm changes and push `autofork-integration` branch
- [ ] Add loading/error states for API failures
- [ ] Truncate long text more gracefully in UI

### Medium (Features)
- [ ] Auto-refresh sessions list (currently manual)
- [ ] Click on timeline anchor to view its details
- [ ] Edit/refine extracted anchor before saving
- [ ] Export anchors to JSON file
- [ ] Session filtering (by project, by token count)

### Big (Architecture)
- [ ] **Auto-anchoring**: Hook into claudestorm events to auto-create anchors on:
  - Git commits
  - Success signals (deploy, tests pass)
  - Token threshold crossed
  - Drift detected
- [ ] **WebSocket**: Real-time updates from claudestorm instead of polling
- [ ] **Anchor diffing**: Show what changed between anchors
- [ ] **Multi-session view**: Compare anchors across different sessions
- [ ] **Integration with Claude Code**: Auto-inject resume prompt on new session

---

## Big Picture Vision

### The Learning Loop
```
Session succeeds → Capture what worked → Compress to pattern → Store in cache → Feed to future sessions
```

### Core Concepts

**1. Positive Outcome Tracking**
- Detect success: deploys, tests pass, PRs merged, user says "done"
- Capture the full context: what was the goal, what approach worked, what files changed
- Tag with metadata: project type, tech stack, problem category

**2. Pattern Compression**
- Use claudestorm's Neptune/hypernym pipeline to compress verbose transcripts
- Extract the "how" not just the "what" — the reasoning, not just the code
- Create reusable templates: "Here's how we typically solve auth issues"

**3. Behavior Cache**
- Library of gold anchors organized by problem type
- Searchable: "How did we handle rate limiting before?"
- Versioned: Track which patterns work best over time

**4. Feedback Loop**
- When starting a new session, search cache for similar problems
- Inject relevant patterns into system prompt or resume prompt
- Agent starts with "Here's what worked before" instead of blank slate

### Integration Points with Claudestorm
- **Float pipeline**: Compress successful sessions into hypernym representations
- **Conversation analysis**: Detect success/failure patterns
- **AST analysis**: Understand code structure of successful changes
- **Lighthouse**: Index and search past successes

### Metrics to Track
- Success rate by problem type
- Time to success with/without cached patterns
- Pattern reuse frequency
- Drift recovery rate (how often gold anchors save sessions)

---

## File Structure

```
hackathon_site/
├── app/
│   ├── page.tsx          # Main component (all logic)
│   ├── layout.tsx        # Root layout
│   └── globals.css       # Tailwind + scrollbar
├── public/
│   └── transcripts/      # Sample data
├── SESSION_LOG.md        # This file
└── [config files]

claudestorm/core/
└── autofork_api.py       # NEW - FastAPI endpoints (on autofork-integration branch)
```

---

## How to Run

```bash
# Terminal 1: Claudestorm API
cd ~/Desktop/source/claudestorm
CLAUDESTORM_DB_DIR=. .venv/bin/python -m uvicorn core.autofork_api:app --port 8100

# Terminal 2: AutoFork Console
cd ~/Desktop/source/hackathon_site
npm run dev
```

Then open http://localhost:3000

---

## API Reference

### GET /api/autofork/sessions
Returns list of active sessions with token counts.

### GET /api/autofork/session/{id}
Returns:
- `stats`: token counts, message count, timestamps
- `analysis`: conversation dimension scores (error_cascade, lexical_diversity, etc.)
- `drift_signals`: ["high_error_cascade", "repeated_errors"]
- `success_signals`: ["success_keywords_detected"]
- `should_fork`: boolean

### GET /api/autofork/session/{id}/anchor
Returns:
- `goal`: Original task (first substantial user message)
- `session_summary`: From claudestorm metadata
- `recent_user_messages`: Last 3 user messages
- `recent_assistant_messages`: Last 3 assistant messages
- `files_touched`: Recently edited files
- `blockers`: Recent error messages
- `recent_tools`: Tool usage counts

### GET /api/autofork/session/{id}/success-events
Query params: `since_timestamp` (optional, for polling new events only)

Returns:
- `events`: List of detected success events, each with:
  - `type`: "git_commit" | "tests_passed" | "deploy_success" | "user_confirmation" | "build_success"
  - `timestamp`: When the event occurred
  - `details`: Description/extracted info
  - `confidence`: 0-1 score
- `event_count`: Total events
- `total_confidence`: Sum of confidence scores
- `should_auto_anchor`: Boolean, true if signals are strong enough
- `should_mark_gold`: Boolean, true for very strong signals (deploy, multiple events)

---

## Resume Prompt Structure

```markdown
## Task
[Session summary if available]

## Current Goal
[Original task/goal]

## Last Stable Checkpoint (Gold Anchor)
[Previous gold anchor summary if exists]

## Files in Progress
- file1.tsx
- file2.py

## Recent Context
Last user request: [most recent user message]

## Current Blockers
1. [error 1]
2. [error 2]

## Next Steps
1. Address blockers
2. Continue work on [file]
3. Verify changes

## Recovery Rule
If you drift or get stuck, restate the goal anchor and continue from the last stable checkpoint.
```
