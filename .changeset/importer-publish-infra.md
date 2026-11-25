---
"@flagstage/db": minor
"@flagstage/publish": minor
---

Snapshot byte size is a bigint, so a site over 2 GiB can be stored. Publish downloads snapshot files with a bounded concurrency, and a change of more than 500 files invalidates `/*`. The import task is 2 vCPU and 4 GB, and its role can call the importer decision model on Bedrock.
