import json
import boto3
import uuid
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Any, Optional
import os
import logging
from boto3.dynamodb.conditions import Key, Attr
from decimal import Decimal

# Setup logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Environment variables
TENANTS_TABLE = os.environ.get('TENANTS_TABLE', 'ksi-mvp-tenants-dev')
EXECUTIONS_TABLE = os.environ.get('EXECUTIONS_TABLE', 'ksi-mvp-executions-dev')
VALIDATION_RULES_TABLE = os.environ.get('VALIDATION_RULES_TABLE', 'ksi-mvp-validation-rules-dev')
TENANT_OVERRIDES_TABLE = os.environ.get('TENANT_OVERRIDES_TABLE', 'ksi-mvp-tenant-rule-overrides-dev')

dynamodb = boto3.resource('dynamodb')

def clean_dynamodb_item(item):
    """Convert DynamoDB item to JSON serializable format"""
    if isinstance(item, list):
        return [clean_dynamodb_item(i) for i in item]
    elif isinstance(item, dict):
        return {k: clean_dynamodb_item(v) for k, v in item.items()}
    elif isinstance(item, Decimal):
        return int(item) if item % 1 == 0 else float(item)
    return item

def cors_response(status_code: int, body: dict):
    """Return CORS-enabled response"""
    return {
        'statusCode': status_code,
        'headers': {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
            'Content-Type': 'application/json'
        },
        'body': json.dumps(clean_dynamodb_item(body), default=str)
    }

def lambda_handler(event, context):
    """Main Lambda handler - supports individual tenant EventBridge scheduling"""
    
    logger.info(f"Received event: {json.dumps(event)}")
    
    # 🕐 Handle EventBridge scheduled events (individual tenant)
    if event.get('source') == 'eventbridge-scheduler':
        logger.info("🕐 Processing scheduled EventBridge validation for individual tenant")
        return handle_individual_tenant_scheduled_event(event, context)
    
    # 🕐 Handle direct EventBridge rules
    if event.get('source') == 'aws.events':
        logger.info("🕐 Processing AWS EventBridge rule for individual tenant")
        return handle_individual_tenant_scheduled_event(event, context)
    
    # Handle CORS preflight requests
    if event.get('httpMethod') == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
                'Access-Control-Max-Age': '86400'
            },
            'body': json.dumps({'message': 'CORS preflight successful'})
        }
    
    # Handle API Gateway requests (existing functionality)
    if 'httpMethod' in event:
        return handle_api_gateway_request(event, context)
    
    # Unknown event type
    logger.warning("Unknown event type received")
    return {'statusCode': 400, 'body': json.dumps({'error': 'Unknown event type'})}

def handle_individual_tenant_scheduled_event(event, context):
    """🕐 Handle scheduled validation for individual tenant (no ALL_TENANTS)"""
    try:
        # Extract tenant info directly from EventBridge event
        tenant_id = event.get('tenant_id')
        tenant_name = event.get('tenant_name', 'Unknown Tenant')
        trigger_source = event.get('trigger_source', 'scheduled_daily_individual')
        offset_minutes = event.get('offset_minutes', 0)
        
        logger.info(f"🕐 Starting scheduled validation for individual tenant: {tenant_id} ({tenant_name})")
        logger.info(f"🕐 Trigger source: {trigger_source}, Offset: {offset_minutes} minutes")
        
        if not tenant_id:
            raise ValueError("tenant_id is required for individual tenant scheduling")
        
        # Prepare validation request for this specific tenant
        validation_request = {
            'tenant_id': tenant_id,
            'trigger_source': trigger_source,
            'validate_all': event.get('validate_all', True),
            'scheduled_run': True,
            'ksi_categories': event.get('ksi_categories', []),  # For weekly runs
            'schedule_frequency': event.get('schedule_frequency', 'daily')
        }
        
        logger.info(f"🕐 Validation request: {validation_request}")
        
        # Execute validation using existing trigger_ksi_validation function
        result = trigger_ksi_validation(validation_request)
        result_data = json.loads(result['body'])
        
        if result['statusCode'] == 200:
            logger.info(f"✅ Scheduled validation completed successfully for {tenant_id}")
            logger.info(f"📊 Results: {result_data.get('ksis_validated', 0)} KSIs validated")
            
            # Return success response for EventBridge
            return {
                'statusCode': 200,
                'body': json.dumps({
                    'status': 'success',
                    'tenant_id': tenant_id,
                    'tenant_name': tenant_name,
                    'trigger_source': trigger_source,
                    'ksis_validated': result_data.get('ksis_validated', 0),
                    'execution_id': result_data.get('execution_id'),
                    'timestamp': datetime.now(timezone.utc).isoformat(),
                    'message': f'Scheduled validation completed for {tenant_name}'
                })
            }
        else:
            logger.error(f"❌ Scheduled validation failed for {tenant_id}: {result_data.get('error')}")
            raise Exception(f"Validation failed: {result_data.get('error')}")
            
    except Exception as e:
        logger.error(f"❌ Error in scheduled validation: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'status': 'error',
                'tenant_id': event.get('tenant_id', 'unknown'),
                'error': str(e),
                'timestamp': datetime.now(timezone.utc).isoformat()
            })
        }

