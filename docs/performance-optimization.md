# Performance & Optimization Standards

## 1. Overview
Performance optimization in an enterprise data warehouse is a continuous discipline spanning query tuning, storage design, cluster resource management, and ETL pipeline efficiency. This document establishes platform-wide performance standards and tuning playbooks for Hive, Impala, Spark, and HDFS workloads running on Cloudera Data Platform.

**Why it matters:** A poorly performing DWH directly impacts business SLAs — delayed reports, failed batch jobs, and analyst frustration erode trust in the platform and drive shadow IT.

## 2. Architecture Context

```
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
```

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
```sql
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
```

### Query Optimization Checklist
```sql
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
```

### Small File Compaction (Hive)
```sql
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
```

### Spark File Compaction Job
```python
from pyspark.sql import SparkSession

spark = SparkSession.builder \
    .appName("FileCompaction") \
    .config("spark.sql.files.maxRecordsPerFile", 500000) \
    .getOrCreate()

# Read fragmented partition
df = spark.read.parquet("/warehouse/curated/fact_trade/trade_date=2024-04-01/")
print(f"Input partitions: {df.rdd.getNumPartitions()}")

# Coalesce to target file size (1 file per ~500MB)
target_files = max(1, df.count() // 500000)
compacted_df = df.coalesce(target_files)

# Overwrite with compacted files
compacted_df.write \
    .mode("overwrite") \
    .parquet("/warehouse/curated/fact_trade/trade_date=2024-04-01/")

print(f"Output files: {target_files}")
```

### YARN Queue Configuration (Capacity Scheduler)
```xml
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
```

## 5. Best Practices

- **Statistics first**: Always `COMPUTE STATS` / `ANALYZE TABLE` before tuning anything else
- **Target 128MB–1GB files**: Small files are the single biggest HDFS performance killer
- **Partition by date**: Daily date partitioning is the most universally effective pattern
- **Vectorize everything**: Enable Hive vectorized execution for all ORC/Parquet tables
- **Queue isolation**: Separate YARN queues for ETL, interactive, and migration workloads
- **Monitor before optimizing**: Use Spark UI, Impala Query Profile, YARN ResourceManager
- **Benchmark changes**: Always compare before/after query runtimes with same data volume

### Don'ts
- ❌ Don't optimize without measuring — premature optimization wastes time
- ❌ Don't skip `COMPUTE STATS` after data loads — query plans will be wrong
- ❌ Don't use `SELECT *` in production pipelines — project only needed columns
- ❌ Don't ignore GC pauses in Spark — they indicate memory pressure

## 6. Common Issues & Troubleshooting

| Issue | Root Cause | Resolution |
|---|---|---|
| Impala query 10x slower after load | Stale statistics | `COMPUTE INCREMENTAL STATS partition` |
| Spark stage stuck at 99% | Data skew on join key | Enable AQE skew join; salt hot keys |
| HDFS NameNode load spike | Thousands of small files | File compaction job; merge on write |
| YARN job queued for hours | Queue capacity exceeded | Increase queue or defer non-critical jobs |
| Hive query slower after migration | Legacy stats invalid | Re-run `ANALYZE TABLE` on all tables |
| OOM in Impala aggregation | High-cardinality GROUP BY | Enable spill-to-disk; increase memory limit |

## 7. Performance & Optimization

### Benchmarking Framework
```python
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
```

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
- Impala query on 8B row fact_trade: reduced from 4m 20s to 18s by enabling `COMPUTE INCREMENTAL STATS`
- Added partition pruning on `trade_date`; eliminated 95% of I/O

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
