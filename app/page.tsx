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
  type: "git_commit" | "tests_passed" | "deploy_success" | "user_confirmation" | "build_success";
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

// Mock data for demo mode
function getMockData() {
  const now = Date.now();
  return {
    sessions: [
      { session_id: "demo-1a2b3c", message_count: 47, total_tokens: 28400, last_timestamp: new Date(now).toISOString(), summary: "Building Caché hackathon UI" },
      { session_id: "demo-4d5e6f", message_count: 23, total_tokens: 14200, last_timestamp: new Date(now - 300000).toISOString(), summary: "Weave API integration" },
      { session_id: "demo-7g8h9i", message_count: 31, total_tokens: 19800, last_timestamp: new Date(now - 600000).toISOString(), summary: "Success event detection" },
    ] as ClaudestormSession[],
    events: [
      { type: "git_commit" as const, timestamp: new Date(now).toISOString(), details: "[main a1b2c3d] Auto-push contributions feed", confidence: 0.95, sessionId: "demo-1a2b3c", sessionLabel: "Building Caché..." },
      { type: "build_success" as const, timestamp: new Date(now - 60000).toISOString(), details: "Compiled successfully in 2.1s", confidence: 0.9, sessionId: "demo-1a2b3c", sessionLabel: "Building Caché..." },
      { type: "user_confirmation" as const, timestamp: new Date(now - 120000).toISOString(), details: "magic - checkpoint confirmed", confidence: 1.0, sessionId: "demo-4d5e6f", sessionLabel: "Weave API..." },
      { type: "git_commit" as const, timestamp: new Date(now - 180000).toISOString(), details: "[main 9f8e7d6] Mock data mode for demos", confidence: 0.95, sessionId: "demo-1a2b3c", sessionLabel: "Building Caché..." },
      { type: "tests_passed" as const, timestamp: new Date(now - 240000).toISOString(), details: "12 tests passed in 3.4s", confidence: 0.92, sessionId: "demo-7g8h9i", sessionLabel: "Success event..." },
      { type: "git_commit" as const, timestamp: new Date(now - 300000).toISOString(), details: "[main 5c4b3a2] Weave push endpoint", confidence: 0.95, sessionId: "demo-4d5e6f", sessionLabel: "Weave API..." },
    ] as SuccessEvent[],
  };
}

