#!/bin/bash
set -e

echo "🔧 FIXING FIELD NAME MAPPING IN LAMBDA HANDLER"
echo "=============================================="

cd lambda/src

# Backup the current handler
cp handler.py handler.py.backup-$(date +%Y%m%d_%H%M%S)

# Apply the fix using Python to replace the exact section
python3 << 'PYTHON_FIX'
import re

# Read the current handler.py
with open('handler.py', 'r') as f:
    content = f.read()

new_step3_code = '''elif step_number == 3:
        # AWS Configuration - handle both camelCase (frontend) and snake_case (backend)
        if 'primaryAccountId' in step_payload:
            step_payload['primary_account_id'] = step_payload['primaryAccountId']
            logger.info(f"Mapped primaryAccountId to primary_account_id: {step_payload['primaryAccountId']}")
        
        if 'primaryRegion' in step_payload:
            step_payload['primary_region'] = step_payload['primaryRegion']
            logger.info(f"Mapped primaryRegion to primary_region: {step_payload['primaryRegion']}")
        
        # Handle other AWS fields that might need mapping
        if 'crossAccountRoleArn' in step_payload:
            step_payload['cross_account_role_arn'] = step_payload['crossAccountRoleArn']
            logger.info(f"Mapped crossAccountRoleArn to cross_account_role_arn")
        
        if 'externalId' in step_payload:
            step_payload['external_id'] = step_payload['externalId']
            logger.info(f"Mapped externalId to external_id")
        
        tenant['aws_accounts'].update(step_payload)
        
        # Auto-generate external ID for step 4
        if not tenant['aws_accounts'].get('external_id'):
            tenant['aws_accounts']['external_id'] = f"ksi-validation-{tenant_id}-{uuid.uuid4().hex[:8]}"
            logger.info(f"Generated external_id: {tenant['aws_accounts']['external_id']}")'''

# Find the step 3 section and replace it
step3_start = content.find('elif step_number == 3:')
if step3_start != -1:
    # Find the end of the step 3 section (next elif)
    remaining_content = content[step3_start:]
    next_elif = remaining_content.find('\n    elif step_number == 4:')
    
    if next_elif != -1:
        # Replace the step 3 section
        before_step3 = content[:step3_start]
        after_step3 = content[step3_start + next_elif:]
        
        new_content = before_step3 + new_step3_code + after_step3
        
        # Write the updated content
        with open('handler.py', 'w') as f:
            f.write(new_content)
        
        print("✅ Successfully updated Step 3 field mapping in handler.py")
    else:
        print("❌ Could not find the end of Step 3 section")
else:
    print("❌ Could not find Step 3 section in handler.py")

PYTHON_FIX

echo ""
echo "🚀 DEPLOYING UPDATED LAMBDA FUNCTION"
echo "===================================="

# Package the updated Lambda
zip -r ../../terraform/ksi_validator.zip .
cd ../../

# Deploy the fix
aws lambda update-function-code \
  --function-name ksi-mvp-validator-dev \
  --zip-file fileb://terraform/ksi_validator.zip

echo ""
echo "✅ FIELD MAPPING FIX DEPLOYED SUCCESSFULLY!"
echo "=========================================="
echo ""
echo "🎯 The Lambda now handles both field name formats:"
echo "   Frontend (camelCase): primaryAccountId → primary_account_id"
echo "   Frontend (camelCase): primaryRegion → primary_region"
echo "   Frontend (camelCase): crossAccountRoleArn → cross_account_role_arn"
echo ""
echo "📋 Next steps:"
echo "   1. Go back to Step 3 in your frontend"
echo "   2. Click 'Next' to re-save AWS configuration"
echo "   3. Try 'Generate IAM Role Instructions' in Step 4"
echo ""
echo "🎉 Your onboarding system should now work perfectly!"
