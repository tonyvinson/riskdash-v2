import re

# Read the populate_validation_rules.py file
with open('populate_validation_rules.py', 'r') as f:
    content = f.read()

# Add decimal import
if 'from decimal import Decimal' not in content:
    content = content.replace('import boto3', 'import boto3\nfrom decimal import Decimal')

# Fix float values in the scoring rules
# Replace weight values like "weight": 0.25 with "weight": Decimal('0.25')
content = re.sub(r'"weight":\s*(\d+\.\d+)', r'"weight": Decimal("\1")', content)
content = re.sub(r'"minimum_score":\s*(\d+\.\d+)', r'"minimum_score": Decimal("\1")', content)

# Write back the fixed content
with open('populate_validation_rules.py', 'w') as f:
    f.write(content)

print("✅ Fixed float values for DynamoDB")
