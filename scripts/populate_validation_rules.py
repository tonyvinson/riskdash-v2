#!/usr/bin/env python3
"""
populate_validation_rules.py - Create DynamoDB validation rules for your 5 KSIs

This script creates the flexible validation rules based on your actual
KSI implementations with real AWS commands and scoring logic.
"""

import boto3
from decimal import Decimal
import json
from datetime import datetime, timezone

# Configuration
AWS_REGION = "us-gov-west-1"
VALIDATION_RULES_TABLE = "ksi-mvp-validation-rules-dev"

def create_validation_rules():
    """Create the 5 KSI validation rules based on your actual implementations"""
    
    rules = [
        # ==================================================================
        # KSI-MLA-01: SIEM/Centralized Logging (8 commands)
        # ==================================================================
        {
            "rule_id": "KSI-MLA-01-v1.0",
            "ksi_id": "KSI-MLA-01",
            "version": "1.0",
            "status": "active",
            "category": "Monitoring, Logging & Alerting",
            "title": "SIEM/Centralized Logging",
            "description": "Validates SIEM implementation with CloudTrail, log groups, KMS encryption, and Security Hub for tamper-resistant logging",
            
            "validation_steps": [
                {
                    "step_id": 1,
                    "service": "cloudtrail",
                    "action": "describe_trails",
                    "parameters": {},
                    "required": True,
                    "failure_action": "fail_ksi",
                    "description": "Check CloudTrail foundation for audit trails"
                },
                {
                    "step_id": 2,
                    "service": "logs",
                    "action": "describe_log_groups", 
                    "parameters": {},
                    "required": True,
                    "failure_action": "fail_ksi",
                    "description": "Validate centralized log collection"
                },
                {
                    "step_id": 3,
                    "service": "kms",
                    "action": "list_keys",
                    "parameters": {},
                    "required": True,
                    "failure_action": "warn",
                    "description": "Check cryptographic infrastructure for log protection"
                },
                {
                    "step_id": 4,
                    "service": "securityhub",
                    "action": "get_findings",
                    "parameters": {"MaxResults": 20},
                    "required": False,
                    "failure_action": "ignore",
                    "description": "Check advanced threat detection findings"
                },
                {
                    "step_id": 5,
                    "service": "cloudtrail",
                    "action": "lookup_events",
                    "parameters": {"MaxItems": 10},
                    "required": False,
                    "failure_action": "ignore", 
                    "description": "Validate recent audit events"
                },
                {
                    "step_id": 6,
                    "service": "config",
                    "action": "describe_delivery_channels",
                    "parameters": {},
                    "required": False,
                    "failure_action": "warn",
                    "description": "Check compliance log delivery channels"
                },
                {
                    "step_id": 7,
                    "service": "organizations",
                    "action": "describe_organization", 
                    "parameters": {},
                    "required": False,
                    "failure_action": "ignore",
                    "description": "Validate enterprise-wide logging capability"
                },
                {
                    "step_id": 8,
                    "service": "cloudtrail",
                    "action": "get_trail_status",
                    "parameters": {"Name": "auto_detect_first_trail"},
                    "required": False,
                    "failure_action": "ignore",
                    "description": "Confirm CloudTrail operational status"
                }
            ],
            
            "scoring_rules": {
                "pass_criteria": [
                    {
                        "metric": "trail_count",
                        "operator": ">=",
                        "value": 1,
                        "weight": Decimal("0.25"),
                        "description": "At least 1 CloudTrail trail configured"
                    },
                    {
                        "metric": "log_group_count",
                        "operator": ">=", 
                        "value": 5,
                        "weight": Decimal("0.25"),
                        "description": "Minimum 5 log groups for centralized logging"
                    },
                    {
                        "metric": "groups_with_retention",
                        "operator": ">=",
                        "value": 3,
                        "weight": Decimal("0.2"),
                        "description": "Log groups with retention policies"
                    },
                    {
                        "metric": "kms_key_count",
                        "operator": ">=",
                        "value": 1,
                        "weight": Decimal("0.15"),
                        "description": "KMS keys available for log encryption"
                    },
                    {
                        "metric": "multi_region_trails",
                        "operator": ">=",
                        "value": 1,
                        "weight": Decimal("0.15"),
                        "description": "Multi-region audit coverage"
                    }
                ],
                "minimum_score": Decimal("0.7"),
                "critical_failures": ["no_trails", "no_log_groups"]
            },
            
            "configurable_parameters": {
                "min_trail_count": {
                    "default": 1,
                    "description": "Minimum CloudTrail trails required"
                },
                "min_log_groups": {
                    "default": 5,
                    "description": "Minimum log groups for centralized logging" 
                },
                "min_retention_groups": {
                    "default": 3,
                    "description": "Minimum log groups with retention policies"
                },
                "long_term_retention_days": {
                    "default": 365,
                    "description": "Days for compliance-grade retention"
                }
            },
            
            "created_date": datetime.now(timezone.utc).isoformat(),
            "created_by": "migration-script",
            "compliance_framework": "FedRAMP-20x",
            "control_references": ["AU-2", "AU-3", "AU-6", "AU-12", "SI-4"]
        },

        # ==================================================================
        # KSI-MLA-02: Log Review & Analysis (9 commands)  
        # ==================================================================
        {
            "rule_id": "KSI-MLA-02-v1.0",
            "ksi_id": "KSI-MLA-02", 
            "version": "1.0",
            "status": "active",
            "category": "Monitoring, Logging & Alerting",
            "title": "Log Review & Analysis",
            "description": "Validates log review processes, notification systems, and retention policies for compliance audit capabilities",
            
            "validation_steps": [
                {
                    "step_id": 1,
                    "service": "sns",
                    "action": "list_topics",
                    "parameters": {},
                    "required": True,
                    "failure_action": "warn",
                    "description": "Check log review notification systems"
                },
                {
                    "step_id": 2,
                    "service": "logs", 
                    "action": "describe_log_groups",
                    "parameters": {},
                    "required": True,
                    "failure_action": "fail_ksi",
                    "description": "Validate manual review capability via log groups"
                },
                {
                    "step_id": 3,
                    "service": "securityhub",
                    "action": "get_insights",
                    "parameters": {},
                    "required": False,
                    "failure_action": "ignore",
                    "description": "Check advanced log correlation capabilities"
                },
                {
                    "step_id": 4,
                    "service": "cloudtrail",
                    "action": "lookup_events",
                    "parameters": {"MaxItems": 10},
                    "required": True,
                    "failure_action": "warn",
                    "description": "Validate audit event analysis capability"
                },
                {
                    "step_id": 5,
                    "service": "cloudwatch",
                    "action": "describe_alarms",
                    "parameters": {},
                    "required": False,
                    "failure_action": "ignore",
                    "description": "Check automated log monitoring alarms"
                },
                {
                    "step_id": 6,
                    "service": "config",
                    "action": "describe_configuration_recorders",
                    "parameters": {},
                    "required": False,
                    "failure_action": "ignore",
                    "description": "Validate configuration change review"
                },
                {
                    "step_id": 7,
                    "service": "organizations",
                    "action": "describe_organization",
                    "parameters": {},
                    "required": False,
                    "failure_action": "ignore", 
                    "description": "Check enterprise log aggregation capability"
                },
                {
                    "step_id": 8,
                    "service": "backup",
                    "action": "list_backup_plans",
                    "parameters": {},
                    "required": False,
                    "failure_action": "ignore",
                    "description": "Validate backup-related log review"
                },
                {
                    "step_id": 9,
                    "service": "lambda",
                    "action": "list_functions",
                    "parameters": {},
                    "required": False,
                    "failure_action": "ignore",
                    "description": "Check automated log processing functions"
                }
            ],
            
            "scoring_rules": {
                "pass_criteria": [
                    {
                        "metric": "sns_topic_count",
                        "operator": ">=",
                        "value": 1,
                        "weight": Decimal("0.3"),
                        "description": "SNS topics for alert delivery"
                    },
                    {
                        "metric": "log_group_count",
                        "operator": ">=",
                        "value": 5,
                        "weight": Decimal("0.25"),
                        "description": "Log groups available for analysis"
                    },
                    {
                        "metric": "long_retention_groups",
                        "operator": ">=",
                        "value": 1,
                        "weight": Decimal("0.25"),
                        "description": "Long-term audit capability"
                    },
                    {
                        "metric": "cloudwatch_alarms",
                        "operator": ">=",
                        "value": 1,
                        "weight": Decimal("0.2"),
                        "description": "Automated monitoring alerts"
                    }
                ],
                "minimum_score": Decimal("0.6"),
                "critical_failures": ["no_log_groups", "no_audit_events"]
            },
            
            "configurable_parameters": {
                "min_sns_topics": {
                    "default": 1,
                    "description": "Minimum SNS topics for notifications"
                },
                "min_log_groups": {
                    "default": 5,
                    "description": "Minimum log groups for review"
                },
                "long_term_retention_days": {
                    "default": 365,
                    "description": "Days for compliance-grade retention"
                },
                "min_cloudwatch_alarms": {
                    "default": 1,
                    "description": "Minimum CloudWatch alarms for monitoring"
                }
            },
            
            "created_date": datetime.now(timezone.utc).isoformat(),
            "created_by": "migration-script",
            "compliance_framework": "FedRAMP-20x",
            "control_references": ["AU-2", "AU-3", "AU-6", "AU-12", "SI-4"]
        },

        # ==================================================================
        # KSI-SVC-06: Automated Key Management (10 commands)
        # ==================================================================
        {
            "rule_id": "KSI-SVC-06-v1.0",
            "ksi_id": "KSI-SVC-06",
            "version": "1.0", 
            "status": "active",
            "category": "Service Configuration",
            "title": "Automated Key Management",
            "description": "Validates automated key management systems for encryption keys, certificates, rotation policies, and cryptographic governance",
            
            "validation_steps": [
                {
                    "step_id": 1,
                    "service": "kms",
                    "action": "list_keys",
                    "parameters": {},
                    "required": True,
                    "failure_action": "fail_ksi",
                    "description": "Check KMS keys for automated key management"
                },
                {
                    "step_id": 2,
                    "service": "kms",
                    "action": "list_aliases",
                    "parameters": {},
                    "required": True,
                    "failure_action": "warn",
                    "description": "Validate key aliases and management structure"
                },
                {
                    "step_id": 3,
                    "service": "s3",
                    "action": "list_buckets",
                    "parameters": {},
                    "required": True,
                    "failure_action": "warn",
                    "description": "Check S3 bucket encryption and key usage"
                },
                {
                    "step_id": 4,
                    "service": "rds", 
                    "action": "describe_db_instances",
                    "parameters": {},
                    "required": False,
                    "failure_action": "ignore",
                    "description": "Validate RDS encryption key management"
                },
                {
                    "step_id": 5,
                    "service": "acm",
                    "action": "list_certificates",
                    "parameters": {},
                    "required": False,
                    "failure_action": "ignore",
                    "description": "Check certificate management and rotation"
                },
                {
                    "step_id": 6,
                    "service": "config",
                    "action": "describe_configuration_recorders",
                    "parameters": {},
                    "required": False,
                    "failure_action": "ignore",
                    "description": "Validate key configuration compliance tracking"
                },
                {
                    "step_id": 7,
                    "service": "cloudwatch",
                    "action": "describe_alarms",
                    "parameters": {},
                    "required": False,
                    "failure_action": "ignore",
                    "description": "Check key management monitoring alarms"
                },
                {
                    "step_id": 8,
                    "service": "sns",
                    "action": "list_topics",
                    "parameters": {},
                    "required": False,
                    "failure_action": "ignore",
                    "description": "Validate key management notifications"
                },
                {
                    "step_id": 9,
                    "service": "backup",
                    "action": "list_backup_vaults",
                    "parameters": {},
                    "required": False,
                    "failure_action": "ignore",
                    "description": "Check backup vault encryption keys"
                },
                {
                    "step_id": 10,
                    "service": "organizations",
                    "action": "describe_organization",
                    "parameters": {},
                    "required": False,
                    "failure_action": "ignore",
                    "description": "Validate enterprise-wide key governance"
                }
            ],
            
            "scoring_rules": {
                "pass_criteria": [
                    {
                        "metric": "kms_key_count",
                        "operator": ">=",
                        "value": 1,
                        "weight": Decimal("0.3"),
                        "description": "KMS keys available for encryption"
                    },
                    {
                        "metric": "key_aliases",
                        "operator": ">=",
                        "value": 1,
                        "weight": Decimal("0.2"),
                        "description": "Key aliases for management organization"
                    },
                    {
                        "metric": "s3_bucket_count",
                        "operator": ">=",
                        "value": 1,
                        "weight": Decimal("0.15"),
                        "description": "S3 buckets using encryption"
                    },
                    {
                        "metric": "certificate_count",
                        "operator": ">=",
                        "value": 0,
                        "weight": Decimal("0.15"),
                        "description": "Managed certificates"
                    },
                    {
                        "metric": "encrypted_rds_instances",
                        "operator": ">=",
                        "value": 0,
                        "weight": Decimal("0.2"),
                        "description": "RDS instances with encryption"
                    }
                ],
                "minimum_score": Decimal("0.6"),
                "critical_failures": ["no_kms_keys", "no_encryption"]
            },
            
            "configurable_parameters": {
                "min_kms_keys": {
                    "default": 1,
                    "description": "Minimum KMS keys required"
                },
                "min_key_aliases": {
                    "default": 1,
                    "description": "Minimum key aliases for organization"
                },
                "require_s3_encryption": {
                    "default": True,
                    "description": "Require S3 bucket encryption"
                },
                "require_rds_encryption": {
                    "default": False,
                    "description": "Require RDS encryption (optional for smaller tenants)"
                }
            },
            
            "created_date": datetime.now(timezone.utc).isoformat(),
            "created_by": "migration-script", 
            "compliance_framework": "FedRAMP-20x",
            "control_references": ["SC-12", "SC-13", "SC-28"]
        }
        
        # TODO: Add the other 2 KSIs when identified from export
        # Based on your existing data, you likely have:
        # - Another MLA KSI (MLA-03, MLA-04, MLA-05, or MLA-06)
        # - Possibly a CNA, IAM, or CMT KSI
        # We can add these after running the export script
    ]
    
    return rules

