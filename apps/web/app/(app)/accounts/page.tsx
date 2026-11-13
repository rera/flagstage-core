import { redirect } from "next/navigation";

import { can } from "@flagstage/core";

import { landingPath, requirePrincipal } from "../../../src/guard";

export default async function LegacyAccountsRedirect() {
  const principal = await requirePrincipal();
  if (can(principal, "org.manage")) redirect("/admin/accounts");
  redirect(await landingPath(principal));
}
