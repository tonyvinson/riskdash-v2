#!/usr/bin/env python3
"""
FedRAMP 20x Database Cleanup Script
Safely removes corrupt/incomplete execution records while preserving quality data
"""

import boto3
import json
import os
from datetime import datetime, timedelta
from decimal import Decimal
import logging
from typing import List, Dict, Any
import time

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration
REGION = 'us-gov-west-1'
EXECUTIONS_TABLE = 'ksi-mvp-executions-dev'
BACKUP_BUCKET = 'ksi-mvp-backups-dev'  # Optional S3 bucket for backups
DRY_RUN = True  # Set to False to actually delete records

# Quality thresholds for identifying corrupt data
QUALITY_CUTOFF_DATE = "2025-07-30T00:00:00"  # Before your CLI system was working properly
MIN_COMMANDS_FOR_AUTOMATED = 1  # Automated KSIs should have at least 1 command
AUTOMATED_KSI_PREFIXES = ['KSI-MLA-', 'KSI-SVC-', 'KSI-CNA-', 'KSI-IAM-']

class DynamoDBCleanup:
    def __init__(self):
        self.dynamodb = boto3.resource('dynamodb', region_name=REGION)
        self.s3 = boto3.client('s3', region_name=REGION)
        self.table = self.dynamodb.Table(EXECUTIONS_TABLE)
        
        self.stats = {
            'total_scanned': 0,
            'corrupt_found': 0,
            'backed_up': 0,
            'deleted': 0,
            'errors': 0,
            'kept': 0
        }
        
        self.corrupt_records = []
        
    def decimal_to_native(self, obj):
        """Convert DynamoDB Decimal types to native Python types"""
        if isinstance(obj, list):
            return [self.decimal_to_native(item) for item in obj]
        elif isinstance(obj, dict):
            return {key: self.decimal_to_native(value) for key, value in obj.items()}
        elif isinstance(obj, Decimal):
            return int(obj) if obj % 1 == 0 else float(obj)
        else:
            return obj

    def is_corrupt_record(self, record: Dict[str, Any]) -> Dict[str, List[str]]:
        """
        Identify if a record is corrupt and why
        Returns dict with corruption types and reasons
        """
        issues = {
            'critical': [],
            'warning': [],
            'info': []
        }
        
        # Check timestamp (critical corruption)
        timestamp = record.get('timestamp', '')
        if timestamp and timestamp < QUALITY_CUTOFF_DATE:
            issues['critical'].append(f"Old record from {timestamp} (before CLI system was working)")
        
        # Check for missing essential fields
        if not record.get('ksi_id'):
            issues['critical'].append("Missing ksi_id")
            
        if not record.get('tenant_id'):
            issues['critical'].append("Missing tenant_id")
        
        # Check CLI command data quality
        cli_commands = record.get('cli_command_details', [])
        commands_executed = int(record.get('commands_executed', 0))
        ksi_id = record.get('ksi_id', '')
        
        # Automated KSIs should have CLI commands
        is_automated_ksi = any(ksi_id.startswith(prefix) for prefix in AUTOMATED_KSI_PREFIXES)
        
        if is_automated_ksi and commands_executed > 0:
            if not cli_commands or len(cli_commands) == 0:
                issues['critical'].append("Automated KSI missing CLI command details")
            elif len(cli_commands) != commands_executed:
                issues['warning'].append(f"CLI commands count mismatch: {len(cli_commands)} vs {commands_executed}")
        
        # Check for empty or malformed CLI commands
        if cli_commands:
            empty_commands = [i for i, cmd in enumerate(cli_commands) if not cmd or cmd.strip() == '']
            if empty_commands:
                issues['warning'].append(f"Empty CLI commands at positions: {empty_commands}")
        
        # Check assertion data quality
        assertion = record.get('assertion')
        assertion_reason = record.get('assertion_reason', '')
        
        if assertion is None:
            issues['critical'].append("Missing assertion field")
        
        if not assertion_reason or assertion_reason.strip() == '':
            issues['warning'].append("Missing assertion reasoning")
        
        # Check for impossible command counts
        successful_commands = int(record.get('successful_commands', 0))
        failed_commands = int(record.get('failed_commands', 0))
        
        if successful_commands + failed_commands > commands_executed:
            issues['critical'].append("Impossible command counts (success + failed > total)")
        
        # Check for suspiciously old execution IDs
        execution_id = record.get('execution_id', '')
        if execution_id and not execution_id.startswith('exec-'):
            issues['info'].append("Non-standard execution ID format")
        
        return issues

    def scan_for_corrupt_records(self) -> List[Dict[str, Any]]:
        """Scan the entire table for corrupt records"""
        logger.info(f"🔍 Scanning {EXECUTIONS_TABLE} for corrupt records...")
        
        corrupt_records = []
        last_evaluated_key = None
        
        while True:
            scan_kwargs = {
                'TableName': EXECUTIONS_TABLE,
                'Select': 'ALL_ATTRIBUTES'
            }
            
            if last_evaluated_key:
                scan_kwargs['ExclusiveStartKey'] = last_evaluated_key
            
            try:
                response = self.table.scan(**scan_kwargs)
                items = response.get('Items', [])
                
                for item in items:
                    self.stats['total_scanned'] += 1
                    
                    # Convert Decimal types for JSON serialization
                    clean_item = self.decimal_to_native(item)
                    
                    # Check if record is corrupt
                    corruption_issues = self.is_corrupt_record(clean_item)
                    
                    # If any critical or warning issues found, mark as corrupt
                    if corruption_issues['critical'] or corruption_issues['warning']:
                        corrupt_records.append({
                            'record': clean_item,
                            'issues': corruption_issues
                        })
                        self.stats['corrupt_found'] += 1
                        
                        if self.stats['corrupt_found'] % 10 == 0:
                            logger.info(f"Found {self.stats['corrupt_found']} corrupt records so far...")
                    else:
                        self.stats['kept'] += 1
                
                # Check if there are more items to scan
                last_evaluated_key = response.get('LastEvaluatedKey')
                if not last_evaluated_key:
                    break
                    
            except Exception as e:
                logger.error(f"Error scanning table: {e}")
                self.stats['errors'] += 1
                break
        
        logger.info(f"✅ Scan complete: {self.stats['total_scanned']} total, {self.stats['corrupt_found']} corrupt")
        return corrupt_records

    def backup_corrupt_records(self, corrupt_records: List[Dict[str, Any]]) -> bool:
        """Backup corrupt records to S3 before deletion"""
        if not corrupt_records:
            return True
            
        logger.info(f"💾 Backing up {len(corrupt_records)} corrupt records...")
        
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        backup_key = f"database_cleanup/corrupt_records_backup_{timestamp}.json"
        
        backup_data = {
            'backup_timestamp': datetime.now().isoformat(),
            'table_name': EXECUTIONS_TABLE,
            'cleanup_reason': 'Data quality cleanup - corrupt/incomplete records',
            'total_records': len(corrupt_records),
            'records': corrupt_records
        }
        
        try:
            # Try to save to S3 first
            try:
                backup_json = json.dumps(backup_data, indent=2, default=str)
                self.s3.put_object(
                    Bucket=BACKUP_BUCKET,
                    Key=backup_key,
                    Body=backup_json,
                    ContentType='application/json'
                )
                logger.info(f"✅ Backup saved to S3: s3://{BACKUP_BUCKET}/{backup_key}")
                self.stats['backed_up'] = len(corrupt_records)
                return True
                
            except Exception as s3_error:
                logger.warning(f"S3 backup failed: {s3_error}")
                
                # Fallback to local file
                local_backup_file = f"corrupt_records_backup_{timestamp}.json"
                with open(local_backup_file, 'w') as f:
                    json.dump(backup_data, f, indent=2, default=str)
                logger.info(f"✅ Backup saved locally: {local_backup_file}")
                self.stats['backed_up'] = len(corrupt_records)
                return True
                
        except Exception as e:
            logger.error(f"❌ Backup failed: {e}")
            return False

    def delete_corrupt_records(self, corrupt_records: List[Dict[str, Any]]) -> bool:
        """Safely delete corrupt records from DynamoDB"""
        if not corrupt_records or DRY_RUN:
            if DRY_RUN:
                logger.info(f"🧪 DRY RUN: Would delete {len(corrupt_records)} corrupt records")
                return True
            return True
        
        logger.info(f"🗑️ Deleting {len(corrupt_records)} corrupt records...")
        
        deleted_count = 0
        batch_size = 25  # DynamoDB batch limit
        
        for i in range(0, len(corrupt_records), batch_size):
            batch = corrupt_records[i:i + batch_size]
            
            try:
                with self.table.batch_writer() as batch_writer:
                    for corrupt_item in batch:
                        record = corrupt_item['record']
                        
                        # Delete using the primary key
                        delete_key = {
                            'tenant_id': record['tenant_id'],
                            'execution_id': record.get('execution_id', record.get('ksi_id', 'unknown'))
                        }
                        
                        batch_writer.delete_item(Key=delete_key)
                        deleted_count += 1
                
                logger.info(f"Deleted batch {i//batch_size + 1}: {len(batch)} records")
                time.sleep(0.1)  # Small delay to avoid throttling
                
            except Exception as e:
                logger.error(f"Error deleting batch: {e}")
                self.stats['errors'] += 1
        
        self.stats['deleted'] = deleted_count
        logger.info(f"✅ Successfully deleted {deleted_count} corrupt records")
        return True

    def print_cleanup_report(self, corrupt_records: List[Dict[str, Any]]):
        """Print detailed cleanup report"""
        print("\n" + "="*80)
        print("🧹 DATABASE CLEANUP REPORT")
        print("="*80)
        
        print(f"📊 STATISTICS:")
        print(f"   Total records scanned: {self.stats['total_scanned']:,}")
        print(f"   Corrupt records found: {self.stats['corrupt_found']:,}")
        print(f"   Clean records kept:    {self.stats['kept']:,}")
        print(f"   Records backed up:     {self.stats['backed_up']:,}")
        print(f"   Records deleted:       {self.stats['deleted']:,}")
        print(f"   Errors encountered:    {self.stats['errors']:,}")
        
        if corrupt_records:
            print(f"\n🔍 CORRUPTION ANALYSIS:")
            
            # Count corruption types
            critical_issues = {}
            warning_issues = {}
            
            for corrupt_item in corrupt_records:
                issues = corrupt_item['issues']
                
                for issue in issues.get('critical', []):
                    critical_issues[issue] = critical_issues.get(issue, 0) + 1
                    
                for issue in issues.get('warning', []):
                    warning_issues[issue] = warning_issues.get(issue, 0) + 1
            
            if critical_issues:
                print(f"\n   🚨 CRITICAL ISSUES:")
                for issue, count in sorted(critical_issues.items(), key=lambda x: x[1], reverse=True):
                    print(f"      • {issue}: {count} records")
            
            if warning_issues:
                print(f"\n   ⚠️  WARNING ISSUES:")
                for issue, count in sorted(warning_issues.items(), key=lambda x: x[1], reverse=True):
                    print(f"      • {issue}: {count} records")
        
        # Show sample corrupt records
        if corrupt_records:
            print(f"\n📋 SAMPLE CORRUPT RECORDS (first 3):")
            for i, corrupt_item in enumerate(corrupt_records[:3]):
                record = corrupt_item['record']
                issues = corrupt_item['issues']
                
                print(f"\n   Record {i+1}:")
                print(f"     KSI ID: {record.get('ksi_id', 'MISSING')}")
                print(f"     Execution: {record.get('execution_id', 'MISSING')}")
                print(f"     Timestamp: {record.get('timestamp', 'MISSING')}")
                print(f"     Commands: {record.get('commands_executed', 0)} executed, {len(record.get('cli_command_details', []))} detailed")
                print(f"     Issues: {', '.join(issues.get('critical', []) + issues.get('warning', []))}")
        
        print(f"\n🎯 CLEANUP STATUS: {'✅ DRY RUN COMPLETE' if DRY_RUN else '✅ CLEANUP COMPLETE'}")
        print("="*80)

