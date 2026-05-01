# Automation Scripts

## 1. Overview
Automation Scripts are the "glue" of the Smart Analytica platform, enabling zero-touch operations for repetitive tasks such as environment setup, data movement, and metadata synchronization. This document outlines the standards for developing and deploying these scripts.

## 2. Architecture Context
Automation scripts interact with various CDP components via:
- **CLI**: CDP CLI, HDFS CLI, and Cloudera Manager API.
- **REST**: Service-specific APIs (Knox, Atlas, Ranger).
- **SSH**: Low-level node-level configuration management.

## 3. Core Concepts
- **Idempotency**: Scripts should be safe to run multiple times without unintended side effects.
- **Error Handling**: Robust try-catch blocks and meaningful exit codes.
- **Logging**: Centralized log collection for all automated runs.
- **Secret Management**: No hardcoded credentials; use vault or environment variables.

## 4. Detailed Design / Implementation

### Environment Health Check Script (Python)
```python
import subprocess
import json

def check_service_health(service_name):
    try:
        # Example using CM API via curl
        result = subprocess.check_output(['curl', '-u', 'user:pass', f'https://cm-host:7183/api/v41/clusters/Cluster1/services/{service_name}'])
        data = json.loads(result)
        return data['serviceState']
    except Exception as e:
        return f"ERROR: {str(e)}"

services = ['HIVE', 'IMPALA', 'SPARK_ON_YARN']
for s in services:
    print(f"{s}: {check_service_health(s)}")
```

### Automated Data Archival (Bash/HDFS)
```bash
#!/bin/bash
# Move data older than 90 days to cold storage
SOURCE_DIR="/data/warehouse/raw/sales"
ARCHIVE_DIR="/data/archive/sales"
DATE_LIMIT=$(date -d "90 days ago" +%Y-%m-%d)

hdfs dfs -ls $SOURCE_DIR | grep "event_date=" | while read line; do
    PART_DATE=$(echo $line | awk -F'event_date=' '{print $2}')
    if [[ "$PART_DATE" < "$DATE_LIMIT" ]]; then
        echo "Archiving $PART_DATE..."
        hdfs dfs -mv "$SOURCE_DIR/event_date=$PART_DATE" "$ARCHIVE_DIR/"
    fi
done
```

## 5. Best Practices
- **Use Python for Complexity**: Switch from Bash to Python if the logic requires complex parsing or multiple API calls.
- **Dry Run Mode**: Always implement a `-n` or `--dry-run` flag to simulate actions before execution.
- **Unit Testing**: Test script logic in isolation before deploying to production.
- **Documentation**: Every script must have a `--help` flag and a header block explaining its purpose and parameters.

## 6. Common Issues & Troubleshooting
- **Path Divergence**: Scripts failing due to hardcoded paths that differ between Dev and Prod. Use configuration files.
- **Permissions (sudo)**: Ensure service accounts have the necessary `sudoers` entries or Ranger permissions.
- **API Rate Limiting**: Be mindful of hitting Cloudera Manager or Atlas APIs too frequently in a loop.

## 7. Performance & Optimization
- **Parallelism**: Use `xargs -P` or Python `concurrent.futures` to run independent tasks in parallel (e.g., checking health of 100 nodes).
- **Metadata Caching**: Cache expensive API results (like cluster topology) to avoid redundant network calls.

## 8. Governance & Compliance
- **Version Control**: All scripts must reside in the `sa-coe-automation` Git repository.
- **Audit Trail**: Every automation run must log the initiating user and the changes made.
- **CI/CD**: Deploy scripts via automated pipelines to ensure consistency.

## 9. Tools & Technologies
- **Python 3.x**: Preferred language for all new automation.
- **Ansible**: For infrastructure-as-code and configuration management.
- **Jenkins/Airflow**: For scheduling and orchestrating automated tasks.

## 10. Real-World Use Cases
- **Cluster Scale-Down**: Automatically reducing YARN node count during off-peak hours (night/weekends).
- **Metastore Sync**: Automatically running `MSCK REPAIR TABLE` after DistCP data loads.

## 11. References
- [Cloudera Manager API Documentation](https://archive.cloudera.com/cm6/6.3.0/generic/jar/cm_api/swagger-html/index.html)
- [Python Subprocess Documentation](https://docs.python.org/3/library/subprocess.html)
