# Security & Compliance Standards

## 1. Overview
Security and Compliance are non-negotiable requirements for any enterprise data platform. They ensure that sensitive data is protected from unauthorized access, that data usage is fully auditable, and that the platform meets legal and regulatory mandates (e.g., GDPR, RBI, SEBI).

## 2. Architecture Context

```
[The Four Pillars of Security]

  Authentication      ──▶ Who are you? (Kerberos, LDAP)
  Authorization       ──▶ What can you do? (Ranger)
  Audit               ──▶ What did you do? (Ranger Audit, Solr)
  Data Protection     ──▶ Is the data encrypted? (KMS, TLS)
```

**Key Security Components:**
- **Apache Ranger**: Centralized authorization and audit logging.
- **Apache Knox**: Secure gateway for perimeter security and API access.
- **FreeIPA / Active Directory**: Identity management and Kerberos authentication.
- **Cloudera KMS**: Key management for Transparent Data Encryption (TDE).

## 3. Core Concepts

| Concept | Description |
|---|---|
| **Kerberos** | A network authentication protocol used to prove identity in a non-secure network. |
| **RBAC (Role-Based Access Control)** | Managing permissions based on user roles within the organization. |
| **Encryption at Rest** | Protecting data stored on disk using TDE or cloud-native encryption. |
| **Encryption in Transit** | Protecting data moving over the network using TLS/SSL. |
| **PII (Personally Identifiable Information)** | Data that can be used to uniquely identify an individual (e.g., PAN, Aadhaar). |
| **GDPR / PDPA** | Data protection regulations mandating privacy and the "right to be forgotten". |

## 4. Detailed Design / Implementation

### Security Standards
1. **Always Use Kerberos**: No enterprise CDP cluster should run in "simple" security mode.
2. **Fine-Grained Authorization**: Use Ranger to restrict access at the database, table, column, and row level.
3. **Audit All Access**: Enable Ranger audit logs for all Hive, Impala, and HDFS operations.
4. **Encrypt Sensitive Data**: Use HDFS Transparent Data Encryption (TDE) for directories containing PII.
5. **Gateway Security**: All REST API and external tool access must go through Apache Knox.

### Example: Ranger Masking Policy
- **Requirement**: Mask the `mobile_number` column for analysts but show it for the Customer Service team.
- **Implementation**: In Ranger, create a "Masking" policy for the `mobile_number` column with the `MASK_SHOW_LAST_4` type for the `analysts` group.

## 5. Best Practices
- **Least Privilege Principle**: Users should only have the minimum permissions necessary for their job.
- **Rotate Credentials**: Implement a policy for regular rotation of service account passwords and Kerberos keytabs.
- **Automate Security Audits**: Use scripts or specialized tools to regularly scan Ranger policies for overly permissive rules.
- **Tag-Based Security**: Use Atlas to tag PII data once at ingestion, and let Ranger automatically apply masking/denial policies across all tools.

## 6. Common Issues & Troubleshooting
- **Kerberos Ticket Expiry**: Jobs failing after running for several hours. *Solution: Ensure Spark/YARN is configured to renew tickets.*
- **Authentication Latency**: High load on Active Directory causing slow logins. *Solution: Implement a local FreeIPA replica.*
- **Policy Synchronization Lag**: Changes in Ranger taking time to reflect in Hive/Impala.

## 7. Performance & Optimization
- **Policy Cache**: Ranger plugins cache policies locally to prevent authorization from becoming a bottleneck.
- **Audit Volume**: Be selective about what you audit; logging every HDFS metadata request can overwhelm the system.

## 8. Governance & Compliance
- **Regulatory Reporting**: Generate automated monthly reports on who accessed sensitive data for compliance officers.
- **Data Subject Access Request (DSAR)**: Use Atlas lineage to quickly identify all locations of a specific user's data for GDPR compliance.

## 9. Tools & Technologies
- **Apache Ranger**: Central authorization and audit.
- **Apache Knox**: Peripheral security gateway.
- **FreeIPA**: Identity management.
- **Cloudera Manager**: Security configuration and monitoring.

## 10. Real-World Use Cases
- **Banking Data Protection**: Implementing field-level encryption and row-level filtering to ensure that branch managers can only see data for their specific region.

## 11. References
- [Cloudera Security Guide](https://docs.cloudera.com)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)
- [RBI Guidelines on Information Security](https://www.rbi.org.in)
