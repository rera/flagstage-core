import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { runSiteTool, siteEditToolSpecs, type ToolCallRecord } from "./run";

export type SiteToolServer = {
  port: number;
  token: string;
  calls: ToolCallRecord[];
  close(): Promise<void>;
};

/**
 * Loopback server for one edit workspace. The OpenCode plugin calls it.
 * The token is written into that workspace, not into the environment.
 * `calls` is the log the parent keeps; a forged file in the workspace is ignored.
 */
export function startSiteToolServer(root: string): Promise<SiteToolServer> {
  const token = randomBytes(24).toString("base64url");
  const calls: ToolCallRecord[] = [];
  let chain = Promise.resolve();
  const server = createServer((request, response) => {
    if (request.headers.authorization !== `Bearer ${token}`) {
      response.writeHead(401);
      response.end();
      request.resume();
      return;
    }
    if (request.method === "GET" && request.url === "/tools") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(siteEditToolSpecs()));
      return;
    }
    if (request.method === "POST" && request.url === "/tool") {
      chain = chain
        .then(() => handleTool(root, request, response, calls))
        .then(
          () => undefined,
          () => undefined
        );
      return;
    }
    response.writeHead(404);
    response.end();
    request.resume();
  });
  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Could not bind the site-edit tool server."));
        return;
      }
      resolve({
        port: address.port,
        token,
        calls,
        close: () =>
          new Promise((done, err) => {
            server.close((error) => (error ? err(error) : done()));
          })
      });
    });
  });
}

async function handleTool(
  root: string,
  request: IncomingMessage,
  response: ServerResponse,
  calls: ToolCallRecord[]
): Promise<void> {
  try {
    const raw = await readBody(request, 1_000_000);
    let parsed: { tool?: unknown; input?: unknown };
    try {
      parsed = JSON.parse(raw) as { tool?: unknown; input?: unknown };
    } catch {
      response.writeHead(400, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "Tool request was not JSON." }));
      return;
    }
    const name = typeof parsed.tool === "string" ? parsed.tool : "";
    const result = runSiteTool(root, name, parsed.input ?? {});
    calls.push(result.record);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(result.body));
  } catch {
    if (!response.headersSent) {
      response.writeHead(400, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "Tool request was not accepted." }));
    }
  }
}

function readBody(request: IncomingMessage, limit: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("body too large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}
