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


export default function AutoForkConsole() {
  const [anchors, setAnchors] = useState<Anchor[]>([]);
  const [eventLog, setEventLog] = useState<EventLogEntry[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState(() => generateId());
  const [mounted, setMounted] = useState(false);

  // Claudestorm integration state
  const [claudestormConnected, setClaudestormConnected] = useState(false);
  const [claudestormSessions, setClaudestormSessions] = useState<ClaudestormSession[]>([]);
  const sessionTimestampsRef = useRef<Record<string, string>>({}); // Track last event per session (ref to avoid re-renders)

  // Event tracking state - master ticker across ALL sessions
  const [notification, setNotification] = useState<string | null>(null);
  const [eventTicker, setEventTicker] = useState<SuccessEvent[]>([]); // All events across all sessions
  const [pendingAnchors, setPendingAnchors] = useState<Anchor[]>([]); // Awaiting user review

  // Separate mount effect to ensure it always runs
  useEffect(() => {
    setMounted(true);
  }, []);

  // Load from localStorage after mount
  useEffect(() => {
    if (!mounted) return;
    try {
      const savedAnchors = localStorage.getItem("autofork_anchors");
      const savedEventLog = localStorage.getItem("autofork_events");
      const savedSessionId = localStorage.getItem("autofork_sessionId");

      if (savedAnchors) setAnchors(JSON.parse(savedAnchors));
      if (savedEventLog) setEventLog(JSON.parse(savedEventLog));
      if (savedSessionId) setCurrentSessionId(savedSessionId);
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

  // Check claudestorm connection and fetch all sessions
  useEffect(() => {
    if (!mounted) return;
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

  // Create anchor from selected events - stages to pending queue for review
  const stageAnchor = useCallback(async (sessionId: string, events: SuccessEvent[]) => {
    if (!sessionId) return;

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

      const resumeParts: string[] = [];
      resumeParts.push(`## Current Task\n${anchorData.goal.slice(0, 500)}`);
      if (lastGoldAnchor) {
        resumeParts.push(`## Last Stable Checkpoint\n${lastGoldAnchor.summary}`);
      }
      if (anchorData.files_touched.length > 0) {
        resumeParts.push(`## Files\n${anchorData.files_touched.map(f => `- ${f}`).join("\n")}`);
      }
      resumeParts.push(`## Recovery Rule\nIf stuck, restate the goal and continue from last checkpoint.`);

      const newAnchor: Anchor = {
        id: generateId(),
        createdAt: new Date().toISOString(),
        sessionId: sessionId,
        tokenEstimate: detail.stats.total_tokens,
        status: "success",
        summary: summaryParts.join("\n"),
        resumePrompt: resumeParts.join("\n\n"),
        isGold: false,
      };

      setPendingAnchors(prev => [newAnchor, ...prev]);
      setNotification("Anchor staged for review");
      setTimeout(() => setNotification(null), 2000);
    } catch (e) {
      console.error("Failed to stage anchor:", e);
    }
  }, [lastGoldAnchor]);

  // Approve pending anchor - moves to anchors and pushes to Weave
  const approveAnchor = useCallback(async (anchorId: string, markGold: boolean) => {
    const anchor = pendingAnchors.find(a => a.id === anchorId);
    if (!anchor) return;

    const approvedAnchor = { ...anchor, isGold: markGold };
    setAnchors(prev => [approvedAnchor, ...prev]);
    setPendingAnchors(prev => prev.filter(a => a.id !== anchorId));

    // Push directly to Weave with anchor data
    try {
      const res = await fetch("/api/push-to-weave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          anchor: {
            input: anchor.resumePrompt,
            output: anchor.summary,
            success_type: anchor.status,
            tokens: anchor.tokenEstimate,
            is_gold: markGold,
            session_id: anchor.sessionId,
          }
        })
      });
      const data = await res.json();
      if (data.success) {
        setNotification(`Pushed to Weave${markGold ? " (Gold)" : ""}`);
        setEventLog(prev => [{
          id: generateId(),
          timestamp: new Date().toISOString(),
          message: `WEAVE_PUSH: ${anchor.summary.split("\n")[0].slice(0, 40)}...${markGold ? " [GOLD]" : ""}`,
        }, ...prev]);
      } else {
        setNotification("Push failed: " + (data.error || "unknown"));
      }
    } catch {
      setNotification("Push failed");
    }
    setTimeout(() => setNotification(null), 3000);
  }, [pendingAnchors]);

  // Reject pending anchor
  const rejectAnchor = useCallback((anchorId: string) => {
    setPendingAnchors(prev => prev.filter(a => a.id !== anchorId));
    setNotification("Anchor discarded");
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
      <header className="mb-8 text-center">
        <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-pink-400 via-violet-400 to-sky-400 bg-clip-text text-transparent mb-2">
          Caché
        </h1>
        <p className="text-zinc-500 text-sm">Agent wins → Weave → Future agents query what worked</p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-zinc-900 rounded-full border border-zinc-800">
            <span className={`w-2 h-2 rounded-full ${claudestormConnected ? "bg-emerald-500 animate-pulse" : "bg-zinc-600"}`} />
            <span className="text-xs text-zinc-400">{claudestormConnected ? "Connected" : "Offline"}</span>
          </div>
          {pendingAnchors.length > 0 && (
            <span className="inline-flex items-center gap-2 px-3 py-1 bg-amber-900/50 border border-amber-500/50 rounded-full">
              <span className="text-xs text-amber-300">{pendingAnchors.length} pending review</span>
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

      {/* Review Queue */}
      {pendingAnchors.length > 0 && (
        <div className="max-w-7xl mx-auto mb-6">
          <div className="bg-amber-950/30 rounded-xl p-5 border border-amber-800/50 backdrop-blur">
            <h2 className="text-sm font-semibold mb-4 text-amber-300 uppercase tracking-wide flex items-center gap-2">
              Review Queue
              <span className="px-2 py-0.5 bg-amber-800/50 rounded-full text-xs font-normal">
                {pendingAnchors.length}
              </span>
            </h2>
            <div className="space-y-3">
              {pendingAnchors.map((anchor) => (
                <div key={anchor.id} className="bg-zinc-900/50 rounded-lg p-4 border border-zinc-700/50">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-zinc-500 mb-1">
                        {new Date(anchor.createdAt).toLocaleTimeString()} · {anchor.tokenEstimate.toLocaleString()} tokens
                      </div>
                      <pre className="text-sm text-zinc-200 whitespace-pre-wrap font-mono line-clamp-3">
                        {anchor.summary}
                      </pre>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => approveAnchor(anchor.id, false)}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded text-xs font-medium text-white transition-all"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => approveAnchor(anchor.id, true)}
                        className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 rounded text-xs font-medium text-white transition-all"
                      >
                        Gold
                      </button>
                      <button
                        onClick={() => rejectAnchor(anchor.id)}
                        className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded text-xs font-medium text-zinc-300 transition-all"
                      >
                        Discard
                      </button>
                    </div>
                  </div>
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
      <footer className="mt-8 text-center text-xs text-zinc-600">
        Caché — Self-improving agents through cached successes
      </footer>
    </div>
  );
}
