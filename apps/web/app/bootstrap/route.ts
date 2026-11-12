import { createHash } from "node:crypto";

import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { loadConfig } from "@flagstage/config";
import { user, verification } from "@flagstage/db";

import { getAuth } from "../../src/auth";
import { applyAuthResponse } from "../../src/cookies";
import { database } from "../../src/guard";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const appUrl = loadConfig().APP_URL;
  const fail = () => NextResponse.redirect(new URL("/sign-in?error=1", appUrl));
  if (!token) return fail();
  const identifier = `bootstrap:${createHash("sha256").update(token).digest("hex")}`;
  const db = database();
  const rows = await db
    .select()
    .from(verification)
    .where(eq(verification.identifier, identifier))
    .limit(1);
  const row = rows[0];
  if (!row || row.expiresAt.getTime() < Date.now()) return fail();
  const [email, password] = row.value.split("\n");
  if (!email || !password) return fail();
  const response = await getAuth().handler(
    new Request(`${appUrl}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: new URL(appUrl).origin },
      body: JSON.stringify({ email, password })
    })
  );
  if (!response.ok) return fail();
  await applyAuthResponse(response);
  await db.delete(verification).where(eq(verification.id, row.id));
  await db.update(user).set({ emailVerified: true }).where(eq(user.email, email));
  return NextResponse.redirect(new URL("/accounts", appUrl));
}
