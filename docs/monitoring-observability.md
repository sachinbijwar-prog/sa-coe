# Monitoring & Observability

## 1. Overview
Monitoring and Observability are critical for maintaining the health, performance, and reliability of an enterprise data platform. While monitoring tells you *when* something is wrong (via alerts), observability helps you understand *why* it is wrong by providing deep insights into system internals, job execution, and data flows.

In a Cloudera ecosystem, this involves tracking cluster health, service availability, YARN resource utilization, and individual job performance (Spark, Hive, Impala).

## 2. Architecture Context

```
[Observability Stack]

  Infrastructure Metrics  ──▶ Cloudera Manager / Prometheus
  Job Execution Logs      ──▶ Spark History Server / Yarn Logs
  Data Quality Metrics    ──▶ DQ Validation Logs / Atlas
  Service Audits          ──▶ Ranger Audit / Cloudera Navigator
```

**Key Metrics to Track:**
- **Cluster Level**: CPU/Memory/Disk utilization across nodes.
- **Service Level**: HDFS NameNode RPC latency, Impala query concurrency.
- **Job Level**: Spark executor GC time, shuffle spill, task skew.
- **Data Level**: Pipeline latency, record count variances, DQ failure rates.

## 3. Core Concepts

| Concept | Description |
|---|---|
| **Logging** | Detailed records of events (System logs, App logs). |
| **Metrics** | Numerical data representing system state over time (CPU %, IOPS). |
| **Tracing** | Tracking a request/job across multiple services. |
| **Alerting** | Notifications triggered when metrics cross predefined thresholds. |
| **Heartbeat** | Regular signals indicating a service or agent is alive. |
| **Drift Monitoring** | Detecting changes in data distribution or schema over time. |

## 4. Detailed Design / Implementation

### Monitoring YARN Application Status (CLI)
```bash
# List all running applications
yarn application -list

# Get detailed status of a specific job
yarn application -status application_123456789_0001

# Fetch logs for a completed application
yarn logs -applicationId application_123456789_0001 > job_logs.txt
```

### Tracking Spark Performance via Spark UI
Developers should monitor the following in the Spark UI:
1. **Stages Tab**: Look for stages with high "Shuffle Read/Write" or "Spill (Memory/Disk)".
2. **Tasks Tab**: Identify "Task Skew" where max task time is significantly higher than median.
3. **Executors Tab**: Check for high "GC Time" (>10% of total task time).

### Custom Alerting Script (Python)
```python
import requests

def check_service_health(cm_host, service_name):
    # Mock CM API call
    api_url = f"http://{cm_host}:7180/api/v19/clusters/Cluster1/services/{service_name}"
    response = requests.get(api_url, auth=('admin', 'admin'))
    status = response.json().get('entityStatus')
    
    if status != 'GOOD_HEALTH':
        send_slack_alert(f"Service {service_name} is in status: {status}")

def send_slack_alert(message):
    webhook_url = "https://hooks.slack.com/services/XXXXX"
    requests.post(webhook_url, json={"text": message})
```

## 5. Best Practices
- **Centralize Logs**: Aggregate logs into a central searchable store (e.g., ELK stack or Cloudera SDX).
- **Define Baselines**: Understand "normal" performance to accurately set alert thresholds.
- **Implement Self-Healing**: Automate restarts of non-critical failed components.
- **Monitor Data Pipelines**: Don't just monitor infrastructure; track pipeline latency and success rates.
- **Visual Dashboards**: Use Grafana or Cloudera Manager charts for real-time visibility.

## 6. Common Issues & Troubleshooting
- **Missing Logs**: Often due to YARN log aggregation being disabled or HDFS being full.
- **Delayed Alerts**: Caused by high monitoring agent latency or network congestion.
- **False Positives**: Alerts triggered by transient spikes. Solution: Use moving averages for thresholds.

## 7. Performance & Optimization
- **Agent Tuning**: Minimize the overhead of monitoring agents on compute nodes.
- **Log Retention**: Implement a cleanup policy for old logs to save storage.
- **Efficient Querying**: Ensure monitoring dashboards don't overwhelm the metadata database.

## 8. Governance & Compliance
- **Audit Trails**: Retain service and access audit logs for regulatory inspections.
- **Compliance Reporting**: Generate monthly availability and performance reports.

## 9. Tools & Technologies
- **Cloudera Manager**: Comprehensive cluster monitoring and administration.
- **Prometheus & Grafana**: Modern stack for metric collection and visualization.
- **ELK Stack**: For log aggregation and search.
- **Spark History Server**: Post-execution job analysis.

## 10. Real-World Use Cases
- **Proactive Scaling**: Automatically adding executors based on YARN queue backlogs.
- **Incident Management**: Using log correlation to identify the root cause of a cluster-wide slowdown.

## 11. References
- [Cloudera Monitoring Guide](https://docs.cloudera.com)
- [Prometheus Documentation](https://prometheus.io/docs)
