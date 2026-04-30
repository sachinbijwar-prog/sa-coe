# Hive Migration

## 1. Overview
Hive migration is the process of moving Hive databases, tables, schemas, and workloads from a legacy Hadoop cluster (CDH 5.x/6.x or HDP 2.x/3.x) to Cloudera Data Platform (CDP) with Hive 3.x. This is one of the most complex migration workstreams due to significant architectural changes in Hive 3 — including strict ACID requirements, reserved keyword changes, and the introduction of Hive Warehouse Connector (HWC).

## 2. Architecture Context

```
[Legacy Hive]                         [CDP Hive 3]
  Hive 1.x/2.x (CDH)           →     Hive 3.x (LLAP + Tez)
  Hive 2.x (HDP)                →     Hive 3.x (LLAP + Tez)
  
  Metastore: MySQL/PostgreSQL   →     Metastore: MySQL/PostgreSQL (upgraded schema)
  Execution: MapReduce / Tez    →     Execution: Tez + LLAP
  Transactions: Limited ACID    →     Full ACID (ORC mandatory for ACID tables)
  HiveServer2: Direct JDBC      →     HiveServer2 + HWC for Spark integration
```

**Key Changes in Hive 3:**
- All managed tables are now **ACID** by default
- **ORC format** required for managed ACID tables (Parquet for external)
- Many **reserved keywords** added that break existing queries
- **Hive Warehouse Connector** required for Spark-Hive integration

## 3. Core Concepts

| Concept | Hive 1.x/2.x | Hive 3.x |
|---|---|---|
| Managed Tables | Non-ACID by default | ACID by default |
| Storage Format | Any (Text, Parquet, ORC) | ORC mandatory for managed |
| Spark Integration | Direct Hive Metastore | Hive Warehouse Connector (HWC) |
| Bucketing | Optional optimization | Required for ACID tables |
| `INSERT INTO` | Appends without control | Fully transactional |
| Reserved Keywords | ~100 keywords | ~200+ keywords (breaking change) |

## 4. Detailed Design / Implementation

### Phase 1: Assessment — Identify Compatibility Issues

```bash
#!/bin/bash
# Scan all HQL files for reserved keywords in Hive 3
RESERVED_KEYWORDS="AUTHORIZATION|CONF|CONSTRAINT|DAY|DAYOFWEEK|EXCHANGE|HOUR|MINUTE|MONTH|MORE|OVER|QUARTER|SECOND|SETS|SHOW_DATABASE|TABLE|TABLES|TIMESTAMP|WEEK|YEAR|ROLE|ROLES|SCHEMA|SCHEMAS|CUBE|ROLLUP|GROUPING|SETS"

find /etl/hql -name "*.hql" -o -name "*.sql" | while read file; do
    matches=$(grep -iE "($RESERVED_KEYWORDS)" "$file" | grep -v "^--")
    if [ ! -z "$matches" ]; then
        echo "=== RESERVED KEYWORD FOUND: $file ==="
        echo "$matches"
    fi
done
```

### Phase 2: Schema Export and Compatibility Fix

```python
import subprocess
import re

def export_hive_schemas(output_dir: str):
    """Export all Hive DDL from legacy cluster."""
    databases = subprocess.run(
        ['beeline', '-u', 'jdbc:hive2://legacy:10000', '-e', 'SHOW DATABASES;'],
        capture_output=True, text=True
    ).stdout.strip().split('\n')
    
    for db in databases:
        db = db.strip()
        if not db or db in ('database_name', '+-'):
            continue
        tables = subprocess.run(
            ['beeline', '-u', f'jdbc:hive2://legacy:10000/{db}', '-e', 'SHOW TABLES;'],
            capture_output=True, text=True
        ).stdout
        # Export DDL for each table
        # ... (iterate and SHOW CREATE TABLE)

def fix_reserved_keywords(ddl: str) -> str:
    """Escape reserved keywords in column names."""
    reserved = ['year', 'month', 'day', 'hour', 'minute', 'second', 'role', 'table']
    for kw in reserved:
        # Escape as column name with backticks
        pattern = rf'\b{kw}\b(?!\s*\()'  # Not a function call
        ddl = re.sub(pattern, f'`{kw}`', ddl, flags=re.IGNORECASE)
    return ddl
```

### Phase 3: Convert Managed Tables to External (Recommended)

```sql
-- Legacy: Managed Parquet table (not ACID-compliant in Hive 3)
-- PROBLEM: Hive 3 will convert this to ACID ORC, breaking Spark reads

-- SOLUTION: Convert all managed Parquet tables to EXTERNAL tables

-- Step 1: Verify data location
DESCRIBE FORMATTED legacy_managed_table;

-- Step 2: Drop managed table (data stays in HDFS)
DROP TABLE IF EXISTS curated.legacy_managed_table;

-- Step 3: Recreate as EXTERNAL (Hive 3 compatible)
CREATE EXTERNAL TABLE curated.legacy_managed_table (
    -- same columns as before
    trade_id    STRING,
    amount      DECIMAL(18,4),
    trade_date  DATE
)
PARTITIONED BY (load_date STRING)
STORED AS PARQUET
LOCATION '/warehouse/curated/legacy_managed_table'
TBLPROPERTIES ('external.table.purge'='false');

-- Step 4: Repair partitions
MSCK REPAIR TABLE curated.legacy_managed_table;
```

### Phase 4: Metastore Schema Upgrade

