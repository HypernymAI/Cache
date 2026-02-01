"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface Anchor {
  id: string;
  createdAt: string;
  sessionId: string;
  tokenEstimate: number;
  status: "stable" | "drifting" | "success";
  summary: string;
  resumePrompt: string;
  isGold: boolean;
}

interface EventLogEntry {
  id: string;
  timestamp: string;
  message: string;
}

// Claudestorm API types
interface ClaudestormSession {
  session_id: string;
  message_count: number;
  total_tokens: number;
  last_timestamp: string;
  summary: string | null;
}

interface ClaudestormSessionDetail {
  stats: {
    session_id: string;
    message_count: number;
    total_tokens: number;
    first_timestamp: string;
    last_timestamp: string;
  };
  analysis: {
    scores: Record<string, number>;
    sample_size: number;
  } | null;
  error_count: number;
  drift_signals: string[];
  success_signals: string[];
  should_fork: boolean;
}

interface ClaudestormAnchorData {
  session_id: string;
  goal: string;
  session_summary: string | null;
  recent_user_messages: string[];
  recent_assistant_messages: string[];
  blockers: string[];
  files_touched: string[];
  recent_tools: Record<string, number>;
  total_tokens: number;
  summary: string;
}

// Success event types
interface SuccessEvent {
  type: "git_commit" | "tests_passed" | "deploy_success" | "user_confirmation" | "build_success" | "session_start" | "checkpoint" | "issue";
  timestamp: string;
  details: string;
  confidence: number;
  sessionId?: string;
  sessionLabel?: string; // Human-readable session summary
}

interface SuccessEventsResponse {
  session_id: string;
  events: SuccessEvent[];
  event_count: number;
  total_confidence: number;
  should_auto_anchor: boolean;
  should_mark_gold: boolean;
}

// Watched session info
interface WatchedSessionInfo {
  sessionId: string;
  tokens: number;
  messages: number;
  lastActivity: string;
}

const CLAUDESTORM_API = "http://localhost:8100";

function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

// Mock data for demo mode - more impressive for judges
function getMockData() {
  const now = Date.now();
  return {
    sessions: [
      { session_id: "demo-1a2b3c", message_count: 47, total_tokens: 28400, last_timestamp: new Date(now).toISOString(), summary: "Building Caché hackathon UI" },
      { session_id: "demo-4d5e6f", message_count: 23, total_tokens: 14200, last_timestamp: new Date(now - 300000).toISOString(), summary: "Weave API integration" },
      { session_id: "demo-7g8h9i", message_count: 31, total_tokens: 19800, last_timestamp: new Date(now - 600000).toISOString(), summary: "Success event detection" },
      { session_id: "demo-auth01", message_count: 52, total_tokens: 34100, last_timestamp: new Date(now - 900000).toISOString(), summary: "OAuth implementation" },
    ] as ClaudestormSession[],
    events: [
      { type: "git_commit" as const, timestamp: new Date(now).toISOString(), details: "[main a1b2c3d] Auto-push contributions feed", confidence: 0.95, sessionId: "demo-1a2b3c", sessionLabel: "Building Caché..." },
      { type: "deploy_success" as const, timestamp: new Date(now - 45000).toISOString(), details: "https://cache-demo.vercel.app deployed", confidence: 0.98, sessionId: "demo-1a2b3c", sessionLabel: "Building Caché..." },
      { type: "build_success" as const, timestamp: new Date(now - 60000).toISOString(), details: "Compiled successfully in 2.1s", confidence: 0.9, sessionId: "demo-1a2b3c", sessionLabel: "Building Caché..." },
      { type: "user_confirmation" as const, timestamp: new Date(now - 120000).toISOString(), details: "magic - checkpoint confirmed", confidence: 1.0, sessionId: "demo-4d5e6f", sessionLabel: "Weave API..." },
      { type: "git_commit" as const, timestamp: new Date(now - 180000).toISOString(), details: "[main 9f8e7d6] Mock data mode for demos", confidence: 0.95, sessionId: "demo-1a2b3c", sessionLabel: "Building Caché..." },
      { type: "tests_passed" as const, timestamp: new Date(now - 240000).toISOString(), details: "12 tests passed in 3.4s", confidence: 0.92, sessionId: "demo-7g8h9i", sessionLabel: "Success event..." },
      { type: "git_commit" as const, timestamp: new Date(now - 300000).toISOString(), details: "[main 5c4b3a2] Weave push endpoint", confidence: 0.95, sessionId: "demo-4d5e6f", sessionLabel: "Weave API..." },
      { type: "git_commit" as const, timestamp: new Date(now - 420000).toISOString(), details: "[main 8d7c6b5] OAuth token refresh flow", confidence: 0.95, sessionId: "demo-auth01", sessionLabel: "OAuth impl..." },
      { type: "tests_passed" as const, timestamp: new Date(now - 480000).toISOString(), details: "8 tests passed - auth flow complete", confidence: 0.92, sessionId: "demo-auth01", sessionLabel: "OAuth impl..." },
    ] as SuccessEvent[],
  };
}

// Sample MCP query results to show what agents retrieve
function getMockMCPQueryResults() {
  return [
    {
      query: "How to deploy Next.js to Vercel?",
      patterns: [
        { type: "deploy", summary: "Build with `next build`, push to main, Vercel auto-deploys", confidence: 0.94, uses: 12 },
        { type: "config", summary: "Add vercel.json for custom routes, set NODE_ENV=production", confidence: 0.88, uses: 8 },
      ]
    },
    {
      query: "Fix OAuth token refresh",
      patterns: [
        { type: "auth", summary: "Check refresh token before access token expires, use silent refresh in background", confidence: 0.91, uses: 5 },
        { type: "bugfix", summary: "Handle 401 by clearing tokens and redirecting to login", confidence: 0.87, uses: 7 },
      ]
    },
    {
      query: "React component not re-rendering",
      patterns: [
        { type: "bugfix", summary: "Ensure state updates create new object references, not mutations", confidence: 0.96, uses: 23 },
        { type: "refactor", summary: "Use useCallback for handlers passed to child components", confidence: 0.82, uses: 15 },
      ]
    }
  ];
}

