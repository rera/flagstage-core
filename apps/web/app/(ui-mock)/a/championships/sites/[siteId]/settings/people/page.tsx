import { notFound } from "next/navigation";

import { championshipSites, pgaPeople, womensPeople } from "../../../../../../../../src/ui-mock/data";
import { SitePeopleScreen } from "../../../../../../../../src/ui-mock/people-screen";

const peopleBySite = {
  pga: pgaPeople,
  womens: womensPeople
} as const;

export default async function MockSitePeoplePage({
  params,
  searchParams
}: {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<{ dialog?: string; person?: string }>;
}) {
  const { siteId } = await params;
  const query = await searchParams;
  const site = championshipSites.find((item) => item.id === siteId);
  const people = peopleBySite[siteId as keyof typeof peopleBySite];
  if (!site || !people) notFound();
  return <SitePeopleScreen site={site} people={people} dialog={query.dialog} personEmail={query.person} />;
}
