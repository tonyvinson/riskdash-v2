terraform {
  required_version = ">= 1.4"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 4.0.0"
    }
  }
  
  backend "s3" {
    bucket         = "ksi-mvp-tfstate-dev"
    key            = "ksi-mvp/terraform.tfstate"
    region         = "us-gov-west-1"
    encrypt        = true
    use_lockfile   = true
  }
}

provider "aws" {
  region = var.aws_region
  
  default_tags {
    tags = {
      Project     = "KSI-MVP"
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}

# ============================================================================
# TENANTS TABLE
# ============================================================================

resource "aws_dynamodb_table" "tenants" {
  name           = "${var.project_name}-tenants-${var.environment}"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "tenant_id"
  
  attribute {
    name = "tenant_id"
    type = "S"
  }
  
  point_in_time_recovery {
    enabled = true
  }
  
  server_side_encryption {
    enabled = true
  }
  
  tags = {
    Name = "KSI MVP Tenants"
  }
}

# ============================================================================
# EXECUTIONS TABLE
# ============================================================================

resource "aws_dynamodb_table" "executions" {
  name           = "${var.project_name}-executions-${var.environment}"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "execution_id"
  range_key      = "timestamp"
  
  attribute {
    name = "execution_id"
    type = "S"
  }
  
  attribute {
    name = "timestamp"
    type = "S"
  }
  
  attribute {
    name = "tenant_id"
    type = "S"
  }
  
  global_secondary_index {
    name     = "tenant-timestamp-index"
    hash_key = "tenant_id"
    range_key = "timestamp"
    projection_type = "ALL"
  }
  
  point_in_time_recovery {
    enabled = true
  }
  
  server_side_encryption {
    enabled = true
  }
  
  tags = {
    Name = "KSI MVP Executions"
  }
}

# ============================================================================
# VALIDATION RULES TABLE
# ============================================================================

resource "aws_dynamodb_table" "validation_rules" {
  name           = "${var.project_name}-validation-rules-${var.environment}"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "rule_id"
  
  attribute {
    name = "rule_id"
    type = "S"
  }
  
  attribute {
    name = "ksi_id"
    type = "S"
  }
  
  attribute {
    name = "version"
    type = "S"
  }
  
  attribute {
    name = "status"
    type = "S"
  }
  
  global_secondary_index {
    name     = "ksi-version-index"
    hash_key = "ksi_id"
    range_key = "version"
    projection_type = "ALL"
  }
  
  global_secondary_index {
    name     = "status-index"
    hash_key = "status"
    range_key = "ksi_id"
    projection_type = "ALL"
  }
  
  point_in_time_recovery {
    enabled = true
  }
  
  server_side_encryption {
    enabled = true
  }
  
  tags = {
    Name = "KSI Validation Rules"
  }
}

# ============================================================================
# TENANT RULE OVERRIDES TABLE
# ============================================================================

resource "aws_dynamodb_table" "tenant_rule_overrides" {
  name           = "${var.project_name}-tenant-rule-overrides-${var.environment}"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "tenant_id"
  range_key      = "rule_id"
  
  attribute {
    name = "tenant_id"
    type = "S"
  }
  
  attribute {
    name = "rule_id"
    type = "S"
  }
  
  global_secondary_index {
    name     = "rule-tenant-index"
    hash_key = "rule_id"
    range_key = "tenant_id"
    projection_type = "ALL"
  }
  
  point_in_time_recovery {
    enabled = true
  }
  
  server_side_encryption {
    enabled = true
  }
  
  tags = {
    Name = "Tenant Rule Overrides"
  }
}

# ============================================================================
# LAMBDA IAM ROLE
# ============================================================================

resource "aws_iam_role" "lambda_role" {
  name = "${var.project_name}-lambda-role-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_policy" "lambda_policy" {
  name        = "${var.project_name}-lambda-policy-${var.environment}"
  description = "IAM policy for KSI validator Lambda"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws-us-gov:logs:*:*:*"
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:Query",
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:Scan"
        ]
        Resource = [
          aws_dynamodb_table.tenants.arn,
          aws_dynamodb_table.executions.arn,
          "${aws_dynamodb_table.executions.arn}/index/*",
          aws_dynamodb_table.validation_rules.arn,
          "${aws_dynamodb_table.validation_rules.arn}/index/*",
          aws_dynamodb_table.tenant_rule_overrides.arn,
          "${aws_dynamodb_table.tenant_rule_overrides.arn}/index/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "cloudtrail:DescribeTrails",
          "cloudtrail:GetTrailStatus", 
          "cloudtrail:LookupEvents",
          "logs:DescribeLogGroups",
          "kms:ListKeys",
          "kms:ListAliases",
          "securityhub:GetFindings",
          "securityhub:GetInsights",
          "config:DescribeDeliveryChannels",
          "config:DescribeConfigurationRecorders",
          "organizations:DescribeOrganization",
          "sns:ListTopics",
          "cloudwatch:DescribeAlarms",
          "backup:ListBackupPlans",
          "backup:ListBackupVaults",
          "lambda:ListFunctions",
          "s3:ListBuckets",
          "rds:DescribeDBInstances",
          "acm:ListCertificates",
          "sts:AssumeRole"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_policy_attachment" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = aws_iam_policy.lambda_policy.arn
}

# ============================================================================
# LAMBDA FUNCTION
# ============================================================================

resource "aws_lambda_function" "ksi_validator" {
  filename         = "ksi_validator.zip"
  function_name    = "${var.project_name}-validator-${var.environment}"
  role            = aws_iam_role.lambda_role.arn
  handler         = "handler.lambda_handler"
  runtime         = "python3.9"
  timeout         = 300
  memory_size     = 512
  
  environment {
    variables = {
      TENANTS_TABLE = aws_dynamodb_table.tenants.name
      EXECUTIONS_TABLE = aws_dynamodb_table.executions.name
      VALIDATION_RULES_TABLE = aws_dynamodb_table.validation_rules.name
      TENANT_OVERRIDES_TABLE = aws_dynamodb_table.tenant_rule_overrides.name
    }
  }
  
  depends_on = [
    aws_iam_role_policy_attachment.lambda_policy_attachment,
  ]
}

# ============================================================================
# API GATEWAY
# ============================================================================

resource "aws_api_gateway_rest_api" "ksi_api" {
  name = "${var.project_name}-api-${var.environment}"
  
  endpoint_configuration {
    types = ["REGIONAL"]
  }
}

resource "aws_api_gateway_resource" "proxy" {
  rest_api_id = aws_api_gateway_rest_api.ksi_api.id
  parent_id   = aws_api_gateway_rest_api.ksi_api.root_resource_id
  path_part   = "{proxy+}"
}

resource "aws_api_gateway_method" "proxy" {
  rest_api_id   = aws_api_gateway_rest_api.ksi_api.id
  resource_id   = aws_api_gateway_resource.proxy.id
  http_method   = "ANY"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "lambda" {
  rest_api_id = aws_api_gateway_rest_api.ksi_api.id
  resource_id = aws_api_gateway_method.proxy.resource_id
  http_method = aws_api_gateway_method.proxy.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.ksi_validator.invoke_arn
}

resource "aws_lambda_permission" "api_gw" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ksi_validator.function_name
  principal     = "apigateway.amazonaws.com"

  source_arn = "${aws_api_gateway_rest_api.ksi_api.execution_arn}/*/*"
}

resource "aws_api_gateway_deployment" "deployment" {
  depends_on = [
    aws_api_gateway_integration.lambda,
  ]

  rest_api_id = aws_api_gateway_rest_api.ksi_api.id
  
  triggers = {
    redeployment = sha1(jsonencode([
      aws_api_gateway_resource.proxy.id,
      aws_api_gateway_method.proxy.id,
      aws_api_gateway_integration.lambda.id,
    ]))
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_api_gateway_stage" "stage" {
  deployment_id = aws_api_gateway_deployment.deployment.id
  rest_api_id   = aws_api_gateway_rest_api.ksi_api.id
  stage_name    = var.environment
}

# ============================================================================
# OUTPUTS
# ============================================================================

output "api_gateway_url" {
  description = "API Gateway URL"
  value       = aws_api_gateway_stage.stage.invoke_url

}

output "lambda_function_name" {
  description = "Lambda function name"
  value       = aws_lambda_function.ksi_validator.function_name
}

output "tenants_table" {
  description = "Tenants table name"
  value       = aws_dynamodb_table.tenants.name
}

output "validation_rules_table" {
  description = "Validation rules table name"
  value       = aws_dynamodb_table.validation_rules.name
}


# ============================================================================
# API GATEWAY CORS CONFIGURATION
# ============================================================================

# OPTIONS method for CORS preflight
resource "aws_api_gateway_method" "cors" {
  rest_api_id   = aws_api_gateway_rest_api.ksi_api.id
  resource_id   = aws_api_gateway_resource.proxy.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

# CORS integration (mock)
resource "aws_api_gateway_integration" "cors" {
  rest_api_id = aws_api_gateway_rest_api.ksi_api.id
  resource_id = aws_api_gateway_resource.proxy.id
  http_method = aws_api_gateway_method.cors.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = jsonencode({
      statusCode = 200
    })
  }
}

# CORS method response
resource "aws_api_gateway_method_response" "cors" {
  rest_api_id = aws_api_gateway_rest_api.ksi_api.id
  resource_id = aws_api_gateway_resource.proxy.id
  http_method = aws_api_gateway_method.cors.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

# CORS integration response
resource "aws_api_gateway_integration_response" "cors" {
  rest_api_id = aws_api_gateway_rest_api.ksi_api.id
  resource_id = aws_api_gateway_resource.proxy.id
  http_method = aws_api_gateway_method.cors.http_method
  status_code = aws_api_gateway_method_response.cors.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Requested-With'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,OPTIONS,POST,PUT,DELETE'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }

  depends_on = [aws_api_gateway_method.cors, aws_api_gateway_integration.cors]
}

# Update the existing lambda integration to include CORS headers
resource "aws_api_gateway_method_response" "lambda_cors" {
  rest_api_id = aws_api_gateway_rest_api.ksi_api.id
  resource_id = aws_api_gateway_resource.proxy.id
  http_method = aws_api_gateway_method.proxy.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin" = true
  }
}

resource "aws_api_gateway_integration_response" "lambda_cors" {
  rest_api_id = aws_api_gateway_rest_api.ksi_api.id
  resource_id = aws_api_gateway_resource.proxy.id
  http_method = aws_api_gateway_method.proxy.http_method
  status_code = aws_api_gateway_method_response.lambda_cors.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin" = "'*'"
  }
depends_on = [aws_api_gateway_integration.lambda]
}

# ============================================================================
# S3 WEBSITE HOSTING (GOVCLOUD COMPATIBLE - NO CLOUDFRONT)
# ============================================================================

# S3 bucket (already imported)
resource "aws_s3_bucket" "frontend_bucket" {
  bucket = "${var.project_name}-frontend-${var.environment}"
}

# S3 bucket website configuration
resource "aws_s3_bucket_website_configuration" "frontend_website" {
  bucket = aws_s3_bucket.frontend_bucket.id

  index_document {
    suffix = "index.html"
  }

  error_document {
    key = "index.html"  # Important for SPA routing
  }
}

# Public access configuration for website
resource "aws_s3_bucket_public_access_block" "frontend_pab" {
  bucket = aws_s3_bucket.frontend_bucket.id

  block_public_acls       = true
  block_public_policy     = false  # Allow public policy for website
  ignore_public_acls      = true
  restrict_public_buckets = false  # Allow public bucket for website
}

# Public read policy for website
resource "aws_s3_bucket_policy" "frontend_policy" {
  bucket = aws_s3_bucket.frontend_bucket.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "PublicReadGetObject"
        Effect    = "Allow"
        Principal = "*"
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.frontend_bucket.arn}/*"
      }
    ]
  })

  depends_on = [aws_s3_bucket_public_access_block.frontend_pab]
}

# ============================================================================
# GOVCLOUD OUTPUTS (NO CLOUDFRONT)
# ============================================================================

output "frontend_url" {
  description = "Frontend S3 Website URL (HTTP)"
  value       = "http://${aws_s3_bucket_website_configuration.frontend_website.website_endpoint}"
}

output "frontend_bucket" {
  description = "Frontend S3 bucket name"
  value       = aws_s3_bucket.frontend_bucket.id
}


# ============================================================================
# INDIVIDUAL TENANT SCHEDULING WITH OFFSETS
# Replace the existing EventBridge section in your main.tf
# ============================================================================

# Define your tenants with their offset schedules
locals {
  # Configure your tenants here with staggered schedules
  tenant_schedules = {
    "tenant-0bf4618d" = {
      name = "Longevity Consulting"
      schedule = "cron(0 6 * * ? *)"   # 6:00 AM UTC
      offset_minutes = 0
    }
    # Add more tenants as needed:
    # "tenant-abc123" = {
    #   name = "Example Corp"
    #   schedule = "cron(15 6 * * ? *)"  # 6:15 AM UTC
    #   offset_minutes = 15
    # }
    # "tenant-def456" = {
    #   name = "Demo Company"  
    #   schedule = "cron(30 6 * * ? *)"  # 6:30 AM UTC
    #   offset_minutes = 30
    # }
  }
}

# Create individual EventBridge rule for each tenant
resource "aws_cloudwatch_event_rule" "tenant_ksi_validation" {
  for_each = local.tenant_schedules
  
  name                = "${var.project_name}-validation-${each.key}-${var.environment}"
  description         = "Daily KSI validation for ${each.value.name} (${each.key})"
  schedule_expression = each.value.schedule
  
  tags = {
    Name = "KSI Validation - ${each.value.name}"
    Purpose = "Automated daily KSI compliance validation"
    TenantId = each.key
    Environment = var.environment
  }
}

# Create individual EventBridge target for each tenant
resource "aws_cloudwatch_event_target" "tenant_ksi_validation_target" {
  for_each = local.tenant_schedules
  
  rule      = aws_cloudwatch_event_rule.tenant_ksi_validation[each.key].name
  target_id = "KSIValidationTarget-${each.key}"
  arn       = aws_lambda_function.ksi_validator.arn
  
  # Send tenant-specific validation request
  input = jsonencode({
    source = "eventbridge-scheduler"
    tenant_id = each.key
    tenant_name = each.value.name
    trigger_source = "scheduled_daily_individual"
    validate_all = true
    scheduled_run = true
    schedule_frequency = "daily"
    offset_minutes = each.value.offset_minutes
  })
}

# Create individual Lambda permission for each tenant EventBridge rule
resource "aws_lambda_permission" "allow_eventbridge_tenant_validation" {
  for_each = local.tenant_schedules
  
  statement_id  = "AllowExecutionFromEventBridge-${each.key}"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ksi_validator.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.tenant_ksi_validation[each.key].arn
}

# ============================================================================
# WEEKLY SCHEDULES (Optional - for less critical KSIs)
# ============================================================================

# Weekly validation for each tenant (staggered on different days)
resource "aws_cloudwatch_event_rule" "tenant_weekly_validation" {
  for_each = local.tenant_schedules
  
  name                = "${var.project_name}-weekly-${each.key}-${var.environment}"
  description         = "Weekly KSI validation for ${each.value.name}"
  # Stagger weekly runs across different days
  schedule_expression = "cron(0 2 ? * ${each.value.offset_minutes < 30 ? "SUN" : "MON"} *)"
  
  tags = {
    Name = "KSI Weekly Validation - ${each.value.name}"
    Purpose = "Automated weekly KSI validation for less critical categories"
    TenantId = each.key
    Environment = var.environment
  }
}

resource "aws_cloudwatch_event_target" "tenant_weekly_validation_target" {
  for_each = local.tenant_schedules
  
  rule      = aws_cloudwatch_event_rule.tenant_weekly_validation[each.key].name
  target_id = "KSIWeeklyValidationTarget-${each.key}"
  arn       = aws_lambda_function.ksi_validator.arn
  
  input = jsonencode({
    source = "eventbridge-scheduler"
    tenant_id = each.key
    tenant_name = each.value.name
    trigger_source = "scheduled_weekly_individual"
    validate_all = false
    scheduled_run = true
    schedule_frequency = "weekly"
    ksi_categories = ["PIY", "TPR", "RPL", "CED", "INR"]  # Less critical categories
  })
}

resource "aws_lambda_permission" "allow_eventbridge_weekly_tenant_validation" {
  for_each = local.tenant_schedules
  
  statement_id  = "AllowExecutionFromEventBridgeWeekly-${each.key}"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ksi_validator.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.tenant_weekly_validation[each.key].arn
}

# ============================================================================
# OUTPUTS FOR MONITORING
# ============================================================================

output "tenant_schedules" {
  description = "Individual tenant validation schedules"
  value = {
    for tenant_id, config in local.tenant_schedules : tenant_id => {
      name = config.name
      daily_schedule = config.schedule
      weekly_schedule = "cron(0 2 ? * ${config.offset_minutes < 30 ? "SUN" : "MON"} *)"
      eventbridge_rule_arn = aws_cloudwatch_event_rule.tenant_ksi_validation[tenant_id].arn
    }
  }
}

output "ksi_validation_schedule_summary" {
  description = "KSI validation schedule summary"
  value = {
    total_tenants = length(local.tenant_schedules)
    daily_rules_created = length(aws_cloudwatch_event_rule.tenant_ksi_validation)
    weekly_rules_created = length(aws_cloudwatch_event_rule.tenant_weekly_validation)
    lambda_function = aws_lambda_function.ksi_validator.function_name
  }
}
