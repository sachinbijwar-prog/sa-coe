# Security & Governance Migration

## 1. Overview
Security and Governance migration is the most critical and complex part of a CDP migration. It involves moving authentication (Kerberos/LDAP), authorization (Ranger policies), and metadata/lineage (Atlas) from legacy systems to the CDP Shared Data Experience (SDX). A failed security migration results in either unauthorized data access or widespread job failures due to "Permission Denied" errors.

## 2. Architecture Context

```
[Legacy Security]                   [CDP SDX Security]
  Sentry / Ranger         ──▶       Apache Ranger (Shared)
  Navigator               ──▶       Apache Atlas (Shared)
  Active Directory        ──▶       FreeIPA / AD (Unified)
```

**Key Transitions:**
- **Sentry to Ranger**: Migration of ACLs and roles to Ranger policies.
- **Navigator to Atlas**: Transition of metadata and lineage tracking.
- **Authentication**: Moving from standalone KDCs to a unified identity management system like FreeIPA or centralized Active Directory.

## 3. Core Concepts

| Concept | Description |
|---|---|
| **Kerberos** | Primary authentication protocol for Hadoop services. |
| **Apache Ranger** | Centralized framework for authorization and audit. |
| **Apache Atlas** | Metadata management and lineage tracking. |
| **LDAP/AD Sync** | Synchronizing users and groups from the corporate directory into CDP. |
| **Tag-Based Security** | Policies applied based on data classification tags (PII, Sensitive) rather than just paths. |

## 4. Detailed Design / Implementation

### Security Migration Steps
1. **Identity Setup**: Ensure all users and groups are correctly synced to the CDP cluster.
2. **Policy Migration**: 
   - For Sentry: Use the Cloudera Sentry-to-Ranger conversion tool.
   - For Ranger: Export policies from legacy and import into CDP Ranger.
3. **Audit Configuration**: Configure Ranger to log audits to HDFS/Solr in the new cluster.
4. **Metadata Migration**: Use Atlas import/export tools to move technical and business metadata.

### Example: Ranger Policy Export (CLI)
```bash
# Export policies for the Hive service
curl -u admin:password -X GET "http://legacy-ranger:6080/service/plugins/policies/exportJson?serviceName=hive" > hive_policies.json
```

## 5. Best Practices
- **Standardize Groups**: Manage permissions via AD groups rather than individual users.
- **Test Before Cutover**: Use a "Parallel Run" to verify that Ranger policies in CDP correctly block/allow access as expected.
- **Clean Up Stale Policies**: Use migration as an opportunity to remove unused or redundant security rules.
- **Enable Tag-Based Masking**: Leverage Atlas tags to automatically mask PII data for unauthorized users.

## 6. Common Issues & Troubleshooting
- **Principal Mismatch**: Service accounts in CDP have different Kerberos principal names than legacy.
- **Sync Lag**: New AD users not showing up in Ranger. *Solution: Check Ranger UserSync logs.*
- **Policy Overlap**: Multiple policies granting conflicting access. *Solution: Ranger evaluates policies based on priority; review order.*

## 7. Performance & Optimization
- **Policy Caching**: Ranger plugins cache policies locally to prevent latency during authorization checks.
- **Audit Throttling**: Limit audit logging for high-volume services like HDFS to prevent Solr/HDFS overload.

## 8. Governance & Compliance
- **GDPR/PDPA Compliance**: Use Atlas to track personal data across the entire lifecycle.
- **Separation of Duties**: Ensure different admins manage security policies vs. platform infrastructure.

## 9. Tools & Technologies
- **Apache Ranger**: The heart of CDP authorization.
- **Apache Atlas**: The core of CDP metadata and lineage.
- **FreeIPA**: Identity management solution.

## 10. Real-World Use Cases
- **Banking Compliance Migration**: Migrating 1,500+ security policies and 400 Atlas classifications from CDH to CDP while maintaining strict regulatory compliance for RBI/SEBI.

## 11. References
- [Cloudera Security Migration Guide](https://docs.cloudera.com)
- [Apache Ranger Official Docs](https://ranger.apache.org)
- [Apache Atlas Official Docs](https://atlas.apache.org)
