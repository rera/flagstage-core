import { spawn } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { frameUntrusted } from "@flagstage/ai";

import { buildPrompt } from "./prompt";

export interface AgentRunner {
  readonly name: "mock" | "subprocess";
  edit(
    files: Map<string, Uint8Array>,
    request: string
  ): Promise<{ changed: boolean; files: Map<string, Uint8Array> }>;
}

export const skillsDirectory = join(dirname(fileURLToPath(import.meta.url)), "..", "skills");

function walk(dir: string, root = dir): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) found.push(...walk(full, root));
    else found.push(relative(root, full));
  }
  return found;
}

export async function runSubprocessEdit(input: {
  bin: string;
  args?: string[];
  files: Map<string, Uint8Array>;
  request: string;
  env: Record<string, string>;
  timeoutMs: number;
  skillsDir?: string;
}): Promise<{ changed: boolean; files: Map<string, Uint8Array> }> {
  const dir = mkdtempSync(join(tmpdir(), "flagstage-turn-"));
  try {
    for (const [path, body] of input.files) {
      const full = join(dir, path);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, body);
    }
    mkdirSync(join(dir, ".flagstage"), { recursive: true });
    writeFileSync(join(dir, ".flagstage", "request.md"), buildPrompt(input.request));
    if (input.skillsDir) {
      for (const path of walk(input.skillsDir)) {
        const target = join(dir, ".flagstage", "skills", path);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, readFileSync(join(input.skillsDir, path)));
      }
    }
    const code = await new Promise<number>((resolve, reject) => {
      const child = spawn(input.bin, input.args ?? ["run"], {
        cwd: dir,
        env: input.env as NodeJS.ProcessEnv,
        stdio: "ignore",
        timeout: input.timeoutMs
      });
      child.on("error", reject);
      child.on("close", (status) => resolve(status ?? 1));
    });
    if (code !== 0) throw new Error(`The editor exited with status ${code}.`);
    const next = new Map<string, Uint8Array>();
    for (const path of walk(dir)) {
      if (path === ".flagstage" || path.startsWith(`.flagstage${"/"}`)) continue;
      next.set(path, new Uint8Array(readFileSync(join(dir, path))));
    }
    let changed = next.size !== input.files.size;
    if (!changed) {
      for (const [path, body] of input.files) {
        const written = next.get(path);
        if (!written || Buffer.compare(written, body) !== 0) {
          changed = true;
          break;
        }
      }
    }
    return { changed, files: next };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function subprocessRunner(options: {
  bin?: string;
  env: Record<string, string>;
  timeoutMs: number;
  skillsDir?: string;
}): AgentRunner {
  return {
    name: "subprocess",
    edit(files, request) {
      return runSubprocessEdit({
        bin: options.bin ?? "opencode",
        files,
        request,
        env: options.env,
        timeoutMs: options.timeoutMs,
        skillsDir: options.skillsDir
      });
    }
  };
}

export function promptPreview(request: string): string {
  return frameUntrusted(request);
}
