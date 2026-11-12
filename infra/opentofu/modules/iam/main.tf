variable "name" {
  type        = string
  description = "Name prefix."
}

variable "bucket_arn" {
  type        = string
  description = "Snapshot bucket ARN."
}

variable "key_value_store_arn" {
  type        = string
  description = "CloudFront KeyValueStore ARN."
}

variable "secret_arns" {
  type        = list(string)
  description = "Secrets the task may read."
}

data "aws_iam_policy_document" "assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "task" {
  name               = "${var.name}-task"
  assume_role_policy = data.aws_iam_policy_document.assume.json
}

resource "aws_iam_role" "execution" {
  name               = "${var.name}-execution"
  assume_role_policy = data.aws_iam_policy_document.assume.json
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

data "aws_iam_policy_document" "task" {
  statement {
    sid     = "Snapshots"
    actions = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"]
    resources = [
      var.bucket_arn,
      "${var.bucket_arn}/*"
    ]
  }

  statement {
    sid = "HostMap"
    actions = [
      "cloudfront-keyvaluestore:DescribeKeyValueStore",
      "cloudfront-keyvaluestore:GetKey",
      "cloudfront-keyvaluestore:ListKeys",
      "cloudfront-keyvaluestore:PutKey",
      "cloudfront-keyvaluestore:UpdateKeys"
    ]
    resources = [var.key_value_store_arn]
  }

  statement {
    sid = "Tenants"
    actions = [
      "cloudfront:CreateDistributionTenant",
      "cloudfront:GetDistributionTenant",
      "cloudfront:UpdateDistributionTenant",
      "cloudfront:DeleteDistributionTenant",
      "cloudfront:ListDistributionTenants",
      "cloudfront:GetConnectionGroup",
      "cloudfront:GetManagedCertificateDetails"
    ]
    resources = ["*"]
  }

  statement {
    sid       = "Secrets"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = var.secret_arns
  }
}

resource "aws_iam_role_policy" "task" {
  name   = "${var.name}-task"
  role   = aws_iam_role.task.id
  policy = data.aws_iam_policy_document.task.json
}

data "aws_iam_policy_document" "execution_secrets" {
  statement {
    sid       = "ReadTaskSecrets"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = var.secret_arns
  }
}

resource "aws_iam_role_policy" "execution_secrets" {
  name   = "${var.name}-execution-secrets"
  role   = aws_iam_role.execution.id
  policy = data.aws_iam_policy_document.execution_secrets.json
}

output "task_role_arn" {
  description = "Task role. S3, the host-map store, CloudFront tenants, and the app secrets."
  value       = aws_iam_role.task.arn
}

output "execution_role_arn" {
  description = "Execution role. Image pull, logs, and reading secrets into the container environment."
  value       = aws_iam_role.execution.arn
}
