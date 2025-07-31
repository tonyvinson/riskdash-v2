variable "project_name" {
  description = "Project name for resource naming"
  type        = string
  default     = "ksi-mvp"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "dev"
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-gov-west-1"
}
