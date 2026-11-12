# Chat, preview, and publish

A message on a live site is checked, then either answered, held, or turned into a preview.

- A question mark asks a clarifying question and does not edit the site.
- `no change`, `leave it`, and an edit that does not touch a file are reported as already satisfied.
- A request to delete the site, take it down, or involve a lawyer is held until an account admin releases it.
- Anything else, with `AI_MOCK=1`, appends the request to `index.html` and posts a preview link.
- Approve publishes with a compare-and-swap on the live snapshot. If the live snapshot moved, the change is rebuilt from the current files and the stale preview is not published.
- Roll back from the site page to an earlier snapshot.
- Preview links expire. A preview host of `{slug}--{token}.localhost` is rewritten to that preview and sets a `flagstage_preview` cookie.
- The site page listens on Postgres `flagstage_chat` and also polls every 2 seconds.

Sending a message stores it and queues an `agent-turn` job. The worker runs the editor. Approve and roll back stay on the request because they only swap the live snapshot.

`AI_MOCK=1` does not call a model or OpenCode. To use a real model and editor:

1. Set `AI_MOCK=0`.
2. Set `AI_API_KEY`, `AI_BASE_URL` (an OpenAI-compatible `/chat/completions` endpoint), and `AI_MODEL_SMALL`.
3. Install the `opencode` binary on the PATH of the web and worker containers.
4. Send a message. The subprocess environment contains the model settings only. It does not receive `DATABASE_URL` or AWS credentials.

The subprocess is the only `AgentRunner`. It is less isolated than a separate function per turn: it shares the worker's machine and is limited by the process environment and a temp directory. A separate task runner is out of scope.

<!-- copy-review: required before announce -->
