terraform {
  required_version = ">= 1.8.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region = "us-east-1"
}

variable "vpc_id" {
  type        = string
  description = "Existing VPC. It needs two public subnets, two private subnets, and a route table for the S3 gateway endpoint."
}

variable "public_subnet_ids" {
  type        = list(string)
  description = "Two public subnets in different availability zones."
}

variable "private_subnet_ids" {
  type        = list(string)
  description = "Two private subnets in different availability zones, for the database."
}

variable "route_table_ids" {
  type        = list(string)
  description = "Route tables that should reach S3 through the gateway endpoint."
}

# When this tree is published as github.com/rera/flagstage-core, point source at that
# repository and a release tag.
module "flagstage" {
  source = "git::https://github.com/rera/flagstage.git//infra/opentofu?ref=core/main"

  app_domain         = "sites.example.com"
  preview_domain     = "preview.example.com"
  db_password        = "replace-with-a-long-password"
  better_auth_secret = "replace-me-with-32-chars-minimum-secret"
  image              = "ghcr.io/rera/flagstage-core:latest"
  vpc_id             = var.vpc_id
  public_subnet_ids  = var.public_subnet_ids
  private_subnet_ids = var.private_subnet_ids
  route_table_ids    = var.route_table_ids
}

output "cloudfront_connection_group_endpoint" {
  description = "Endpoint site hostnames point at."
  value       = module.flagstage.cloudfront_connection_group_endpoint
}
