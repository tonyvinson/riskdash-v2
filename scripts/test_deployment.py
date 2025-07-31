#!/usr/bin/env python3
"""
Test the deployed KSI MVP system
"""

import boto3
import json
import requests
import time
from datetime import datetime, timezone

def test_deployment():
    """Test the deployed system"""
    
    print("🧪 Testing KSI MVP Deployment")
    print("=" * 40)
    
    # Get API Gateway URL from Terraform output
    try:
        result = subprocess.run(['terraform', 'output', '-json'], 
                              capture_output=True, text=True, cwd='terraform')
        outputs = json.loads(result.stdout)
        api_url = outputs['api_gateway_url']['value']
        print(f"✅ API Gateway URL: {api_url}")
    except Exception as e:
        print(f"❌ Could not get API URL: {e}")
        return False
    
    # Test 1: Get available KSIs
    print("\n🔍 Test 1: Get available KSIs")
    try:
        response = requests.get(f"{api_url}/api/admin/ksi-defaults")
        if response.status_code == 200:
            ksis = response.json()['available_ksis']
            print(f"✅ Found {len(ksis)} available KSIs")
            for ksi in ksis:
                print(f"   - {ksi['ksi_id']}: {ksi['title']}")
        else:
            print(f"❌ API test failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ API test error: {e}")
        return False
    
    # Test 2: Create test tenant
    print("\n👤 Test 2: Create test tenant")
    try:
        current_account = boto3.client('sts').get_caller_identity()['Account']
        
        tenant_data = {
            'account_id': current_account,
            'tenant_name': 'Test Tenant',
            'contact_email': 'test@example.com'
        }
        
        response = requests.post(f"{api_url}/api/admin/tenants", json=tenant_data)
        if response.status_code == 201:
            tenant_id = response.json()['tenant_id']
            print(f"✅ Created test tenant: {tenant_id}")
        else:
            print(f"❌ Tenant creation failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Tenant creation error: {e}")
        return False
    
    print("\n🎉 All tests passed!")
    print(f"🌐 Access admin interface at: {api_url}/admin")
    print(f"🏢 Access tenant interface at: {api_url}/tenant/{tenant_id}/dashboard")
    
    return True

if __name__ == "__main__":
    import subprocess
    success = test_deployment()
    exit(0 if success else 1)
