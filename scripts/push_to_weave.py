#!/usr/bin/env python3
"""
Push AutoFork anchors to Weave for observability.

Usage:
    source .env.weave && .venv-weave/bin/python scripts/push_to_weave.py
"""
import os
import requests
import weave

# Config
AUTOFORK_API = "http://localhost:8100"
WEAVE_PROJECT = "autofork-console"


@weave.op()
def log_anchor(input: str, output: str, success_type: str, tokens: int, is_gold: bool):
    """Log a single anchor as a Weave operation."""
    return {
        "input": input,
        "output": output,
        "success_type": success_type,
        "tokens": tokens,
        "is_gold": is_gold
    }


def main():
    # Init weave
    weave.init(WEAVE_PROJECT)
    print(f"Connected to Weave project: {WEAVE_PROJECT}")

    # Fetch anchors from AutoFork API
    try:
        resp = requests.get(f"{AUTOFORK_API}/api/autofork/anchors/export?limit=20")
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        print(f"Failed to fetch anchors: {e}")
        return

    anchors = data.get("anchors", [])
    print(f"Found {len(anchors)} anchors to push")

    # Push each anchor to Weave
    for anchor in anchors:
        result = log_anchor(
            input=anchor["input"],
            output=anchor["output"],
            success_type=anchor["success_type"],
            tokens=anchor["tokens"],
            is_gold=anchor["is_gold"]
        )
        print(f"  Logged: {anchor['success_type']} ({anchor['tokens']} tokens)")

    print(f"\nDone! View at: https://wandb.ai/hypernymai/{WEAVE_PROJECT}/weave")


if __name__ == "__main__":
    main()
