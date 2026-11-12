import { NextResponse, type NextRequest } from "next/server";

import { slugFromHost } from "@flagstage/importer/host";

export function proxy(request: NextRequest) {
  const slug = slugFromHost(request.headers.get("host") ?? "", "localhost");
  if (!slug) return NextResponse.next();
  const url = request.nextUrl.clone();
  const original = `${url.pathname}${url.search}`;
  url.pathname = `/live/${slug}${url.pathname === "/" ? "" : url.pathname}`;
  const headers = new Headers(request.headers);
  headers.set("x-flagstage-path", original);
  return NextResponse.rewrite(url, { request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|live/).*)"]
};
