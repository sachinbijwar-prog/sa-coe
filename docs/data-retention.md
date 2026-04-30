# Data Retention & Archival

## 1. Overview
Data Retention defines how long data is stored in each zone of the Data Warehouse before being archived, compressed, or purged. A well-designed retention framework reduces storage costs, maintains regulatory compliance, and ensures the platform does not accumulate unbounded data debt.

Enterprise data platforms must balance business needs for historical data access with storage costs and governance risks. Retention policies must be automated, auditable, and aligned with regulatory requirements such as RBI, SEBI, and GDPR.

## 2. Architecture Context

```
[Data Lifecycle Flow]

  Raw Zone          Curated Zone      Mart Zone         Archive Zone
  (HDFS/S3)    →   (HDFS/S3)    →   (HDFS/S3)    →   (Cold Storage)
  Retain: 90d       Retain: 3y        Retain: 5y        Retain: 7-10y
       │                 │                 │                  │
  Auto-purge        Compress +       Aggregate +        Glacier / ADLS
  after 90d         archive 3y+      archive 5y+        Cold / Tape
```

**Retention Tiers:**
- **Hot (Active)**: Frequently accessed, high-performance storage, fast query.
- **Warm (Recent)**: Less frequent access, standard storage.
- **Cold (Archive)**: Compliance retention, low-cost cold storage (e.g., Azure Archive, S3 Glacier).
- **Purge**: Data beyond legal retention window—permanently deleted.

## 3. Core Concepts

| Concept | Description |
|---|---|
| **Retention Period** | Time data must be kept per regulatory or business requirement. |
| **Archival** | Moving data from hot/warm storage to low-cost cold storage. |
| **Purge** | Permanent deletion of data beyond its retention window. |
| **TTL (Time-To-Live)** | Automated expiry of data partitions after a defined period. |
| **Data Classification** | Retention rules differ by data classification (e.g., PII vs. REFERENCE). |
| **Legal Hold** | Override that prevents deletion pending litigation or audit. |
| **Tombstone Record** | Marker recording that data was deleted for audit trail purposes. |

## 4. Detailed Design / Implementation

### Retention Policy Control Table
```sql
CREATE TABLE IF NOT EXISTS gov_ctrl.retention_policy (
    policy_id           INT,
    zone_name           STRING,   -- RAW / STAGING / CURATED / MART / ARCHIVE
    data_classification STRING,   -- PII / FINANCIAL / OPERATIONAL / REFERENCE
    retain_days         INT,      -- Days to retain in current zone
    archive_after_days  INT,      -- Days before moving to archive zone
    purge_after_days    INT,      -- Days before permanent deletion
    compression_on_archive BOOLEAN,
    legal_hold          BOOLEAN,
    regulatory_reference STRING,
    created_dt          TIMESTAMP,
    effective_dt        DATE,
    owner               STRING
)
STORED AS ORC
LOCATION '/warehouse/ctrl/retention_policy';
```

### Automated Retention Cleanup Job (PySpark)
```python
from pyspark.sql import SparkSession
from datetime import datetime, timedelta
import subprocess

spark = SparkSession.builder.appName("RetentionCleanup").getOrCreate()

def purge_old_partitions(table_path: str, retain_days: int, dry_run: bool = True):
    cutoff_date = (datetime.today() - timedelta(days=retain_days)).strftime('%Y-%m-%d')
    result = subprocess.run(['hdfs', 'dfs', '-ls', table_path], capture_output=True, text=True)
    
    for line in result.stdout.strip().split('\n'):
        parts = line.split()
        if len(parts) >= 8:
            path = parts[-1]
            if 'load_date=' in path:
                partition_date = path.split('load_date=')[-1]
                if partition_date < cutoff_date:
                    if dry_run:
                        print(f"[DRY RUN] Would delete: {path}")
                    else:
                        subprocess.run(['hdfs', 'dfs', '-rm', '-r', '-skipTrash', path])
```

## 5. Best Practices
- **Automate retention jobs**: Use Oozie or Airflow to schedule cleanup.
- **Dry run first**: Always verify output before permanent execution.
- **Verify before delete**: Compare counts between source and archive before purging.
- **Log every deletion**: Maintain tombstone records for audit evidence.
- **Legal hold override**: Implement checks to exempt specific data from purge.

## 6. Common Issues & Troubleshooting
- **Storage Full**: Usually caused by missing or failing retention jobs.
- **Verification Failures**: Checksums may fail due to network interruptions during archival.
- **Accidental Purge**: Lack of legal hold checks.

## 7. Performance & Optimization
- **Batch Deletions**: Parallelize partition removal during off-peak hours.
- **Compression**: Use high compression (e.g., Gzip) for archive zones to minimize cost.

## 8. Governance & Compliance
- **Regulatory Alignment**: Ensure policies match RBI/SEBI retention mandates.
- **Audit Trails**: Maintain logs of all deletion and archival actions.

## 9. Tools & Technologies
- **Apache Airflow**: For orchestration.
- **Apache DistCP**: For parallel data movement to cold storage.
- **Azure Archive / AWS Glacier**: For cold storage.

## 10. Real-World Use Cases
- **Banking Ledger**: 10-year retention with automated move to cold storage after 2 years.
- **NSE Market Data**: 90-day raw data retention with full archival for audit.

## 11. References
- [Cloudera Data Retention Best Practices](https://docs.cloudera.com)
- [RBI Data Retention Guidelines](https://www.rbi.org.in)