```bash
# On CDP cluster — upgrade the Hive metastore schema
# Run as hive user

# Stop HiveServer2
sudo systemctl stop hive-server2

# Run schema upgrade tool
schematool -dbType mysql \
  -upgradeSchemaFrom 2.3.0 \
  -url "jdbc:mysql://metastore-host:3306/metastore" \
  -driver "com.mysql.jdbc.Driver" \
  -userName hive \
  -passWord hive_password \
  -verbose

# Verify schema version
schematool -dbType mysql -info
```

### Phase 5: Validate Post-Migration

```sql
-- Run comparison queries against legacy cluster
-- Legacy cluster:
SELECT COUNT(*), SUM(trade_value), MAX(trade_date)
FROM trade_transactions
WHERE trade_date BETWEEN '2024-01-01' AND '2024-03-31';
-- Result: 8,432,211 | 45,678,234,123.50 | 2024-03-31

-- CDP cluster (same query):
SELECT COUNT(*), SUM(trade_value), MAX(trade_date)
FROM trade_transactions
WHERE trade_date BETWEEN '2024-01-01' AND '2024-03-31';
-- Expected: Same result

-- If mismatch: run MSCK REPAIR TABLE and recheck
```

## 5. Best Practices

- **Convert all managed tables to EXTERNAL**: Gives flexibility and avoids ACID ORC requirement
- **Escape reserved keywords**: Use backticks around column names matching Hive 3 reserved words
- **Test all HQL queries**: Run the full query library against CDP in parallel before cutover
- **Run MSCK REPAIR**: After migrating partitioned tables, always repair partition metadata
- **Use Hive Warehouse Connector**: For Spark jobs reading Hive managed tables in CDP
- **Keep ORC for ACID tables**: If ACID semantics needed (upserts), use ORC managed tables
- **Update JDBC strings**: Change `hive.server2.thrift.port` to CDP-specific endpoints

### Don'ts
- ❌ Don't assume Hive 2.x SQL is fully compatible with Hive 3.x
- ❌ Don't migrate keytabs — regenerate on CDP FreeIPA
- ❌ Don't leave managed tables as-is without testing ACID impact
- ❌ Don't skip `COMPUTE STATS` post-migration — query plans will be suboptimal

## 6. Common Issues & Troubleshooting

| Issue | Root Cause | Resolution |
|---|---|---|
| `ParseException: reserved keyword` | Column/table name is reserved in Hive 3 | Escape with backticks: `` `year` `` |
| `FAILED: SemanticException table not ACID` | INSERT into non-ACID managed table | Convert to EXTERNAL or enable ACID |
| Spark can't read Hive managed tables | HWC not configured | Configure HiveWarehouseConnector in Spark |
| Missing partitions after migration | Metastore not updated for migrated data | Run `MSCK REPAIR TABLE` |
| `DROP TABLE` deletes data in Hive 3 | Managed table purge behavior changed | Convert to EXTERNAL before dropping |
| Statistics not found | Tables migrated without re-analyzing | `ANALYZE TABLE ... COMPUTE STATISTICS` |

## 7. Performance & Optimization

- **LLAP for interactive queries**: Enable Hive LLAP for BI/reporting queries post-migration
- **Tez for batch ETL**: Ensure all ETL uses Tez engine (`hive.execution.engine=tez`)
- **Re-compute statistics**: Run `ANALYZE TABLE` on all migrated tables — legacy stats are invalid on CDP
- **File compaction**: If using ACID tables, schedule major compaction regularly
- **Vectorization**: Enable `hive.vectorized.execution.enabled=true` for columnar processing gains

## 8. Governance & Compliance

- **Re-create Ranger policies**: All Hive table/column access policies must be recreated in CDP Ranger
- **Atlas re-tagging**: Re-apply PII and sensitivity tags to migrated tables in CDP Atlas
- **Audit log continuity**: Ensure audit logs bridge the legacy → CDP migration for compliance
- **Schema documentation**: Update data dictionary in Atlas with any DDL changes made during migration

## 9. Tools & Technologies

| Tool | Purpose |
|---|---|
| Hive Metastore Upgrade Tool (`schematool`) | Migrate and upgrade metastore schema |
| Cloudera Replication Manager | Managed Hive replication to CDP |
| Hive Warehouse Connector (HWC) | Spark-Hive integration in CDP |
| Apache DistCP | HDFS data replication |
| Beeline | CLI for Hive query execution and validation |
| Cloudera Upgrade Assistant | Pre-migration compatibility checks |

## 10. Real-World Use Cases

**NSE Reporting Platform (CDH 5.16 → CDP 7.1.7):**
- 1,400 Hive tables migrated across 12 databases
- 847 reserved keyword conflicts resolved by automated SQL scanner
- All managed tables converted to EXTERNAL Parquet for Spark/Impala compatibility
- Migration completed with 3-week parallel validation period; zero data loss

**Banking Core DWH (HDP 3.1 → CDP PvC Base 7.1.8):**
- Metastore schema upgraded from Hive 2.3 to Hive 3.1
- ACID managed tables retained for transaction-level audit tables (account balance)
- HWC configured for existing Spark pipelines reading Hive tables

## 11. References

- [Cloudera Hive Migration Guide](https://docs.cloudera.com/cdp-private-cloud-upgrade/latest/migrate-hive.html)
- [Hive 3 New Features](https://cwiki.apache.org/confluence/display/Hive/Hive+3+New+Features)
- [Hive Reserved Keywords](https://cwiki.apache.org/confluence/display/Hive/LanguageManual+DDL#LanguageManualDDL-Keywords,NonReservedKeywordsandReservedKeywords)
- [Hive Warehouse Connector](https://docs.cloudera.com/documentation/enterprise/6/6.3/topics/spark_hive_warehouse_connector.html)
- [schematool Documentation](https://cwiki.apache.org/confluence/display/Hive/Hive+Schema+Tool)
