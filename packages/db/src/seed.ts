import { eq } from "drizzle-orm";

import type { Database } from "./client";
import { orgSettings } from "./schema";

export async function seedDemo(db: Database): Promise<void> {
  await db
    .update(orgSettings)
    .set({
      name: "Demo Organization",
      baseDomain: "localhost",
      previewDomain: "localhost",
      signupMode: "invite",
      configuredAt: new Date(),
      updatedAt: new Date()
    })
    .where(eq(orgSettings.id, "org"));
}
