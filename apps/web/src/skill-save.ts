import { randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";

import { commitSiteFiles, readSiteFiles } from "@flagstage/agent";
import { loadConfig } from "@flagstage/config";
import {
  can,
  isSkillSlug,
  parseSkillMarkdown,
  skillPath,
  skillSlugFromPath,
  writeSkillMarkdown,
  type Principal,
  type SkillFile
} from "@flagstage/core";
import { accountSkill, site, skillRevision, user } from "@flagstage/db";
import { createBlobStore } from "@flagstage/storage";

import { database } from "./guard";

export type ListedSkill = SkillFile & { slug: string };

export async function listSiteSkills(siteId: string): Promise<ListedSkill[]> {
  const files = await readSiteFiles(database(), createBlobStore(loadConfig()), siteId);
  if (!files) return [];
  const skills: ListedSkill[] = [];
  for (const [path, body] of files) {
    const slug = skillSlugFromPath(path);
    if (!slug) continue;
    const text = new TextDecoder().decode(body);
    const parsed = parseSkillMarkdown(text, slug);
    skills.push({ slug, ...parsed });
  }
  return skills.sort((left, right) => left.name.localeCompare(right.name));
}

export async function readSiteSkill(siteId: string, slug: string): Promise<ListedSkill | null> {
  if (!isSkillSlug(slug)) return null;
  const skills = await listSiteSkills(siteId);
  return skills.find((skill) => skill.slug === slug) ?? null;
}

export async function skillHistory(input: {
  accountId?: string;
  siteId?: string;
  slug: string;
}): Promise<Array<{ name: string; action: string; at: string; note: string }>> {
  const db = database();
  const rows = input.siteId
    ? await db
        .select()
        .from(skillRevision)
        .where(and(eq(skillRevision.siteId, input.siteId), eq(skillRevision.slug, input.slug)))
    : await db
        .select()
        .from(skillRevision)
        .where(
          and(
            eq(skillRevision.accountId, input.accountId ?? ""),
            eq(skillRevision.slug, input.slug)
          )
        );
  const ordered = rows.sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
  const ids = [
    ...new Set(ordered.map((row) => row.actorUserId).filter((id): id is string => Boolean(id)))
  ];
  const people = ids.length === 0 ? [] : await db.select().from(user).where(inArray(user.id, ids));
  const byId = new Map(people.map((person) => [person.id, person]));
  return ordered.map((row) => ({
    name: (row.actorUserId && byId.get(row.actorUserId)?.name) || "Someone on the account",
    action: row.action,
    at: row.createdAt.toISOString(),
    note: row.note
  }));
}

export async function saveSiteSkill(input: {
  principal: Principal;
  siteId: string;
  slug: string;
  body: string;
}): Promise<"ok" | "denied" | "missing"> {
  if (!isSkillSlug(input.slug)) return "missing";
  const db = database();
  const rows = await db.select().from(site).where(eq(site.id, input.siteId)).limit(1);
  const found = rows[0];
  if (
    !found ||
    !can(input.principal, "skill.edit", { accountId: found.accountId, siteId: found.id })
  ) {
    return "denied";
  }
  const current = await readSiteSkill(found.id, input.slug);
  if (!current) return "missing";
  const next = writeSkillMarkdown({
    name: current.name,
    description: current.description,
    body: input.body
  });
  await commitSiteFiles({
    db,
    store: createBlobStore(loadConfig()),
    siteId: found.id,
    userId: input.principal.id,
    updates: new Map([[skillPath(input.slug), new TextEncoder().encode(next)]])
  });
  await db.insert(skillRevision).values({
    id: randomUUID(),
    siteId: found.id,
    slug: input.slug,
    actorUserId: input.principal.id,
    action: "Saved"
  });
  return "ok";
}

export async function saveAccountSkill(input: {
  principal: Principal;
  accountId: string;
  slug: string;
  body: string;
}): Promise<"ok" | "denied" | "missing"> {
  if (!isSkillSlug(input.slug)) return "missing";
  if (!can(input.principal, "skill.edit", { accountId: input.accountId })) return "denied";
  const db = database();
  const rows = await db
    .select()
    .from(accountSkill)
    .where(and(eq(accountSkill.accountId, input.accountId), eq(accountSkill.slug, input.slug)))
    .limit(1);
  const current = rows[0];
  if (!current) return "missing";
  await db
    .update(accountSkill)
    .set({ body: input.body.replace(/\s+$/, ""), updatedAt: new Date() })
    .where(eq(accountSkill.id, current.id));
  await db.insert(skillRevision).values({
    id: randomUUID(),
    accountId: input.accountId,
    slug: input.slug,
    actorUserId: input.principal.id,
    action: "Saved"
  });
  return "ok";
}