def handle_api_gateway_request(event, context):
    """Handle API Gateway requests (existing functionality)"""
    path = event.get('path', '')
    method = event.get('httpMethod', '')
    
    logger.info(f"Processing API request: {method} {path}")
    
    try:
        # Health check
        if path == '/api/health':
            return cors_response(200, {
                'status': 'healthy', 
                'timestamp': datetime.now(timezone.utc).isoformat(),
                'version': '2.0',
                'features': ['api_gateway', 'individual_tenant_scheduling', 'ksi_validation', 'onboarding']
            })
        
        # KSI validation routes
        elif path.startswith('/api/ksi/'):
            return handle_ksi_validation_routes(event, context)
        
        # Admin routes
        elif path.startswith('/api/admin/'):
            return handle_admin_routes(event, context)
        
        # Tenant routes  
        elif path.startswith('/api/tenant/'):
            return handle_tenant_routes(event, context)
        
        else:
            return cors_response(404, {'error': f'Route not found: {path}'})
            
    except Exception as e:
        logger.error(f"Error processing API request: {str(e)}")
        return cors_response(500, {'error': str(e)})

def handle_admin_routes(event, context):
    """Handle admin API requests with ALL onboarding endpoints"""
    path = event.get('path', '')
    method = event.get('httpMethod', '')
    
    logger.info(f"Admin route: {method} {path}")
    
    # 🚀 ONBOARDING WORKFLOW ENDPOINTS
    if path == '/api/admin/onboarding/start':
        if method == 'POST':
            return start_tenant_onboarding(json.loads(event['body']))
    
    elif '/api/admin/onboarding/' in path:
        # Extract tenant_id from path like /api/admin/onboarding/{tenant-id}/step
        path_parts = path.split('/')
        if len(path_parts) >= 5:
            tenant_id = path_parts[4]
            endpoint = path_parts[5] if len(path_parts) > 5 else ''
            
            if endpoint == 'step':
                if method == 'PUT':
                    return update_onboarding_step(tenant_id, json.loads(event['body']))
                elif method == 'GET':
                    return get_onboarding_status(tenant_id)
            
            elif endpoint == 'iam-instructions':
                if method == 'GET':
                    return generate_iam_role_instructions(tenant_id)
            
            elif endpoint == 'test-connection':
                if method == 'POST':
                    return test_cross_account_connection(tenant_id)
            
            elif endpoint == 'complete':
                if method == 'POST':
                    return complete_tenant_onboarding(tenant_id)
    
    # KSI Defaults endpoint
    elif path == '/api/admin/ksi-defaults':
        if method == 'GET':
            return get_ksi_defaults()
    
    # Tenants management
    elif path == '/api/admin/tenants':
        if method == 'GET':
            return get_all_tenants()
        elif method == 'POST':
            return create_tenant(json.loads(event['body']))
    
    # Individual tenant routes
    elif '/api/admin/tenants/' in path:
        path_parts = path.split('/')
        if len(path_parts) >= 5:
            tenant_id = path_parts[4]
            
            # Individual tenant KSI config update - THE MISSING ROUTE
            if path.endswith('/ksi-config') and method == 'PUT':
                body_data = json.loads(event['body'])
                return update_tenant_ksi_config(tenant_id, body_data)
            
            # Other tenant routes
            elif method == 'PUT':
                return update_tenant(tenant_id, json.loads(event['body']))
            elif method == 'GET':
                return get_tenant_details(tenant_id)
            elif method == 'DELETE':
                return delete_tenant(tenant_id)
    
    # System status
    elif path == '/api/admin/system/status':
        if method == 'GET':
            return get_system_status()
    
    return cors_response(404, {'error': f'Admin route not found: {path}'})

