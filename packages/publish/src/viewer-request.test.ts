import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { redirectKey } from "./redirects";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const sourcePath = join(root, "infra/cloudfront/viewer-request.js");
const templatePath = join(root, "infra/cloudformation/template.yaml");

type ViewerResult = {
  statusCode?: number;
  headers?: { location?: { value: string } };
  uri?: string;
};

const entries = new Map<string, string>();

function loadHandler() {
  const source = readFileSync(sourcePath, "utf8").replace(
    'import cf from "cloudfront";',
    "var cf = globalThis.__viewerCf;"
  );
  (globalThis as { __viewerCf?: unknown }).__viewerCf = {
    kvs() {
      return {
        async get(key: string) {
          if (!entries.has(key)) throw new Error("missing");
          return entries.get(key);
        }
      };
    }
  };
  const runner = new Function(`${source}\nreturn handler;`) as () => (
    event: unknown
  ) => Promise<ViewerResult>;
  return runner();
}

const handler = loadHandler();

function request(uri: string, query: Record<string, string> = {}, host = "www.example.com") {
  const querystring: Record<string, { value: string }> = {};
  for (const [name, value] of Object.entries(query)) querystring[name] = { value };
  return { request: { headers: { host: { value: host } }, uri, querystring } };
}

function viewerSource(template: string): string {
  const from = template.indexOf('Name: !Sub "${Name}-viewer-request"');
  const code = template.indexOf("FunctionCode: |", from);
  const lines = template.slice(code).split("\n").slice(1);
  const body: string[] = [];
  for (const line of lines) {
    if (line.startsWith("          ")) body.push(line.slice(10));
    else if (line === "") body.push("");
    else break;
  }
  while (body.at(-1) === "") body.pop();
  return `${body.join("\n")}\n`;
}

describe("viewer-request redirects", () => {
  it("returns 301 for a path and a query-string redirect, and passes through otherwise", async () => {
    entries.clear();
    entries.set("www.example.com", "snapshots/site/snap/");
    entries.set(redirectKey("www.example.com", "/old"), "/next");
    entries.set(redirectKey("www.example.com", "/?p=7"), "/hello");

    const path = await handler(request("/old", {}, "WWW.Example.com:443"));
    expect(path).toMatchObject({
      statusCode: 301,
      headers: { location: { value: "/next" } }
    });

    const query = await handler(request("/", { p: "7" }));
    expect(query).toMatchObject({
      statusCode: 301,
      headers: { location: { value: "/hello" } }
    });

    const page = await handler(request("/about"));
    expect(page.statusCode).toBeUndefined();
    expect(page.uri).toBe("/snapshots/site/snap/about/index.html");

    const unrelated = await handler(request("/about", { utm: "1" }));
    expect(unrelated.statusCode).toBeUndefined();
    expect(unrelated.uri).toBe("/snapshots/site/snap/about/index.html");
  });

  it("matches the function embedded in the CloudFormation template", () => {
    const file = readFileSync(sourcePath, "utf8");
    const template = readFileSync(templatePath, "utf8");
    expect(viewerSource(template)).toBe(file.endsWith("\n") ? file : `${file}\n`);
  });
});
