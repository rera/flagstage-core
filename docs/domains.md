# Domains

Adding a hostname stores the DNS records an operator has to create. Core checks them against public resolvers and shows found or not, plus what the name currently resolves to. It does not call a registrar.

`www` and other subdomains are a CNAME to the CloudFront connection-group endpoint. An apex can be a Route 53 alias, an ALIAS or flattened CNAME at a DNS host that supports it, or a redirect to `www` at the registrar.

The checker and the checklist UI land with the domains milestone.
