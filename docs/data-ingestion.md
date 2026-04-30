# Data Ingestion Layer

## 1. Overview
The Data Ingestion Layer is the entry point of any enterprise data platform. It is responsible for reliably moving data from diverse source systems into the Data Lake in a timely, accurate, and auditable manner. Getting this layer right is foundational — poor ingestion design causes cascading failures in all downstream zones.

**Why it matters:** Data arriving late, incorrectly, or duplicated at this layer corrupts the entire DWH. The ingestion layer must handle schema drift, late-arriving data, partial loads, and network failures gracefully.

## 2. Architecture Context

```
[Sources]                [Ingestion Tools]          [Landing Zone]
  Oracle/SQL Server  →→  Sqoop (JDBC batch)    →→  HDFS Raw Zone
  Kafka Topics       →→  Spark Streaming       →→  HDFS/S3 Raw Zone
  Flat Files (SFTP)  →→  NiFi / Shell Scripts  →→  HDFS Raw Zone
  REST APIs          →→  NiFi / Custom Spark   →→  HDFS Raw Zone
  Mainframe          →→  Informatica ETL       →→  HDFS Raw Zone
```

**Ingestion Patterns:**
- **Full Load**: Extract entire source table every run (small reference tables)
- **Incremental/Delta Load**: Extract only changed records using watermark column
- **CDC (Change Data Capture)**: Stream-level capture of inserts/updates/deletes
- **Event-Driven**: Triggered by Kafka/Kinesis events in real time

## 3. Core Concepts

| Concept | Description |
|---|---|
| **Watermark Column** | A timestamp or sequence column used to identify new/changed records (e.g., `last_updated_dt`) |
| **High Watermark** | The maximum value of watermark from the last successful load |
| **Idempotency** | Re-running the same load produces the same result — essential for recovery |
| **At-Least-Once** | Data may be delivered more than once; downstream must deduplicate |
| **Exactly-Once** | Data delivered exactly once; harder to achieve, requires transactional guarantees |
| **Landing Zone** | Temporary holding area; raw data as-is from source |

## 4. Detailed Design / Implementation

### Sqoop Incremental Load (JDBC Sources)
```bash
# First run: full load
sqoop import \
  --connect "jdbc:oracle:thin:@//db-host:1521/ORCL" \
  --username etl_user \
  --password-file /secure/etl_password.txt \
  --table TRADE_TRANSACTIONS \
  --target-dir /warehouse/raw/trade_transactions \
  --as-parquetfile \
  --compress \
  --compression-codec snappy \
  --num-mappers 8

# Subsequent runs: incremental
sqoop import \
  --connect "jdbc:oracle:thin:@//db-host:1521/ORCL" \
  --username etl_user \
  --password-file /secure/etl_password.txt \
  --table TRADE_TRANSACTIONS \
  --target-dir /warehouse/raw/trade_transactions \
  --as-parquetfile \
  --incremental lastmodified \
  --check-column LAST_UPDATED_DT \
  --last-value "2024-04-01 00:00:00" \
  --merge-key TRADE_ID
```

### Spark Streaming Ingestion (Kafka)
```python
from pyspark.sql import SparkSession
from pyspark.sql.functions import col, from_json, current_timestamp
from pyspark.sql.types import StructType, StringType, LongType, TimestampType

spark = SparkSession.builder.appName("TradeIngestion").getOrCreate()

schema = StructType() \
    .add("trade_id", StringType()) \
    .add("instrument_id", StringType()) \
    .add("quantity", LongType()) \
    .add("price", StringType()) \
    .add("trade_ts", TimestampType())

df = spark.readStream \
    .format("kafka") \
    .option("kafka.bootstrap.servers", "kafka-broker:9092") \
    .option("subscribe", "nse.trades") \
    .option("startingOffsets", "earliest") \
    .load()

parsed = df.select(from_json(col("value").cast("string"), schema).alias("data")) \
    .select("data.*") \
    .withColumn("ingest_ts", current_timestamp()) \
    .withColumn("load_date", col("trade_ts").cast("date"))

query = parsed.writeStream \
    .format("parquet") \
    .option("path", "/warehouse/raw/kafka_trades") \
    .option("checkpointLocation", "/warehouse/checkpoints/kafka_trades") \
    .partitionBy("load_date") \
    .trigger(processingTime="5 minutes") \
    .start()

query.awaitTermination()
```

