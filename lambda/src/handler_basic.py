import json
import boto3
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Any, Optional
import os
import logging

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
    """Main Lambda handler with role-based routing and dynamic validation"""
    
    logger.info(f"Received event: {json.dumps(event)}")
    
    path = event.get('path', '')
    method = event.get('httpMethod', '')
    
    try:
        if path.startswith('/api/admin'):
            return handle_admin_request(event, context)
        elif path.startswith('/api/tenant'):
            return handle_tenant_request(event, context)
        else:
            return cors_response(404, {'error': 'Route not found'})
    except Exception as e:
        logger.error(f"Handler error: {str(e)}")
        return cors_response(500, {'error': str(e)})

def cors_response(status_code: int, body: dict):
    """Return CORS-enabled response"""
    return {
        'statusCode': status_code,
        'headers': {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Content-Type': 'application/json'
        },
        'body': json.dumps(body, default=str)
    }

# ============================================================================
# ADMIN API HANDLERS
# ============================================================================

def handle_admin_request(event, context):
    """Handle admin API requests"""
    path = event['path']
    method = event['httpMethod']
    
    if path == '/api/admin/tenants':
        if method == 'GET':
            return list_all_tenants()
        elif method == 'POST':
            return create_tenant(json.loads(event['body']))
    
    elif '/api/admin/tenants/' in path:
        tenant_id = path.split('/')[-1]
        if method == 'PUT':
            return update_tenant(tenant_id, json.loads(event['body']))
        elif method == 'GET':
            return get_tenant_details(tenant_id)
    
    elif path == '/api/admin/ksi-defaults':
        return get_available_ksis()
    
    return cors_response(404, {'error': 'Admin route not found'})

def list_all_tenants():
    """List all tenants for admin"""
    table = dynamodb.Table(TENANTS_TABLE)
    response = table.scan()
    return cors_response(200, {'tenants': response.get('Items', [])})

def create_tenant(tenant_data):
    """Create new tenant"""
    tenant_id = f"tenant-{str(uuid.uuid4())[:8]}"
    table = dynamodb.Table(TENANTS_TABLE)
    
    tenant = {
        'tenant_id': tenant_id,
        'account_id': tenant_data['account_id'],
        'tenant_name': tenant_data['tenant_name'],
        'contact_email': tenant_data['contact_email'],
        'cross_account_role_arn': tenant_data.get('cross_account_role_arn', ''),
        'status': 'active' if tenant_data.get('cross_account_role_arn') else 'pending',
        'onboarded_date': datetime.now(timezone.utc).isoformat(),
        'enabled_ksis': [],
        'ksi_schedule': 'daily'
    }
    
    table.put_item(Item=tenant)
    return cors_response(201, {'tenant_id': tenant_id, 'tenant': tenant})

def get_tenant_details(tenant_id):
    """Get tenant details"""
    table = dynamodb.Table(TENANTS_TABLE)
    try:
        response = table.get_item(Key={'tenant_id': tenant_id})
        if 'Item' in response:
            return cors_response(200, response['Item'])
        else:
            return cors_response(404, {'error': 'Tenant not found'})
    except Exception as e:
        return cors_response(500, {'error': str(e)})

def update_tenant(tenant_id, tenant_data):
    """Update tenant"""
    table = dynamodb.Table(TENANTS_TABLE)
    try:
        # Build update expression dynamically
        update_expr = "SET "
        expr_attr_values = {}
        
        for key, value in tenant_data.items():
            if key != 'tenant_id':  # Don't update the key
                update_expr += f"{key} = :{key}, "
                expr_attr_values[f":{key}"] = value
        
        update_expr = update_expr.rstrip(', ')
        
        table.update_item(
            Key={'tenant_id': tenant_id},
            UpdateExpression=update_expr,
            ExpressionAttributeValues=expr_attr_values
        )
        
        return cors_response(200, {'message': 'Tenant updated successfully'})
    except Exception as e:
        return cors_response(500, {'error': str(e)})

# ============================================================================
# TENANT API HANDLERS
# ============================================================================

