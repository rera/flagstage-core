variable "name" {
  type        = string
  description = "Name prefix."
}

variable "private_subnet_ids" {
  type        = list(string)
  description = "Private subnets for the database subnet group."
}

variable "security_group_id" {
  type        = string
  description = "Security group that allows Postgres from the service only."
}

variable "password" {
  type        = string
  description = "Master password."
  sensitive   = true
}

resource "aws_db_subnet_group" "main" {
  name       = "${var.name}-db"
  subnet_ids = var.private_subnet_ids

  tags = {
    Name = "${var.name}-db"
  }
}

resource "aws_db_instance" "main" {
  identifier                 = "${var.name}-db"
  engine                     = "postgres"
  engine_version             = "17.4"
  instance_class             = "db.t4g.micro"
  allocated_storage          = 20
  db_name                    = "flagstage"
  username                   = "flagstage"
  password                   = var.password
  db_subnet_group_name       = aws_db_subnet_group.main.name
  vpc_security_group_ids     = [var.security_group_id]
  storage_encrypted          = true
  backup_retention_period    = 7
  publicly_accessible        = false
  skip_final_snapshot        = true
  auto_minor_version_upgrade = true
  deletion_protection        = false

  tags = {
    Name = "${var.name}-db"
  }
}

output "address" {
  description = "Database hostname inside the VPC."
  value       = aws_db_instance.main.address
}

output "port" {
  description = "Database port."
  value       = aws_db_instance.main.port
}
