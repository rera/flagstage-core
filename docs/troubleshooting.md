# Troubleshooting

## The app exits immediately

The log prints `Invalid configuration` and one line per variable. Compare with `.env.example`. Production refuses a placeholder `BETTER_AUTH_SECRET`.

## `/api/health` is 200 and `/api/ready` is 503

Read the `checks` object. `db` means Postgres is unreachable. `storage` means the filesystem or bucket rejected a write. `jobs` means the pg-boss schema is missing, which happens before the worker or web boot has started the queue.

## Mail never arrives

Invites and password resets are sent with SES. `sesFrom` in `flagstage.config.json` is the from address.

## An import cannot reach the site

The importer refuses private addresses. The source has to answer on port 80 or 443 with a public DNS name.