def handle_tenant_request(event, context):
    """Handle tenant API requests"""
    path = event['path']
    method = event['httpMethod']
    
    # Extract tenant_id from path
    path_parts = path.split('/')
    if len(path_parts) < 4:
        return cors_response(400, {'error': 'Invalid tenant path'})
    
    tenant_id = path_parts[3]
    
    # Validate tenant exists
    if not tenant_exists(tenant_id):
        return cors_response(404, {'error': 'Tenant not found'})
    
    if path.endswith('/dashboard'):
        return get_tenant_dashboard(tenant_id)
    elif path.endswith('/ksi-config'):
        if method == 'GET':
            return get_tenant_ksi_config(tenant_id)
        elif method == 'PUT':
            return update_tenant_ksi_config(tenant_id, json.loads(event['body']))
    elif path.endswith('/validate'):
        if method == 'POST':
            return trigger_tenant_validation(tenant_id)
    
    return cors_response(404, {'error': 'Tenant route not found'})

def get_tenant_dashboard(tenant_id):
    """Get tenant dashboard data"""
    executions_table = dynamodb.Table(EXECUTIONS_TABLE)
    try:
        response = executions_table.query(
            IndexName='tenant-timestamp-index',
            KeyConditionExpression='tenant_id = :tid',
            ExpressionAttributeValues={':tid': tenant_id},
            ScanIndexForward=False,
            Limit=20
        )
        
        return cors_response(200, {
            'tenant_id': tenant_id,
            'recent_executions': response.get('Items', [])
        })
    except Exception as e:
        return cors_response(500, {'error': str(e)})

def get_tenant_ksi_config(tenant_id):
    """Get tenant KSI configuration"""
    tenants_table = dynamodb.Table(TENANTS_TABLE)
    try:
        response = tenants_table.get_item(Key={'tenant_id': tenant_id})
        tenant = response['Item']
        
        # Get available KSIs
        ksi_response = get_available_ksis()
        available_ksis = json.loads(ksi_response['body'])['available_ksis']
        
        return cors_response(200, {
            'enabled_ksis': tenant.get('enabled_ksis', []),
            'available_ksis': available_ksis,
            'schedule': tenant.get('ksi_schedule', 'daily')
        })
    except Exception as e:
        return cors_response(500, {'error': str(e)})

def update_tenant_ksi_config(tenant_id, config_data):
    """Update tenant KSI configuration"""
    tenants_table = dynamodb.Table(TENANTS_TABLE)
    try:
        tenants_table.update_item(
            Key={'tenant_id': tenant_id},
            UpdateExpression='SET enabled_ksis = :ksis, ksi_schedule = :schedule',
            ExpressionAttributeValues={
                ':ksis': config_data['enabled_ksis'],
                ':schedule': config_data.get('schedule', 'daily')
            }
        )
        
        return cors_response(200, {'message': 'KSI configuration updated'})
    except Exception as e:
        return cors_response(500, {'error': str(e)})

def trigger_tenant_validation(tenant_id):
    """Trigger validation for tenant using dynamic rules"""
    tenants_table = dynamodb.Table(TENANTS_TABLE)
    try:
        response = tenants_table.get_item(Key={'tenant_id': tenant_id})
        tenant = response['Item']
        
        if not tenant.get('enabled_ksis'):
            return cors_response(400, {'error': 'No KSIs enabled for this tenant'})
        
        execution_id = str(uuid.uuid4())
        timestamp = datetime.now(timezone.utc).isoformat()
        
        # Execute validations for enabled KSIs using dynamic engine
        results = []
        for ksi_id in tenant['enabled_ksis']:
            try:
                logger.info(f"Starting validation for {ksi_id}")
                result = execute_ksi_validation(ksi_id, tenant)
                results.append(result)
                
                # Save execution record
                save_execution_record(execution_id, tenant_id, ksi_id, result, timestamp)
                
            except Exception as e:
                logger.error(f"Validation failed for {ksi_id}: {str(e)}")
                error_result = {
                    'ksi_id': ksi_id,
                    'status': 'ERROR',
                    'error': str(e)
                }
                results.append(error_result)
                save_execution_record(execution_id, tenant_id, ksi_id, error_result, timestamp)
        
        return cors_response(202, {
            'execution_id': execution_id,
            'results': results,
            'message': f'Validated {len(results)} KSIs using dynamic rules'
        })
    except Exception as e:
        return cors_response(500, {'error': str(e)})

