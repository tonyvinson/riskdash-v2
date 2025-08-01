#!/bin/bash

echo "🧪 Testing Lambda with proper JSON (no encoding issues)..."

# Test 1: Create clean JSON file for health/admin test
cat << 'EOF' > clean_test.json
{"httpMethod":"GET","path":"/api/admin/tenants"}
EOF

echo "1. Testing admin endpoint..."
aws lambda invoke \
  --region us-gov-west-1 \
  --function-name ksi-mvp-validator-dev \
  --payload file://clean_test.json \
  admin_response.json

echo "Admin response:"
cat admin_response.json
echo ""

# Test 2: Test KSI results endpoint
cat << 'EOF' > ksi_test.json
{"httpMethod":"GET","path":"/api/ksi/results","queryStringParameters":{"tenant_id":"tenant-0bf4618d"}}
EOF

echo "2. Testing KSI results endpoint..."
aws lambda invoke \
  --region us-gov-west-1 \
  --function-name ksi-mvp-validator-dev \
  --payload file://ksi_test.json \
  ksi_response.json

echo "KSI results response:"
cat ksi_response.json
echo ""

# Test 3: Test the missing details endpoint
cat << 'EOF' > details_test.json
{"httpMethod":"GET","path":"/api/ksi/results/details","queryStringParameters":{"tenant_id":"tenant-0bf4618d","execution_id":"exec-1753933962-b68fdd44"}}
EOF

echo "3. Testing KSI details endpoint (the missing one)..."
aws lambda invoke \
  --region us-gov-west-1 \
  --function-name ksi-mvp-validator-dev \
  --payload file://details_test.json \
  details_response.json

echo "KSI details response:"
cat details_response.json
echo ""

echo "🎯 ANALYSIS:"
echo "============"
echo "If you see 'Route not found' for details endpoint, we need to add it to Lambda"
echo "If you see actual data, the endpoint exists but may not return CLI commands"

# Cleanup
rm -f clean_test.json ksi_test.json details_test.json
