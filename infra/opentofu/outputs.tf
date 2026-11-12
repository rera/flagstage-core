output "app_url" {
  description = "URL of the Flagstage Core app after the app DNS record exists."
  value       = "https://${var.app_domain}"
}

output "alb_dns_name" {
  description = "Load balancer DNS name."
  value       = module.service.alb_dns_name
}

output "cloudfront_connection_group_endpoint" {
  description = "CloudFront connection-group endpoint. Site hostnames CNAME here."
  value       = module.edge.connection_group_endpoint
}

output "distribution_id" {
  description = "Multi-tenant distribution id."
  value       = module.edge.distribution_id
}

output "key_value_store_arn" {
  description = "Host-map KeyValueStore ARN."
  value       = module.edge.key_value_store_arn
}

output "bucket_name" {
  description = "Snapshot bucket name."
  value       = module.storage.bucket_id
}

output "dns_records" {
  description = "Records to create at the DNS host. Certificate-validation records appear in the AWS console until the certificate is issued. Ignored when create_route53_records is true."
  value = [
    {
      name    = var.app_domain
      type    = "A or ALIAS"
      value   = module.service.alb_dns_name
      purpose = "Application"
    },
    {
      name    = "*.${var.preview_domain}"
      type    = "CNAME"
      value   = module.service.alb_dns_name
      purpose = "Previews"
    },
    {
      name    = "each site hostname"
      type    = "CNAME"
      value   = module.edge.connection_group_endpoint
      purpose = "Published sites. Apex names use an ALIAS or ANAME where the DNS host supports it."
    }
  ]
}
