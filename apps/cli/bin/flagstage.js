#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const result = spawnSync("tsx", [resolve(here, "../src/main.ts"), ...process.argv.slice(2)], {
  stdio: "inherit"
});
process.exit(result.status ?? 1);
