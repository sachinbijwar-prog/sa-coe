# Data Governance & Compliance

## 1. Overview
Data Governance is the framework of policies, processes, roles, and technologies that ensure data is managed as a strategic enterprise asset. It covers data ownership, access control, quality standards, retention policies, and regulatory compliance. Without governance, a data platform becomes an ungoverned data swamp where no one trusts the data, no one knows who owns it, and audit readiness is impossible.

In a Cloudera-based platform, governance is implemented through **Apache Ranger** (access control), **Apache Atlas** (metadata and classification), **Apache Knox** (gateway security), and organizational frameworks including data stewardship and policy management.

## 2. Architecture Context

```
[Data Governance Framework]

  Policy & Standards Layer
  (Data Ownership · Retention · Classification)
           │
  Enforcement Layer
  Apache Ranger → Column Masking · Row Filters
  Apache Knox   → API Gateway Security
  FreeIPA/Kerberos → Authentication
           │
  Metadata & Discovery Layer
  Apache Atlas → Lineage · Classification · Search
           │
  Audit & Compliance Layer
  Ranger Audit Logs · Atlas Audit · Cloudera Manager
```

## 3. Core Concepts

| Concept | Description |
|---|---|
| **Data Owner** | Business role accountable for a data domain (e.g., Finance, Risk) |
| **Data Steward** | Technical role responsible for metadata quality and policy enforcement |
| **Data Classification** | Categorization of data by sensitivity (PII, CONFIDENTIAL, PUBLIC) |
| **Column Masking** | Obfuscating sensitive column values for unauthorized users |
| **Row-Level Filter** | Restricting result rows based on user role, region, or department |
| **Retention Policy** | Rules for how long data is kept before archival or deletion |
| **Data Catalog** | Searchable index of all data assets with metadata and lineage |

### Data Classification Matrix

| Level | Definition | Examples | Action |
|---|---|---|---|
| **PUBLIC** | Non-sensitive; freely accessible | Reference tables, market indices | No masking |
| **INTERNAL** | Internal business use | Aggregated metrics | Role-based access |
| **CONFIDENTIAL** | Business-sensitive | Financial results, HR data | Restricted roles |
| **RESTRICTED** | Regulatory/Legal | PAN, Aadhaar, account numbers | Masking mandatory |
| **PII** | Personal Identifiable Info | Name, DOB, email, mobile | Full masking |

## 4. Detailed Design / Implementation

### Ranger Column Masking Policy (JSON)
```json
{
  "policyType": 1,
  "name": "mask-pii-customer-columns",
  "resources": {
    "database": {"values": ["curated"]},
    "table": {"values": ["dim_customer"]},
    "column": {"values": ["full_name", "email", "date_of_birth", "mobile"]}
  },
  "dataMaskPolicyItems": [
    {
      "dataMaskInfo": {"dataMaskType": "MASK_SHOW_LAST_4"},
      "groups": ["analyst_group", "developer_group"]
    }
  ]
}
```
*Policy Applied: Analysts see `XXXXXXX3456` instead of `9876543456` for mobile numbers.*

### Row-Level Filter Policy
```json
{
  "policyType": 2,
  "name": "row-filter-region-trading",
  "resources": {
    "database": {"values": ["curated"]},
    "table": {"values": ["fact_trade"]}
  },
  "rowFilterPolicyItems": [
    {
      "rowFilterInfo": {"filterExpr": "region_code = current_user_region()"},
      "groups": ["regional_analysts"]
    }
  ]
}
```

### Data Governance Control Table
```sql
CREATE TABLE IF NOT EXISTS gov_ctrl.data_catalog (
    table_fqn           STRING,
    domain              STRING,   -- FINANCE, RISK, OPERATIONS, HR
    data_owner          STRING,
    data_steward        STRING,
    classification      STRING,   -- PUBLIC / INTERNAL / CONFIDENTIAL / PII
    pii_columns         ARRAY<STRING>,
    retention_days      INT,
    last_reviewed_dt    DATE,
    ranger_policy_id    STRING,
    atlas_guid          STRING,
    status              STRING    -- ACTIVE / DEPRECATED / UNDER_REVIEW
)
STORED AS ORC
LOCATION '/warehouse/ctrl/data_catalog';
```

