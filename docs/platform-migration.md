# Platform Migration & Operations

## 1. Overview
Migrating from legacy Hadoop distributions (CDH or HDP) to the Cloudera Data Platform (CDP) is a complex multi-phase undertaking. This document outlines the strategic approach, operational considerations, and post-migration stability framework for enterprise platform upgrades.

## 2. Architecture Context
The migration involves transitioning from monolithic on-premise clusters to a modern, hybrid-cloud platform centered around the **Shared Data Experience (SDX)**.
- **Legacy**: Static resource allocation, Sentry/Navigator security.
- **CDP**: Dynamic scaling, containerized services (CDW, CDE), Ranger/Atlas security.

## 3. Core Concepts
- **Phased Migration**: Moving workloads in batches rather than a "big bang" approach.
- **Side-by-Side (Parallel) Run**: Running legacy and new clusters simultaneously for validation.
- **Metadata Sync**: Replicating Hive Metastore and Ranger policies.
- **Workload Prioritization**: Migrating mission-critical BI and ETL jobs first.

## 4. Detailed Design / Implementation

### The Migration Lifecycle
1.  **Discovery & Assessment**: Analyzing cluster usage, dataset popularity, and application dependencies.
2.  **Environment Preparation**: Setting up the CDP cluster with FreeIPA, Ranger, and AD integration.
3.  **Data Movement**: Using `DistCP` or Replication Manager to transfer HDFS data.
4.  **Application Migration**: Re-pointing ETL (Informatica/Spark) and BI (PowerBI) to the new endpoints.
5.  **Validation**: Comparing row counts, SQL results, and performance SLAs between environments.
6.  **Cutover**: Directing production traffic to the CDP cluster and decommissioning the legacy environment.

### Tooling for Migration
- **Cloudera Replication Manager**: For automated HDFS and Hive replication.
- **CDP CLI**: For automating the creation of environments and data lakes.
- **Workload XM**: For analyzing and optimizing legacy workloads before migration.

## 5. Best Practices
- **Clean House Before Moving**: Archive unused data and decommission zombie jobs on the legacy cluster.
- **Standardize Security Early**: Move from Sentry to Ranger during the migration process.
- **Monitor Network Bandwidth**: Ensure the pipe between legacy and CDP clusters is sufficient for high-volume data transfer.
- **Document All Changes**: Maintain a "Migration Log" of every application change and endpoint update.

## 6. Common Issues & Troubleshooting
- **Permission Mismatches**: Ranger policies not perfectly matching Sentry ACLs. Resolution: Run automated policy validation scripts.
- **Hive 3 Breaking Changes**: Reserved keywords and ACID table requirements. Resolution: Refactor SQL queries and convert external tables where needed.
- **Connectivity (Knox)**: Applications unable to reach the new cluster due to firewall or certificate issues.

## 7. Performance & Optimization
- **Right-Size the New Environment**: Use the analytics from legacy runs to provision the correct amount of CPU and Memory in CDP.
- **Leverage New Features**: Immediately enable Spark 3 AQE and Hive LLAP to show "Day 1" performance improvements.

## 8. Governance & Compliance
- **PII Integrity**: Verify that data masking and encryption policies remain consistent after migration.
- **Audit Parity**: Ensure that CDP audit logs (Ranger/Atlas) capture the same level of detail as legacy systems for regulatory compliance.

## 9. Tools & Technologies
- **DistCP**: The workhorse for large-scale data movement.
- **Apache Ranger**: For authorization migration.
- **Apache Atlas**: For metadata and lineage migration.

## 10. Real-World Use Cases
- **Legacy Bank Migration**: Moving a 5PB CDH cluster to CDP Private Cloud to enable better resource isolation for different business units.
- **Retail Hybrid Cloud**: Migrating seasonal high-compute Spark jobs to CDP Public Cloud while keeping sensitive customer data on-premise.

## 11. References
- [Cloudera Migration Guide](https://docs.cloudera.com/runtime/7.2.10/migration/topics/migration-overview.html)
- [Moving from Sentry to Ranger](https://docs.cloudera.com/runtime/7.2.10/security-overview/topics/security-sentry-to-ranger.html)
