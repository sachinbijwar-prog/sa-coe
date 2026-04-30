# Data Quality & Validation Framework

## 1. Overview
Data Quality (DQ) is the measure of data's fitness for its intended purpose across dimensions of accuracy, completeness, consistency, timeliness, and validity. In enterprise data warehouses, poor data quality leads to incorrect business decisions, regulatory non-compliance, and erosion of stakeholder trust in the platform.

The **Data Quality & Validation Framework (DQVF)** provides a standardized, automated approach to detecting, reporting, and resolving data quality issues across all DWH layers.

## 2. Architecture Context

```
[Source Data]
     │
     ▼
[Ingestion Layer]
     │
     ▼
[DQ Gate 1: Raw Validation]     ← Schema, null, format checks
     │
     ├── PASS → [Staging Zone]
     └── FAIL → [Quarantine Zone] + [DQ Alert]
                       │
                       ▼
              [DQ Gate 2: Business Rules]  ← Referential integrity, range, uniqueness
                       │
                       ├── PASS → [Curated Zone]
                       └── FAIL → [Reject Table] + [DQ Report]
                                        │
                                        ▼
                               [DQ Dashboard] (Impala / BI Tool)
```

## 3. Core Concepts

### DQ Dimensions

| Dimension | Definition | Example Check |
|---|---|---|
| **Completeness** | No missing required values | `trade_id IS NOT NULL` |
| **Accuracy** | Values match real-world facts | `price > 0 AND price < 100000` |
| **Consistency** | Same data means the same thing across tables | `customer_id in dim_customer` |
| **Timeliness** | Data arrives within expected SLA | `load_date = current_date` |
| **Uniqueness** | No duplicate records for primary keys | `COUNT(DISTINCT trade_id) = COUNT(trade_id)` |
| **Validity** | Values conform to defined format/domain | `email LIKE '%@%.%'` |
| **Referential Integrity** | FK values exist in referenced table | `customer_sk IN (SELECT customer_sk FROM dim_customer)` |

## 4. Detailed Design / Implementation

### DQ Rule Definition Table
```sql
CREATE TABLE dq_ctrl.dq_rules (
    rule_id         INT,
    table_name      STRING,
    column_name     STRING,
    rule_type       STRING,  -- NULL_CHECK, RANGE, FORMAT, UNIQUENESS, REFERENTIAL
    rule_expression STRING,  -- SQL expression to evaluate
    threshold_pct   DECIMAL(5,2),  -- Acceptable failure % (e.g., 0.01%)
    severity        STRING,  -- CRITICAL / HIGH / MEDIUM / LOW
    is_active       BOOLEAN,
    created_by      STRING,
    created_dt      TIMESTAMP
)
STORED AS ORC
LOCATION '/warehouse/ctrl/dq_rules';
```

### DQ Results Log Table
```sql
CREATE TABLE dq_ctrl.dq_results (
    result_id       BIGINT,
    rule_id         INT,
    table_name      STRING,
    load_date       STRING,
    batch_id        BIGINT,
    total_records   BIGINT,
    failed_records  BIGINT,
    failure_pct     DECIMAL(8,4),
    threshold_pct   DECIMAL(5,2),
    status          STRING,  -- PASS / FAIL / WARN
    run_ts          TIMESTAMP
)
STORED AS ORC
LOCATION '/warehouse/ctrl/dq_results';
```

### PySpark DQ Validation Engine
```python
from pyspark.sql import SparkSession
from pyspark.sql.functions import col, count, when, isnan, isnull, lit, current_timestamp
from datetime import date

spark = SparkSession.builder.appName("DQValidation").getOrCreate()

def run_dq_checks(table_name: str, load_date: str, batch_id: int):
    df = spark.table(table_name).filter(f"load_date = '{load_date}'")
    total = df.count()
    results = []

    # Check 1: Null check on critical columns
    null_count = df.filter(
        col("trade_id").isNull() | col("customer_sk").isNull()
    ).count()
    
    results.append({
        "rule": "NULL_CHECK_CRITICAL_COLS",
        "table": table_name,
        "total": total,
        "failed": null_count,
        "failure_pct": (null_count / total * 100) if total > 0 else 0,
        "threshold_pct": 0.0,  # Zero tolerance
        "status": "FAIL" if null_count > 0 else "PASS"
    })

    # Check 2: Range check on price
    invalid_price = df.filter(
        (col("price") <= 0) | (col("price") > 1000000)
    ).count()
    
    results.append({
        "rule": "RANGE_CHECK_PRICE",
        "table": table_name,
        "total": total,
        "failed": invalid_price,
        "failure_pct": (invalid_price / total * 100) if total > 0 else 0,
        "threshold_pct": 0.01,  # 0.01% tolerance
        "status": "FAIL" if (invalid_price / total * 100) > 0.01 else "PASS"
    })

    # Check 3: Uniqueness on trade_id
    unique_count = df.select("trade_id").distinct().count()
    dup_count = total - unique_count
    
    results.append({
        "rule": "UNIQUENESS_TRADE_ID",
        "table": table_name,
        "total": total,
        "failed": dup_count,
        "failure_pct": (dup_count / total * 100) if total > 0 else 0,
        "threshold_pct": 0.0,
        "status": "FAIL" if dup_count > 0 else "PASS"
    })

    # Check 4: Referential integrity
    dim_customer_ids = spark.table("curated.dim_customer") \
        .filter("is_current = true") \
        .select("customer_sk")
    
    orphan_count = df.join(dim_customer_ids, on="customer_sk", how="left_anti").count()
    
    results.append({
        "rule": "REF_INTEGRITY_CUSTOMER",
        "table": table_name,
        "total": total,
        "failed": orphan_count,
        "failure_pct": (orphan_count / total * 100) if total > 0 else 0,
        "threshold_pct": 0.0,
        "status": "FAIL" if orphan_count > 0 else "PASS"
    })

    return results

# Run checks and log results
results = run_dq_checks("curated.fact_trade", str(date.today()), 1234)

# Check for critical failures
critical_failures = [r for r in results if r["status"] == "FAIL" and r["failure_pct"] > r["threshold_pct"]]
if critical_failures:
    raise Exception(f"DQ CRITICAL FAILURE: {critical_failures}")
```

