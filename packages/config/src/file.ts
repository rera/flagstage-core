import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

import { z } from "zod";

import { ConfigError } from "./errors";

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a #rrggbb color.");

export const fileConfigSchema = z.object({
  domain: z.string().min(1),
  orgName: z.string().min(1),
  adminEmail: z.string().email(),
  bedrockModelId: z.string().min(1),
  region: z.string().min(1),
  sesFrom: z.string().min(1),
  brand: z.object({
    name: z.string().min(1),
    logo: z.string().min(1).optional(),
    color
  })
});

export type FileConfig = z.infer<typeof fileConfigSchema>;

export function findConfigFile(start = process.cwd()): string | undefined {
  if (process.env.FLAGSTAGE_CONFIG) return process.env.FLAGSTAGE_CONFIG;
  let dir = start;
  for (let i = 0; i < 8; i += 1) {
    const candidate = join(dir, "flagstage.config.json");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
  return undefined;
}

export function loadFileConfig(path: string): FileConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch (error) {
    throw new ConfigError(`Could not read ${path}: ${(error as Error).message}`);
  }
  if (raw && typeof raw === "object") {
    delete (raw as { $schema?: string }).$schema;
  }
  const parsed = fileConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((issue) => {
      const key = issue.path.length > 0 ? issue.path.join(".") : "config";
      return `- ${key}: ${issue.message}`;
    });
    throw new ConfigError(`Invalid ${path}:\n${lines.join("\n")}`);
  }
  return parsed.data;
}

export function resolveBrandLogo(configPath: string, logo: string): string | undefined {
  const root = dirname(resolve(configPath));
  const full = resolve(root, logo);
  if (full !== root && !full.startsWith(`${root}/`)) return undefined;
  if (!isAbsolute(full) || !existsSync(full)) return undefined;
  return full;
}
