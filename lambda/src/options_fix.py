def lambda_handler(event, context):
    """Main Lambda handler with enhanced CORS support"""
    
    logger.info(f"Received event: {json.dumps(event)}")
    
    # Handle CORS preflight requests for ALL paths
    if event.get('httpMethod') == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
                'Access-Control-Max-Age': '86400',
                'Content-Type': 'application/json'
            },
            'body': json.dumps({'message': 'CORS preflight successful'})
        }
    
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
