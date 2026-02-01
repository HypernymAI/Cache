import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";

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

export async function GET(): Promise<NextResponse> {
  const venvPython = path.join(process.cwd(), ".venv-weave", "bin", "python");
  const weaveEnv = loadEnvWeave();

  const pythonScript = `
import weave
import json
import os

# Bypass netrc parsing issues
os.environ['NETRC'] = '/dev/null'

client = weave.init('autofork-console')

# Get recent calls - fetch more to ensure we get newest
calls = list(client.get_calls(limit=200))

results = []
for call in calls:
  try:
    ts = None
    if hasattr(call, 'started_at') and call.started_at:
      ts = str(call.started_at)
    results.append({
      "id": call.id,
      "timestamp": ts,
      "op_name": call.op_name if hasattr(call, 'op_name') else "unknown",
      "inputs": call.inputs if hasattr(call, 'inputs') else {},
      "output": call.output if hasattr(call, 'output') else None,
    })
  except:
    pass

# Sort by timestamp descending (newest first)
results.sort(key=lambda x: x.get('timestamp') or '', reverse=True)

print(json.dumps(results))
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
        try {
          const calls = JSON.parse(stdout);
          resolve(NextResponse.json({ success: true, calls }));
        } catch {
          resolve(NextResponse.json({ success: true, calls: [], raw: stdout }));
        }
      } else {
        resolve(NextResponse.json(
          { success: false, error: stderr || "Query failed", calls: [] },
          { status: 500 }
        ));
      }
    });

    setTimeout(() => {
      proc.kill();
      resolve(NextResponse.json({ success: false, error: "Timeout", calls: [] }, { status: 504 }));
    }, 15000);
  });
}
