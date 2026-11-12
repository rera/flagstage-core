# What happens when

Six cases for the builder. Chat runs in one Lambda. The web container only starts that work and relays progress.

## A turn near the 15-minute cap

The Lambda sets a deadline 14 minutes out. When less than a minute remains, or the editor times out, it writes the draft files and the OpenCode session to S3 and returns. It then starts another invocation with the same message. The transcript stays in Postgres. The site page shows "Saving this turn and continuing in a new run."

## Two people editing

A site holds one draft lock. The lock is the person who started the turn, and it lasts until that turn finishes or 15 minutes pass. The second person sees "Someone else is editing this site." Their message is stored and the editor does not run.

## Undoing one edit, and undoing a publish

Each edit writes a new snapshot and points the draft at it. Undo this edit points the draft at that snapshot's parent. The published site does not move. Undo a publish moves the live snapshot back to an earlier published snapshot. The draft can still be the newer edit.

## A fresh Lambda restoring the session

The Lambda reads `sites/<id>/session/` from S3. A finished marker of `ok` means the files are the draft to continue. If the marker is missing while other files are there, the session is treated as unreadable. The turn starts from the current draft snapshot, and the prompt includes the last few transcript lines.

## A cold start

Provisioned concurrency defaults to 0, so the first message after idle waits for the Lambda to start. The web returns as soon as the invoke is accepted. The page follows the thread over the existing event stream and a two-second poll. Set the stack parameter `ProvisionedConcurrency` to 1 when that wait is too long.

## Mobile preview

Below 800 pixels the preview pane is hidden. Chat stays on the page, with an Open preview link to the same draft full screen. Desktop keeps chat on the left and the live preview on the right. The preview reloads when the draft snapshot changes.
