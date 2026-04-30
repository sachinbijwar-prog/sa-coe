# Migration Planning & Strategy

## 1. Overview
CDP Migration is the process of moving data, workloads, and processes from legacy Big Data platforms (CDH 5.x/6.x, HDP, on-premise Hadoop) to Cloudera Data Platform (CDP Private Cloud Base or CDP Public Cloud). A structured migration strategy minimizes risk, downtime, and data loss while accelerating time-to-value on the modern platform.

**Why it matters:** Unplanned migrations result in broken pipelines, data loss, security gaps, and extended downtime. A phased, well-governed migration strategy is the difference between a smooth cutover and a production disaster.

## 2. Architecture Context

```
[Legacy Platform]              [Migration Path]           [CDP Target]
  CDH 5.x / CDH 6.x     →→   Lift & Shift          →→   CDP PvC Base
  HDP 2.x / 3.x         →→   Replatform            →→   CDP Public Cloud
  On-Premise Hadoop      →→   Modernize (ELT)       →→   CDP Hybrid
  
  Key Services:
  Hive 1.x → Hive 3.x (ACID, LLAP)
  Spark 1.6 → Spark 3.x
  Impala 2.x → Impala 4.x
  Oozie → Oozie / Airflow
  HBase → HBase / Kudu
```

## 3. Core Concepts

| Concept | Description |
|---|---|
| **Lift & Shift** | Move as-is to CDP with minimal changes; fastest but technical debt carried over |
| **Replatform** | Minor optimizations during migration (e.g., file format changes) |
| **Re-architecture** | Full redesign to leverage CDP-native capabilities |
| **Cutover** | The event where production traffic switches from legacy to new platform |
| **Run-in-Parallel** | Running legacy and new platform simultaneously for validation |
| **Rollback Plan** | Pre-defined procedure to revert to legacy platform if cutover fails |

## 4. Detailed Design / Implementation

### Migration Phases

```
Phase 0: Assessment (2-4 weeks)
  ├── Inventory all workloads, tables, jobs
  ├── Assess compatibility (API changes, deprecated features)
  ├── Estimate effort and risk per component
  └── Define success criteria and SLAs

Phase 1: Foundation Setup (2-3 weeks)
  ├── Provision CDP environment (cluster, networking, IAM)
  ├── Configure SDX (Ranger, Atlas, FreeIPA)
  ├── Set up monitoring (Cloudera Manager)
  └── Establish connectivity to source systems

Phase 2: Data Migration (4-8 weeks)
  ├── Migrate Hive schemas and metastore
  ├── Replicate HDFS data using DistCP
  ├── Migrate HBase tables
  └── Validate data integrity (checksums, record counts)

Phase 3: Workload Migration (6-12 weeks)
  ├── Migrate ETL jobs (Oozie workflows, Spark scripts)
  ├── Migrate Informatica connections and mappings
  ├── Migrate BI tool connections (ODBC/JDBC endpoints)
  ├── Run parallel validation period
  └── Performance tune on new platform

Phase 4: Cutover & Decommission (1-2 weeks)
  ├── Final data sync (incremental)
  ├── Freeze legacy platform writes
  ├── DNS/JDBC endpoint cutover
  ├── Monitor for 72 hours post-cutover
  └── Decommission legacy cluster
```

### Assessment Inventory Script
```bash
# List all Hive databases and table counts
beeline -u "jdbc:hive2://legacy-host:10000" \
  -e "SHOW DATABASES;" 2>/dev/null | \
  while read db; do
    count=$(beeline -u "jdbc:hive2://legacy-host:10000/$db" \
      -e "SHOW TABLES;" 2>/dev/null | wc -l)
    echo "$db: $count tables"
  done

# HDFS storage consumption by zone
hdfs dfs -du -h /warehouse | sort -rh | head -20

# Active Oozie jobs
oozie jobs -jobtype coordinator -status RUNNING 2>/dev/null | wc -l
```

### DistCP HDFS Data Replication
```bash
# Replicate raw zone from CDH to CDP
hadoop distcp \
  -Dmapreduce.job.queuename=migration \
  -pb \
  -update \
  -skipcrccheck \
  -numListstatusThreads 40 \
  -m 50 \
  hdfs://legacy-namenode:8020/warehouse/raw \
  hdfs://cdp-namenode:8020/warehouse/raw

# Verify replication
hadoop distcp \
  -diff legacy_snapshot cdp_snapshot \
  hdfs://legacy-namenode:8020/warehouse/raw \
  hdfs://cdp-namenode:8020/warehouse/raw
```

