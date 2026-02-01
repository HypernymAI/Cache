# AutoFork Console - Project History

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

## Next Steps

### Small (Quick Wins)
- [ ] Clean up blocker detection — filter out console output, JSON, etc.
- [ ] Better labeling in UI — distinguish "Original Task" vs "Recent Activity"
- [ ] Remove debug console.log statements
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