def main():
    """Main cleanup execution"""
    print("🧹 FedRAMP 20x Database Cleanup Tool")
    print("="*50)
    
    if DRY_RUN:
        print("🧪 RUNNING IN DRY RUN MODE - No records will be deleted")
    else:
        print("⚠️  LIVE MODE - Records WILL be permanently deleted!")
        confirmation = input("Are you sure you want to continue? (type 'YES' to confirm): ")
        if confirmation != 'YES':
            print("❌ Cleanup cancelled")
            return
    
    # Initialize cleanup
    cleanup = DynamoDBCleanup()
    
    try:
        # Step 1: Scan for corrupt records
        corrupt_records = cleanup.scan_for_corrupt_records()
        
        if not corrupt_records:
            print("🎉 No corrupt records found! Database is clean.")
            return
        
        # Step 2: Backup corrupt records
        if not cleanup.backup_corrupt_records(corrupt_records):
            print("❌ Backup failed! Stopping cleanup for safety.")
            return
        
        # Step 3: Delete corrupt records
        cleanup.delete_corrupt_records(corrupt_records)
        
        # Step 4: Print report
        cleanup.print_cleanup_report(corrupt_records)
        
        if not DRY_RUN:
            print(f"\n🎉 Cleanup complete! Your dashboard should now show only quality data.")
            print(f"💡 Recommendation: Run your dashboard and verify everything looks good.")
        
    except Exception as e:
        logger.error(f"❌ Cleanup failed with error: {e}")
        return 1
    
    return 0

if __name__ == "__main__":
    exit(main())
