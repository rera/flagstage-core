import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { can } from "@flagstage/core";
import { accountSkill } from "@flagstage/db";

import { database, requireAccount } from "../../../../../../src/guard";
import { skillHistory } from "../../../../../../src/skill-save";
import { SkillEditor } from "../../../../../../src/skills-ui";

export default async function AccountSkillPage({
  params
}: {
  params: Promise<{ accountSlug: string; slug: string }>;
}) {
  const { accountSlug, slug } = await params;
  const { principal, account: found } = await requireAccount(accountSlug);
  if (!can(principal, "skill.read", { accountId: found.id })) notFound();
  const rows = await database()
    .select()
    .from(accountSkill)
    .where(and(eq(accountSkill.accountId, found.id), eq(accountSkill.slug, slug)))
    .limit(1);
  const skill = rows[0];
  if (!skill) notFound();
  const canEdit = can(principal, "skill.edit", { accountId: found.id });
  const history = await skillHistory({ accountId: found.id, slug });
  return (
    <SkillEditor
      skill={{
        slug: skill.slug,
        name: skill.name,
        description: skill.description,
        body: skill.body
      }}
      backHref={`/a/${found.slug}/skills`}
      backLabel="Skills"
      scope="The agent follows this skill on every site in this account."
      readOnly={!canEdit}
      saveAction={canEdit ? `/api/accounts/${found.id}/skills/${skill.slug}` : undefined}
      history={history}
    />
  );
}
