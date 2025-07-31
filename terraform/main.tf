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
