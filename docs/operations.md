# Operations

Each chat turn and each import has one correlation id. The web app generates it, returns it on the `x-correlation-id` response header, and stores it on the message, the change request, and the import run. The same id is the `correlationId` field on the job payload, which is the event a chat Lambda receives. `taskEnvironment()` in `@flagstage/jobs` is the environment an import Fargate task receives: `CORRELATION_ID`. The worker reads the payload first, then that environment variable, and every log line written while the turn or import runs includes `correlationId`.

The log group is `/flagstage/<Name>`. The default name is `flagstage`, so the group is `/flagstage/flagstage`.

## Find everything about a failed turn

Copy the id from the `x-correlation-id` response header, or from `message.correlation_id`, `change_request.correlation_id`, or `import_run.correlation_id`. In CloudWatch Logs Insights:

```
fields @timestamp, service, msg, correlationId, siteId, err
| filter correlationId = "PASTE_THE_ID"
| sort @timestamp asc
```