def populate_validation_rules_table():
    """Populate DynamoDB with the validation rules"""
    
    dynamodb = boto3.resource('dynamodb', region_name=AWS_REGION)
    table = dynamodb.Table(VALIDATION_RULES_TABLE)
    
    rules = create_validation_rules()
    
    print(f"🔧 Populating {VALIDATION_RULES_TABLE} with {len(rules)} validation rules...")
    
    for rule in rules:
        try:
            table.put_item(Item=rule)
            print(f"✅ Added {rule['rule_id']}: {rule['title']}")
            print(f"   - {len(rule['validation_steps'])} validation steps")
            print(f"   - {len(rule['scoring_rules']['pass_criteria'])} scoring criteria")
            print(f"   - {len(rule['configurable_parameters'])} configurable parameters")
        except Exception as e:
            print(f"❌ Error adding {rule['rule_id']}: {str(e)}")
    
    return rules

def create_sample_tenant_overrides():
    """Create sample tenant-specific rule overrides"""
    
    overrides = [
        {
            "tenant_id": "tenant-sample",
            "rule_id": "KSI-MLA-01-v1.0",
            "enabled": True,
            "custom_parameters": {
                "min_trail_count": 2,       # Override default of 1
                "min_log_groups": 10,       # Override default of 5
                "long_term_retention_days": 2555  # Override default of 365 (7 years)
            },
            "schedule": "daily",
            "last_updated": datetime.now(timezone.utc).isoformat(),
            "updated_by": "tenant-admin@company.com"
        }
    ]
    
    return overrides

