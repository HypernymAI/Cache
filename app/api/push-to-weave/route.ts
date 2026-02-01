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

export async function POST(): Promise<NextResponse> {
  // Run the push_to_weave.py script
  const scriptPath = path.join(process.cwd(), "scripts", "push_to_weave.py");
  const venvPython = path.join(process.cwd(), ".venv-weave", "bin", "python");
  const weaveEnv = loadEnvWeave();

  return new Promise<NextResponse>((resolve) => {
    const proc = spawn(venvPython, [scriptPath], {
      env: {
        ...process.env,
        ...weaveEnv,
      },
      cwd: process.cwd(),
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve(
          NextResponse.json({
            success: true,
            output: stdout,
          })
        );
      } else {
        resolve(
          NextResponse.json(
            {
              success: false,
              error: stderr || "Push failed",
              output: stdout,
            },
            { status: 500 }
          )
        );
      }
    });

    // Timeout after 30s
    setTimeout(() => {
      proc.kill();
      resolve(
        NextResponse.json(
          { success: false, error: "Timeout" },
          { status: 504 }
        )
      );
    }, 30000);
  });
}

export async function GET() {
  return NextResponse.json({
    message: "POST to this endpoint to push anchors to Weave",
  });
}
