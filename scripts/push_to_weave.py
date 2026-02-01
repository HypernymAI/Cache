#!/usr/bin/env python3
"""
Push AutoFork anchors to Weave for observability.

Usage:
    source .env.weave && .venv-weave/bin/python scripts/push_to_weave.py
"""
import os
import re
import requests
import weave

# Config
AUTOFORK_API = "http://localhost:8100"
WEAVE_PROJECT = "autofork-console"


def detect_tech_stack(text: str) -> list[str]:
    """Extract tech stack from input/output text."""
    patterns = {
        "nextjs": r"next\.?js|app\s*router",
        "react": r"\breact\b",
        "typescript": r"typescript|\.tsx?",
        "python": r"\bpython\b|\.py\b|pytest|fastapi|uvicorn",
        "tailwind": r"tailwind",
        "sqlite": r"sqlite",
        "postgres": r"postgres|psql",
        "docker": r"docker",
        "vercel": r"vercel",
        "git": r"\bgit\b|commit|push|branch",
    }
    found = []
    lower = text.lower()
    for tech, pattern in patterns.items():
        if re.search(pattern, lower):
            found.append(tech)
    return found[:5]  # Limit


def detect_goal_type(text: str) -> str:
    """Categorize the goal type."""
    lower = text.lower()
    if any(w in lower for w in ["deploy", "vercel", "netlify", "production"]):
        return "deploy"
    if any(w in lower for w in ["test", "pytest", "jest", "spec"]):
        return "testing"
    if any(w in lower for w in ["auth", "login", "session", "jwt", "oauth"]):
        return "auth"
    if any(w in lower for w in ["api", "endpoint", "route", "rest"]):
        return "api"
    if any(w in lower for w in ["ui", "component", "button", "form", "page"]):
        return "ui"
    if any(w in lower for w in ["fix", "bug", "error", "issue"]):
        return "bugfix"
    if any(w in lower for w in ["refactor", "cleanup", "improve"]):
        return "refactor"
    if any(w in lower for w in ["database", "db", "sql", "migration"]):
        return "database"
    return "feature"


@weave.op()
def log_successful_pattern(
    input: str,
    output: str,
    success_type: str,
    goal_type: str,
    tech_stack: list[str],
    tokens: int,
    is_gold: bool,
    session_id: str
):
    """Log a successful pattern to Weave for agent retrieval."""
    return {
        "input": input,
        "output": output,
        "success_type": success_type,
        "goal_type": goal_type,
        "tech_stack": tech_stack,
        "tokens": tokens,
        "is_gold": is_gold,
        "session_id": session_id
    }


def main():
    # Init weave
    weave.init(WEAVE_PROJECT)
    print(f"Connected to Weave project: {WEAVE_PROJECT}")

    # Fetch anchors from AutoFork API
    try:
        resp = requests.get(f"{AUTOFORK_API}/api/autofork/anchors/export?limit=50")
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        print(f"Failed to fetch anchors: {e}")
        return

    anchors = data.get("anchors", [])
    print(f"Found {len(anchors)} anchors to push")

    # Push each anchor with rich categorization
    for anchor in anchors:
        combined_text = f"{anchor['input']} {anchor['output']}"
        tech_stack = detect_tech_stack(combined_text)
        goal_type = detect_goal_type(combined_text)

        result = log_successful_pattern(
            input=anchor["input"],
            output=anchor["output"],
            success_type=anchor["success_type"],
            goal_type=goal_type,
            tech_stack=tech_stack,
            tokens=anchor["tokens"],
            is_gold=anchor["is_gold"],
            session_id=anchor.get("session_id", "unknown")
        )
        print(f"  {goal_type}/{anchor['success_type']}: {tech_stack}")

    print(f"\nDone! {len(anchors)} patterns pushed")
    print(f"View: https://wandb.ai/hypernymai/{WEAVE_PROJECT}/weave")
    print(f"\nAgents can query via W&B MCP: 'show successful {anchors[0].get('success_type', 'deploy')} patterns'" if anchors else "")


if __name__ == "__main__":
    main()
