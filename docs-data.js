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
  "docs/metadata-lineage.md": `# Metadata & Lineage Management

## 1. Overview
Metadata and Data Lineage are foundational pillars of enterprise data governance. Metadata describes the data — its structure, origin, ownership, and usage. Lineage tracks how data moves and transforms from source to consumption. Together, they enable data discovery, impact analysis, regulatory compliance, and stakeholder trust.

In Cloudera Data Platform, **Apache Atlas** is the primary metadata and lineage management tool. Every table, column, ETL job, and data flow must be registered and tracked in Atlas to maintain a governed, auditable data estate.

**Why it matters:** Without metadata, data consumers cannot find or trust data. Without lineage, engineers cannot perform impact analysis for schema changes or debug data quality failures upstream.

## 2. Architecture Context

\`\`\`
[Source Systems]
     │
     ▼
[Ingestion Layer] ──────────────── Atlas Hook (Sqoop/Kafka/NiFi)
     │                                      │
     ▼                                      ▼
[Raw Zone (HDFS/S3)] ─────────── Atlas Entity (DataSet)
     │                                      │
     ▼                                      ▼
[ETL / Spark Job] ──────────────── Atlas Process (ETL Lineage)
     │                                      │
     ▼                                      ▼
[Curated Zone] ─────────────────── Atlas Entity + Tags
     │                                      │
     ▼                                      ▼
[BI / Reporting Tools] ─────────── Atlas Lineage Graph
\`\`\`

**Atlas Components:**
- **Atlas REST API**: Programmatic entity registration and search
- **Atlas Hooks**: Auto-capture lineage from Hive, Spark, Sqoop, NiFi
- **Atlas UI**: Browse metadata, view lineage graphs, manage classifications
- **Atlas Ranger Integration**: Tag-based access control policies

## 3. Core Concepts

| Concept | Description |
|---|---|
| **Entity** | Any object tracked in Atlas — table, column, ETL job, database |
| **Type Definition** | Schema that defines what attributes an entity has |
| **Classification** | Tags applied to entities (e.g., PII, SENSITIVE, FINANCIAL) |
| **Lineage** | Directed graph showing data flow from source to target |
| **Glossary Term** | Business vocabulary mapped to technical entities |
| **Propagation** | Classifications automatically inherited by downstream entities |
| **Atlas Hook** | Component embedded in Hive/Spark/Sqoop to auto-capture metadata |

### Metadata Categories

| Type | Examples |
|---|---|
| **Technical Metadata** | Table DDL, column types, partition keys, file format |
| **Operational Metadata** | Load dates, row counts, job run history |
| **Business Metadata** | Data owner, business description, glossary terms |
| **Governance Metadata** | PII classification, sensitivity level, retention policy |

## 4. Detailed Design / Implementation

### Registering a Table in Atlas via REST API
\`\`\`python
import requests
import json

ATLAS_URL = "http://atlas-host:21000/api/atlas/v2"
AUTH = ("admin", "admin_password")

def register_hive_table(db_name: str, table_name: str, owner: str, description: str):
    """Register a Hive table entity in Apache Atlas."""
    entity = {
        "entity": {
            "typeName": "hive_table",
            "attributes": {
                "name": table_name,
                "db": {"typeName": "hive_db", "uniqueAttributes": {"qualifiedName": f"{db_name}@cluster1"}},
                "qualifiedName": f"{db_name}.{table_name}@cluster1",
                "tableType": "EXTERNAL",
                "owner": owner,
                "description": description,
                "createTime": "2024-04-01T00:00:00.000Z"
            },
            "classifications": []
        }
    }
    
    response = requests.post(
        f"{ATLAS_URL}/entity",
        headers={"Content-Type": "application/json"},
        auth=AUTH,
        data=json.dumps(entity)
    )
    return response.json()

# Register a curated table
register_hive_table(
    db_name="curated",
    table_name="fact_trade",
    owner="data_engineering_team",
    description="Central trade fact table — daily NSE/BSE trade records with customer and instrument enrichment."
)
\`\`\`

### Applying Classification (PII Tag) to Columns
\`\`\`python
def tag_column_as_pii(table_qualified_name: str, column_name: str):
    """Apply PII classification to a specific column."""
    
    # First get the column GUID
    search_response = requests.get(
        f"{ATLAS_URL}/search/attribute",
        params={"typeName": "hive_column", "attrName": "qualifiedName", 
                "attrValuePrefix": f"{table_qualified_name}.{column_name}"},
        auth=AUTH
    ).json()
    
    col_guid = search_response["entities"][0]["guid"]
    
    # Apply PII classification
    classification_payload = [{"typeName": "PII"}]
    requests.post(
        f"{ATLAS_URL}/entity/guid/{col_guid}/classifications",
        headers={"Content-Type": "application/json"},
        auth=AUTH,
        data=json.dumps(classification_payload)
    )
    print(f"Tagged {table_qualified_name}.{column_name} as PII")

# Tag sensitive columns
tag_column_as_pii("curated.dim_customer@cluster1", "full_name")
tag_column_as_pii("curated.dim_customer@cluster1", "date_of_birth")
tag_column_as_pii("curated.dim_customer@cluster1", "email")
\`\`\`

### Capturing Spark Lineage via Atlas Hook
\`\`\`python
# Configure Spark to emit lineage to Atlas automatically
spark = SparkSession.builder \\
    .appName("TradeTransformation") \\
    .config("spark.extraListeners", "com.hortonworks.spark.atlas.SparkAtlasEventTracker") \\
    .config("spark.sql.queryExecutionListeners", 
            "com.hortonworks.spark.atlas.SparkAtlasEventTracker") \\
    .config("atlas.cluster.name", "cdp-cluster-1") \\
    .config("atlas.rest.address", "http://atlas-host:21000") \\
    .getOrCreate()

# Any transformation now auto-registers lineage in Atlas
curated_df = spark.table("raw.trade_raw") \\
    .filter(col("trade_date") == "2024-04-01") \\
    .join(spark.table("curated.dim_customer"), on="customer_id") \\
    .groupBy("segment").agg(sum("trade_value").alias("total_value"))

curated_df.write.mode("overwrite").saveAsTable("mart.daily_segment_summary")
# Atlas now shows: raw.trade_raw + curated.dim_customer → mart.daily_segment_summary
\`\`\`

### Business Glossary Setup
\`\`\`python
def create_glossary_term(term_name: str, definition: str, acronym: str = None):
    """Create a business glossary term in Atlas."""
    payload = {
        "name": term_name,
        "shortDescription": acronym,
        "longDescription": definition,
        "anchor": {"glossaryGuid": "DEFAULT_GLOSSARY_GUID"}
    }
    response = requests.post(
        f"{ATLAS_URL}/glossary/term",
        headers={"Content-Type": "application/json"},
        auth=AUTH,
        data=json.dumps(payload)
    )
    return response.json()

# Define business terms
create_glossary_term("Net Asset Value", 
    "Total value of assets minus liabilities per fund unit.", "NAV")
create_glossary_term("Settlement Date", 
    "The date on which a trade is settled and ownership officially transfers.", "SD")
\`\`\`

## 5. Best Practices

- **Register at ingestion**: Register entities in Atlas when data first lands, not after transformation
- **Use qualifiedName convention**: Always use \`db_name.table_name@cluster_name\` for uniqueness
- **Enable Atlas Hooks**: Configure Hive, Spark, Sqoop Atlas hooks to auto-capture lineage
- **Tag at column level**: Apply PII/SENSITIVE classifications at column level, not just table level
- **Propagate classifications**: Enable downstream propagation so Ranger auto-applies policies
- **Maintain glossary**: Map every business term to its technical implementation
- **Audit classification changes**: Track who applied/removed tags and when

### Don'ts
- ❌ Don't register entities without \`qualifiedName\` — causes duplicate detection failures
- ❌ Don't apply table-level classifications without verifying column-level coverage
- ❌ Don't allow shadow tables (unregistered tables in Atlas) to reach production
- ❌ Don't skip lineage capture for manual SQL transformations — register explicitly via API

## 6. Common Issues & Troubleshooting

| Issue | Root Cause | Resolution |
|---|---|---|
| Lineage not captured for Spark jobs | Atlas hook not configured in SparkConf | Add \`spark.extraListeners\` and \`spark.sql.queryExecutionListeners\` |
| Duplicate entity registration errors | \`qualifiedName\` inconsistency | Standardize naming convention; use UPSERT mode |
| Classifications not propagating | Propagation disabled on classification type | Enable propagation in Atlas classification definition |
| Atlas search returns stale results | Index rebuild lag | Trigger \`POST /api/atlas/admin/reindex\` |
| Hive lineage missing for CTAS queries | HiveServer2 hook not enabled | Enable \`atlas.hook.hive.synchronous\` in hive-site.xml |

## 7. Performance & Optimization

- **Batch registration**: Use \`POST /api/atlas/v2/entity/bulk\` for registering multiple entities
- **Selective lineage**: Configure Atlas hooks to capture lineage for specific databases only
- **Index optimization**: Schedule Atlas Elasticsearch index optimization during off-peak hours
- **Notification throttling**: Set \`atlas.notification.consumer.retries\` to prevent Kafka consumer overload
- **Search caching**: Cache frequently used Atlas search queries for glossary lookups

## 8. Governance & Compliance

- **SEBI/RBI Lineage**: Regulatory reports require traceable lineage from raw source to submitted file
- **PII Audit Trail**: All PII column classifications must be logged with effective date and reviewer
- **Data Stewardship**: Each domain must have a designated Atlas data steward responsible for metadata quality
- **GDPR/PDPA Compliance**: Atlas PII tags drive automated data masking and retention policies
- **Schema Change Impact**: Before any DDL change, run Atlas impact analysis to identify downstream consumers

## 9. Tools & Technologies

| Tool | Purpose |
|---|---|
| Apache Atlas | Central metadata repository and lineage graph |
| Atlas REST API | Programmatic metadata and lineage management |
| Atlas Hooks (Hive/Spark) | Automatic lineage capture from processing engines |
| Apache Ranger | Tag-based access control driven by Atlas classifications |
| Cloudera Manager | Atlas service monitoring and configuration |
| Apache Kafka | Atlas notification bus for real-time metadata events |

## 10. Real-World Use Cases

**NSE Regulatory Audit (SEBI):**
- Complete lineage from NSE feed → Raw Zone → Curated → Regulatory Report registered in Atlas
- Auditors trace any reported figure back to source tick in under 5 minutes
- 2,400 Hive tables and 8,000+ columns tagged with business classifications

**Banking PII Management:**
- 47 PII columns across 12 tables tagged in Atlas; Ranger auto-masking applied
- GDPR data subject deletion requests fulfilled using Atlas to identify all tables containing customer PAN/Aadhaar
- Zero-tolerance policy: any untagged column in \`curated\` zone triggers pipeline failure

## 11. References

- [Apache Atlas Documentation](https://atlas.apache.org/)
- [Atlas REST API Guide](https://atlas.apache.org/api/v2/index.html)
- [Cloudera Atlas Configuration](https://docs.cloudera.com/cdp-private-cloud-base/latest/security-apache-ranger-atlas/topics/security-atlas-overview.html)
- [Spark Atlas Connector](https://github.com/hortonworks-spark/spark-atlas-connector)
- [Atlas Classification Propagation](https://atlas.apache.org/Classification-Propagation.html)
`,
  "docs/data-governance.md": `# Data Governance & Compliance

## 1. Overview
Data Governance is the framework of policies, processes, roles, and technologies that ensure data is managed as a strategic enterprise asset. It covers data ownership, access control, quality standards, retention policies, and regulatory compliance. Without governance, a data platform becomes an ungoverned data swamp where no one trusts the data, no one knows who owns it, and audit readiness is impossible.

In a Cloudera-based platform, governance is implemented through **Apache Ranger** (access control), **Apache Atlas** (metadata and classification), **Apache Knox** (gateway security), and organizational frameworks including data stewardship and policy management.

## 2. Architecture Context

\`\`\`
[Data Governance Framework]

  Policy & Standards Layer
  (Data Ownership · Retention · Classification)
           │
  Enforcement Layer
  Apache Ranger → Column Masking · Row Filters
  Apache Knox   → API Gateway Security
  FreeIPA/Kerberos → Authentication
           │
  Metadata & Discovery Layer
  Apache Atlas → Lineage · Classification · Search
           │
  Audit & Compliance Layer
  Ranger Audit Logs · Atlas Audit · Cloudera Manager
\`\`\`

## 3. Core Concepts

| Concept | Description |
|---|---|
| **Data Owner** | Business role accountable for a data domain (e.g., Finance, Risk) |
| **Data Steward** | Technical role responsible for metadata quality and policy enforcement |
| **Data Classification** | Categorization of data by sensitivity (PII, CONFIDENTIAL, PUBLIC) |
| **Column Masking** | Obfuscating sensitive column values for unauthorized users |
| **Row-Level Filter** | Restricting result rows based on user role, region, or department |
| **Retention Policy** | Rules for how long data is kept before archival or deletion |
| **Data Catalog** | Searchable index of all data assets with metadata and lineage |

### Data Classification Matrix

| Level | Definition | Examples | Action |
|---|---|---|---|
| **PUBLIC** | Non-sensitive; freely accessible | Reference tables, market indices | No masking |
| **INTERNAL** | Internal business use | Aggregated metrics | Role-based access |
| **CONFIDENTIAL** | Business-sensitive | Financial results, HR data | Restricted roles |
| **RESTRICTED** | Regulatory/Legal | PAN, Aadhaar, account numbers | Masking mandatory |
| **PII** | Personal Identifiable Info | Name, DOB, email, mobile | Full masking |

## 4. Detailed Design / Implementation

### Ranger Column Masking Policy (JSON)
\`\`\`json
{
  "policyType": 1,
  "name": "mask-pii-customer-columns",
  "resources": {
    "database": {"values": ["curated"]},
    "table": {"values": ["dim_customer"]},
    "column": {"values": ["full_name", "email", "date_of_birth", "mobile"]}
  },
  "dataMaskPolicyItems": [
    {
      "dataMaskInfo": {"dataMaskType": "MASK_SHOW_LAST_4"},
      "groups": ["analyst_group", "developer_group"]
    }
  ]
}
\`\`\`
*Policy Applied: Analysts see \`XXXXXXX3456\` instead of \`9876543456\` for mobile numbers.*

### Row-Level Filter Policy
\`\`\`json
{
  "policyType": 2,
  "name": "row-filter-region-trading",
  "resources": {
    "database": {"values": ["curated"]},
    "table": {"values": ["fact_trade"]}
  },
  "rowFilterPolicyItems": [
    {
      "rowFilterInfo": {"filterExpr": "region_code = current_user_region()"},
      "groups": ["regional_analysts"]
    }
  ]
}
\`\`\`

### Data Governance Control Table
\`\`\`sql
CREATE TABLE IF NOT EXISTS gov_ctrl.data_catalog (
    table_fqn           STRING,
    domain              STRING,   -- FINANCE, RISK, OPERATIONS, HR
    data_owner          STRING,
    data_steward        STRING,
    classification      STRING,   -- PUBLIC / INTERNAL / CONFIDENTIAL / PII
    pii_columns         ARRAY<STRING>,
    retention_days      INT,
    last_reviewed_dt    DATE,
    ranger_policy_id    STRING,
    atlas_guid          STRING,
    status              STRING    -- ACTIVE / DEPRECATED / UNDER_REVIEW
)
STORED AS ORC
LOCATION '/warehouse/ctrl/data_catalog';
\`\`\`

### Automated PII Detection
\`\`\`python
import re
from pyspark.sql import SparkSession

spark = SparkSession.builder.appName("PIIScan").getOrCreate()

PII_PATTERNS = [
    r'.*name.*', r'.*email.*', r'.*mobile.*', r'.*phone.*',
    r'.*pan.*', r'.*aadhaar.*', r'.*dob.*', r'.*birth.*',
    r'.*address.*', r'.*passport.*'
]

def detect_pii_columns(db_name: str, table_name: str) -> list:
    df = spark.table(f"{db_name}.{table_name}")
    pii_cols = []
    for col_name in df.columns:
        for pattern in PII_PATTERNS:
            if re.match(pattern, col_name.lower()):
                pii_cols.append(col_name)
                break
    return pii_cols

curated_tables = spark.sql("SHOW TABLES IN curated").collect()
for row in curated_tables:
    pii = detect_pii_columns("curated", row.tableName)
    if pii:
        print(f"curated.{row.tableName}: PII detected → {pii}")
\`\`\`

## 5. Best Practices

- **Classify at source**: Apply classifications before data enters the platform
- **Tag at column level**: Always tag sensitive columns individually, not just tables
- **Automate PII detection**: Run scheduled scans for untagged PII in new tables
- **Enforce via Ranger**: Access control in Ranger — never application-layer only
- **Quarterly reviews**: Review owner/steward assignments and access policies quarterly
- **Separation of duties**: Owners approve; stewards implement; engineers cannot grant own access
- **Audit everything**: Enable Ranger audit logging for all reads on RESTRICTED/PII data

### Don'ts
- ❌ Don't share service account credentials for data access
- ❌ Don't allow \`SELECT *\` on PII tables from untrusted contexts
- ❌ Don't skip governance registration for "temporary" tables
- ❌ Don't apply access policies without testing in dev environment first

## 6. Common Issues & Troubleshooting

| Issue | Root Cause | Resolution |
|---|---|---|
| Users see masked data incorrectly | Ranger policy not applied to correct group | Check group membership and policy condition |
| Row filter not working in Impala | Impala has limited Ranger row filter support | Use database views for row-level filtering in Impala |
| Atlas classification not triggering Ranger | Propagation not enabled | Enable propagation in Atlas classification definition |
| Compliance report shows unclassified tables | New tables added without governance review | Add governance step to CI/CD deployment pipeline |

## 7. Performance & Optimization

- **Policy caching**: Ranger caches policies locally; changes propagate in ~30 seconds
- **Masking overhead**: Column masking adds ~5–15ms per query; plan for interactive use
- **Policy groups**: Always manage policies at group level — individual user policies are unscalable
- **Selective audit**: Full audit logging for RESTRICTED data only; sampling for INTERNAL data
- **Bulk policy management**: Use Ranger REST API to export/import policies across environments

## 8. Governance & Compliance

- **SEBI**: Trade data access must be logged; broker personal data classified RESTRICTED
- **RBI**: Customer financial data requires field-level access controls and audit trails
- **GDPR/PDPA**: Right-to-erasure must be implementable using Atlas lineage to find all instances
- **ISO 27001**: Annual governance audits supported by Ranger access logs
- **Internal Audit**: Quarterly reports on sensitive data access generated from Ranger audit DB

## 9. Tools & Technologies

| Tool | Purpose |
|---|---|
| Apache Ranger | Fine-grained access control, column masking, row filtering |
| Apache Atlas | Data classification, lineage, catalog |
| Apache Knox | REST API gateway and perimeter security |
| FreeIPA / Kerberos | Identity management and authentication |
| Cloudera Manager | Platform-wide governance monitoring |
| ServiceNow / Jira | Access request and approval workflow |

## 10. Real-World Use Cases

**NSE Compliance (SEBI):**
- 156 Ranger policies across 8 databases; 34 column masking rules for broker PII
- Quarterly access review eliminates 200+ stale grants annually
- Ranger audit logs exported to SIEM for real-time anomaly detection

**Banking Customer Data Protection:**
- 47 PII columns masked across curated zone; analysts never see actual customer details
- GDPR deletion workflow uses Atlas lineage to identify all customer data tables
- Zero unauthorized access incidents in 18 months post-governance implementation

## 11. References

- [Apache Ranger Documentation](https://ranger.apache.org/)
- [Apache Atlas Classification Guide](https://atlas.apache.org/Classification-Propagation.html)
- [Cloudera Security Reference Architecture](https://docs.cloudera.com/cdp-private-cloud-base/latest/security-overview/index.html)
- [SEBI Data Security Guidelines](https://www.sebi.gov.in/legal/circulars/)
- [GDPR Data Protection Principles](https://gdpr-info.eu/art-5-gdpr/)
`,
  "docs/performance-optimization.md": `# Performance & Optimization Standards

## 1. Overview
Performance optimization in an enterprise data warehouse is a continuous discipline spanning query tuning, storage design, cluster resource management, and ETL pipeline efficiency. This document establishes platform-wide performance standards and tuning playbooks for Hive, Impala, Spark, and HDFS workloads running on Cloudera Data Platform.

**Why it matters:** A poorly performing DWH directly impacts business SLAs — delayed reports, failed batch jobs, and analyst frustration erode trust in the platform and drive shadow IT.

## 2. Architecture Context

\`\`\`
[Performance Optimization Stack]

  Query Layer     → Impala (interactive) | Hive LLAP (batch SQL)
       │
  Processing      → Apache Spark (ELT) | Tez (Hive batch)
       │
  Storage         → HDFS / S3 / ADLS (Parquet / ORC / Avro)
       │
  Cluster         → YARN Resource Manager | Dynamic Allocation
       │
  Infrastructure  → Compute nodes | Network | Disk I/O
\`\`\`

**The 80/20 Rule of DWH Performance:**
80% of performance problems come from 4 root causes:
1. Missing or stale table statistics
2. Data skew in partitions or Spark tasks
3. Small file proliferation
4. Incorrect join strategy (Sort-Merge vs Broadcast)

## 3. Core Concepts

| Concept | Description |
|---|---|
| **Partition Pruning** | Skipping irrelevant partitions using WHERE clause on partition column |
| **Predicate Pushdown** | Pushing filters into the storage layer to reduce I/O |
| **Vectorization** | Processing multiple rows per CPU instruction via columnar batching |
| **CBO (Cost-Based Optimizer)** | Uses table statistics to choose optimal query plans |
| **Dynamic Partition Insert** | Writing to multiple partitions in a single INSERT operation |
| **File Compaction** | Merging many small files into fewer large files |
| **Bucketing** | Pre-sorting data into fixed buckets by a join key to avoid shuffle |
| **AQE** | Spark's Adaptive Query Execution — runtime plan optimization |

## 4. Detailed Design / Implementation

### Table Statistics — Foundation of All Optimization
\`\`\`sql
-- Hive: Compute statistics after every bulk load
ANALYZE TABLE curated.fact_trade COMPUTE STATISTICS;
ANALYZE TABLE curated.fact_trade COMPUTE STATISTICS FOR COLUMNS
    trade_id, customer_sk, instrument_sk, trade_value, trade_date;

-- Impala: Compute stats (different syntax)
COMPUTE STATS curated.fact_trade;

-- Impala: Incremental stats for new partition only (faster)
COMPUTE INCREMENTAL STATS curated.fact_trade PARTITION (trade_date='2024-04-01');

-- Check current statistics
SHOW TABLE STATS curated.fact_trade;
SHOW COLUMN STATS curated.fact_trade;
\`\`\`

### Query Optimization Checklist
\`\`\`sql
-- 1. Always filter on partition column first
SELECT segment, SUM(trade_value)
FROM curated.fact_trade
WHERE trade_date = '2024-04-01'   -- Partition pruning: reads 1 partition
  AND region_code = 'NSE'
GROUP BY segment;

-- 2. Avoid functions on partition columns (disables pruning)
-- BAD:
WHERE YEAR(trade_date) = 2024    -- Full table scan!

-- GOOD:
WHERE trade_date BETWEEN '2024-01-01' AND '2024-12-31'

-- 3. Use EXPLAIN to inspect query plan before running
EXPLAIN SELECT COUNT(*) FROM curated.fact_trade WHERE trade_date = '2024-04-01';

-- 4. Profile slow Impala queries
PROFILE;  -- Run after query to see per-node timing
\`\`\`

### Small File Compaction (Hive)
\`\`\`sql
-- Check file count per partition
SHOW PARTITIONS curated.fact_trade;

-- Compact small files using INSERT OVERWRITE
INSERT OVERWRITE TABLE curated.fact_trade
PARTITION (trade_date = '2024-04-01')
SELECT * FROM curated.fact_trade
WHERE trade_date = '2024-04-01';

-- For ACID tables: use MAJOR compaction
ALTER TABLE curated.fact_trade COMPACT 'MAJOR';
ALTER TABLE curated.fact_trade PARTITION (trade_date='2024-04-01') COMPACT 'MAJOR';
\`\`\`

### Spark File Compaction Job
\`\`\`python
from pyspark.sql import SparkSession

spark = SparkSession.builder \\
    .appName("FileCompaction") \\
    .config("spark.sql.files.maxRecordsPerFile", 500000) \\
    .getOrCreate()

# Read fragmented partition
df = spark.read.parquet("/warehouse/curated/fact_trade/trade_date=2024-04-01/")
print(f"Input partitions: {df.rdd.getNumPartitions()}")

# Coalesce to target file size (1 file per ~500MB)
target_files = max(1, df.count() // 500000)
compacted_df = df.coalesce(target_files)

# Overwrite with compacted files
compacted_df.write \\
    .mode("overwrite") \\
    .parquet("/warehouse/curated/fact_trade/trade_date=2024-04-01/")

print(f"Output files: {target_files}")
\`\`\`

### YARN Queue Configuration (Capacity Scheduler)
\`\`\`xml
<!-- yarn-site.xml: Separate queues for ETL vs Interactive -->
<property>
  <name>yarn.scheduler.capacity.root.queues</name>
  <value>etl,interactive,migration</value>
</property>
<property>
  <name>yarn.scheduler.capacity.root.etl.capacity</name>
  <value>50</value>
</property>
<property>
  <name>yarn.scheduler.capacity.root.interactive.capacity</name>
  <value>35</value>
</property>
<property>
  <name>yarn.scheduler.capacity.root.migration.capacity</name>
  <value>15</value>
</property>
\`\`\`

## 5. Best Practices

- **Statistics first**: Always \`COMPUTE STATS\` / \`ANALYZE TABLE\` before tuning anything else
- **Target 128MB–1GB files**: Small files are the single biggest HDFS performance killer
- **Partition by date**: Daily date partitioning is the most universally effective pattern
- **Vectorize everything**: Enable Hive vectorized execution for all ORC/Parquet tables
- **Queue isolation**: Separate YARN queues for ETL, interactive, and migration workloads
- **Monitor before optimizing**: Use Spark UI, Impala Query Profile, YARN ResourceManager
- **Benchmark changes**: Always compare before/after query runtimes with same data volume

### Don'ts
- ❌ Don't optimize without measuring — premature optimization wastes time
- ❌ Don't skip \`COMPUTE STATS\` after data loads — query plans will be wrong
- ❌ Don't use \`SELECT *\` in production pipelines — project only needed columns
- ❌ Don't ignore GC pauses in Spark — they indicate memory pressure

## 6. Common Issues & Troubleshooting

| Issue | Root Cause | Resolution |
|---|---|---|
| Impala query 10x slower after load | Stale statistics | \`COMPUTE INCREMENTAL STATS partition\` |
| Spark stage stuck at 99% | Data skew on join key | Enable AQE skew join; salt hot keys |
| HDFS NameNode load spike | Thousands of small files | File compaction job; merge on write |
| YARN job queued for hours | Queue capacity exceeded | Increase queue or defer non-critical jobs |
| Hive query slower after migration | Legacy stats invalid | Re-run \`ANALYZE TABLE\` on all tables |
| OOM in Impala aggregation | High-cardinality GROUP BY | Enable spill-to-disk; increase memory limit |

## 7. Performance & Optimization

### Benchmarking Framework
\`\`\`python
import time
from pyspark.sql import SparkSession

def benchmark_query(description: str, query: str, iterations: int = 3):
    """Run a query N times and report average execution time."""
    spark = SparkSession.builder.appName("Benchmark").getOrCreate()
    times = []
    for i in range(iterations):
        start = time.time()
        spark.sql(query).count()
        elapsed = time.time() - start
        times.append(elapsed)
        print(f"  Run {i+1}: {elapsed:.2f}s")
    avg = sum(times) / len(times)
    print(f"{description}: avg={avg:.2f}s | min={min(times):.2f}s | max={max(times):.2f}s")
    return avg
\`\`\`

### Key Performance Targets (SLA)

| Workload Type | Target SLA | Action if Exceeded |
|---|---|---|
| Interactive Impala query | < 10 seconds | COMPUTE STATS, add partition filter |
| Daily ETL batch | < 4 hours | Parallelize, optimize joins |
| Spark streaming lag | < 5 minutes | Add executors, optimize deserialize |
| File compaction job | < 1 hour per zone | Parallelize by partition |

## 8. Governance & Compliance

- **Performance SLAs**: Define and track SLAs per workload; alert when breached
- **Resource governance**: YARN queue limits prevent one team monopolizing cluster
- **Benchmark logging**: Log all benchmark runs in control table for trend analysis
- **Capacity planning**: Monthly review of resource utilization for capacity requests
- **Cost attribution**: Tag YARN applications with team/project for showback reporting

## 9. Tools & Technologies

| Tool | Purpose |
|---|---|
| Spark UI | Real-time Spark job monitoring and DAG visualization |
| Impala Query Profile | Per-node query execution analysis |
| Cloudera Manager | YARN resource utilization and cluster health |
| Hive EXPLAIN | Query plan analysis before execution |
| Apache Ganglia / Grafana | Infrastructure-level CPU, memory, network metrics |
| YARN ResourceManager UI | Queue utilization and job scheduling |

## 10. Real-World Use Cases

**NSE Trade Report Optimization:**
- Impala query on 8B row fact_trade: reduced from 4m 20s to 18s by enabling \`COMPUTE INCREMENTAL STATS\`
- Added partition pruning on \`trade_date\`; eliminated 95% of I/O

**Banking Nightly ETL (3.5h → 28min):**
- Small file compaction reduced 14,000 files to 180 per partition
- Spark broadcast join on dim tables eliminated 3 shuffle stages
- Dynamic allocation scaled executors from 20 to 80 during peak processing

## 11. References

- [Cloudera Impala Performance Guide](https://docs.cloudera.com/documentation/enterprise/6/6.3/topics/impala_performance.html)
- [Apache Spark Tuning Guide](https://spark.apache.org/docs/latest/tuning.html)
- [Hive Performance Tuning](https://cwiki.apache.org/confluence/display/Hive/LanguageManual+Optimization)
- [YARN Capacity Scheduler](https://hadoop.apache.org/docs/current/hadoop-yarn/hadoop-yarn-site/CapacityScheduler.html)
- [Parquet Format Performance](https://parquet.apache.org/docs/file-format/)
`,
  "docs/data-retention.md": `# Data Retention & Archival

## 1. Overview
Data Retention defines how long data is stored in each zone of the Data Warehouse before being archived, compressed, or purged. A well-designed retention framework reduces storage costs, maintains regulatory compliance, and ensures the platform does not accumulate unbounded data debt.

Enterprise data platforms must balance business needs for historical data access with storage costs and governance risks. Retention policies must be automated, auditable, and aligned with regulatory requirements such as RBI, SEBI, and GDPR.

## 2. Architecture Context

\`\`\`
[Data Lifecycle Flow]

  Raw Zone          Curated Zone      Mart Zone         Archive Zone
  (HDFS/S3)    →   (HDFS/S3)    →   (HDFS/S3)    →   (Cold Storage)
  Retain: 90d       Retain: 3y        Retain: 5y        Retain: 7-10y
       │                 │                 │                  │
  Auto-purge        Compress +       Aggregate +        Glacier / ADLS
  after 90d         archive 3y+      archive 5y+        Cold / Tape
\`\`\`

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
\`\`\`sql
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
\`\`\`

### Automated Retention Cleanup Job (PySpark)
\`\`\`python
from pyspark.sql import SparkSession
from datetime import datetime, timedelta
import subprocess

spark = SparkSession.builder.appName("RetentionCleanup").getOrCreate()

def purge_old_partitions(table_path: str, retain_days: int, dry_run: bool = True):
    cutoff_date = (datetime.today() - timedelta(days=retain_days)).strftime('%Y-%m-%d')
    result = subprocess.run(['hdfs', 'dfs', '-ls', table_path], capture_output=True, text=True)
    
    for line in result.stdout.strip().split('\\n'):
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
\`\`\`

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
`,
  "docs/reporting-layer.md": `# Reporting & Consumption Layer

## 1. Overview
The Reporting and Consumption Layer is the final stage of the Data Warehouse architecture where data is presented to end-users and applications for decision-making. This layer provides high-performance access to curated datasets, aggregated marts, and real-time feeds using BI tools, custom applications, and SQL interfaces.

Efficient consumption design ensures that business users can retrieve insights quickly without needing to understand the underlying technical complexities of the data lake.

## 2. Architecture Context

\`\`\`
[Consumption Patterns]

  Curated/Mart Zone ───────────┐
       │                       │
  ┌────▼────┐             ┌────▼────┐             ┌────▼────┐
  │ BI Tool │             │ SQL API │             │ Custom  │
  │(Tableau)│             │(Impala) │             │  App    │
  └─────────┘             └─────────┘             └─────────┘
\`\`\`

**Key Engines:**
- **Apache Impala**: Primary engine for low-latency, interactive BI queries.
- **Hive LLAP**: Used for complex, large-scale analytical reporting.
- **JDBC/ODBC**: Standard interfaces for connecting external tools to the DWH.

## 3. Core Concepts

| Concept | Description |
|---|---|
| **Semantic Layer** | A business-friendly abstraction of complex data structures. |
| **Materialized View** | Pre-computed result sets stored for fast retrieval. |
| **Star Schema** | Preferred modeling pattern for BI tool performance. |
| **Flat Table (OBT)** | One Big Table approach to minimize joins for end-users. |
| **Ad-hoc Query** | Unplanned queries executed directly by analysts. |
| **Caching** | Storing frequently accessed results in memory (e.g., Impala Caching). |

## 4. Detailed Design / Implementation

### Impala Performance Tuning for BI
\`\`\`sql
-- Compute stats to help optimizer
COMPUTE STATS mart.sales_summary;

-- Use hints for optimal join strategy if needed
SELECT /* +straight_join */ 
    f.sale_id, d.customer_name 
FROM fact_sales f 
JOIN dim_customer d ON f.cust_id = d.cust_id;
\`\`\`

### Standard View for Semantic Layer
\`\`\`sql
CREATE VIEW mart.vw_customer_revenue AS
SELECT 
    c.customer_name,
    c.segment,
    SUM(f.revenue) as total_revenue,
    f.business_date
FROM curated.fact_orders f
JOIN curated.dim_customer c ON f.customer_sk = c.customer_sk
WHERE c.is_current = true
GROUP BY c.customer_name, c.segment, f.business_date;
\`\`\`

## 5. Best Practices
- **Aggregate early**: Use batch jobs to create summary tables (Marts) for BI tools.
- **Filter at source**: BI tools should push filters down to the SQL engine.
- **Avoid SELECT ***: Always specify columns to reduce I/O.
- **Standardize Joins**: Use Star Schema (Fact and Dimensions) for predictable performance.
- **Monitor Query Workload**: Use Cloudera Manager or Impala Query Profiles to identify slow reports.

## 6. Common Issues & Troubleshooting
- **Slow Dashboards**: Often caused by complex joins or lack of table statistics.
- **Connection Failures**: Check JDBC/ODBC driver compatibility and Knox gateway settings.
- **Data Mismatch**: Ensure BI tools are pointing to the correct Curated/Mart version.

## 7. Performance & Optimization
- **Impala Admission Control**: Manage concurrent query limits to prevent resource exhaustion.
- **Result Set Caching**: Enable caching for frequently run dashboard queries.
- **Partition Pruning**: Ensure all consumption queries use partition columns in WHERE clauses.

## 8. Governance & Compliance
- **Row-Level Security**: Enforce data access restrictions via Ranger row filters.
- **Audit Logs**: Track who is accessing which reports and datasets.
- **PII Masking**: Ensure sensitive fields are masked in the consumption layer.

## 9. Tools & Technologies
- **BI Tools**: Tableau, Power BI, SAP BusinessObjects.
- **SQL Engines**: Apache Impala, Hive LLAP.
- **Connectivity**: Apache Knox (Secure Gateway), JDBC/ODBC.

## 10. Real-World Use Cases
- **Executive Dashboards**: Real-time sales performance and KPI tracking using Impala.
- **Regulatory Reporting**: End-of-month financial reports generated via Hive LLAP.

## 11. References
- [Cloudera BI Integration Guide](https://docs.cloudera.com)
- [Tableau Spark/Hive Connection Best Practices](https://help.tableau.com)
`,
  "docs/monitoring-observability.md": `# Monitoring & Observability

## 1. Overview
Monitoring and Observability are critical for maintaining the health, performance, and reliability of an enterprise data platform. While monitoring tells you *when* something is wrong (via alerts), observability helps you understand *why* it is wrong by providing deep insights into system internals, job execution, and data flows.

In a Cloudera ecosystem, this involves tracking cluster health, service availability, YARN resource utilization, and individual job performance (Spark, Hive, Impala).

## 2. Architecture Context

\`\`\`
[Observability Stack]

  Infrastructure Metrics  ──▶ Cloudera Manager / Prometheus
  Job Execution Logs      ──▶ Spark History Server / Yarn Logs
  Data Quality Metrics    ──▶ DQ Validation Logs / Atlas
  Service Audits          ──▶ Ranger Audit / Cloudera Navigator
\`\`\`

**Key Metrics to Track:**
- **Cluster Level**: CPU/Memory/Disk utilization across nodes.
- **Service Level**: HDFS NameNode RPC latency, Impala query concurrency.
- **Job Level**: Spark executor GC time, shuffle spill, task skew.
- **Data Level**: Pipeline latency, record count variances, DQ failure rates.

## 3. Core Concepts

| Concept | Description |
|---|---|
| **Logging** | Detailed records of events (System logs, App logs). |
| **Metrics** | Numerical data representing system state over time (CPU %, IOPS). |
| **Tracing** | Tracking a request/job across multiple services. |
| **Alerting** | Notifications triggered when metrics cross predefined thresholds. |
| **Heartbeat** | Regular signals indicating a service or agent is alive. |
| **Drift Monitoring** | Detecting changes in data distribution or schema over time. |

## 4. Detailed Design / Implementation

### Monitoring YARN Application Status (CLI)
\`\`\`bash
# List all running applications
yarn application -list

# Get detailed status of a specific job
yarn application -status application_123456789_0001

# Fetch logs for a completed application
yarn logs -applicationId application_123456789_0001 > job_logs.txt
\`\`\`

### Tracking Spark Performance via Spark UI
Developers should monitor the following in the Spark UI:
1. **Stages Tab**: Look for stages with high "Shuffle Read/Write" or "Spill (Memory/Disk)".
2. **Tasks Tab**: Identify "Task Skew" where max task time is significantly higher than median.
3. **Executors Tab**: Check for high "GC Time" (>10% of total task time).

### Custom Alerting Script (Python)
\`\`\`python
import requests

def check_service_health(cm_host, service_name):
    # Mock CM API call
    api_url = f"http://{cm_host}:7180/api/v19/clusters/Cluster1/services/{service_name}"
    response = requests.get(api_url, auth=('admin', 'admin'))
    status = response.json().get('entityStatus')
    
    if status != 'GOOD_HEALTH':
        send_slack_alert(f"Service {service_name} is in status: {status}")

def send_slack_alert(message):
    webhook_url = "https://hooks.slack.com/services/XXXXX"
    requests.post(webhook_url, json={"text": message})
\`\`\`

## 5. Best Practices
- **Centralize Logs**: Aggregate logs into a central searchable store (e.g., ELK stack or Cloudera SDX).
- **Define Baselines**: Understand "normal" performance to accurately set alert thresholds.
- **Implement Self-Healing**: Automate restarts of non-critical failed components.
- **Monitor Data Pipelines**: Don't just monitor infrastructure; track pipeline latency and success rates.
- **Visual Dashboards**: Use Grafana or Cloudera Manager charts for real-time visibility.

## 6. Common Issues & Troubleshooting
- **Missing Logs**: Often due to YARN log aggregation being disabled or HDFS being full.
- **Delayed Alerts**: Caused by high monitoring agent latency or network congestion.
- **False Positives**: Alerts triggered by transient spikes. Solution: Use moving averages for thresholds.

## 7. Performance & Optimization
- **Agent Tuning**: Minimize the overhead of monitoring agents on compute nodes.
- **Log Retention**: Implement a cleanup policy for old logs to save storage.
- **Efficient Querying**: Ensure monitoring dashboards don't overwhelm the metadata database.

## 8. Governance & Compliance
- **Audit Trails**: Retain service and access audit logs for regulatory inspections.
- **Compliance Reporting**: Generate monthly availability and performance reports.

## 9. Tools & Technologies
- **Cloudera Manager**: Comprehensive cluster monitoring and administration.
- **Prometheus & Grafana**: Modern stack for metric collection and visualization.
- **ELK Stack**: For log aggregation and search.
- **Spark History Server**: Post-execution job analysis.

## 10. Real-World Use Cases
- **Proactive Scaling**: Automatically adding executors based on YARN queue backlogs.
- **Incident Management**: Using log correlation to identify the root cause of a cluster-wide slowdown.

## 11. References
- [Cloudera Monitoring Guide](https://docs.cloudera.com)
- [Prometheus Documentation](https://prometheus.io/docs)
`,
  "docs/design-patterns.md": `# Best Practices & Design Patterns

## 1. Overview
Design patterns and best practices provide standardized solutions to recurring challenges in data engineering and warehouse architecture. Following these established patterns ensures that pipelines are scalable, maintainable, and robust against failures.

This document serves as a reference for the common architectural and development patterns used across the Smart Analytica CoE.

## 2. Architecture Context

\`\`\`
[Standard Pipeline Pattern]

  Source ──▶ Landing (Raw) ──▶ Cleansing (Staging) ──▶ Integration (Curated) ──▶ Consumption (Mart)
\`\`\`

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
| **Audit Columns** | Adding columns like \`etl_load_ts\`, \`source_sys\`, and \`batch_id\` to every table. | Traceability and debugging. |
| **Parameterization** | Using config files or variables instead of hardcoded values. | Multi-environment deployment (Dev/Prod). |

## 4. Detailed Design / Implementation

### Pattern: Idempotent Write (INSERT OVERWRITE)
Ensures that if a job fails mid-way, a re-run will overwrite the partial data rather than duplicating it.
\`\`\`sql
-- Pattern: Write to a specific partition idempotently
INSERT OVERWRITE TABLE curated.fact_sales 
PARTITION (business_date = '2024-04-01')
SELECT 
    order_id, 
    customer_id, 
    total_amount, 
    current_timestamp() as etl_load_ts
FROM staging.stg_orders;
\`\`\`

### Pattern: Watermark Management
Tracking high-watermarks in a control table.
\`\`\`python
# Pseudo-code for watermark load
last_watermark = spark.sql("SELECT MAX(watermark) FROM ctrl.watermark_log WHERE table='trades'")
new_data = spark.read.jdbc(url, table).filter(f"updated_at > '{last_watermark}'")

if not new_data.isEmpty():
    new_data.write.save(...)
    new_max = new_data.select(max("updated_at")).collect()[0][0]
    spark.sql(f"INSERT INTO ctrl.watermark_log VALUES ('trades', '{new_max}')")
\`\`\`

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
`,
  "docs/impala-migration.md": `# Impala Migration Guide

## 1. Overview
Impala migration involves moving low-latency, interactive SQL workloads from legacy Hadoop clusters (CDH/HDP) to the Cloudera Data Platform (CDP). While Impala maintains high compatibility across versions, migration requires careful handling of metadata, resource pools, and performance tuning to ensure seamless cutover for BI tools and end-users.

## 2. Architecture Context

\`\`\`
[Legacy Impala]                     [CDP Impala]
  Impala 2.x/3.x          ──▶       Impala 4.x
       │                                 │
  Hive Metastore (HMS)    ──▶       Shared SDX (HMS)
\`\`\`

**Key Improvements in CDP Impala:**
- **Multithreaded Execution**: Better CPU utilization.
- **Improved Metadata Management**: Faster Catalog service.
- **Ranger Integration**: Native tag-based and row/column level security.

## 3. Core Concepts

| Concept | Description |
|---|---|
| **Invalidate Metadata** | Re-syncing Impala's cache with the Hive Metastore. |
| **Compute Stats** | Generating statistics for the query optimizer. |
| **Admission Control** | Resource management for controlling concurrent queries. |
| **Runtime Filters** | Dynamic filtering of data during join execution. |
| **Spill to Disk** | Handling queries that exceed memory limits. |

## 4. Detailed Design / Implementation

### Metadata Migration Steps
1. **Sync Metastore**: Ensure the Hive Metastore is migrated and upgraded first.
2. **Refresh Metadata**: Run \`INVALIDATE METADATA\` for all migrated tables to populate the Impala Catalog.
3. **Migrate Resource Pools**: Re-create Impala Admission Control pools in the CDP cluster.
4. **Update Connection Strings**: Update BI tool (Tableau/Power BI) JDBC/ODBC strings to point to the new CDP Impala daemons or Knox gateway.

### Post-Migration Validation Query
\`\`\`sql
-- Run on both legacy and CDP to verify consistency
SELECT 
    COUNT(*), 
    SUM(total_amount), 
    MIN(business_date) 
FROM sales_db.fact_sales 
WHERE business_date = '2024-04-01';
\`\`\`

## 5. Best Practices
- **Re-compute Statistics**: Always run \`COMPUTE STATS\` on all tables post-migration as legacy stats may not be compatible or accurate.
- **Use Dedicated Resource Pools**: Separate exploratory users from production BI reports.
- **Limit Result Sets**: Encourage users to use \`LIMIT\` clauses to prevent memory exhaustion.
- **Avoid SELECT ***: Always specify columns to minimize network and memory overhead.

## 6. Common Issues & Troubleshooting
- **Metadata Stale**: Queries fail to find new data. *Solution: Run \`REFRESH <table>\`.*
- **Out of Memory (OOM)**: Queries failing due to insufficient memory. *Solution: Tune \`MEM_LIMIT\` or enable spill-to-disk.*
- **Slow Joins**: Often due to missing stats leading to sub-optimal join strategies (e.g., Shuffle instead of Broadcast).

## 7. Performance & Optimization
- **Partition Pruning**: Ensure queries filter on partition columns.
- **Small File Compaction**: Impala performs poorly with many small files; merge them before querying.
- **Caching**: Use \`ALTER TABLE ... SET CACHED IN 'pool'\` for frequently accessed lookup tables.

## 8. Governance & Compliance
- **Ranger Authorization**: All Impala access must be governed by Ranger policies.
- **Audit Logging**: Enable Impala audit logging to track all query executions.

## 9. Tools & Technologies
- **Impala Shell**: Command-line interface for running queries and management.
- **Cloudera Manager**: For monitoring resource pools and daemon health.
- **BI Tools**: Standard consumption tools (Tableau, Power BI).

## 10. Real-World Use Cases
- **Executive BI Migration**: Moving a critical finance dashboard from CDH to CDP with zero downtime using a parallel run strategy.

## 11. References
- [Cloudera Impala Migration Guide](https://docs.cloudera.com)
- [Apache Impala Documentation](https://impala.apache.org/docs/build/html/index.html)
`,
  "docs/spark-migration.md": `# Spark Migration Guide

## 1. Overview
Spark migration involves upgrading data processing workloads from legacy Spark versions (e.g., Spark 1.6 or 2.x) to Spark 3.x on the Cloudera Data Platform (CDP). Spark 3 brings significant performance gains through Adaptive Query Execution (AQE), but also introduces breaking changes in APIs, configuration, and dependencies.

## 2. Architecture Context

\`\`\`
[Legacy Spark]                      [CDP Spark 3]
  Spark 1.6 / 2.x         ──▶       Spark 3.2+
       │                                 │
  Scala 2.11              ──▶       Scala 2.12
  Python 2.7 / 3.6        ──▶       Python 3.8+
\`\`\`

**Key Changes in Spark 3:**
- **Adaptive Query Execution (AQE)**: Dynamic shuffle partition coalescing and join optimization.
- **Dynamic Partition Pruning**: Faster joins on partitioned tables.
- **ANSI SQL Compliance**: Stricter data type handling.

## 3. Core Concepts

| Concept | Description |
|---|---|
| **Adaptive Query Execution (AQE)** | Optimizes the query plan at runtime based on actual data statistics. |
| **Shuffle Partitions** | The number of partitions used when shuffling data. Spark 3 can coalesce these automatically. |
| **Catalog API** | Unified interface for interacting with metadata (Hive Metastore). |
| **Vectorization** | High-performance processing of columnar data (Parquet/ORC). |
| **Dependency Management** | Managing external JARs and Python packages in a cluster environment. |

## 4. Detailed Design / Implementation

### Migration Process
1. **Code Audit**: Identify deprecated APIs (e.g., \`SQLContext\`, \`HiveContext\`) and replace with \`SparkSession\`.
2. **Scala/Python Upgrade**: Ensure code is compatible with Scala 2.12 and Python 3.8+.
3. **Configuration Update**: Review \`spark-defaults.conf\` and job-specific configs.
4. **Dependency Review**: Re-compile custom JARs against Spark 3 libraries.
5. **Validation**: Compare outputs between legacy and Spark 3 versions.

### Example: Enabling AQE in Spark 3
\`\`\`python
from pyspark.sql import SparkSession

spark = SparkSession.builder \\
    .appName("CDP_Migration_Job") \\
    .config("spark.sql.adaptive.enabled", "true") \\
    .config("spark.sql.adaptive.coalescePartitions.enabled", "true") \\
    .getOrCreate()
\`\`\`

## 5. Best Practices
- **Use DataFrames/Datasets**: Avoid RDDs to leverage the Catalyst Optimizer.
- **Enable AQE**: It is the single most important performance feature in Spark 3.
- **Filter Early**: Push down filters as close to the source as possible.
- **Avoid UDFs**: Use built-in Spark SQL functions for better vectorization.
- **Manage Partitioning**: Use \`repartition()\` or \`coalesce()\` strategically to control file counts.

## 6. Common Issues & Troubleshooting
- **ClassNotFoundError**: Usually due to mismatched JAR versions in the classpath.
- **OOM Errors**: Often requires tuning \`spark.executor.memory\` and \`spark.memory.fraction\`.
- **Changed Behavior**: Spark 3 is more strict with timestamps and numeric types. *Solution: Enable \`spark.sql.legacy.timeParserPolicy=LEGACY\` if needed.*

## 7. Performance & Optimization
- **Dynamic Partition Pruning**: Automatically enabled; ensure joins are on partition columns.
- **Broadcast Joins**: Increase \`spark.sql.autoBroadcastJoinThreshold\` for small dimension tables.
- **Shuffle Optimization**: Let AQE handle \`spark.sql.shuffle.partitions\` automatically.

## 8. Governance & Compliance
- **Lineage Capture**: Ensure Atlas hooks are configured for Spark 3.
- **Secure Integration**: Use Kerberos authentication for HDFS and Hive access.

## 9. Tools & Technologies
- **Spark Shell / PySpark**: For interactive testing.
- **Spark UI**: The primary tool for debugging and profiling.
- **Maven/SBT**: For building Scala/Java applications.

## 10. Real-World Use Cases
- **Batch ETL Migration**: Upgrading a massive daily data ingestion pipeline from Spark 2.4 to Spark 3.2 with a 30% performance improvement.

## 11. References
- [Cloudera Spark 3 Migration Guide](https://docs.cloudera.com)
- [Apache Spark 3.0 Release Notes](https://spark.apache.org/releases/spark-release-3-0-0.html)
`,
  "docs/hdfs-migration.md": `# HDFS Migration Guide

## 1. Overview
HDFS migration is the process of moving large-scale distributed data from legacy Hadoop clusters (CDH/HDP) to the Cloudera Data Platform (CDP). This involves not just copying files, but also preserving permissions (ACLs), managing quotas, and ensuring data integrity during the transfer of Petabytes of data.

## 2. Architecture Context

\`\`\`
[Source HDFS]                      [Target CDP HDFS/S3]
  CDH 5.x / 6.x          ──▶        CDP PvC Base / Public Cloud
       │                                 │
  DistCP (MapReduce)     ────────▶   Replication Manager
\`\`\`

**Key Tools:**
- **Apache DistCP**: The industry-standard tool for parallel data copying.
- **Cloudera Replication Manager**: A GUI-based tool for managing and scheduling migration policies.

## 3. Core Concepts

| Concept | Description |
|---|---|
| **DistCP (Distributed Copy)** | A tool used for large-inter/intra-cluster copying using MapReduce. |
| **ACL (Access Control List)** | Granular permissions attached to HDFS files and directories. |
| **Snapshot** | A read-only point-in-time copy of the file system used for consistent backup/migration. |
| **Checksum** | A mathematical value used to verify that data hasn't been corrupted during transfer. |
| **Quotas** | Limits on the number of files or the amount of disk space a directory can use. |

## 4. Detailed Design / Implementation

### Migration Process using DistCP
1. **Source Snapshot**: Create a snapshot of the source directory to ensure a consistent point-in-time copy.
2. **Execution**: Run DistCP from the target cluster (pull model) or source cluster (push model).
3. **Verification**: Compare source and target checksums and file counts.
4. **ACL Migration**: Ensure the \`-pa\` (preserve attributes) flag is used to keep permissions.

### Example: DistCP Command
\`\`\`bash
hadoop distcp \\
  -Dmapreduce.job.queuename=migration \\
  -update \\
  -skipcrccheck \\
  -pb \\
  hdfs://source-nn:8020/warehouse/raw/ \\
  hdfs://target-nn:8020/warehouse/raw/
\`\`\`

## 5. Best Practices
- **Use the Pull Model**: Run DistCP from the target (CDP) cluster for better security and resource management.
- **Preserve Attributes**: Use \`-pb\` to preserve blocks, \`-pt\` for timestamps, and \`-pa\` for ACLs.
- **Tune Parallelism**: Use the \`-m\` flag to control the number of mappers based on cluster capacity and network bandwidth.
- **Verify Data Integrity**: Always perform a post-copy validation using file counts and size comparisons.
- **Incremental Copy**: Use the \`-update\` flag to copy only changed or new files in subsequent runs.

## 6. Common Issues & Troubleshooting
- **Network Bandwidth Saturation**: Migrations can overwhelm inter-cluster links. *Solution: Use \`-bandwidth\` limit.*
- **Permission Denied**: Often due to mismatched UIDs/GIDs between clusters. *Solution: Ensure ID consistency or use \`chown -R\` post-migration.*
- **Connection Timeout**: Large metadata scans can cause DistCP to time out. *Solution: Increase RPC timeout settings.*

## 7. Performance & Optimization
- **Mappers Management**: Set mappers (\`-m\`) proportional to the number of files and total data size.
- **File List Filtering**: Use filters to exclude temporary or trash directories.

## 8. Governance & Compliance
- **Secure Transfer**: Use \`webhdfs\` over SSL (swebhdfs) for sensitive data.
- **Audit Logs**: Maintain logs of all DistCP jobs for compliance verification.

## 9. Tools & Technologies
- **Apache DistCP**: Core command-line migration engine.
- **Cloudera Manager**: Monitoring replication jobs and HDFS health.
- **Replication Manager**: For policy-based, automated data movement.

## 10. Real-World Use Cases
- **Enterprise Data Lake Migration**: Moving 5PB of financial trade data from on-prem CDH to CDP Private Cloud with full ACL preservation.

## 11. References
- [Apache DistCP Guide](https://hadoop.apache.org/docs/current/hadoop-distcp/DistCp.html)
- [Cloudera Replication Manager Documentation](https://docs.cloudera.com)
`,
  "docs/security-migration.md": `# Security & Governance Migration

## 1. Overview
Security and Governance migration is the most critical and complex part of a CDP migration. It involves moving authentication (Kerberos/LDAP), authorization (Ranger policies), and metadata/lineage (Atlas) from legacy systems to the CDP Shared Data Experience (SDX). A failed security migration results in either unauthorized data access or widespread job failures due to "Permission Denied" errors.

## 2. Architecture Context

\`\`\`
[Legacy Security]                   [CDP SDX Security]
  Sentry / Ranger         ──▶       Apache Ranger (Shared)
  Navigator               ──▶       Apache Atlas (Shared)
  Active Directory        ──▶       FreeIPA / AD (Unified)
\`\`\`

**Key Transitions:**
- **Sentry to Ranger**: Migration of ACLs and roles to Ranger policies.
- **Navigator to Atlas**: Transition of metadata and lineage tracking.
- **Authentication**: Moving from standalone KDCs to a unified identity management system like FreeIPA or centralized Active Directory.

## 3. Core Concepts

| Concept | Description |
|---|---|
| **Kerberos** | Primary authentication protocol for Hadoop services. |
| **Apache Ranger** | Centralized framework for authorization and audit. |
| **Apache Atlas** | Metadata management and lineage tracking. |
| **LDAP/AD Sync** | Synchronizing users and groups from the corporate directory into CDP. |
| **Tag-Based Security** | Policies applied based on data classification tags (PII, Sensitive) rather than just paths. |

## 4. Detailed Design / Implementation

### Security Migration Steps
1. **Identity Setup**: Ensure all users and groups are correctly synced to the CDP cluster.
2. **Policy Migration**: 
   - For Sentry: Use the Cloudera Sentry-to-Ranger conversion tool.
   - For Ranger: Export policies from legacy and import into CDP Ranger.
3. **Audit Configuration**: Configure Ranger to log audits to HDFS/Solr in the new cluster.
4. **Metadata Migration**: Use Atlas import/export tools to move technical and business metadata.

### Example: Ranger Policy Export (CLI)
\`\`\`bash
# Export policies for the Hive service
curl -u admin:password -X GET "http://legacy-ranger:6080/service/plugins/policies/exportJson?serviceName=hive" > hive_policies.json
\`\`\`

## 5. Best Practices
- **Standardize Groups**: Manage permissions via AD groups rather than individual users.
- **Test Before Cutover**: Use a "Parallel Run" to verify that Ranger policies in CDP correctly block/allow access as expected.
- **Clean Up Stale Policies**: Use migration as an opportunity to remove unused or redundant security rules.
- **Enable Tag-Based Masking**: Leverage Atlas tags to automatically mask PII data for unauthorized users.

## 6. Common Issues & Troubleshooting
- **Principal Mismatch**: Service accounts in CDP have different Kerberos principal names than legacy.
- **Sync Lag**: New AD users not showing up in Ranger. *Solution: Check Ranger UserSync logs.*
- **Policy Overlap**: Multiple policies granting conflicting access. *Solution: Ranger evaluates policies based on priority; review order.*

## 7. Performance & Optimization
- **Policy Caching**: Ranger plugins cache policies locally to prevent latency during authorization checks.
- **Audit Throttling**: Limit audit logging for high-volume services like HDFS to prevent Solr/HDFS overload.

## 8. Governance & Compliance
- **GDPR/PDPA Compliance**: Use Atlas to track personal data across the entire lifecycle.
- **Separation of Duties**: Ensure different admins manage security policies vs. platform infrastructure.

## 9. Tools & Technologies
- **Apache Ranger**: The heart of CDP authorization.
- **Apache Atlas**: The core of CDP metadata and lineage.
- **FreeIPA**: Identity management solution.

## 10. Real-World Use Cases
- **Banking Compliance Migration**: Migrating 1,500+ security policies and 400 Atlas classifications from CDH to CDP while maintaining strict regulatory compliance for RBI/SEBI.

## 11. References
- [Cloudera Security Migration Guide](https://docs.cloudera.com)
- [Apache Ranger Official Docs](https://ranger.apache.org)
- [Apache Atlas Official Docs](https://atlas.apache.org)
`,
  "docs/workflow-migration.md": `# Workflow & Orchestration Migration

## 1. Overview
Workflow migration involves moving job scheduling and orchestration logic from legacy systems (Oozie, Cron) to modern orchestrators like Apache Airflow or upgraded Apache Oozie on CDP. The goal is to ensure that data pipelines continue to run in the correct sequence, with robust error handling and dependency management, on the new platform.

## 2. Architecture Context

\`\`\`
[Legacy Orchestration]              [CDP Orchestration]
  Apache Oozie (XML)      ──▶       Apache Airflow (Python)
  Control-M / Autosys     ──▶       Modernized Connectors
\`\`\`

**Key Improvements:**
- **Apache Airflow**: Python-based DAGs provide more flexibility and dynamic orchestration compared to Oozie XML.
- **Cloudera Data Engineering (CDE)**: Built-in Airflow service for managed orchestration.

## 3. Core Concepts

| Concept | Description |
|---|---|
| **DAG (Directed Acyclic Graph)** | A collection of all tasks you want to run, organized in a way that reflects their relationships and dependencies. |
| **Operator** | A template for a predefined task (e.g., SparkSubmitOperator, BashOperator). |
| **Task Instance** | A specific run of a task for a given execution date. |
| **SLA (Service Level Agreement)** | Time by which a task or DAG should complete. |
| **Backfilling** | Running DAGs for historical dates. |

## 4. Detailed Design / Implementation

### Migration from Oozie to Airflow
1. **XML to Python Mapping**: Translate Oozie actions (Spark, Hive, Shell) into Airflow operators.
2. **Dependency Mapping**: Re-map \`<ok to="..." />\` and \`<error to="..." />\` into Airflow's \`>>\` and \`<<\` syntax.
3. **Environment Variables**: Move Oozie properties into Airflow Variables or Connection secrets.
4. **Credential Handling**: Transition from Oozie Kerberos configuration to Airflow Hooks/Connections.

### Example: Airflow DAG for Spark Job
\`\`\`python
from airflow import DAG
from airflow.providers.apache.spark.operators.spark_submit import SparkSubmitOperator
from datetime import datetime

with DAG('daily_trade_load', start_date=datetime(2024, 4, 1), schedule_interval='@daily') as dag:
    
    load_trades = SparkSubmitOperator(
        task_id='load_trades_task',
        application='/path/to/spark_job.py',
        conn_id='spark_default',
        conf={'spark.executor.memory': '4g'}
    )
\`\`\`

## 5. Best Practices
- **Prefer Airflow for New Workloads**: Use Airflow's rich ecosystem and Python flexibility for all new CDP pipelines.
- **Modularize DAGs**: Keep DAG files small and use \`SubDAGs\` or \`TaskGroups\` for complex logic.
- **Use Connections**: Never hardcode credentials; use the Airflow Connection manager.
- **Implement Retries**: Configure \`retries\` and \`retry_delay\` at the DAG or task level.

## 6. Common Issues & Troubleshooting
- **Zombie Tasks**: Tasks that appear running but have no corresponding process. *Solution: Check Airflow Scheduler logs.*
- **Dependency Deadlocks**: Complex dependencies preventing jobs from starting. *Solution: Review DAG trigger rules.*
- **Resource Contention**: Too many concurrent DAGs overwhelming cluster resources. *Solution: Use Pools to limit concurrency.*

## 7. Performance & Optimization
- **Parallelism Tuning**: Adjust \`max_active_runs\` and \`parallelism\` in \`airflow.cfg\`.
- **Operator Selection**: Use specialized operators (e.g., \`HiveOperator\`) rather than generic \`BashOperator\` for better monitoring.

## 8. Governance & Compliance
- **Pipeline Lineage**: Integrate Airflow with Atlas to track job execution lineage.
- **Access Control**: Use Airflow RBAC to restrict who can trigger or edit DAGs.

## 9. Tools & Technologies
- **Apache Airflow**: Modern orchestration standard.
- **Apache Oozie**: Legacy XML-based workflow engine.
- **CDE (Cloudera Data Engineering)**: Managed Airflow service.

## 10. Real-World Use Cases
- **Legacy Migration**: Converting 500+ Oozie workflows to Airflow DAGs during a platform modernization project, reducing maintenance overhead by 40%.

## 11. References
- [Apache Airflow Documentation](https://airflow.apache.org/docs/)
- [Cloudera Oozie to Airflow Migration](https://docs.cloudera.com)
`,
  "docs/etl-integration.md": `# ETL Tooling & Integration

## 1. Overview
ETL (Extract, Transform, Load) tooling and integration migration focuses on moving third-party ETL engines like Informatica, DataStage, or Talend to work seamlessly with the Cloudera Data Platform (CDP). This requires updating connectors, optimizing pushdown logic, and ensuring compatibility with Hive 3 ACID and Spark 3.

## 2. Architecture Context

\`\`\`
[ETL Tool]                      [CDP Platform]
  Informatica / Talend  ──▶     Hive / Impala / Spark
       │                               │
  ODBC / JDBC           ──────▶       Knox / Load Balancer
\`\`\`

**Key Integration Points:**
- **Pushdown Optimization (PDO)**: Offloading transformation logic to the DWH engine (Hive/Impala) instead of processing in the ETL server.
- **Spark Integration**: Using ETL tools as a design surface to generate Spark jobs that run on CDE.
- **HWC (Hive Warehouse Connector)**: Ensuring Spark-based ETL can read and write to Hive 3 managed tables.

## 3. Core Concepts

| Concept | Description |
|---|---|
| **Pushdown Optimization** | Executing transformation logic directly within the source or target database. |
| **Connectivity** | The drivers (JDBC/ODBC) and protocols used to communicate with CDP. |
| **Native Connectors** | Tool-specific plugins designed for high-performance interaction with HDFS/Hive. |
| **Staging Area** | Intermediate storage used by ETL tools during processing. |
| **Metadata Exchange** | Syncing ETL tool metadata with platform catalogs like Atlas. |

## 4. Detailed Design / Implementation

### Integration Steps
1. **Driver Upgrade**: Install and configure the latest Cloudera JDBC/ODBC drivers compatible with CDP.
2. **Connection Update**: Point ETL connections to the CDP HiveServer2 or Impala Coordinator (usually via Knox).
3. **Security Configuration**: Configure Kerberos/LDAP authentication within the ETL tool.
4. **Pushdown Tuning**: Re-enable and test Pushdown Optimization for Hive 3 and Spark.

### Example: Connection String via Knox
\`\`\`text
jdbc:hive2://knox-gateway:8443/default;ssl=true;transportMode=http;httpPath=gateway/cdp-proxy/hive
\`\`\`

## 5. Best Practices
- **Leverage Pushdown**: Always aim for full pushdown to leverage the distributed processing power of the CDP cluster.
- **Use High-Performance Connectors**: Prefer native CDP/Hadoop connectors over generic JDBC where available.
- **Batch Processing**: Configure the ETL tool to use batch inserts and optimized fetches.
- **Monitor Resource Usage**: Track the impact of ETL tool connections on HiveServer2 and Impala resource pools.

## 6. Common Issues & Troubleshooting
- **Driver Incompatibility**: Older drivers may not support Hive 3 ACID features. *Solution: Upgrade to the latest Cloudera drivers.*
- **Performance Degradation**: Often due to data being processed on the ETL server instead of pushed down. *Solution: Enable Pushdown Optimization.*
- **Authentication Failures**: Keytab expiry or incorrect Kerberos configuration.

## 7. Performance & Optimization
- **Parallelism**: Increase the number of concurrent sessions or mappers in the ETL tool to match cluster capacity.
- **Network Latency**: Minimize the distance between the ETL server and the CDP cluster.

## 8. Governance & Compliance
- **Credential Management**: Use secure vaults (CyberArk, HashiCorp) instead of hardcoding passwords in ETL mappings.
- **Audit Logging**: Ensure ETL tool logs are integrated into the central monitoring system.

## 9. Tools & Technologies
- **Informatica PowerCenter / IICS**: Enterprise ETL leader.
- **Talend**: Open-source and cloud-native ETL.
- **IBM DataStage**: High-performance parallel processing tool.

## 10. Real-World Use Cases
- **Hybrid ETL Integration**: Connecting an on-premise Informatica server to a CDP Public Cloud environment using the Hive Warehouse Connector for Spark.

## 11. References
- [Cloudera Informatica Integration Guide](https://docs.cloudera.com)
- [Talend with CDP Best Practices](https://help.talend.com)
`,
  "docs/post-migration.md": `# Post-Migration Tasks & Support

## 1. Overview
Post-migration tasks are the final set of activities performed after data and workloads have been moved to the Cloudera Data Platform (CDP). This phase focuses on decommission of legacy systems, stabilization of the new environment, and establishing long-term support and maintenance processes.

## 2. Architecture Context

\`\`\`
[CDP Production]                     [Legacy Decommission]
  Operationalized         ──▶        Data Freeze
  Supported               ──▶        Audit Backup
  Optimized               ──▶        Cluster Shutdown
\`\`\`

**Key Phases:**
- **Hypercare**: Intensive support period immediately following cutover.
- **Optimization**: Continuous tuning of the new environment.
- **Decommissioning**: Safe removal of legacy hardware and data.

## 3. Core Concepts

| Concept | Description |
|---|---|
| **Hypercare** | A period of increased support to quickly resolve any post-cutover issues. |
| **Data Freeze** | Disabling writes to the legacy system to prevent data divergence. |
| **Operational Handover** | Transitioning the environment from the migration team to the BAU (Business As Usual) support team. |
| **Knowledge Transfer (KT)** | Training support teams on the new CDP-specific features and configurations. |
| **Root Cause Analysis (RCA)** | Identifying the underlying cause of any failures during the hypercare period. |

## 4. Detailed Design / Implementation

### Post-Migration Checklist
1. **Decommission Legacy Writes**: Revoke write permissions on the legacy cluster once cutover is successful.
2. **Monitor Performance**: Track job runtimes and resource utilization for at least 30 days.
3. **Establish Support Rotas**: Define the L1/L2/L3 support structure for the new CDP environment.
4. **Final Audit**: Conduct a final security and data integrity audit to confirm all compliance requirements are met.
5. **Shut Down Legacy Nodes**: Progressively shut down nodes on the legacy cluster to save costs.

### Support Tier Definition
- **Tier 1 (L1)**: Initial monitoring, alert triage, and basic troubleshooting.
- **Tier 2 (L2)**: Complex issue resolution, configuration changes, and job tuning.
- **Tier 3 (L3)**: Deep platform engineering, patch management, and collaboration with Cloudera Support.

## 5. Best Practices
- **Implement a 72-hour Freeze**: Do not make any major changes to the new environment for at least 72 hours post-cutover.
- **Conduct Retro Meetings**: Document lessons learned from the migration to improve future projects.
- **Update Documentation**: Ensure all architectural diagrams and runbooks reflect the new CDP environment.
- **Training**: Provide comprehensive training for both developers and support engineers on CDP-specific tools (e.g., CDE, CDW).

## 6. Common Issues & Troubleshooting
- **Hidden Dependencies**: Jobs failing because they rely on a legacy service that was decommissioned. *Solution: Perform a thorough audit before final shutdown.*
- **Performance Drift**: Runtimes increasing over time as more workloads are added. *Solution: Continuous monitoring and optimization.*
- **Access Issues**: Users losing permissions due to incomplete policy migration.

## 7. Performance & Optimization
- **Continuous Tuning**: Re-visit Spark and Impala configs once the cluster reaches full production load.
- **Cost Management**: Use Cloudera Manager to identify under-utilized resources and optimize cloud instance usage.

## 8. Governance & Compliance
- **Final Data Archival**: Ensure a final backup of the legacy data is stored in cold storage for legal requirements before decommissioning.
- **Audit Logging**: Confirm that all production audits are being correctly captured in the new Ranger/Atlas instance.

## 9. Tools & Technologies
- **Cloudera Manager**: For ongoing health monitoring.
- **ServiceNow / Jira**: For incident and change management.
- **Atlas**: For ongoing lineage and metadata management.

## 10. Real-World Use Cases
- **Enterprise Cutover**: Successful decommission of a 200-node CDH cluster following a 6-month migration to CDP Public Cloud, resulting in 30% operational cost savings.

## 11. References
- [Cloudera Post-Upgrade Tasks](https://docs.cloudera.com)
- [ITIL Incident Management Framework](https://www.itil.org)
`,
  "docs/validation-benchmarking.md": `# Validation & Benchmarking

## 1. Overview
Validation and Benchmarking are the processes of ensuring that data and workloads migrated to the Cloudera Data Platform (CDP) are accurate, consistent, and meet performance SLAs. Validation confirms "What" was moved is correct, while Benchmarking measures "How" the new platform performs compared to the legacy system.

## 2. Architecture Context

\`\`\`
[Legacy Workload]                  [CDP Workload]
  Run Query / Job         ──▶      Run Query / Job
       │                                │
  Collect Metrics         ──▶      Collect Metrics
       │                                │
       └───────────▶ [Comparison] ◀──────┘
\`\`\`

**Key Goals:**
- **Data Reconciliation**: Ensuring zero data loss or corruption during migration.
- **Performance Parity**: Confirming that jobs run at least as fast on CDP as they did on legacy.
- **SLA Verification**: Testing that the new environment can handle production peak loads.

## 3. Core Concepts

| Concept | Description |
|---|---|
| **Reconciliation** | Matching record counts, checksums, and aggregate sums between source and target. |
| **Baseline** | The recorded performance of a workload on the legacy cluster used as a comparison point. |
| **Warm-up Run** | Initial execution of a query to populate caches before measuring performance. |
| **Throughput** | The amount of data or number of queries processed per unit of time. |
| **Latency** | The time taken for a single operation or query to complete. |

## 4. Detailed Design / Implementation

### Data Validation Strategy
1. **Count Check**: Compare \`COUNT(*)\` for every table/partition between legacy and CDP.
2. **Checksum Check**: Use HDFS checksums for large files to verify binary identity.
3. **Aggregate Comparison**: Compare sums of numeric columns (e.g., \`SUM(total_amount)\`) to detect data corruption.
4. **Sample Row Check**: Compare a small percentage of full rows using hashing.

### Performance Benchmarking Steps
1. **Define Test Cases**: Select representative queries and jobs (e.g., Daily ETL, BI Dashboard).
2. **Execute Baseline**: Record runtime, CPU, and memory usage on the legacy cluster.
3. **Execute on CDP**: Run the same workloads on the CDP cluster (ensure comparable resource allocation).
4. **Compare & Tune**: Analyze differences and apply CDP-specific optimizations (e.g., AQE, Impala 4.x features).

### Example: Validation Script (PySpark)
\`\`\`python
def validate_table(table_name, partition_col, partition_val):
    legacy_count = spark.sql(f"SELECT COUNT(*) FROM legacy.{table_name} WHERE {partition_col}='{partition_val}'").collect()[0][0]
    cdp_count = spark.sql(f"SELECT COUNT(*) FROM cdp.{table_name} WHERE {partition_col}='{partition_val}'").collect()[0][0]
    
    if legacy_count == cdp_count:
        print(f"Validation SUCCESS for {table_name}: {legacy_count} rows.")
    else:
        print(f"Validation FAILED for {table_name}: Legacy={legacy_count}, CDP={cdp_count}")
\`\`\`

## 5. Best Practices
- **Automate Validation**: Use scripts to run hundreds of reconciliation checks rather than manual SQL.
- **Parallel Run**: Run legacy and CDP systems in parallel for a fixed period (e.g., 2 weeks) and compare outputs.
- **Test with Production Data**: Benchmarks should use actual production data volumes to be meaningful.
- **Document All Results**: Maintain a formal validation report signed off by business owners before cutover.

## 6. Common Issues & Troubleshooting
- **Inconsistent Results**: Often due to non-deterministic SQL or mid-migration data updates on the legacy cluster.
- **Performance Degradation**: Often caused by different default configurations or un-tuned YARN queues.
- **Data Type Mismatches**: Subtle differences in how Spark 3 vs Spark 2 handles decimal or timestamp precision.

## 7. Performance & Optimization
- **Cold vs Warm Cache**: Be aware of caching effects; always perform multiple benchmark runs.
- **Resource Matching**: Ensure the CDP test environment has similar CPU/Memory/IO characteristics to the legacy baseline.

## 8. Governance & Compliance
- **Audit Sign-off**: Final validation reports are required for regulatory compliance (e.g., for RBI/SEBI reporting systems).
- **Independent Verification**: Ideally, have a separate QA/Testing team perform the validation.

## 9. Tools & Technologies
- **Apache Spark**: For bulk data validation and comparison.
- **Beeline / Impala-shell**: For running validation queries.
- **TPC-DS / TPC-H**: Standard industry benchmarks for SQL performance.

## 10. Real-World Use Cases
- **Financial Report Validation**: Reconciling 10 years of historical ledger data (100TB) with zero variance between CDH and CDP.

## 11. References
- [Cloudera Data Validation Guide](https://docs.cloudera.com)
- [TPC Benchmarks Official Site](http://www.tpc.org)
`,
  "docs/arch-best-practices.md": `# Architecture Best Practices

## 1. Overview
Architecture best practices provide the foundational principles for designing and managing a robust, scalable, and secure data platform on Cloudera. These standards ensure that individual components work harmoniously to meet enterprise-level requirements for performance, reliability, and governance.

## 2. Architecture Context

\`\`\`
[Core Architectural Pillars]

  Scalability      ──▶ Can the platform grow with data volume?
  Performance      ──▶ Are user SLAs and batch windows met?
  Governance       ──▶ Is data secure, auditable, and understood?
  Reliability      ──▶ Is the platform resilient to failures?
  Cost Efficiency  ──▶ Is the platform delivering ROI?
\`\`\`

**Key Architectural Principles:**
- **Decouple Everything**: Separate storage from compute, and producers from consumers.
- **Automate First**: If it happens more than once, it should be automated (Infrastructure as Code, CI/CD).
- **Design for Failure**: Expect hardware and network failures; build resilience into the software layer.

## 3. Core Concepts

| Concept | Description |
|---|---|
| **Multi-Tenancy** | Supporting multiple teams/workloads on a single shared platform with resource isolation. |
| **Zone-Based Architecture** | Organizing storage into Raw, Staging, Curated, and Mart zones. |
| **Data Lakehouse** | Combining the benefits of data lakes (scale, flex) with data warehouses (SQL, ACID). |
| **Shared Data Experience (SDX)** | Centralized security, governance, and metadata across all data services. |
| **Infrastructure as Code (IaC)** | Managing cluster and cloud resources via code (Terraform, Ansible). |

## 4. Detailed Design / Implementation

### Architectural Standards
1. **File Formats**: Standardize on Apache Parquet or ORC for all analytical data. Use Avro for streaming data in Kafka.
2. **Compression**: Use Snappy for a good balance of speed and ratio. Use Gzip or Zstd for long-term archival.
3. **Partitioning**: Always partition large tables (>10GB) by a logical key, typically business date.
4. **Naming Conventions**: Enforce a consistent naming standard for databases, tables, and columns (e.g., snake_case).

### Layered Storage Standard
- **Raw Zone**: Immutable, source-format data. No direct user access.
- **Staging Zone**: Cleaned, integrated data. Source of truth for developers.
- **Curated Zone**: Aggregated, subject-specific data. Primary consumption for BI tools.

## 5. Best Practices
- **Implement Row/Column Level Security**: Don't just rely on database-level permissions; use Ranger for fine-grained control.
- **Enable High Availability (HA)**: Ensure critical services like NameNode and HiveServer2 are configured for HA.
- **Monitor Resource Pools**: Use YARN Capacity Scheduler or Admission Control to prevent resource starvation.
- **Use Cloudera SDX**: Leverage the unified security and governance framework to simplify platform management.

## 6. Common Issues & Troubleshooting
- **Monolithic Designs**: Hard to scale and maintain. *Solution: Adopt a modular, service-oriented architecture.*
- **Security Afterthought**: Building security late in the project leads to rework. *Solution: Implement "Security by Design".*
- **Technical Debt**: Ignoring best practices for short-term gains. *Solution: Conduct regular architecture reviews.*

## 7. Performance & Optimization
- **Right-Sizing**: Match compute resources to the specific workload (e.g., more memory for Spark, more CPU for Impala).
- **Compute Locality**: Minimize data movement across the network.

## 8. Governance & Compliance
- **Lineage First**: Ensure all data movements are tracked from day one.
- **Tag-Based Policies**: Use Atlas tags to automate security policies in Ranger.

## 9. Tools & Technologies
- **Cloudera Shared Data Experience (SDX)**: The foundation of CDP governance.
- **Terraform / Ansible**: For automated platform deployment.
- **Ranger / Atlas**: For security and metadata.

## 10. Real-World Use Cases
- **Enterprise Data Strategy**: Implementing a multi-region, hybrid cloud DWH that supports 5,000+ analysts and 10PB of data using CoE best practices.

## 11. References
- [Cloudera Reference Architecture](https://docs.cloudera.com)
- [Enterprise Data Lake Patterns (Oreilly)](https://www.oreilly.com/library/view/enterprise-data-lake/9781491931554/)
`,
  "docs/security-compliance.md": `# Security & Compliance Standards

## 1. Overview
Security and Compliance are non-negotiable requirements for any enterprise data platform. They ensure that sensitive data is protected from unauthorized access, that data usage is fully auditable, and that the platform meets legal and regulatory mandates (e.g., GDPR, RBI, SEBI).

## 2. Architecture Context

\`\`\`
[The Four Pillars of Security]

  Authentication      ──▶ Who are you? (Kerberos, LDAP)
  Authorization       ──▶ What can you do? (Ranger)
  Audit               ──▶ What did you do? (Ranger Audit, Solr)
  Data Protection     ──▶ Is the data encrypted? (KMS, TLS)
\`\`\`

**Key Security Components:**
- **Apache Ranger**: Centralized authorization and audit logging.
- **Apache Knox**: Secure gateway for perimeter security and API access.
- **FreeIPA / Active Directory**: Identity management and Kerberos authentication.
- **Cloudera KMS**: Key management for Transparent Data Encryption (TDE).

## 3. Core Concepts

| Concept | Description |
|---|---|
| **Kerberos** | A network authentication protocol used to prove identity in a non-secure network. |
| **RBAC (Role-Based Access Control)** | Managing permissions based on user roles within the organization. |
| **Encryption at Rest** | Protecting data stored on disk using TDE or cloud-native encryption. |
| **Encryption in Transit** | Protecting data moving over the network using TLS/SSL. |
| **PII (Personally Identifiable Information)** | Data that can be used to uniquely identify an individual (e.g., PAN, Aadhaar). |
| **GDPR / PDPA** | Data protection regulations mandating privacy and the "right to be forgotten". |

## 4. Detailed Design / Implementation

### Security Standards
1. **Always Use Kerberos**: No enterprise CDP cluster should run in "simple" security mode.
2. **Fine-Grained Authorization**: Use Ranger to restrict access at the database, table, column, and row level.
3. **Audit All Access**: Enable Ranger audit logs for all Hive, Impala, and HDFS operations.
4. **Encrypt Sensitive Data**: Use HDFS Transparent Data Encryption (TDE) for directories containing PII.
5. **Gateway Security**: All REST API and external tool access must go through Apache Knox.

### Example: Ranger Masking Policy
- **Requirement**: Mask the \`mobile_number\` column for analysts but show it for the Customer Service team.
- **Implementation**: In Ranger, create a "Masking" policy for the \`mobile_number\` column with the \`MASK_SHOW_LAST_4\` type for the \`analysts\` group.

## 5. Best Practices
- **Least Privilege Principle**: Users should only have the minimum permissions necessary for their job.
- **Rotate Credentials**: Implement a policy for regular rotation of service account passwords and Kerberos keytabs.
- **Automate Security Audits**: Use scripts or specialized tools to regularly scan Ranger policies for overly permissive rules.
- **Tag-Based Security**: Use Atlas to tag PII data once at ingestion, and let Ranger automatically apply masking/denial policies across all tools.

## 6. Common Issues & Troubleshooting
- **Kerberos Ticket Expiry**: Jobs failing after running for several hours. *Solution: Ensure Spark/YARN is configured to renew tickets.*
- **Authentication Latency**: High load on Active Directory causing slow logins. *Solution: Implement a local FreeIPA replica.*
- **Policy Synchronization Lag**: Changes in Ranger taking time to reflect in Hive/Impala.

## 7. Performance & Optimization
- **Policy Cache**: Ranger plugins cache policies locally to prevent authorization from becoming a bottleneck.
- **Audit Volume**: Be selective about what you audit; logging every HDFS metadata request can overwhelm the system.

## 8. Governance & Compliance
- **Regulatory Reporting**: Generate automated monthly reports on who accessed sensitive data for compliance officers.
- **Data Subject Access Request (DSAR)**: Use Atlas lineage to quickly identify all locations of a specific user's data for GDPR compliance.

## 9. Tools & Technologies
- **Apache Ranger**: Central authorization and audit.
- **Apache Knox**: Peripheral security gateway.
- **FreeIPA**: Identity management.
- **Cloudera Manager**: Security configuration and monitoring.

## 10. Real-World Use Cases
- **Banking Data Protection**: Implementing field-level encryption and row-level filtering to ensure that branch managers can only see data for their specific region.

## 11. References
- [Cloudera Security Guide](https://docs.cloudera.com)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)
- [RBI Guidelines on Information Security](https://www.rbi.org.in)
`,
  "docs/cost-optimization.md": `# Cost Optimization & ROI

## 1. Overview
Cost Optimization is the process of maximizing the value derived from the data platform while minimizing expenditure on infrastructure, licenses, and operations. In a hybrid or public cloud environment, cost management is a continuous lifecycle of monitoring, right-sizing, and leveraging cloud-native savings opportunities.

## 2. Architecture Context

\`\`\`
[The Cost Optimization Loop]

  Monitor Usage ──▶ Identify Waste ──▶ Apply Optimization ──▶ Measure ROI
\`\`\`

**Key Focus Areas:**
- **Infrastructure**: Compute and storage costs in the cloud.
- **Licenses**: Optimizing Cloudera and third-party tool seat usage.
- **Operations**: Reducing the human effort required to manage the platform.

## 3. Core Concepts

| Concept | Description |
|---|---|
| **Right-Sizing** | Matching infrastructure resources (CPU, RAM) exactly to the workload requirements. |
| **Auto-Scaling** | Dynamically adjusting compute capacity based on demand (highly effective in Public Cloud). |
| **Spot Instances** | Using spare cloud capacity at a significant discount (e.g., for non-critical batch jobs). |
| **Storage Tiering** | Moving infrequently accessed data to lower-cost storage classes (e.g., S3 Glacier). |
| **Showback / Chargeback** | Associating costs with specific business units or projects to drive accountability. |

## 4. Detailed Design / Implementation

### Cost Optimization Strategies
1. **Compute Optimization**:
   - Use **CDE (Cloudera Data Engineering)** for Spark jobs, which leverages auto-scaling and spot instances.
   - Use **CDW (Cloudera Data Warehouse)** for SQL, which automatically suspends virtual warehouses when not in use.
2. **Storage Optimization**:
   - Implement HDFS quotas to prevent unbounded data growth.
   - Use the **Data Lifecycle Manager** to automate moves to cold storage.
3. **Queue Management**:
   - Use YARN Capacity Scheduler to ensure critical production jobs have the necessary resources while background jobs use leftover capacity.

### Example: Auto-Suspend in CDW
- Configure the Virtual Warehouse to "Auto-suspend" after 15 minutes of inactivity. This ensures you only pay for compute when queries are actually running.

## 5. Best Practices
- **Implement Tagging**: Tag every cloud resource with a \`CostCenter\` or \`Project\` ID for accurate chargeback.
- **Monitor Idle Resources**: Regularly audit the cluster for long-running idle Spark sessions or abandoned Hive tables.
- **Use Reserved Instances**: Commit to a baseline of compute capacity for 1–3 years for deep discounts (30–60%).
- **Clean Up Staging Data**: Implement automated cleanup of intermediate ETL data to save storage.

## 6. Common Issues & Troubleshooting
- **Cloud Bill Shock**: Unexpectedly high costs due to misconfigured auto-scaling or large accidental data transfers. *Solution: Set up billing alerts and budgets.*
- **Zombie Jobs**: Failed jobs that continue to consume resources. *Solution: Implement timeouts and aggressive cleanup policies.*

## 7. Performance & Optimization
- **Balance Speed vs Cost**: Not every job needs to finish in 10 minutes; some non-critical batch jobs can run longer on cheaper hardware.

## 8. Governance & Compliance
- **Budgetary Control**: Implement a process where large architectural changes require a cost-impact assessment.
- **Resource Quotas**: Enforce limits at the YARN queue and HDFS directory level.

## 9. Tools & Technologies
- **Cloudera Manager**: For monitoring resource utilization.
- **Cloud Provider Billing Tools**: AWS Cost Explorer, Azure Cost Management.
- **CDP Workload Manager**: For identifying slow and expensive queries.

## 10. Real-World Use Cases
- **Public Cloud Optimization**: Reducing annual cloud spend by $500k through a combination of auto-scaling, spot instances for dev environments, and tiered storage for historical data.

## 11. References
- [Cloudera Cost Management Best Practices](https://docs.cloudera.com)
- [AWS FinOps Framework](https://www.finops.org/framework/)
\`
};