# ============================================================================
# 7-STEP ONBOARDING IMPLEMENTATION - RESTORED!
# ============================================================================

def start_tenant_onboarding(onboarding_data):
    """Start the 7-step onboarding process"""
    logger.info(f"Starting onboarding: {onboarding_data}")
    
    tenant_id = f"tenant-{str(uuid.uuid4())[:8]}"
    
    tenant = {
        'tenant_id': tenant_id,
        'status': 'onboarding',
        'onboarding_step': 1,
        'created_date': datetime.now(timezone.utc).isoformat(),
        
        # Initialize all sections
        'organization': onboarding_data.get('organization', {}),
        'contacts': {
            'primary': {},
            'technical': {},
            'billing': {}
        },
        'aws_accounts': {
            'primary_account_id': '',
            'primary_region': 'us-gov-west-1',
            'additional_accounts': [],
            'additional_regions': [],
            'cross_account_role_arn': '',
            'external_id': '',
            'role_status': 'pending'
        },
        'iam_role_config': {
            'role_name': 'KSIValidationRole',
            'policy_version': 'v1.0',
            'permissions_verified': False
        },
        'compliance': {
            'fedramp_level': '',
            'current_status': '',
            'target_authorization_date': '',
            'additional_frameworks': []
        },
        'preferences': {
            'validation_frequency': 'daily',
            'notification_email': '',
            'additional_emails': [],
            'report_format': 'json',
            'timezone': 'America/New_York'
        },
        
        # KSI configuration (will be set in step 7)
        'enabled_ksis': [],
        'ksi_schedule': 'daily',
        
        # System fields
        'onboarded_by': onboarding_data.get('created_by', 'system'),
        'last_updated': datetime.now(timezone.utc).isoformat()
    }
    
    table = dynamodb.Table(TENANTS_TABLE)
    table.put_item(Item=tenant)
    
    logger.info(f"Created tenant {tenant_id} for onboarding")
    
    return cors_response(201, {
        'tenant_id': tenant_id,
        'message': 'Onboarding started successfully',
        'current_step': 1,
        'next_step_requirements': get_next_step_requirements(tenant, 1),
        'tenant': tenant
    })

def update_onboarding_step(tenant_id, step_data):
    """Update a specific onboarding step"""
    logger.info(f"Updating onboarding step for {tenant_id}: {step_data}")
    
    table = dynamodb.Table(TENANTS_TABLE)
    response = table.get_item(Key={'tenant_id': tenant_id})
    tenant = response.get('Item', {})
    
    if not tenant:
        return cors_response(404, {'error': 'Tenant not found'})
    
    step = step_data.get('step')
    data = step_data.get('data', {})
    
    # Update the appropriate section based on step
    if step == 1:  # Organization
        tenant['organization'].update(data)
    elif step == 2:  # Contacts
        tenant['contacts'].update(data)
    elif step == 3:  # AWS Accounts
        tenant['aws_accounts'].update(data)
    elif step == 4:  # IAM Role
        tenant['iam_role_config'].update(data)
    elif step == 5:  # Compliance
        tenant['compliance'].update(data)
    elif step == 6:  # Preferences
        tenant['preferences'].update(data)
    elif step == 7:  # KSI Selection
        tenant['enabled_ksis'] = data.get('enabled_ksis', [])
        tenant['ksi_schedule'] = data.get('ksi_schedule', 'daily')
    
    # Update step progress
    tenant['onboarding_step'] = max(tenant.get('onboarding_step', 1), step)
    tenant['last_updated'] = datetime.now(timezone.utc).isoformat()
    
    table.put_item(Item=tenant)
    
    return cors_response(200, {
        'message': f'Step {step} updated successfully',
        'current_step': tenant['onboarding_step'],
        'next_step_requirements': get_next_step_requirements(tenant, step),
        'tenant': tenant
    })

def get_onboarding_status(tenant_id):
    """Get current onboarding status"""
    table = dynamodb.Table(TENANTS_TABLE)
    response = table.get_item(Key={'tenant_id': tenant_id})
    tenant = response.get('Item', {})
    
    if not tenant:
        return cors_response(404, {'error': 'Tenant not found'})
    
    return cors_response(200, {
        'tenant_id': tenant_id,
        'status': tenant.get('status', 'unknown'),
        'current_step': tenant.get('onboarding_step', 1),
        'next_step_requirements': get_next_step_requirements(tenant, tenant.get('onboarding_step', 1)),
        'tenant': tenant
    })

