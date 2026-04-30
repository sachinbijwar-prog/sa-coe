# Best Practices & Design Patterns

## 1. Overview
Design patterns and best practices provide standardized solutions to recurring challenges in data engineering and warehouse architecture. Following these established patterns ensures that pipelines are scalable, maintainable, and robust against failures.

This document serves as a reference for the common architectural and development patterns used across the Smart Analytica CoE.

## 2. Architecture Context

```
[Standard Pipeline Pattern]

  Source ──▶ Landing (Raw) ──▶ Cleansing (Staging) ──▶ Integration (Curated) ──▶ Consumption (Mart)
```

**Common Patterns:**
- **Inbound Patterns**: Full Load, Incremental/Watermark Load, Change Data Capture (CDC).
- **Processing Patterns**: Bronze/Silver/Gold (Medallion), One Big Table (OBT).
- **Governance Patterns**: Gatekeeper (Validation), Data Quality Firewall.

## 3. Core Concepts

| Pattern | Description | Use Case |
|---|---|---|
| **Idempotency** | Re-running a process with the same input yields the same result without side effects. | Job recovery, backfilling data. |
| **Watermarking** | Using a timestamp/ID to track the last processed record. | Incremental batch loads. |
| **Medallion Architecture** | Progressively refining data through Raw (Bronze), Cleansed (Silver), and Curated (Gold) layers. | General Data Lakehouse design. |
| **Audit Columns** | Adding columns like `etl_load_ts`, `source_sys`, and `batch_id` to every table. | Traceability and debugging. |
| **Parameterization** | Using config files or variables instead of hardcoded values. | Multi-environment deployment (Dev/Prod). |

## 4. Detailed Design / Implementation

### Pattern: Idempotent Write (INSERT OVERWRITE)
Ensures that if a job fails mid-way, a re-run will overwrite the partial data rather than duplicating it.
```sql
-- Pattern: Write to a specific partition idempotently
INSERT OVERWRITE TABLE curated.fact_sales 
PARTITION (business_date = '2024-04-01')
SELECT 
    order_id, 
    customer_id, 
    total_amount, 
    current_timestamp() as etl_load_ts
FROM staging.stg_orders;
```

### Pattern: Watermark Management
Tracking high-watermarks in a control table.
```python
# Pseudo-code for watermark load
last_watermark = spark.sql("SELECT MAX(watermark) FROM ctrl.watermark_log WHERE table='trades'")
new_data = spark.read.jdbc(url, table).filter(f"updated_at > '{last_watermark}'")

if not new_data.isEmpty():
    new_data.write.save(...)
    new_max = new_data.select(max("updated_at")).collect()[0][0]
    spark.sql(f"INSERT INTO ctrl.watermark_log VALUES ('trades', '{new_max}')")
```

## 5. Best Practices
- **Design for Failure**: Assume components will fail; build automatic retries and alerts.
- **Decouple Storage and Compute**: Store data in open formats (Parquet/ORC) so different engines can access it.
- **Modular Code**: Break large ETL scripts into smaller, testable modules.
- **Documentation**: Comment code and maintain an up-to-date data dictionary.
- **Version Control**: Every script, HQL, and configuration must be in Git.

## 6. Common Issues & Troubleshooting
- **Hardcoding**: Causes failure when moving from Dev to Prod. *Solution: Use parameter files.*
- **Unbounded Growth**: Staging tables not being truncated. *Solution: Implement auto-cleanup.*
- **Shadow IT**: Undocumented "quick-fix" pipelines. *Solution: Strict governance and CI/CD.*

## 7. Performance & Optimization
- **Partitioning Strategy**: Align partitions with the most common query filters.
- **Avoid Small Files**: Compact staging and curated data regularly.
- **Lazy Evaluation**: Leverage Spark's lazy evaluation by chaining transformations efficiently.

## 8. Governance & Compliance
- **PII Handling**: Mask PII data as early as possible (at the Staging/Silver layer).
- **Lineage**: Ensure every new pipeline is registered in Apache Atlas.

## 9. Tools & Technologies
- **Processing**: Apache Spark, Apache Hive.
- **Orchestration**: Apache Airflow, Oozie.
- **Version Control**: Git (GitLab/GitHub).

## 10. Real-World Use Cases
- **Standardized Ingestion**: Using a single reusable Spark template for all JDBC source ingestions.
- **SCD Type 2 Implementation**: A conformed pattern for tracking customer address history.

## 11. References
- [Enterprise Data Lake Patterns](https://docs.cloudera.com)
- [Data Engineering Best Practices](https://github.com/check-style/data-engineering)
