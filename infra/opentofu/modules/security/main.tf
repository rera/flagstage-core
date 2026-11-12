variable "name" {
  type        = string
  description = "Name prefix."
}

variable "vpc_id" {
  type        = string
  description = "VPC id."
}

resource "aws_security_group" "alb" {
  name        = "${var.name}-alb"
  description = "Public HTTP and HTTPS for the app load balancer"
  vpc_id      = var.vpc_id

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.name}-alb"
  }
}

resource "aws_security_group" "service" {
  name        = "${var.name}-service"
  description = "Task ingress from the load balancer only"
  vpc_id      = var.vpc_id

  ingress {
    description     = "App from the load balancer"
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    description = "Database, model API, and image pulls"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.name}-service"
  }
}

resource "aws_security_group_rule" "alb_to_service" {
  type                     = "egress"
  description              = "App containers"
  from_port                = 3000
  to_port                  = 3000
  protocol                 = "tcp"
  security_group_id        = aws_security_group.alb.id
  source_security_group_id = aws_security_group.service.id
}

resource "aws_security_group" "database" {
  name        = "${var.name}-db"
  description = "Postgres from the task only"
  vpc_id      = var.vpc_id

  ingress {
    description     = "Postgres from the task"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.service.id]
  }

  tags = {
    Name = "${var.name}-db"
  }
}

output "alb_security_group_id" {
  description = "Load balancer security group."
  value       = aws_security_group.alb.id
}

output "service_security_group_id" {
  description = "Task security group. Ingress is only from the load balancer."
  value       = aws_security_group.service.id
}

output "database_security_group_id" {
  description = "Database security group. Ingress is only from the task."
  value       = aws_security_group.database.id
}
