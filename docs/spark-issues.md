# Spark Troubleshooting Guide

## 1. Overview
Apache Spark is the primary compute engine for data engineering in Smart Analytica. While powerful, Spark applications often fail or perform poorly due to memory management, data skew, or resource negotiation issues. This document provides strategies to debug and optimize Spark jobs in production.

## 2. Architecture Context
Spark troubleshooting involves monitoring:
- **Driver**: Coordination and metadata management.
- **Executors**: Actual data processing tasks.
- **Cluster Manager (YARN)**: Resource allocation and container lifecycle.
- **Shuffle Service**: Data movement between stages.

## 3. Core Concepts
- **OOM (Out of Memory)**: The most common Spark failure. Can occur in Driver or Executor.
- **Data Skew**: When one or two partitions have significantly more data than others, causing "straggler" tasks.
- **Spill to Disk**: When memory is insufficient, Spark writes data to disk, severely degrading performance.
- **Adaptive Query Execution (AQE)**: Spark 3 features that dynamically optimize plans.

## 4. Detailed Design / Implementation

### Memory Configuration Breakdown
```bash
spark-submit \
  --driver-memory 4G \
  --executor-memory 8G \
  --executor-cores 4 \
  --conf "spark.memory.fraction=0.6" \
  --conf "spark.memory.storageFraction=0.5" \
  my_app.py
```

### Debugging Skew with Salting
```python
# Adding a 'salt' column to distribute skewed keys
from pyspark.sql.functions import concat, lit, floor, rand

skewed_df = spark.table("large_table")
# Add a random salt (0-9) to the join key
salted_df = skewed_df.withColumn("salt", floor(rand() * 10))
salted_df = salted_df.withColumn("join_key_salted", concat(lit("join_key"), lit("_"), lit("salt")))
```

## 5. Best Practices
- **Use the Spark UI**: Always check the "Stages" and "Executors" tabs first.
- **Enable AQE**: Set `spark.sql.adaptive.enabled = true` (Spark 3.x default).
- **Avoid UDFs**: Use Spark SQL built-in functions whenever possible (Python UDFs are slow).
- **Persistence Management**: Always `unpersist()` DataFrames when they are no longer needed.

## 6. Common Issues & Troubleshooting
- **Executor Lost / Container Killed by YARN**: Usually due to `Physical Memory Exceeded`. Increase `--executor-memory` or check for skew.
- **Py4JJavaError**: A Python error that originated in the JVM. Check the Java stack trace in the logs.
- **Stage Hanging at 99%**: Typical symptom of data skew. Look for a single task with high "Duration" compared to others.
- **Slow Shuffle**: Check network bandwidth and local disk I/O on worker nodes.

## 7. Performance & Optimization
- **Broadcast Joins**: Manually trigger for small tables: `df1.join(broadcast(df2), "id")`.
- **Shuffle Partition Sizing**: Adjust `spark.sql.shuffle.partitions` (default 200 is often too small for large data).
- **Dynamic Allocation**: Enable `spark.dynamicAllocation.enabled = true` for multi-tenant environments.

## 8. Governance & Compliance
- **Lineage Tracking**: Ensure the Atlas hook is enabled for Spark to capture table-to-table lineage.
- **Secure Credentials**: Use `pyspark.sql.functions.expr` with `vault()` or similar for PII access.
- **Spark Event Logs**: Retain for at least 30 days for post-mortem analysis.

## 9. Tools & Technologies
- **Spark UI**: The primary tool for performance analysis.
- **Ganglia / Cloudera Manager**: To see node-level CPU/Memory usage during the job.
- **YARN ResourceManager UI**: To check resource allocation and queue wait times.

## 10. Real-World Use Cases
- **The "Small Files" Output**: A job creating 50,000 files of 10KB each. Resolution: Use `df.coalesce(10)` or `df.repartition(10)` before writing.
- **Broadcast Timeout**: A broadcast join failing due to timeout. Resolution: Increase `spark.sql.broadcastTimeout`.

## 11. References
- [Cloudera Spark Performance Tuning](https://docs.cloudera.com/runtime/7.2.10/spark-performance-tuning/topics/spark-performance-tuning.html)
- [Spark UI Official Documentation](https://spark.apache.org/docs/latest/monitoring.html#web-ui)
