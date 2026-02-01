import { NextRequest, NextResponse } from "next/server";

const CLAUDESTORM_API = "http://localhost:8100";

interface SuccessEvent {
  type: "git_commit" | "tests_passed" | "deploy_success" | "user_confirmation" | "build_success";
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
  user_anchor: {
    // Explicit "magic" trigger - user deliberately marking a checkpoint
    input: /#?magic/i,
    confidence: 0.8,
  },
  build_success: {
    // Require specific build success messages with timing
    output: /compiled successfully in \d|Build succeeded|✓ Built in \d+/i,
    exclude: /error|fail/i,
    confidence: 0.8,
  },
};

function detectSuccessEvents(
  recentUserMessages: string[],
  recentAssistantMessages: string[],
  toolResults: string[]
): SuccessEvent[] {
  const events: SuccessEvent[] = [];
  const now = new Date().toISOString();

  // Check for explicit "magic" trigger
  for (const msg of recentUserMessages) {
    if (PATTERNS.user_anchor.input?.test(msg)) {
      events.push({
        type: "user_confirmation",
        timestamp: now,
        details: "magic checkpoint",
        confidence: PATTERNS.user_anchor.confidence,
      });
      break;
    }
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

    const events = detectSuccessEvents(
      anchor.recent_user_messages || [],
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
