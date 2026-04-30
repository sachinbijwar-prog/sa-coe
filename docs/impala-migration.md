# Impala Migration Guide

## 1. Overview
Impala migration involves moving low-latency, interactive SQL workloads from legacy Hadoop clusters (CDH/HDP) to the Cloudera Data Platform (CDP). While Impala maintains high compatibility across versions, migration requires careful handling of metadata, resource pools, and performance tuning to ensure seamless cutover for BI tools and end-users.

## 2. Architecture Context

```
[Legacy Impala]                     [CDP Impala]
  Impala 2.x/3.x          ──▶       Impala 4.x
       │                                 │
  Hive Metastore (HMS)    ──▶       Shared SDX (HMS)
```

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
2. **Refresh Metadata**: Run `INVALIDATE METADATA` for all migrated tables to populate the Impala Catalog.
3. **Migrate Resource Pools**: Re-create Impala Admission Control pools in the CDP cluster.
4. **Update Connection Strings**: Update BI tool (Tableau/Power BI) JDBC/ODBC strings to point to the new CDP Impala daemons or Knox gateway.

### Post-Migration Validation Query
```sql
-- Run on both legacy and CDP to verify consistency
SELECT 
    COUNT(*), 
    SUM(total_amount), 
    MIN(business_date) 
FROM sales_db.fact_sales 
WHERE business_date = '2024-04-01';
```

## 5. Best Practices
- **Re-compute Statistics**: Always run `COMPUTE STATS` on all tables post-migration as legacy stats may not be compatible or accurate.
- **Use Dedicated Resource Pools**: Separate exploratory users from production BI reports.
- **Limit Result Sets**: Encourage users to use `LIMIT` clauses to prevent memory exhaustion.
- **Avoid SELECT ***: Always specify columns to minimize network and memory overhead.

## 6. Common Issues & Troubleshooting
- **Metadata Stale**: Queries fail to find new data. *Solution: Run `REFRESH <table>`.*
- **Out of Memory (OOM)**: Queries failing due to insufficient memory. *Solution: Tune `MEM_LIMIT` or enable spill-to-disk.*
- **Slow Joins**: Often due to missing stats leading to sub-optimal join strategies (e.g., Shuffle instead of Broadcast).

## 7. Performance & Optimization
- **Partition Pruning**: Ensure queries filter on partition columns.
- **Small File Compaction**: Impala performs poorly with many small files; merge them before querying.
- **Caching**: Use `ALTER TABLE ... SET CACHED IN 'pool'` for frequently accessed lookup tables.

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