def generate_iam_role_instructions(tenant_id):
    """Generate IAM role setup instructions"""
    table = dynamodb.Table(TENANTS_TABLE)
    response = table.get_item(Key={'tenant_id': tenant_id})
    tenant = response.get('Item', {})
    
    if not tenant:
        return cors_response(404, {'error': 'Tenant not found'})
    
    # Generate external ID if not exists
    if not tenant.get('aws_accounts', {}).get('external_id'):
        external_id = f"ksi-{uuid.uuid4().hex[:16]}"
        tenant['aws_accounts'] = tenant.get('aws_accounts', {})
        tenant['aws_accounts']['external_id'] = external_id
        table.put_item(Item=tenant)
    else:
        external_id = tenant['aws_accounts']['external_id']
    
    instructions = {
        'role_name': 'KSIValidationRole',
        'external_id': external_id,
        'trust_policy': {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Effect": "Allow",
                    "Principal": {
                        "AWS": "arn:aws-us-gov:iam::736539455039:root"
                    },
                    "Action": "sts:AssumeRole",
                    "Condition": {
                        "StringEquals": {
                            "sts:ExternalId": external_id
                        }
                    }
                }
            ]
        },
        'permissions_policy': {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Effect": "Allow",
                    "Action": [
                        "ec2:Describe*",
                        "iam:List*",
                        "iam:Get*",
                        "logs:Describe*",
                        "cloudwatch:List*",
                        "cloudwatch:Get*",
                        "cloudtrail:Describe*",
                        "config:Describe*",
                        "sns:List*",
                        "s3:List*",
                        "s3:GetBucketLocation",
                        "s3:GetBucketPolicy",
                        "s3:GetBucketAcl"
                    ],
                    "Resource": "*"
                }
            ]
        },
        'cli_commands': [
            f"aws iam create-role --role-name KSIValidationRole --assume-role-policy-document file://trust-policy.json",
            f"aws iam put-role-policy --role-name KSIValidationRole --policy-name KSIValidationPolicy --policy-document file://permissions-policy.json"
        ]
    }
    
    return cors_response(200, {
        'instructions': instructions,
        'external_id': external_id,
        'tenant_id': tenant_id
    })

def test_cross_account_connection(tenant_id):
    """Test cross-account IAM role connection"""
    table = dynamodb.Table(TENANTS_TABLE)
    response = table.get_item(Key={'tenant_id': tenant_id})
    tenant = response.get('Item', {})
    
    if not tenant:
        return cors_response(404, {'error': 'Tenant not found'})
    
    role_arn = tenant.get('aws_accounts', {}).get('cross_account_role_arn')
    external_id = tenant.get('aws_accounts', {}).get('external_id')
    
    if not role_arn:
        return cors_response(400, {'error': 'Cross-account role ARN not provided'})
    
    test_results = []
    
    try:
        # Test STS assume role
        sts_client = boto3.client('sts')
        
        assume_role_params = {
            'RoleArn': role_arn,
            'RoleSessionName': f'KSIValidationTest-{int(datetime.now().timestamp())}'
        }
        
        if external_id:
            assume_role_params['ExternalId'] = external_id
        
        response = sts_client.assume_role(**assume_role_params)
        
        test_results.append({
            'test': 'assume_role',
            'status': 'success',
            'message': 'Successfully assumed cross-account role'
        })
        
        # Test basic permissions
        temp_credentials = response['Credentials']
        temp_session = boto3.Session(
            aws_access_key_id=temp_credentials['AccessKeyId'],
            aws_secret_access_key=temp_credentials['SecretAccessKey'],
            aws_session_token=temp_credentials['SessionToken']
        )
        
        # Test EC2 permissions
        ec2_client = temp_session.client('ec2', region_name='us-gov-west-1')
        ec2_client.describe_regions()
        
        test_results.append({
            'test': 'ec2_permissions',
            'status': 'success',
            'message': 'EC2 describe permissions verified'
        })
        
        # Update tenant with successful connection
        tenant['aws_accounts']['role_status'] = 'verified'
        tenant['aws_accounts']['last_connection_test'] = datetime.now(timezone.utc).isoformat()
        table.put_item(Item=tenant)
        
        return cors_response(200, {
            'status': 'success',
            'message': 'Cross-account connection test passed',
            'test_results': test_results,
            'role_status': 'verified'
        })
        
    except Exception as e:
        error_message = str(e)
        error_advice = "Please check that the IAM role exists, has the correct trust policy, and includes the required permissions."
        
        test_results.append({
            'test': 'assume_role',
            'status': 'failed',
            'message': error_message
        })
        
        if 'AccessDenied' in error_message:
            error_advice = "Access denied. Check the trust policy and ensure the external ID matches."
        elif 'does not exist' in error_message:
            error_advice = "The IAM role does not exist. Please create it using the provided instructions."
        
        # Update tenant with failed connection
        tenant['aws_accounts']['role_status'] = 'failed'
        tenant['aws_accounts']['last_connection_test'] = datetime.now(timezone.utc).isoformat()
        table.put_item(Item=tenant)
        
        return cors_response(400, {
            'status': 'failed',
            'error': error_message,
            'error_advice': error_advice,
            'test_results': test_results
        })

