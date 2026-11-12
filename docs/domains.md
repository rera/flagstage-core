# Domains

Adding a hostname stores the DNS records an operator has to create. Core checks them against the public resolvers `1.1.1.1` and `8.8.8.8` and shows whether each record was found, plus what the name currently resolves to. It does not call a registrar.

- `www` and any other subdomain are a CNAME to the CloudFront connection-group endpoint.
- An apex is an ALIAS or flattened CNAME when no addresses are configured, or A records when addresses are provided.
- Certificate-validation CNAMEs are listed with the routing record when a CloudFront tenant returns them.
- `DOMAINS_DRIVER=none` skips tenant creation and still shows the routing record. `cloudfront-tenants` creates a tenant through the adapter.
- A background job rechecks pending hostnames every 10 minutes for 72 hours. The domain page also has Check again.

The checklist is on each site, under Domain.
