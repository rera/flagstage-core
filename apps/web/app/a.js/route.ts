import { beaconSource } from "@flagstage/analytics";
import { loadConfig } from "@flagstage/config";

export function GET() {
  const source = beaconSource(loadConfig().APP_URL);
  return new Response(source, {
    headers: {
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": "public, max-age=3600"
    }
  });
}