export default function AutoForkConsole() {
  const [anchors, setAnchors] = useState<Anchor[]>([]);
  const [eventLog, setEventLog] = useState<EventLogEntry[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState(() => generateId());
  const [mounted, setMounted] = useState(false);
  const [demoMode, setDemoMode] = useState(false);

  // Claudestorm integration state
  const [claudestormConnected, setClaudestormConnected] = useState(false);
  const [claudestormSessions, setClaudestormSessions] = useState<ClaudestormSession[]>([]);
  const sessionTimestampsRef = useRef<Record<string, string>>({}); // Track last event per session (ref to avoid re-renders)

  // Event tracking state - master ticker across ALL sessions
  const [notification, setNotification] = useState<string | null>(null);
  const [eventTicker, setEventTicker] = useState<SuccessEvent[]>([]); // All events across all sessions (persisted)
  const [contributions, setContributions] = useState<Anchor[]>([]); // Auto-pushed to Weave

  // Separate mount effect to ensure it always runs
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("demo") === "true") {
      const mock = getMockData();
      setDemoMode(true);
      setClaudestormConnected(true);
      setClaudestormSessions(mock.sessions);
      setEventTicker(mock.events);
    }
    setMounted(true);
  }, []);

  // Load from localStorage after mount (skip in demo mode)
  useEffect(() => {
    if (!mounted) return;
    if (new URLSearchParams(window.location.search).get("demo") === "true") return;
    try {
      const savedAnchors = localStorage.getItem("autofork_anchors");
      const savedEventLog = localStorage.getItem("autofork_events");
      const savedSessionId = localStorage.getItem("autofork_sessionId");

      if (savedAnchors) setAnchors(JSON.parse(savedAnchors));
      if (savedEventLog) setEventLog(JSON.parse(savedEventLog));
      if (savedSessionId) setCurrentSessionId(savedSessionId);
      const savedTicker = localStorage.getItem("cache_ticker");
      if (savedTicker) setEventTicker(JSON.parse(savedTicker));
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
        setEventTicker(prev => {
          // Dedupe by content (details), not just timestamp - same commit shouldn't show twice
          const existingDetails = new Set(prev.map(e => `${e.type}-${e.details}`));
          const uniqueNew = newEvents.filter(e => !existingDetails.has(`${e.type}-${e.details}`));
          if (uniqueNew.length === 0) return prev;
          return [...uniqueNew, ...prev].slice(0, 50); // Keep last 50
        });
      }
    };

    checkAllSessions();
    const interval = setInterval(checkAllSessions, 15000);
    return () => clearInterval(interval);
  }, [mounted, claudestormConnected, claudestormSessions]);



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
        <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-pink-400 via-violet-400 to-sky-400 bg-clip-text text-transparent mb-2">
          Caché
        </h1>
        <p className="text-zinc-500 text-sm">Agent wins → Weave → Future agents query what worked</p>
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
        </div>
      </header>

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
                        <span className="text-zinc-400 truncate">{event.details.slice(0, 50)}</span>
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-violet-300">{anchors.length + (demoMode ? 47 : 0)}</div>
              <div className="text-xs text-zinc-500">patterns stored</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-emerald-300">{eventTicker.filter(e => e.type === "git_commit").length + (demoMode ? 34 : 0)}</div>
              <div className="text-xs text-zinc-500">commits captured</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-amber-300">{anchors.filter(a => a.isGold).length + (demoMode ? 12 : 0)}</div>
              <div className="text-xs text-zinc-500">gold patterns</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-sky-300">{demoMode ? "89%" : anchors.length > 0 ? "100%" : "—"}</div>
              <div className="text-xs text-zinc-500">success rate</div>
            </div>
          </div>
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
                    <span className="text-sm text-zinc-300 truncate">{c.summary.split("\n")[0]}</span>
                  </div>
                  <button onClick={() => undoContribution(c.id)} className="text-xs text-zinc-500 hover:text-zinc-300 px-2">undo</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Event Log */}
      <div className="max-w-7xl mx-auto">
        <div className="bg-zinc-900/50 rounded-xl p-5 border border-zinc-800/50 backdrop-blur">
          <h2 className="text-sm font-semibold mb-4 text-zinc-300 uppercase tracking-wide flex items-center gap-2">
            Event Log
            <span className="px-2 py-0.5 bg-zinc-800 rounded-full text-xs font-normal text-zinc-400">
              {eventLog.length}
            </span>
          </h2>
          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {eventLog.length === 0 ? (
              <p className="text-zinc-600 text-sm text-center py-4">No events recorded</p>
            ) : (
              eventLog.map((event) => (
                <div
                  key={event.id}
                  className="bg-zinc-800/50 rounded-lg p-2.5 text-sm border border-zinc-700/50 font-mono"
                >
                  <span className="text-zinc-500 mr-3">
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </span>
                  <span className={`${
                    event.message.includes("FORKED")
                      ? "text-violet-400"
                      : event.message.includes("GOLD")
                      ? "text-amber-400"
                      : event.message.includes("AUTO_ANCHOR")
                      ? "text-emerald-400"
                      : "text-zinc-300"
                  }`}>
                    {event.message}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-8 pt-6 border-t border-zinc-800/50">
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-sm text-zinc-400 mb-3">Caché — Self-improving agents through cached successes</p>
          <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-zinc-600">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
              Claudestorm for detection
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-600"></span>
              Weave for storage
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-600"></span>
              MCP for retrieval
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