def get_available_ksis():
    """Get available KSIs from validation rules table"""
    table = dynamodb.Table(VALIDATION_RULES_TABLE)
    
    try:
        # Get all active rules
        response = table.query(
            IndexName='status-index',
            KeyConditionExpression='#status = :status',
            ExpressionAttributeNames={'#status': 'status'},
            ExpressionAttributeValues={':status': 'active'}
        )
        
        ksis = []
        for rule in response.get('Items', []):
            ksis.append({
                'ksi_id': rule['ksi_id'],
                'title': rule['title'],
                'category': rule['category'],
                'description': rule['description'],
                'version': rule['version'],
                'command_count': len(rule.get('validation_steps', []))
            })
        
        return cors_response(200, {'available_ksis': ksis})
        
    except Exception as e:
        logger.error(f"Error getting available KSIs: {str(e)}")
        return cors_response(500, {'error': str(e)})

# ============================================================================
# DYNAMIC VALIDATION ENGINE
# ============================================================================

def execute_ksi_validation(ksi_id: str, tenant: dict) -> dict:
    """Execute KSI validation using dynamic rules from DynamoDB"""
    
    logger.info(f"Executing validation for KSI {ksi_id}, tenant {tenant['tenant_id']}")
    
    try:
        # 1. Get active validation rule
        rule = get_active_rule(ksi_id)
        if not rule:
            raise Exception(f"No active validation rule found for {ksi_id}")
        
        # 2. Get tenant-specific overrides
        tenant_overrides = get_tenant_rule_overrides(tenant['tenant_id'], rule['rule_id'])
        
        # 3. Merge parameters (tenant overrides win)
        parameters = merge_parameters(
            rule.get('configurable_parameters', {}),
            tenant_overrides.get('custom_parameters', {})
        )
        
        # 4. Get AWS session for tenant account
        session = assume_role_for_tenant(tenant)
        
        # 5. Execute validation steps dynamically
        step_results = {}
        
        for step in rule['validation_steps']:
            try:
                logger.info(f"Executing step {step['step_id']}: {step['service']}.{step['action']}")
                result = execute_validation_step(step, session, parameters)
                step_results[f"step_{step['step_id']}"] = result
                
            except Exception as e:
                logger.error(f"Step {step['step_id']} failed: {str(e)}")
                
                if step['failure_action'] == 'fail_ksi':
                    return {
                        'ksi_id': ksi_id,
                        'status': 'FAIL',
                        'error': f"Critical step {step['step_id']} failed: {str(e)}",
                        'rule_version': rule['version'],
                        'step_results': step_results
                    }
                elif step['failure_action'] == 'warn':
                    step_results[f"step_{step['step_id']}_error"] = str(e)
        
        # 6. Apply scoring rules dynamically
        score_result = calculate_ksi_score(step_results, rule['scoring_rules'], parameters)
        
        # 7. Return comprehensive result
        return {
            'ksi_id': ksi_id,
            'status': score_result['status'],
            'score': score_result['score'],
            'findings': score_result['findings'],
            'scores': score_result['scores'],
            'step_results': step_results,
            'rule_version': rule['version'],
            'parameters_used': parameters
        }
        
    except Exception as e:
        logger.error(f"KSI validation error for {ksi_id}: {str(e)}")
        return {
            'ksi_id': ksi_id,
            'status': 'ERROR',
            'error': str(e),
            'rule_version': 'unknown'
        }

def get_active_rule(ksi_id: str) -> Optional[dict]:
    """Get the active validation rule for a KSI"""
    
    table = dynamodb.Table(VALIDATION_RULES_TABLE)
    
    try:
        # Query for all versions of this KSI
        response = table.query(
            IndexName='ksi-version-index',
            KeyConditionExpression='ksi_id = :ksi_id',
            FilterExpression='#status = :status',
            ExpressionAttributeNames={'#status': 'status'},
            ExpressionAttributeValues={
                ':ksi_id': ksi_id,
                ':status': 'active'
            }
        )
        
        rules = response.get('Items', [])
        if not rules:
            return None
        
        # Sort by version and get the latest
        rules.sort(key=lambda x: x['version'], reverse=True)
        return rules[0]
        
    except Exception as e:
        logger.error(f"Error getting rule for {ksi_id}: {str(e)}")
        return None

def get_tenant_rule_overrides(tenant_id: str, rule_id: str) -> dict:
    """Get tenant-specific rule parameter overrides"""
    
    table = dynamodb.Table(TENANT_OVERRIDES_TABLE)
    
    try:
        response = table.get_item(
            Key={
                'tenant_id': tenant_id,
                'rule_id': rule_id
            }
        )
        return response.get('Item', {})
        
    except Exception as e:
        logger.error(f"Error getting tenant overrides: {str(e)}")
        return {}

