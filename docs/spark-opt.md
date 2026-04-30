# Spark Optimization Best Practices

## 1. Overview
Apache Spark is the primary distributed processing engine on Cloudera Data Platform. While Spark is powerful, poorly tuned jobs can consume excessive cluster resources, run for hours instead of minutes, or fail entirely. This document provides a structured guide to diagnosing and resolving Spark performance issues in production enterprise environments.

## 2. Architecture Context

```
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
```

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
```bash
spark-submit \
  --master yarn \
  --deploy-mode cluster \
  --num-executors 20 \
  --executor-cores 4 \
  --executor-memory 16g \
  --driver-memory 8g \
  --driver-cores 2 \
  --conf spark.sql.shuffle.partitions=400 \
  --conf spark.default.parallelism=400 \
  --conf spark.sql.adaptive.enabled=true \
  --conf spark.sql.adaptive.coalescePartitions.enabled=true \
  --conf spark.sql.adaptive.skewJoin.enabled=true \
  --conf spark.serializer=org.apache.spark.serializer.KryoSerializer \
  --conf spark.sql.parquet.compression.codec=snappy \
  --conf spark.dynamicAllocation.enabled=true \
  --conf spark.dynamicAllocation.minExecutors=5 \
  --conf spark.dynamicAllocation.maxExecutors=50 \
  my_job.py
```

### Adaptive Query Execution (AQE) — Spark 3.x
```python
# Enable AQE for automatic optimization at runtime
spark = SparkSession.builder \
    .config("spark.sql.adaptive.enabled", "true") \
    .config("spark.sql.adaptive.coalescePartitions.enabled", "true") \
    .config("spark.sql.adaptive.skewJoin.enabled", "true") \
    .config("spark.sql.adaptive.localShuffleReader.enabled", "true") \
    .getOrCreate()
```

### Broadcast Join for Small Tables
```python
from pyspark.sql.functions import broadcast

# BAD: Sort-Merge join on large + large (causes shuffle)
result = large_fact.join(large_dim, on="customer_sk")

# GOOD: Broadcast join on small dimension table (no shuffle)
result = large_fact.join(broadcast(small_dim), on="customer_sk")

# Configure auto-broadcast threshold (default 10MB, increase to 100MB)
spark.conf.set("spark.sql.autoBroadcastJoinThreshold", 100 * 1024 * 1024)
```

### Handling Data Skew
```python
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
salted_dim = dim.withColumn("salt", explode(array([lit(i) for i in range(10)]))) \
    .withColumn("salted_key", concat_ws("_", col("customer_sk"), col("salt").cast("string")))

result = skewed_fact.join(salted_dim, on="salted_key")
```

### Caching Strategy
```python
from pyspark import StorageLevel

# Use MEMORY_AND_DISK for large DataFrames (avoids OOM)
large_df.persist(StorageLevel.MEMORY_AND_DISK_SER)

# Use MEMORY_ONLY for small, frequently accessed DataFrames
small_ref.cache()  # equivalent to MEMORY_ONLY

# Always unpersist when done
large_df.unpersist()
```

## 5. Best Practices

- **Use DataFrames, not RDDs**: Catalyst optimizer provides automatic query optimization
- **Enable AQE (Spark 3+)**: Handles skew and partition coalescing automatically at runtime
- **Filter and project early**: Apply `filter()` and `select()` as early as possible
- **Avoid wide transformations early**: `groupBy`, `join`, `distinct` cause shuffles — minimize them
- **Set shuffle partitions correctly**: Default 200 is wrong for most jobs. Rule: `(data_size_GB * 1024) / 128` MB target per partition
- **Use columnar formats**: Always read/write Parquet or ORC; never CSV in production
- **Avoid Python UDFs**: Use Spark SQL built-in functions; Python UDFs break vectorization and serialize row-by-row

### Don'ts
- ❌ Don't use `collect()` on large DataFrames — brings all data to driver, causes OOM
- ❌ Don't use `count()` unnecessarily mid-pipeline — triggers a full job
- ❌ Don't nest `groupBy` + `join` without checking for skew first
- ❌ Don't set `spark.sql.shuffle.partitions=200` for 500GB+ datasets
- ❌ Don't ignore Spark UI — it shows skew, spill, and slow stages clearly

## 6. Common Issues & Troubleshooting

| Issue | Root Cause | Resolution |
|---|---|---|
| Stage stuck at 99% | Data skew — one task has 100x more data | Enable AQE skew join or salt the key |
| Executor OOM | Insufficient memory for aggregation/join | Increase executor memory or reduce partition size |
| Disk spill | Memory pressure during shuffle | Increase `spark.executor.memory` or shuffle partitions |
| Job runs 10x slower than expected | Small files (1000s of tiny Parquet files) | Coalesce before write; use `repartition()` |
| Driver OOM | `collect()` or `toPandas()` on large DF | Sample data first; use `write()` instead |
| GC overhead limit exceeded | Too many small objects, insufficient heap | Enable KryoSerializer; tune GC settings |

## 7. Performance & Optimization

### Partition Sizing Rule of Thumb
```
Target: 128MB – 512MB per partition
shuffle.partitions = Total Data Size (MB) / 200MB
Example: 100GB dataset = 100,000MB / 200 = 500 shuffle partitions
```

### Memory Tuning
```
Total executor memory = execution memory + storage memory + overhead
  execution.memory fraction = 0.6 (default)
  storage.memory fraction = 0.4 (default)
  overhead = max(384MB, 10% of executor memory)

Example: 16GB executor
  execution = 9.6GB (available for joins, aggregations)
  storage = 6.4GB (available for cached data)
  overhead = 1.6GB (JVM off-heap)
  YARN allocated = 16 + 1.6 = 17.6GB
```

### Reading Efficiently
```python
# Push down predicates and projection when reading Parquet
df = spark.read.parquet("/warehouse/raw/trade") \
    .filter(col("trade_date") == "2024-04-01") \  # Partition pruning
    .select("trade_id", "customer_sk", "trade_value")  # Column pruning
```

## 8. Governance & Compliance

- **Queue management**: Submit production jobs to dedicated YARN queues with capacity guarantees
- **Resource limits**: Set per-user executor limits to prevent monopolization
- **Job tagging**: Use `spark.app.name` and custom metadata for audit trail
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
- AQE eliminated skew from 3 large customers dominating the `customer_sk` partition
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
