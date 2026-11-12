import { NextResponse, type NextRequest } from "next/server";

import { previewFromHost, slugFromHost } from "@flagstage/importer/host";

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path.startsWith("/live/") || path.startsWith("/preview/") || path.startsWith("/api/")) {
    return NextResponse.next();
  }
  const host = request.headers.get("host") ?? "";
  const preview = previewFromHost(host, "localhost");
  if (preview) {
    const url = request.nextUrl.clone();
    const original = `${url.pathname}${url.search}`;
    url.pathname = `/preview/${preview.token}${url.pathname === "/" ? "" : url.pathname}`;
    const headers = new Headers(request.headers);
    headers.set("x-flagstage-path", original);
    const response = NextResponse.rewrite(url, { request: { headers } });
    response.cookies.set("flagstage_preview", preview.token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/"
    });
    return response;
  }
  const slug = slugFromHost(host, "localhost");
  if (!slug) return NextResponse.next();
  const url = request.nextUrl.clone();
  const original = `${url.pathname}${url.search}`;
  url.pathname = `/live/${slug}${url.pathname === "/" ? "" : url.pathname}`;
  const headers = new Headers(request.headers);
  headers.set("x-flagstage-path", original);
  return NextResponse.rewrite(url, { request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"]
};
