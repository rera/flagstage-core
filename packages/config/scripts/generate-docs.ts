import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { renderConfigurationMarkdown } from "../src/docs";

const target = resolve(import.meta.dirname, "../../../docs/configuration.md");
writeFileSync(target, renderConfigurationMarkdown());
console.log(`wrote ${target}`);
