# Hive Troubleshooting Guide

## 1. Overview
Apache Hive is a critical component for large-scale SQL processing. However, production environments often face issues related to resource contention, metastore performance, and SQL optimization. This document provides a playbook for diagnosing and resolving the most common Hive issues in CDP.

## 2. Architecture Context
Hive issues generally fall into three layers:
- **Client Layer**: Beeline, JDBC drivers, or SQL syntax.
- **Compute Layer**: Tez AMs, LLAP Daemons, or YARN containers.
- **Metadata Layer**: Hive Metastore (HMS) and its backend database (MariaDB/Postgres).

## 3. Core Concepts
- **Tez Execution Engine**: The default engine in CDP. Issues often manifest as "Tez session timeouts".
- **LLAP (Live Long and Process)**: Persistent daemons for low-latency queries.
- **ACID/Transactional Tables**: New in Hive 3, introducing lock contention issues.
- **HMS (Hive Metastore)**: The central repository for metadata.

## 4. Detailed Design / Implementation

### Diagnosing Locked Tables (Hive 3)
```sql
-- Check for active locks
SHOW LOCKS;

-- Check for locks on a specific table
SHOW LOCKS sales_fact EXTENDED;

-- Identify the transaction ID and then kill it if necessary
ABORT TRANSACTIONS 12345;
```

### Analyzing Tez Logs via CLI
```bash
# Get the Application ID from Hive output
yarn logs -applicationId application_123456789_0001 | grep -i "Vertex failed"
```

## 5. Best Practices
- **Enable Vectorization**: `set hive.vectorized.execution.enabled = true;`
- **Use Cost-Based Optimizer (CBO)**: Ensure statistics are up to date via `ANALYZE TABLE ... COMPUTE STATISTICS;`
- **Small File Compaction**: Regularly run `ALTER TABLE ... COMPACT 'major';` for ACID tables.
- **Avoid Cross Joins**: Unless absolutely necessary, as they cause memory explosions.

## 6. Common Issues & Troubleshooting
- **Metastore Timeout**: HMS is overloaded. Increase `hive.metastore.server.max.threads` or optimize the HMS database backend.
- **Vertex Failed / Container Killed**: Usually an Out of Memory (OOM) issue. Increase `hive.tez.container.size`.
- **Query Hangs at 0%**: HMS lock wait or Tez session startup delay. Check `SHOW LOCKS` and YARN queue capacity.
- **Permission Denied**: Ranger policy mismatch. Check Ranger audit logs for the specific `request_id`.

## 7. Performance & Optimization
- **Dynamic Partition Pruning**: Ensure `hive.tez.dynamic.partition.pruning` is true for star-schema joins.
- **LLAP Caching**: Verify that LLAP is being used by checking the query plan (`EXPLAIN`) for "LLAP" keywords.
- **Partition Discovery**: Use `msck repair table` for external tables to sync new partitions.

## 8. Governance & Compliance
- **Audit Logging**: Check `/var/log/hive/hiveserver2.log` for session-level audits.
- **Ranger Audit**: Use the Ranger UI to troubleshoot access denials (HTTP 403).
- **Resource Queues**: Ensure Hive queries are running in the correct YARN queue (`root.default` vs `root.etl`).

## 9. Tools & Technologies
- **Tez UI**: Visualized DAG for query execution.
- **HiveServer2 Web UI**: Monitor active sessions and query plans.
- **Cloudera Manager**: For service-level monitoring and configuration.

## 10. Real-World Use Cases
- **Stale Statistics**: A query taking 2 hours instead of 5 minutes due to missing stats after a large data load. Resolution: Run `ANALYZE TABLE`.
- **Hive 3 Reserved Keywords**: Migration failing because a column is named `order`. Resolution: Use backticks `` `order` ``.

## 11. References
- [Cloudera Hive 3 Documentation](https://docs.cloudera.com/runtime/7.2.10/hive-introduction/topics/hive-introduction.html)
- [Apache Tez Troubleshooting](https://tez.apache.org/user_guides.html)
