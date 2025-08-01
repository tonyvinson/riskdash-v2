import json
import boto3
import uuid
from datetime import datetime, timezone
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

def lambda_handler(event, context):
    """Main Lambda handler for KSI validation platform"""
    path = event.get('path', '')
    method = event.get('httpMethod', '')
    
    logger.info(f"Processing request: {method} {path}")
    
    try:
        # KSI validation routes
        if path.startswith('/api/ksi/'):
            return handle_ksi_validation_routes(event, context)
        
        # Admin routes
        elif path.startswith('/api/admin/'):
            return handle_admin_routes(event, context)
        
        # Tenant routes
        elif path.startswith('/api/tenants/'):
            return handle_tenant_routes(event, context)
        
        else:
            return cors_response(404, {'error': 'Route not found'})
            
    except Exception as e:
        logger.error(f"Error processing request: {str(e)}")
        return cors_response(500, {'error': str(e)})

def handle_ksi_validation_routes(event, context):
    """Handle KSI validation execution routes"""
    path = event.get('path', '')
    method = event.get('httpMethod', '')
    
    logger.info(f"KSI validation route: {method} {path}")
    
    if path == '/api/ksi/validate':
        if method == 'POST':
            return trigger_ksi_validation(json.loads(event['body']))
    
    elif path.startswith('/api/ksi/executions'):
        if method == 'GET':
            query_params = event.get('queryStringParameters') or {}
            tenant_id = query_params.get('tenant_id')
            limit = int(query_params.get('limit', 10))
            return get_execution_history(tenant_id, limit)
    
    elif path.startswith('/api/ksi/results/details'):
        if method == 'GET':
            query_params = event.get('queryStringParameters') or {}
            tenant_id = query_params.get('tenant_id')
            ksi_id = query_params.get('ksi_id')
            execution_id = query_params.get('execution_id')
            return get_ksi_detailed_results(tenant_id, ksi_id, execution_id)
    
    elif path.startswith('/api/ksi/results'):
        if method == 'GET':
            query_params = event.get('queryStringParameters') or {}
            tenant_id = query_params.get('tenant_id')
            execution_id = query_params.get('execution_id')
            return get_validation_results(tenant_id, execution_id)
    
    return cors_response(404, {'error': 'KSI validation route not found'})

def trigger_ksi_validation(validation_request):
    """Trigger KSI validation for a tenant"""
    logger.info(f"Triggering KSI validation: {validation_request}")
    
    tenant_id = validation_request.get('tenant_id')
    trigger_source = validation_request.get('trigger_source', 'api')
    ksi_filter = validation_request.get('ksi_filter', [])
    validate_all = validation_request.get('validate_all', False)
    
    if not tenant_id:
        return cors_response(400, {'error': 'tenant_id is required'})
    
    execution_id = f"exec-{int(datetime.now(timezone.utc).timestamp())}-{uuid.uuid4().hex[:8]}"
    
    try:
        # Get tenant information for AWS credentials
        tenant = get_tenant_info(tenant_id)
        if not tenant:
            return cors_response(404, {'error': f'Tenant {tenant_id} not found'})
        
        logger.info(f"Found tenant: {tenant.get('tenant_id')}")
        
        # Get KSI validation rules
        rules_table = dynamodb.Table(VALIDATION_RULES_TABLE)
        rules_response = rules_table.scan()
        available_ksis = rules_response.get('Items', [])
        
        logger.info(f"Found {len(available_ksis)} validation rules")
        
        # Filter KSIs if specified  
        if ksi_filter and not validate_all:
            available_ksis = [ksi for ksi in available_ksis if ksi.get('ksi_id') in ksi_filter or ksi.get('rule_id') in ksi_filter]
            logger.info(f"Filtered to {len(available_ksis)} rules for: {ksi_filter}")
        
        if not available_ksis:
            return cors_response(400, {'error': f'No validation rules found for KSIs: {ksi_filter}'})
        
        # Create execution record
        executions_table = dynamodb.Table(EXECUTIONS_TABLE)
        execution_record = {
            'execution_id': execution_id,
            'tenant_id': tenant_id,
            'trigger_source': trigger_source,
            'status': 'in_progress',
            'ksis_validated': len(available_ksis),
            'timestamp': datetime.now(timezone.utc).isoformat()
        }
        executions_table.put_item(Item=execution_record)
        
        # Execute validations for each KSI
        validation_results = []
        for ksi_rule in available_ksis:
            logger.info(f"Executing validation for {ksi_rule.get('ksi_id')}")
            
            try:
                result = execute_ksi_validation(ksi_rule, tenant, execution_id)
                validation_results.append(result)
                
                # Store result in DynamoDB
                executions_table.put_item(Item=result)
                
            except Exception as e:
                logger.error(f"Error validating {ksi_rule.get('ksi_id')}: {str(e)}")
                # Store error result
                error_result = {
                    'ksi_id': ksi_rule.get('ksi_id'),
                    'execution_id': execution_id,
                    'tenant_id': tenant_id,
                    'assertion': False,
                    'assertion_reason': f"❌ Validation failed: {str(e)}",
                    'timestamp': datetime.now(timezone.utc).isoformat(),
                    'commands_executed': 0,
                    'successful_commands': 0,
                    'failed_commands': 0,
                    'cli_command_details': [],
                    'category': ksi_rule.get('category', 'Unknown'),
                    'record_type': 'result'
                }
                executions_table.put_item(Item=error_result)
                validation_results.append(error_result)
        
        # Update execution record with completion status
        execution_record['status'] = 'completed'
        executions_table.put_item(Item=execution_record)
        
        logger.info(f"Completed validation execution {execution_id} with {len(validation_results)} results")
        
        return cors_response(200, {
            'status': 'success',
            'execution_id': execution_id,
            'ksis_validated': len(validation_results),
            'message': f'Validation completed for {len(validation_results)} KSIs'
        })
        
    except Exception as e:
        logger.error(f"Error in KSI validation: {str(e)}")
        return cors_response(500, {'error': str(e)})

