import { NextRequest, NextResponse } from "next/server";

const CLAUDESTORM_API = "http://localhost:8100";

interface SuccessEvent {
  type: "git_commit" | "tests_passed" | "deploy_success" | "user_confirmation" | "build_success" | "session_start" | "checkpoint" | "issue";
  timestamp: string;
  details: string;
  confidence: number;
}

// Deterministic success detection patterns - STRICT to avoid noise
const PATTERNS = {
  git_commit: {
    // Only match actual git commit output: [branch hash] message
    output: /\[[\w\/-]+\s+[a-f0-9]{7,}\]\s+\S+/i,
    confidence: 0.9,
  },
  tests_passed: {
    // Require actual test count, not just "pass" anywhere
    output: /(\d+)\s+(tests?|specs?)\s+pass(ed|ing)?|✓\s+\d+\s+(tests?|passing)|PASSED.*\d+/i,
    exclude: /fail(ed|ing)?:\s*[1-9]|error/i,
    confidence: 0.85,
  },
  deploy_success: {
    // Require actual deployment URL
    output: /https:\/\/[\w-]+\.(vercel\.app|netlify\.app|railway\.app)/i,
    confidence: 0.95,
  },
  session_start: {
    // #magic at start = new session/context
    input: /^#magic/i,
    confidence: 0.9,
  },
  checkpoint: {
    // "magic" anywhere = checkpoint (word boundary to avoid "magical" etc)
    input: /\bmagic\b/i,
    confidence: 0.8,
  },
  issue: {
    // Negative signals - something went wrong
    input: /^(bad|stuck|broken|failed|ugh|damn|shit|fuck|this is wrong|not working)/i,
    confidence: 0.7,
  },
  build_success: {
    // Require specific build success messages with timing
    output: /compiled successfully in \d|Build succeeded|✓ Built in \d+/i,
    exclude: /error|fail/i,
    confidence: 0.8,
  },
};

// Simple hash for stable event IDs
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

