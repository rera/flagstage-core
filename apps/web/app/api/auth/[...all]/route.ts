import { getAuth } from "../../../../src/auth";

async function handle(request: Request) {
  return getAuth().handler(request);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
