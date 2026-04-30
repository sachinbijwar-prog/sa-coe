# Metadata & Lineage Management

## 1. Overview
Metadata and Data Lineage are foundational pillars of enterprise data governance. Metadata describes the data — its structure, origin, ownership, and usage. Lineage tracks how data moves and transforms from source to consumption. Together, they enable data discovery, impact analysis, regulatory compliance, and stakeholder trust.

In Cloudera Data Platform, **Apache Atlas** is the primary metadata and lineage management tool. Every table, column, ETL job, and data flow must be registered and tracked in Atlas to maintain a governed, auditable data estate.

**Why it matters:** Without metadata, data consumers cannot find or trust data. Without lineage, engineers cannot perform impact analysis for schema changes or debug data quality failures upstream.

## 2. Architecture Context

```
[Source Systems]
     │
     ▼
[Ingestion Layer] ──────────────── Atlas Hook (Sqoop/Kafka/NiFi)
     │                                      │
     ▼                                      ▼
[Raw Zone (HDFS/S3)] ─────────── Atlas Entity (DataSet)
     │                                      │
     ▼                                      ▼
[ETL / Spark Job] ──────────────── Atlas Process (ETL Lineage)
     │                                      │
     ▼                                      ▼
[Curated Zone] ─────────────────── Atlas Entity + Tags
     │                                      │
     ▼                                      ▼
[BI / Reporting Tools] ─────────── Atlas Lineage Graph
```

**Atlas Components:**
- **Atlas REST API**: Programmatic entity registration and search
- **Atlas Hooks**: Auto-capture lineage from Hive, Spark, Sqoop, NiFi
- **Atlas UI**: Browse metadata, view lineage graphs, manage classifications
- **Atlas Ranger Integration**: Tag-based access control policies

## 3. Core Concepts

| Concept | Description |
|---|---|
| **Entity** | Any object tracked in Atlas — table, column, ETL job, database |
| **Type Definition** | Schema that defines what attributes an entity has |
| **Classification** | Tags applied to entities (e.g., PII, SENSITIVE, FINANCIAL) |
| **Lineage** | Directed graph showing data flow from source to target |
| **Glossary Term** | Business vocabulary mapped to technical entities |
| **Propagation** | Classifications automatically inherited by downstream entities |
| **Atlas Hook** | Component embedded in Hive/Spark/Sqoop to auto-capture metadata |

### Metadata Categories

| Type | Examples |
|---|---|
| **Technical Metadata** | Table DDL, column types, partition keys, file format |
| **Operational Metadata** | Load dates, row counts, job run history |
| **Business Metadata** | Data owner, business description, glossary terms |
| **Governance Metadata** | PII classification, sensitivity level, retention policy |

## 4. Detailed Design / Implementation

### Registering a Table in Atlas via REST API
```python
import requests
import json

ATLAS_URL = "http://atlas-host:21000/api/atlas/v2"
AUTH = ("admin", "admin_password")

def register_hive_table(db_name: str, table_name: str, owner: str, description: str):
    """Register a Hive table entity in Apache Atlas."""
    entity = {
        "entity": {
            "typeName": "hive_table",
            "attributes": {
                "name": table_name,
                "db": {"typeName": "hive_db", "uniqueAttributes": {"qualifiedName": f"{db_name}@cluster1"}},
                "qualifiedName": f"{db_name}.{table_name}@cluster1",
                "tableType": "EXTERNAL",
                "owner": owner,
                "description": description,
                "createTime": "2024-04-01T00:00:00.000Z"
            },
            "classifications": []
        }
    }
    
    response = requests.post(
        f"{ATLAS_URL}/entity",
        headers={"Content-Type": "application/json"},
        auth=AUTH,
        data=json.dumps(entity)
    )
    return response.json()

# Register a curated table
register_hive_table(
    db_name="curated",
    table_name="fact_trade",
    owner="data_engineering_team",
    description="Central trade fact table — daily NSE/BSE trade records with customer and instrument enrichment."
)
```

### Applying Classification (PII Tag) to Columns
```python
def tag_column_as_pii(table_qualified_name: str, column_name: str):
    """Apply PII classification to a specific column."""
    
    # First get the column GUID
    search_response = requests.get(
        f"{ATLAS_URL}/search/attribute",
        params={"typeName": "hive_column", "attrName": "qualifiedName", 
                "attrValuePrefix": f"{table_qualified_name}.{column_name}"},
        auth=AUTH
    ).json()
    
    col_guid = search_response["entities"][0]["guid"]
    
    # Apply PII classification
    classification_payload = [{"typeName": "PII"}]
    requests.post(
        f"{ATLAS_URL}/entity/guid/{col_guid}/classifications",
        headers={"Content-Type": "application/json"},
        auth=AUTH,
        data=json.dumps(classification_payload)
    )
    print(f"Tagged {table_qualified_name}.{column_name} as PII")

# Tag sensitive columns
tag_column_as_pii("curated.dim_customer@cluster1", "full_name")
tag_column_as_pii("curated.dim_customer@cluster1", "date_of_birth")
tag_column_as_pii("curated.dim_customer@cluster1", "email")
```

### Capturing Spark Lineage via Atlas Hook
```python
# Configure Spark to emit lineage to Atlas automatically
spark = SparkSession.builder \
    .appName("TradeTransformation") \
    .config("spark.extraListeners", "com.hortonworks.spark.atlas.SparkAtlasEventTracker") \
    .config("spark.sql.queryExecutionListeners", 
            "com.hortonworks.spark.atlas.SparkAtlasEventTracker") \
    .config("atlas.cluster.name", "cdp-cluster-1") \
    .config("atlas.rest.address", "http://atlas-host:21000") \
    .getOrCreate()

# Any transformation now auto-registers lineage in Atlas
curated_df = spark.table("raw.trade_raw") \
    .filter(col("trade_date") == "2024-04-01") \
    .join(spark.table("curated.dim_customer"), on="customer_id") \
    .groupBy("segment").agg(sum("trade_value").alias("total_value"))

curated_df.write.mode("overwrite").saveAsTable("mart.daily_segment_summary")
# Atlas now shows: raw.trade_raw + curated.dim_customer → mart.daily_segment_summary
```

