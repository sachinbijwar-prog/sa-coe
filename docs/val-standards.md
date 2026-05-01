# Data Validation Standards

## 1. Overview
Data validation is the process of ensuring that data is accurate, complete, and reliable before it is used for decision-making. This document outlines the mandatory validation standards and patterns required for all pipelines in the Smart Analytica ecosystem.

## 2. Architecture Context
Validation occurs at three critical layers:
- **Interface Validation**: Checking file formats and counts at the arrival point.
- **Pipeline Validation**: Inline checks during transformation stages.
- **Consumption Validation**: End-to-end reconciliation before data hits the BI layer.

## 3. Core Concepts
- **Check-Summing**: Calculating a numeric fingerprint of data to detect changes.
- **Reconciliation**: Comparing data between two different systems (e.g., SAP vs. Hadoop).
- **Threshold-Based Validation**: Allowing a small margin of error (e.g., 0.01% variance) for non-critical datasets.
- **Zero-Variance Validation**: Requiring a 100% match for financial and regulatory data.

## 4. Detailed Design / Implementation

### Mandatory Validation Checks
| Check Type | Standard | Required For |
|---|---|---|
| **Record Count** | Source count must match Target count. | ALL Pipelines |
| **Numeric Sums** | Sum of critical columns (Amount, Qty) must match. | Financial / Sales |
| **Date Ranges** | No records should fall outside expected date bounds. | Incremental Loads |
| **Reference Integrity** | Foreign keys must exist in master tables. | Core / Mart Layers |
| **Schema Match** | Data types and column order must match the target. | Ingestion / Staging |

### Validation Implementation Pattern (Python)
```python
def validate_load(source_count, target_count, tolerance=0):
    variance = abs(source_count - target_count)
    if variance > tolerance:
        raise ValueError(f"Validation Failed! Variance: {variance}")
    print("Validation Successful.")
```

## 5. Best Practices
- **Automate Everything**: Validation should be a built-in step of the ETL process, not a manual activity.
- **Log All Results**: Even successful validation results must be recorded in the Audit Framework.
- **Use "Data Contracts"**: Agree on schema and quality expectations with the source system owners upfront.
- **Implement Early Warning**: Set up alerts for "near-fail" validation results to proactively catch trends.

## 6. Common Issues & Troubleshooting
- **False Alarms**: Validation failing due to late-arriving data in the source system. Resolution: Use sliding windows or watermarks.
- **Rounding Discrepancies**: Floating-point math causing small variances in sums. Resolution: Use `DECIMAL` types and standardized rounding logic.

## 7. Performance & Optimization
- **Parallel Validation**: Run validation queries in parallel with the data load where possible.
- **Sampling for Large Scales**: For non-critical multi-billion row datasets, use statistical sampling for accuracy checks.

## 8. Governance & Compliance
- **Sign-Off Requirement**: Business owners must sign off on the validation results during UAT.
- **Regulatory Reporting**: Validation logs serve as evidence for SOX and other financial audits.
- **Data Lineage Integration**: Validation status should be visible in the Atlas metadata for every dataset.

## 9. Tools & Technologies
- **Great Expectations**: For defining and automating complex validation suites.
- **Informatica Data Quality (IDQ)**: For advanced profiling and validation.
- **Spark / SQL**: For custom reconciliation scripts.

## 10. Real-World Use Cases
- **Daily Bank Reconciliation**: Comparing 5 million transaction records from the core banking system to the data mart with a zero-variance requirement.
- **IoT Sensor Validation**: Validating that temperature readings are within the logical range of -50 to +150 degrees.

## 11. References
- [Enterprise Data Quality Best Practices](https://www.dama.org/cpages/home)
- [Checksum-Based Data Verification](https://en.wikipedia.org/wiki/Checksum)