def complete_tenant_onboarding(tenant_id):
    """Complete the onboarding process and activate tenant"""
    logger.info(f"Completing onboarding for tenant {tenant_id}")
    
    table = dynamodb.Table(TENANTS_TABLE)
    response = table.get_item(Key={'tenant_id': tenant_id})
    tenant = response.get('Item', {})
    
    if not tenant:
        return cors_response(404, {'error': 'Tenant not found'})
    
    if tenant.get('status') != 'onboarding':
        return cors_response(400, {'error': 'Tenant is not in onboarding status'})
    
    # Validate all required steps are complete
    validation_errors = []
    
    # Step 1: Organization
    if not tenant.get('organization', {}).get('name'):
        validation_errors.append('Organization name is required (Step 1)')
    
    # Step 2: Contacts
    if not tenant.get('contacts', {}).get('primary', {}).get('email'):
        validation_errors.append('Primary contact email is required (Step 2)')
    
    # Step 3: AWS Accounts
    if not tenant.get('aws_accounts', {}).get('primary_account_id'):
        validation_errors.append('Primary AWS account ID is required (Step 3)')
    
    # Step 4: IAM Role
    if not tenant.get('aws_accounts', {}).get('cross_account_role_arn'):
        validation_errors.append('Cross-account role ARN is required (Step 4)')
    
    if tenant.get('aws_accounts', {}).get('role_status') != 'verified':
        validation_errors.append('Cross-account role must be verified (Step 4)')
    
    # Step 5: Compliance
    if not tenant.get('compliance', {}).get('fedramp_level'):
        validation_errors.append('FedRAMP level is required (Step 5)')
    
    # Step 6: Preferences
    if not tenant.get('preferences', {}).get('notification_email'):
        validation_errors.append('Notification email is required (Step 6)')
    
    if validation_errors:
        return cors_response(400, {
            'error': 'Onboarding validation failed',
            'validation_errors': validation_errors,
            'current_step': tenant.get('onboarding_step', 1)
        })
    
    # All validations passed - activate tenant
    tenant['status'] = 'active'
    tenant['onboarding_step'] = 7
    tenant['last_updated'] = datetime.now(timezone.utc).isoformat()
    tenant['activated_date'] = datetime.now(timezone.utc).isoformat()
    
    # Ensure KSIs are selected
    if not tenant.get('enabled_ksis'):
        # Default to all available KSIs if none selected
        available_ksis_response = get_ksi_defaults()
        available_ksis_data = json.loads(available_ksis_response['body'])
        tenant['enabled_ksis'] = [ksi['ksi_id'] for ksi in available_ksis_data['available_ksis']]
    
    table.put_item(Item=tenant)
    
    logger.info(f"Tenant {tenant_id} onboarding completed successfully")
    
    return cors_response(200, {
        'status': 'success',
        'message': 'Tenant onboarding completed successfully',
        'tenant_id': tenant_id,
        'enabled_ksis': tenant['enabled_ksis'],
        'tenant': tenant
    })

def get_next_step_requirements(tenant, current_step):
    """Get requirements for the next onboarding step"""
    if current_step >= 7:
        return "Onboarding complete"
    
    requirements = {
        1: "Organization name and type are required",
        2: "Primary contact information is required", 
        3: "AWS account ID and primary region are required",
        4: "Cross-account IAM role must be created and verified",
        5: "FedRAMP compliance level and status are required",
        6: "Notification preferences must be configured",
        7: "Review all information and select KSIs to enable"
    }
    
    return requirements.get(current_step + 1, "Unknown step")

# ============================================================================
# EXISTING FUNCTIONS - KSI DEFAULTS, TENANTS, ETC.
# ============================================================================

