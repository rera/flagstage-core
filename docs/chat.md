# Chat, preview, and publish

A message on a live site is checked, then either answered, held, or turned into a preview.

- A question mark asks a clarifying question and does not edit the site.
- `no change`, `leave it`, and an edit that does not touch a file are reported as already satisfied.
- A request to delete the site, take it down, or involve a lawyer is held until an account admin releases it.
- Anything else is queued for OpenCode, which edits the snapshot and posts a preview link.
- Approve publishes with a compare-and-swap on the live snapshot. If the live snapshot moved, the change is rebuilt from the current files and the stale preview is not published.
- Roll back from the site page to an earlier snapshot.
- Preview links expire. A preview is `{APP_URL}/preview/{token}` and only opens for someone who can see that site.
- The site page listens on Postgres `flagstage_chat` and also polls every 2 seconds.

Sending a message stores it and queues an `agent-turn` job. The worker runs OpenCode. Approve and roll back stay on the request because they only swap the live snapshot.

To edit a site:

1. Set `bedrockModelId` and `region` in `flagstage.config.json`.
2. The image installs OpenCode 2.2.7 for the `flagstage` user and runs `opencode run --standalone`. That is headless. It does not open a terminal, and it does not update itself.
3. Send a message. OpenCode uses the amazon-bedrock provider and the task role. The subprocess does not receive `DATABASE_URL` or static access keys.

A checkout that is not running the image needs the same `opencode` binary on the worker `PATH`. `packages/agent/src/bedrock-edit.integration.test.ts` edits a one-page site with that binary and is skipped unless AWS credentials are already in the environment.

The subprocess is the only `AgentRunner`. It is less isolated than a separate function per turn: it shares the worker's machine and is limited by the process environment and a temp directory. A separate task runner is out of scope.

<!-- copy-review: required before announce -->
