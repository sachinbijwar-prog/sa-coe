# Audit & Reconciliation Framework

## 1. Overview
The Audit & Reconciliation Framework provides a standardized mechanism for tracking data movement, ensuring data integrity, and maintaining an auditable record of all ETL activities. It is essential for financial compliance and operational transparency in the Smart Analytica data ecosystem.

## 2. Architecture Context
The framework consists of:
- **Audit Database**: Centralized storage for job metadata and row counts.
- **Audit Client**: Reusable library (Python/Java) injected into ETL pipelines.
- **Reporting Layer**: Dashboards to visualize reconciliation variances.

## 3. Core Concepts
- **Job Run ID**: A unique identifier for every execution of a pipeline.
- **Source-to-Target Reconciliation**: Comparing row counts and checksums at each stage (Source -> Staging -> Core -> Mart).
- **Variance Threshold**: Acceptable percentage of difference before a job is flagged as a failure.
- **Audit Columns**: Standard metadata columns added to every table (`load_id`, `created_at`, `updated_at`).

## 4. Detailed Design / Implementation

### Audit Table Schema
```sql
CREATE TABLE audit_log (
    job_id STRING,
    step_name STRING,
    source_count BIGINT,
    target_count BIGINT,
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    status STRING,
    variance_pct DOUBLE
);
```

### PySpark Audit Injection
```python
def log_audit(spark, job_id, step, src_df, tgt_df):
    src_count = src_df.count()
    tgt_count = tgt_df.count()
    variance = abs(src_count - tgt_count) / src_count if src_count > 0 else 0
    
    # Write to audit table
    audit_data = [(job_id, step, src_count, tgt_count, variance)]
    audit_df = spark.createDataFrame(audit_data, ["job_id", "step", "src", "tgt", "var"])
    audit_df.write.format("jdbc").option("url", "jdbc:postgresql://db-host/audit").save()
```

## 5. Best Practices
- **Never Skip Auditing**: Even for small datasets, an audit log provides a "heartbeat" for the system.
- **Automated Alerting**: Set up alerts if the `variance_pct` exceeds a predefined threshold (e.g., > 1%).
- **Checksums for Critical Data**: For financial data, use hash-based checksums (MD5/SHA) on columns, not just row counts.
- **Immutability**: The `audit_log` should be insert-only; never update or delete historical audit records.

## 6. Common Issues & Troubleshooting
- **Audit DB Performance**: If auditing 10,000+ tasks daily, ensure the audit database is partitioned and indexed.
- **Missing Load IDs**: Ensure that any downstream transformations carry forward the original `load_id` for lineage.
- **Timezone Inconsistency**: Always use UTC for all audit timestamps.

## 7. Performance & Optimization
- **Asynchronous Auditing**: Use a message queue (Kafka) for audit logs to avoid blocking the main ETL processing.
- **Batch Metadata Writing**: Collect audit info during a job and write it once at the end to minimize DB connections.

## 8. Governance & Compliance
- **Regulatory Reporting**: Use audit logs to generate mandatory reports (e.g., for RBI/SEBI compliance).
- **Data Retention**: Retain audit logs for at least 7 years to meet enterprise audit standards.
- **Access Control**: Limit write access to the audit database to the ETL service accounts only.

## 9. Tools & Technologies
- **PostgreSQL/MySQL**: Standard databases for the metadata store.
- **Grafana/Superset**: For building audit and reconciliation dashboards.
- **Apache Airflow**: For orchestrating the audit capture as part of the DAG lifecycle.

## 10. Real-World Use Cases
- **Daily Sales Reconcile**: Reconciling the previous day's sales data from the ERP (SAP) to the Data Lake with a 0% variance requirement.
- **GDPR Compliance**: Using audit logs to prove when and how a specific dataset was processed.

## 11. References
- [Enterprise Data Auditing Patterns](https://martinfowler.com/articles/evopipeline.html)
- [Data Reconciliation Best Practices](https://www.datawarehouse4u.info/Data-reconciliation.html)
