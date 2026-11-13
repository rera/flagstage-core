import { NextResponse, type NextRequest } from "next/server";

import {
  ACCOUNT_COOKIE,
  parseSiteMemory,
  serializeSiteMemory,
  SITE_COOKIE
} from "./src/account-cookie";

function cookieOptions(request: NextRequest) {
  return {
    path: "/",
    sameSite: "lax" as const,
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:"
  };
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/a/collect" || pathname.startsWith("/a/collect/")) return NextResponse.next();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  const account = pathname.match(/^\/a\/([^/]+)/);
  const slug = account?.[1];
  if (slug) {
    response.cookies.set(ACCOUNT_COOKIE, decodeURIComponent(slug), cookieOptions(request));
  }
  const site = pathname.match(/^\/a\/([a-z0-9-]+)\/sites\/([A-Za-z0-9-]+)(?:\/|$)/);
  const siteSlug = site?.[1];
  const siteId = site?.[2];
  if (siteSlug && siteId) {
    const memory = parseSiteMemory(request.cookies.get(SITE_COOKIE)?.value);
    memory.set(siteSlug, siteId);
    response.cookies.set(SITE_COOKIE, serializeSiteMemory(memory), cookieOptions(request));
  }
  return response;
}

export const config = {
  matcher: ["/a/:path*"]
};