def merge_parameters(default_params: dict, tenant_overrides: dict) -> dict:
    """Merge default parameters with tenant-specific overrides"""
    
    merged = {}
    
    # Start with defaults
    for param_name, param_config in default_params.items():
        merged[param_name] = param_config.get('default')
    
    # Apply tenant overrides
    for param_name, override_value in tenant_overrides.items():
        if param_name in default_params:
            merged[param_name] = override_value
    
    return merged

def execute_validation_step(step: dict, session: boto3.Session, parameters: dict) -> dict:
    """Execute a single validation step dynamically"""
    
    service_name = step['service']
    action_name = step['action']
    step_params = step.get('parameters', {})
    
    # Handle special parameters
    if 'auto_detect_first_trail' in step_params.get('Name', ''):
        # Get first trail name dynamically
        cloudtrail = session.client('cloudtrail')
        trails = cloudtrail.describe_trails()['trailList']
        if trails:
            step_params['Name'] = trails[0]['Name']
        else:
            raise Exception("No trails found for trail status check")
    
    # Create service client
    client = session.client(service_name)
    
    # Execute the action dynamically
    try:
        method = getattr(client, action_name)
        result = method(**step_params)
        
        # Extract standardized metrics
        metrics = extract_metrics(service_name, action_name, result)
        
        return {
            'success': True,
            'metrics': metrics,
            'raw_result_summary': summarize_aws_result(service_name, action_name, result)
        }
        
    except Exception as e:
        logger.error(f"AWS API call failed: {service_name}.{action_name} - {str(e)}")
        raise

def extract_metrics(service: str, action: str, result: dict) -> dict:
    """Extract standardized metrics from AWS API responses"""
    
    metrics = {}
    
    if service == 'cloudtrail':
        if action == 'describe_trails':
            trails = result.get('trailList', [])
            metrics['trail_count'] = len(trails)
            metrics['multi_region_trails'] = sum(1 for t in trails if t.get('IsMultiRegionTrail'))
            metrics['logging_enabled_trails'] = sum(1 for t in trails if t.get('IsLogging'))
            
        elif action == 'lookup_events':
            events = result.get('Events', [])
            metrics['recent_events'] = len(events)
            
    elif service == 'logs' and action == 'describe_log_groups':
        log_groups = result.get('logGroups', [])
        metrics['log_group_count'] = len(log_groups)
        metrics['groups_with_retention'] = len([lg for lg in log_groups if lg.get('retentionInDays')])
        
        # Count long-term retention groups
        long_retention = [lg for lg in log_groups if lg.get('retentionInDays', 0) >= 365]
        metrics['long_retention_groups'] = len(long_retention)
        
    elif service == 'kms':
        if action == 'list_keys':
            metrics['kms_key_count'] = len(result.get('Keys', []))
        elif action == 'list_aliases':
            metrics['key_aliases'] = len(result.get('Aliases', []))
            
    elif service == 'sns' and action == 'list_topics':
        metrics['sns_topic_count'] = len(result.get('Topics', []))
        
    elif service == 'cloudwatch' and action == 'describe_alarms':
        metrics['cloudwatch_alarms'] = len(result.get('MetricAlarms', []))
        
    elif service == 's3' and action == 'list_buckets':
        metrics['s3_bucket_count'] = len(result.get('Buckets', []))
        
    elif service == 'rds' and action == 'describe_db_instances':
        instances = result.get('DBInstances', [])
        metrics['rds_instance_count'] = len(instances)
        metrics['encrypted_rds_instances'] = sum(1 for i in instances if i.get('StorageEncrypted'))
        
    elif service == 'acm' and action == 'list_certificates':
        metrics['certificate_count'] = len(result.get('CertificateSummaryList', []))
        
    elif service == 'securityhub':
        if action == 'get_findings':
            findings = result.get('Findings', [])
            metrics['security_hub_findings'] = len(findings)
            metrics['active_findings'] = len([f for f in findings if f.get('RecordState') == 'ACTIVE'])
        elif action == 'get_insights':
            metrics['security_insights'] = len(result.get('Insights', []))
    
    return metrics

