import { createHash, randomBytes, randomUUID } from "node:crypto";

import { hashPassword } from "better-auth/crypto";
import { authAccount, user, verification, type Database } from "@flagstage/db";

export async function bootstrapAdmin(
  database: Database,
  input: { email?: string; appUrl: string },
  log: { info: (obj: object, message: string) => void }
): Promise<void> {
  if (!input.email) return;
  const existing = await database.select({ id: user.id }).from(user).limit(1);
  if (existing.length > 0) return;

  const password = randomBytes(18).toString("base64url");
  const id = randomUUID();
  const now = new Date();
  await database.insert(user).values({
    id,
    name: "Organization admin",
    email: input.email.toLowerCase(),
    emailVerified: true,
    org_role: "org_admin",
    org_role_source: "bootstrap",
    createdAt: now,
    updatedAt: now
  });
  await database.insert(authAccount).values({
    id: randomUUID(),
    accountId: id,
    providerId: "credential",
    userId: id,
    password: await hashPassword(password),
    createdAt: now,
    updatedAt: now
  });
  const token = randomBytes(24).toString("base64url");
  await database.insert(verification).values({
    id: randomUUID(),
    identifier: `bootstrap:${createHash("sha256").update(token).digest("hex")}`,
    value: `${input.email.toLowerCase()}\n${password}`,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    createdAt: now,
    updatedAt: now
  });
  log.info(
    { email: input.email, url: `${input.appUrl}/bootstrap?token=${token}` },
    "one-time organization admin sign-in link"
  );
}