### Reconciliation Check (Source vs Target)
```python
def reconcile_counts(source_query: str, target_query: str, tolerance_pct: float = 0.001):
    """Compare record counts between source and target."""
    source_count = spark.sql(source_query).collect()[0][0]
    target_count = spark.sql(target_query).collect()[0][0]
    
    variance = abs(source_count - target_count) / source_count * 100
    status = "PASS" if variance <= tolerance_pct else "FAIL"
    
    print(f"Source: {source_count} | Target: {target_count} | Variance: {variance:.4f}% | Status: {status}")
    return status

reconcile_counts(
    "SELECT COUNT(*) FROM source_db.trades WHERE trade_date = '2024-04-01'",
    "SELECT COUNT(*) FROM curated.fact_trade WHERE trade_date = '2024-04-01'",
    tolerance_pct=0.001
)
```

## 5. Best Practices

- **DQ gates at every layer**: Raw → Staging → Curated — each transition must pass DQ checks
- **Zero tolerance for critical columns**: NULL on primary/foreign keys = pipeline halt
- **Parameterized thresholds**: Store acceptable failure percentages in config table
- **Quarantine, don't discard**: Failed records go to quarantine zone for investigation
- **DQ reporting**: Publish daily DQ dashboard visible to data owners and consumers
- **Rule versioning**: Track changes to DQ rules with effective dates
- **Automate alerts**: Email/Slack notification when DQ failure exceeds threshold

### Don'ts
- ❌ Don't let bad data silently pass into the curated zone
- ❌ Don't apply the same threshold to all tables — critical tables need stricter rules
- ❌ Don't delete rejected records — move to quarantine with full context
- ❌ Don't run DQ checks without logging results — lose auditability

## 6. Common Issues & Troubleshooting

| Issue | Root Cause | Resolution |
|---|---|---|
| DQ check takes longer than load | Full table scan for referential check | Partition-wise incremental DQ check |
| False positives on NULL check | Optional fields treated as mandatory | Review rule definition; adjust column list |
| Source count mismatch | Late-arriving records, timezone differences | Add 1-hour buffer window for reconciliation |
| Quarantine zone growing unboundedly | No cleanup process | Implement 30-day TTL on quarantine zone |

## 7. Performance & Optimization

- **Partition-level DQ**: Only check the newly loaded partition, not full table
- **Sampling for large datasets**: Use statistical sampling (1% sample) for range/format checks on 100M+ records
- **Parallel rule execution**: Run independent DQ rules concurrently using multi-threading
- **Pre-compute counts**: Cache record counts in DQ control table to avoid re-scanning

## 8. Governance & Compliance

- **Data Stewardship**: Assign a data owner per domain responsible for DQ SLAs
- **DQ SLA**: Define and track DQ SLA (e.g., <0.01% null rate, 100% referential integrity)
- **Audit Trail**: All DQ rule executions and results logged with timestamp, batch ID, user
- **Regulatory Compliance**: For RBI/SEBI reporting, zero-tolerance DQ rules on regulatory fields
- **Atlas Integration**: Register DQ rules and results as Atlas entities for governance visibility

## 9. Tools & Technologies

| Tool | Purpose |
|---|---|
| PySpark / Spark SQL | Custom DQ rule execution at scale |
| Apache Griffin | Open-source DQ platform on Hadoop |
| Great Expectations | Python DQ framework with data docs |
| Cloudera Data Quality | CDP-native DQ monitoring |
| Hive/Impala | DQ result reporting and dashboards |
| Apache Atlas | DQ metadata and lineage tagging |

## 10. Real-World Use Cases

**NSE Trade Data Quality:**
- 22 DQ rules across 8 tables run post-ingestion nightly
- Zero tolerance on trade_id, instrument_id, and settlement_amount
- DQ failure rate dashboard reviewed by Data Governance committee monthly

**Banking CIBIL Reporting:**
- Referential integrity checks ensure all accounts map to valid customer records
- DQ gate blocks any file where >0.001% records fail customer reference check
- Full audit log maintained for RBI inspection readiness

## 11. References

- [Apache Griffin DQ Platform](https://griffin.apache.org/)
- [Great Expectations Documentation](https://docs.greatexpectations.io/)
- [Cloudera Data Quality](https://docs.cloudera.com/data-catalog/cloud/index.html)
- [DAMA Data Quality Dimensions](https://www.dama.org/)
- [SEBI Data Quality Requirements](https://www.sebi.gov.in/)
