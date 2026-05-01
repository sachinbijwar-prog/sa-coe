# SQL Script Library

## 1. Overview
The SQL Script Library is a curated collection of high-performance, standardized SQL patterns for Hive and Impala. These scripts serve as the foundation for DDL, DML, and complex analytical queries within the Smart Analytica ecosystem, ensuring consistency and performance across all projects.

## 2. Architecture Context
Scripts are categorized by their function:
- **DDL (Data Definition)**: Table creation, partitioning, and metadata management.
- **DML (Data Manipulation)**: Optimized inserts, updates, and deletes (where supported).
- **Analytical**: Window functions, complex aggregations, and performance-tuned joins.

## 3. Core Concepts
- **ACID Tables (Hive 3)**: Using transactional tables for updates/deletes.
- **Partition Pruning**: Writing queries that leverage partition columns to minimize data scan.
- **Compute Stats**: Essential for query optimization in Impala.
- **Vectorization**: Enabling Hive features for faster execution.

## 4. Detailed Design / Implementation

### Standard Fact Table DDL (Hive/Impala)
```sql
CREATE TABLE fact_sales (
    transaction_id STRING,
    customer_id STRING,
    product_id STRING,
    amount DECIMAL(18,2),
    load_timestamp TIMESTAMP
)
PARTITIONED BY (event_date STRING)
STORED AS PARQUET
TBLPROPERTIES ('parquet.compress'='SNAPPY');
```

### Optimized Join with Hints (Impala)
```sql
SELECT /* +BROADCAST */
    s.transaction_id,
    c.customer_name
FROM fact_sales s
JOIN customer_dim c ON s.customer_id = c.customer_id
WHERE s.event_date = '2024-03-24';
```

### Window Functions for Deduplication
```sql
WITH deduped AS (
    SELECT *,
           ROW_NUMBER() OVER(PARTITION BY transaction_id ORDER BY load_timestamp DESC) as rank
    FROM raw_sales
)
SELECT * FROM deduped WHERE rank = 1;
```

## 5. Best Practices
- **Always use Parquet**: The standard columnar format for all analytics workloads.
- **Partition Wisely**: Avoid over-partitioning (e.g., partitioning by timestamp); use Date or Category instead.
- **Avoid SELECT ***: Explicitly list columns to reduce I/O and memory overhead.
- **Uppercase Keywords**: Maintain consistency (e.g., `SELECT`, `FROM`, `WHERE`).

## 6. Common Issues & Troubleshooting
- **Small Files Problem**: Caused by too many partitions or small inserts. Use `INSERT OVERWRITE` or compaction scripts.
- **Metadata Out of Sync**: Run `INVALIDATE METADATA [table]` in Impala if the table was modified in Hive.
- **Memory Limit Exceeded**: Check join strategies and try adding `/* +SHUFFLE */` if broadcast joins are too large for memory.

## 7. Performance & Optimization
- **Z-Ordering**: Use for range queries on non-partition columns (CDP 7.1.7+).
- **Predicate Pushdown**: Ensure filters are applied as early as possible.
- **Tez Container Sizing**: Tune `hive.tez.container.size` for complex Hive jobs.

## 8. Governance & Compliance
- **Naming Conventions**: Follow the `[zone]_[subject]_[type]` pattern (e.g., `stg_sales_raw`).
- **PII Masking**: Ensure sensitive columns are identified for Ranger masking policies.
- **Comment Everything**: Use `COMMENT '...'` in DDL for Atlas metadata capture.

## 9. Tools & Technologies
- **Hue**: Primary SQL editor and query workbench.
- **Beeline**: Command-line interface for Hive.
- **Impala-shell**: Command-line interface for Impala.

## 10. Real-World Use Cases
- **Daily Reconciliation**: SQL scripts that compare source and target row counts across 500+ tables.
- **Yearly Trend Analysis**: Complex window functions and CTEs to calculate YOY growth metrics.

## 11. References
- [Cloudera SQL Reference Guide](https://docs.cloudera.com/runtime/7.2.10/impala-sql-reference/topics/impala-sql-reference.html)
- [Apache Hive Wiki](https://cwiki.apache.org/confluence/display/Hive/Home)
