variable "name" {
  type        = string
  description = "Short prefix for resource names. Lowercase letters, numbers, and hyphens."
  default     = "flagstage"
}

variable "aws_region" {
  type        = string
  description = "Region for the VPC, database, load balancer, and service. CloudFront stays global."
  default     = "us-east-1"
}

variable "app_domain" {
  type        = string
  description = "Hostname for the Flagstage Core app, such as sites.example.com."
}

variable "preview_domain" {
  type        = string
  description = "Domain whose wildcard (*.preview.example.com) serves previews on the load balancer."
}

variable "image" {
  type        = string
  description = "Container image for the web and worker containers. Nothing is published by this repository; the default is a name placeholder."
  default     = "ghcr.io/rera/flagstage-core:latest"
}

variable "db_password" {
  type        = string
  description = "Postgres password. Use letters and digits only so it can sit in a connection URL."
  sensitive   = true
}

variable "better_auth_secret" {
  type        = string
  description = "Session secret, at least 32 characters."
  sensitive   = true
}

variable "ai_api_key" {
  type        = string
  description = "Model API key. Leave empty when AI_MOCK is 1."
  default     = ""
  sensitive   = true
}

variable "ai_mock" {
  type        = string
  description = "1 uses the deterministic editor. 0 calls the configured model and OpenCode."
  default     = "0"
}

variable "bootstrap_admin_email" {
  type        = string
  description = "Optional email that receives the first admin sign-in link in the logs."
  default     = ""
}

variable "vpc_id" {
  type        = string
  description = "Existing VPC id. Leave null to create a VPC with two public and two private subnets and no NAT."
  default     = null
}

variable "public_subnet_ids" {
  type        = list(string)
  description = "Public subnets for the load balancer and the task. Required when vpc_id is set. Two subnets in different availability zones."
  default     = []
}

variable "private_subnet_ids" {
  type        = list(string)
  description = "Private subnets for the database. Required when vpc_id is set. Two subnets in different availability zones."
  default     = []
}

variable "route_table_ids" {
  type        = list(string)
  description = "Route tables that receive the S3 gateway endpoint when vpc_id is set."
  default     = []
}

variable "create_route53_records" {
  type        = bool
  description = "Create alias and certificate-validation records in route53_zone_id. Leave false to copy the records from the outputs."
  default     = false
}

variable "route53_zone_id" {
  type        = string
  description = "Hosted zone for app_domain and preview_domain. Required when create_route53_records is true."
  default     = null
}
