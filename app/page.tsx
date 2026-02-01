"use client";

import { useState, useEffect, useCallback } from "react";

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

const CLAUDESTORM_API = "http://localhost:8100";

function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

function extractAnchorSummary(transcript: string): {
  summary: string;
  goal: string;
  constraints: string;
  nextSteps: string[];
} {
  const lines = transcript.split("\n");
  const goalLines: string[] = [];
  const planLines: string[] = [];
  const constraintLines: string[] = [];
  const blockerLines: string[] = [];

  for (const line of lines) {
    const lower = line.toLowerCase().trim();
    if (!lower) continue;

    if (
      lower.includes("goal:") ||
      lower.includes("objective:") ||
      lower.includes("task:") ||
      lower.includes("building") ||
      lower.includes("creating") ||
      lower.includes("implementing")
    ) {
      goalLines.push(line.trim());
    }
    if (
      lower.includes("plan:") ||
      lower.includes("step") ||
      lower.includes("next:") ||
      lower.includes("todo:") ||
      lower.match(/^\d+\./)
    ) {
      planLines.push(line.trim());
    }
    if (
      lower.includes("constraint:") ||
      lower.includes("must ") ||
      lower.includes("cannot ") ||
      lower.includes("require") ||
      lower.includes("should not")
    ) {
      constraintLines.push(line.trim());
    }
    if (
      lower.includes("blocker:") ||
      lower.includes("error:") ||
      lower.includes("blocked") ||
      lower.includes("failed") ||
      lower.includes("issue:")
    ) {
      blockerLines.push(line.trim());
    }
  }

  const parts: string[] = [];
  const goal = goalLines[0] || "Continue from previous context";

  if (goalLines.length > 0) parts.push(`GOAL: ${goalLines.slice(0, 2).join(" | ")}`);
  if (planLines.length > 0) parts.push(`PLAN: ${planLines.slice(0, 3).join(" → ")}`);
  if (constraintLines.length > 0) parts.push(`CONSTRAINTS: ${constraintLines.slice(0, 2).join("; ")}`);
  if (blockerLines.length > 0) parts.push(`BLOCKERS: ${blockerLines.slice(0, 2).join("; ")}`);

  const nextSteps = planLines.length > 0
    ? planLines.slice(0, 3)
    : ["Review current state", "Address any blockers", "Continue implementation"];

  return {
    summary: parts.join("\n") || "No structured content extracted from transcript.",
    goal,
    constraints: constraintLines.slice(0, 2).join("; "),
    nextSteps,
  };
}

function checkSuccessSignal(transcript: string): boolean {
  const lower = transcript.toLowerCase();
  return ["deployed", "deployment", "vercel", "tests passed", "merged", "published", "success", "completed"].some(
    (keyword) => lower.includes(keyword)
  );
}

function checkDriftSignal(transcript: string): boolean {
  const lower = transcript.toLowerCase();
  if (lower.includes("ignore that") || lower.includes("start over") || lower.includes("scratch that")) {
    return true;
  }

  const errorRegex = /error:.*$/gim;
  const errorMatches = transcript.match(errorRegex) || [];
  const errorSet = new Set<string>();
  for (const err of errorMatches) {
    const normalized = err.toLowerCase().trim();
    if (errorSet.has(normalized)) {
      return true;
    }
    errorSet.add(normalized);
  }

  return false;
}

function generateResumePrompt(
  extracted: { goal: string; constraints: string; nextSteps: string[] },
  goldAnchor: Anchor | null
): string {
  const parts: string[] = [];

  parts.push(`## Current Goal\n${extracted.goal}`);

  if (goldAnchor) {
    parts.push(`## Last Stable Checkpoint (Gold Anchor)\n${goldAnchor.summary}`);
  }

  if (extracted.constraints) {
    parts.push(`## Active Constraints\n${extracted.constraints}`);
  }

  parts.push(
    `## Next 3 Concrete Steps\n${extracted.nextSteps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`
  );

  parts.push(
    `## Recovery Rule\nIf you drift, restate the goal anchor and continue from the last stable anchor.`
  );

  return parts.join("\n\n");
}

const DEFAULT_FORK_THRESHOLD = 64000;