def calculate_ksi_score(step_results: dict, scoring_rules: dict, parameters: dict) -> dict:
    """Calculate KSI score based on dynamic scoring rules"""
    
    # Aggregate all metrics from step results
    all_metrics = {}
    for step_result in step_results.values():
        if isinstance(step_result, dict) and 'metrics' in step_result:
            all_metrics.update(step_result['metrics'])
    
    # Apply pass criteria
    total_weight = 0
    achieved_weight = 0
    findings = []
    
    for criterion in scoring_rules['pass_criteria']:
        metric_name = criterion['metric']
        operator = criterion['operator']
        expected_value = criterion['value']
        weight = criterion['weight']
        description = criterion.get('description', metric_name)
        
        total_weight += weight
        
        actual_value = all_metrics.get(metric_name, 0)
        
        # Evaluate criterion
        passed = evaluate_criterion(actual_value, operator, expected_value)
        
        if passed:
            achieved_weight += weight
            findings.append(f"✅ {description}: {actual_value} {operator} {expected_value}")
        else:
            findings.append(f"❌ {description}: {actual_value} {operator} {expected_value} (FAILED)")
    
    # Calculate final score
    score = achieved_weight / total_weight if total_weight > 0 else 0
    minimum_score = scoring_rules.get('minimum_score', 0.7)
    
    status = 'PASS' if score >= minimum_score else 'FAIL'
    
    return {
        'status': status,
        'score': score,
        'minimum_score': minimum_score,
        'findings': findings,
        'scores': all_metrics
    }

def evaluate_criterion(actual: Any, operator: str, expected: Any) -> bool:
    """Evaluate a single scoring criterion"""
    
    if operator == '>=':
        return actual >= expected
    elif operator == '>':
        return actual > expected
    elif operator == '<=':
        return actual <= expected
    elif operator == '<':
        return actual < expected
    elif operator == '==':
        return actual == expected
    elif operator == '!=':
        return actual != expected
    else:
        logger.warning(f"Unknown operator: {operator}")
        return False

def summarize_aws_result(service: str, action: str, result: dict) -> str:
    """Create a brief summary of AWS API result for logging"""
    
    if service == 'cloudtrail' and action == 'describe_trails':
        trail_count = len(result.get('trailList', []))
        return f"{trail_count} CloudTrail trails found"
        
    elif service == 'logs' and action == 'describe_log_groups':
        group_count = len(result.get('logGroups', []))
        return f"{group_count} log groups found"
        
    elif service == 'kms' and action == 'list_keys':
        key_count = len(result.get('Keys', []))
        return f"{key_count} KMS keys found"
        
    else:
        return f"{service}.{action} executed successfully"

def assume_role_for_tenant(tenant: dict):
    """Assume role for cross-account validation"""
    
    current_account = boto3.client('sts').get_caller_identity()['Account']
    
    if tenant['account_id'] == current_account:
        # Same account - use current session
        logger.info(f"Using same-account session for tenant {tenant['tenant_id']}")
        return boto3.Session()
    
    # Cross-account role assumption
    role_arn = tenant.get('cross_account_role_arn')
    if not role_arn:
        raise Exception(f"Cross-account role not configured for tenant {tenant['tenant_id']}")
    
    logger.info(f"Assuming role {role_arn} for tenant {tenant['tenant_id']}")
    
    sts = boto3.client('sts')
    assumed_role = sts.assume_role(
        RoleArn=role_arn,
        RoleSessionName=f"ksi-validation-{tenant['tenant_id']}"
    )
    
    credentials = assumed_role['Credentials']
    return boto3.Session(
        aws_access_key_id=credentials['AccessKeyId'],
        aws_secret_access_key=credentials['SecretAccessKey'],
        aws_session_token=credentials['SessionToken']
    )

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def tenant_exists(tenant_id: str) -> bool:
    """Check if tenant exists"""
    try:
        table = dynamodb.Table(TENANTS_TABLE)
        response = table.get_item(Key={'tenant_id': tenant_id})
        return 'Item' in response
    except:
        return False

def save_execution_record(execution_id: str, tenant_id: str, ksi_id: str, result: dict, timestamp: str):
    """Save execution record to DynamoDB"""
    
    table = dynamodb.Table(EXECUTIONS_TABLE)
    
    record = {
        'execution_id': execution_id,
        'tenant_id': tenant_id,
        'timestamp': timestamp,
        'ksi_id': ksi_id,
        'status': result['status'],
        'findings': result.get('findings', []),
        'scores': result.get('scores', {}),
        'score': result.get('score', 0),
        'rule_version': result.get('rule_version', 'unknown'),
        'error': result.get('error', '')
    }
    
    try:
        table.put_item(Item=record)
        logger.info(f"Saved execution record: {execution_id}/{ksi_id}")
    except Exception as e:
        logger.error(f"Error saving execution record: {str(e)}")