def execute_ksi_validation(ksi_rule, tenant, execution_id):
    """Execute validation for a single KSI rule"""
    ksi_id = ksi_rule.get('ksi_id')
    validation_steps = ksi_rule.get('validation_steps', [])
    automation_type = ksi_rule.get('automation_type', 'manual')
    
    logger.info(f"Validating {ksi_id} ({automation_type}) with {len(validation_steps)} steps")
    
    if not tenant:
        raise Exception(f"Tenant information is required for validation")
    
    if not validation_steps:
        logger.warning(f"No validation steps found for {ksi_id}")
        return create_empty_validation_result(ksi_rule, tenant, execution_id)
    
    # Skip manual KSIs for now
    if automation_type == 'manual':
        logger.info(f"Skipping manual KSI: {ksi_id}")
        return create_manual_validation_result(ksi_rule, tenant, execution_id)
    
    # Initialize AWS session for tenant (with cross-account support)
    try:
        aws_session = get_aws_session_for_tenant(tenant)
    except Exception as e:
        logger.error(f"Failed to create AWS session: {str(e)}")
        raise Exception(f"AWS session creation failed: {str(e)}")
    
    # Execute validation steps
    cli_command_details = []
    successful_commands = 0
    failed_commands = 0
    step_results = []

    for step in validation_steps:
        step_id = step.get('step_id')
        service = step.get('service')
        action = step.get('action')
        parameters = step.get('parameters', {})
        required = step.get('required', True)
        description = step.get('description', '')
        cli_command = step.get('cli_command', '')
        
        logger.info(f"  Executing step {step_id}: {cli_command}")
        
        try:
            # Execute AWS API call using boto3
            result = execute_aws_service_call(aws_session, service, action, parameters)
            
            # Store the CLI command that was executed
            cli_command_details.append(cli_command)
            
            step_results.append({
                'step_id': step_id,
                'service': service,
                'action': action,
                'cli_command': cli_command,
                'success': True,
                'result_summary': summarize_aws_result(result),
                'description': description
            })
            
            successful_commands += 1
            logger.info(f"    ✅ SUCCESS: {cli_command}")
            
        except Exception as e:
            logger.warning(f"    ❌ FAILED: {cli_command} - {str(e)}")
            
            # Still store the command that was attempted
            cli_command_details.append(cli_command)
            
            step_results.append({
                'step_id': step_id,
                'service': service,
                'action': action,
                'cli_command': cli_command,
                'success': False,
                'error': str(e),
                'description': description
            })
            
            failed_commands += 1
            
            # Check if this is a required step that should fail the KSI
            if required and step.get('failure_action') == 'fail_ksi':
                logger.warning(f"Required step failed, failing KSI {ksi_id}")
                break
    
    # Analyze results based on scoring rules
    assertion = analyze_validation_results(ksi_rule, step_results)
    assertion_reason = generate_assertion_reason(ksi_rule, step_results, assertion)
    
    # Build result record with actual CLI commands
    result = {
        'ksi_id': ksi_id,
        'execution_id': execution_id,
        'tenant_id': tenant.get('tenant_id'),
        'assertion': assertion,
        'assertion_reason': assertion_reason,
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'commands_executed': len(validation_steps),
        'successful_commands': successful_commands,
        'failed_commands': failed_commands,
        'cli_command_details': cli_command_details,  # REAL CLI COMMANDS!
        'category': ksi_rule.get('category', 'Unknown'),
        'record_type': 'result'
    }
    
    logger.info(f"Completed {ksi_id}: {assertion} with {len(cli_command_details)} CLI commands stored")
    return result

