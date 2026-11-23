import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildAgentEnv } from "./runner";
import { runSubprocessEdit, skillsDirectory } from "./subprocess";

describe("subprocess editor", () => {
  it("runs a local command without database or cloud credentials", async () => {
    const env = buildAgentEnv({
      PATH: process.env.PATH,
      DATABASE_URL: "postgres://secret",
      AWS_SECRET_ACCESS_KEY: "secret",
      AWS_ACCESS_KEY_ID: "key"
    });
    const result = await runSubprocessEdit({
      bin: process.execPath,
      args: [
        "-e",
        "require('fs').appendFileSync('index.html', process.env.DATABASE_URL || process.env.AWS_SECRET_ACCESS_KEY || 'clean')"
      ],
      files: new Map([["index.html", new TextEncoder().encode("<html></html>")]]),
      request: "Add a note",
      env,
      timeoutMs: 10_000,
      skillsDir: skillsDirectory
    });
    const html = new TextDecoder().decode(result.files.get("index.html"));
    expect(html).toContain("clean");
    expect(html).not.toContain("postgres://secret");
    expect(result.changed).toBe(true);
  });

  it("runs OpenCode headless against the bedrock model", async () => {
    const bin = join(mkdtempSync(join(tmpdir(), "opencode-bin-")), "opencode");
    writeFileSync(bin, '#!/bin/sh\nprintf \'%s\\n\' "$@" > "$PWD/args.txt"\n');
    chmodSync(bin, 0o755);
    const result = await runSubprocessEdit({
      bin,
      files: new Map([["index.html", new TextEncoder().encode("<html></html>")]]),
      request: "Add a note",
      env: {
        PATH: "/usr/bin:/bin",
        HOME: tmpdir(),
        AGENT_MODEL: "amazon.nova-micro-v1:0",
        AWS_REGION: "us-east-1"
      },
      timeoutMs: 10_000
    });
    const args = new TextDecoder().decode(result.files.get("args.txt"));
    expect(args).toContain("run\n--standalone\n--archived\n--auto\n--format\njson");
    expect(args).toContain("--model\namazon-bedrock/amazon.nova-micro-v1:0");
    expect(args).toContain(
      "find_pages, read_page, edit_include, set_meta, retag, replace_text, list_links"
    );
    expect(args).toContain("<untrusted>\nAdd a note\n</untrusted>");
    expect(result.files.has("opencode.json")).toBe(false);
  });

  it("loads the site skill into the prompt and keeps it in the snapshot", async () => {
    const skill = '---\nname: site\ndescription: "Use for every edit."\n---\n\nSITE_SKILL_MARKER\n';
    const result = await runSubprocessEdit({
      bin: process.execPath,
      args: [
        "-e",
        [
          "const fs=require('fs');",
          "const prompt=fs.readFileSync('.flagstage/request.md','utf8');",
          "const site=fs.readFileSync('.flagstage/skills/site/SKILL.md','utf8');",
          "if(!site.includes('SITE_SKILL_MARKER')) process.exit(3);",
          "if(!prompt.includes('SITE_SKILL_MARKER')) process.exit(2);",
          "if(!fs.existsSync('.flagstage/skills/forms/SKILL.md')) process.exit(4);"
        ].join("")
      ],
      files: new Map([
        ["index.html", new TextEncoder().encode("<html></html>")],
        [".flagstage/skills/site/SKILL.md", new TextEncoder().encode(skill)]
      ]),
      request: "Add a note",
      env: { PATH: "/usr/bin:/bin", HOME: tmpdir() },
      timeoutMs: 10_000,
      skillsDir: skillsDirectory
    });
    expect(result.changed).toBe(false);
    expect(new TextDecoder().decode(result.files.get(".flagstage/skills/site/SKILL.md"))).toBe(
      skill
    );
    expect(new TextDecoder().decode(result.files.get("index.html"))).toBe("<html></html>");
    expect(result.files.has(".flagstage/request.md")).toBe(false);
  });

  it("exposes the site-edit tools through the workspace plugin", async () => {
    const result = await runSubprocessEdit({
      bin: process.execPath,
      args: [
        "-e",
        [
          "const fs=require('fs');",
          "const cfg=JSON.parse(fs.readFileSync('.flagstage/tool-server.json','utf8'));",
          "const plugin=fs.readFileSync('.opencode/plugins/site-edit.js','utf8');",
          "if(!plugin.includes('ctx.tool.transform')||plugin.includes('@opencode/plugin')) process.exit(2);",
          "async function call(input){",
          "const response=await fetch('http://127.0.0.1:'+cfg.port+'/tool',{method:'POST',headers:{authorization:'Bearer '+cfg.token,'content-type':'application/json'},body:JSON.stringify({tool:'replace_text',input})});",
          "return response.json();}",
          "(async()=>{",
          "const preview=await call({find:'marina',replace:'harbor'});",
          "if(!preview.dryRunId||preview.changed!==1) process.exit(4);",
          "const denied=await fetch('http://127.0.0.1:'+cfg.port+'/tools');",
          "if(denied.status!==401) process.exit(5);",
          "const applied=await call({find:'marina',replace:'harbor',apply:preview.dryRunId});",
          "if(!applied.applied) process.exit(6);",
          "})().catch((error)=>{console.error(error);process.exit(1);});"
        ].join("")
      ],
      files: new Map([
        ["index.html", new TextEncoder().encode("<p>The marina is open. Try the marinara.</p>")]
      ]),
      request: "Rename marina",
      env: { PATH: "/usr/bin:/bin", HOME: tmpdir() },
      timeoutMs: 10_000
    });
    const html = new TextDecoder().decode(result.files.get("index.html"));
    expect(html).toContain("The harbor is open. Try the marinara.");
    expect(result.files.has(".opencode/plugins/site-edit.js")).toBe(false);
    expect(result.files.has("opencode.json")).toBe(false);
    expect(result.toolLog.map((call) => `${call.tool}:${call.mode}`)).toEqual([
      "replace_text:dry-run",
      "replace_text:apply"
    ]);
    expect(result.toolLog[1]?.files).toEqual(["index.html"]);
  });
});
