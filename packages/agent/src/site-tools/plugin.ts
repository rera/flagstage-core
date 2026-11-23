/**
 * OpenCode 2.2 loads this from `.opencode/plugins/site-edit.js`.
 * The default export is `{ id, setup }` so it does not import `@opencode/plugin`
 * (that package does not resolve from the edit workspace). `setup` registers
 * the site-edit tools with `ctx.tool.transform`. Each tool calls the loopback
 * server the parent process started for this edit.
 */
export const SITE_EDIT_PLUGIN_SOURCE = `import { readFileSync } from "node:fs";
import { join } from "node:path";

export default {
  id: "flagstage-site-edit",
  async setup(ctx) {
    const root = ctx.location && ctx.location.directory;
    if (!root) return;
    const cfg = JSON.parse(readFileSync(join(root, ".flagstage", "tool-server.json"), "utf8"));
    const headers = { authorization: "Bearer " + cfg.token };
    const listed = await fetch("http://127.0.0.1:" + cfg.port + "/tools", { headers });
    if (!listed.ok) throw new Error("site-edit tools are unavailable");
    const tools = await listed.json();
    await ctx.tool.transform((editor) => {
      for (const tool of tools) {
        editor.add({
          name: tool.name,
          description: tool.description,
          input: tool.input,
          options: { codemode: false },
          async execute(input, context) {
            const response = await fetch("http://127.0.0.1:" + cfg.port + "/tool", {
              method: "POST",
              headers: { authorization: headers.authorization, "content-type": "application/json" },
              body: JSON.stringify({ tool: tool.name, input: input }),
              signal: context && context.signal
            });
            return { content: await response.text() };
          }
        });
      }
    });
  }
};
`;