### Audit Tracking Table
```sql
CREATE TABLE IF NOT EXISTS etl_ctrl.ingestion_log (
    log_id          BIGINT,
    table_name      STRING,
    load_type       STRING,  -- FULL / INCREMENTAL / CDC
    source_system   STRING,
    start_time      TIMESTAMP,
    end_time        TIMESTAMP,
    records_read    BIGINT,
    records_written BIGINT,
    records_rejected BIGINT,
    status          STRING,  -- SUCCESS / FAILED / PARTIAL
    error_message   STRING,
    watermark_value STRING
)
STORED AS ORC
LOCATION '/warehouse/ctrl/ingestion_log';
```

## 5. Best Practices

- **Always use incremental loads** for tables > 1M rows
- **Idempotent design**: Landing zone writes must be rerunnable without duplicates
- **Watermark management**: Store high watermark in a control table after each successful run
- **Schema validation**: Validate source schema against expected schema before loading
- **File naming convention**: `<table>_<yyyymmdd>_<hhmmss>_<batch_id>.parquet`
- **Checksum validation**: Compare source record counts with landed counts in audit log
- **NiFi for file ingestion**: Use NiFi for SFTP-based file ingestion with built-in provenance

### Don'ts
- ❌ Don't hardcode watermark values in scripts
- ❌ Don't skip audit logging — it's mandatory for production
- ❌ Don't use `overwrite` mode on partitioned tables carelessly — may delete good data
- ❌ Don't ingest without schema validation — malformed data corrupts downstream

## 6. Common Issues & Troubleshooting

| Issue | Root Cause | Resolution |
|---|---|---|
| Duplicate records after re-run | Non-idempotent write mode | Use `INSERT OVERWRITE` partition or add dedup key |
| Sqoop job fails mid-way | Network timeout / large fetch | Reduce `--fetch-size`, add `--num-mappers` |
| Kafka consumer lag growing | Processing slower than produce rate | Increase Spark executors, optimize deserialization |
| Schema mismatch on ingest | Source column added/changed | Enable schema evolution; alert on schema drift |
| HDFS quota exceeded | Missing retention policy on raw zone | Implement TTL cleanup job on raw zone |

## 7. Performance & Optimization

- **Sqoop parallelism**: Use `--num-mappers 8–16` based on source DB capacity
- **Spark partitioning**: `repartition()` before write to control output file count
- **Kafka throughput**: Increase `maxOffsetsPerTrigger` for higher micro-batch throughput
- **NiFi back-pressure**: Configure back-pressure thresholds to prevent memory overflow
- **Compression**: Always use Snappy for speed; use Gzip for cold archive (better ratio)

## 8. Governance & Compliance

- **Data Source Registration**: Register every source system in Apache Atlas as a data source
- **Lineage Capture**: Atlas lineage must show raw → staging → curated flow
- **PII at Source**: Identify PII fields at ingestion; apply masking before writing to raw zone
- **Rejection Handling**: Rejected records must be written to a quarantine zone with error reason
- **SLA Tracking**: Track ingestion SLA (expected vs actual completion time) in control table

## 9. Tools & Technologies

| Tool | Best For |
|---|---|
| Apache Sqoop | JDBC batch ingestion from RDBMS |
| Apache Spark Streaming | High-throughput Kafka/event ingestion |
| Apache NiFi | File-based, SFTP, REST API ingestion |
| Informatica PowerCenter | Complex enterprise ETL with transformations |
| Apache Kafka | Event streaming backbone |
| Apache Flume | Log-based ingestion (legacy) |

## 10. Real-World Use Cases

**NSE Market Data Ingestion:**
- Kafka topics receive trade events at 50,000 msg/sec
- Spark Structured Streaming consumes, validates, and lands in HDFS raw zone partitioned by `trade_date`
- Checkpointing ensures exactly-once semantics during broker failover

**Banking EOD Batch:**
- Sqoop pulls 12 Oracle tables nightly using incremental watermark on `LAST_MODIFIED_DATE`
- Audit log compared against source record counts; alerts triggered on >0.1% variance

## 11. References

- [Apache Sqoop Documentation](https://sqoop.apache.org/docs/)
- [Apache Spark Structured Streaming](https://spark.apache.org/docs/latest/structured-streaming-programming-guide.html)
- [Apache NiFi Documentation](https://nifi.apache.org/docs.html)
- [Apache Kafka Documentation](https://kafka.apache.org/documentation/)
- [Cloudera Ingestion Best Practices](https://docs.cloudera.com/best-practices/latest/index.html)
