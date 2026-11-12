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
  readonly name: "subprocess";
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
    const model = input.env.AGENT_MODEL;
    const region = input.env.AWS_REGION ?? input.env.AWS_DEFAULT_REGION;
    if (model && region) {
      writeFileSync(
        join(dir, "opencode.json"),
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
          model: `amazon-bedrock/${model}`,
          provider: { "amazon-bedrock": { options: { region } } }
        })
      );
    }
    if (input.skillsDir) {
      for (const path of walk(input.skillsDir)) {
        const target = join(dir, ".flagstage", "skills", path);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, readFileSync(join(input.skillsDir, path)));
      }
    }
    const childEnv = {
      ...input.env,
      OPENCODE_DISABLE_AUTOUPDATE: "1",
      OPENCODE_DISABLE_MODELS_FETCH: "1"
    };
    let stderr = "";
    const code = await new Promise<number>((resolve, reject) => {
      // `run --standalone` is the headless editor. `--auto` approves file
      // edits, because there is no terminal to ask. amazon-bedrock uses the
      // task role. There is no API key.
      const child = spawn(input.bin, input.args ?? headlessArgs(input.request, model), {
        cwd: dir,
        env: childEnv as unknown as NodeJS.ProcessEnv,
        stdio: ["ignore", "pipe", "pipe"],
        timeout: input.timeoutMs
      });
      child.stdout?.on("data", () => undefined);
      child.stderr?.on("data", (chunk: Buffer) => {
        if (stderr.length < 4000) stderr += chunk.toString("utf8");
      });
      child.on("error", reject);
      child.on("close", (status) => {
        if (status === null) {
          reject(new Error("editor timed out"));
          return;
        }
        resolve(status);
      });
    });
    if (code !== 0) {
      const detail = stderr.trim();
      throw new Error(
        detail
          ? `The editor exited with status ${code}. ${detail}`
          : `The editor exited with status ${code}.`
      );
    }
    const next = new Map<string, Uint8Array>();
    for (const path of walk(dir)) {
      if (path === "opencode.json" || path === ".flagstage" || path.startsWith(`.flagstage${"/"}`))
        continue;
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

function headlessArgs(request: string, model: string | undefined): string[] {
  const args = ["run", "--standalone", "--archived", "--auto", "--format", "json"];
  if (model) args.push("--model", `amazon-bedrock/${model}`);
  args.push(buildPrompt(request));
  return args;
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
