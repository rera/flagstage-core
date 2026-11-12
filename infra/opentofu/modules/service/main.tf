variable "name" {
  type        = string
  description = "Name prefix."
}

variable "region" {
  type        = string
  description = "Region for logs and the S3 client."
}

variable "vpc_id" {
  type        = string
  description = "VPC id."
}

variable "public_subnet_ids" {
  type        = list(string)
  description = "Public subnets for the load balancer and the task."
}

variable "image" {
  type        = string
  description = "Container image."
}

variable "app_domain" {
  type        = string
  description = "App hostname."
}

variable "certificate_arn" {
  type        = string
  description = "ACM certificate for the app hostname."
}

variable "task_role_arn" {
  type        = string
  description = "Task role ARN."
}

variable "execution_role_arn" {
  type        = string
  description = "Execution role ARN."
}

variable "database_secret_arn" {
  type        = string
  description = "Secret that holds DATABASE_URL."
}

variable "auth_secret_arn" {
  type        = string
  description = "Secret that holds BETTER_AUTH_SECRET."
}

variable "ai_secret_arn" {
  type        = string
  description = "Secret that holds AI_API_KEY."
}

variable "bucket_name" {
  type        = string
  description = "Snapshot bucket name."
}

variable "key_value_store_arn" {
  type        = string
  description = "Host-map KeyValueStore ARN."
}

variable "distribution_id" {
  type        = string
  description = "Multi-tenant distribution id."
}

variable "connection_group_endpoint" {
  type        = string
  description = "Connection group DNS name."
}

variable "connection_group_id" {
  type        = string
  description = "Connection group id for distribution tenants."
}

variable "ai_mock" {
  type        = string
  description = "1 or 0."
}

variable "alb_security_group_id" {
  type        = string
  description = "Load balancer security group."
}

variable "service_security_group_id" {
  type        = string
  description = "Task security group."
}

variable "bootstrap_admin_email" {
  type        = string
  description = "Optional first admin email."
}

resource "aws_lb" "app" {
  name               = "${var.name}-app"
  load_balancer_type = "application"
  internal           = false
  security_groups    = [var.alb_security_group_id]
  subnets            = var.public_subnet_ids
}

resource "aws_lb_target_group" "web" {
  name        = "${var.name}-web"
  port        = 3000
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = var.vpc_id

  health_check {
    path = "/api/health"
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.app.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.web.arn
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.app.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

resource "aws_cloudwatch_log_group" "app" {
  name              = "/flagstage/${var.name}"
  retention_in_days = 14
}

resource "aws_ecs_cluster" "main" {
  name = var.name
}

locals {
  environment = [
    { name = "APP_URL", value = "https://${var.app_domain}" },
    { name = "STORAGE_DRIVER", value = "s3" },
    { name = "S3_BUCKET", value = var.bucket_name },
    { name = "S3_REGION", value = var.region },
    { name = "HOSTMAP_DRIVER", value = "cloudfront-kvs" },
    { name = "CLOUDFRONT_KVS_ARN", value = var.key_value_store_arn },
    { name = "CLOUDFRONT_DISTRIBUTION_ID", value = var.distribution_id },
    { name = "CLOUDFRONT_CONNECTION_GROUP_ID", value = var.connection_group_id },
    { name = "CLOUDFRONT_CONNECTION_GROUP_ENDPOINT", value = var.connection_group_endpoint },
    { name = "DOMAINS_DRIVER", value = "cloudfront-tenants" },
    { name = "AI_MOCK", value = var.ai_mock },
    { name = "NODE_ENV", value = "production" },
    { name = "BOOTSTRAP_ADMIN_EMAIL", value = var.bootstrap_admin_email }
  ]
  secrets = [
    { name = "DATABASE_URL", valueFrom = var.database_secret_arn },
    { name = "BETTER_AUTH_SECRET", valueFrom = var.auth_secret_arn },
    { name = "AI_API_KEY", valueFrom = var.ai_secret_arn }
  ]
}

resource "aws_ecs_task_definition" "app" {
  family                   = var.name
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "1024"
  memory                   = "2048"
  execution_role_arn       = var.execution_role_arn
  task_role_arn            = var.task_role_arn

  container_definitions = jsonencode([
    {
      name        = "web"
      image       = var.image
      essential   = true
      command     = ["web"]
      environment = local.environment
      secrets     = local.secrets
      portMappings = [
        { containerPort = 3000, protocol = "tcp" }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.app.name
          awslogs-region        = var.region
          awslogs-stream-prefix = "web"
        }
      }
      healthCheck = {
        command     = ["CMD-SHELL", "wget -qO- http://127.0.0.1:3000/api/health || exit 1"]
        interval    = 15
        timeout     = 3
        retries     = 5
        startPeriod = 30
      }
    },
    {
      name        = "worker"
      image       = var.image
      essential   = false
      command     = ["worker"]
      environment = local.environment
      secrets     = local.secrets
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.app.name
          awslogs-region        = var.region
          awslogs-stream-prefix = "worker"
        }
      }
      healthCheck = {
        command     = ["CMD-SHELL", "wget -qO- http://127.0.0.1:3001/health || exit 1"]
        interval    = 15
        timeout     = 3
        retries     = 5
        startPeriod = 30
      }
    }
  ])
}

resource "aws_ecs_service" "app" {
  name            = var.name
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.public_subnet_ids
    security_groups  = [var.service_security_group_id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.web.arn
    container_name   = "web"
    container_port   = 3000
  }

  depends_on = [aws_lb_listener.https]
}

output "alb_dns_name" {
  description = "Load balancer DNS name. Point the app hostname here."
  value       = aws_lb.app.dns_name
}

output "alb_zone_id" {
  description = "Load balancer hosted zone id, for an alias record."
  value       = aws_lb.app.zone_id
}
