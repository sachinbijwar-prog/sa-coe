# ETL/ELT Transformation Layer

## 1. Overview
The Transformation Layer converts raw, ingested data into clean, business-rule-applied, analysis-ready datasets. It sits between the Raw/Staging zone and the Curated/Mart zones. This layer is where business logic, data quality rules, joins, aggregations, and SCD processing are applied.

**ETL vs ELT:**
- **ETL (Extract-Transform-Load)**: Transform happens outside the warehouse (Informatica, SSIS). Better for complex logic, small-medium volumes.
- **ELT (Extract-Load-Transform)**: Load raw first, then transform inside the platform using Spark/Hive SQL. Better for large-scale cloud DWH.

Modern Cloudera platforms favour **ELT** using Spark for the heavy lifting and Hive/Impala for SQL-based transformations.

## 2. Architecture Context

```
[Raw Zone]          [Staging]           [Curated Zone]       [Mart Zone]
  Raw Parquet   →→  Cleansing       →→  Conformed dims   →→  Domain marts
  As-is source  →→  Validation      →→  Fact tables      →→  Aggregations
                →→  Deduplication   →→  SCD processing   →→  BI-ready views
                →→  Type casting    →→  Business rules
```

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
```python
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
cleansed_df = raw_df \
    .withColumn("full_name", trim(upper(col("full_name")))) \
    .withColumn("email", trim(col("email"))) \
    .withColumn("segment", coalesce(col("segment"), lit("UNCLASSIFIED"))) \
    .withColumn("date_of_birth", to_date(col("dob_str"), "dd/MM/yyyy")) \
    .filter(col("customer_id").isNotNull())

# Step 2: Deduplicate — keep latest record per customer_id
window_spec = Window.partitionBy("customer_id").orderBy(col("last_updated_dt").desc())
dedup_df = cleansed_df \
    .withColumn("rn", row_number().over(window_spec)) \
    .filter(col("rn") == 1) \
    .drop("rn")

# Step 3: Enrich — join to segment reference table
segment_ref = spark.table("curated.ref_segment")
enriched_df = dedup_df.join(segment_ref, on="segment", how="left")

# Step 4: Write to staging zone
enriched_df.write \
    .mode("overwrite") \
    .parquet("/warehouse/staging/customer/load_date=2024-04-01/")

print(f"Records written: {enriched_df.count()}")
```

### SCD Type 2 Processing with Spark
```python
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
```

### Standard SQL Transformation (Hive/Impala)
```sql
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
```

## 5. Best Practices

- **Idempotent transforms**: Use `INSERT OVERWRITE` on partition — re-runnable safely
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
| Data skew in Spark | Hot partition keys (e.g., one segment has 80% data) | Use `salting` technique on skewed keys |
| SCD2 logic creating duplicates | Race condition in concurrent runs | Implement locking via control table flag |
| NULL propagation | Missing COALESCE/NVL logic | Add explicit NULL handling for every nullable field |
| Wrong record counts after transform | Incorrect JOIN type (INNER vs LEFT) | Audit JOIN cardinality before deploying |

## 7. Performance & Optimization

- **Filter early**: Apply all `WHERE` filters as early as possible in the pipeline
- **Broadcast small tables**: Use `broadcast()` for lookup/reference tables < 100MB
- **Partition correctly**: Repartition output by the write partition column before writing
- **Avoid UDFs**: Use native Spark SQL functions — UDFs break vectorization
- **Persist intermediate DFs**: Use `df.cache()` for DataFrames reused in multiple steps
- **Columnar pushdown**: When reading Parquet/ORC, select only required columns

## 8. Governance & Compliance

- **Atlas Lineage**: Every transformation must produce a lineage entry from source to target
- **Data Quality Gate**: Validate row counts and null rates before promoting to curated zone
- **Change Tracking**: All transformation logic changes go through Git version control
- **Audit Columns**: Every curated table must have `etl_batch_id`, `etl_ts`, `source_system`
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
