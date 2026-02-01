import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";

interface AnchorPayload {
  input: string;
  output: string;
  success_type: string;
  tokens: number;
  is_gold: boolean;
  session_id: string;
}

function loadEnvWeave(): Record<string, string> {
  try {
    const envPath = path.join(process.cwd(), ".env.weave");
    const content = fs.readFileSync(envPath, "utf-8");
    const vars: Record<string, string> = {};
    for (const line of content.split("\n")) {
      if (line.startsWith("#") || !line.includes("=")) continue;
      const [key, ...rest] = line.split("=");
      vars[key.trim()] = rest.join("=").trim();
    }
    return vars;
  } catch {
    return {};
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const venvPython = path.join(process.cwd(), ".venv-weave", "bin", "python");
  const weaveEnv = loadEnvWeave();

  // Check if we have anchor data in request body
  let anchor: AnchorPayload | null = null;
  try {
    const body = await request.json();
    if (body.anchor) {
      anchor = body.anchor;
    }
  } catch {
    // No body or invalid JSON
  }

  if (anchor) {
    // Direct push: create inline Python script
    const pythonScript = `
import weave
import os

weave.init('autofork-console')

@weave.op()
def log_pattern(input: str, output: str, success_type: str, tokens: int, is_gold: bool, session_id: str):
    return {
        "input": input,
        "output": output,
        "success_type": success_type,
        "tokens": tokens,
        "is_gold": is_gold,
        "session_id": session_id
    }

result = log_pattern(
    input=${JSON.stringify(anchor.input)},
    output=${JSON.stringify(anchor.output)},
    success_type=${JSON.stringify(anchor.success_type)},
    tokens=${anchor.tokens},
    is_gold=${anchor.is_gold ? "True" : "False"},
    session_id=${JSON.stringify(anchor.session_id)}
)
print(f"Pushed to Weave: {result.get('success_type', 'unknown')}")
`;

    return new Promise<NextResponse>((resolve) => {
      const proc = spawn(venvPython, ["-c", pythonScript], {
        env: { ...process.env, ...weaveEnv },
        cwd: process.cwd(),
      });

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (data) => { stdout += data.toString(); });
      proc.stderr.on("data", (data) => { stderr += data.toString(); });

      proc.on("close", (code) => {
        if (code === 0) {
          resolve(NextResponse.json({
            success: true,
            output: stdout,
            pushed: anchor?.success_type,
          }));
        } else {
          resolve(NextResponse.json(
            { success: false, error: stderr || "Push failed", output: stdout },
            { status: 500 }
          ));
        }
      });

      setTimeout(() => {
        proc.kill();
        resolve(NextResponse.json({ success: false, error: "Timeout" }, { status: 504 }));
      }, 15000);
    });
  }

  // Fallback: run full script (for bulk push)
  const scriptPath = path.join(process.cwd(), "scripts", "push_to_weave.py");

  return new Promise<NextResponse>((resolve) => {
    const proc = spawn(venvPython, [scriptPath], {
      env: { ...process.env, ...weaveEnv },
      cwd: process.cwd(),
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => { stdout += data.toString(); });
    proc.stderr.on("data", (data) => { stderr += data.toString(); });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve(NextResponse.json({ success: true, output: stdout }));
      } else {
        resolve(NextResponse.json(
          { success: false, error: stderr || "Push failed", output: stdout },
          { status: 500 }
        ));
      }
    });

    setTimeout(() => {
      proc.kill();
      resolve(NextResponse.json({ success: false, error: "Timeout" }, { status: 504 }));
    }, 30000);
  });
}

export async function GET() {
  return NextResponse.json({
    message: "POST to push anchors to Weave. Include {anchor: {...}} for direct push.",
  });
}
