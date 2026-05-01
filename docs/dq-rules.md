# Data Quality Rules Catalog

## 1. Overview
Ensuring data quality (DQ) is a shared responsibility across the platform. This document provides a catalog of standard DQ rules, categorized by dimension, that should be applied to all critical data elements (CDEs) within the Smart Analytica ecosystem.

## 2. Architecture Context
DQ rules are implemented at multiple checkpoints:
- **Level 1: Technical Validation**: Null checks, type checks (at the Ingestion layer).
- **Level 2: Business Validation**: Range checks, cross-table consistency (at the Refining layer).
- **Level 3: Strategic Validation**: Year-over-year trends, statistical outliers (at the Mart layer).

## 3. Core Concepts
- **Dimension**: A category of data quality (e.g., Completeness, Accuracy, Timeliness).
- **Threshold**: The acceptable error rate (e.g., 99% of records must have a `customer_id`).
- **Severity**: The action taken on failure (Warning vs. Critical/Stop).
- **Metadata-Driven DQ**: Defining rules in a database/config file rather than hardcoding.

## 4. Detailed Design / Implementation

### Standard DQ Rule Sets
| Dimension | Rule Name | Description | Example SQL / Logic |
|---|---|---|---|
| **Completeness** | Not Null | Column must not be empty | `col IS NOT NULL` |
| **Validity** | Format Check | Matches a specific pattern | `col REGEXP '^[0-9]{10}$'` |
| **Uniqueness** | Primary Key | No duplicate values | `count(col) = count(distinct col)` |
| **Accuracy** | Range Check | Value within expected bounds | `age >= 0 AND age <= 120` |
| **Consistency** | Ref Integrity | Value exists in parent table | `exists (select 1 from parent ...)` |
| **Timeliness** | Freshness | Data is not older than X hours | `max(load_dt) > current_timestamp - 1 day` |

### Implementing via Spark (Great Expectations style)
```python
# Pseudo-code for a DQ rule
def validate_completeness(df, column):
    null_count = df.where(df[column].isNull()).count()
    total_count = df.count()
    return (total_count - null_count) / total_count
```

## 5. Best Practices
- **Prioritize CDEs**: Don't audit every column; focus on those used for financial reporting or critical analytics.
- **Fail Fast**: Implement "Stop and Fail" for critical DQ violations to prevent corrupting downstream marts.
- **Quarantine Records**: Move failed records to a `[table]_error` zone instead of dropping them, to allow for investigation.
- **Automate Dashboarding**: Feed DQ results into a centralized dashboard for visibility.

## 6. Common Issues & Troubleshooting
- **False Positives**: Rules that are too strict (e.g., an age range that doesn't account for outliers). Resolution: Tune thresholds based on historical data.
- **Performance Overhead**: Complex DQ rules (like cross-table joins) slowing down the pipeline. Resolution: Run complex checks on a sample or as a post-load task.

## 7. Performance & Optimization
- **Pushdown DQ**: Perform technical validation (nulls/types) during the initial read of the source files.
- **Statistical Profiling**: Use Spark's `describe()` to quickly identify min/max/mean issues across a large dataset.

## 8. Governance & Compliance
- **Data Stewardship**: Business owners must define and sign off on the DQ rules for their subject areas.
- **Audit Requirement**: Provide DQ reports as evidence for internal and external audits.
- **SLA Alignment**: DQ checks must finish within the allotted batch window.

## 9. Tools & Technologies
- **Great Expectations**: The primary tool for defining and running DQ suites.
- **Deequ (AWS)**: A library built on Spark for unit testing data.
- **Custom PySpark Framework**: For lightweight, metadata-driven DQ.

## 10. Real-World Use Cases
- **Customer Onboarding**: Rejecting a batch of 10,000 customers because 20% were missing a mandatory `email_address`.
- **Financial Ledger**: Flagging a transaction where the `debit_amount` does not equal the `credit_amount`.

## 11. References
- [The 6 Dimensions of Data Quality](https://www.collibra.com/us/en/blog/the-6-dimensions-of-data-quality)
- [Great Expectations Rule Catalog](https://greatexpectations.io/expectations/)
