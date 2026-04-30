# HDFS Migration Guide

## 1. Overview
HDFS migration is the process of moving large-scale distributed data from legacy Hadoop clusters (CDH/HDP) to the Cloudera Data Platform (CDP). This involves not just copying files, but also preserving permissions (ACLs), managing quotas, and ensuring data integrity during the transfer of Petabytes of data.

## 2. Architecture Context

```
[Source HDFS]                      [Target CDP HDFS/S3]
  CDH 5.x / 6.x          ──▶        CDP PvC Base / Public Cloud
       │                                 │
  DistCP (MapReduce)     ────────▶   Replication Manager
```

**Key Tools:**
- **Apache DistCP**: The industry-standard tool for parallel data copying.
- **Cloudera Replication Manager**: A GUI-based tool for managing and scheduling migration policies.

## 3. Core Concepts

| Concept | Description |
|---|---|
| **DistCP (Distributed Copy)** | A tool used for large-inter/intra-cluster copying using MapReduce. |
| **ACL (Access Control List)** | Granular permissions attached to HDFS files and directories. |
| **Snapshot** | A read-only point-in-time copy of the file system used for consistent backup/migration. |
| **Checksum** | A mathematical value used to verify that data hasn't been corrupted during transfer. |
| **Quotas** | Limits on the number of files or the amount of disk space a directory can use. |

## 4. Detailed Design / Implementation

### Migration Process using DistCP
1. **Source Snapshot**: Create a snapshot of the source directory to ensure a consistent point-in-time copy.
2. **Execution**: Run DistCP from the target cluster (pull model) or source cluster (push model).
3. **Verification**: Compare source and target checksums and file counts.
4. **ACL Migration**: Ensure the `-pa` (preserve attributes) flag is used to keep permissions.

### Example: DistCP Command
```bash
hadoop distcp \
  -Dmapreduce.job.queuename=migration \
  -update \
  -skipcrccheck \
  -pb \
  hdfs://source-nn:8020/warehouse/raw/ \
  hdfs://target-nn:8020/warehouse/raw/
```

## 5. Best Practices
- **Use the Pull Model**: Run DistCP from the target (CDP) cluster for better security and resource management.
- **Preserve Attributes**: Use `-pb` to preserve blocks, `-pt` for timestamps, and `-pa` for ACLs.
- **Tune Parallelism**: Use the `-m` flag to control the number of mappers based on cluster capacity and network bandwidth.
- **Verify Data Integrity**: Always perform a post-copy validation using file counts and size comparisons.
- **Incremental Copy**: Use the `-update` flag to copy only changed or new files in subsequent runs.

## 6. Common Issues & Troubleshooting
- **Network Bandwidth Saturation**: Migrations can overwhelm inter-cluster links. *Solution: Use `-bandwidth` limit.*
- **Permission Denied**: Often due to mismatched UIDs/GIDs between clusters. *Solution: Ensure ID consistency or use `chown -R` post-migration.*
- **Connection Timeout**: Large metadata scans can cause DistCP to time out. *Solution: Increase RPC timeout settings.*

## 7. Performance & Optimization
- **Mappers Management**: Set mappers (`-m`) proportional to the number of files and total data size.
- **File List Filtering**: Use filters to exclude temporary or trash directories.

## 8. Governance & Compliance
- **Secure Transfer**: Use `webhdfs` over SSL (swebhdfs) for sensitive data.
- **Audit Logs**: Maintain logs of all DistCP jobs for compliance verification.

## 9. Tools & Technologies
- **Apache DistCP**: Core command-line migration engine.
- **Cloudera Manager**: Monitoring replication jobs and HDFS health.
- **Replication Manager**: For policy-based, automated data movement.

## 10. Real-World Use Cases
- **Enterprise Data Lake Migration**: Moving 5PB of financial trade data from on-prem CDH to CDP Private Cloud with full ACL preservation.

## 11. References
- [Apache DistCP Guide](https://hadoop.apache.org/docs/current/hadoop-distcp/DistCp.html)
- [Cloudera Replication Manager Documentation](https://docs.cloudera.com)
