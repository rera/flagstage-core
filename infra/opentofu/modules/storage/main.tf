variable "name" {
  type        = string
  description = "Name prefix."
}

resource "aws_s3_bucket" "sites" {
  bucket_prefix = "${var.name}-sites-"

  tags = {
    Name = "${var.name}-sites"
  }
}

resource "aws_s3_bucket_versioning" "sites" {
  bucket = aws_s3_bucket.sites.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_public_access_block" "sites" {
  bucket                  = aws_s3_bucket.sites.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "sites" {
  bucket = aws_s3_bucket.sites.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "sites" {
  bucket = aws_s3_bucket.sites.id

  rule {
    id     = "expire-old-versions"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 30
    }
  }
}

output "bucket_id" {
  description = "Snapshot bucket name."
  value       = aws_s3_bucket.sites.id
}

output "bucket_arn" {
  description = "Snapshot bucket ARN."
  value       = aws_s3_bucket.sites.arn
}

output "bucket_regional_domain_name" {
  description = "Regional domain used as the CloudFront origin."
  value       = aws_s3_bucket.sites.bucket_regional_domain_name
}
