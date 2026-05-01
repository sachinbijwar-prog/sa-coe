# Data Flow & Pipeline Standards

## 1. Overview
Understanding how data flows from source to consumption is critical for debugging, impact analysis, and system design. This document outlines the standard data flow patterns and the "Medallion Architecture" zones used in the Smart Analytica platform.

## 2. Architecture Context
Data moves through four primary stages:
1.  **Ingestion**: Source -> Raw Zone.
2.  **Staging**: Raw -> Staging Zone (Schema validation, initial cleanup).
3.  **Refining**: Staging -> Core Zone (De-duplication, SCD Type 2, business keys).
4.  **Enriching**: Core -> Mart Zone (Aggregations, flattening for BI).

## 3. Core Concepts
- **Lineage**: The end-to-end path of data.
- **Upstream / Downstream**: Relative position in the data flow.
- **Persistence**: How long data is stored in each zone.
- **Zone Isolation**: Ensuring compute resources for "Raw" ingestion don't affect "Mart" reporting performance.

## 4. Detailed Design / Implementation

### The Medallion Architecture Flow
| Zone | Format | Logic | Purpose |
|---|---|---|---|
| **Raw (Bronze)** | As-is (CSV, JSON, Avro) | No transformations | Historical archive, re-run capability. |
| **Staging** | Parquet | Type casting, trim whitespace | Standardized base for processing. |
| **Core (Silver)** | Parquet / Delta | Joins, SCD2, cleansing | "Single source of truth" for the enterprise. |
| **Mart (Gold)** | Parquet / Analytics Store | Aggregates, denormalized | Optimized for BI tools (PowerBI/Tableau). |

### Capturing Flow via Atlas
Lineage is automatically captured when using:
- **Hive**: Via the Hive Metastore Hook.
- **Spark**: Via the Spark Atlas Connector (SAC).
- **Sqoop**: Via the Sqoop Hook.

## 5. Best Practices
- **Never Skip a Zone**: Avoid "skipping" Core to go straight to Mart; this creates technical debt.
- **Immutable Raw Zone**: Data in the Raw zone should never be modified or deleted (except for retention policies).
- **Standardized Filenames**: Use `[source]_[table]_[timestamp]` for files in the landing area.
- **Audit Logging**: Every flow must record "Source Count" and "Target Count" in the Audit Framework.

## 6. Common Issues & Troubleshooting
- **Missing Lineage**: A Spark job ran but doesn't show in Atlas. Check if the SAC jar is in the classpath.
- **Data Mismatch between Zones**: Logic in the Refining stage is filtering records incorrectly. Check join conditions.
- **Broken Dependency**: Mart job started before Core job finished. Check Airflow DAG dependencies.

## 7. Performance & Optimization
- **Pushdown Logic**: Perform filtering and projections as close to the source as possible.
- **Incremental Flows**: Only process the "Delta" (new data) in each stage to reduce compute time and cost.

## 8. Governance & Compliance
- **Data Classification**: Flow diagrams must identify where PII data is masked or encrypted.
- **SLA Management**: Define the "Expected Time of Arrival" (ETA) for data in each zone.

## 9. Tools & Technologies
- **Apache Atlas**: The primary tool for visualizing data flow and lineage.
- **Apache Airflow**: Orchestrates the movement between zones.
- **Informatica PowerCenter**: Handles complex legacy data flows.

## 10. Real-World Use Cases
- **Retail Sales Flow**: POS data -> S3 Raw -> Hive Staging -> Spark Core (Customer dedupe) -> Impala Mart (Daily Revenue).
- **Log Analytics Flow**: App Logs -> Kafka -> Spark Streaming Staging -> Hive Mart (Security Dashboard).

## 11. References
- [Databricks Medallion Architecture](https://www.databricks.com/glossary/medallion-architecture)
- [Cloudera Data Governance with Atlas](https://docs.cloudera.com/runtime/7.2.10/atlas-governance/topics/atlas-introduction.html)
