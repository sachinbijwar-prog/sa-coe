# Workflow & Orchestration Migration

## 1. Overview
Workflow migration involves moving job scheduling and orchestration logic from legacy systems (Oozie, Cron) to modern orchestrators like Apache Airflow or upgraded Apache Oozie on CDP. The goal is to ensure that data pipelines continue to run in the correct sequence, with robust error handling and dependency management, on the new platform.

## 2. Architecture Context

```
[Legacy Orchestration]              [CDP Orchestration]
  Apache Oozie (XML)      ──▶       Apache Airflow (Python)
  Control-M / Autosys     ──▶       Modernized Connectors
```

**Key Improvements:**
- **Apache Airflow**: Python-based DAGs provide more flexibility and dynamic orchestration compared to Oozie XML.
- **Cloudera Data Engineering (CDE)**: Built-in Airflow service for managed orchestration.

## 3. Core Concepts

| Concept | Description |
|---|---|
| **DAG (Directed Acyclic Graph)** | A collection of all tasks you want to run, organized in a way that reflects their relationships and dependencies. |
| **Operator** | A template for a predefined task (e.g., SparkSubmitOperator, BashOperator). |
| **Task Instance** | A specific run of a task for a given execution date. |
| **SLA (Service Level Agreement)** | Time by which a task or DAG should complete. |
| **Backfilling** | Running DAGs for historical dates. |

## 4. Detailed Design / Implementation

### Migration from Oozie to Airflow
1. **XML to Python Mapping**: Translate Oozie actions (Spark, Hive, Shell) into Airflow operators.
2. **Dependency Mapping**: Re-map `<ok to="..." />` and `<error to="..." />` into Airflow's `>>` and `<<` syntax.
3. **Environment Variables**: Move Oozie properties into Airflow Variables or Connection secrets.
4. **Credential Handling**: Transition from Oozie Kerberos configuration to Airflow Hooks/Connections.

### Example: Airflow DAG for Spark Job
```python
from airflow import DAG
from airflow.providers.apache.spark.operators.spark_submit import SparkSubmitOperator
from datetime import datetime

with DAG('daily_trade_load', start_date=datetime(2024, 4, 1), schedule_interval='@daily') as dag:
    
    load_trades = SparkSubmitOperator(
        task_id='load_trades_task',
        application='/path/to/spark_job.py',
        conn_id='spark_default',
        conf={'spark.executor.memory': '4g'}
    )
```

## 5. Best Practices
- **Prefer Airflow for New Workloads**: Use Airflow's rich ecosystem and Python flexibility for all new CDP pipelines.
- **Modularize DAGs**: Keep DAG files small and use `SubDAGs` or `TaskGroups` for complex logic.
- **Use Connections**: Never hardcode credentials; use the Airflow Connection manager.
- **Implement Retries**: Configure `retries` and `retry_delay` at the DAG or task level.

## 6. Common Issues & Troubleshooting
- **Zombie Tasks**: Tasks that appear running but have no corresponding process. *Solution: Check Airflow Scheduler logs.*
- **Dependency Deadlocks**: Complex dependencies preventing jobs from starting. *Solution: Review DAG trigger rules.*
- **Resource Contention**: Too many concurrent DAGs overwhelming cluster resources. *Solution: Use Pools to limit concurrency.*

## 7. Performance & Optimization
- **Parallelism Tuning**: Adjust `max_active_runs` and `parallelism` in `airflow.cfg`.
- **Operator Selection**: Use specialized operators (e.g., `HiveOperator`) rather than generic `BashOperator` for better monitoring.

## 8. Governance & Compliance
- **Pipeline Lineage**: Integrate Airflow with Atlas to track job execution lineage.
- **Access Control**: Use Airflow RBAC to restrict who can trigger or edit DAGs.

## 9. Tools & Technologies
- **Apache Airflow**: Modern orchestration standard.
- **Apache Oozie**: Legacy XML-based workflow engine.
- **CDE (Cloudera Data Engineering)**: Managed Airflow service.

## 10. Real-World Use Cases
- **Legacy Migration**: Converting 500+ Oozie workflows to Airflow DAGs during a platform modernization project, reducing maintenance overhead by 40%.

## 11. References
- [Apache Airflow Documentation](https://airflow.apache.org/docs/)
- [Cloudera Oozie to Airflow Migration](https://docs.cloudera.com)
