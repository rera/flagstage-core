import { redirect } from "next/navigation";

import { landingPath, requirePrincipal } from "../../../src/guard";

export default async function LegacySitesRedirect({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const principal = await requirePrincipal();
  const params = await searchParams;
  const target = await landingPath(principal);
  if (!params.error) redirect(target);
  const url = new URL(target, "http://local");
  url.searchParams.set("error", params.error);
  redirect(`${url.pathname}${url.search}`);
}
