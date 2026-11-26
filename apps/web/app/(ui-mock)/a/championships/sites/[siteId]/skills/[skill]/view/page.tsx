import { notFound } from "next/navigation";

import { championshipSites, pgaSkills } from "../../../../../../../../../src/ui-mock/data";
import { SkillEditor } from "../../../../../../../../../src/ui-mock/skills-screen";

export default async function MockSiteSkillViewPage({
  params
}: {
  params: Promise<{ siteId: string; skill: string }>;
}) {
  const { siteId, skill: slug } = await params;
  if (siteId !== "pga") notFound();
  const skill = pgaSkills.find((item) => item.slug === slug);
  const site = championshipSites[0];
  if (!skill || !site) notFound();
  return (
    <SkillEditor
      skill={skill}
      site={site}
      readOnly
      backHref="/a/championships/sites/pga/skills"
      backLabel="Skills"
      scope="The agent follows this skill on PGA Championship."
    />
  );
}
