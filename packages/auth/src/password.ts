import { randomBytes, randomUUID } from "node:crypto";

import { hashPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";

import { authAccount, user, type Database } from "@flagstage/db";

export async function setUserPassword(
  db: Database,
  input: { email: string; password?: string }
): Promise<{ email: string; password: string }> {
  const email = input.email.trim().toLowerCase();
  const people = await db.select().from(user).where(eq(user.email, email)).limit(1);
  const person = people[0];
  if (!person) throw new Error(`No user with email ${email}.`);
  const password = input.password ?? randomBytes(18).toString("base64url");
  const hashed = await hashPassword(password);
  const now = new Date();
  const credentials = await db
    .select()
    .from(authAccount)
    .where(and(eq(authAccount.userId, person.id), eq(authAccount.providerId, "credential")))
    .limit(1);
  if (credentials[0]) {
    await db
      .update(authAccount)
      .set({ password: hashed, updatedAt: now })
      .where(eq(authAccount.id, credentials[0].id));
  } else {
    await db.insert(authAccount).values({
      id: randomUUID(),
      accountId: person.id,
      providerId: "credential",
      userId: person.id,
      password: hashed,
      createdAt: now,
      updatedAt: now
    });
  }
  return { email, password };
}
