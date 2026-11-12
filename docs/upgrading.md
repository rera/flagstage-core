# Upgrading

Migrations run when the container starts, behind a Postgres advisory lock. They are forward-only. Take a backup before you upgrade. See [backup and restore](backup-restore.md).

## Unreleased

No breaking changes yet.

Pull the new image (or the new git revision), restart the web and worker processes, and wait until `/api/ready` returns 200.