def get_ksi_defaults():
    """Get all available KSI definitions"""
    try:
        rules_table = dynamodb.Table(VALIDATION_RULES_TABLE)
        response = rules_table.scan()
        
        available_ksis = []
        for item in response.get('Items', []):
            # Determine automation type
            validation_steps = item.get('validation_steps', [])
            automation_type = item.get('automation_type', 'manual')
            
            if validation_steps and not automation_type:
                has_cli = any('service' in step and 'action' in step for step in validation_steps)
                automation_type = 'fully_automated' if has_cli else 'manual'
            
            ksi_info = {
                'ksi_id': item.get('ksi_id') or item.get('rule_id'),
                'title': item.get('title', 'Unknown KSI'),
                'category': item.get('category', 'Unknown'),
                'automation_type': automation_type,
                'validation_steps': len(validation_steps),
                'description': item.get('description', ''),
                'compliance_framework': item.get('compliance_framework', 'FedRAMP-20x')
            }
            available_ksis.append(ksi_info)
        
        available_ksis.sort(key=lambda x: x['ksi_id'])
        
        return cors_response(200, {
            'available_ksis': available_ksis,
            'total_count': len(available_ksis),
            'automation_summary': {
                'fully_automated': len([k for k in available_ksis if k['automation_type'] == 'fully_automated']),
                'partially_automated': len([k for k in available_ksis if k['automation_type'] == 'partially_automated']),
                'manual': len([k for k in available_ksis if k['automation_type'] == 'manual'])
            }
        })
        
    except Exception as e:
        logger.error(f"Error getting KSI defaults: {str(e)}")
        return cors_response(500, {'error': str(e)})

def get_all_tenants():
    """Get all tenants"""
    try:
        tenants_table = dynamodb.Table(TENANTS_TABLE)
        response = tenants_table.scan()
        
        tenants = []
        for item in response.get('Items', []):
            tenant_info = {
                'tenant_id': item.get('tenant_id'),
                'tenant_name': item.get('organization', {}).get('name', 'Unknown'),
                'status': item.get('status', 'active'),
                'onboarding_step': item.get('onboarding_step', 0),
                'enabled_ksis_count': len(item.get('enabled_ksis', [])),
                'created_date': item.get('created_date')
            }
            tenants.append(tenant_info)
        
        return cors_response(200, {'tenants': tenants})
        
    except Exception as e:
        logger.error(f"Error getting tenants: {str(e)}")
        return cors_response(500, {'error': str(e)})

def create_tenant(tenant_data):
    """Create a new tenant (basic method)"""
    try:
        tenant_id = f"tenant-{uuid.uuid4().hex[:8]}"
        
        tenant_record = {
            'tenant_id': tenant_id,
            'organization': {'name': tenant_data.get('tenant_name', 'New Tenant')},
            'status': 'active',
            'enabled_ksis': [],
            'created_date': datetime.now(timezone.utc).isoformat()
        }
        
        tenants_table = dynamodb.Table(TENANTS_TABLE)
        tenants_table.put_item(Item=tenant_record)
        
        return cors_response(201, {
            'message': 'Tenant created successfully',
            'tenant_id': tenant_id
        })
        
    except Exception as e:
        logger.error(f"Error creating tenant: {str(e)}")
        return cors_response(500, {'error': str(e)})

def get_tenant_details(tenant_id):
    """Get tenant details"""
    try:
        tenants_table = dynamodb.Table(TENANTS_TABLE)
        response = tenants_table.get_item(Key={'tenant_id': tenant_id})
        
        if 'Item' in response:
            return cors_response(200, {'tenant': response['Item']})
        else:
            return cors_response(404, {'error': 'Tenant not found'})
            
    except Exception as e:
        logger.error(f"Error getting tenant details: {str(e)}")
        return cors_response(500, {'error': str(e)})

def update_tenant(tenant_id, tenant_data):
    """Update tenant"""
    try:
        tenants_table = dynamodb.Table(TENANTS_TABLE)
        
        # Get current tenant
        response = tenants_table.get_item(Key={'tenant_id': tenant_id})
        tenant = response.get('Item', {})
        
        if not tenant:
            return cors_response(404, {'error': 'Tenant not found'})
        
        # Update fields
        for key, value in tenant_data.items():
            if key != 'tenant_id':  # Don't update the key
                tenant[key] = value
        
        tenant['last_updated'] = datetime.now(timezone.utc).isoformat()
        tenants_table.put_item(Item=tenant)
        
        return cors_response(200, {'message': 'Tenant updated successfully', 'tenant': tenant})
        
    except Exception as e:
        logger.error(f"Error updating tenant: {str(e)}")
        return cors_response(500, {'error': str(e)})

