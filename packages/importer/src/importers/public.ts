import { crawlSite } from "../crawl";
import type { Importer } from "../interface";

export const PUBLIC_IMPORTER_ID = "public";

export const publicImporter: Importer = {
  id: PUBLIC_IMPORTER_ID,
  label: "Public website",
  detect() {
    return null;
  },
  run: crawlSite
};
