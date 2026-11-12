import { eq } from "drizzle-orm";

import { orgSettings } from "@flagstage/db";
import { Mark } from "@flagstage/ui";

import { database } from "./guard";

export async function BrandMark() {
  try {
    const rows = await database()
      .select()
      .from(orgSettings)
      .where(eq(orgSettings.id, "org"))
      .limit(1);
    const logo = rows[0]?.logoUrl;
    if (logo) return <img src={logo} alt="" width={28} height={28} />;
  } catch {
    // The shell still renders if the database is not up yet.
  }
  return <Mark />;
}