function detectSuccessEvents(
  recentUserMessages: string[],
  recentAssistantMessages: string[],
  toolResults: string[]
): SuccessEvent[] {
  const events: SuccessEvent[] = [];
  const seenHashes = new Set<string>();
  const now = new Date().toISOString();

  // Check for magic triggers and issues
  // Use message index for uniqueness so each occurrence in recent messages is separate
  let msgIndex = 0;
  for (const msg of recentUserMessages) {
    const msgId = `${msgIndex}-${hashString(msg)}`; // Index + hash for uniqueness within this request

    // Session start: #magic at beginning
    if (PATTERNS.session_start.input?.test(msg)) {
      if (!seenHashes.has(msgId)) {
        seenHashes.add(msgId);
        events.push({
          type: "session_start",
          timestamp: now,
          details: `${msg.slice(0, 50).replace(/[#\n]/g, '').trim()}`,
          confidence: PATTERNS.session_start.confidence,
        });
      }
    }
    // Checkpoint: "magic" anywhere
    else if (PATTERNS.checkpoint.input?.test(msg)) {
      if (!seenHashes.has(msgId)) {
        seenHashes.add(msgId);
        events.push({
          type: "checkpoint",
          timestamp: now,
          details: `${msg.slice(0, 50).replace(/[#\n]/g, '').trim()}`,
          confidence: PATTERNS.checkpoint.confidence,
        });
      }
    }
    // Issue: negative signals
    else if (PATTERNS.issue.input?.test(msg)) {
      if (!seenHashes.has(msgId)) {
        seenHashes.add(msgId);
        events.push({
          type: "issue",
          timestamp: now,
          details: `${msg.slice(0, 50).replace(/[#\n]/g, '').trim()}`,
          confidence: PATTERNS.issue.confidence,
        });
      }
    }
    msgIndex++;
  }

  // Check tool outputs for success patterns
  const combinedOutput = [...recentAssistantMessages, ...toolResults].join("\n");

  // Git commits - extract hash and message
  // Match raw git output [branch hash] OR Claude's summary "commit `hash`"
  const commitMatch = combinedOutput.match(/\[([\w\/-]+)\s+([a-f0-9]{7,})\]\s+(.+?)(?:\n|$)/i)
    || combinedOutput.match(/commit\s+[`'"]?([a-f0-9]{7,})[`'"]?/i);
  if (commitMatch) {
    // Handle both formats: [branch hash] msg OR commit `hash`
    const hash = commitMatch[2] || commitMatch[1];
    const msg = commitMatch[3] || "committed";
    events.push({
      type: "git_commit",
      timestamp: now,
      details: `[${hash}] ${msg.slice(0, 40)}`,
      confidence: PATTERNS.git_commit.confidence,
    });
  }

  // Tests passed
  if (PATTERNS.tests_passed.output.test(combinedOutput) &&
      !PATTERNS.tests_passed.exclude?.test(combinedOutput)) {
    const match = combinedOutput.match(/(\d+)\s*(tests?\s+)?pass/i);
    events.push({
      type: "tests_passed",
      timestamp: now,
      details: match ? `${match[1]} tests passed` : "Tests passed",
      confidence: PATTERNS.tests_passed.confidence,
    });
  }

  // Deploy success
  if (PATTERNS.deploy_success.output.test(combinedOutput)) {
    const urlMatch = combinedOutput.match(/https:\/\/[\w.-]+\.(vercel|netlify)\.app[^\s)"]*/);
    if (urlMatch) {
      events.push({
        type: "deploy_success",
        timestamp: now,
        details: urlMatch[0],
        confidence: PATTERNS.deploy_success.confidence,
      });
    }
  }

  // Build success
  if (PATTERNS.build_success.output.test(combinedOutput) &&
      !PATTERNS.build_success.exclude?.test(combinedOutput)) {
    events.push({
      type: "build_success",
      timestamp: now,
      details: "Build completed successfully",
      confidence: PATTERNS.build_success.confidence,
    });
  }

  return events;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const sinceTimestamp = request.nextUrl.searchParams.get("since_timestamp");

  // Skip claudestorm's success-events - use local detection for better commit matching
  // (Claudestorm endpoint exists but doesn't parse Claude's commit summaries)

  // Fallback: fetch anchor data and detect locally
  try {
    const anchorRes = await fetch(
      `${CLAUDESTORM_API}/api/autofork/session/${sessionId}/anchor`,
      { cache: "no-store" }
    );

    if (!anchorRes.ok) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    const anchor = await anchorRes.json();

    // Also check goal/summary for magic (session start trigger)
    const allUserMessages = [
      anchor.goal || "",
      anchor.session_summary || "",
      ...(anchor.recent_user_messages || [])
    ];

    const events = detectSuccessEvents(
      allUserMessages,
      anchor.recent_assistant_messages || [],
      anchor.blockers || [] // blockers contains tool output
    );

    // Filter by timestamp if provided
    const filteredEvents = sinceTimestamp
      ? events.filter((e) => e.timestamp > sinceTimestamp)
      : events;

    const totalConfidence = filteredEvents.reduce((sum, e) => sum + e.confidence, 0);
    const eventTypes = new Set(filteredEvents.map((e) => e.type));

    return NextResponse.json({
      session_id: sessionId,
      events: filteredEvents,
      event_count: filteredEvents.length,
      total_confidence: Math.round(totalConfidence * 100) / 100,
      should_auto_anchor: totalConfidence >= 1.5 || eventTypes.has("deploy_success"),
      should_mark_gold: totalConfidence >= 2.0 || eventTypes.has("deploy_success"),
      source: "local_detection", // Indicates fallback was used
    });
  } catch (e) {
    return NextResponse.json(
      { error: "Failed to detect success events" },
      { status: 500 }
    );
  }
}
