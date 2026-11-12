locals {
  create_network     = var.vpc_id == null
  vpc_id             = local.create_network ? module.network[0].vpc_id : var.vpc_id
  public_subnet_ids  = local.create_network ? module.network[0].public_subnet_ids : var.public_subnet_ids
  private_subnet_ids = local.create_network ? module.network[0].private_subnet_ids : var.private_subnet_ids
}

module "network" {
  count  = local.create_network ? 1 : 0
  source = "./modules/network"
  name   = var.name
}

module "security" {
  source = "./modules/security"
  name   = var.name
  vpc_id = local.vpc_id
}

module "storage" {
  source = "./modules/storage"
  name   = var.name
}

module "edge" {
  source                      = "./modules/edge"
  name                        = var.name
  bucket_id                   = module.storage.bucket_id
  bucket_arn                  = module.storage.bucket_arn
  bucket_regional_domain_name = module.storage.bucket_regional_domain_name
}

module "database" {
  source             = "./modules/database"
  name               = var.name
  private_subnet_ids = local.private_subnet_ids
  security_group_id  = module.security.database_security_group_id
  password           = var.db_password
}

resource "aws_vpc_endpoint" "s3" {
  count             = local.create_network ? 0 : 1
  vpc_id            = var.vpc_id
  service_name      = "com.amazonaws.${var.aws_region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = var.route_table_ids

  tags = {
    Name = "${var.name}-s3"
  }
}

resource "aws_acm_certificate" "app" {
  domain_name               = var.app_domain
  subject_alternative_names = ["*.${var.preview_domain}"]
  validation_method         = "DNS"

  tags = {
    Name = var.app_domain
  }
}

resource "aws_secretsmanager_secret" "database" {
  name = "${var.name}/database-url"
}

resource "aws_secretsmanager_secret_version" "database" {
  secret_id     = aws_secretsmanager_secret.database.id
  secret_string = "postgres://flagstage:${var.db_password}@${module.database.address}:${module.database.port}/flagstage"
}

resource "aws_secretsmanager_secret" "auth" {
  name = "${var.name}/better-auth-secret"
}

resource "aws_secretsmanager_secret_version" "auth" {
  secret_id     = aws_secretsmanager_secret.auth.id
  secret_string = var.better_auth_secret
}

resource "aws_secretsmanager_secret" "ai" {
  name = "${var.name}/ai-api-key"
}

resource "aws_secretsmanager_secret_version" "ai" {
  secret_id     = aws_secretsmanager_secret.ai.id
  secret_string = var.ai_api_key
}

module "iam" {
  source              = "./modules/iam"
  name                = var.name
  bucket_arn          = module.storage.bucket_arn
  key_value_store_arn = module.edge.key_value_store_arn
  secret_arns = [
    aws_secretsmanager_secret.database.arn,
    aws_secretsmanager_secret.auth.arn,
    aws_secretsmanager_secret.ai.arn
  ]
}

module "service" {
  source                    = "./modules/service"
  name                      = var.name
  region                    = var.aws_region
  vpc_id                    = local.vpc_id
  public_subnet_ids         = local.public_subnet_ids
  image                     = var.image
  app_domain                = var.app_domain
  preview_domain            = var.preview_domain
  certificate_arn           = aws_acm_certificate.app.arn
  task_role_arn             = module.iam.task_role_arn
  execution_role_arn        = module.iam.execution_role_arn
  database_secret_arn       = aws_secretsmanager_secret.database.arn
  auth_secret_arn           = aws_secretsmanager_secret.auth.arn
  ai_secret_arn             = aws_secretsmanager_secret.ai.arn
  bucket_name               = module.storage.bucket_id
  key_value_store_arn       = module.edge.key_value_store_arn
  distribution_id           = module.edge.distribution_id
  connection_group_id       = module.edge.connection_group_id
  connection_group_endpoint = module.edge.connection_group_endpoint
  ai_mock                   = var.ai_mock
  bootstrap_admin_email     = var.bootstrap_admin_email
  alb_security_group_id     = module.security.alb_security_group_id
  service_security_group_id = module.security.service_security_group_id
}

resource "aws_route53_record" "app" {
  count   = var.create_route53_records ? 1 : 0
  zone_id = var.route53_zone_id
  name    = var.app_domain
  type    = "A"

  alias {
    name                   = module.service.alb_dns_name
    zone_id                = module.service.alb_zone_id
    evaluate_target_health = true
  }
}

resource "aws_route53_record" "preview" {
  count   = var.create_route53_records ? 1 : 0
  zone_id = var.route53_zone_id
  name    = "*.${var.preview_domain}"
  type    = "CNAME"
  ttl     = 300
  records = [module.service.alb_dns_name]
}

resource "aws_route53_record" "cert" {
  for_each = var.create_route53_records ? {
    for dvo in aws_acm_certificate.app.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  } : {}

  zone_id = var.route53_zone_id
  name    = each.value.name
  type    = each.value.type
  ttl     = 300
  records = [each.value.record]
}
