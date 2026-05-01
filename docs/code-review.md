# Code Review Checklist

## 1. Overview
Code reviews are a mandatory quality gate for all software and pipelines developed within the CoE. They ensure that code is performant, secure, maintainable, and follows enterprise standards. This document provides a consolidated checklist for reviewers.

## 2. Architecture Context
Reviewers evaluate code across several dimensions:
- **Functional**: Does it solve the business requirement?
- **Platform**: Does it use CDP services efficiently (e.g., Spark vs. Hive)?
- **Security**: Are credentials secure? Is PII handled correctly?
- **Operational**: Is there logging, error handling, and idempotency?

## 3. Core Concepts
- **Pull Request (PR) / Merge Request (MR)**: The mechanism for initiating a review.
- **Reviewer**: An engineer (usually senior) who validates the code.
- **Author**: The engineer who wrote the code.
- **LGTM (Looks Good To Me)**: The standard signal for approval.

## 4. Detailed Design / Implementation

### Spark & Python Checklist
- [ ] **No `SELECT *`**: All columns are explicitly named.
- [ ] **Adaptive Query Execution (AQE)**: Enabled via config.
- [ ] **No Python UDFs**: Used Spark SQL functions instead.
- [ ] **Resource Sizing**: Executor memory and cores are appropriate for the data volume.
- [ ] **Partitioning**: Output is partitioned correctly to avoid small files.

### SQL & Hive Checklist
- [ ] **Vectorization**: Enabled for Hive queries.
- [ ] **Stats**: `ANALYZE TABLE` is included after data loads.
- [ ] **Joins**: Small tables are on the correct side (or broadcast).
- [ ] **Naming**: Tables and columns follow the naming convention.

### General Engineering
- [ ] **Secret Management**: No hardcoded passwords or keys.
- [ ] **Logging**: Meaningful logs for start, end, and error states.
- [ ] **Idempotency**: Rerunning the script is safe.
- [ ] **Unit Tests**: Coverage for edge cases (e.g., empty source, null values).

## 5. Best Practices
- **Small PRs**: Keep pull requests under 400 lines for effective review.
- **Automated Linting**: Use Flake8 or Pylint to catch style issues before the human review.
- **Be Constructive**: Provide feedback that helps the author grow; avoid bikeshedding.
- **Respond Promptly**: Aim to complete reviews within 24 hours to maintain momentum.

## 6. Common Issues & Troubleshooting
- **Missing Context**: The PR description is empty. Resolution: Require a link to the Jira ticket and a summary of changes.
- **"Works on My Machine"**: The code uses local paths. Resolution: Enforce the use of environment variables or relative paths.

## 7. Performance & Optimization
- **Complexity Analysis**: Look for nested loops or $O(n^2)$ logic in Python scripts that could be replaced with Spark transformations.
- **Memory Leaks**: Check for large objects stored in memory (e.g., `toPandas()` on a large Spark DataFrame).

## 8. Governance & Compliance
- **PII Audit**: Explicitly check for PII exposure in logs or temporary tables.
- **Licensing**: Ensure no unauthorized 3rd-party libraries are introduced.
- **Audit Requirement**: Evidence of code review is required for all production deployments.

## 9. Tools & Technologies
- **GitLab / GitHub**: For hosting and reviewing PRs.
- **SonarQube**: For automated static code analysis.
- **Jira**: For tracking the status of features and bugs.

## 10. Real-World Use Cases
- **The "Broadcast Disaster"**: A reviewer catching a `broadcast()` on a 10GB table before it crashed the executors.
- **The "SQL Injection" Risk**: Catching a Python script that was building SQL strings with raw user input.

## 11. References
- [Google Engineering: How to do a Code Review](https://google.github.io/eng-practices/review/reviewer/)
- [Palantir: Java Style Guide](https://github.com/palantir/checkstyle)
