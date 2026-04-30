# Hive & Impala Performance Best Practices

## 1. Overview
Apache Hive and Apache Impala are the two primary SQL engines in a Cloudera-based Data Warehouse. Hive is optimized for batch ETL processing; Impala delivers low-latency interactive SQL for BI and reporting. Understanding when and how to use each — and how to tune both — is critical for platform performance.

## 2. Architecture Context

```
[ETL / Batch]          [Interactive BI]
  Apache Hive    →     Apache Impala
  (LLAP/Tez)           (Native C++ engine)
       ↓                      ↓
  [Hive Metastore - Shared Schema]
       ↓
  [HDFS / S3 / ADLS - Shared Storage]
```

Both engines share the **Hive Metastore**, meaning tables created in Hive are immediately accessible in Impala (after `INVALIDATE METADATA`).

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
```sql
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
```

### Impala Tuning
```sql
-- Always run after bulk data loads
COMPUTE STATS schema_name.table_name;

-- Refresh metadata after Hive DDL
INVALIDATE METADATA schema_name.table_name;

-- For incremental partition loads
REFRESH schema_name.table_name PARTITION (load_date='2024-04-01');

-- Check query profile
EXPLAIN SELECT * FROM fact_trade WHERE trade_date = '2024-01-01';
```

### Efficient Query Patterns
```sql
-- GOOD: Filter on partition column first
SELECT customer_id, SUM(trade_value)
FROM fact_trade
WHERE trade_date BETWEEN '2024-01-01' AND '2024-03-31'  -- Partition pruning
  AND segment = 'RETAIL'
GROUP BY customer_id;

-- BAD: Full table scan due to function on partition column
SELECT * FROM fact_trade
WHERE YEAR(trade_date) = 2024;  -- Prevents partition pruning!
```

## 5. Best Practices

### Hive
- Use **Tez** for all production ETL (never MapReduce)
- Enable **LLAP** for interactive Hive use cases
- Always `ANALYZE TABLE` after bulk inserts
- Use **ORC** format for Hive-written tables (better ACID support)
- Use **dynamic partitioning** for date-based loads
- Set `hive.merge.mapfiles=true` to avoid small file proliferation

### Impala
- Always `COMPUTE STATS` after data loads
- Use `INVALIDATE METADATA` after Hive schema changes
- Design queries to leverage **runtime filters** (Impala auto-applies on hash joins)
- Avoid `SELECT *` — project only needed columns
- Use `LIMIT` for exploratory queries
- Partition tables on the most common filter column

### Don'ts
- ❌ Don't use `ORDER BY` without `LIMIT` in Impala (sorts entire dataset)
- ❌ Don't use `COUNT(DISTINCT)` on high-cardinality columns without NDV() approximation
- ❌ Don't leave small files (<64MB) in storage — compact regularly
- ❌ Don't mix Hive ACID tables with Impala writes

## 6. Common Issues & Troubleshooting

| Issue | Root Cause | Resolution |
|---|---|---|
| Impala query slow despite small data | Stale statistics | `COMPUTE STATS table` |
| Hive job memory OOM | Large shuffle, no partition | Increase `hive.tez.container.size`; add partition |
| "Metadata not fresh" error in Impala | Hive DDL not refreshed | `INVALIDATE METADATA table` |
| Impala out of memory | Aggregation on high-cardinality column | Use `MT_DOP` for multi-threaded aggregation |
| Slow JOINs | No broadcast for small table | Add `/* +BROADCAST(dim_table) */` hint |

## 7. Performance & Optimization

### File Size Optimization
- Target file size: **128MB – 1GB** per file
- Use Hive's `hive.merge.tezfiles=true` to auto-merge small files
- Run periodic compaction jobs for ACID tables:
  ```sql
  ALTER TABLE table_name COMPACT 'MAJOR';
  ```

### Partitioning Strategy
- Partition by **date** (not datetime) for daily batch loads
- Avoid partitions with < 1000 rows — too granular
- Use partition-level statistics: `COMPUTE INCREMENTAL STATS`

### Caching in Impala
```sql
-- Cache a frequently-hit dimension table
ALTER TABLE dim_customer SET CACHED IN 'default' WITH REPLICATION = 2;
-- Remove cache
ALTER TABLE dim_customer SET UNCACHED;
```

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
- Impala used for real-time position reporting with `COMPUTE INCREMENTAL STATS` running post each market-hour load
- Runtime filters reduce scan to 2% of data for intraday queries

**Banking Risk Aggregation:**
- Hive LLAP for complex risk calculations involving 50+ table JOINs
- ORC vectorized reads reduce query time from 45 min to 8 min

## 11. References

- [Cloudera Impala Performance Tuning](https://docs.cloudera.com/documentation/enterprise/6/6.3/topics/impala_performance.html)
- [Apache Hive Performance Tuning](https://cwiki.apache.org/confluence/display/Hive/LanguageManual+Optimization)
- [Cloudera LLAP Architecture](https://docs.cloudera.com/HDPDocuments/HDP3/HDP-3.1.5/performance-tuning/content/hive_llap_overview.html)
- [Impala Query Profile Guide](https://docs.cloudera.com/documentation/enterprise/6/6.3/topics/impala_explain_plan.html)
