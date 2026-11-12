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

# When this tree is published as github.com/rera/flagstage-core, point source at that
# repository and a release tag. The ref below is the branch this module is developed on.
module "flagstage" {
  source = "git::https://github.com/rera/flagstage.git//infra/opentofu?ref=core/main"

  app_domain            = "sites.example.com"
  preview_domain        = "preview.example.com"
  db_password           = "replace-with-a-long-password"
  better_auth_secret    = "replace-me-with-32-chars-minimum-secret"
  image                 = "ghcr.io/rera/flagstage-core:latest"
  ai_mock               = "1"
  bootstrap_admin_email = "admin@example.com"
}

output "app_url" {
  description = "App URL from the module."
  value       = module.flagstage.app_url
}

output "dns_records" {
  description = "DNS records to create."
  value       = module.flagstage.dns_records
}
