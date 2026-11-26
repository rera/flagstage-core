import { notFound } from "next/navigation";

import { accountSkills } from "../../../../../../src/ui-mock/data";
import { SkillEditor } from "../../../../../../src/ui-mock/skills-screen";

export default async function MockAccountSkillPage({
  params
}: {
  params: Promise<{ skill: string }>;
}) {
  const { skill: slug } = await params;
  const skill = accountSkills.find((item) => item.slug === slug);
  if (!skill) notFound();
  return (
    <SkillEditor
      skill={skill}
      backHref="/a/championships/skills"
      backLabel="Skills"
      scope="The agent follows this skill on every site in this account."
    />
  );
}