### Automated PII Detection
```python
import re
from pyspark.sql import SparkSession

spark = SparkSession.builder.appName("PIIScan").getOrCreate()

PII_PATTERNS = [
    r'.*name.*', r'.*email.*', r'.*mobile.*', r'.*phone.*',
    r'.*pan.*', r'.*aadhaar.*', r'.*dob.*', r'.*birth.*',
    r'.*address.*', r'.*passport.*'
]

def detect_pii_columns(db_name: str, table_name: str) -> list:
    df = spark.table(f"{db_name}.{table_name}")
    pii_cols = []
    for col_name in df.columns:
        for pattern in PII_PATTERNS:
            if re.match(pattern, col_name.lower()):
                pii_cols.append(col_name)
                break
    return pii_cols

curated_tables = spark.sql("SHOW TABLES IN curated").collect()
for row in curated_tables:
    pii = detect_pii_columns("curated", row.tableName)
    if pii:
        print(f"curated.{row.tableName}: PII detected → {pii}")
```

## 5. Best Practices

- **Classify at source**: Apply classifications before data enters the platform
- **Tag at column level**: Always tag sensitive columns individually, not just tables
- **Automate PII detection**: Run scheduled scans for untagged PII in new tables
- **Enforce via Ranger**: Access control in Ranger — never application-layer only
- **Quarterly reviews**: Review owner/steward assignments and access policies quarterly
- **Separation of duties**: Owners approve; stewards implement; engineers cannot grant own access
- **Audit everything**: Enable Ranger audit logging for all reads on RESTRICTED/PII data

### Don'ts
- ❌ Don't share service account credentials for data access
- ❌ Don't allow `SELECT *` on PII tables from untrusted contexts
- ❌ Don't skip governance registration for "temporary" tables
- ❌ Don't apply access policies without testing in dev environment first

## 6. Common Issues & Troubleshooting

| Issue | Root Cause | Resolution |
|---|---|---|
| Users see masked data incorrectly | Ranger policy not applied to correct group | Check group membership and policy condition |
| Row filter not working in Impala | Impala has limited Ranger row filter support | Use database views for row-level filtering in Impala |
| Atlas classification not triggering Ranger | Propagation not enabled | Enable propagation in Atlas classification definition |
| Compliance report shows unclassified tables | New tables added without governance review | Add governance step to CI/CD deployment pipeline |

## 7. Performance & Optimization

- **Policy caching**: Ranger caches policies locally; changes propagate in ~30 seconds
- **Masking overhead**: Column masking adds ~5–15ms per query; plan for interactive use
- **Policy groups**: Always manage policies at group level — individual user policies are unscalable
- **Selective audit**: Full audit logging for RESTRICTED data only; sampling for INTERNAL data
- **Bulk policy management**: Use Ranger REST API to export/import policies across environments

## 8. Governance & Compliance

- **SEBI**: Trade data access must be logged; broker personal data classified RESTRICTED
- **RBI**: Customer financial data requires field-level access controls and audit trails
- **GDPR/PDPA**: Right-to-erasure must be implementable using Atlas lineage to find all instances
- **ISO 27001**: Annual governance audits supported by Ranger access logs
- **Internal Audit**: Quarterly reports on sensitive data access generated from Ranger audit DB

## 9. Tools & Technologies

| Tool | Purpose |
|---|---|
| Apache Ranger | Fine-grained access control, column masking, row filtering |
| Apache Atlas | Data classification, lineage, catalog |
| Apache Knox | REST API gateway and perimeter security |
| FreeIPA / Kerberos | Identity management and authentication |
| Cloudera Manager | Platform-wide governance monitoring |
| ServiceNow / Jira | Access request and approval workflow |

## 10. Real-World Use Cases

**NSE Compliance (SEBI):**
- 156 Ranger policies across 8 databases; 34 column masking rules for broker PII
- Quarterly access review eliminates 200+ stale grants annually
- Ranger audit logs exported to SIEM for real-time anomaly detection

**Banking Customer Data Protection:**
- 47 PII columns masked across curated zone; analysts never see actual customer details
- GDPR deletion workflow uses Atlas lineage to identify all customer data tables
- Zero unauthorized access incidents in 18 months post-governance implementation

## 11. References

- [Apache Ranger Documentation](https://ranger.apache.org/)
- [Apache Atlas Classification Guide](https://atlas.apache.org/Classification-Propagation.html)
- [Cloudera Security Reference Architecture](https://docs.cloudera.com/cdp-private-cloud-base/latest/security-overview/index.html)
- [SEBI Data Security Guidelines](https://www.sebi.gov.in/legal/circulars/)
- [GDPR Data Protection Principles](https://gdpr-info.eu/art-5-gdpr/)
