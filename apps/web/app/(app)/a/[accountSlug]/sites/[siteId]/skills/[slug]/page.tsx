import { notFound } from "next/navigation";

import { can } from "@flagstage/core";

import { requireSite } from "../../../../../../../../src/guard";
import { readSiteSkill, skillHistory } from "../../../../../../../../src/skill-save";
import { SkillEditor } from "../../../../../../../../src/skills-ui";

export default async function SiteSkillPage({
  params
}: {
  params: Promise<{ accountSlug: string; siteId: string; slug: string }>;
}) {
  const { accountSlug, siteId, slug } = await params;
  const { principal, site: found } = await requireSite(accountSlug, siteId);
  if (!can(principal, "skill.read", { accountId: found.accountId, siteId: found.id })) notFound();
  const skill = await readSiteSkill(found.id, slug);
  if (!skill) notFound();
  const canEdit = can(principal, "skill.edit", { accountId: found.accountId, siteId: found.id });
  const history = await skillHistory({ siteId: found.id, slug });
  return (
    <SkillEditor
      skill={skill}
      site={{ name: found.name, status: found.status, host: `${found.slug}.localhost` }}
      backHref={`/a/${accountSlug}/sites/${found.id}/skills`}
      backLabel="Skills"
      scope={`The agent follows this skill on ${found.name}.`}
      readOnly={!canEdit}
      saveAction={canEdit ? `/api/sites/${found.id}/skills/${skill.slug}` : undefined}
      history={history}
    />
  );
}
