import { eq } from "drizzle-orm";

import { accountSkill } from "@flagstage/db";
import { PageHeader } from "@flagstage/ui";

import { database, requireAccount } from "../../../../../src/guard";
import { Page } from "../../../../../src/page";
import { SkillList } from "../../../../../src/skills-ui";

export default async function AccountSkillsPage({
  params
}: {
  params: Promise<{ accountSlug: string }>;
}) {
  const { accountSlug } = await params;
  const { account: found } = await requireAccount(accountSlug);
  const skills = (
    await database().select().from(accountSkill).where(eq(accountSkill.accountId, found.id))
  )
    .map((skill) => ({
      slug: skill.slug,
      name: skill.name,
      description: skill.description,
      body: skill.body
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
  return (
    <Page>
      <PageHeader
        title="Skills"
        description="The agent follows these skills on every site in this account."
      />
      <SkillList skills={skills} hrefFor={(skill) => `/a/${found.slug}/skills/${skill.slug}`} />
    </Page>
  );
}
