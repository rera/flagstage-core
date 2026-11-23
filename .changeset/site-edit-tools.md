---
"@flagstage/agent": minor
"@flagstage/config": minor
"@flagstage/core": minor
"@flagstage/db": minor
"@flagstage/importer": minor
---

The editing agent gets site-edit tools for finding pages, reading a page, editing an include, setting JSON-LD, retagging, replacing text, and rewriting links. Each call is stored on the change. A change that edits more page files by hand than the platform limit is refused. That limit defaults to 8 and is stored in the database.