def delete_tenant(tenant_id):
    """Delete tenant"""
    try:
        tenants_table = dynamodb.Table(TENANTS_TABLE)
        tenants_table.delete_item(Key={'tenant_id': tenant_id})
        
        return cors_response(200, {'message': 'Tenant deleted successfully'})
        
    except Exception as e:
        logger.error(f"Error deleting tenant: {str(e)}")
        return cors_response(500, {'error': str(e)})

def get_system_status():
    """Get system status"""
    try:
        return cors_response(200, {
            'status': 'healthy',
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'version': '2.0',
            'scheduling': 'individual_tenant',
            'features': ['onboarding', 'ksi_validation', 'scheduling']
        })
    except Exception as e:
        return cors_response(500, {'error': str(e)})

def update_tenant_ksi_config(tenant_id, config_data):
    """Update tenant KSI configuration - THE MISSING FUNCTION"""
    try:
        logger.info(f"Updating KSI config for tenant: {tenant_id}")
        logger.info(f"Config data: {config_data}")
        
        tenants_table = dynamodb.Table(TENANTS_TABLE)
        
        tenants_table.update_item(
            Key={'tenant_id': tenant_id},
            UpdateExpression='SET enabled_ksis = :ksis, last_updated = :updated',
            ExpressionAttributeValues={
                ':ksis': config_data.get('enabled_ksis', []),
                ':updated': datetime.now(timezone.utc).isoformat()
            }
        )
        
        logger.info(f"Successfully updated KSI config for {tenant_id}")
        
        return cors_response(200, {
            'message': 'KSI configuration updated successfully',
            'tenant_id': tenant_id,
            'enabled_ksis': config_data.get('enabled_ksis', [])
        })
        
    except Exception as e:
        logger.error(f"Error updating tenant KSI config: {str(e)}")
        return cors_response(500, {'error': str(e)})

# ============================================================================
# KSI VALIDATION ROUTES
# ============================================================================

def handle_ksi_validation_routes(event, context):
    """Handle KSI validation execution routes"""
    path = event.get('path', '')
    method = event.get('httpMethod', '')
    
    if path == '/api/ksi/validate':
        if method == 'POST':
            return trigger_ksi_validation(json.loads(event['body']))
    
    elif path.startswith('/api/ksi/results'):
        if method == 'GET':
            query_params = event.get('queryStringParameters') or {}
            tenant_id = query_params.get('tenant_id')
            return get_validation_results(tenant_id)
    
    elif path.startswith('/api/ksi/executions'):
        if method == 'GET':
            query_params = event.get('queryStringParameters') or {}
            tenant_id = query_params.get('tenant_id')
            return get_execution_history(tenant_id)
    
    return cors_response(404, {'error': 'KSI validation route not found'})

