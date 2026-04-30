# DWH Architectural Overview

## 1. Overview
A Data Warehouse (DWH) is a centralized repository for structured, historical data from multiple operational sources. In enterprise environments, it serves as the single source of truth for business intelligence and analytical reporting. Unlike OLTP systems optimized for transactions, a DWH is optimized for complex queries across large datasets.

**Why it matters:** Organizations running on Cloudera Data Platform (CDP) need a clearly defined DWH architecture to ensure scalability, governance, and efficient data consumption by downstream BI tools like SAP BusinessObjects, Tableau, and Power BI.

## 2. Architecture Context

```
[Source Systems]          [Ingestion Layer]        [Storage Layers]         [Consumption]
  - Oracle DB      →→→    Apache Kafka        →→→  Raw Zone (HDFS/S3)  →→→  Impala/Hive
  - Flat Files     →→→    Informatica ETL     →→→  Curated Zone        →→→  BI Tools
  - APIs           →→→    Apache NiFi         →→→  Marts/Serving Zone  →→→  Reports/Dashboards
  - Mainframe      →→→    Sqoop/Spark         →→→  Archive Zone
```

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
- Partitioned by: `load_date`
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
- Statistics updated after each load: `COMPUTE STATS table_name;`

### Standard Table Creation Pattern (Hive)
```sql
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
```

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
| Slow Impala queries | Missing table statistics | `COMPUTE STATS <table>` |
| OOM errors in Spark | Large shuffles without partitioning | Increase `spark.sql.shuffle.partitions` |
| Schema evolution failures | Mismatched column types | Use `MERGE SCHEMA` in Parquet reads |
| Duplicate records | Missing deduplication logic | Add `ROW_NUMBER()` dedup pattern |

## 7. Performance & Optimization

- **Columnar Formats**: Parquet/ORC reduce I/O by 60–80% vs. CSV
- **Partition Pruning**: Filter on partition key eliminates full table scans
- **Impala Statistics**: Always run `COMPUTE STATS` after bulk loads
- **Spark Broadcast Joins**: Use `broadcast()` hint for small dimension tables
- **Caching in Impala**: `ALTER TABLE ... SET CACHED` for frequently hit tables

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