def execute_aws_service_call(aws_session, service, action, parameters):
    """Execute AWS service call using boto3"""
    client = aws_session.client(service)
    
    # Map action names to boto3 method calls
    method = getattr(client, action)
    
    # Execute the API call
    return method(**parameters)

def summarize_aws_result(result):
    """Create a summary of AWS API result for storage"""
    if isinstance(result, dict):
        # For most AWS responses, show key metrics
        summary = {}
        
        # Common patterns in AWS responses
        if 'Items' in result:
            summary['item_count'] = len(result['Items'])
        if 'Trails' in result:
            summary['trail_count'] = len(result['Trails'])
        if 'LogGroups' in result:
            summary['log_group_count'] = len(result['LogGroups'])
        if 'Keys' in result:
            summary['key_count'] = len(result['Keys'])
        if 'Users' in result:
            summary['user_count'] = len(result['Users'])
        if 'Roles' in result:
            summary['role_count'] = len(result['Roles'])
        if 'Vpcs' in result:
            summary['vpc_count'] = len(result['Vpcs'])
        if 'SecurityGroups' in result:
            summary['security_group_count'] = len(result['SecurityGroups'])
        if 'Subnets' in result:
            summary['subnet_count'] = len(result['Subnets'])
        if 'LoadBalancers' in result:
            summary['load_balancer_count'] = len(result['LoadBalancers'])
        if 'Volumes' in result:
            summary['volume_count'] = len(result['Volumes'])
        if 'DBInstances' in result:
            summary['db_instance_count'] = len(result['DBInstances'])
        if 'Buckets' in result:
            summary['bucket_count'] = len(result['Buckets'])
        
        return summary
    
    return str(result)[:200]  # Truncate long responses

def analyze_validation_results(ksi_rule, step_results):
    """Analyze step results to determine KSI pass/fail"""
    scoring_rules = ksi_rule.get('scoring_rules', {})
    pass_criteria = scoring_rules.get('pass_criteria', [])
    
    # If no specific scoring rules, use simple success rate
    if not pass_criteria:
        successful_steps = [r for r in step_results if r.get('success')]
        required_steps = [s for s in ksi_rule.get('validation_steps', []) if s.get('required', True)]
        
        # All required steps must pass
        for step in required_steps:
            step_result = next((r for r in step_results if r.get('step_id') == step.get('step_id')), None)
            if not step_result or not step_result.get('success'):
                return False
        
        # If we made it here, all required steps passed
        return True
    
    # Apply specific scoring rules (future enhancement)
    for criteria in pass_criteria:
        condition = criteria.get('condition')
        if not evaluate_condition(condition, step_results):
            return False
    
    return True

def evaluate_condition(condition, step_results):
    """Evaluate a scoring condition against step results"""
    # Simple condition evaluation - can be enhanced
    if not condition:
        return True
        
    if condition.get('type') == 'all_required_pass':
        return all(r.get('success') for r in step_results if r.get('required', True))
    elif condition.get('type') == 'minimum_success_count':
        success_count = len([r for r in step_results if r.get('success')])
        return success_count >= condition.get('value', 1)
    
    return True

def generate_assertion_reason(ksi_rule, step_results, assertion):
    """Generate detailed assertion reason"""
    ksi_id = ksi_rule.get('ksi_id')
    title = ksi_rule.get('title', 'KSI')
    
    if assertion:
        successful_count = len([r for r in step_results if r.get('success')])
        total_count = len(step_results)
        return f"✅ {title} validation passed ({successful_count}/{total_count} checks successful)"
    else:
        failed_steps = [r for r in step_results if not r.get('success')]
        return f"❌ {title} validation failed ({len(failed_steps)} critical checks failed)"