export default function AutoForkConsole() {
  const [transcript, setTranscript] = useState("");
  const [anchors, setAnchors] = useState<Anchor[]>([]);
  const [eventLog, setEventLog] = useState<EventLogEntry[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState(() => generateId());
  const [forkThreshold, setForkThreshold] = useState(DEFAULT_FORK_THRESHOLD);
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Claudestorm integration state
  const [claudestormConnected, setClaudestormConnected] = useState(false);
  const [claudestormSessions, setClaudestormSessions] = useState<ClaudestormSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [loadingApi, setLoadingApi] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const savedAnchors = localStorage.getItem("autofork_anchors");
      const savedEventLog = localStorage.getItem("autofork_events");
      const savedSessionId = localStorage.getItem("autofork_sessionId");

      if (savedAnchors) setAnchors(JSON.parse(savedAnchors));
      if (savedEventLog) setEventLog(JSON.parse(savedEventLog));
      if (savedSessionId) setCurrentSessionId(savedSessionId);
      const savedThreshold = localStorage.getItem("autofork_threshold");
      if (savedThreshold) setForkThreshold(parseInt(savedThreshold, 10));
    } catch (e) {
      console.error("Failed to load from localStorage:", e);
    }
  }, []);

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
      localStorage.setItem("autofork_threshold", forkThreshold.toString());
    }
  }, [forkThreshold, mounted]);

  // Check claudestorm connection on mount
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
          // Fetch sessions list
          const sessionsRes = await fetch(`${CLAUDESTORM_API}/api/autofork/sessions?limit=10`);
          if (sessionsRes.ok) {
            const data = await sessionsRes.json();
            setClaudestormSessions(data.sessions || []);
          }
        }
      } catch {
        setClaudestormConnected(false);
      }
    };
    checkClaudestorm();
    // Poll every 30s
    const interval = setInterval(checkClaudestorm, 30000);
    return () => clearInterval(interval);
  }, [mounted]);

  const latestAnchor = anchors[0] || null;
  const goldAnchors = anchors.filter((a) => a.isGold);
  const lastGoldAnchor = goldAnchors[0] || null;

  const handleUpdate = useCallback(() => {
    if (!transcript.trim()) return;

    const tokenEstimate = Math.ceil(transcript.length / 4);
    const successSignal = checkSuccessSignal(transcript);
    const driftSignal = checkDriftSignal(transcript);
    const shouldFork = successSignal || tokenEstimate > forkThreshold || driftSignal;

    let status: Anchor["status"] = "stable";
    if (successSignal) status = "success";
    else if (driftSignal) status = "drifting";

    const extracted = extractAnchorSummary(transcript);

    let newSessionId = currentSessionId;
    let newEventLog = eventLog;

    if (shouldFork) {
      newSessionId = generateId();
      const reason = successSignal
        ? "success_signal"
        : tokenEstimate > forkThreshold
        ? `token_limit_exceeded (>${forkThreshold.toLocaleString()})`
        : "drift_detected";

      const newEvent: EventLogEntry = {
        id: generateId(),
        timestamp: new Date().toISOString(),
        message: `FORKED: reason=${reason}, newSessionId=${newSessionId.slice(0, 8)}`,
      };
      newEventLog = [newEvent, ...eventLog];
      setEventLog(newEventLog);
      setCurrentSessionId(newSessionId);
    }

    const resumePrompt = generateResumePrompt(extracted, lastGoldAnchor);

    const newAnchor: Anchor = {
      id: generateId(),
      createdAt: new Date().toISOString(),
      sessionId: newSessionId,
      tokenEstimate,
      status,
      summary: extracted.summary,
      resumePrompt,
      isGold: false,
    };

    setAnchors((prev) => [newAnchor, ...prev]);
    setTranscript("");
  }, [transcript, currentSessionId, eventLog, lastGoldAnchor, forkThreshold]);

  const handleMarkGold = useCallback(() => {
    if (!latestAnchor || latestAnchor.isGold) return;
    setAnchors((prev) =>
      prev.map((a) => (a.id === latestAnchor.id ? { ...a, isGold: true } : a))
    );
    const newEvent: EventLogEntry = {
      id: generateId(),
      timestamp: new Date().toISOString(),
      message: `MARKED_GOLD: anchorId=${latestAnchor.id.slice(0, 8)}`,
    };
    setEventLog((prev) => [newEvent, ...prev]);
  }, [latestAnchor]);

  const handleClearAll = useCallback(() => {
    setAnchors([]);
    setEventLog([]);
    setCurrentSessionId(generateId());
    setTranscript("");
    localStorage.removeItem("autofork_anchors");
    localStorage.removeItem("autofork_events");
    localStorage.removeItem("autofork_sessionId");
  }, []);

  const handleCopyResume = useCallback(async () => {
    if (!latestAnchor) return;
    try {
      await navigator.clipboard.writeText(latestAnchor.resumePrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error("Failed to copy:", e);
    }
  }, [latestAnchor]);

  const handleLoadTranscript = useCallback(async () => {
    try {
      const res = await fetch("/transcripts/spacecar_excerpt_80k.txt");
      if (res.ok) {
        const text = await res.text();
        setTranscript(text);
      }
    } catch (e) {
      console.error("Failed to load transcript:", e);
    }
  }, []);

  const handleFetchFromClaudestorm = useCallback(async () => {
    if (!selectedSessionId) return;
    setLoadingApi(true);
    try {
      // Fetch session detail and anchor data in parallel
      const [detailRes, anchorRes] = await Promise.all([
        fetch(`${CLAUDESTORM_API}/api/autofork/session/${selectedSessionId}`),
        fetch(`${CLAUDESTORM_API}/api/autofork/session/${selectedSessionId}/anchor`)
      ]);

      if (!detailRes.ok || !anchorRes.ok) {
        throw new Error("Failed to fetch session data");
      }

      const detail: ClaudestormSessionDetail = await detailRes.json();
      const anchorData: ClaudestormAnchorData = await anchorRes.json();

      // DEBUG
      console.log("=== CLAUDESTORM RESPONSE ===");
      console.log("recent_user_messages:", anchorData.recent_user_messages);
      console.log("files_touched:", anchorData.files_touched);
      console.log("goal length:", anchorData.goal?.length);

      // Determine status from signals
      let status: Anchor["status"] = "stable";
      if (detail.success_signals.length > 0) status = "success";
      else if (detail.drift_signals.length > 0) status = "drifting";

      // Build summary from API data
      const summaryParts: string[] = [];

      // Task/Goal
      if (anchorData.session_summary) {
        summaryParts.push(`TASK: ${anchorData.session_summary.slice(0, 200)}`);
      }
      summaryParts.push(`GOAL: ${anchorData.goal.slice(0, 300)}`);

      // Files being worked on
      if (anchorData.files_touched.length > 0) {
        summaryParts.push(`FILES: ${anchorData.files_touched.join(", ")}`);
      }

      // Recent context
      if (anchorData.recent_user_messages.length > 0) {
        summaryParts.push(`RECENT USER: ${anchorData.recent_user_messages[0].slice(0, 150)}...`);
      }

      // Blockers
      if (anchorData.blockers.length > 0) {
        summaryParts.push(`BLOCKERS (${anchorData.blockers.length}): ${anchorData.blockers[0].slice(0, 150)}...`);
      }

      // Signals
      if (detail.drift_signals.length > 0) {
        summaryParts.push(`⚠ DRIFT: ${detail.drift_signals.join(", ")}`);
      }
      if (detail.success_signals.length > 0) {
        summaryParts.push(`✓ SUCCESS: ${detail.success_signals.join(", ")}`);
      }

      const summary = summaryParts.join("\n");

      // DEBUG
      console.log("=== BUILT SUMMARY ===");
      console.log(summary);

      // Generate resume prompt
      const resumeParts: string[] = [];

      // Goal/Task
      if (anchorData.session_summary) {
        resumeParts.push(`## Task\n${anchorData.session_summary}`);
      }
      resumeParts.push(`## Current Goal\n${anchorData.goal.slice(0, 500)}`);

      // Gold anchor fallback
      if (lastGoldAnchor) {
        resumeParts.push(`## Last Stable Checkpoint (Gold Anchor)\n${lastGoldAnchor.summary}`);
      }

      // Current context
      if (anchorData.files_touched.length > 0) {
        resumeParts.push(`## Files in Progress\n${anchorData.files_touched.map(f => `- ${f}`).join("\n")}`);
      }

      // Recent activity
      if (anchorData.recent_user_messages.length > 0) {
        resumeParts.push(`## Recent Context\nLast user request: ${anchorData.recent_user_messages[0].slice(0, 200)}`);
      }

      // Blockers
      if (anchorData.blockers.length > 0) {
        resumeParts.push(`## Current Blockers\n${anchorData.blockers.slice(0, 3).map((b, i) => `${i + 1}. ${b.slice(0, 150)}`).join("\n")}`);
      }

      // Next steps based on context
      const nextSteps = [];
      if (anchorData.blockers.length > 0) {
        nextSteps.push("Address the blockers listed above");
      }
      if (anchorData.files_touched.length > 0) {
        nextSteps.push(`Continue work on ${anchorData.files_touched[0]}`);
      }
      nextSteps.push("Verify changes work as expected");
      resumeParts.push(`## Next Steps\n${nextSteps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`);

      // Recovery rule
      resumeParts.push(`## Recovery Rule\nIf you drift or get stuck, restate the goal anchor and continue from the last stable checkpoint.`);

      const resumePrompt = resumeParts.join("\n\n");

      // Check if should fork
      const shouldFork = detail.should_fork || detail.stats.total_tokens > forkThreshold;
      let newSessionId = currentSessionId;

      if (shouldFork) {
        newSessionId = generateId();
        const reasons = [...detail.drift_signals, ...detail.success_signals];
        if (detail.stats.total_tokens > forkThreshold) reasons.push("token_limit");
        const newEvent: EventLogEntry = {
          id: generateId(),
          timestamp: new Date().toISOString(),
          message: `FORKED (via API): reasons=[${reasons.join(", ")}], newSessionId=${newSessionId.slice(0, 8)}`,
        };
        setEventLog((prev) => [newEvent, ...prev]);
        setCurrentSessionId(newSessionId);
      }

      const newAnchor: Anchor = {
        id: generateId(),
        createdAt: new Date().toISOString(),
        sessionId: newSessionId,
        tokenEstimate: detail.stats.total_tokens,
        status,
        summary,
        resumePrompt,
        isGold: false,
      };

      console.log("=== CREATING ANCHOR ===");
      console.log("summary:", newAnchor.summary);
      console.log("status:", newAnchor.status);

      setAnchors((prev) => {
        console.log("Previous anchors:", prev.length);
        const updated = [newAnchor, ...prev];
        console.log("New anchors:", updated.length);
        return updated;
      });

      // Log the fetch
      const fetchEvent: EventLogEntry = {
        id: generateId(),
        timestamp: new Date().toISOString(),
        message: `FETCHED: claudestorm session ${selectedSessionId.slice(0, 8)}, ${detail.stats.total_tokens} tokens`,
      };
      setEventLog((prev) => [fetchEvent, ...prev]);

    } catch (e) {
      console.error("Failed to fetch from claudestorm:", e);
    } finally {
      setLoadingApi(false);
    }
  }, [selectedSessionId, currentSessionId, forkThreshold, lastGoldAnchor]);

  const getStatusColor = (status: Anchor["status"]) => {
    switch (status) {
      case "success":
        return "bg-emerald-500";
      case "drifting":
        return "bg-amber-500";
      default:
        return "bg-sky-500";
    }
  };

  const getStatusBg = (status: Anchor["status"]) => {
    switch (status) {
      case "success":
        return "bg-emerald-500/10 border-emerald-500/30";
      case "drifting":
        return "bg-amber-500/10 border-amber-500/30";
      default:
        return "bg-sky-500/10 border-sky-500/30";
    }
  };

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
        <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-sky-400 to-violet-400 bg-clip-text text-transparent mb-2">
          AutoFork Console
        </h1>
        <p className="text-zinc-500 text-sm">Self-improving agent memory system</p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-zinc-900 rounded-full border border-zinc-800">
            <span className="text-xs text-zinc-500">fork @</span>
            <input
              type="number"
              value={forkThreshold}
              onChange={(e) => setForkThreshold(Math.max(1000, parseInt(e.target.value, 10) || DEFAULT_FORK_THRESHOLD))}
              className="w-20 bg-zinc-800 border border-zinc-700 rounded px-2 py-0.5 text-xs text-zinc-200 font-mono text-center focus:outline-none focus:ring-1 focus:ring-sky-500"
              min={1000}
              step={1000}
            />
            <span className="text-xs text-zinc-500">tokens</span>
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-zinc-900 rounded-full border border-zinc-800">
            <span className={`w-2 h-2 rounded-full ${claudestormConnected ? "bg-emerald-500 animate-pulse" : "bg-zinc-600"}`} />
            <span className="text-xs text-zinc-400">{claudestormConnected ? "Claudestorm" : "Offline"}</span>
          </div>
        </div>
      </header>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8 max-w-7xl mx-auto">
        {/* Left: Transcript Input */}
        <div className="bg-zinc-900/50 rounded-xl p-5 border border-zinc-800/50 backdrop-blur">
          <h2 className="text-sm font-semibold mb-3 text-zinc-300 uppercase tracking-wide">
            Transcript Input
          </h2>
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder={`Paste your agent transcript here...\n\nExample content:\nGoal: Build a user dashboard\nStep 1: Create layout components\nStep 2: Add data fetching\nConstraint: Must use TypeScript\nError: Module not found`}
            className="w-full h-56 md:h-64 bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-4 text-zinc-100 placeholder-zinc-600 resize-none focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500/50 font-mono text-sm transition-all"
          />
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              onClick={handleUpdate}
              disabled={!transcript.trim()}
              className="px-5 py-2.5 bg-sky-600 hover:bg-sky-500 disabled:bg-zinc-700 disabled:text-zinc-500 rounded-lg font-medium transition-all shadow-lg shadow-sky-500/20 disabled:shadow-none"
            >
              Parse Transcript
            </button>
            <button
              onClick={handleClearAll}
              className="px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg font-medium transition-all"
            >
              Clear All
            </button>
          </div>

          {/* Claudestorm Integration - Primary */}
          {claudestormConnected && claudestormSessions.length > 0 && (
            <div className="mt-4 p-4 bg-emerald-950/30 rounded-lg border border-emerald-800/50">
              <div className="text-xs text-emerald-400 font-medium mb-2">LIVE SESSIONS</div>
              <div className="flex flex-wrap gap-2">
                <select
                  value={selectedSessionId || ""}
                  onChange={(e) => setSelectedSessionId(e.target.value || null)}
                  className="flex-1 min-w-[200px] px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="">Select a session...</option>
                  {claudestormSessions.map((s) => (
                    <option key={s.session_id} value={s.session_id}>
                      {s.total_tokens.toLocaleString()} tok · {s.message_count} msgs · {s.session_id.slice(0, 8)}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleFetchFromClaudestorm}
                  disabled={!selectedSessionId || loadingApi}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-500 rounded-lg text-sm font-medium transition-all shadow-lg shadow-emerald-500/20 disabled:shadow-none"
                >
                  {loadingApi ? "Fetching..." : "Create Anchor"}
                </button>
              </div>
            </div>
          )}

          {/* Manual fallback */}
          {!claudestormConnected && (
            <div className="mt-4 p-3 bg-zinc-800/30 rounded-lg border border-zinc-700/30">
              <p className="text-xs text-zinc-500 mb-2">Claudestorm offline — using manual mode</p>
              <button
                onClick={handleLoadTranscript}
                className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-sm font-medium transition-all"
              >
                Load Sample Transcript
              </button>
            </div>
          )}

          {transcript && (
            <div className="mt-3 text-xs text-zinc-500">
              <span className={Math.ceil(transcript.length / 4) > forkThreshold ? "text-amber-400" : ""}>
                ~{Math.ceil(transcript.length / 4).toLocaleString()}
              </span>
              <span className="text-zinc-600"> / {forkThreshold.toLocaleString()} tokens</span>
              {Math.ceil(transcript.length / 4) > forkThreshold && (
                <span className="text-amber-400 ml-2">→ will fork</span>
              )}
            </div>
          )}
        </div>

        {/* Right: Latest Anchor Card */}
        <div className="bg-zinc-900/50 rounded-xl p-5 border border-zinc-800/50 backdrop-blur">
          <h2 className="text-sm font-semibold mb-3 text-zinc-300 uppercase tracking-wide">
            Latest Anchor
          </h2>
          {latestAnchor ? (
            <div className="space-y-4">
              {/* Status Row */}
              <div className={`flex items-center gap-3 p-3 rounded-lg border ${getStatusBg(latestAnchor.status)}`}>
                <span
                  className={`px-2.5 py-1 text-xs font-bold rounded uppercase ${getStatusColor(latestAnchor.status)} text-white`}
                >
                  {latestAnchor.status}
                </span>
                {latestAnchor.isGold && (
                  <span className="px-2.5 py-1 text-xs font-bold rounded bg-amber-500 text-white uppercase">
                    Gold
                  </span>
                )}
                <span className="text-xs text-zinc-400 ml-auto font-mono">
                  ~{latestAnchor.tokenEstimate.toLocaleString()} tokens
                </span>
              </div>

              {/* Summary */}
              <div className="bg-zinc-800/50 rounded-lg p-4 border border-zinc-700/50">
                <h3 className="text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wide">Summary</h3>
                <pre className="text-sm text-zinc-200 whitespace-pre-wrap font-mono leading-relaxed">
                  {latestAnchor.summary}
                </pre>
              </div>

              {/* Resume Prompt */}
              <div className="bg-zinc-800/50 rounded-lg p-4 border border-zinc-700/50">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Resume Prompt</h3>
                  <button
                    onClick={handleCopyResume}
                    className={`text-xs px-3 py-1.5 rounded-md font-medium transition-all ${
                      copied
                        ? "bg-emerald-600 text-white"
                        : "bg-zinc-700 hover:bg-zinc-600 text-zinc-200"
                    }`}
                  >
                    {copied ? "Copied!" : "Copy Resume Prompt"}
                  </button>
                </div>
                <pre className="text-sm text-zinc-300 whitespace-pre-wrap font-mono max-h-36 overflow-y-auto leading-relaxed">
                  {latestAnchor.resumePrompt}
                </pre>
              </div>

              {/* Actions */}
              <button
                onClick={handleMarkGold}
                disabled={latestAnchor.isGold}
                className={`w-full px-4 py-2.5 text-sm rounded-lg font-medium transition-all ${
                  latestAnchor.isGold
                    ? "bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700"
                    : "bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white shadow-lg shadow-amber-500/20"
                }`}
              >
                {latestAnchor.isGold ? "Already Marked as Gold" : "Mark Last Anchor Gold"}
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-zinc-500 text-sm">No anchors yet</p>
              <p className="text-zinc-600 text-xs mt-1">Paste a transcript and click Update</p>
            </div>
          )}
        </div>
      </div>

      {/* Bottom: Timeline & Event Log */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-7xl mx-auto">
        {/* Anchor Timeline */}
        <div className="bg-zinc-900/50 rounded-xl p-5 border border-zinc-800/50 backdrop-blur">
          <h2 className="text-sm font-semibold mb-4 text-zinc-300 uppercase tracking-wide flex items-center gap-2">
            Anchor Timeline
            <span className="px-2 py-0.5 bg-zinc-800 rounded-full text-xs font-normal text-zinc-400">
              {anchors.length}
            </span>
          </h2>
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {anchors.length === 0 ? (
              <p className="text-zinc-600 text-sm text-center py-8">No anchors recorded</p>
            ) : (
              anchors.map((anchor, idx) => (
                <div
                  key={anchor.id}
                  className={`bg-zinc-800/50 rounded-lg p-3 flex items-start gap-3 border transition-all hover:border-zinc-600 ${
                    idx === 0 ? "border-sky-500/30" : "border-zinc-700/50"
                  }`}
                >
                  <div className="flex flex-col items-center gap-1 pt-1">
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${getStatusColor(anchor.status)}`} />
                    {idx < anchors.length - 1 && (
                      <div className="w-px h-8 bg-zinc-700" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-xs text-zinc-500 font-mono">
                        {new Date(anchor.createdAt).toLocaleTimeString()}
                      </span>
                      <span className="text-xs text-zinc-600 font-mono">
                        #{anchor.sessionId.slice(0, 6)}
                      </span>
                      {anchor.isGold && (
                        <span className="text-amber-400 text-xs">★ gold</span>
                      )}
                    </div>
                    <p className="text-sm text-zinc-300 line-clamp-2">
                      {anchor.summary.split("\n")[0] || "No summary"}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Event Log */}
        <div className="bg-zinc-900/50 rounded-xl p-5 border border-zinc-800/50 backdrop-blur">
          <h2 className="text-sm font-semibold mb-4 text-zinc-300 uppercase tracking-wide flex items-center gap-2">
            Event Log
            <span className="px-2 py-0.5 bg-zinc-800 rounded-full text-xs font-normal text-zinc-400">
              {eventLog.length}
            </span>
          </h2>
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {eventLog.length === 0 ? (
              <p className="text-zinc-600 text-sm text-center py-8">No events recorded</p>
            ) : (
              eventLog.map((event) => (
                <div
                  key={event.id}
                  className="bg-zinc-800/50 rounded-lg p-3 text-sm border border-zinc-700/50 font-mono"
                >
                  <span className="text-zinc-500 mr-3">
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </span>
                  <span className={`${
                    event.message.includes("FORKED")
                      ? "text-violet-400"
                      : event.message.includes("GOLD")
                      ? "text-amber-400"
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
        AutoFork Console v1.0 — Agent memory persistence layer
      </footer>
    </div>
  );
}
