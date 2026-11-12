# DNS checklist

Adding a hostname does not change DNS. The Domain page lists the records to create, then checks them against the public resolvers `1.1.1.1` and `8.8.8.8`. A background job rechecks a hostname that is still verifying every 10 minutes for 72 hours. Check again runs the same check immediately.

## What each row is

| Column                 | Meaning                                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------------------------- |
| Type                   | `CNAME` for a subdomain, `A` when apex addresses are configured, or `ALIAS` for an apex when they are not. |
| Name                   | The hostname, or the certificate-validation name when a CloudFront tenant returned one.                    |
| Value                  | Where it should point. For a subdomain that is the connection-group endpoint.                              |
| Found or Not found yet | `Found` means the public answer matches the value. `Not found yet` means it does not.                      |
| Currently              | Shown only when the name resolves to something else. That is the answer the check saw.                     |

A trailing dot on a DNS name is ignored, and the comparison is case-insensitive.

`CNAME` and `A` match the expected value exactly. An `ALIAS` row is found when the hostname's addresses and the target's addresses overlap. Some DNS hosts flatten a CNAME at the apex into A records. The checklist still asks for an `ALIAS` until apex addresses are configured, because Flagstage cannot see that flattening as a CNAME.

## What the status means

| Status    | Meaning                                                                                                                                                                                                            |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| verifying | At least one record is missing, the certificate is not issued yet, or the distribution tenant is not deployed. This is the normal state right after you add a hostname.                                            |
| active    | Every listed record was found, the certificate is issued or there is no certificate to wait for, and the tenant is deployed or there is no tenant.                                                                 |
| error     | The certificate status is `failed`, `revoked`, `expired`, or `validation-timed-out`. Fix the validation records or remove the hostname and add it again. DNS can look correct and the status can still be `error`. |

`DOMAINS_DRIVER=none`, the local default, does not create a tenant. The checklist still shows the routing record, and the status can become `active` once that record resolves. There is no certificate row.

`DOMAINS_DRIVER=cloudfront-tenants` creates the distribution tenant and a managed certificate when you add the hostname, updates them when you save it again, and reads the certificate status back on Check again. The OpenTofu module sets this driver. You still create the records yourself. Nothing in the checklist calls a registrar.

## Order that works

1. Publish the site, or the hostname has nothing to serve.
2. Add the hostname on the Domain page.
3. Create every row at the DNS host, including a certificate-validation CNAME if one is listed.
4. Wait for DNS, then Check again. Verification can stay on `verifying` until the certificate is issued and the tenant is deployed, which is longer than the DNS change alone.