def trigger_ksi_validation(validation_request):
    """Execute KSI validation for a single tenant"""
    logger.info(f"Triggering KSI validation: {validation_request}")
    
    try:
        tenant_id = validation_request.get('tenant_id')
        trigger_source = validation_request.get('trigger_source', 'frontend')
        ksi_filter = validation_request.get('ksi_filter', [])
        validate_all = validation_request.get('validate_all', False)
        ksi_categories = validation_request.get('ksi_categories', [])
        
        if not tenant_id:
            return cors_response(400, {'error': 'tenant_id is required'})
        
        execution_id = f"exec-{int(datetime.now(timezone.utc).timestamp())}-{uuid.uuid4().hex[:8]}"
        logger.info(f"Starting validation execution: {execution_id} for tenant: {tenant_id}")
        
        # Get KSI validation rules from database
        rules_table = dynamodb.Table(VALIDATION_RULES_TABLE)
        response = rules_table.scan()
        available_ksis = response.get('Items', [])
        
        logger.info(f"Found {len(available_ksis)} KSI rules in database")
        
        # Filter KSIs if specified
        if ksi_filter and not validate_all:
            available_ksis = [ksi for ksi in available_ksis if ksi.get('ksi_id') in ksi_filter or ksi.get('rule_id') in ksi_filter]
            logger.info(f"Filtered to {len(available_ksis)} KSIs by ID: {ksi_filter}")
        
        # Filter by categories for weekly runs
        if ksi_categories:
            available_ksis = [ksi for ksi in available_ksis if ksi.get('category') in ksi_categories]
            logger.info(f"Filtered to {len(available_ksis)} KSIs by categories: {ksi_categories}")
        
        if not available_ksis:
            return cors_response(400, {'error': 'No KSI rules found to validate'})
        
        # Create execution summary record
        executions_table = dynamodb.Table(EXECUTIONS_TABLE)
        execution_record = {
            'execution_id': execution_id,
            'tenant_id': tenant_id,
            'trigger_source': trigger_source,
            'status': 'completed',
            'ksis_validated': len(available_ksis),
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'record_type': 'execution_summary'
        }
        executions_table.put_item(Item=execution_record)
        logger.info(f"Created execution summary record")
        
        # Execute validation for each KSI and store results
        validation_results = []
        for ksi_rule in available_ksis:
            ksi_id = ksi_rule.get('ksi_id') or ksi_rule.get('rule_id')
            
            # For MVP, simulate validation with mix of pass/fail
            # In production, this would execute real AWS CLI commands
            import random
            assertion = random.choice([True, True, True, False])  # 75% pass rate
            
            result = {
                'ksi_id': ksi_id,
                'execution_id': execution_id,
                'tenant_id': tenant_id,
                'assertion': assertion,
                'assertion_reason': f"✅ {ksi_rule.get('title', ksi_id)} validation passed" if assertion else f"❌ {ksi_rule.get('title', ksi_id)} validation failed",
                'timestamp': datetime.now(timezone.utc).isoformat(),
                'commands_executed': len(ksi_rule.get('validation_steps', [])),
                'successful_commands': len(ksi_rule.get('validation_steps', [])) if assertion else 0,
                'failed_commands': 0 if assertion else len(ksi_rule.get('validation_steps', [])),
                'category': ksi_rule.get('category', 'Unknown'),
                'record_type': 'result'
            }
            
            # Store result in DynamoDB
            executions_table.put_item(Item=result)
            validation_results.append(result)
            
            logger.info(f"Stored validation result for {ksi_id}: {'PASS' if assertion else 'FAIL'}")
        
        logger.info(f"Completed validation execution {execution_id} with {len(validation_results)} results")
        
        return cors_response(200, {
            'status': 'success',
            'execution_id': execution_id,
            'tenant_id': tenant_id,
            'ksis_validated': len(validation_results),
            'validation_results': validation_results,
            'message': f'Validation completed successfully for {len(validation_results)} KSIs'
        })
        
    except Exception as e:
        logger.error(f"Error in KSI validation: {str(e)}")
        return cors_response(500, {'error': f'Validation failed: {str(e)}'})

def get_validation_results(tenant_id):
    """Get validation results for tenant"""
    try:
        executions_table = dynamodb.Table(EXECUTIONS_TABLE)
        
        if tenant_id:
            response = executions_table.scan(
                FilterExpression=Attr('tenant_id').eq(tenant_id) & Attr('record_type').eq('result')
            )
        else:
            response = executions_table.scan(
                FilterExpression=Attr('record_type').eq('result')
            )
        
        results = response.get('Items', [])
        results.sort(key=lambda x: x.get('timestamp', ''), reverse=True)
        
        return cors_response(200, {'results': results})
        
    except Exception as e:
        logger.error(f"Error getting validation results: {str(e)}")
        return cors_response(500, {'error': str(e)})

def get_execution_history(tenant_id):
    """Get execution history"""
    try:
        executions_table = dynamodb.Table(EXECUTIONS_TABLE)
        
        if tenant_id:
            response = executions_table.scan(
                FilterExpression=Attr('tenant_id').eq(tenant_id)
            )
        else:
            response = executions_table.scan()
        
        executions = []
        for item in response.get('Items', []):
            if not item.get('record_type') or item.get('record_type') == 'execution_summary':
                executions.append({
                    'execution_id': item.get('execution_id'),
                    'tenant_id': item.get('tenant_id'),
                    'timestamp': item.get('timestamp'),
                    'ksis_validated': item.get('ksis_validated', 0),
                    'status': item.get('status', 'completed'),
                    'trigger_source': item.get('trigger_source', 'unknown')
                })
        
        executions.sort(key=lambda x: x.get('timestamp', ''), reverse=True)
        
        return cors_response(200, {'executions': executions[:10]})
        
    except Exception as e:
        logger.error(f"Error getting execution history: {str(e)}")
        return cors_response(500, {'error': str(e)})

def handle_tenant_routes(event, context):
    """Handle tenant routes"""
    return cors_response(200, {'message': 'Tenant routes working'})
