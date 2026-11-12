variable "name" {
  type        = string
  description = "Name prefix."
}

variable "bucket_id" {
  type        = string
  description = "Snapshot bucket name."
}

variable "bucket_arn" {
  type        = string
  description = "Snapshot bucket ARN."
}

variable "bucket_regional_domain_name" {
  type        = string
  description = "Snapshot bucket regional domain name."
}

resource "aws_cloudfront_origin_access_control" "sites" {
  name                              = "${var.name}-sites"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_key_value_store" "hosts" {
  name    = "${var.name}-hosts"
  comment = "Hostname to live snapshot prefix"
}

resource "aws_cloudfront_function" "viewer_request" {
  name                         = "${var.name}-viewer-request"
  runtime                      = "cloudfront-js-2.0"
  comment                      = "Rewrite Host to the live snapshot prefix"
  publish                      = true
  code                         = file("${path.module}/viewer-request.js")
  key_value_store_associations = [aws_cloudfront_key_value_store.hosts.arn]
}

resource "aws_cloudfront_function" "viewer_response" {
  name    = "${var.name}-viewer-response"
  runtime = "cloudfront-js-2.0"
  comment = "Set content type and cache control"
  publish = true
  code    = file("${path.module}/viewer-response.js")
}

data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized"
}

resource "aws_cloudfront_multitenant_distribution" "sites" {
  comment = "${var.name} published sites"
  enabled = true

  origin {
    domain_name              = var.bucket_regional_domain_name
    id                       = "sites"
    origin_access_control_id = aws_cloudfront_origin_access_control.sites.id
  }

  default_cache_behavior {
    target_origin_id       = "sites"
    viewer_protocol_policy = "redirect-to-https"
    cache_policy_id        = data.aws_cloudfront_cache_policy.caching_optimized.id
    compress               = true

    allowed_methods {
      items          = ["GET", "HEAD", "OPTIONS"]
      cached_methods = ["GET", "HEAD"]
    }

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.viewer_request.arn
    }

    function_association {
      event_type   = "viewer-response"
      function_arn = aws_cloudfront_function.viewer_response.arn
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tenant_config {
    parameter_definition {
      name = "site_id"
      definition {
        string_schema {
          required = false
          comment  = "Site id for this tenant"
        }
      }
    }
  }
}

resource "aws_cloudfront_connection_group" "sites" {
  name    = "${var.name}-sites"
  enabled = true
}

resource "aws_s3_bucket_policy" "sites" {
  bucket = var.bucket_id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowCloudFront"
        Effect    = "Allow"
        Principal = { Service = "cloudfront.amazonaws.com" }
        Action    = "s3:GetObject"
        Resource  = "${var.bucket_arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_multitenant_distribution.sites.arn
          }
        }
      }
    ]
  })
}

output "distribution_id" {
  description = "Multi-tenant distribution id. The app creates one tenant per site."
  value       = aws_cloudfront_multitenant_distribution.sites.id
}

output "distribution_arn" {
  description = "Multi-tenant distribution ARN."
  value       = aws_cloudfront_multitenant_distribution.sites.arn
}

output "key_value_store_arn" {
  description = "KeyValueStore ARN. Keys are hostnames and values are live snapshot prefixes."
  value       = aws_cloudfront_key_value_store.hosts.arn
}

output "connection_group_id" {
  description = "Connection group id passed to new distribution tenants."
  value       = aws_cloudfront_connection_group.sites.id
}

output "connection_group_endpoint" {
  description = "DNS name operators CNAME site hostnames to, or use as an alias target."
  value       = aws_cloudfront_connection_group.sites.routing_endpoint
}
