def cors_response(status_code: int, body: dict):
    """Return simple response - CORS handled by API Gateway"""
    return {
        'statusCode': status_code,
        'headers': {
            'Content-Type': 'application/json'
        },
        'body': json.dumps(body, default=str)
    }