def create_empty_validation_result(ksi_rule, tenant, execution_id):
    """Create a validation result for KSIs with no validation steps"""
    return {
        'ksi_id': ksi_rule.get('ksi_id'),
        'execution_id': execution_id,
        'tenant_id': tenant.get('tenant_id'),
        'assertion': True,
        'assertion_reason': f"✅ {ksi_rule.get('title', 'KSI')} validation passed (policy-based)",
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'commands_executed': 0,
        'successful_commands': 0,
        'failed_commands': 0,
        'cli_command_details': [],
        'category': ksi_rule.get('category', 'Unknown'),
        'record_type': 'result'
    }

def create_manual_validation_result(ksi_rule, tenant, execution_id):
    """Create a validation result for manual KSIs"""
    return {
        'ksi_id': ksi_rule.get('ksi_id'),
        'execution_id': execution_id,
        'tenant_id': tenant.get('tenant_id'),
        'assertion': True,
        'assertion_reason': f"📋 {ksi_rule.get('title', 'KSI')} requires manual evidence review",
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'commands_executed': 0,
        'successful_commands': 0,
        'failed_commands': 0,
        'cli_command_details': [],
        'category': ksi_rule.get('category', 'Unknown'),
        'record_type': 'result'
    }

def get_tenant_info(tenant_id):
    """Get tenant information from DynamoDB"""
    try:
        table = dynamodb.Table(TENANTS_TABLE)
        response = table.get_item(Key={'tenant_id': tenant_id})
        return response.get('Item')
    except Exception as e:
        logger.error(f"Error getting tenant {tenant_id}: {str(e)}")
        return None

def get_aws_session_for_tenant(tenant):
    """Get AWS session for tenant (same account or cross-account)"""
    # Check if cross-account role is configured
    cross_account_role = tenant.get('cross_account_role_arn')
    
    if cross_account_role:
        logger.info(f"Using cross-account role: {cross_account_role}")
        try:
            sts = boto3.client('sts')
            assumed_role = sts.assume_role(
                RoleArn=cross_account_role,
                RoleSessionName=f"ksi-validation-{tenant.get('tenant_id')}"
            )
            
            credentials = assumed_role['Credentials']
            return boto3.Session(
                aws_access_key_id=credentials['AccessKeyId'],
                aws_secret_access_key=credentials['SecretAccessKey'],
                aws_session_token=credentials['SessionToken']
            )
        except Exception as e:
            logger.error(f"Failed to assume cross-account role: {str(e)}")
            raise Exception(f"Cross-account role assumption failed: {str(e)}")
    else:
        # Use current session (same account)
        logger.info(f"Using same-account session for tenant {tenant.get('tenant_id')}")
        return boto3.Session()

def get_execution_history(tenant_id, limit):
    """Get execution history for a tenant"""
    if not tenant_id:
        return cors_response(400, {'error': 'tenant_id is required'})
    
    try:
        executions_table = dynamodb.Table(EXECUTIONS_TABLE)
        
        # Scan for execution records
        response = executions_table.scan(
            FilterExpression=Attr('tenant_id').eq(tenant_id),
            Limit=limit
        )
        
        executions = response.get('Items', [])
        # Sort by timestamp descending
        executions.sort(key=lambda x: x.get('timestamp', ''), reverse=True)
        
        # Clean DynamoDB items
        clean_executions = [clean_dynamodb_item(item) for item in executions]
        
        return cors_response(200, {'executions': clean_executions})
        
    except Exception as e:
        logger.error(f"Error getting execution history: {str(e)}")
        return cors_response(500, {'error': str(e)})

def get_validation_results(tenant_id, execution_id=None):
    """Get validation results"""
    if not tenant_id:
        return cors_response(400, {'error': 'tenant_id is required'})
    
    try:
        executions_table = dynamodb.Table(EXECUTIONS_TABLE)
        
        filter_expr = Attr('tenant_id').eq(tenant_id) & Attr('record_type').eq('result')
        
        if execution_id:
            filter_expr = filter_expr & Attr('execution_id').eq(execution_id)
        
        response = executions_table.scan(FilterExpression=filter_expr)
        results = response.get('Items', [])
        
        # Sort by KSI ID
        results.sort(key=lambda x: x.get('ksi_id', ''))
        
        # Clean DynamoDB items
        clean_results = [clean_dynamodb_item(item) for item in results]
        
        return cors_response(200, {'results': clean_results})
        
    except Exception as e:
        logger.error(f"Error getting validation results: {str(e)}")
        return cors_response(500, {'error': str(e)})

