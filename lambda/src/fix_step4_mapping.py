#!/usr/bin/env python3
import re

# Read the current handler.py
with open('handler.py', 'r') as f:
    content = f.read()

# New Step 4 code with proper field mapping
new_step4_code = '''elif step_number == 4:
        # IAM Role Configuration - handle both camelCase (frontend) and snake_case (backend)
        tenant['iam_role_config'].update(step_payload)
        
        # Handle field mapping for frontend camelCase to backend snake_case
        if 'crossAccountRoleArn' in step_payload:
            tenant['aws_accounts']['cross_account_role_arn'] = step_payload['crossAccountRoleArn']
            logger.info(f"Mapped crossAccountRoleArn to cross_account_role_arn: {step_payload['crossAccountRoleArn']}")
        
        # Also handle the old field name for backward compatibility
        if 'role_arn' in step_payload:
            tenant['aws_accounts']['cross_account_role_arn'] = step_payload['role_arn']
            logger.info(f"Mapped role_arn to cross_account_role_arn: {step_payload['role_arn']}")
        
        if 'externalId' in step_payload:
            tenant['aws_accounts']['external_id'] = step_payload['externalId']
            logger.info(f"Mapped externalId to external_id")
        
        # Log the final aws_accounts state for debugging
        logger.info(f"Step 4 aws_accounts after update: {tenant['aws_accounts']}")'''

# Find and replace Step 4 section
step4_start = content.find('elif step_number == 4:')
if step4_start != -1:
    # Find the end of the step 4 section (next elif)
    remaining_content = content[step4_start:]
    next_section = remaining_content.find('\n    elif step_number == 5:')
    
    if next_section != -1:
        # Replace the step 4 section
        before_step4 = content[:step4_start]
        after_step4 = content[step4_start + next_section:]
        
        new_content = before_step4 + new_step4_code + after_step4
        
        # Write the updated content
        with open('handler.py', 'w') as f:
            f.write(new_content)
        
        print("✅ Successfully updated Step 4 field mapping in handler.py")
    else:
        print("❌ Could not find the end of Step 4 section")
else:
    print("❌ Could not find Step 4 section in handler.py")
