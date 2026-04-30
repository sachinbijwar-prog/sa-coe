# Data Modeling Standards

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

```
Tables:       <layer>_<domain>_<entity>
              e.g., curated_finance_transaction
              
Columns:      snake_case, no abbreviations
              e.g., customer_id, effective_date, is_active
              
Partitions:   Always date-based: load_date, business_date
              
Surrogate Keys: <entity>_sk (e.g., customer_sk)
Natural Keys:   <entity>_id (e.g., customer_id)
```

### Standard Dimension Table (Hive DDL)
```sql
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
```

### Standard Fact Table (Hive DDL)
```sql
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
```

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
| Duplicate dimension records | Missing SCD2 dedup logic | Add `ROW_NUMBER() OVER (PARTITION BY natural_key ORDER BY load_date DESC)` |
| Partition explosion | Too granular partition column | Use year/month/day hierarchy or daily partitions only |
| Schema mismatch errors | Column type changes in source | Implement schema evolution via ALTER TABLE ADD COLUMNS |
| Orphaned fact records | Dimension not yet loaded | Implement load sequencing: dimensions before facts |

## 7. Performance & Optimization

- **Bucket JOIN optimization**: Bucket fact and dimension tables on the same join key and count
- **Partition pruning**: Ensure queries always filter on partition columns
- **Columnar storage**: Parquet/ORC provides 5–10x compression and selective column reads
- **Impala Stats**: `COMPUTE STATS` after each load improves query plan accuracy by 30–60%

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
