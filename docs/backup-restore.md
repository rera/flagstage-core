# Backup and restore

## Database

The OpenTofu module turns on 7 days of automated RDS backups. For a copy you can move:

```bash
pg_dump "$DATABASE_URL" --format=custom --file=flagstage.dump
pg_restore --clean --if-exists --dbname="$DATABASE_URL" flagstage.dump
```

## Files

Snapshot bytes live in the storage driver. For S3, enable versioning (the module does) and sync:

```bash
aws s3 sync s3://your-bucket ./site-files
aws s3 sync ./site-files s3://your-bucket
```

For the filesystem driver, copy `FS_STORAGE_DIR`.

## One site

`flagstage site export <slug> --out site.tgz` writes the current published snapshot. The archive holds `content.json` (site, snapshot, and the file list) and `files/` with the static bytes. The site must already be published.

## Operator reminder

`flagstage backup` prints the commands above for the storage driver you configured. It does not dump the database and it does not call AWS.
