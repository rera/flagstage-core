import { build } from "esbuild";

const shared = {
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);"
  },
  logLevel: "info"
};

await build({
  ...shared,
  entryPoints: ["apps/worker/src/main.ts"],
  outfile: "dist/worker.mjs"
});

await build({
  ...shared,
  entryPoints: ["apps/cli/src/main.ts"],
  outfile: "dist/cli.mjs"
});
