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
import { SITE_EDIT_PLUGIN_SOURCE } from "./site-tools/plugin";
import { startSiteToolServer } from "./site-tools/server";
import type { ToolCallRecord } from "./site-tools/run";

export interface AgentRunner {
  readonly name: "subprocess";
  edit(
    files: Map<string, Uint8Array>,
    request: string,
    guidance?: string,
    context?: { accountSkills?: string }
  ): Promise<{
    changed: boolean;
    files: Map<string, Uint8Array>;
    toolLog?: ToolCallRecord[];
    reply?: string;
  }>;
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
  /** Trusted note for the editor. Kept outside the untrusted request. */
  guidance?: string;
  /** Account-wide skills. Kept outside the untrusted request, beside the site skill. */
  accountSkills?: string;
  env: Record<string, string>;
  timeoutMs: number;
  skillsDir?: string;
}): Promise<{
  changed: boolean;
  files: Map<string, Uint8Array>;
  toolLog: ToolCallRecord[];
  reply?: string;
}> {
  const dir = mkdtempSync(join(tmpdir(), "flagstage-turn-"));
  let tools: Awaited<ReturnType<typeof startSiteToolServer>> | undefined;
  try {
    for (const [path, body] of input.files) {
      const full = join(dir, path);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, body);
    }
    mkdirSync(join(dir, ".flagstage"), { recursive: true });
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
    // Import writes this file. Package skills are copied beside it and do not replace it.
    const siteSkill = readSiteSkill(dir);
    const prompt = buildPrompt(input.request, siteSkill, input.guidance, input.accountSkills);
    writeFileSync(join(dir, ".flagstage", "request.md"), prompt);
    tools = await startSiteToolServer(dir);
    writeFileSync(
      join(dir, ".flagstage", "tool-server.json"),
      JSON.stringify({ port: tools.port, token: tools.token })
    );
    const pluginPath = join(dir, ".opencode", "plugins", "site-edit.js");
    mkdirSync(dirname(pluginPath), { recursive: true });
    writeFileSync(pluginPath, SITE_EDIT_PLUGIN_SOURCE);
    const childEnv = {
      ...input.env,
      OPENCODE_DISABLE_AUTOUPDATE: "1",
      OPENCODE_DISABLE_MODELS_FETCH: "1"
    };
    let stderr = "";
    let stdout = "";
    const code = await new Promise<number>((resolve, reject) => {
      // `run --standalone` is the headless editor. `--auto` approves file
      // edits, because there is no terminal to ask. amazon-bedrock uses the
      // task role. There is no API key.
      const child = spawn(input.bin, input.args ?? headlessArgs(prompt, model), {
        cwd: dir,
        env: childEnv as unknown as NodeJS.ProcessEnv,
        stdio: ["ignore", "pipe", "pipe"],
        timeout: input.timeoutMs
      });
      child.stdout?.on("data", (chunk: Buffer) => {
        if (stdout.length < 100_000) stdout += chunk.toString("utf8");
      });
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
      if (
        path === "opencode.json" ||
        path === ".opencode" ||
        path.startsWith(`.opencode${"/"}`) ||
        path === ".flagstage" ||
        path.startsWith(`.flagstage${"/"}`)
      ) {
        continue;
      }
      next.set(path, new Uint8Array(readFileSync(join(dir, path))));
    }
    // The editor workspace hides .flagstage from the returned snapshot. Put the
    // site skill and drift manifest back so the next turn still loads them.
    for (const [path, body] of input.files) {
      if ((path === ".flagstage" || path.startsWith(`.flagstage${"/"}`)) && !next.has(path)) {
        next.set(path, body);
      }
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
    return { changed, files: next, toolLog: tools.calls, reply: assistantReply(stdout) };
  } finally {
    if (tools) await tools.close().catch(() => undefined);
    rmSync(dir, { recursive: true, force: true });
  }
}

function readSiteSkill(dir: string): string | undefined {
  try {
    const text = readFileSync(join(dir, ".flagstage", "skills", "site", "SKILL.md"), "utf8");
    return text.trim() ? text : undefined;
  } catch {
    return undefined;
  }
}

/** Assistant text from `opencode run --format json`. Tool events are left out. */
export function assistantReply(stdout: string): string | undefined {
  const parts: string[] = [];
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const event = JSON.parse(trimmed) as {
        type?: string;
        text?: string;
        part?: { type?: string; text?: string };
      };
      if (event.part?.type === "text" && event.part.text) parts.push(event.part.text);
      else if (event.type === "text" && event.text) parts.push(event.text);
    } catch {
      // A line that is not an event is not the owner's note.
    }
  }
  const text = parts.join("").trim();
  return text || undefined;
}

function headlessArgs(prompt: string, model: string | undefined): string[] {
  const args = ["run", "--standalone", "--archived", "--auto", "--format", "json"];
  if (model) args.push("--model", `amazon-bedrock/${model}`);
  args.push(prompt);
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
    edit(files, request, guidance, context) {
      return runSubprocessEdit({
        bin: options.bin ?? "opencode",
        files,
        request,
        guidance,
        accountSkills: context?.accountSkills,
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
