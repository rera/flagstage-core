import { CRAWLER_USER_AGENT } from "./discover";
import type { Fetched } from "./types";

export async function defaultFetch(url: string): Promise<Fetched> {
  const response = await fetch(url, {
    redirect: "follow",
    headers: { accept: "*/*", "user-agent": CRAWLER_USER_AGENT }
  });
  return {
    status: response.status,
    body: new Uint8Array(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") ?? ""
  };
}
