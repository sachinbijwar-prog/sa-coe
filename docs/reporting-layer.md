# Reporting & Consumption Layer

## 1. Overview
The Reporting and Consumption Layer is the final stage of the Data Warehouse architecture where data is presented to end-users and applications for decision-making. This layer provides high-performance access to curated datasets, aggregated marts, and real-time feeds using BI tools, custom applications, and SQL interfaces.

Efficient consumption design ensures that business users can retrieve insights quickly without needing to understand the underlying technical complexities of the data lake.

## 2. Architecture Context

```
[Consumption Patterns]

  Curated/Mart Zone ───────────┐
       │                       │
  ┌────▼────┐             ┌────▼────┐             ┌────▼────┐
  │ BI Tool │             │ SQL API │             │ Custom  │
  │(Tableau)│             │(Impala) │             │  App    │
  └─────────┘             └─────────┘             └─────────┘
```

**Key Engines:**
- **Apache Impala**: Primary engine for low-latency, interactive BI queries.
- **Hive LLAP**: Used for complex, large-scale analytical reporting.
- **JDBC/ODBC**: Standard interfaces for connecting external tools to the DWH.

## 3. Core Concepts

| Concept | Description |
|---|---|
| **Semantic Layer** | A business-friendly abstraction of complex data structures. |
| **Materialized View** | Pre-computed result sets stored for fast retrieval. |
| **Star Schema** | Preferred modeling pattern for BI tool performance. |
| **Flat Table (OBT)** | One Big Table approach to minimize joins for end-users. |
| **Ad-hoc Query** | Unplanned queries executed directly by analysts. |
| **Caching** | Storing frequently accessed results in memory (e.g., Impala Caching). |

## 4. Detailed Design / Implementation

### Impala Performance Tuning for BI
```sql
-- Compute stats to help optimizer
COMPUTE STATS mart.sales_summary;

-- Use hints for optimal join strategy if needed
SELECT /* +straight_join */ 
    f.sale_id, d.customer_name 
FROM fact_sales f 
JOIN dim_customer d ON f.cust_id = d.cust_id;
```

### Standard View for Semantic Layer
```sql
CREATE VIEW mart.vw_customer_revenue AS
SELECT 
    c.customer_name,
    c.segment,
    SUM(f.revenue) as total_revenue,
    f.business_date
FROM curated.fact_orders f
JOIN curated.dim_customer c ON f.customer_sk = c.customer_sk
WHERE c.is_current = true
GROUP BY c.customer_name, c.segment, f.business_date;
```

## 5. Best Practices
- **Aggregate early**: Use batch jobs to create summary tables (Marts) for BI tools.
- **Filter at source**: BI tools should push filters down to the SQL engine.
- **Avoid SELECT ***: Always specify columns to reduce I/O.
- **Standardize Joins**: Use Star Schema (Fact and Dimensions) for predictable performance.
- **Monitor Query Workload**: Use Cloudera Manager or Impala Query Profiles to identify slow reports.

## 6. Common Issues & Troubleshooting
- **Slow Dashboards**: Often caused by complex joins or lack of table statistics.
- **Connection Failures**: Check JDBC/ODBC driver compatibility and Knox gateway settings.
- **Data Mismatch**: Ensure BI tools are pointing to the correct Curated/Mart version.

## 7. Performance & Optimization
- **Impala Admission Control**: Manage concurrent query limits to prevent resource exhaustion.
- **Result Set Caching**: Enable caching for frequently run dashboard queries.
- **Partition Pruning**: Ensure all consumption queries use partition columns in WHERE clauses.

## 8. Governance & Compliance
- **Row-Level Security**: Enforce data access restrictions via Ranger row filters.
- **Audit Logs**: Track who is accessing which reports and datasets.
- **PII Masking**: Ensure sensitive fields are masked in the consumption layer.

## 9. Tools & Technologies
- **BI Tools**: Tableau, Power BI, SAP BusinessObjects.
- **SQL Engines**: Apache Impala, Hive LLAP.
- **Connectivity**: Apache Knox (Secure Gateway), JDBC/ODBC.

## 10. Real-World Use Cases
- **Executive Dashboards**: Real-time sales performance and KPI tracking using Impala.
- **Regulatory Reporting**: End-of-month financial reports generated via Hive LLAP.

## 11. References
- [Cloudera BI Integration Guide](https://docs.cloudera.com)
- [Tableau Spark/Hive Connection Best Practices](https://help.tableau.com)
