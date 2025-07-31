#!/usr/bin/env python3
import re

# Read the current handler.py
with open('handler.py', 'r') as f:
    content = f.read()

# Fix Step 5 field mapping
step5_fix = '''elif step_number == 5:
        # Compliance Profile - handle both camelCase (frontend) and snake_case (backend)
        if 'fedrampLevel' in step_payload:
            step_payload['fedramp_level'] = step_payload['fedrampLevel']
            logger.info(f"Mapped fedrampLevel to fedramp_level: {step_payload['fedrampLevel']}")
        
        if 'currentStatus' in step_payload:
            step_payload['current_status'] = step_payload['currentStatus']
            logger.info(f"Mapped currentStatus to current_status")
        
        if 'targetAuthorizationDate' in step_payload:
            step_payload['target_authorization_date'] = step_payload['targetAuthorizationDate']
            logger.info(f"Mapped targetAuthorizationDate to target_authorization_date")
        
        if 'authorizationBoundary' in step_payload:
            step_payload['authorization_boundary'] = step_payload['authorizationBoundary']
            logger.info(f"Mapped authorizationBoundary to authorization_boundary")
        
        tenant['compliance'].update(step_payload)
        logger.info(f"Step 5 compliance data saved: {tenant['compliance']}")'''

# Fix Step 6 field mapping
step6_fix = '''elif step_number == 6:
        # Preferences - handle both camelCase (frontend) and snake_case (backend)
        if 'validationFrequency' in step_payload:
            step_payload['validation_frequency'] = step_payload['validationFrequency']
            logger.info(f"Mapped validationFrequency to validation_frequency: {step_payload['validationFrequency']}")
        
        if 'notificationEmail' in step_payload:
            step_payload['notification_email'] = step_payload['notificationEmail']
            logger.info(f"Mapped notificationEmail to notification_email: {step_payload['notificationEmail']}")
        
        if 'additionalEmails' in step_payload:
            step_payload['additional_emails'] = step_payload['additionalEmails']
            logger.info(f"Mapped additionalEmails to additional_emails")
        
        if 'reportFormat' in step_payload:
            step_payload['report_format'] = step_payload['reportFormat']
            logger.info(f"Mapped reportFormat to report_format")
        
        if 'slackWebhook' in step_payload:
            step_payload['slack_webhook'] = step_payload['slackWebhook']
            logger.info(f"Mapped slackWebhook to slack_webhook")
        
        tenant['preferences'].update(step_payload)
        logger.info(f"Step 6 preferences data saved: {tenant['preferences']}")'''

# Replace Step 5
step5_start = content.find('elif step_number == 5:')
if step5_start != -1:
    remaining_content = content[step5_start:]
    next_section = remaining_content.find('\n    elif step_number == 6:')
    
    if next_section != -1:
        before_step5 = content[:step5_start]
        after_step5 = content[step5_start + next_section:]
        content = before_step5 + step5_fix + after_step5
        print("✅ Updated Step 5 field mapping")

# Replace Step 6
step6_start = content.find('elif step_number == 6:')
if step6_start != -1:
    remaining_content = content[step6_start:]
    next_section = remaining_content.find('\n    elif step_number == 7:')
    
    if next_section != -1:
        before_step6 = content[:step6_start]
        after_step6 = content[step6_start + next_section:]
        content = before_step6 + step6_fix + after_step6
        print("✅ Updated Step 6 field mapping")

# Write the updated content
with open('handler.py', 'w') as f:
    f.write(content)

print("✅ Successfully updated all field mappings!")