def get_ksi_detailed_results(tenant_id, ksi_id=None, execution_id=None):
    """Get detailed KSI results with CLI command details"""
    if not tenant_id:
        return cors_response(400, {'error': 'tenant_id is required'})
    
    try:
        executions_table = dynamodb.Table(EXECUTIONS_TABLE)
        
        filter_expr = Attr('tenant_id').eq(tenant_id) & Attr('record_type').eq('result')
        
        if execution_id:
            filter_expr = filter_expr & Attr('execution_id').eq(execution_id)
        if ksi_id:
            filter_expr = filter_expr & Attr('ksi_id').eq(ksi_id)
        
        response = executions_table.scan(FilterExpression=filter_expr)
        results = response.get('Items', [])
        
        # Sort by KSI ID
        results.sort(key=lambda x: x.get('ksi_id', ''))
        
        # Clean DynamoDB items
        clean_results = [clean_dynamodb_item(item) for item in results]
        
        return cors_response(200, {'results': clean_results})
        
    except Exception as e:
        logger.error(f"Error getting detailed KSI results: {str(e)}")
        return cors_response(500, {'error': str(e)})

def handle_admin_routes(event, context):
    """Handle admin routes"""
    path = event.get('path', '')
    method = event.get('httpMethod', '')
    
    if path == '/api/admin/tenants':
        if method == 'GET':
            return get_all_tenants()
    
    return cors_response(404, {'error': 'Admin route not found'})

def handle_tenant_routes(event, context):
    """Handle tenant routes"""
    path = event.get('path', '')
    method = event.get('httpMethod', '')
    
    # Extract tenant_id from path
    path_parts = path.split('/')
    if len(path_parts) >= 4 and path_parts[2] == 'tenants':
        tenant_id = path_parts[3]
        
        if method == 'GET':
            return get_tenant(tenant_id)
        elif method == 'PUT':
            return update_tenant(tenant_id, json.loads(event['body']))
    
    return cors_response(404, {'error': 'Tenant route not found'})

def get_all_tenants():
    """Get all tenants"""
    try:
        table = dynamodb.Table(TENANTS_TABLE)
        response = table.scan()
        tenants = response.get('Items', [])
        
        # Clean DynamoDB items
        clean_tenants = [clean_dynamodb_item(item) for item in tenants]
        
        return cors_response(200, {'tenants': clean_tenants})
        
    except Exception as e:
        logger.error(f"Error getting tenants: {str(e)}")
        return cors_response(500, {'error': str(e)})

def get_tenant(tenant_id):
    """Get single tenant"""
    try:
        table = dynamodb.Table(TENANTS_TABLE)
        response = table.get_item(Key={'tenant_id': tenant_id})
        
        if 'Item' in response:
            clean_tenant = clean_dynamodb_item(response['Item'])
            return cors_response(200, {'tenant': clean_tenant})
        else:
            return cors_response(404, {'error': 'Tenant not found'})
            
    except Exception as e:
        logger.error(f"Error getting tenant: {str(e)}")
        return cors_response(500, {'error': str(e)})

def update_tenant(tenant_id, tenant_data):
    """Update tenant"""
    try:
        table = dynamodb.Table(TENANTS_TABLE)
        
        # Add metadata
        tenant_data['tenant_id'] = tenant_id
        tenant_data['last_updated'] = datetime.now(timezone.utc).isoformat()
        
        table.put_item(Item=tenant_data)
        
        clean_tenant = clean_dynamodb_item(tenant_data)
        return cors_response(200, {'status': 'success', 'tenant': clean_tenant})
        
    except Exception as e:
        logger.error(f"Error updating tenant: {str(e)}")
        return cors_response(500, {'error': str(e)})

def clean_dynamodb_item(item):
    """Convert DynamoDB item to clean Python dict"""
    if isinstance(item, dict):
        return {k: clean_dynamodb_item(v) for k, v in item.items()}
    elif isinstance(item, list):
        return [clean_dynamodb_item(i) for i in item]
    elif isinstance(item, Decimal):
        return int(item) if item % 1 == 0 else float(item)
    else:
        return item

def cors_response(status_code, body):
    """Create CORS-enabled response"""
    return {
        'statusCode': status_code,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'
        },
        'body': json.dumps(body, default=decimal_default)
    }

def decimal_default(obj):
    """JSON serializer for DynamoDB Decimal objects"""
    if isinstance(obj, Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")
