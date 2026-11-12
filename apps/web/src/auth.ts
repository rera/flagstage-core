import { cache } from "react";

import { loadConfig } from "@flagstage/config";
import { getDb } from "@flagstage/db";
import { createAuth } from "@flagstage/auth";

let auth: ReturnType<typeof createAuth> | undefined;

export function getAuth() {
  if (!auth) {
    const config = loadConfig();
    auth = createAuth({
      database: getDb(config.DATABASE_URL),
      secret: config.BETTER_AUTH_SECRET,
      baseURL: config.APP_URL,
      emailAndPassword: config.EMAIL_PASSWORD_ENABLED,
      trustedOrigins: [new URL(config.APP_URL).origin]
    });
  }
  return auth;
}

export const currentSession = cache(async () => {
  const requestHeaders = await import("next/headers").then((mod) => mod.headers());
  return getAuth().api.getSession({ headers: requestHeaders });
});
