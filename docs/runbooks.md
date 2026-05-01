# Operational Runbooks

## 1. Overview
Runbooks are step-by-step procedures for handling standard operational tasks and responding to common incidents. They ensure that production issues are handled consistently, regardless of which engineer is on call.

## 2. Architecture Context
Runbooks cover various operational domains:
- **Maintenance**: Routine tasks like log cleanup and service restarts.
- **Incident Response**: Resolving failures in Hive, Spark, or YARN.
- **Disaster Recovery**: Restoring metadata or data from backups.

## 3. Core Concepts
- **On-Call Engineer**: The person responsible for the system during a specific shift.
- **Escalation Path**: Who to contact if a runbook doesn't resolve the issue.
- **Post-Mortem**: Documenting what happened after an incident is resolved.
- **Mean Time to Repair (MTTR)**: The target metric for runbook efficiency.

## 4. Detailed Design / Implementation

### Runbook: Restarting HiveServer2 (HS2)
**Scenario**: Users are unable to connect to Hive; HS2 is unresponsive.
1.  **Check CM Health**: Go to Cloudera Manager -> Hive -> Instances.
2.  **Verify Logs**: Check `/var/log/hive/hiveserver2.log` for OOM or DB connection errors.
3.  **Restart**: Select the HS2 instance and click "Restart".
4.  **Verify**: Try connecting via Beeline: `!connect jdbc:hive2://hs2-host:10000`.

### Runbook: Clearing HDFS Trash
**Scenario**: HDFS is at 90% capacity; urgent space cleanup required.
1.  **Identify Large Dirs**: `hdfs dfsadmin -report` and `hdfs dfs -du -h /data | sort -rn`.
2.  **Expunge Trash**: `hdfs dfs -expunge`.
3.  **Check Quotas**: `hdfs dfsadmin -clrQuota /path` if a specific project is blocked.

## 5. Best Practices
- **Step-by-Step Clarity**: Use numbered lists; avoid vague instructions.
- **Include Validation Steps**: Every action must be followed by a command to verify success.
- **Safety Warnings**: Highlight destructive commands (e.g., `rm -rf` or `DROP TABLE`) with "CAUTION" notes.
- **Update Frequently**: If a procedure changes, update the runbook immediately.

## 6. Common Issues & Troubleshooting
- **Permission Errors**: The engineer doesn't have `sudo` to run the fix. Resolution: Ensure on-call roles have standard operational permissions.
- **Stale Procedures**: A runbook refers to a service that has been decommissioned. Resolution: Archive old runbooks.

## 7. Performance & Optimization
- **Automation**: If a runbook is used more than twice a week, automate it using a script or an Airflow job.
- **Centralized Search**: Host runbooks in this CoE portal for fast keyword searching during an incident.

## 8. Governance & Compliance
- **Change Management**: Major operational changes (like a cluster reboot) require a Change Request (CR) number.
- **Audit Logging**: Every manual fix in production must be recorded in the incident ticket.

## 9. Tools & Technologies
- **Cloudera Manager**: The primary tool for service operations.
- **Jira Service Management**: For tracking incidents and resolutions.
- **Confluence / CoE Portal**: For hosting the runbook library.

## 10. Real-World Use Cases
- **The "2 AM Hive Crash"**: A junior engineer using the HS2 Restart Runbook to restore service without waking the senior team.
- **Kafka Topic Expansion**: Using a runbook to increase partitions for a high-volume data stream.

## 11. References
- [SRE Handbook: On-Call and Incident Response](https://sre.google/sre-book/incident-response/)
- [Cloudera Operations Best Practices](https://docs.cloudera.com/documentation/enterprise/6/6.3/topics/cm_dg_operations.html)
