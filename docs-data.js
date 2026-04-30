window.docsContent = {
  "docs/cloudera-overview.md": `# Cloudera Platform Overview

## 1. Overview
The Cloudera Data Platform (CDP) is a comprehensive hybrid cloud data platform that enables organizations to manage and analyze data across public clouds and private data centers. It provides integrated security, governance, and management for the entire data lifecycle.

## 2. Architecture Context
CDP is built on a containerized architecture, leveraging Kubernetes for orchestration. It consists of several key layers:
- **Cloudera Shared Data Experience (SDX)**: Centralized security and governance.
- **Cloudera Data Warehouse**: Specialized engine for BI and reporting.
- **Cloudera Data Engineering**: Managed Spark service for data processing.
- **Cloudera Machine Learning**: Collaborative workspace for data science.

## 3. Core Concepts
- **Environment**: A logical isolation of cloud resources (VPC, Subnets, etc.).
- **Data Lake**: The foundation of the environment, providing storage and basic services (HMS, Ranger, Atlas).
- **FreeIPA**: Provides identity management and Kerberos authentication.
- **Control Plane**: The management console for orchestrating all CDP services.

## 4. Detailed Design / Implementation
Implementing CDP involves:
1. **Cloud Provider Setup**: Provisioning necessary cloud infrastructure and IAM roles.
2. **Environment Activation**: Registering the cloud environment with the CDP Control Plane.
3. **Data Lake Creation**: Deploying the core security and storage services.
4. **Data Service Deployment**: Spin up specialized services (CDW, CDE, CML) as needed.

## 5. Best Practices
- **Auto-Scaling**: Configure auto-scaling for data services to optimize cost and performance.
- **Isolated Environments**: Use separate CDP environments for Dev, Test, and Prod.
- **Shared Data Experience**: Always leverage SDX for consistent security policies across services.

## 6. Common Issues & Troubleshooting
- **Kerberos Authentication Failures**: Check FreeIPA connectivity and keytab validity.
- **Environment Provisioning Errors**: Review cloud provider logs (e.g., AWS CloudFormation, Azure ARM) for resource limit or permission issues.

## 7. Performance & Optimization
- **Instance Selection**: Choose the right cloud instance types based on workload (Compute vs. Memory intensive).
- **Storage Tiering**: Utilize cloud-native storage features like S3 Intelligent-Tiering for cost efficiency.

## 8. Governance & Compliance
- **Apache Ranger**: Centralized policy management for access control.
- **Apache Atlas**: Metadata management and data lineage tracking.
- **Audit Logs**: Consolidate and monitor all service-level audits via the CDP audit service.

## 9. Tools & Technologies
- **CDP Public Cloud / Private Cloud**: The main platform offerings.
- **Cloudera Manager**: Administration tool for Private Cloud/Legacy clusters.
- **CDP CLI**: Command-line interface for automating platform operations.

## 10. Real-World Use Cases
- **Enterprise Data Lake**: Consolidating silos into a unified cloud-native platform.
- **Self-Service Analytics**: Providing data scientists with on-demand compute resources.

## 11. References
- [Cloudera Official Documentation](https://docs.cloudera.com)
- [CDP Architecture Deep Dive](https://www.cloudera.com/products/cloudera-data-platform.html)
`,
  "docs/data-ingestion.md": `# Data Ingestion Layer

## 1. Overview
The Data Ingestion Layer is the entry point of any enterprise data platform. It is responsible for reliably moving data from diverse source systems into the Data Lake in a timely, accurate, and auditable manner. Getting this layer right is foundational — poor ingestion design causes cascading failures in all downstream zones.

**Why it matters:** Data arriving late, incorrectly, or duplicated at this layer corrupts the entire DWH. The ingestion layer must handle schema drift, late-arriving data, partial loads, and network failures gracefully.

## 2. Architecture Context

\`\`\`
[Sources]                [Ingestion Tools]          [Landing Zone]
  Oracle/SQL Server  →→  Sqoop (JDBC batch)    →→  HDFS Raw Zone
  Kafka Topics       →→  Spark Streaming       →→  HDFS/S3 Raw Zone
  Flat Files (SFTP)  →→  NiFi / Shell Scripts  →→  HDFS Raw Zone
  REST APIs          →→  NiFi / Custom Spark   →→  HDFS Raw Zone
  Mainframe          →→  Informatica ETL       →→  HDFS Raw Zone
\`\`\`

**Ingestion Patterns:**
- **Full Load**: Extract entire source table every run (small reference tables)
- **Incremental/Delta Load**: Extract only changed records using watermark column
- **CDC (Change Data Capture)**: Stream-level capture of inserts/updates/deletes
- **Event-Driven**: Triggered by Kafka/Kinesis events in real time

## 3. Core Concepts

| Concept | Description |
|---|---|
| **Watermark Column** | A timestamp or sequence column used to identify new/changed records (e.g., \`last_updated_dt\`) |
| **High Watermark** | The maximum value of watermark from the last successful load |
| **Idempotency** | Re-running the same load produces the same result — essential for recovery |
| **At-Least-Once** | Data may be delivered more than once; downstream must deduplicate |
| **Exactly-Once** | Data delivered exactly once; harder to achieve, requires transactional guarantees |
| **Landing Zone** | Temporary holding area; raw data as-is from source |

## 4. Detailed Design / Implementation

### Sqoop Incremental Load (JDBC Sources)
\`\`\`bash
# First run: full load
sqoop import \\\\
  --connect "jdbc:oracle:thin:@//db-host:1521/ORCL" \\\\
  --username etl_user \\\\
  --password-file /secure/etl_password.txt \\\\
  --table TRADE_TRANSACTIONS \\\\
  --target-dir /warehouse/raw/trade_transactions \\\\
  --as-parquetfile \\\\
  --compress \\\\
  --compression-codec snappy \\\\
  --num-mappers 8

# Subsequent runs: incremental
sqoop import \\\\
  --connect "jdbc:oracle:thin:@//db-host:1521/ORCL" \\\\
  --username etl_user \\\\
  --password-file /secure/etl_password.txt \\\\
  --table TRADE_TRANSACTIONS \\\\
  --target-dir /warehouse/raw/trade_transactions \\\\
  --as-parquetfile \\\\
  --incremental lastmodified \\\\
  --check-column LAST_UPDATED_DT \\\\
  --last-value "2024-04-01 00:00:00" \\\\
  --merge-key TRADE_ID
\`\`\`

### Spark Streaming Ingestion (Kafka)
\`\`\`python
from pyspark.sql import SparkSession
from pyspark.sql.functions import col, from_json, current_timestamp
from pyspark.sql.types import StructType, StringType, LongType, TimestampType

spark = SparkSession.builder.appName("TradeIngestion").getOrCreate()

schema = StructType() \\\\
    .add("trade_id", StringType()) \\\\
    .add("instrument_id", StringType()) \\\\
    .add("quantity", LongType()) \\\\
    .add("price", StringType()) \\\\
    .add("trade_ts", TimestampType())

df = spark.readStream \\\\
    .format("kafka") \\\\
    .option("kafka.bootstrap.servers", "kafka-broker:9092") \\\\
    .option("subscribe", "nse.trades") \\\\
    .option("startingOffsets", "earliest") \\\\
    .load()

parsed = df.select(from_json(col("value").cast("string"), schema).alias("data")) \\\\
    .select("data.*") \\\\
    .withColumn("ingest_ts", current_timestamp()) \\\\
    .withColumn("load_date", col("trade_ts").cast("date"))

query = parsed.writeStream \\\\
    .format("parquet") \\\\
    .option("path", "/warehouse/raw/kafka_trades") \\\\
    .option("checkpointLocation", "/warehouse/checkpoints/kafka_trades") \\\\
    .partitionBy("load_date") \\\\
    .trigger(processingTime="5 minutes") \\\\
    .start()

query.awaitTermination()
\`\`\`

### Audit Tracking Table
\`\`\`sql
CREATE TABLE IF NOT EXISTS etl_ctrl.ingestion_log (
    log_id          BIGINT,
    table_name      STRING,
    load_type       STRING,  -- FULL / INCREMENTAL / CDC
    source_system   STRING,
    start_time      TIMESTAMP,
    end_time        TIMESTAMP,
    records_read    BIGINT,
    records_written BIGINT,
    records_rejected BIGINT,
    status          STRING,  -- SUCCESS / FAILED / PARTIAL
    error_message   STRING,
    watermark_value STRING
)
STORED AS ORC
LOCATION '/warehouse/ctrl/ingestion_log';
\`\`\`

## 5. Best Practices

- **Always use incremental loads** for tables > 1M rows
- **Idempotent design**: Landing zone writes must be rerunnable without duplicates
- **Watermark management**: Store high watermark in a control table after each successful run
- **Schema validation**: Validate source schema against expected schema before loading
- **File naming convention**: \`<table>_<yyyymmdd>_<hhmmss>_<batch_id>.parquet\`
- **Checksum validation**: Compare source record counts with landed counts in audit log
- **NiFi for file ingestion**: Use NiFi for SFTP-based file ingestion with built-in provenance

### Don'ts
- ❌ Don't hardcode watermark values in scripts
- ❌ Don't skip audit logging — it's mandatory for production
- ❌ Don't use \`overwrite\` mode on partitioned tables carelessly — may delete good data
- ❌ Don't ingest without schema validation — malformed data corrupts downstream

## 6. Common Issues & Troubleshooting

| Issue | Root Cause | Resolution |
|---|---|---|
| Duplicate records after re-run | Non-idempotent write mode | Use \`INSERT OVERWRITE\` partition or add dedup key |
| Sqoop job fails mid-way | Network timeout / large fetch | Reduce \`--fetch-size\`, add \`--num-mappers\` |
| Kafka consumer lag growing | Processing slower than produce rate | Increase Spark executors, optimize deserialization |
| Schema mismatch on ingest | Source column added/changed | Enable schema evolution; alert on schema drift |
| HDFS quota exceeded | Missing retention policy on raw zone | Implement TTL cleanup job on raw zone |

## 7. Performance & Optimization

- **Sqoop parallelism**: Use \`--num-mappers 8–16\` based on source DB capacity
- **Spark partitioning**: \`repartition()\` before write to control output file count
- **Kafka throughput**: Increase \`maxOffsetsPerTrigger\` for higher micro-batch throughput
- **NiFi back-pressure**: Configure back-pressure thresholds to prevent memory overflow
- **Compression**: Always use Snappy for speed; use Gzip for cold archive (better ratio)

## 8. Governance & Compliance

- **Data Source Registration**: Register every source system in Apache Atlas as a data source
- **Lineage Capture**: Atlas lineage must show raw → staging → curated flow
- **PII at Source**: Identify PII fields at ingestion; apply masking before writing to raw zone
- **Rejection Handling**: Rejected records must be written to a quarantine zone with error reason
- **SLA Tracking**: Track ingestion SLA (expected vs actual completion time) in control table

## 9. Tools & Technologies

| Tool | Best For |
|---|---|
| Apache Sqoop | JDBC batch ingestion from RDBMS |
| Apache Spark Streaming | High-throughput Kafka/event ingestion |
| Apache NiFi | File-based, SFTP, REST API ingestion |
| Informatica PowerCenter | Complex enterprise ETL with transformations |
| Apache Kafka | Event streaming backbone |
| Apache Flume | Log-based ingestion (legacy) |

## 10. Real-World Use Cases

**NSE Market Data Ingestion:**
- Kafka topics receive trade events at 50,000 msg/sec
- Spark Structured Streaming consumes, validates, and lands in HDFS raw zone partitioned by \`trade_date\`
- Checkpointing ensures exactly-once semantics during broker failover

**Banking EOD Batch:**
- Sqoop pulls 12 Oracle tables nightly using incremental watermark on \`LAST_MODIFIED_DATE\`
- Audit log compared against source record counts; alerts triggered on >0.1% variance

## 11. References

- [Apache Sqoop Documentation](https://sqoop.apache.org/docs/)
- [Apache Spark Structured Streaming](https://spark.apache.org/docs/latest/structured-streaming-programming-guide.html)
- [Apache NiFi Documentation](https://nifi.apache.org/docs.html)
- [Apache Kafka Documentation](https://kafka.apache.org/documentation/)
- [Cloudera Ingestion Best Practices](https://docs.cloudera.com/best-practices/latest/index.html)
`,
  "docs/data-modeling.md": `# Data Modeling Standards

## 1. Overview
Data Modeling is the process of defining the structure, relationships, and constraints of data stored in a data warehouse. A well-defined data model ensures consistency, performance, and maintainability across all development teams. This document establishes the standards for schema design on Cloudera-based platforms.

## 2. Architecture Context
Data models exist at multiple layers of the DWH:
- **Conceptual Model**: Entity-Relationship (ER) diagrams at business level
- **Logical Model**: Normalized/denormalized table designs without physical details
- **Physical Model**: Actual DDL with Hive/Impala-specific syntax, partitioning, and file formats

## 3. Core Concepts

### Modeling Patterns

| Pattern | Use Case | Pros | Cons |
|---|---|---|---|
| **Star Schema** | BI Reporting, Dashboards | Fast queries, simple JOINs | Data redundancy |
| **Snowflake Schema** | Complex hierarchies | Normalized, saves storage | More JOINs, slower queries |
| **Data Vault** | Audit-heavy, agile DWH | Scalable, audit trail | Complex, higher latency |
| **One Big Table (OBT)** | Self-service analytics | Fastest queries | Maintenance overhead |

### SCD Types

| Type | Behavior | Example |
|---|---|---|
| **Type 1** | Overwrite old value | Correcting a typo in a name |
| **Type 2** | Add new row with version | Customer address change with history |
| **Type 3** | Add a new column | Store previous + current value |

## 4. Detailed Design / Implementation

### Naming Conventions

\`\`\`
Tables:       <layer>_<domain>_<entity>
              e.g., curated_finance_transaction
              
Columns:      snake_case, no abbreviations
              e.g., customer_id, effective_date, is_active
              
Partitions:   Always date-based: load_date, business_date
              
Surrogate Keys: <entity>_sk (e.g., customer_sk)
Natural Keys:   <entity>_id (e.g., customer_id)
\`\`\`

### Standard Dimension Table (Hive DDL)
\`\`\`sql
CREATE EXTERNAL TABLE curated.dim_customer (
    customer_sk     BIGINT COMMENT 'Surrogate key',
    customer_id     STRING COMMENT 'Natural key from source',
    full_name       STRING,
    date_of_birth   DATE,
    segment         STRING,
    city            STRING,
    state           STRING,
    effective_date  DATE    COMMENT 'SCD2 start date',
    expiry_date     DATE    COMMENT 'SCD2 end date, NULL if current',
    is_current      BOOLEAN COMMENT 'SCD2 current flag',
    etl_batch_id    BIGINT  COMMENT 'Load tracking'
)
PARTITIONED BY (load_date STRING)
STORED AS PARQUET
LOCATION '/warehouse/curated/dim_customer'
TBLPROPERTIES (
    'parquet.compress'='SNAPPY',
    'comment'='Customer dimension with SCD Type 2'
);
\`\`\`

### Standard Fact Table (Hive DDL)
\`\`\`sql
CREATE EXTERNAL TABLE curated.fact_trade (
    trade_sk            BIGINT,
    customer_sk         BIGINT  COMMENT 'FK to dim_customer',
    instrument_sk       BIGINT  COMMENT 'FK to dim_instrument',
    trade_date_sk       INT     COMMENT 'FK to dim_date',
    trade_id            STRING,
    quantity            DECIMAL(18,4),
    price               DECIMAL(18,6),
    trade_value         DECIMAL(22,6),
    settlement_amount   DECIMAL(22,6),
    brokerage           DECIMAL(18,4),
    etl_batch_id        BIGINT
)
PARTITIONED BY (trade_date STRING)
STORED AS PARQUET
LOCATION '/warehouse/curated/fact_trade'
TBLPROPERTIES ('parquet.compress'='SNAPPY');
\`\`\`

## 5. Best Practices

- **Surrogate Keys**: Always use system-generated surrogate keys; never rely on source natural keys as join keys
- **Partitioning Strategy**: Partition all large fact tables by business date; avoid high-cardinality partition columns
- **Column Comments**: Every column must have a COMMENT describing its business meaning
- **NOT NULL Enforcement**: Enforce through ETL validation; Hive does not enforce constraints natively
- **Consistent Data Types**: Standardize decimal precision across domains (e.g., DECIMAL(18,4) for amounts)
- **Date Dimension**: Always use an integer surrogate for date FKs (e.g., YYYYMMDD as INT)

### Don'ts
- ❌ Don't use VARCHAR/CHAR (Hive uses STRING)
- ❌ Don't create unbucketed tables for large JOIN operations
- ❌ Don't store computed/derived columns that can be calculated at query time
- ❌ Don't use reserved words as column names

## 6. Common Issues & Troubleshooting

| Issue | Cause | Resolution |
|---|---|---|
| Duplicate dimension records | Missing SCD2 dedup logic | Add \`ROW_NUMBER() OVER (PARTITION BY natural_key ORDER BY load_date DESC)\` |
| Partition explosion | Too granular partition column | Use year/month/day hierarchy or daily partitions only |
| Schema mismatch errors | Column type changes in source | Implement schema evolution via ALTER TABLE ADD COLUMNS |
| Orphaned fact records | Dimension not yet loaded | Implement load sequencing: dimensions before facts |

## 7. Performance & Optimization

- **Bucket JOIN optimization**: Bucket fact and dimension tables on the same join key and count
- **Partition pruning**: Ensure queries always filter on partition columns
- **Columnar storage**: Parquet/ORC provides 5–10x compression and selective column reads
- **Impala Stats**: \`COMPUTE STATS\` after each load improves query plan accuracy by 30–60%

## 8. Governance & Compliance

- **Data Dictionary**: Every table must be registered in Apache Atlas with business descriptions
- **PII Tagging**: Tag columns containing personal data (Name, DOB, Contact) in Atlas
- **Schema Review**: All new tables require CoE architecture review before deployment
- **Change Management**: Schema changes go through formal change request with impact assessment

## 9. Tools & Technologies

| Tool | Purpose |
|---|---|
| Apache Hive | DDL management and batch processing |
| Apache Impala | Low-latency query execution |
| Apache Atlas | Data dictionary and lineage |
| erwin Data Modeler | Logical/Physical modeling |
| DbVisualizer | Schema exploration and documentation |

## 10. Real-World Use Cases

**NSE/BSE Trade Data:**
- Star schema with fact_trade at center, dimensions: dim_instrument, dim_customer, dim_date, dim_exchange
- SCD Type 2 on dim_customer for regulatory audit requirements

**Banking Core System:**
- Account hierarchy modeled as snowflake for product-level reporting
- Data Vault for auditability on customer master data changes

## 11. References

- [Apache Hive DDL](https://cwiki.apache.org/confluence/display/Hive/LanguageManual+DDL)
- [Cloudera Data Modeling Guide](https://docs.cloudera.com/best-practices/latest/index.html)
- [Kimball Group Dimensional Modeling Techniques](https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/kimball-techniques/dimensional-modeling-techniques/)
- [Apache Parquet Format](https://parquet.apache.org/docs/)
`,
  "docs/data-quality.md": `# Data Quality & Validation Framework

## 1. Overview
Data Quality (DQ) is the measure of data's fitness for its intended purpose across dimensions of accuracy, completeness, consistency, timeliness, and validity. In enterprise data warehouses, poor data quality leads to incorrect business decisions, regulatory non-compliance, and erosion of stakeholder trust in the platform.

The **Data Quality & Validation Framework (DQVF)** provides a standardized, automated approach to detecting, reporting, and resolving data quality issues across all DWH layers.

## 2. Architecture Context

\`\`\`
[Source Data]
     │
     ▼
[Ingestion Layer]
     │
     ▼
[DQ Gate 1: Raw Validation]     ← Schema, null, format checks
     │
     ├── PASS → [Staging Zone]
     └── FAIL → [Quarantine Zone] + [DQ Alert]
                       │
                       ▼
              [DQ Gate 2: Business Rules]  ← Referential integrity, range, uniqueness
                       │
                       ├── PASS → [Curated Zone]
                       └── FAIL → [Reject Table] + [DQ Report]
                                        │
                                        ▼
                               [DQ Dashboard] (Impala / BI Tool)
\`\`\`

## 3. Core Concepts

### DQ Dimensions

| Dimension | Definition | Example Check |
|---|---|---|
| **Completeness** | No missing required values | \`trade_id IS NOT NULL\` |
| **Accuracy** | Values match real-world facts | \`price > 0 AND price < 100000\` |
| **Consistency** | Same data means the same thing across tables | \`customer_id in dim_customer\` |
| **Timeliness** | Data arrives within expected SLA | \`load_date = current_date\` |
| **Uniqueness** | No duplicate records for primary keys | \`COUNT(DISTINCT trade_id) = COUNT(trade_id)\` |
| **Validity** | Values conform to defined format/domain | \`email LIKE '%@%.%'\` |
| **Referential Integrity** | FK values exist in referenced table | \`customer_sk IN (SELECT customer_sk FROM dim_customer)\` |

## 4. Detailed Design / Implementation

### DQ Rule Definition Table
\`\`\`sql
CREATE TABLE dq_ctrl.dq_rules (
    rule_id         INT,
    table_name      STRING,
    column_name     STRING,
    rule_type       STRING,  -- NULL_CHECK, RANGE, FORMAT, UNIQUENESS, REFERENTIAL
    rule_expression STRING,  -- SQL expression to evaluate
    threshold_pct   DECIMAL(5,2),  -- Acceptable failure % (e.g., 0.01%)
    severity        STRING,  -- CRITICAL / HIGH / MEDIUM / LOW
    is_active       BOOLEAN,
    created_by      STRING,
    created_dt      TIMESTAMP
)
STORED AS ORC
LOCATION '/warehouse/ctrl/dq_rules';
\`\`\`

### DQ Results Log Table
\`\`\`sql
CREATE TABLE dq_ctrl.dq_results (
    result_id       BIGINT,
    rule_id         INT,
    table_name      STRING,
    load_date       STRING,
    batch_id        BIGINT,
    total_records   BIGINT,
    failed_records  BIGINT,
    failure_pct     DECIMAL(8,4),
    threshold_pct   DECIMAL(5,2),
    status          STRING,  -- PASS / FAIL / WARN
    run_ts          TIMESTAMP
)
STORED AS ORC
LOCATION '/warehouse/ctrl/dq_results';
\`\`\`

### PySpark DQ Validation Engine
\`\`\`python
from pyspark.sql import SparkSession
from pyspark.sql.functions import col, count, when, isnan, isnull, lit, current_timestamp
from datetime import date

spark = SparkSession.builder.appName("DQValidation").getOrCreate()

def run_dq_checks(table_name: str, load_date: str, batch_id: int):
    df = spark.table(table_name).filter(f"load_date = '{load_date}'")
    total = df.count()
    results = []

    # Check 1: Null check on critical columns
    null_count = df.filter(
        col("trade_id").isNull() | col("customer_sk").isNull()
    ).count()
    
    results.append({
        "rule": "NULL_CHECK_CRITICAL_COLS",
        "table": table_name,
        "total": total,
        "failed": null_count,
        "failure_pct": (null_count / total * 100) if total > 0 else 0,
        "threshold_pct": 0.0,  # Zero tolerance
        "status": "FAIL" if null_count > 0 else "PASS"
    })

    # Check 2: Range check on price
    invalid_price = df.filter(
        (col("price") <= 0) | (col("price") > 1000000)
    ).count()
    
    results.append({
        "rule": "RANGE_CHECK_PRICE",
        "table": table_name,
        "total": total,
        "failed": invalid_price,
        "failure_pct": (invalid_price / total * 100) if total > 0 else 0,
        "threshold_pct": 0.01,  # 0.01% tolerance
        "status": "FAIL" if (invalid_price / total * 100) > 0.01 else "PASS"
    })

    # Check 3: Uniqueness on trade_id
    unique_count = df.select("trade_id").distinct().count()
    dup_count = total - unique_count
    
    results.append({
        "rule": "UNIQUENESS_TRADE_ID",
        "table": table_name,
        "total": total,
        "failed": dup_count,
        "failure_pct": (dup_count / total * 100) if total > 0 else 0,
        "threshold_pct": 0.0,
        "status": "FAIL" if dup_count > 0 else "PASS"
    })

    # Check 4: Referential integrity
    dim_customer_ids = spark.table("curated.dim_customer") \\\\
        .filter("is_current = true") \\\\
        .select("customer_sk")
    
    orphan_count = df.join(dim_customer_ids, on="customer_sk", how="left_anti").count()
    
    results.append({
        "rule": "REF_INTEGRITY_CUSTOMER",
        "table": table_name,
        "total": total,
        "failed": orphan_count,
        "failure_pct": (orphan_count / total * 100) if total > 0 else 0,
        "threshold_pct": 0.0,
        "status": "FAIL" if orphan_count > 0 else "PASS"
    })

    return results

# Run checks and log results
results = run_dq_checks("curated.fact_trade", str(date.today()), 1234)

# Check for critical failures
critical_failures = [r for r in results if r["status"] == "FAIL" and r["failure_pct"] > r["threshold_pct"]]
if critical_failures:
    raise Exception(f"DQ CRITICAL FAILURE: {critical_failures}")
\`\`\`

### Reconciliation Check (Source vs Target)
\`\`\`python
def reconcile_counts(source_query: str, target_query: str, tolerance_pct: float = 0.001):
    """Compare record counts between source and target."""
    source_count = spark.sql(source_query).collect()[0][0]
    target_count = spark.sql(target_query).collect()[0][0]
    
    variance = abs(source_count - target_count) / source_count * 100
    status = "PASS" if variance <= tolerance_pct else "FAIL"
    
    print(f"Source: {source_count} | Target: {target_count} | Variance: {variance:.4f}% | Status: {status}")
    return status

reconcile_counts(
    "SELECT COUNT(*) FROM source_db.trades WHERE trade_date = '2024-04-01'",
    "SELECT COUNT(*) FROM curated.fact_trade WHERE trade_date = '2024-04-01'",
    tolerance_pct=0.001
)
\`\`\`

## 5. Best Practices

- **DQ gates at every layer**: Raw → Staging → Curated — each transition must pass DQ checks
- **Zero tolerance for critical columns**: NULL on primary/foreign keys = pipeline halt
- **Parameterized thresholds**: Store acceptable failure percentages in config table
- **Quarantine, don't discard**: Failed records go to quarantine zone for investigation
- **DQ reporting**: Publish daily DQ dashboard visible to data owners and consumers
- **Rule versioning**: Track changes to DQ rules with effective dates
- **Automate alerts**: Email/Slack notification when DQ failure exceeds threshold

### Don'ts
- ❌ Don't let bad data silently pass into the curated zone
- ❌ Don't apply the same threshold to all tables — critical tables need stricter rules
- ❌ Don't delete rejected records — move to quarantine with full context
- ❌ Don't run DQ checks without logging results — lose auditability

## 6. Common Issues & Troubleshooting

| Issue | Root Cause | Resolution |
|---|---|---|
| DQ check takes longer than load | Full table scan for referential check | Partition-wise incremental DQ check |
| False positives on NULL check | Optional fields treated as mandatory | Review rule definition; adjust column list |
| Source count mismatch | Late-arriving records, timezone differences | Add 1-hour buffer window for reconciliation |
| Quarantine zone growing unboundedly | No cleanup process | Implement 30-day TTL on quarantine zone |

## 7. Performance & Optimization

- **Partition-level DQ**: Only check the newly loaded partition, not full table
- **Sampling for large datasets**: Use statistical sampling (1% sample) for range/format checks on 100M+ records
- **Parallel rule execution**: Run independent DQ rules concurrently using multi-threading
- **Pre-compute counts**: Cache record counts in DQ control table to avoid re-scanning

## 8. Governance & Compliance

- **Data Stewardship**: Assign a data owner per domain responsible for DQ SLAs
- **DQ SLA**: Define and track DQ SLA (e.g., <0.01% null rate, 100% referential integrity)
- **Audit Trail**: All DQ rule executions and results logged with timestamp, batch ID, user
- **Regulatory Compliance**: For RBI/SEBI reporting, zero-tolerance DQ rules on regulatory fields
- **Atlas Integration**: Register DQ rules and results as Atlas entities for governance visibility

## 9. Tools & Technologies

| Tool | Purpose |
|---|---|
| PySpark / Spark SQL | Custom DQ rule execution at scale |
| Apache Griffin | Open-source DQ platform on Hadoop |
| Great Expectations | Python DQ framework with data docs |
| Cloudera Data Quality | CDP-native DQ monitoring |
| Hive/Impala | DQ result reporting and dashboards |
| Apache Atlas | DQ metadata and lineage tagging |

## 10. Real-World Use Cases

**NSE Trade Data Quality:**
- 22 DQ rules across 8 tables run post-ingestion nightly
- Zero tolerance on trade_id, instrument_id, and settlement_amount
- DQ failure rate dashboard reviewed by Data Governance committee monthly

**Banking CIBIL Reporting:**
- Referential integrity checks ensure all accounts map to valid customer records
- DQ gate blocks any file where >0.001% records fail customer reference check
- Full audit log maintained for RBI inspection readiness

## 11. References

- [Apache Griffin DQ Platform](https://griffin.apache.org/)
- [Great Expectations Documentation](https://docs.greatexpectations.io/)
- [Cloudera Data Quality](https://docs.cloudera.com/data-catalog/cloud/index.html)
- [DAMA Data Quality Dimensions](https://www.dama.org/)
- [SEBI Data Quality Requirements](https://www.sebi.gov.in/)
`,
  "docs/dwh-overview.md": `# DWH Architectural Overview

## 1. Overview
A Data Warehouse (DWH) is a centralized repository for structured, historical data from multiple operational sources. In enterprise environments, it serves as the single source of truth for business intelligence and analytical reporting. Unlike OLTP systems optimized for transactions, a DWH is optimized for complex queries across large datasets.

**Why it matters:** Organizations running on Cloudera Data Platform (CDP) need a clearly defined DWH architecture to ensure scalability, governance, and efficient data consumption by downstream BI tools like SAP BusinessObjects, Tableau, and Power BI.

## 2. Architecture Context

\`\`\`
[Source Systems]          [Ingestion Layer]        [Storage Layers]         [Consumption]
  - Oracle DB      →→→    Apache Kafka        →→→  Raw Zone (HDFS/S3)  →→→  Impala/Hive
  - Flat Files     →→→    Informatica ETL     →→→  Curated Zone        →→→  BI Tools
  - APIs           →→→    Apache NiFi         →→→  Marts/Serving Zone  →→→  Reports/Dashboards
  - Mainframe      →→→    Sqoop/Spark         →→→  Archive Zone
\`\`\`

**Key Zones:**
- **Raw Zone**: Immutable copy of source data in original format
- **Staging Zone**: Cleansed, validated data ready for transformation
- **Curated/Integrated Zone**: Business-rule-applied, conformed data
- **Mart/Serving Zone**: Subject-area specific, aggregated data for BI
- **Archive Zone**: Historical data for compliance and retention

## 3. Core Concepts

| Concept | Description |
|---|---|
| **Star Schema** | Central fact table linked to dimension tables; optimized for query performance |
| **Snowflake Schema** | Normalized dimensions; saves storage but adds JOIN complexity |
| **ODS (Operational Data Store)** | Near-real-time staging area for operational reporting |
| **Slowly Changing Dimensions (SCD)** | Strategy for managing historical changes in dimension data (Type 1, 2, 3) |
| **Partitioning** | Dividing tables by date/region to optimize query pruning |
| **Bucketing** | Hashing data into buckets for efficient JOINs in Hive |

**Technology Mapping:**
- **Storage**: HDFS, Azure Data Lake Storage Gen2, S3
- **Processing**: Apache Spark, Apache Hive, Apache Impala
- **Orchestration**: Apache Oozie, Apache Airflow
- **Metadata**: Apache Atlas, Hive Metastore
- **Security**: Apache Ranger, Kerberos

## 4. Detailed Design / Implementation

### Layer Design Standards

**Raw Zone:**
- File format: ORC or Parquet (compress with Snappy)
- Partitioned by: \`load_date\`
- Retention: Full history, no deletion
- Access: ETL/ELT service accounts only

**Curated Zone:**
- Apply business rules, data quality checks
- SCD Type 2 for slowly changing dimensions
- Partition by: business date
- Register in Apache Atlas for lineage

**Mart/Serving Zone:**
- Pre-aggregated tables for specific business domains (Finance, Risk, Sales)
- Materialized as Impala external tables
- Statistics updated after each load: \`COMPUTE STATS table_name;\`

### Standard Table Creation Pattern (Hive)
\`\`\`sql
CREATE EXTERNAL TABLE IF NOT EXISTS curated.customer (
    customer_id     BIGINT,
    full_name       STRING,
    email           STRING,
    segment         STRING,
    effective_date  DATE,
    expiry_date     DATE,
    is_current      BOOLEAN
)
PARTITIONED BY (load_date STRING)
STORED AS PARQUET
LOCATION '/warehouse/curated/customer'
TBLPROPERTIES ('parquet.compress'='SNAPPY');
\`\`\`

## 5. Best Practices

- **Design for queries, not inserts**: Denormalize selectively for analytical performance
- **Partition pruning**: Always filter on partition columns in WHERE clauses
- **Avoid small files**: Compact files regularly; target 128MB–1GB per file
- **Use Parquet/ORC**: Always store curated data in columnar format
- **Incremental loads**: Prefer incremental over full loads for large tables
- **Metadata-driven ETL**: Drive pipeline logic from config tables, not hardcoded logic

### Don'ts
- ❌ Don't store raw JSON in structured tables
- ❌ Don't create tables without partition strategy
- ❌ Don't skip COMPUTE STATS after major data loads in Impala
- ❌ Don't mix raw and curated data in the same zone

## 6. Common Issues & Troubleshooting

| Issue | Root Cause | Resolution |
|---|---|---|
| Slow Impala queries | Missing table statistics | \`COMPUTE STATS <table>\` |
| OOM errors in Spark | Large shuffles without partitioning | Increase \`spark.sql.shuffle.partitions\` |
| Schema evolution failures | Mismatched column types | Use \`MERGE SCHEMA\` in Parquet reads |
| Duplicate records | Missing deduplication logic | Add \`ROW_NUMBER()\` dedup pattern |

## 7. Performance & Optimization

- **Columnar Formats**: Parquet/ORC reduce I/O by 60–80% vs. CSV
- **Partition Pruning**: Filter on partition key eliminates full table scans
- **Impala Statistics**: Always run \`COMPUTE STATS\` after bulk loads
- **Spark Broadcast Joins**: Use \`broadcast()\` hint for small dimension tables
- **Caching in Impala**: \`ALTER TABLE ... SET CACHED\` for frequently hit tables

## 8. Governance & Compliance

- **Column-Level Security**: Use Ranger policies to mask PII fields (e.g., Aadhaar, PAN, Email)
- **Row-Level Filtering**: Restrict data access by region or business unit using Ranger row filters
- **Audit Logging**: Enable Atlas audit logging for all DDL/DML operations
- **Data Classification**: Tag sensitive columns in Atlas (PII, SENSITIVE, CONFIDENTIAL)
- **Retention Policy**: Define retention rules per zone; automate archival to cold storage

## 9. Tools & Technologies

| Tool | Purpose |
|---|---|
| Apache Hive | SQL-on-Hadoop; batch ETL and DDL management |
| Apache Impala | Low-latency SQL for BI queries |
| Apache Spark | Distributed processing for complex transformations |
| Apache Atlas | Metadata management and lineage |
| Apache Ranger | Fine-grained access control |
| Apache Oozie | Workflow scheduling |
| Apache NiFi | Data flow ingestion |

## 10. Real-World Use Cases

**Banking / NSE:**
- Intraday trade data ingested from NSE feeds → Raw Zone → Curated with position enrichment → Reporting mart for risk dashboards
- SCD Type 2 on customer profile to maintain full audit history for regulatory compliance

**Enterprise Migration:**
- Teradata to Cloudera migration: Schema redesign from Teradata-specific constructs to Hive/Impala compatible DDL with zone restructuring

## 11. References

- [Apache Hive Documentation](https://hive.apache.org/)
- [Apache Impala Documentation](https://impala.apache.org/)
- [Cloudera DWH Reference Architecture](https://docs.cloudera.com/best-practices/latest/impala-performance/index.html)
- [Apache Atlas](https://atlas.apache.org/)
- [Parquet Format Specification](https://parquet.apache.org/docs/)
`,
  "docs/etl-transformation.md": `# ETL/ELT Transformation Layer

## 1. Overview
The Transformation Layer converts raw, ingested data into clean, business-rule-applied, analysis-ready datasets. It sits between the Raw/Staging zone and the Curated/Mart zones. This layer is where business logic, data quality rules, joins, aggregations, and SCD processing are applied.

**ETL vs ELT:**
- **ETL (Extract-Transform-Load)**: Transform happens outside the warehouse (Informatica, SSIS). Better for complex logic, small-medium volumes.
- **ELT (Extract-Load-Transform)**: Load raw first, then transform inside the platform using Spark/Hive SQL. Better for large-scale cloud DWH.

Modern Cloudera platforms favour **ELT** using Spark for the heavy lifting and Hive/Impala for SQL-based transformations.

## 2. Architecture Context

\`\`\`
[Raw Zone]          [Staging]           [Curated Zone]       [Mart Zone]
  Raw Parquet   →→  Cleansing       →→  Conformed dims   →→  Domain marts
  As-is source  →→  Validation      →→  Fact tables      →→  Aggregations
                →→  Deduplication   →→  SCD processing   →→  BI-ready views
                →→  Type casting    →→  Business rules
\`\`\`

**Execution Engines:**
- **Apache Spark**: Complex multi-step transformations, ML feature engineering
- **Hive SQL**: SQL-based transformations, simpler business rule application
- **Informatica**: Complex mappings with built-in transformations

## 3. Core Concepts

| Concept | Description |
|---|---|
| **Staging Table** | Intermediate table holding cleansed, validated data before curated load |
| **Lookup Transformation** | Enriching records by joining to reference/dimension data |
| **SCD Type 2 Processing** | Tracking historical changes with effective/expiry dates |
| **Deduplication** | Removing duplicate records using ROW_NUMBER() window function |
| **Surrogate Key Generation** | Assigning system-generated unique identifiers |
| **Null Handling** | Replacing NULLs with defaults per business rules |

## 4. Detailed Design / Implementation

### Standard Spark Transformation Pattern
\`\`\`python
from pyspark.sql import SparkSession
from pyspark.sql.functions import (
    col, trim, upper, coalesce, lit, 
    row_number, current_timestamp, to_date
)
from pyspark.sql.window import Window

spark = SparkSession.builder.appName("CustomerTransform").getOrCreate()

# Read from raw zone
raw_df = spark.read.parquet("/warehouse/raw/customer/load_date=2024-04-01/")

# Step 1: Cleanse and standardize
cleansed_df = raw_df \\\\
    .withColumn("full_name", trim(upper(col("full_name")))) \\\\
    .withColumn("email", trim(col("email"))) \\\\
    .withColumn("segment", coalesce(col("segment"), lit("UNCLASSIFIED"))) \\\\
    .withColumn("date_of_birth", to_date(col("dob_str"), "dd/MM/yyyy")) \\\\
    .filter(col("customer_id").isNotNull())

# Step 2: Deduplicate — keep latest record per customer_id
window_spec = Window.partitionBy("customer_id").orderBy(col("last_updated_dt").desc())
dedup_df = cleansed_df \\\\
    .withColumn("rn", row_number().over(window_spec)) \\\\
    .filter(col("rn") == 1) \\\\
    .drop("rn")

# Step 3: Enrich — join to segment reference table
segment_ref = spark.table("curated.ref_segment")
enriched_df = dedup_df.join(segment_ref, on="segment", how="left")

# Step 4: Write to staging zone
enriched_df.write \\\\
    .mode("overwrite") \\\\
    .parquet("/warehouse/staging/customer/load_date=2024-04-01/")

print(f"Records written: {enriched_df.count()}")
\`\`\`

### SCD Type 2 Processing with Spark
\`\`\`python
from delta.tables import DeltaTable  # or use merge logic in Hive

# Load existing curated dimension
existing = spark.table("curated.dim_customer").filter(col("is_current") == True)

# Load new staging records
incoming = spark.table("staging.customer_stg")

# Identify changed records
changed = incoming.join(
    existing.select("customer_id", "full_name", "segment", "city"),
    on="customer_id", how="left"
).filter(
    (col("full_name") != col("existing.full_name")) |
    (col("segment") != col("existing.segment"))
)

# Expire old records
# ... (update is_current=False, expiry_date=today on changed records)

# Insert new current records
# ... (insert with effective_date=today, expiry_date=NULL, is_current=True)
\`\`\`

### Standard SQL Transformation (Hive/Impala)
\`\`\`sql
-- Load Mart: Daily Trade Summary by Segment
INSERT OVERWRITE TABLE mart.daily_trade_summary
PARTITION (summary_date = '2024-04-01')
SELECT
    dc.segment,
    di.instrument_type,
    COUNT(DISTINCT ft.trade_id)    AS trade_count,
    SUM(ft.trade_value)            AS total_value,
    AVG(ft.trade_value)            AS avg_trade_value,
    SUM(ft.brokerage)              AS total_brokerage,
    CURRENT_TIMESTAMP()            AS etl_ts
FROM curated.fact_trade ft
JOIN curated.dim_customer   dc ON ft.customer_sk = dc.customer_sk AND dc.is_current = TRUE
JOIN curated.dim_instrument di ON ft.instrument_sk = di.instrument_sk
WHERE ft.trade_date = '2024-04-01'
GROUP BY dc.segment, di.instrument_type;
\`\`\`

## 5. Best Practices

- **Idempotent transforms**: Use \`INSERT OVERWRITE\` on partition — re-runnable safely
- **Single responsibility**: Each transformation script handles one domain/entity
- **Configuration-driven**: Drive business rules from config/parameter tables, not code
- **Lineage capture**: Register each transformation step in Apache Atlas
- **Error quarantine**: Route failed records to a reject table with error code and message
- **Audit counters**: Log input/output/rejected counts for every transformation step
- **Modular pipelines**: Break large pipelines into smaller, independently re-runnable steps

### Don'ts
- ❌ Don't apply business logic in the ingestion layer
- ❌ Don't hard-code dates, thresholds, or business constants
- ❌ Don't skip deduplication — always assume source has duplicates
- ❌ Don't write directly to the Mart zone without going through Staging → Curated

## 6. Common Issues & Troubleshooting

| Issue | Root Cause | Resolution |
|---|---|---|
| Transformation OOM | Large cross joins or no partition pushdown | Add broadcast hints; filter early in pipeline |
| Data skew in Spark | Hot partition keys (e.g., one segment has 80% data) | Use \`salting\` technique on skewed keys |
| SCD2 logic creating duplicates | Race condition in concurrent runs | Implement locking via control table flag |
| NULL propagation | Missing COALESCE/NVL logic | Add explicit NULL handling for every nullable field |
| Wrong record counts after transform | Incorrect JOIN type (INNER vs LEFT) | Audit JOIN cardinality before deploying |

## 7. Performance & Optimization

- **Filter early**: Apply all \`WHERE\` filters as early as possible in the pipeline
- **Broadcast small tables**: Use \`broadcast()\` for lookup/reference tables < 100MB
- **Partition correctly**: Repartition output by the write partition column before writing
- **Avoid UDFs**: Use native Spark SQL functions — UDFs break vectorization
- **Persist intermediate DFs**: Use \`df.cache()\` for DataFrames reused in multiple steps
- **Columnar pushdown**: When reading Parquet/ORC, select only required columns

## 8. Governance & Compliance

- **Atlas Lineage**: Every transformation must produce a lineage entry from source to target
- **Data Quality Gate**: Validate row counts and null rates before promoting to curated zone
- **Change Tracking**: All transformation logic changes go through Git version control
- **Audit Columns**: Every curated table must have \`etl_batch_id\`, \`etl_ts\`, \`source_system\`
- **PII Masking**: Apply masking transformations to PII columns before writing to accessible zones

## 9. Tools & Technologies

| Tool | Purpose |
|---|---|
| Apache Spark (PySpark) | Large-scale distributed transformations |
| Hive SQL (Tez/LLAP) | SQL-based ELT transformations |
| Informatica PowerCenter | Complex ETL mappings with GUI |
| Apache Oozie | Workflow orchestration of transformation jobs |
| Apache Airflow | Modern DAG-based pipeline orchestration |
| dbt (Data Build Tool) | SQL-first transformation framework |

## 10. Real-World Use Cases

**NSE Clearing & Settlement:**
- Spark ELT processes 8M trade records daily
- SCD Type 2 on 5 dimensions tracks regulatory audit history
- Data quality gate rejects records with missing settlement amounts

**Banking Regulatory Reporting:**
- Informatica mappings apply 200+ business rules for RBI reporting
- Configuration table drives which rules apply per product type
- Full lineage captured in Atlas for regulatory audit

## 11. References

- [Apache Spark SQL Guide](https://spark.apache.org/docs/latest/sql-programming-guide.html)
- [PySpark Transformation Cookbook](https://spark.apache.org/docs/latest/api/python/index.html)
- [Hive LanguageManual DML](https://cwiki.apache.org/confluence/display/Hive/LanguageManual+DML)
- [dbt Documentation](https://docs.getdbt.com/)
- [Informatica PowerCenter Transformations](https://docs.informatica.com/data-integration/powercenter/10-5/transformation-guide.html)
`,
  "docs/hive-impala-perf.md": `# Hive & Impala Performance Best Practices

## 1. Overview
Apache Hive and Apache Impala are the two primary SQL engines in a Cloudera-based Data Warehouse. Hive is optimized for batch ETL processing; Impala delivers low-latency interactive SQL for BI and reporting. Understanding when and how to use each — and how to tune both — is critical for platform performance.

## 2. Architecture Context

\`\`\`
[ETL / Batch]          [Interactive BI]
  Apache Hive    →     Apache Impala
  (LLAP/Tez)           (Native C++ engine)
       ↓                      ↓
  [Hive Metastore - Shared Schema]
       ↓
  [HDFS / S3 / ADLS - Shared Storage]
\`\`\`

Both engines share the **Hive Metastore**, meaning tables created in Hive are immediately accessible in Impala (after \`INVALIDATE METADATA\`).

## 3. Core Concepts

### Hive Execution Engines

| Engine | Use Case | Performance |
|---|---|---|
| **MapReduce** | Legacy; avoid for new workloads | Slow |
| **Tez** | Batch ETL, complex transformations | Good |
| **LLAP** | Interactive Hive queries | Fast |

### Impala Key Concepts
- **Catalog Service**: Central metadata store; must be refreshed after Hive DDL changes
- **Statestore**: Tracks live Impala daemon health
- **Query Profile**: Per-query execution plan with timing per node — essential for tuning
- **Runtime Filters**: Impala's broadcast hash join filters that eliminate rows at scan time

## 4. Detailed Design / Implementation

### Hive Optimization Settings
\`\`\`sql
-- Enable Tez execution
SET hive.execution.engine=tez;

-- Enable vectorization (columnar batch processing)
SET hive.vectorized.execution.enabled=true;
SET hive.vectorized.execution.reduce.enabled=true;

-- Enable Cost-Based Optimizer (requires ANALYZE TABLE)
SET hive.cbo.enable=true;
SET hive.compute.query.using.stats=true;
SET hive.stats.fetch.column.stats=true;

-- Optimize joins
SET hive.auto.convert.join=true;
SET hive.auto.convert.join.noconditionaltask.size=512000000;

-- Dynamic partitioning
SET hive.exec.dynamic.partition=true;
SET hive.exec.dynamic.partition.mode=nonstrict;
SET hive.exec.max.dynamic.partitions=10000;
\`\`\`

### Impala Tuning
\`\`\`sql
-- Always run after bulk data loads
COMPUTE STATS schema_name.table_name;

-- Refresh metadata after Hive DDL
INVALIDATE METADATA schema_name.table_name;

-- For incremental partition loads
REFRESH schema_name.table_name PARTITION (load_date='2024-04-01');

-- Check query profile
EXPLAIN SELECT * FROM fact_trade WHERE trade_date = '2024-01-01';
\`\`\`

### Efficient Query Patterns
\`\`\`sql
-- GOOD: Filter on partition column first
SELECT customer_id, SUM(trade_value)
FROM fact_trade
WHERE trade_date BETWEEN '2024-01-01' AND '2024-03-31'  -- Partition pruning
  AND segment = 'RETAIL'
GROUP BY customer_id;

-- BAD: Full table scan due to function on partition column
SELECT * FROM fact_trade
WHERE YEAR(trade_date) = 2024;  -- Prevents partition pruning!
\`\`\`

## 5. Best Practices

### Hive
- Use **Tez** for all production ETL (never MapReduce)
- Enable **LLAP** for interactive Hive use cases
- Always \`ANALYZE TABLE\` after bulk inserts
- Use **ORC** format for Hive-written tables (better ACID support)
- Use **dynamic partitioning** for date-based loads
- Set \`hive.merge.mapfiles=true\` to avoid small file proliferation

### Impala
- Always \`COMPUTE STATS\` after data loads
- Use \`INVALIDATE METADATA\` after Hive schema changes
- Design queries to leverage **runtime filters** (Impala auto-applies on hash joins)
- Avoid \`SELECT *\` — project only needed columns
- Use \`LIMIT\` for exploratory queries
- Partition tables on the most common filter column

### Don'ts
- ❌ Don't use \`ORDER BY\` without \`LIMIT\` in Impala (sorts entire dataset)
- ❌ Don't use \`COUNT(DISTINCT)\` on high-cardinality columns without NDV() approximation
- ❌ Don't leave small files (<64MB) in storage — compact regularly
- ❌ Don't mix Hive ACID tables with Impala writes

## 6. Common Issues & Troubleshooting

| Issue | Root Cause | Resolution |
|---|---|---|
| Impala query slow despite small data | Stale statistics | \`COMPUTE STATS table\` |
| Hive job memory OOM | Large shuffle, no partition | Increase \`hive.tez.container.size\`; add partition |
| "Metadata not fresh" error in Impala | Hive DDL not refreshed | \`INVALIDATE METADATA table\` |
| Impala out of memory | Aggregation on high-cardinality column | Use \`MT_DOP\` for multi-threaded aggregation |
| Slow JOINs | No broadcast for small table | Add \`/* +BROADCAST(dim_table) */\` hint |

## 7. Performance & Optimization

### File Size Optimization
- Target file size: **128MB – 1GB** per file
- Use Hive's \`hive.merge.tezfiles=true\` to auto-merge small files
- Run periodic compaction jobs for ACID tables:
  \`\`\`sql
  ALTER TABLE table_name COMPACT 'MAJOR';
  \`\`\`

### Partitioning Strategy
- Partition by **date** (not datetime) for daily batch loads
- Avoid partitions with < 1000 rows — too granular
- Use partition-level statistics: \`COMPUTE INCREMENTAL STATS\`

### Caching in Impala
\`\`\`sql
-- Cache a frequently-hit dimension table
ALTER TABLE dim_customer SET CACHED IN 'default' WITH REPLICATION = 2;
-- Remove cache
ALTER TABLE dim_customer SET UNCACHED;
\`\`\`

## 8. Governance & Compliance

- **Ranger Policies**: Apply column masking for PII fields in Impala and Hive separately
- **Query Auditing**: Enable audit logging in Cloudera Manager for both Hive and Impala
- **Resource Pools**: Use Impala admission control to prevent runaway queries from impacting SLAs

## 9. Tools & Technologies

| Tool | Purpose |
|---|---|
| Apache Hive (Tez/LLAP) | Batch ETL and complex transformations |
| Apache Impala | BI/reporting low-latency SQL |
| Hive Metastore | Shared schema registry |
| Cloudera Manager | Cluster monitoring and tuning |
| Impala Query Profile | Per-query performance diagnosis |

## 10. Real-World Use Cases

**NSE Trade Reporting:**
- Impala used for real-time position reporting with \`COMPUTE INCREMENTAL STATS\` running post each market-hour load
- Runtime filters reduce scan to 2% of data for intraday queries

**Banking Risk Aggregation:**
- Hive LLAP for complex risk calculations involving 50+ table JOINs
- ORC vectorized reads reduce query time from 45 min to 8 min

## 11. References

- [Cloudera Impala Performance Tuning](https://docs.cloudera.com/documentation/enterprise/6/6.3/topics/impala_performance.html)
- [Apache Hive Performance Tuning](https://cwiki.apache.org/confluence/display/Hive/LanguageManual+Optimization)
- [Cloudera LLAP Architecture](https://docs.cloudera.com/HDPDocuments/HDP3/HDP-3.1.5/performance-tuning/content/hive_llap_overview.html)
- [Impala Query Profile Guide](https://docs.cloudera.com/documentation/enterprise/6/6.3/topics/impala_explain_plan.html)
`,
  "docs/hive-migration.md": `# Hive Migration

## 1. Overview
Hive migration is the process of moving Hive databases, tables, schemas, and workloads from a legacy Hadoop cluster (CDH 5.x/6.x or HDP 2.x/3.x) to Cloudera Data Platform (CDP) with Hive 3.x. This is one of the most complex migration workstreams due to significant architectural changes in Hive 3 — including strict ACID requirements, reserved keyword changes, and the introduction of Hive Warehouse Connector (HWC).

## 2. Architecture Context

\`\`\`
[Legacy Hive]                         [CDP Hive 3]
  Hive 1.x/2.x (CDH)           →     Hive 3.x (LLAP + Tez)
  Hive 2.x (HDP)                →     Hive 3.x (LLAP + Tez)
  
  Metastore: MySQL/PostgreSQL   →     Metastore: MySQL/PostgreSQL (upgraded schema)
  Execution: MapReduce / Tez    →     Execution: Tez + LLAP
  Transactions: Limited ACID    →     Full ACID (ORC mandatory for ACID tables)
  HiveServer2: Direct JDBC      →     HiveServer2 + HWC for Spark integration
\`\`\`

**Key Changes in Hive 3:**
- All managed tables are now **ACID** by default
- **ORC format** required for managed ACID tables (Parquet for external)
- Many **reserved keywords** added that break existing queries
- **Hive Warehouse Connector** required for Spark-Hive integration

## 3. Core Concepts

| Concept | Hive 1.x/2.x | Hive 3.x |
|---|---|---|
| Managed Tables | Non-ACID by default | ACID by default |
| Storage Format | Any (Text, Parquet, ORC) | ORC mandatory for managed |
| Spark Integration | Direct Hive Metastore | Hive Warehouse Connector (HWC) |
| Bucketing | Optional optimization | Required for ACID tables |
| \`INSERT INTO\` | Appends without control | Fully transactional |
| Reserved Keywords | ~100 keywords | ~200+ keywords (breaking change) |

## 4. Detailed Design / Implementation

### Phase 1: Assessment — Identify Compatibility Issues

\`\`\`bash
#!/bin/bash
# Scan all HQL files for reserved keywords in Hive 3
RESERVED_KEYWORDS="AUTHORIZATION|CONF|CONSTRAINT|DAY|DAYOFWEEK|EXCHANGE|HOUR|MINUTE|MONTH|MORE|OVER|QUARTER|SECOND|SETS|SHOW_DATABASE|TABLE|TABLES|TIMESTAMP|WEEK|YEAR|ROLE|ROLES|SCHEMA|SCHEMAS|CUBE|ROLLUP|GROUPING|SETS"

find /etl/hql -name "*.hql" -o -name "*.sql" | while read file; do
    matches=$(grep -iE "($RESERVED_KEYWORDS)" "$file" | grep -v "^--")
    if [ ! -z "$matches" ]; then
        echo "=== RESERVED KEYWORD FOUND: $file ==="
        echo "$matches"
    fi
done
\`\`\`

### Phase 2: Schema Export and Compatibility Fix

\`\`\`python
import subprocess
import re

def export_hive_schemas(output_dir: str):
    """Export all Hive DDL from legacy cluster."""
    databases = subprocess.run(
        ['beeline', '-u', 'jdbc:hive2://legacy:10000', '-e', 'SHOW DATABASES;'],
        capture_output=True, text=True
    ).stdout.strip().split('\\\\n')
    
    for db in databases:
        db = db.strip()
        if not db or db in ('database_name', '+-'):
            continue
        tables = subprocess.run(
            ['beeline', '-u', f'jdbc:hive2://legacy:10000/{db}', '-e', 'SHOW TABLES;'],
            capture_output=True, text=True
        ).stdout
        # Export DDL for each table
        # ... (iterate and SHOW CREATE TABLE)

def fix_reserved_keywords(ddl: str) -> str:
    """Escape reserved keywords in column names."""
    reserved = ['year', 'month', 'day', 'hour', 'minute', 'second', 'role', 'table']
    for kw in reserved:
        # Escape as column name with backticks
        pattern = rf'\\\\b{kw}\\\\b(?!\\\\s*\\\\()'  # Not a function call
        ddl = re.sub(pattern, f'\`{kw}\`', ddl, flags=re.IGNORECASE)
    return ddl
\`\`\`

### Phase 3: Convert Managed Tables to External (Recommended)

\`\`\`sql
-- Legacy: Managed Parquet table (not ACID-compliant in Hive 3)
-- PROBLEM: Hive 3 will convert this to ACID ORC, breaking Spark reads

-- SOLUTION: Convert all managed Parquet tables to EXTERNAL tables

-- Step 1: Verify data location
DESCRIBE FORMATTED legacy_managed_table;

-- Step 2: Drop managed table (data stays in HDFS)
DROP TABLE IF EXISTS curated.legacy_managed_table;

-- Step 3: Recreate as EXTERNAL (Hive 3 compatible)
CREATE EXTERNAL TABLE curated.legacy_managed_table (
    -- same columns as before
    trade_id    STRING,
    amount      DECIMAL(18,4),
    trade_date  DATE
)
PARTITIONED BY (load_date STRING)
STORED AS PARQUET
LOCATION '/warehouse/curated/legacy_managed_table'
TBLPROPERTIES ('external.table.purge'='false');

-- Step 4: Repair partitions
MSCK REPAIR TABLE curated.legacy_managed_table;
\`\`\`

### Phase 4: Metastore Schema Upgrade

\`\`\`bash
# On CDP cluster — upgrade the Hive metastore schema
# Run as hive user

# Stop HiveServer2
sudo systemctl stop hive-server2

# Run schema upgrade tool
schematool -dbType mysql \\\\
  -upgradeSchemaFrom 2.3.0 \\\\
  -url "jdbc:mysql://metastore-host:3306/metastore" \\\\
  -driver "com.mysql.jdbc.Driver" \\\\
  -userName hive \\\\
  -passWord hive_password \\\\
  -verbose

# Verify schema version
schematool -dbType mysql -info
\`\`\`

### Phase 5: Validate Post-Migration

\`\`\`sql
-- Run comparison queries against legacy cluster
-- Legacy cluster:
SELECT COUNT(*), SUM(trade_value), MAX(trade_date)
FROM trade_transactions
WHERE trade_date BETWEEN '2024-01-01' AND '2024-03-31';
-- Result: 8,432,211 | 45,678,234,123.50 | 2024-03-31

-- CDP cluster (same query):
SELECT COUNT(*), SUM(trade_value), MAX(trade_date)
FROM trade_transactions
WHERE trade_date BETWEEN '2024-01-01' AND '2024-03-31';
-- Expected: Same result

-- If mismatch: run MSCK REPAIR TABLE and recheck
\`\`\`

## 5. Best Practices

- **Convert all managed tables to EXTERNAL**: Gives flexibility and avoids ACID ORC requirement
- **Escape reserved keywords**: Use backticks around column names matching Hive 3 reserved words
- **Test all HQL queries**: Run the full query library against CDP in parallel before cutover
- **Run MSCK REPAIR**: After migrating partitioned tables, always repair partition metadata
- **Use Hive Warehouse Connector**: For Spark jobs reading Hive managed tables in CDP
- **Keep ORC for ACID tables**: If ACID semantics needed (upserts), use ORC managed tables
- **Update JDBC strings**: Change \`hive.server2.thrift.port\` to CDP-specific endpoints

### Don'ts
- ❌ Don't assume Hive 2.x SQL is fully compatible with Hive 3.x
- ❌ Don't migrate keytabs — regenerate on CDP FreeIPA
- ❌ Don't leave managed tables as-is without testing ACID impact
- ❌ Don't skip \`COMPUTE STATS\` post-migration — query plans will be suboptimal

## 6. Common Issues & Troubleshooting

| Issue | Root Cause | Resolution |
|---|---|---|
| \`ParseException: reserved keyword\` | Column/table name is reserved in Hive 3 | Escape with backticks: \`\` \`year\` \`\` |
| \`FAILED: SemanticException table not ACID\` | INSERT into non-ACID managed table | Convert to EXTERNAL or enable ACID |
| Spark can't read Hive managed tables | HWC not configured | Configure HiveWarehouseConnector in Spark |
| Missing partitions after migration | Metastore not updated for migrated data | Run \`MSCK REPAIR TABLE\` |
| \`DROP TABLE\` deletes data in Hive 3 | Managed table purge behavior changed | Convert to EXTERNAL before dropping |
| Statistics not found | Tables migrated without re-analyzing | \`ANALYZE TABLE ... COMPUTE STATISTICS\` |

## 7. Performance & Optimization

- **LLAP for interactive queries**: Enable Hive LLAP for BI/reporting queries post-migration
- **Tez for batch ETL**: Ensure all ETL uses Tez engine (\`hive.execution.engine=tez\`)
- **Re-compute statistics**: Run \`ANALYZE TABLE\` on all migrated tables — legacy stats are invalid on CDP
- **File compaction**: If using ACID tables, schedule major compaction regularly
- **Vectorization**: Enable \`hive.vectorized.execution.enabled=true\` for columnar processing gains

## 8. Governance & Compliance

- **Re-create Ranger policies**: All Hive table/column access policies must be recreated in CDP Ranger
- **Atlas re-tagging**: Re-apply PII and sensitivity tags to migrated tables in CDP Atlas
- **Audit log continuity**: Ensure audit logs bridge the legacy → CDP migration for compliance
- **Schema documentation**: Update data dictionary in Atlas with any DDL changes made during migration

## 9. Tools & Technologies

| Tool | Purpose |
|---|---|
| Hive Metastore Upgrade Tool (\`schematool\`) | Migrate and upgrade metastore schema |
| Cloudera Replication Manager | Managed Hive replication to CDP |
| Hive Warehouse Connector (HWC) | Spark-Hive integration in CDP |
| Apache DistCP | HDFS data replication |
| Beeline | CLI for Hive query execution and validation |
| Cloudera Upgrade Assistant | Pre-migration compatibility checks |

## 10. Real-World Use Cases

**NSE Reporting Platform (CDH 5.16 → CDP 7.1.7):**
- 1,400 Hive tables migrated across 12 databases
- 847 reserved keyword conflicts resolved by automated SQL scanner
- All managed tables converted to EXTERNAL Parquet for Spark/Impala compatibility
- Migration completed with 3-week parallel validation period; zero data loss

**Banking Core DWH (HDP 3.1 → CDP PvC Base 7.1.8):**
- Metastore schema upgraded from Hive 2.3 to Hive 3.1
- ACID managed tables retained for transaction-level audit tables (account balance)
- HWC configured for existing Spark pipelines reading Hive tables

## 11. References

- [Cloudera Hive Migration Guide](https://docs.cloudera.com/cdp-private-cloud-upgrade/latest/migrate-hive.html)
- [Hive 3 New Features](https://cwiki.apache.org/confluence/display/Hive/Hive+3+New+Features)
- [Hive Reserved Keywords](https://cwiki.apache.org/confluence/display/Hive/LanguageManual+DDL#LanguageManualDDL-Keywords,NonReservedKeywordsandReservedKeywords)
- [Hive Warehouse Connector](https://docs.cloudera.com/documentation/enterprise/6/6.3/topics/spark_hive_warehouse_connector.html)
- [schematool Documentation](https://cwiki.apache.org/confluence/display/Hive/Hive+Schema+Tool)
`,
  "docs/informatica.md": `# Informatica Migration & Best Practices

## 1. Overview
Informatica PowerCenter is a premier enterprise data integration tool. This document outlines the strategies for migrating Informatica workflows to modern cloud data platforms (CDP) and establishes a set of best practices to ensure high performance and maintainability.

## 2. Architecture Context
In a modern data ecosystem, Informatica serves as the primary ETL engine, extracting data from various sources (RDBMS, Flat Files, APIs), transforming it according to business logic, and loading it into a target Data Warehouse (DWH) or Data Lake.

## 3. Core Concepts
- **PowerCenter Integration Service**: The engine that executes the workflows.
- **Repository Service**: Manages the metadata for workflows, mappings, and sessions.
- **Source/Target Definitions**: Metadata representing the structures of data sources and destinations.
- **Transformations**: Active or passive objects that modify data (e.g., Expression, Joiner, Filter).

## 4. Detailed Design / Implementation
Migration typically follows these steps:
1. **Assessment**: Analyze existing mappings for complexity and compatibility.
2. **Environment Setup**: Configure connections to the new target platform (e.g., Cloudera, Azure).
3. **Metadata Migration**: Export XML from the source repository and import into the target.
4. **Logic Refactoring**: Adjust transformations that rely on legacy-specific functions.

## 5. Best Practices
- **Modular Design**: Break complex mappings into smaller, reusable transformations.
- **Naming Conventions**: Follow a consistent prefixing system (e.g., \`m_\` for mappings, \`s_\` for sessions).
- **Parameterization**: Use parameter files to manage environment-specific variables.

## 6. Common Issues & Troubleshooting
- **Memory Buffer Failures**: Often caused by inefficient joiners or sorters. Solution: Tune buffer memory settings.
- **Connection Timed Out**: Verify network connectivity and firewall settings between the Integration Service and the source/target.

## 7. Performance & Optimization
- **Pushdown Optimization (PDO)**: Leverage the processing power of the source or target database to execute transformations.
- **Partitioning**: Parallelize data processing by creating multiple partitions within a session.

## 8. Governance & Compliance
- **Version Control**: Enable versioning in the Informatica Repository.
- **Access Control**: Use LDAP integration to manage developer and administrator permissions.

## 9. Tools & Technologies
- **Informatica PowerCenter**: Core ETL tool.
- **Informatica Intelligent Cloud Services (IICS)**: Modern cloud-based alternative.
- **XML Export/Import**: Primary method for metadata migration.

## 10. Real-World Use Cases
- **Legacy DWH Migration**: Moving from On-Premise Oracle to a Cloud Data Lake.
- **Regulatory Reporting**: Implementing standardized audit trails in banking systems.

## 11. References
- [Official Informatica Documentation](https://docs.informatica.com)
- [Cloudera Integration Guide for Informatica](https://www.cloudera.com/partners/informatica.html)
`,
  "docs/migration-strategy.md": `# Migration Planning & Strategy

## 1. Overview
CDP Migration is the process of moving data, workloads, and processes from legacy Big Data platforms (CDH 5.x/6.x, HDP, on-premise Hadoop) to Cloudera Data Platform (CDP Private Cloud Base or CDP Public Cloud). A structured migration strategy minimizes risk, downtime, and data loss while accelerating time-to-value on the modern platform.

**Why it matters:** Unplanned migrations result in broken pipelines, data loss, security gaps, and extended downtime. A phased, well-governed migration strategy is the difference between a smooth cutover and a production disaster.

## 2. Architecture Context

\`\`\`
[Legacy Platform]              [Migration Path]           [CDP Target]
  CDH 5.x / CDH 6.x     →→   Lift & Shift          →→   CDP PvC Base
  HDP 2.x / 3.x         →→   Replatform            →→   CDP Public Cloud
  On-Premise Hadoop      →→   Modernize (ELT)       →→   CDP Hybrid
  
  Key Services:
  Hive 1.x → Hive 3.x (ACID, LLAP)
  Spark 1.6 → Spark 3.x
  Impala 2.x → Impala 4.x
  Oozie → Oozie / Airflow
  HBase → HBase / Kudu
\`\`\`

## 3. Core Concepts

| Concept | Description |
|---|---|
| **Lift & Shift** | Move as-is to CDP with minimal changes; fastest but technical debt carried over |
| **Replatform** | Minor optimizations during migration (e.g., file format changes) |
| **Re-architecture** | Full redesign to leverage CDP-native capabilities |
| **Cutover** | The event where production traffic switches from legacy to new platform |
| **Run-in-Parallel** | Running legacy and new platform simultaneously for validation |
| **Rollback Plan** | Pre-defined procedure to revert to legacy platform if cutover fails |

## 4. Detailed Design / Implementation

### Migration Phases

\`\`\`
Phase 0: Assessment (2-4 weeks)
  ├── Inventory all workloads, tables, jobs
  ├── Assess compatibility (API changes, deprecated features)
  ├── Estimate effort and risk per component
  └── Define success criteria and SLAs

Phase 1: Foundation Setup (2-3 weeks)
  ├── Provision CDP environment (cluster, networking, IAM)
  ├── Configure SDX (Ranger, Atlas, FreeIPA)
  ├── Set up monitoring (Cloudera Manager)
  └── Establish connectivity to source systems

Phase 2: Data Migration (4-8 weeks)
  ├── Migrate Hive schemas and metastore
  ├── Replicate HDFS data using DistCP
  ├── Migrate HBase tables
  └── Validate data integrity (checksums, record counts)

Phase 3: Workload Migration (6-12 weeks)
  ├── Migrate ETL jobs (Oozie workflows, Spark scripts)
  ├── Migrate Informatica connections and mappings
  ├── Migrate BI tool connections (ODBC/JDBC endpoints)
  ├── Run parallel validation period
  └── Performance tune on new platform

Phase 4: Cutover & Decommission (1-2 weeks)
  ├── Final data sync (incremental)
  ├── Freeze legacy platform writes
  ├── DNS/JDBC endpoint cutover
  ├── Monitor for 72 hours post-cutover
  └── Decommission legacy cluster
\`\`\`

### Assessment Inventory Script
\`\`\`bash
# List all Hive databases and table counts
beeline -u "jdbc:hive2://legacy-host:10000" \\\\
  -e "SHOW DATABASES;" 2>/dev/null | \\\\
  while read db; do
    count=$(beeline -u "jdbc:hive2://legacy-host:10000/$db" \\\\
      -e "SHOW TABLES;" 2>/dev/null | wc -l)
    echo "$db: $count tables"
  done

# HDFS storage consumption by zone
hdfs dfs -du -h /warehouse | sort -rh | head -20

# Active Oozie jobs
oozie jobs -jobtype coordinator -status RUNNING 2>/dev/null | wc -l
\`\`\`

### DistCP HDFS Data Replication
\`\`\`bash
# Replicate raw zone from CDH to CDP
hadoop distcp \\\\
  -Dmapreduce.job.queuename=migration \\\\
  -pb \\\\
  -update \\\\
  -skipcrccheck \\\\
  -numListstatusThreads 40 \\\\
  -m 50 \\\\
  hdfs://legacy-namenode:8020/warehouse/raw \\\\
  hdfs://cdp-namenode:8020/warehouse/raw

# Verify replication
hadoop distcp \\\\
  -diff legacy_snapshot cdp_snapshot \\\\
  hdfs://legacy-namenode:8020/warehouse/raw \\\\
  hdfs://cdp-namenode:8020/warehouse/raw
\`\`\`

### Hive Metastore Migration
\`\`\`bash
# Export from legacy
mysqldump -h legacy-mysql \\\\
  -u hive -phive_password \\\\
  metastore > hive_metastore_backup.sql

# Import to CDP (after schema adjustments for Hive 3 compatibility)
mysql -h cdp-mysql \\\\
  -u hive -phive_password \\\\
  metastore < hive_metastore_backup_adjusted.sql

# Repair partitions after metastore restore
hive -e "MSCK REPAIR TABLE schema_name.table_name;"
\`\`\`

## 5. Best Practices

- **Assessment first**: Never begin migration without a full workload inventory
- **Migrate in waves**: Start with non-critical workloads; save business-critical for last
- **Parallel validation**: Run legacy and CDP in parallel for minimum 2 weeks before cutover
- **Automate migration scripts**: Use Cloudera Upgrade Assistant where available
- **Security first**: Configure Ranger policies before migrating any data
- **Test rollback**: Rehearse rollback procedure in non-prod before production cutover
- **Document everything**: Capture pre/post migration metrics for every component

### Don'ts
- ❌ Don't migrate without a tested rollback plan
- ❌ Don't skip parallel validation period under schedule pressure
- ❌ Don't assume Hive 1.x SQL is 100% compatible with Hive 3.x — test all queries
- ❌ Don't migrate Kerberos keytabs — regenerate on the new platform
- ❌ Don't cut over BI tools before validating all queries produce identical results

## 6. Common Issues & Troubleshooting

| Issue | Root Cause | Resolution |
|---|---|---|
| Hive query failures post-migration | Hive 3 ACID strictness, reserved keywords | Review and fix DDL; enable non-strict mode temporarily |
| DistCP fails partway | Network timeout or permission error | Resume with \`-update\` flag; check HDFS permissions |
| Spark job OOM on CDP | Default memory settings different from legacy | Tune \`spark.executor.memory\` and \`spark.driver.memory\` |
| BI reports show wrong data | JDBC URL pointing to legacy cluster | Update all connection strings to CDP endpoints |
| FreeIPA authentication failures | Keytab from old KDC | Regenerate keytabs on CDP FreeIPA |

## 7. Performance & Optimization

- **DistCP parallelism**: Use \`-m 50\` to run 50 parallel copy tasks
- **Hive optimization**: Re-run \`ANALYZE TABLE\` on all migrated tables for fresh statistics
- **Spark tuning**: Re-baseline performance on CDP — don't assume same settings work
- **File format upgrade**: Use migration as opportunity to convert CSV/JSON to Parquet/ORC
- **Network bandwidth**: Schedule large DistCP jobs during off-peak hours

## 8. Governance & Compliance

- **Policy migration**: Re-create all Ranger policies on CDP; don't copy raw policy DB
- **Atlas re-registration**: Re-register all data assets in CDP Atlas for lineage continuity
- **Compliance window**: Agree with compliance/audit team on data continuity requirements
- **Dual audit**: Enable audit logging on both platforms during parallel run period
- **Data classification**: Re-apply Atlas tags and classifications post-migration

## 9. Tools & Technologies

| Tool | Purpose |
|---|---|
| Cloudera Upgrade Assistant | Automated compatibility checks and upgrade paths |
| Apache DistCP | Parallel HDFS-to-HDFS data replication |
| Hive Metastore Migration Tool | Schema and partition metadata migration |
| Cloudera Replication Manager | Managed data and metadata replication |
| Apache Ranger | Policy migration and access control |
| Cloudera Manager | Cluster monitoring during migration |

## 10. Real-World Use Cases

**Financial Services CDH to CDP Migration:**
- 200TB data warehouse migrated over 6 months in 4 waves
- Wave 1: Non-critical reporting (2 weeks); Wave 4: Real-time trading feeds (last)
- 3-week parallel validation with automated daily reconciliation reports

**NSE Market Data Platform:**
- On-premise CDH 5.16 to CDP PvC Base 7.1.7
- Hive metastore migration required fixing 1,200+ reserved keyword conflicts
- Zero-downtime cutover achieved using DNS-level JDBC endpoint switch

## 11. References

- [Cloudera CDP Migration Guide](https://docs.cloudera.com/cdp-private-cloud-upgrade/latest/index.html)
- [Cloudera Upgrade Assistant](https://docs.cloudera.com/upgrade-advisor/latest/index.html)
- [Apache DistCP Guide](https://hadoop.apache.org/docs/current/hadoop-distcp/DistCp.html)
- [Hive 3 Migration Guide](https://docs.cloudera.com/documentation/enterprise/upgrade/topics/upgrade_hive_metastore.html)
- [Cloudera Replication Manager](https://docs.cloudera.com/management-console/cloud/data-replication/index.html)
`,
  "docs/spark-opt.md": `# Spark Optimization Best Practices

## 1. Overview
Apache Spark is the primary distributed processing engine on Cloudera Data Platform. While Spark is powerful, poorly tuned jobs can consume excessive cluster resources, run for hours instead of minutes, or fail entirely. This document provides a structured guide to diagnosing and resolving Spark performance issues in production enterprise environments.

## 2. Architecture Context

\`\`\`
[Driver Program]
    │
    ├── [SparkContext / SparkSession]
    │       │
    │       ├── [DAG Scheduler] → [Task Scheduler]
    │       │
    │       └── [Cluster Manager] (YARN / Kubernetes)
    │               │
    │               ├── [Executor 1] → [Task 1..N] → [Cache/Disk]
    │               ├── [Executor 2] → [Task 1..N] → [Cache/Disk]
    │               └── [Executor N] → [Task 1..N] → [Cache/Disk]
\`\`\`

**Key Resources to tune:**
- Driver memory and cores
- Executor memory, cores, and count
- Shuffle partitions
- Storage format and compression

## 3. Core Concepts

| Concept | Description |
|---|---|
| **RDD** | Resilient Distributed Dataset — low-level distributed collection |
| **DataFrame/Dataset** | High-level structured API with Catalyst optimizer |
| **DAG** | Directed Acyclic Graph — logical execution plan |
| **Stage** | A set of tasks with no shuffle boundary between them |
| **Shuffle** | Data redistribution across executors — the #1 performance killer |
| **Spill** | When in-memory data exceeds limits and is written to disk |
| **Skew** | When one partition has disproportionately more data than others |
| **Broadcast Join** | Replicates small table to all executors to avoid shuffle |

## 4. Detailed Design / Implementation

### Recommended Spark Configuration (YARN)
\`\`\`bash
spark-submit \\\\
  --master yarn \\\\
  --deploy-mode cluster \\\\
  --num-executors 20 \\\\
  --executor-cores 4 \\\\
  --executor-memory 16g \\\\
  --driver-memory 8g \\\\
  --driver-cores 2 \\\\
  --conf spark.sql.shuffle.partitions=400 \\\\
  --conf spark.default.parallelism=400 \\\\
  --conf spark.sql.adaptive.enabled=true \\\\
  --conf spark.sql.adaptive.coalescePartitions.enabled=true \\\\
  --conf spark.sql.adaptive.skewJoin.enabled=true \\\\
  --conf spark.serializer=org.apache.spark.serializer.KryoSerializer \\\\
  --conf spark.sql.parquet.compression.codec=snappy \\\\
  --conf spark.dynamicAllocation.enabled=true \\\\
  --conf spark.dynamicAllocation.minExecutors=5 \\\\
  --conf spark.dynamicAllocation.maxExecutors=50 \\\\
  my_job.py
\`\`\`

### Adaptive Query Execution (AQE) — Spark 3.x
\`\`\`python
# Enable AQE for automatic optimization at runtime
spark = SparkSession.builder \\\\
    .config("spark.sql.adaptive.enabled", "true") \\\\
    .config("spark.sql.adaptive.coalescePartitions.enabled", "true") \\\\
    .config("spark.sql.adaptive.skewJoin.enabled", "true") \\\\
    .config("spark.sql.adaptive.localShuffleReader.enabled", "true") \\\\
    .getOrCreate()
\`\`\`

### Broadcast Join for Small Tables
\`\`\`python
from pyspark.sql.functions import broadcast

# BAD: Sort-Merge join on large + large (causes shuffle)
result = large_fact.join(large_dim, on="customer_sk")

# GOOD: Broadcast join on small dimension table (no shuffle)
result = large_fact.join(broadcast(small_dim), on="customer_sk")

# Configure auto-broadcast threshold (default 10MB, increase to 100MB)
spark.conf.set("spark.sql.autoBroadcastJoinThreshold", 100 * 1024 * 1024)
\`\`\`

### Handling Data Skew
\`\`\`python
from pyspark.sql.functions import col, concat_ws, lit, rand, floor

# BAD: Skewed join — one customer_sk has 60% of all records
result = fact.join(dim, on="customer_sk")

# GOOD: Salt the skewed key to distribute load
# Add salt to skewed fact table
skewed_fact = fact.withColumn(
    "salted_key",
    concat_ws("_", col("customer_sk"), (floor(rand() * 10)).cast("string"))
)

# Explode dim table with all salt values
from pyspark.sql.functions import explode, array
salted_dim = dim.withColumn("salt", explode(array([lit(i) for i in range(10)]))) \\\\
    .withColumn("salted_key", concat_ws("_", col("customer_sk"), col("salt").cast("string")))

result = skewed_fact.join(salted_dim, on="salted_key")
\`\`\`

### Caching Strategy
\`\`\`python
from pyspark import StorageLevel

# Use MEMORY_AND_DISK for large DataFrames (avoids OOM)
large_df.persist(StorageLevel.MEMORY_AND_DISK_SER)

# Use MEMORY_ONLY for small, frequently accessed DataFrames
small_ref.cache()  # equivalent to MEMORY_ONLY

# Always unpersist when done
large_df.unpersist()
\`\`\`

## 5. Best Practices

- **Use DataFrames, not RDDs**: Catalyst optimizer provides automatic query optimization
- **Enable AQE (Spark 3+)**: Handles skew and partition coalescing automatically at runtime
- **Filter and project early**: Apply \`filter()\` and \`select()\` as early as possible
- **Avoid wide transformations early**: \`groupBy\`, \`join\`, \`distinct\` cause shuffles — minimize them
- **Set shuffle partitions correctly**: Default 200 is wrong for most jobs. Rule: \`(data_size_GB * 1024) / 128\` MB target per partition
- **Use columnar formats**: Always read/write Parquet or ORC; never CSV in production
- **Avoid Python UDFs**: Use Spark SQL built-in functions; Python UDFs break vectorization and serialize row-by-row

### Don'ts
- ❌ Don't use \`collect()\` on large DataFrames — brings all data to driver, causes OOM
- ❌ Don't use \`count()\` unnecessarily mid-pipeline — triggers a full job
- ❌ Don't nest \`groupBy\` + \`join\` without checking for skew first
- ❌ Don't set \`spark.sql.shuffle.partitions=200\` for 500GB+ datasets
- ❌ Don't ignore Spark UI — it shows skew, spill, and slow stages clearly

## 6. Common Issues & Troubleshooting

| Issue | Root Cause | Resolution |
|---|---|---|
| Stage stuck at 99% | Data skew — one task has 100x more data | Enable AQE skew join or salt the key |
| Executor OOM | Insufficient memory for aggregation/join | Increase executor memory or reduce partition size |
| Disk spill | Memory pressure during shuffle | Increase \`spark.executor.memory\` or shuffle partitions |
| Job runs 10x slower than expected | Small files (1000s of tiny Parquet files) | Coalesce before write; use \`repartition()\` |
| Driver OOM | \`collect()\` or \`toPandas()\` on large DF | Sample data first; use \`write()\` instead |
| GC overhead limit exceeded | Too many small objects, insufficient heap | Enable KryoSerializer; tune GC settings |

## 7. Performance & Optimization

### Partition Sizing Rule of Thumb
\`\`\`
Target: 128MB – 512MB per partition
shuffle.partitions = Total Data Size (MB) / 200MB
Example: 100GB dataset = 100,000MB / 200 = 500 shuffle partitions
\`\`\`

### Memory Tuning
\`\`\`
Total executor memory = execution memory + storage memory + overhead
  execution.memory fraction = 0.6 (default)
  storage.memory fraction = 0.4 (default)
  overhead = max(384MB, 10% of executor memory)

Example: 16GB executor
  execution = 9.6GB (available for joins, aggregations)
  storage = 6.4GB (available for cached data)
  overhead = 1.6GB (JVM off-heap)
  YARN allocated = 16 + 1.6 = 17.6GB
\`\`\`

### Reading Efficiently
\`\`\`python
# Push down predicates and projection when reading Parquet
df = spark.read.parquet("/warehouse/raw/trade") \\\\
    .filter(col("trade_date") == "2024-04-01") \\\\  # Partition pruning
    .select("trade_id", "customer_sk", "trade_value")  # Column pruning
\`\`\`

## 8. Governance & Compliance

- **Queue management**: Submit production jobs to dedicated YARN queues with capacity guarantees
- **Resource limits**: Set per-user executor limits to prevent monopolization
- **Job tagging**: Use \`spark.app.name\` and custom metadata for audit trail
- **Log retention**: Keep Spark event logs for minimum 30 days for debugging

## 9. Tools & Technologies

| Tool | Purpose |
|---|---|
| Spark UI | Real-time job monitoring, stage/task details |
| Spark History Server | Post-job analysis and comparison |
| Cloudera Manager | Cluster-level YARN queue monitoring |
| Apache Ganglia / Grafana | Infrastructure metrics (CPU, memory, network) |
| PySpark | Python API for Spark |
| Spark SQL | SQL interface to DataFrames |

## 10. Real-World Use Cases

**NSE Intraday Risk Calculation:**
- 8M trade records processed in 4 minutes using 40 executors
- AQE eliminated skew from 3 large customers dominating the \`customer_sk\` partition
- Broadcast join on instrument reference table reduced shuffle by 70%

**Banking Batch ETL:**
- 200GB daily load reduced from 3.5 hours to 28 minutes by:
  - Switching from RDD to DataFrame API
  - Enabling AQE and Kryo serialization
  - Tuning shuffle partitions from 200 to 1000

## 11. References

- [Apache Spark Official Documentation](https://spark.apache.org/docs/latest/)
- [Spark SQL Guide](https://spark.apache.org/docs/latest/sql-programming-guide.html)
- [Spark Tuning Guide](https://spark.apache.org/docs/latest/tuning.html)
- [Cloudera Spark on YARN Best Practices](https://docs.cloudera.com/documentation/enterprise/6/6.3/topics/admin_spark_tuning.html)
- [Adaptive Query Execution (AQE)](https://spark.apache.org/docs/3.0.0/sql-performance-tuning.html#adaptive-query-execution)
`,
};
