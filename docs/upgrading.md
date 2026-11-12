# Upgrading

Take a backup first. Migrations are forward-only, so the previous image may not start against a database the new image has already migrated. See [backup and restore](backup-restore.md).

Read `CHANGELOG.md` before you roll forward. [0.1.0](../CHANGELOG.md) is unreleased and has no breaking changes.

## Application

1. Pin an image tag or a git revision. Do not deploy `latest` and then expect to know what you are running.
2. Pull that image, or check out that revision.
3. Restart the web process and the worker. Both apply migrations at startup, behind one Postgres advisory lock, so either process can start first.
4. Wait until `GET /api/ready` returns 200. `/api/health` only means the process is up. `/api/ready` means it can reach the database.

On the evaluation compose file:

```bash
docker compose pull
docker compose up -d
```

That file is not the production layout. On AWS, run `./deploy.sh` again with the new image, or roll the ECS service to it. This repository does not deploy from CI.

## Rolling back

Redeploy the previous image only if that image's schema matches the database. If the new version ran a migration, restore the backup instead of starting the old image against the new schema. Published snapshots are files in the bucket or `FS_STORAGE_DIR`. Restoring the database without those files, or the files without the database, leaves sites pointing at missing snapshots.

There is no phone-home and no automatic upgrade.
