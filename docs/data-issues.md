# Data Issues Troubleshooting Guide

## 1. Overview
Data issues are often the most difficult to troubleshoot because the pipeline may run "successfully" while producing incorrect or corrupt results. This document covers common data-level problems like schema drift, duplication, and referential integrity violations.

## 2. Architecture Context
Data issues can occur at any stage:
- **Raw Zone**: Schema changes at the source.
- **Staging Zone**: Data truncation or type mismatch during ingestion.
- **Curated Zone**: Business logic errors or incorrect join conditions.
- **Consumption Zone**: Aggregation errors or stale data.

## 3. Core Concepts
- **Data Drift**: Unexpected changes in data structure, distribution, or semantics over time.
- **Garbage In, Garbage Out (GIGO)**: The principle that poor input quality results in poor output.
- **Silent Failure**: A job that completes successfully but produces zero records or incorrect data.
- **Quarantine**: The process of isolating bad records while allowing the rest of the job to proceed.

## 4. Detailed Design / Implementation

### Detecting Duplicates via SQL
```sql
SELECT transaction_id, count(*)
FROM sales_fact
GROUP BY transaction_id
HAVING count(*) > 1;
```

### Validating Schema Drift in Spark
```python
def check_schema(df, expected_columns):
    actual_columns = set(df.columns)
    missing = expected_columns - actual_columns
    extra = actual_columns - expected_columns
    if missing or extra:
        raise Exception(f"Schema Drift Detected! Missing: {missing}, Extra: {extra}")
```

## 5. Best Practices
- **Implement Data Validation Gates**: Check record counts and null percentages before moving data to the next zone.
- **Use Medallion Architecture**: Incrementally clean and refine data (Bronze -> Silver -> Gold).
- **Watermarking**: Use watermarks to handle late-arriving data and ensure exactly-once processing.
- **Document Source Semantics**: Clearly define what each column means and its expected range of values.

## 6. Common Issues & Troubleshooting
- **Data Truncation**: A source column grew larger than the target schema (e.g., `VARCHAR(50)` to `VARCHAR(100)`). Resolution: Update target schema and reload.
- **Incorrect Joins**: Using a non-unique key for a join, causing a Cartesian product. Resolution: Verify join keys and use `DISTINCT` if necessary.
- **Null Value Propagation**: A null in a critical column (like `customer_id`) causing dropped records in inner joins. Resolution: Use outer joins or fill nulls with a default value.
- **Encoding Issues**: Special characters (UTF-8 vs Latin1) causing corruption. Resolution: Standardize on UTF-8 across the pipeline.

## 7. Performance & Optimization
- **Data Profiling**: Regularly run profiling tools to understand data distributions and identify outliers.
- **Automated Sampling**: Profile a sample of data (e.g., 1%) to catch issues without the overhead of scanning full tables.

## 8. Governance & Compliance
- **Data Lineage**: Use lineage to trace a data issue back to its source.
- **Impact Analysis**: Before fixing a data issue, determine which downstream reports or models are affected.
- **Correction Audit**: Maintain a record of all manual data corrections or "one-time" patches.

## 9. Tools & Technologies
- **Great Expectations**: Popular library for data testing and documentation.
- **Apache Atlas**: For metadata and lineage.
- **DBeaver/Hue**: For manual data investigation.

## 10. Real-World Use Cases
- **The "Missing Sales" Mystery**: Total revenue in the dashboard didn't match the source system. Root Cause: An inner join dropped records with `region_id IS NULL`.
- **Date Format Shift**: A source system changed from `YYYY-MM-DD` to `DD-MM-YYYY`, causing nulls in the date column.

## 11. References
- [Great Expectations Documentation](https://docs.greatexpectations.io/)
- [Principles of Data Quality Engineering](https://www.montecarlodata.com/blog-what-is-data-reliability-engineering/)
