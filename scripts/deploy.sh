#!/bin/bash
# Complete deployment script

set -e

echo "🚀 KSI MVP Complete Deployment"
echo "=============================="

# Step 1: Bootstrap
echo "Step 1: Bootstrap infrastructure..."
chmod +x scripts/bootstrap.sh
./scripts/bootstrap.sh

# Step 2: Deploy infrastructure
echo "Step 2: Deploy Terraform infrastructure..."
cd terraform
terraform plan -out=tfplan
terraform apply tfplan
cd ..

# Step 3: Populate validation rules
echo "Step 3: Populate validation rules..."
python3 scripts/populate_validation_rules.py

# Step 4: Test deployment
echo "Step 4: Testing deployment..."
python3 scripts/test_deployment.py

echo "🎉 Deployment completed successfully!"