### Hive Metastore Migration
```bash
# Export from legacy
mysqldump -h legacy-mysql \
  -u hive -phive_password \
  metastore > hive_metastore_backup.sql

# Import to CDP (after schema adjustments for Hive 3 compatibility)
mysql -h cdp-mysql \
  -u hive -phive_password \
  metastore < hive_metastore_backup_adjusted.sql

# Repair partitions after metastore restore
hive -e "MSCK REPAIR TABLE schema_name.table_name;"
```

## 5. Best Practices

- **Assessment first**: Never begin migration without a full workload inventory
- **Migrate in waves**: Start with non-critical workloads; save business-critical for last
- **Parallel validation**: Run legacy and CDP in parallel for minimum 2 weeks before cutover
- **Automate migration scripts**: Use Cloudera Upgrade Assistant where available
- **Security first**: Configure Ranger policies before migrating any data
- **Test rollback**: Rehearse rollback procedure in non-prod before production cutover
- **Document everything**: Capture pre/post migration metrics for every component

### Don'ts
- ❌ Don't migrate without a tested rollback plan
- ❌ Don't skip parallel validation period under schedule pressure
- ❌ Don't assume Hive 1.x SQL is 100% compatible with Hive 3.x — test all queries
- ❌ Don't migrate Kerberos keytabs — regenerate on the new platform
- ❌ Don't cut over BI tools before validating all queries produce identical results

## 6. Common Issues & Troubleshooting

| Issue | Root Cause | Resolution |
|---|---|---|
| Hive query failures post-migration | Hive 3 ACID strictness, reserved keywords | Review and fix DDL; enable non-strict mode temporarily |
| DistCP fails partway | Network timeout or permission error | Resume with `-update` flag; check HDFS permissions |
| Spark job OOM on CDP | Default memory settings different from legacy | Tune `spark.executor.memory` and `spark.driver.memory` |
| BI reports show wrong data | JDBC URL pointing to legacy cluster | Update all connection strings to CDP endpoints |
| FreeIPA authentication failures | Keytab from old KDC | Regenerate keytabs on CDP FreeIPA |

## 7. Performance & Optimization

- **DistCP parallelism**: Use `-m 50` to run 50 parallel copy tasks
- **Hive optimization**: Re-run `ANALYZE TABLE` on all migrated tables for fresh statistics
- **Spark tuning**: Re-baseline performance on CDP — don't assume same settings work
- **File format upgrade**: Use migration as opportunity to convert CSV/JSON to Parquet/ORC
- **Network bandwidth**: Schedule large DistCP jobs during off-peak hours

## 8. Governance & Compliance

- **Policy migration**: Re-create all Ranger policies on CDP; don't copy raw policy DB
- **Atlas re-registration**: Re-register all data assets in CDP Atlas for lineage continuity
- **Compliance window**: Agree with compliance/audit team on data continuity requirements
- **Dual audit**: Enable audit logging on both platforms during parallel run period
- **Data classification**: Re-apply Atlas tags and classifications post-migration

## 9. Tools & Technologies

| Tool | Purpose |
|---|---|
| Cloudera Upgrade Assistant | Automated compatibility checks and upgrade paths |
| Apache DistCP | Parallel HDFS-to-HDFS data replication |
| Hive Metastore Migration Tool | Schema and partition metadata migration |
| Cloudera Replication Manager | Managed data and metadata replication |
| Apache Ranger | Policy migration and access control |
| Cloudera Manager | Cluster monitoring during migration |

## 10. Real-World Use Cases

**Financial Services CDH to CDP Migration:**
- 200TB data warehouse migrated over 6 months in 4 waves
- Wave 1: Non-critical reporting (2 weeks); Wave 4: Real-time trading feeds (last)
- 3-week parallel validation with automated daily reconciliation reports

**NSE Market Data Platform:**
- On-premise CDH 5.16 to CDP PvC Base 7.1.7
- Hive metastore migration required fixing 1,200+ reserved keyword conflicts
- Zero-downtime cutover achieved using DNS-level JDBC endpoint switch

## 11. References

- [Cloudera CDP Migration Guide](https://docs.cloudera.com/cdp-private-cloud-upgrade/latest/index.html)
- [Cloudera Upgrade Assistant](https://docs.cloudera.com/upgrade-advisor/latest/index.html)
- [Apache DistCP Guide](https://hadoop.apache.org/docs/current/hadoop-distcp/DistCp.html)
- [Hive 3 Migration Guide](https://docs.cloudera.com/documentation/enterprise/upgrade/topics/upgrade_hive_metastore.html)
- [Cloudera Replication Manager](https://docs.cloudera.com/management-console/cloud/data-replication/index.html)
