import { NextResponse, type NextRequest } from "next/server";

// Same value as CORRELATION_HEADER in @flagstage/config. This file stays free of Node imports.
const CORRELATION_HEADER = "x-correlation-id";

export function middleware(request: NextRequest) {
  const correlationId = request.headers.get(CORRELATION_HEADER) || crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(CORRELATION_HEADER, correlationId);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(CORRELATION_HEADER, correlationId);
  return response;
}