export default function Cache() {
  const [anchors, setAnchors] = useState<Anchor[]>([]);
  const [eventLog, setEventLog] = useState<EventLogEntry[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState(() => generateId());
  const [mounted, setMounted] = useState(false);
  const [demoMode, setDemoMode] = useState(false);

  // Claudestorm integration state
  const [claudestormConnected, setClaudestormConnected] = useState(false);
  const [claudestormSessions, setClaudestormSessions] = useState<ClaudestormSession[]>([]);
  const sessionTimestampsRef = useRef<Record<string, string>>({}); // Track last event per session (ref to avoid re-renders)
  const pushedEventsRef = useRef<Set<string>>(new Set()); // Track pushed event IDs
  const pushedEventsLoaded = useRef(false); // Track if we've loaded from localStorage

  // Event tracking state - master ticker across ALL sessions
  const [notification, setNotification] = useState<string | null>(null);
  const [eventTicker, setEventTicker] = useState<SuccessEvent[]>([]); // All events across all sessions (persisted)
  const [contributions, setContributions] = useState<Anchor[]>([]); // Auto-pushed to Weave
  const [weaveHistory, setWeaveHistory] = useState<Array<{id: string; timestamp: string; op_name: string; inputs: Record<string, unknown>; output: unknown}>>([]);

  // Demo mode live simulation state
  const [demoEventIndex, setDemoEventIndex] = useState(0);
  const demoEventsRef = useRef<SuccessEvent[]>([]);

  // Separate mount effect to ensure it always runs
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("demo") === "true") {
      const mock = getMockData();
      setDemoMode(true);
      setClaudestormConnected(true);
      setClaudestormSessions(mock.sessions);
      // Start with just first 3 events, animate the rest
      demoEventsRef.current = mock.events;
      setEventTicker(mock.events.slice(0, 3));
      setDemoEventIndex(3);
    }
    setMounted(true);
  }, []);

  // Demo mode: animate new events appearing
  useEffect(() => {
    if (!demoMode || !mounted) return;
    if (demoEventIndex >= demoEventsRef.current.length) return;

    const timer = setTimeout(() => {
      const nextEvent = demoEventsRef.current[demoEventIndex];
      if (nextEvent) {
        // Update timestamp to "now" for live feel
        const liveEvent = { ...nextEvent, timestamp: new Date().toISOString() };
        setEventTicker(prev => [liveEvent, ...prev]);
        setDemoEventIndex(prev => prev + 1);
        setNotification(`✨ ${nextEvent.type.replace(/_/g, " ")} detected`);
        setTimeout(() => setNotification(null), 2000);
      }
    }, 4000 + Math.random() * 3000); // 4-7 seconds between events

    return () => clearTimeout(timer);
  }, [demoMode, mounted, demoEventIndex]);

  // Load from localStorage after mount (skip in demo mode)
  useEffect(() => {
    if (!mounted) return;
    if (new URLSearchParams(window.location.search).get("demo") === "true") {
      pushedEventsLoaded.current = true; // Demo mode doesn't need localStorage
      return;
    }
    try {
      const savedAnchors = localStorage.getItem("autofork_anchors");
      const savedEventLog = localStorage.getItem("autofork_events");
      const savedSessionId = localStorage.getItem("autofork_sessionId");
      const savedPushed = localStorage.getItem("cache_pushed_events");

      if (savedAnchors) setAnchors(JSON.parse(savedAnchors));
      if (savedEventLog) setEventLog(JSON.parse(savedEventLog));
      if (savedSessionId) setCurrentSessionId(savedSessionId);
      if (savedPushed) pushedEventsRef.current = new Set(JSON.parse(savedPushed));
      pushedEventsLoaded.current = true;
      const savedTicker = localStorage.getItem("cache_ticker");
      if (savedTicker) {
        // Filter out demo data
        const ticker = JSON.parse(savedTicker).filter((e: SuccessEvent) => !e.sessionId?.startsWith("demo-"));
        setEventTicker(ticker);
      }
    } catch (e) {
      console.error("Failed to load from localStorage:", e);
    }
  }, [mounted]);

  useEffect(() => {
    if (mounted) {
      localStorage.setItem("autofork_anchors", JSON.stringify(anchors));
    }
  }, [anchors, mounted]);

  useEffect(() => {
    if (mounted) {
      localStorage.setItem("autofork_events", JSON.stringify(eventLog));
    }
  }, [eventLog, mounted]);

  useEffect(() => {
    if (mounted) {
      localStorage.setItem("autofork_sessionId", currentSessionId);
    }
  }, [currentSessionId, mounted]);

  useEffect(() => {
    if (mounted) {
      localStorage.setItem("cache_ticker", JSON.stringify(eventTicker));
    }
  }, [eventTicker, mounted]);

  // Check claudestorm connection and fetch all sessions
  useEffect(() => {
    if (!mounted) return;
    if (new URLSearchParams(window.location.search).get("demo") === "true") return;
    const checkClaudestorm = async () => {
      try {
        const res = await fetch(`${CLAUDESTORM_API}/api/autofork/health`, {
          method: 'GET',
          signal: AbortSignal.timeout(2000)
        });
        if (res.ok) {
          setClaudestormConnected(true);
          const sessionsRes = await fetch(`${CLAUDESTORM_API}/api/autofork/sessions?limit=10`);
          if (sessionsRes.ok) {
            const data = await sessionsRes.json();
            setClaudestormSessions(data.sessions || []);
          }
        } else {
          setClaudestormConnected(false);
        }
      } catch {
        setClaudestormConnected(false);
      }
    };
    checkClaudestorm();
    const interval = setInterval(checkClaudestorm, 10000);
    return () => clearInterval(interval);
  }, [mounted]);

  // Fetch Weave history
  useEffect(() => {
    if (!mounted || demoMode) return;
    const fetchWeave = async () => {
      try {
        const res = await fetch("/api/weave-history");
        if (res.ok) {
          const data = await res.json();
          if (data.calls) setWeaveHistory(data.calls);
        }
      } catch {
        // Silent fail
      }
    };
    fetchWeave();
    const interval = setInterval(fetchWeave, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [mounted, demoMode]);

  const lastGoldAnchor = anchors.filter((a) => a.isGold)[0] || null;

  // Auto-push contribution to Weave (no approval needed)
  const pushContribution = useCallback(async (sessionId: string, events: SuccessEvent[]) => {
    if (!sessionId || demoMode) return;

    try {
      const [detailRes, anchorRes] = await Promise.all([
        fetch(`${CLAUDESTORM_API}/api/autofork/session/${sessionId}`),
        fetch(`${CLAUDESTORM_API}/api/autofork/session/${sessionId}/anchor`)
      ]);

      if (!detailRes.ok || !anchorRes.ok) return;

      const detail: ClaudestormSessionDetail = await detailRes.json();
      const anchorData: ClaudestormAnchorData = await anchorRes.json();

      const summaryParts: string[] = [];
      if (anchorData.session_summary) {
        summaryParts.push(`TASK: ${anchorData.session_summary.slice(0, 200)}`);
      }
      summaryParts.push(`GOAL: ${anchorData.goal.slice(0, 300)}`);
      if (anchorData.files_touched.length > 0) {
        summaryParts.push(`FILES: ${anchorData.files_touched.join(", ")}`);
      }
      const eventDescriptions = events.map(e => `${e.type}: ${e.details}`).slice(0, 3);
      summaryParts.push(`EVENTS:\n${eventDescriptions.join("\n")}`);

      const newAnchor: Anchor = {
        id: generateId(),
        createdAt: new Date().toISOString(),
        sessionId: sessionId,
        tokenEstimate: detail.stats.total_tokens,
        status: "success",
        summary: summaryParts.join("\n"),
        resumePrompt: "",
        isGold: false,
      };

      // Auto-push to Weave
      const res = await fetch("/api/push-to-weave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          anchor: {
            input: anchorData.goal,
            output: newAnchor.summary,
            success_type: events[0]?.type || "success",
            tokens: newAnchor.tokenEstimate,
            is_gold: false,
            session_id: sessionId,
          }
        })
      });

      if (res.ok) {
        setContributions(prev => [newAnchor, ...prev].slice(0, 20));
        setAnchors(prev => [newAnchor, ...prev]);
        setEventLog(prev => [{
          id: generateId(),
          timestamp: new Date().toISOString(),
          message: `WEAVE_PUSH: ${events[0]?.type} - ${events[0]?.details.slice(0, 40)}`,
        }, ...prev]);
        setNotification("🏆 Pushed to Weave");
        setTimeout(() => setNotification(null), 2000);
      }
    } catch (e) {
      console.error("Failed to push:", e);
    }
  }, [demoMode]);

  // Undo a contribution (remove from list)
  const undoContribution = useCallback((id: string) => {
    setContributions(prev => prev.filter(c => c.id !== id));
    setNotification("Contribution removed");
    setTimeout(() => setNotification(null), 2000);
  }, []);

  // Mark contribution as gold
  const markGold = useCallback((id: string) => {
    setContributions(prev => prev.map(c => c.id === id ? { ...c, isGold: true } : c));
    setAnchors(prev => prev.map(a => a.id === id ? { ...a, isGold: true } : a));
    setNotification("⭐ Marked as gold pattern");
    setTimeout(() => setNotification(null), 2000);
  }, []);

  // Poll ALL sessions for success events - master ticker
  useEffect(() => {
    if (!mounted || !claudestormConnected || claudestormSessions.length === 0) return;

    const checkAllSessions = async () => {
      const newEvents: SuccessEvent[] = [];

      for (const session of claudestormSessions.slice(0, 5)) { // Check top 5 active sessions
        try {
          const lastTs = sessionTimestampsRef.current[session.session_id];
          const url = lastTs
            ? `/api/success-events/${session.session_id}?since_timestamp=${encodeURIComponent(lastTs)}`
            : `/api/success-events/${session.session_id}`;

          const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
          if (!res.ok) continue;

          const data: SuccessEventsResponse = await res.json();

          if (data.events.length > 0) {
            // Create human-readable session label from summary
            const label = session.summary
              ? session.summary.slice(0, 30).replace(/[#\n]/g, '').trim() + '...'
              : session.session_id.slice(0, 8);

            const eventsWithSession = data.events.map(e => ({
              ...e,
              sessionId: session.session_id,
              sessionLabel: label,
            }));
            newEvents.push(...eventsWithSession);
            sessionTimestampsRef.current[session.session_id] = data.events[0].timestamp;
          }
        } catch {
          // Skip this session, try others
        }
      }

      if (newEvents.length > 0) {
        // Dedupe - use timestamp for magic events so each occurrence shows
        const getEventKey = (e: SuccessEvent) =>
          (e.type === "session_start" || e.type === "checkpoint" || e.type === "issue")
            ? `${e.sessionId}-${e.type}-${e.timestamp}`
            : `${e.sessionId}-${e.type}-${e.details}`;
        const existingKeys = new Set(eventTicker.map(getEventKey));
        const uniqueNew = newEvents.filter(e => !existingKeys.has(getEventKey(e)));

        if (uniqueNew.length > 0) {
          setEventTicker(prev => [...uniqueNew, ...prev].slice(0, 50));

          // Auto-push only NEW events that haven't been pushed
          // Wait until localStorage has been loaded to avoid re-pushing on page refresh
          if (!pushedEventsLoaded.current) return;

          // Auto-push NEW events only - use content hash to prevent re-pushing same message
          for (const event of uniqueNew) {
            // Hash the details for deduplication (same content = same hash = don't re-push)
            const contentKey = `${event.sessionId}-${event.type}-${event.details}`;
            if (!pushedEventsRef.current.has(contentKey) &&
                (event.type === "git_commit" || event.type === "session_start" ||
                 event.type === "checkpoint" || event.type === "issue")) {
              pushedEventsRef.current.add(contentKey);
              localStorage.setItem("cache_pushed_events", JSON.stringify(Array.from(pushedEventsRef.current)));
              pushContribution(event.sessionId!, [event]);
            }
          }
        }
      }
    };

    checkAllSessions();
    const interval = setInterval(checkAllSessions, 15000);
    return () => clearInterval(interval);
  }, [mounted, claudestormConnected, claudestormSessions, pushContribution]);



  if (!mounted) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-zinc-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-6 lg:p-8">
      {/* Header */}
      <header className="mb-8 text-center relative">
        <div className="absolute top-0 right-0">
          {!demoMode ? (
            <a href="?demo=true" className="text-xs px-3 py-1.5 bg-violet-900/50 hover:bg-violet-800/50 border border-violet-700/50 rounded-full text-violet-300 transition-colors">
              Demo
            </a>
          ) : (
            <a href="/" className="text-xs px-3 py-1.5 bg-zinc-800/50 hover:bg-zinc-700/50 border border-zinc-700/50 rounded-full text-zinc-400 transition-colors">
              Exit demo
            </a>
          )}
        </div>
        <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-pink-400 via-violet-400 to-sky-400 bg-clip-text text-transparent mb-2">
          Caché
        </h1>
        <p className="text-zinc-400 text-sm md:text-base max-w-lg mx-auto">
          Agents that <span className="text-emerald-400">learn from wins</span>. Every success gets cached. Future agents start smarter.
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
          {demoMode && (
            <span className="inline-flex items-center gap-2 px-3 py-1 bg-violet-900/50 border border-violet-500/50 rounded-full">
              <span className="text-xs text-violet-300">Demo Mode</span>
            </span>
          )}
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-zinc-900 rounded-full border border-zinc-800">
            <span className={`w-2 h-2 rounded-full ${claudestormConnected ? "bg-emerald-500 animate-pulse" : "bg-zinc-600"}`} />
            <span className="text-xs text-zinc-400">{claudestormConnected ? "Connected" : "Offline"}</span>
          </div>
          {contributions.length > 0 && (
            <span className="inline-flex items-center gap-2 px-3 py-1 bg-amber-900/50 border border-amber-500/50 rounded-full">
              <span className="text-xs text-amber-300">🏆 {contributions.length} contributions</span>
            </span>
          )}
          {!demoMode && (
            <button
              onClick={() => {
                localStorage.removeItem("cache_ticker");
                sessionTimestampsRef.current = {};
                // DON'T clear pushedEventsRef - keep it to prevent re-pushing to Weave
                setEventTicker([]);
                setNotification("Cache cleared - refreshing...");
                setTimeout(() => window.location.reload(), 500);
              }}
              className="text-xs px-3 py-1 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-full text-zinc-400 transition-colors"
            >
              Reset Cache
            </button>
          )}
        </div>
      </header>

      {/* How It Works - Visual Loop (Demo mode only) */}
      {demoMode && (
        <div className="max-w-4xl mx-auto mb-8">
          <div className="bg-gradient-to-br from-zinc-900/80 to-zinc-950/80 rounded-2xl p-6 border border-zinc-700/50 backdrop-blur">
            <h2 className="text-center text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-6">The Self-Improving Loop</h2>
            <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-2">
              {/* Step 1: Agent Works */}
              <div className="flex flex-col items-center text-center px-4 py-3 bg-emerald-950/40 rounded-xl border border-emerald-800/40 min-w-[140px]">
                <div className="text-2xl mb-1">🤖</div>
                <div className="text-sm font-medium text-emerald-300">Agent Works</div>
                <div className="text-xs text-zinc-500 mt-1">Commits, tests, deploys</div>
              </div>

              <div className="text-emerald-500 text-xl hidden md:block animate-arrow" style={{ animationDelay: "0s" }}>→</div>
              <div className="text-emerald-500 text-xl md:hidden animate-arrow">↓</div>

              {/* Step 2: Caché Detects */}
              <div className="flex flex-col items-center text-center px-4 py-3 bg-pink-950/40 rounded-xl border border-pink-800/40 min-w-[140px]">
                <div className="text-2xl mb-1">✨</div>
                <div className="text-sm font-medium text-pink-300">Caché Detects</div>
                <div className="text-xs text-zinc-500 mt-1">Success patterns found</div>
              </div>

              <div className="text-pink-500 text-xl hidden md:block animate-arrow" style={{ animationDelay: "0.3s" }}>→</div>
              <div className="text-pink-500 text-xl md:hidden animate-arrow">↓</div>

              {/* Step 3: Push to Weave */}
              <div className="flex flex-col items-center text-center px-4 py-3 bg-violet-950/40 rounded-xl border border-violet-800/40 min-w-[140px]">
                <div className="text-2xl mb-1">📦</div>
                <div className="text-sm font-medium text-violet-300">Push to Weave</div>
                <div className="text-xs text-zinc-500 mt-1">Org-wide storage</div>
              </div>

              <div className="text-violet-500 text-xl hidden md:block animate-arrow" style={{ animationDelay: "0.6s" }}>→</div>
              <div className="text-violet-500 text-xl md:hidden animate-arrow">↓</div>

              {/* Step 4: Future Agents Query */}
              <div className="flex flex-col items-center text-center px-4 py-3 bg-sky-950/40 rounded-xl border border-sky-800/40 min-w-[140px]">
                <div className="text-2xl mb-1">🔍</div>
                <div className="text-sm font-medium text-sky-300">Agents Query</div>
                <div className="text-xs text-zinc-500 mt-1">MCP retrieval</div>
              </div>

              <div className="text-sky-500 text-xl hidden md:block animate-arrow" style={{ animationDelay: "0.9s" }}>→</div>
              <div className="text-sky-500 text-xl md:hidden animate-arrow">↓</div>

              {/* Step 5: Better Results */}
              <div className="flex flex-col items-center text-center px-4 py-3 bg-amber-950/40 rounded-xl border border-amber-800/40 min-w-[140px] relative">
                <div className="text-2xl mb-1">⚡</div>
                <div className="text-sm font-medium text-amber-300">Better Results</div>
                <div className="text-xs text-zinc-500 mt-1">Informed by history</div>
                {/* Loop back arrow */}
                <div className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 text-amber-500 text-2xl hidden md:block animate-arrow" style={{ animationDelay: "1.2s" }}>↻</div>
              </div>
            </div>

            <p className="text-center text-xs text-zinc-500 mt-6">
              Agents learn from org-wide successes. Every win makes future agents smarter.
            </p>
          </div>
        </div>
      )}

      {/* Notification Toast */}
      {notification && (
        <div className="fixed top-4 right-4 z-50 animate-in">
          <div className="bg-emerald-900/90 border border-emerald-500/50 text-emerald-100 px-4 py-3 rounded-lg shadow-lg backdrop-blur flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-sm font-medium">{notification}</span>
          </div>
        </div>
      )}

      {/* Sessions Overview + Master Ticker */}
      <div className="max-w-7xl mx-auto mb-6">
        <div className={`rounded-xl p-5 border backdrop-blur ${
          claudestormConnected
            ? "bg-emerald-950/30 border-emerald-800/50"
            : "bg-zinc-900/50 border-zinc-800/50"
        }`}>
          {claudestormConnected && claudestormSessions.length > 0 ? (
            <>
              {/* Active Sessions Row */}
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-sm font-medium text-emerald-300">Watching {claudestormSessions.length} sessions</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {claudestormSessions.slice(0, 4).map(s => (
                    <span
                      key={s.session_id}
                      className="px-2 py-1 bg-zinc-800/70 rounded text-xs text-zinc-300"
                      title={s.summary || s.session_id}
                    >
                      {s.summary ? s.summary.slice(0, 20).replace(/[#\n]/g, '').trim() + '...' : s.session_id.slice(0, 8)}
                      <span className="text-zinc-500 ml-1">{s.total_tokens.toLocaleString()}t</span>
                    </span>
                  ))}
                </div>
              </div>

              {/* Stats Summary */}
              <div className="flex flex-wrap gap-4 mb-4 text-sm">
                <div className="text-emerald-300">
                  <span className="font-mono font-bold">{eventTicker.filter(e => e.type === "git_commit").length}</span>
                  <span className="text-emerald-400/70 ml-1">commits</span>
                </div>
                <div className="text-sky-300">
                  <span className="font-mono font-bold">{eventTicker.filter(e => e.type === "tests_passed").length}</span>
                  <span className="text-sky-400/70 ml-1">tests</span>
                </div>
                <div className="text-violet-300">
                  <span className="font-mono font-bold">{eventTicker.filter(e => e.type === "deploy_success").length}</span>
                  <span className="text-violet-400/70 ml-1">deploys</span>
                </div>
                <div className="text-amber-300">
                  <span className="font-mono font-bold">{eventTicker.filter(e => e.type === "build_success").length}</span>
                  <span className="text-amber-400/70 ml-1">builds</span>
                </div>
                <div className="text-pink-300">
                  <span className="font-mono font-bold">{eventTicker.filter(e => e.type === "user_confirmation").length}</span>
                  <span className="text-pink-400/70 ml-1">magic</span>
                </div>
              </div>

              {/* Master Ticker */}
              {eventTicker.length > 0 && (
                <div className="border-t border-emerald-800/30 pt-4">
                  <div className="text-xs text-zinc-500 mb-2">MASTER TICKER</div>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {eventTicker.slice(0, 20).map((event, i) => (
                      <div
                        key={`${event.sessionId}-${event.timestamp}-${i}`}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs ${
                          event.type === "git_commit" ? "bg-emerald-900/30 text-emerald-200" :
                          event.type === "tests_passed" ? "bg-sky-900/30 text-sky-200" :
                          event.type === "deploy_success" ? "bg-violet-900/30 text-violet-200" :
                          event.type === "build_success" ? "bg-amber-900/30 text-amber-200" :
                          event.type === "user_confirmation" ? "bg-pink-900/30 text-pink-200" :
                          event.type === "session_start" ? "bg-indigo-900/30 text-indigo-200" :
                          event.type === "checkpoint" ? "bg-cyan-900/30 text-cyan-200" :
                          event.type === "issue" ? "bg-red-900/30 text-red-200" :
                          "bg-zinc-800/50 text-zinc-300"
                        }`}
                      >
                        <span className="font-mono text-zinc-500 flex-shrink-0">
                          {new Date(event.timestamp).toLocaleTimeString()}
                        </span>
                        <span className="px-1.5 py-0.5 bg-zinc-800/50 rounded text-zinc-400 flex-shrink-0">
                          {event.sessionLabel || event.sessionId?.slice(0, 8)}
                        </span>
                        <span className="font-medium flex-shrink-0">{event.type.replace(/_/g, " ")}</span>
                        <span className="text-zinc-400 truncate flex-1">{event.details.slice(0, 50)}</span>
                        <button
                          onClick={() => pushContribution(event.sessionId!, [event])}
                          className="px-2 py-0.5 bg-violet-800/50 hover:bg-violet-700/50 rounded text-violet-200 flex-shrink-0"
                        >
                          Push
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : claudestormConnected ? (
            <div className="flex items-center justify-center gap-2 py-4 text-zinc-400">
              <span className="w-2 h-2 rounded-full bg-zinc-600" />
              <span className="text-sm">No active sessions</span>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 py-4 text-zinc-500">
              <span className="w-2 h-2 rounded-full bg-zinc-600" />
              <span className="text-sm">Claudestorm offline — start the API server to enable monitoring</span>
            </div>
          )}
        </div>
      </div>

      {/* Org Cache Stats */}
      <div className="max-w-7xl mx-auto mb-6">
        <div className="bg-gradient-to-r from-violet-950/30 via-zinc-900/50 to-sky-950/30 rounded-xl p-5 border border-violet-800/30 backdrop-blur">
          <h2 className="text-sm font-semibold mb-4 text-zinc-300 uppercase tracking-wide">Org Cache</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-violet-300">{eventLog.length + (demoMode ? 47 : 0)}</div>
              <div className="text-xs text-zinc-500">patterns pushed</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-emerald-300">{eventTicker.filter(e => e.type === "git_commit").length + (demoMode ? 34 : 0)}</div>
              <div className="text-xs text-zinc-500">commits</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-pink-300">{eventTicker.filter(e => e.type === "user_confirmation").length + (demoMode ? 8 : 0)}</div>
              <div className="text-xs text-zinc-500">magic</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-amber-300">{anchors.filter(a => a.isGold).length + (demoMode ? 12 : 0)}</div>
              <div className="text-xs text-zinc-500">gold</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-sky-300">{(claudestormSessions.reduce((sum, s) => sum + s.total_tokens, 0) / 1000).toFixed(0)}k</div>
              <div className="text-xs text-zinc-500">tokens</div>
            </div>
          </div>
        </div>
      </div>

      {/* Before/After Trajectory Visualization */}
      <div className="max-w-7xl mx-auto mb-6">
        <div className="bg-gradient-to-b from-zinc-900/80 to-zinc-900/60 rounded-xl p-5 border border-zinc-800/50 backdrop-blur">
          <h2 className="text-sm font-semibold mb-2 text-zinc-300 tracking-wide text-center">
            Replay for Real, Caché with Style <span className="text-zinc-500 font-normal">(Session Task Streams)</span>
          </h2>
          <p className="text-xs text-zinc-500 text-center">Overlapping tasks compete for focus — cached patterns find the successful paths.</p>
          <p className="text-xs text-zinc-100 text-center mb-4">Subsequent runs enable auditable completion, tested with Weave.</p>

          <svg viewBox="0 0 800 200" className="w-full h-52">
            {/* BEFORE - overlapping conflicting tasks in one session */}
            <g>
              <text x="45" y="30" textAnchor="end" fill="#ef4444" fontSize="10" fontWeight="600">BEFORE</text>
              <text x="45" y="42" textAnchor="end" fill="#52525b" fontSize="7">overlapping intents</text>

              {/* Multiple task streams overlapping - showing conflicts */}
              {/* Task A: "add auth" - scattered, some fail */}
              <g>
                <text x="60" y="55" fill="#8b5cf6" fontSize="7">add auth</text>
                {[[80, 0.3], [150, 0.9], [280, 0.25], [400, 0.35], [520, 0.8]].map(([x, op], i) => (
                  <circle key={`a-${i}`} cx={x} cy="60" r="5" fill="#8b5cf6" opacity={op} />
                ))}
                <path d="M 80 60 Q 115 45 150 60 Q 215 75 280 60 Q 340 50 400 60 Q 460 70 520 60" fill="none" stroke="#8b5cf6" strokeWidth="1" strokeOpacity="0.3" strokeDasharray="3,3" />
              </g>

              {/* Task B: "fix db query" - overlaps with A, conflicts */}
              <g>
                <text x="60" y="80" fill="#0ea5e9" fontSize="7">fix db query</text>
                {[[120, 0.25], [200, 0.3], [320, 0.85], [450, 0.3], [580, 0.25]].map(([x, op], i) => (
                  <circle key={`b-${i}`} cx={x} cy="85" r="5" fill="#0ea5e9" opacity={op} />
                ))}
                <path d="M 120 85 Q 160 95 200 85 Q 260 70 320 85 Q 385 95 450 85 Q 515 75 580 85" fill="none" stroke="#0ea5e9" strokeWidth="1" strokeOpacity="0.3" strokeDasharray="3,3" />
              </g>

              {/* Task C: "update API" - also overlapping */}
              <g>
                <text x="60" y="105" fill="#10b981" fontSize="7">update API</text>
                {[[100, 0.3], [180, 0.25], [350, 0.3], [480, 0.85], [620, 0.3]].map(([x, op], i) => (
                  <circle key={`c-${i}`} cx={x} cy="110" r="5" fill="#10b981" opacity={op} />
                ))}
                <path d="M 100 110 Q 140 100 180 110 Q 265 120 350 110 Q 415 100 480 110 Q 550 120 620 110" fill="none" stroke="#10b981" strokeWidth="1" strokeOpacity="0.3" strokeDasharray="3,3" />
              </g>

              {/* Conflict zones - where tasks overlap and fail */}
              <rect x="110" y="50" width="50" height="70" fill="#ef4444" opacity="0.08" rx="4" />
              <rect x="270" y="50" width="60" height="70" fill="#ef4444" opacity="0.08" rx="4" />
              <rect x="440" y="50" width="50" height="70" fill="#ef4444" opacity="0.08" rx="4" />
              <text x="135" y="130" fill="#ef4444" fontSize="6" textAnchor="middle" opacity="0.5">conflict</text>
              <text x="300" y="130" fill="#ef4444" fontSize="6" textAnchor="middle" opacity="0.5">conflict</text>
              <text x="465" y="130" fill="#ef4444" fontSize="6" textAnchor="middle" opacity="0.5">conflict</text>

              <text x="750" y="85" textAnchor="end" fill="#ef4444" fontSize="8" opacity="0.7">~35% complete</text>
            </g>

            {/* Divider */}
            <line x1="55" y1="145" x2="780" y2="145" stroke="#3f3f46" strokeWidth="1" strokeDasharray="4,4" />
            <text x="420" y="143" fill="#71717a" fontSize="8" textAnchor="middle">↓ Caché identifies successful paths ↓</text>

            {/* AFTER - disambiguated, sequential, successful */}
            <g>
              <text x="45" y="165" textAnchor="end" fill="#10b981" fontSize="10" fontWeight="600">AFTER</text>
              <text x="45" y="177" textAnchor="end" fill="#52525b" fontSize="7">cached patterns</text>

              {/* Task A: "add auth" - clean path found */}
              <g>
                <text x="60" y="168" fill="#8b5cf6" fontSize="7">add auth</text>
                {[[100, 0.9], [160, 0.9]].map(([x, op], i) => (
                  <circle key={`a2-${i}`} cx={x} cy="173" r="5" fill="#8b5cf6" opacity={op} />
                ))}
                <path d="M 100 173 Q 130 160 160 173" fill="none" stroke="#8b5cf6" strokeWidth="2" strokeOpacity="0.7" />
              </g>

              {/* Task B: "fix db query" - clean path found */}
              <g>
                <text x="220" y="168" fill="#0ea5e9" fontSize="7">fix db query</text>
                {[[280, 0.9], [340, 0.9]].map(([x, op], i) => (
                  <circle key={`b2-${i}`} cx={x} cy="173" r="5" fill="#0ea5e9" opacity={op} />
                ))}
                <path d="M 280 173 Q 310 160 340 173" fill="none" stroke="#0ea5e9" strokeWidth="2" strokeOpacity="0.7" />
              </g>

              {/* Task C: "update API" - clean path found */}
              <g>
                <text x="400" y="168" fill="#10b981" fontSize="7">update API</text>
                {[[460, 0.9], [520, 0.9]].map(([x, op], i) => (
                  <circle key={`c2-${i}`} cx={x} cy="173" r="5" fill="#10b981" opacity={op} />
                ))}
                <path d="M 460 173 Q 490 160 520 173" fill="none" stroke="#10b981" strokeWidth="2" strokeOpacity="0.7" />
              </g>

              {/* Success indicators */}
              <text x="130" y="192" fill="#8b5cf6" fontSize="6" textAnchor="middle">✓</text>
              <text x="310" y="192" fill="#0ea5e9" fontSize="6" textAnchor="middle">✓</text>
              <text x="490" y="192" fill="#10b981" fontSize="6" textAnchor="middle">✓</text>

              <text x="750" y="175" textAnchor="end" fill="#10b981" fontSize="8" opacity="0.9">~92% complete</text>
            </g>
          </svg>

          {/* Legend */}
          <div className="flex justify-center gap-6 mt-3 pt-3 border-t border-zinc-800/50">
            <span className="flex items-center gap-2 text-xs">
              <span className="w-3 h-3 rounded-full opacity-30" style={{background: 'linear-gradient(135deg, #8b5cf6, #0ea5e9)'}} />
              <span className="text-zinc-500">failed attempt</span>
            </span>
            <span className="flex items-center gap-2 text-xs">
              <span className="w-3 h-3 rounded-full bg-emerald-500 opacity-90" />
              <span className="text-zinc-400">successful path</span>
            </span>
            <span className="flex items-center gap-2 text-xs">
              <span className="w-4 h-3 rounded bg-red-500/20" />
              <span className="text-zinc-500">conflict zone</span>
            </span>
          </div>
        </div>
      </div>

      {/* Learning Loop Visualization */}
      <div className="max-w-7xl mx-auto mb-6">
        <div className="bg-zinc-900/70 rounded-xl p-6 border border-zinc-800/50 backdrop-blur">
          <h2 className="text-sm font-semibold mb-6 text-zinc-300 uppercase tracking-wide text-center">The Learning Loop</h2>

          {/* Flow Diagram */}
          <div className="flex items-center justify-center gap-2 md:gap-4 mb-8">
            {/* Step 1: Work */}
            <div className="flex flex-col items-center">
              <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center shadow-lg shadow-blue-500/20 border-2 border-blue-400/30">
                <span className="text-2xl md:text-3xl">💻</span>
              </div>
              <span className="text-xs text-zinc-400 mt-2 text-center">You work<br/>with Claude</span>
            </div>

            {/* Arrow */}
            <div className="text-zinc-600 text-2xl animate-pulse">→</div>

            {/* Step 2: Win */}
            <div className="flex flex-col items-center">
              <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-gradient-to-br from-emerald-600 to-emerald-800 flex items-center justify-center shadow-lg shadow-emerald-500/20 border-2 border-emerald-400/30">
                <span className="text-2xl md:text-3xl">✓</span>
              </div>
              <span className="text-xs text-zinc-400 mt-2 text-center">Claude<br/>wins</span>
            </div>

            {/* Arrow */}
            <div className="text-zinc-600 text-2xl animate-pulse">→</div>

            {/* Step 3: Detect */}
            <div className="flex flex-col items-center">
              <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-gradient-to-br from-amber-600 to-orange-700 flex items-center justify-center shadow-lg shadow-amber-500/20 border-2 border-amber-400/30 relative">
                <span className="text-2xl md:text-3xl">👁</span>
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-pink-500 rounded-full text-[10px] flex items-center justify-center font-bold animate-bounce">
                  {weaveHistory.length > 0 ? weaveHistory.length : '?'}
                </span>
              </div>
              <span className="text-xs text-zinc-400 mt-2 text-center">Caché<br/>detects</span>
            </div>

            {/* Arrow */}
            <div className="text-zinc-600 text-2xl animate-pulse">→</div>

            {/* Step 4: Store */}
            <div className="flex flex-col items-center">
              <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-gradient-to-br from-violet-600 to-purple-800 flex items-center justify-center shadow-lg shadow-violet-500/20 border-2 border-violet-400/30">
                <span className="text-2xl md:text-3xl">🧠</span>
              </div>
              <span className="text-xs text-zinc-400 mt-2 text-center">Weave<br/>stores</span>
            </div>

            {/* Arrow */}
            <div className="text-zinc-600 text-2xl animate-pulse">→</div>

            {/* Step 5: Learn */}
            <div className="flex flex-col items-center">
              <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-gradient-to-br from-sky-600 to-cyan-700 flex items-center justify-center shadow-lg shadow-sky-500/20 border-2 border-sky-400/30">
                <span className="text-2xl md:text-3xl">🚀</span>
              </div>
              <span className="text-xs text-zinc-400 mt-2 text-center">Future Claude<br/>learns</span>
            </div>
          </div>

          {/* Event Type Breakdown - Visual */}
          <div className="border-t border-zinc-800 pt-5">
            <div className="text-xs text-zinc-500 mb-3 text-center">PATTERNS BY TYPE</div>
            <div className="flex justify-center gap-6 flex-wrap">
              {(() => {
                const typeCounts: Record<string, number> = {};
                weaveHistory.forEach(call => {
                  const t = (call.inputs as Record<string, string>)?.success_type || 'unknown';
                  typeCounts[t] = (typeCounts[t] || 0) + 1;
                });
                const typeConfig: Record<string, { color: string; icon: string }> = {
                  git_commit: { color: 'emerald', icon: '📦' },
                  commit: { color: 'emerald', icon: '📦' },
                  tests_passed: { color: 'sky', icon: '✅' },
                  deploy: { color: 'violet', icon: '🚀' },
                  deploy_success: { color: 'violet', icon: '🚀' },
                  user_confirmation: { color: 'pink', icon: '✨' },
                  build_success: { color: 'amber', icon: '🔨' },
                };
                return Object.entries(typeCounts).map(([type, count]) => {
                  const config = typeConfig[type] || { color: 'zinc', icon: '📄' };
                  return (
                    <div key={type} className="flex flex-col items-center">
                      <div className={`w-12 h-12 rounded-lg bg-${config.color}-900/50 border border-${config.color}-700/50 flex items-center justify-center mb-1`}
                           style={{
                             backgroundColor: config.color === 'emerald' ? 'rgba(6,78,59,0.5)' :
                                              config.color === 'sky' ? 'rgba(12,74,110,0.5)' :
                                              config.color === 'violet' ? 'rgba(76,29,149,0.5)' :
                                              config.color === 'pink' ? 'rgba(131,24,67,0.5)' :
                                              config.color === 'amber' ? 'rgba(120,53,15,0.5)' : 'rgba(39,39,42,0.5)',
                             borderColor: config.color === 'emerald' ? 'rgba(16,185,129,0.5)' :
                                          config.color === 'sky' ? 'rgba(14,165,233,0.5)' :
                                          config.color === 'violet' ? 'rgba(139,92,246,0.5)' :
                                          config.color === 'pink' ? 'rgba(236,72,153,0.5)' :
                                          config.color === 'amber' ? 'rgba(245,158,11,0.5)' : 'rgba(63,63,70,0.5)'
                           }}>
                        <span className="text-xl">{config.icon}</span>
                      </div>
                      <span className="text-lg font-bold text-zinc-200">{count}</span>
                      <span className="text-[10px] text-zinc-500">{type.replace(/_/g, ' ')}</span>
                    </div>
                  );
                });
              })()}
            </div>
          </div>

          {/* Recent Wins Timeline */}
          {weaveHistory.length > 0 && (
            <div className="border-t border-zinc-800 pt-5 mt-5">
              <div className="text-xs text-zinc-500 mb-3 text-center">RECENT WINS</div>
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-gradient-to-b from-emerald-500 via-violet-500 to-sky-500 opacity-30" />

                <div className="space-y-3">
                  {weaveHistory.slice(0, 5).map((call, i) => {
                    const type = (call.inputs as Record<string, string>)?.success_type || 'unknown';
                    const output = (call.inputs as Record<string, string>)?.output || '';
                    const isLeft = i % 2 === 0;
                    return (
                      <div key={call.id} className={`flex items-center gap-3 ${isLeft ? 'flex-row' : 'flex-row-reverse'}`}>
                        <div className={`flex-1 ${isLeft ? 'text-right' : 'text-left'}`}>
                          <div className={`inline-block bg-zinc-800/80 rounded-lg px-3 py-2 max-w-xs`}>
                            <div className="text-xs text-zinc-400 mb-1">
                              {type.replace(/_/g, ' ')}
                            </div>
                            <div className="text-sm text-zinc-200 truncate">
                              {output.split('\n')[0]?.replace(/^TASK:\s*/, '').slice(0, 40) || 'Pattern saved'}
                            </div>
                          </div>
                        </div>
                        <div className="w-3 h-3 rounded-full bg-violet-500 shadow-lg shadow-violet-500/50 flex-shrink-0 z-10" />
                        <div className="flex-1" />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Review Queue */}
      {/* Your Contributions */}
      {contributions.length > 0 && (
        <div className="max-w-7xl mx-auto mb-6">
          <div className="bg-gradient-to-br from-amber-950/40 to-orange-950/30 rounded-xl p-5 border border-amber-700/50 backdrop-blur">
            <h2 className="text-sm font-semibold mb-4 text-amber-200 uppercase tracking-wide flex items-center gap-2">
              🏆 Your Contributions
              <span className="px-2 py-0.5 bg-amber-800/50 rounded-full text-xs font-normal">
                {contributions.length} pushed
              </span>
            </h2>
            <div className="space-y-2">
              {contributions.slice(0, 5).map((c) => (
                <div key={c.id} className="bg-zinc-900/50 rounded-lg p-3 border border-zinc-700/50 flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <span className="text-xs text-zinc-500 mr-2">{new Date(c.createdAt).toLocaleTimeString()}</span>
                    {c.isGold && <span className="text-amber-400 mr-1">⭐</span>}
                    <span className="text-sm text-zinc-300 truncate">{c.summary.split("\n")[0]}</span>
                  </div>
                  <div className="flex gap-1">
                    {!c.isGold && <button onClick={() => markGold(c.id)} className="text-xs text-amber-500 hover:text-amber-300 px-2">⭐</button>}
                    <button onClick={() => undoContribution(c.id)} className="text-xs text-zinc-500 hover:text-zinc-300 px-2">undo</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MCP Query Demo - What Agents Retrieve (Demo mode) */}
      {demoMode && (
        <div className="max-w-7xl mx-auto mb-6">
          <div className="bg-gradient-to-br from-sky-950/40 to-indigo-950/30 rounded-xl p-5 border border-sky-800/40 backdrop-blur">
            <h2 className="text-sm font-semibold mb-4 text-sky-200 uppercase tracking-wide flex items-center gap-2">
              🔍 What Agents See (MCP Query)
              <span className="px-2 py-0.5 bg-sky-900/50 rounded-full text-xs font-normal text-sky-400">
                via W&B MCP Server
              </span>
            </h2>
            <p className="text-xs text-zinc-500 mb-4">
              When a new agent starts, it queries the org cache for relevant patterns. Here&apos;s what it retrieves:
            </p>
            <div className="space-y-4">
              {getMockMCPQueryResults().map((result, i) => (
                <div key={i} className="bg-zinc-900/60 rounded-lg p-4 border border-zinc-700/50">
                  <div className="flex items-start gap-2 mb-3">
                    <span className="text-sky-400 text-sm font-medium">Query:</span>
                    <span className="text-zinc-300 text-sm italic">&ldquo;{result.query}&rdquo;</span>
                  </div>
                  <div className="space-y-2 ml-4">
                    {result.patterns.map((pattern, j) => (
                      <div key={j} className="flex items-start gap-3 text-sm">
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                          pattern.type === "deploy" ? "bg-violet-900/50 text-violet-300" :
                          pattern.type === "auth" ? "bg-amber-900/50 text-amber-300" :
                          pattern.type === "bugfix" ? "bg-emerald-900/50 text-emerald-300" :
                          pattern.type === "config" ? "bg-pink-900/50 text-pink-300" :
                          "bg-zinc-800 text-zinc-400"
                        }`}>
                          {pattern.type}
                        </span>
                        <span className="text-zinc-400 flex-1">{pattern.summary}</span>
                        <span className="text-zinc-600 text-xs flex-shrink-0">{pattern.uses} uses</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-zinc-600 mt-4 text-center">
              Patterns are automatically categorized by type and tech stack for precise retrieval
            </p>
          </div>
        </div>
      )}

      {/* Weave History - From API */}
      <div className="max-w-7xl mx-auto mb-6">
        <div className="bg-zinc-900/50 rounded-xl p-5 border border-zinc-800/50 backdrop-blur">
          <h2 className="text-sm font-semibold mb-4 text-zinc-300 uppercase tracking-wide flex items-center gap-2">
            Weave History
            <span className="px-2 py-0.5 bg-zinc-800 rounded-full text-xs font-normal text-zinc-400">
              {demoMode ? "47" : weaveHistory.length}
            </span>
          </h2>
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {demoMode ? (
              // Demo mode: show mock history
              <>
                {[
                  { time: "3:42:15 PM", type: "git_commit", desc: "GOAL: Build Caché hackathon UI" },
                  { time: "3:38:22 PM", type: "deploy_success", desc: "GOAL: Deploy to Vercel production" },
                  { time: "3:31:45 PM", type: "user_confirmation", desc: "GOAL: Weave API integration" },
                  { time: "3:24:10 PM", type: "git_commit", desc: "GOAL: Success event detection" },
                  { time: "3:18:33 PM", type: "tests_passed", desc: "GOAL: OAuth token refresh flow" },
                  { time: "3:12:01 PM", type: "git_commit", desc: "GOAL: Add MCP query patterns" },
                ].map((item, i) => (
                  <div key={i} className="bg-violet-900/20 rounded-lg p-2.5 text-sm border border-violet-800/30 font-mono">
                    <span className="text-zinc-500 mr-3">{item.time}</span>
                    <span className="text-violet-400">{item.type}</span>
                    <span className="text-zinc-500 ml-2">{item.desc}</span>
                  </div>
                ))}
              </>
            ) : weaveHistory.length === 0 ? (
              <p className="text-zinc-600 text-sm text-center py-4">Loading from Weave...</p>
            ) : (
              weaveHistory.map((call) => (
                <div key={call.id} className="bg-violet-900/20 rounded-lg p-2.5 text-sm border border-violet-800/30 font-mono">
                  <span className="text-zinc-500 mr-3">{call.timestamp ? new Date(call.timestamp).toLocaleTimeString() : "—"}</span>
                  <span className="text-violet-400">{(call.inputs as Record<string, string>)?.success_type || call.op_name}</span>
                  <span className="text-zinc-500 ml-2 truncate">{((call.inputs as Record<string, string>)?.output || "").slice(0, 60)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-8 pt-6 border-t border-zinc-800/50">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-sm text-zinc-400 mb-4">Caché — Self-improving agents through cached successes</p>

          {/* Integration badges */}
          <div className="flex flex-wrap items-center justify-center gap-4 text-xs mb-4">
            <span className="flex items-center gap-2 px-3 py-1.5 bg-emerald-950/50 rounded-full border border-emerald-800/30">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span className="text-emerald-300">Claudestorm</span>
              <span className="text-zinc-500">detection</span>
            </span>
            <span className="flex items-center gap-2 px-3 py-1.5 bg-violet-950/50 rounded-full border border-violet-800/30">
              <span className="w-2 h-2 rounded-full bg-violet-500"></span>
              <span className="text-violet-300">W&B Weave</span>
              <span className="text-zinc-500">storage</span>
            </span>
            <span className="flex items-center gap-2 px-3 py-1.5 bg-sky-950/50 rounded-full border border-sky-800/30">
              <span className="w-2 h-2 rounded-full bg-sky-500"></span>
              <span className="text-sky-300">MCP</span>
              <span className="text-zinc-500">retrieval</span>
            </span>
          </div>

          {/* Tech stack */}
          <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-zinc-600">
            <span>Built with</span>
            <span className="px-2 py-0.5 bg-zinc-800/50 rounded">Next.js</span>
            <span className="px-2 py-0.5 bg-zinc-800/50 rounded">TypeScript</span>
            <span className="px-2 py-0.5 bg-zinc-800/50 rounded">Tailwind</span>
            <span className="px-2 py-0.5 bg-zinc-800/50 rounded">Python</span>
          </div>

          {demoMode && (
            <p className="mt-4 text-xs text-zinc-600">
              Demo mode — showing simulated data. In production, connects to live Claudestorm sessions.
            </p>
          )}
        </div>
      </footer>
    </div>
  );
}