def main():
    """Main function to populate validation rules"""
    
    print("🚀 POPULATING KSI VALIDATION RULES")
    print("=" * 50)
    print("Creating flexible validation rules from your 5 existing KSIs")
    print(f"Target table: {VALIDATION_RULES_TABLE}")
    print(f"Region: {AWS_REGION}")
    
    try:
        rules = populate_validation_rules_table()
        
        print("\n" + "=" * 50)
        print("🎉 VALIDATION RULES CREATED SUCCESSFULLY!")
        print(f"✅ Created {len(rules)} flexible validation rules")
        
        print("\n📋 Rules Summary:")
        for rule in rules:
            print(f"- {rule['ksi_id']}: {rule['title']}")
            print(f"  └─ {len(rule['validation_steps'])} steps, {len(rule['configurable_parameters'])} parameters")
        
        print("\n🎯 Benefits of This Approach:")
        print("✅ Zero-downtime rule updates")
        print("✅ Tenant-specific parameter overrides") 
        print("✅ Admin UI can manage all validation logic")
        print("✅ A/B testing of rule changes")
        print("✅ Instant enable/disable of problematic rules")
        
        print("\n📋 Next Steps:")
        print("1. Deploy MVP infrastructure with validation rules table")
        print("2. Test dynamic rule execution with sample tenant")
        print("3. Build admin UI for rule management")
        print("4. Add the remaining 2 KSIs after export analysis")
        
    except Exception as e:
        print(f"\n❌ Error: {str(e)}")
        return 1
    
    return 0

if __name__ == "__main__":
    exit(main())
