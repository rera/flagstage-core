import { notFound } from "next/navigation";

import { championshipSites, pgaSkills } from "../../../../../../../../src/ui-mock/data";
import { SiteSkillsList } from "../../../../../../../../src/ui-mock/skills-screen";

export default async function MockSiteSkillsPage({
  params
}: {
  params: Promise<{ siteId: string }>;
}) {
  const { siteId } = await params;
  if (siteId !== "pga") notFound();
  const site = championshipSites[0];
  if (!site) notFound();
  return <SiteSkillsList site={site} skills={pgaSkills} />;
}
