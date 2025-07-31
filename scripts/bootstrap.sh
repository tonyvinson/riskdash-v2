#!/bin/bash
# Bootstrap script for KSI MVP deployment

set -e

PROJECT_NAME="ksi-mvp"
ENVIRONMENT="dev"
AWS_REGION="us-gov-west-1"
TERRAFORM_BUCKET="${PROJECT_NAME}-tfstate-${ENVIRONMENT}"

echo "🚀 KSI MVP Bootstrap Starting..."
echo "Project: $PROJECT_NAME"
echo "Environment: $ENVIRONMENT" 
echo "Region: $AWS_REGION"

# Create S3 bucket for Terraform state
echo "📦 Creating Terraform state bucket..."
if ! aws s3 ls "s3://$TERRAFORM_BUCKET" 2>/dev/null; then
    aws s3 mb "s3://$TERRAFORM_BUCKET" --region "$AWS_REGION"
    
    # Enable versioning
    aws s3api put-bucket-versioning \
        --bucket "$TERRAFORM_BUCKET" \
        --versioning-configuration Status=Enabled
    
    # Enable encryption
    aws s3api put-bucket-encryption \
        --bucket "$TERRAFORM_BUCKET" \
        --server-side-encryption-configuration '{
            "Rules": [
                {
                    "ApplyServerSideEncryptionByDefault": {
                        "SSEAlgorithm": "AES256"
                    }
                }
            ]
        }'
    
    echo "✅ Created and configured $TERRAFORM_BUCKET"
else
    echo "✅ S3 bucket $TERRAFORM_BUCKET already exists"
fi

# Package Lambda function
echo "📦 Packaging Lambda function..."
cd lambda/src
zip -r ../../terraform/ksi_validator.zip .
cd ../../

echo "✅ Lambda function packaged"

# Initialize Terraform
echo "🏗️ Initializing Terraform..."
cd terraform
terraform init
terraform validate
cd ..

echo "🎉 Bootstrap completed successfully!"
echo ""
echo "Next steps:"
echo "1. cd terraform"
echo "2. terraform plan"
echo "3. terraform apply"
