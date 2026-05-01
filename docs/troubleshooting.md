# General Troubleshooting Methodology

## 1. Overview
Troubleshooting complex data platform issues requires a structured, logical approach to minimize downtime and identify root causes accurately. This document provides a universal framework for debugging across the Smart Analytica ecosystem, supplementing the service-specific guides for Hive, Spark, and ETL.

## 2. Architecture Context
Issues in a distributed platform often cross several boundaries:
- **Client Side**: Local IDE, Hue, or BI tool configuration.
- **Network Side**: Firewalls, Load Balancers, and DNS.
- **Platform Side**: YARN resources, HDFS storage, and Metadata services.
- **Security Side**: Ranger policies, Kerberos tickets, and SSL certificates.

## 3. Core Concepts
- **Isolation of Variables**: Changing one thing at a time to determine the cause of an issue.
- **Top-Down vs. Bottom-Up**: Starting from the high-level UI/Application error vs. starting from the low-level infrastructure logs.
- **Event Correlation**: Comparing the timing of an error with other system events (e.g., a cluster restart or network maintenance).
- **The 5 Whys**: A technique to dig past the symptom to the true root cause.

## 4. Detailed Design / Implementation

### The 6-Step Troubleshooting Framework
1.  **Define the Problem**: Exactly what is failing? Is it intermittent or constant? Who is affected?
2.  **Gather Evidence**: Collect error messages, stack traces, and relevant log files (YARN logs, HS2 logs).
3.  **Form a Hypothesis**: Based on the evidence, what is the most likely cause? (e.g., "The executor is running out of memory").
4.  **Test the Hypothesis**: Apply a targeted change (e.g., increase memory) and observe the result.
5.  **Identify the Root Cause**: Once fixed, understand *why* it happened (e.g., "The daily data volume doubled").
6.  **Document and Prevent**: Update the relevant runbook or monitoring dashboard to catch the issue earlier next time.

### Useful Global Commands
```bash
# Check overall YARN status
yarn cluster --status

# Check for HDFS health
hdfs fsck /

# Check for Kerberos ticket
klist

# Test connectivity to a specific port
nc -zv <host> <port>
```

## 5. Best Practices
- **Read the Logs**: Don't guess; the answer is almost always in the log file stack trace.
- **Check for Recent Changes**: Most production issues are caused by recent deployments or configuration changes.
- **Verify Basics First**: Is the service running? Is the disk full? Is the VPN connected?
- **Collaborate**: If you're stuck for more than 30 minutes, pull in another engineer for a "second set of eyes".

## 6. Common Issues & Troubleshooting
- **Intermittent Failures**: Often related to network congestion or resource contention in a multi-tenant environment.
- **Environment Parity**: An issue that happens in Prod but not Dev. Usually caused by data volume differences or missing config parameters.

## 7. Performance & Optimization
- **Log Levels**: If an error is cryptic, temporarily increase the log level to `DEBUG` or `TRACE` (revert after troubleshooting).
- **Automated Diagnostics**: Use Cloudera Manager's "Diagnostic Bundle" feature for complex platform-level issues.

## 8. Governance & Compliance
- **RCA Documentation**: All major production incidents require a formal Root Cause Analysis (RCA) document.
- **Audit Trails**: Never "experiment" in production. Log all troubleshooting steps taken.

## 9. Tools & Technologies
- **Cloudera Manager**: Centralized monitoring and log aggregation.
- **Grafana / Prometheus**: For infrastructure performance trends.
- **ELK Stack**: For distributed log searching.

## 10. Real-World Use Cases
- **The "Hanging Query"**: Using the 6-step framework to identify that a query wasn't slow, but was waiting in a low-priority YARN queue.
- **The "Mystery 403"**: Correlating a failed job with a Ranger policy update that happened 5 minutes prior.

## 11. References
- [SRE Handbook: Troubleshooting](https://sre.google/sre-book/troubleshooting/)
- [The Scientific Method in Software Debugging](https://en.wikipedia.org/wiki/Debugging)
