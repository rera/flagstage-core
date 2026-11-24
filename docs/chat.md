# Chat, preview, and publish

Every chat starts on a site. The web app stores the message and starts the chat Lambda. Locally, with no function name set, the same turn function runs in the web process.

- OpenCode edits the draft. The preview on the right reloads when the draft snapshot changes. The prompt includes `.flagstage/skills/site/SKILL.md` when the snapshot has that site skill.
- The editor is given site-edit tools: `find_pages`, `read_page`, `edit_include`, `set_meta`, `retag`, `replace_text`, and `list_links`. A tool previews until it is called again with the apply id from that preview. The change record lists each call and the files it wrote. A change that edits more page files by hand than the platform limit is discarded, and the editor is asked once to redo it. That instruction is not shown in the chat. The limit is a database setting, not an environment variable. The default is 8.
- An edit that does not touch a file is reported as already satisfied.
- Publish moves the live snapshot to the draft. Undo this edit moves only the draft. Undo a publish moves the live snapshot.
- One person holds the draft lock. A second person is told someone else is editing.
- Preview links expire. A preview is `{APP_URL}/preview/{token}` and the live draft is `{APP_URL}/sites/{id}/live`. Both open only for someone who can see that site.
- The site page listens on Postgres `flagstage_chat` and also polls every 2 seconds.

See [what happens when](design/what-happens-when.md).

To edit a site:

1. Set `bedrockModelId` and `region` in `flagstage.config.json`.
2. The image installs OpenCode 2.2.7 for the `flagstage` user and runs `opencode run --standalone`. That is headless. It does not open a terminal, and it does not update itself.
3. Send a message. OpenCode uses the amazon-bedrock provider and the task role. The subprocess does not receive `DATABASE_URL` or static access keys.

A checkout that is not running the image needs the same `opencode` binary on `PATH`. `packages/agent/src/bedrock-edit.integration.test.ts` edits a one-page site with that binary and is skipped unless AWS credentials are already in the environment.

The subprocess is the only `AgentRunner`. In production it runs inside the chat Lambda. Locally it runs in the web process.

<!-- copy-review: required before announce -->
