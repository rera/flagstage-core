import { PageHeader } from "@flagstage/ui";

import { requireSite } from "../../../../../../../src/guard";
import { Page } from "../../../../../../../src/page";
import { SiteAdminNav } from "../../../../../../../src/site-admin-nav";
import { SiteIdentity } from "../../../../../../../src/site-nav";
import { listSiteSkills } from "../../../../../../../src/skill-save";
import { SkillList } from "../../../../../../../src/skills-ui";

export default async function SiteSkillsPage({
  params
}: {
  params: Promise<{ accountSlug: string; siteId: string }>;
}) {
  const { accountSlug, siteId } = await params;
  const { account: foundAccount, site: found } = await requireSite(accountSlug, siteId);
  const skills = await listSiteSkills(found.id);
  return (
    <Page>
      <SiteIdentity name={found.name} status={found.status} host={`${found.slug}.localhost`} />
      <SiteAdminNav base={`/a/${accountSlug}/sites/${found.id}`} current="skills" />
      <PageHeader
        level={2}
        title="Skills"
        description={`The agent follows these skills on ${found.name}. It also follows the ${foundAccount.name} account skills.`}
      />
      <SkillList
        skills={skills}
        hrefFor={(skill) => `/a/${accountSlug}/sites/${found.id}/skills/${skill.slug}`}
      />
    </Page>
  );
}
