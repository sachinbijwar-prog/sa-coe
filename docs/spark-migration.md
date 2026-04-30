# Spark Migration Guide

## 1. Overview
Spark migration involves upgrading data processing workloads from legacy Spark versions (e.g., Spark 1.6 or 2.x) to Spark 3.x on the Cloudera Data Platform (CDP). Spark 3 brings significant performance gains through Adaptive Query Execution (AQE), but also introduces breaking changes in APIs, configuration, and dependencies.

## 2. Architecture Context

```
[Legacy Spark]                      [CDP Spark 3]
  Spark 1.6 / 2.x         ──▶       Spark 3.2+
       │                                 │
  Scala 2.11              ──▶       Scala 2.12
  Python 2.7 / 3.6        ──▶       Python 3.8+
```

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
1. **Code Audit**: Identify deprecated APIs (e.g., `SQLContext`, `HiveContext`) and replace with `SparkSession`.
2. **Scala/Python Upgrade**: Ensure code is compatible with Scala 2.12 and Python 3.8+.
3. **Configuration Update**: Review `spark-defaults.conf` and job-specific configs.
4. **Dependency Review**: Re-compile custom JARs against Spark 3 libraries.
5. **Validation**: Compare outputs between legacy and Spark 3 versions.

### Example: Enabling AQE in Spark 3
```python
from pyspark.sql import SparkSession

spark = SparkSession.builder \
    .appName("CDP_Migration_Job") \
    .config("spark.sql.adaptive.enabled", "true") \
    .config("spark.sql.adaptive.coalescePartitions.enabled", "true") \
    .getOrCreate()
```

## 5. Best Practices
- **Use DataFrames/Datasets**: Avoid RDDs to leverage the Catalyst Optimizer.
- **Enable AQE**: It is the single most important performance feature in Spark 3.
- **Filter Early**: Push down filters as close to the source as possible.
- **Avoid UDFs**: Use built-in Spark SQL functions for better vectorization.
- **Manage Partitioning**: Use `repartition()` or `coalesce()` strategically to control file counts.

## 6. Common Issues & Troubleshooting
- **ClassNotFoundError**: Usually due to mismatched JAR versions in the classpath.
- **OOM Errors**: Often requires tuning `spark.executor.memory` and `spark.memory.fraction`.
- **Changed Behavior**: Spark 3 is more strict with timestamps and numeric types. *Solution: Enable `spark.sql.legacy.timeParserPolicy=LEGACY` if needed.*

## 7. Performance & Optimization
- **Dynamic Partition Pruning**: Automatically enabled; ensure joins are on partition columns.
- **Broadcast Joins**: Increase `spark.sql.autoBroadcastJoinThreshold` for small dimension tables.
- **Shuffle Optimization**: Let AQE handle `spark.sql.shuffle.partitions` automatically.

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