### Business Glossary Setup
```python
def create_glossary_term(term_name: str, definition: str, acronym: str = None):
    """Create a business glossary term in Atlas."""
    payload = {
        "name": term_name,
        "shortDescription": acronym,
        "longDescription": definition,
        "anchor": {"glossaryGuid": "DEFAULT_GLOSSARY_GUID"}
    }
    response = requests.post(
        f"{ATLAS_URL}/glossary/term",
        headers={"Content-Type": "application/json"},
        auth=AUTH,
        data=json.dumps(payload)
    )
    return response.json()

# Define business terms
create_glossary_term("Net Asset Value", 
    "Total value of assets minus liabilities per fund unit.", "NAV")
create_glossary_term("Settlement Date", 
    "The date on which a trade is settled and ownership officially transfers.", "SD")
```

## 5. Best Practices

- **Register at ingestion**: Register entities in Atlas when data first lands, not after transformation
- **Use qualifiedName convention**: Always use `db_name.table_name@cluster_name` for uniqueness
- **Enable Atlas Hooks**: Configure Hive, Spark, Sqoop Atlas hooks to auto-capture lineage
- **Tag at column level**: Apply PII/SENSITIVE classifications at column level, not just table level
- **Propagate classifications**: Enable downstream propagation so Ranger auto-applies policies
- **Maintain glossary**: Map every business term to its technical implementation
- **Audit classification changes**: Track who applied/removed tags and when

### Don'ts
- ❌ Don't register entities without `qualifiedName` — causes duplicate detection failures
- ❌ Don't apply table-level classifications without verifying column-level coverage
- ❌ Don't allow shadow tables (unregistered tables in Atlas) to reach production
- ❌ Don't skip lineage capture for manual SQL transformations — register explicitly via API

## 6. Common Issues & Troubleshooting

| Issue | Root Cause | Resolution |
|---|---|---|
| Lineage not captured for Spark jobs | Atlas hook not configured in SparkConf | Add `spark.extraListeners` and `spark.sql.queryExecutionListeners` |
| Duplicate entity registration errors | `qualifiedName` inconsistency | Standardize naming convention; use UPSERT mode |
| Classifications not propagating | Propagation disabled on classification type | Enable propagation in Atlas classification definition |
| Atlas search returns stale results | Index rebuild lag | Trigger `POST /api/atlas/admin/reindex` |
| Hive lineage missing for CTAS queries | HiveServer2 hook not enabled | Enable `atlas.hook.hive.synchronous` in hive-site.xml |

## 7. Performance & Optimization

- **Batch registration**: Use `POST /api/atlas/v2/entity/bulk` for registering multiple entities
- **Selective lineage**: Configure Atlas hooks to capture lineage for specific databases only
- **Index optimization**: Schedule Atlas Elasticsearch index optimization during off-peak hours
- **Notification throttling**: Set `atlas.notification.consumer.retries` to prevent Kafka consumer overload
- **Search caching**: Cache frequently used Atlas search queries for glossary lookups

## 8. Governance & Compliance

- **SEBI/RBI Lineage**: Regulatory reports require traceable lineage from raw source to submitted file
- **PII Audit Trail**: All PII column classifications must be logged with effective date and reviewer
- **Data Stewardship**: Each domain must have a designated Atlas data steward responsible for metadata quality
- **GDPR/PDPA Compliance**: Atlas PII tags drive automated data masking and retention policies
- **Schema Change Impact**: Before any DDL change, run Atlas impact analysis to identify downstream consumers

## 9. Tools & Technologies

| Tool | Purpose |
|---|---|
| Apache Atlas | Central metadata repository and lineage graph |
| Atlas REST API | Programmatic metadata and lineage management |
| Atlas Hooks (Hive/Spark) | Automatic lineage capture from processing engines |
| Apache Ranger | Tag-based access control driven by Atlas classifications |
| Cloudera Manager | Atlas service monitoring and configuration |
| Apache Kafka | Atlas notification bus for real-time metadata events |

## 10. Real-World Use Cases

**NSE Regulatory Audit (SEBI):**
- Complete lineage from NSE feed → Raw Zone → Curated → Regulatory Report registered in Atlas
- Auditors trace any reported figure back to source tick in under 5 minutes
- 2,400 Hive tables and 8,000+ columns tagged with business classifications

**Banking PII Management:**
- 47 PII columns across 12 tables tagged in Atlas; Ranger auto-masking applied
- GDPR data subject deletion requests fulfilled using Atlas to identify all tables containing customer PAN/Aadhaar
- Zero-tolerance policy: any untagged column in `curated` zone triggers pipeline failure

## 11. References

- [Apache Atlas Documentation](https://atlas.apache.org/)
- [Atlas REST API Guide](https://atlas.apache.org/api/v2/index.html)
- [Cloudera Atlas Configuration](https://docs.cloudera.com/cdp-private-cloud-base/latest/security-apache-ranger-atlas/topics/security-atlas-overview.html)
- [Spark Atlas Connector](https://github.com/hortonworks-spark/spark-atlas-connector)
- [Atlas Classification Propagation](https://atlas.apache.org/Classification-Propagation.html)
