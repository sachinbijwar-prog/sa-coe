# ETL Failure Playbook

## 1. Overview
Production ETL failures can disrupt business reporting and downstream analytics. This playbook provides a systematic approach to identifying, triaging, and resolving failures in the data pipeline, covering Informatica, Spark, and Hive workloads.

## 2. Architecture Context
ETL failures typically occur at these points:
- **Connectivity Layer**: DB connection failures, API timeouts, or Network drops.
- **Compute Layer**: Resource exhaustion in YARN or Informatica Integration Service.
- **Data Layer**: Schema mismatch, PII violations, or Data quality threshold breaches.

## 3. Core Concepts
- **MTTR (Mean Time To Recovery)**: The key metric for production support.
- **Root Cause Analysis (RCA)**: The formal process of identifying why a failure happened.
- **Circuit Breaker**: An automated stop to the pipeline if certain conditions are met (e.g., >50% DQ failure).
- **Restartability/Idempotency**: The ability to safely re-run a failed job from the point of failure or the beginning.

## 4. Detailed Design / Implementation

### Informatica Error Identification
```bash
# Check for common Informatica exit codes
# 0: Success
# 1-127: Generic Failure
# 139: Segmentation Fault (Check system resources)
# 255: Integration Service Connection Error
```

### Automated Retry Strategy (Airflow Example)
```python
# Airflow Task with Retry Logic
task = PythonOperator(
    task_id='etl_spark_job',
    python_callable=run_spark,
    retries=3,
    retry_delay=timedelta(minutes=5),
    retry_exponential_backoff=True
)
```

## 5. Best Practices
- **Implement Robust Logging**: Every job must log its start time, end time, parameters, and error stack trace.
- **Use Heartbeat Checks**: Monitor long-running jobs for progress, not just completion/failure.
- **Centralized Alerting**: Send critical failures to Slack/Teams or PagerDuty.
- **Dependency Management**: Ensure upstream data availability is verified before starting a job.

## 6. Common Issues & Troubleshooting
- **Missing Source File**: Upstream system failed to deliver the file. Resolution: Check source SFTP and contact the upstream team.
- **Disk Full (HDFS/Local)**: Temp directories or logs consuming all space. Resolution: Cleanup old logs and increase quotas.
- **Stale Locks**: A previous failed run left a lock on a Hive table. Resolution: Use `ABORT TRANSACTIONS` or `UNLOCK`.
- **Memory OOM**: Job payload increased unexpectedly. Resolution: Scale up YARN containers.

## 7. Performance & Optimization
- **Parallel Load Optimization**: Distribute independent ETL tasks across multiple streams to reduce the overall batch window.
- **Incremental Loading**: Always prefer incremental loads over full loads to minimize the impact of failures.

## 8. Governance & Compliance
- **SLA Tracking**: Measure and report on whether the ETL finished before the business deadline (e.g., 8 AM).
- **Change Control**: Never apply fixes directly in production; use the standard CI/CD path.
- **Audit Trails**: Capture who restarted a job and when.

## 9. Tools & Technologies
- **Apache Airflow**: The preferred orchestrator for failure handling.
- **Informatica Monitor**: For real-time tracking of PowerCenter workflows.
- **ELK Stack**: For consolidating and searching ETL logs.

## 10. Real-World Use Cases
- **The "Monday Morning" Batch**: Heavy load after the weekend causing resource contention. Resolution: Adjust scheduling or prioritize critical paths.
- **Daylight Saving Time (DST) Shift**: Jobs failing or running twice during the 1-hour time shift. Resolution: Use UTC for all scheduling.

## 11. References
- [Effective Data Pipeline Monitoring](https://www.montecarlodata.com/blog-data-reliability-engineering-monitoring/)
- [Informatica Troubleshooting Guide](https://knowledge.informatica.com/s/article/501309)
