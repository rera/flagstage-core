import { createServer } from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

process.chdir(join(dirname(fileURLToPath(import.meta.url)), ".."));

const port = process.env.E2E_PORT ?? "3100";
const fixturePort = process.env.E2E_FIXTURE_PORT ?? "3999";
const ownDatabase = !process.env.DATABASE_URL;
const databaseUrl =
  process.env.DATABASE_URL ?? "postgres://flagstage:flagstage@127.0.0.1:54329/flagstage";
const storageDir = process.env.FS_STORAGE_DIR ?? "/tmp/flagstage-e2e-storage";

const html = `<!doctype html><html><head><title>Parks</title></head><body>
<h1>Parks</h1>
<p>Welcome to the parks.</p>
</body></html>`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function dockerArgs() {
  const probe = spawnSync("docker", ["info"], { stdio: "ignore" });
  if (probe.status === 0) return ["docker"];
  return ["sudo", "docker"];
}

const docker = dockerArgs();

function run(args) {
  const result = spawnSync(args[0], args.slice(1), { stdio: "inherit" });
  if (result.status !== 0) {
    console.error(`${args.join(" ")} failed`);
    process.exit(result.status ?? 1);
  }
}

async function ensurePostgres() {
  if (!ownDatabase) return;
  const inspect = spawnSync(
    docker[0],
    [...docker.slice(1), "inspect", "-f", "{{.State.Running}}", "flagstage-e2e-pg"],
    {
      encoding: "utf8"
    }
  );
  if (inspect.status !== 0) {
    run([
      ...docker,
      "run",
      "-d",
      "--name",
      "flagstage-e2e-pg",
      "-e",
      "POSTGRES_USER=flagstage",
      "-e",
      "POSTGRES_PASSWORD=flagstage",
      "-e",
      "POSTGRES_DB=flagstage",
      "-p",
      "127.0.0.1:54329:5432",
      "postgres:17-alpine"
    ]);
  } else if (inspect.stdout.trim() !== "true") {
    run([...docker, "start", "flagstage-e2e-pg"]);
  }
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const ready = spawnSync(
      docker[0],
      [
        ...docker.slice(1),
        "exec",
        "flagstage-e2e-pg",
        "pg_isready",
        "-U",
        "flagstage",
        "-d",
        "flagstage"
      ],
      { stdio: "ignore" }
    );
    if (ready.status === 0) break;
    if (attempt === 29) {
      console.error("Postgres did not become ready.");
      process.exit(1);
    }
    await sleep(1000);
  }
  run([
    ...docker,
    "exec",
    "flagstage-e2e-pg",
    "psql",
    "-U",
    "flagstage",
    "-d",
    "postgres",
    "-c",
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'flagstage' AND pid <> pg_backend_pid();"
  ]);
  spawnSync(
    docker[0],
    [
      ...docker.slice(1),
      "exec",
      "flagstage-e2e-pg",
      "dropdb",
      "-U",
      "flagstage",
      "--if-exists",
      "flagstage"
    ],
    {
      stdio: "inherit"
    }
  );
  run([...docker, "exec", "flagstage-e2e-pg", "createdb", "-U", "flagstage", "flagstage"]);
}

await ensurePostgres();
mkdirSync(storageDir, { recursive: true });

const fixture = createServer((_req, res) => {
  const path = new URL(_req.url ?? "/", "http://127.0.0.1").pathname;
  if (path !== "/") {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
    return;
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(html);
});
await new Promise((resolve) => fixture.listen(Number(fixturePort), "127.0.0.1", resolve));

const env = {
  ...process.env,
  PATH: `${join(process.cwd(), "e2e/bin")}${delimiter}${process.env.PATH ?? ""}`,
  DATABASE_URL: databaseUrl,
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "local-dev-secret-that-is-long-enough",
  APP_URL: `http://127.0.0.1:${port}`,
  STORAGE_DRIVER: "fs",
  FS_STORAGE_DIR: storageDir,
  HOSTMAP_DRIVER: "fs",
  DOMAINS_DRIVER: "none",
  EMAIL_PASSWORD_ENABLED: "1",
  E2E_EMAIL: "e2e@example.com",
  E2E_PASSWORD: "e2e-password-e2e-password",
  NODE_ENV: "development",
  LOG_LEVEL: "info",
  NEXT_TELEMETRY_DISABLED: "1"
};

const children = [];
function start(command, args) {
  const child = spawn(command, args, { env, stdio: "inherit" });
  children.push(child);
  child.on("exit", (code, signal) => {
    if (signal === "SIGTERM" || code === 0) return;
    console.error(`${command} exited ${code ?? signal}`);
    shutdown(code ?? 1);
  });
}

let stopping = false;
function shutdown(code) {
  if (stopping) return;
  stopping = true;
  fixture.close();
  for (const child of children) child.kill("SIGTERM");
  setTimeout(() => process.exit(code), 500);
}

process.on("SIGTERM", () => shutdown(0));
process.on("SIGINT", () => shutdown(0));

const prepared = spawnSync(
  "pnpm",
  ["--filter", "@flagstage/auth", "exec", "tsx", "scripts/e2e-prepare.ts"],
  { env, stdio: "inherit" }
);
if (prepared.status !== 0) process.exit(prepared.status ?? 1);

start("pnpm", ["--filter", "@flagstage/worker", "start"]);
start("pnpm", [
  "--filter",
  "@flagstage/web",
  "exec",
  "next",
  "dev",
  "--port",
  port,
  "--hostname",
  "127.0.0.1"
]);
