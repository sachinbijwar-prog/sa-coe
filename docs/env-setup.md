# Environment Setup Guide

## 1. Overview
A consistent developer environment is key to minimizing "it works on my machine" issues. This document provides a step-by-step guide to setting up your local machine and your access to the CoE remote development servers.

## 2. Architecture Context
The developer environment consists of:
- **Local Machine**: IDE (VS Code/PyCharm), Git, and CLI tools.
- **Edge Nodes (Remote)**: High-memory Linux servers for running Spark/Hive CLI.
- **CDP Data Services**: Containerized services for Spark (CDE) and Machine Learning (CML).

## 3. Core Concepts
- **IDE (Integrated Development Environment)**: Your primary coding tool.
- **CLI (Command Line Interface)**: For interacting with HDFS and YARN.
- **Virtual Environment (Conda/venv)**: For managing Python dependencies in isolation.
- **Tunneling (SSH)**: Securely accessing remote web UIs from your local browser.

## 4. Detailed Design / Implementation

### Step 1: Install Local Tools
- **Git**: `brew install git` or download from git-scm.com.
- **VS Code**: Install with extensions: "Python", "Remote - SSH", and "SQL Tools".
- **Azure CLI / CDP CLI**: For managing cloud resources.

### Step 2: Configure SSH Access
Add the following to your `~/.ssh/config` file:
```text
Host coe-edge
    HostName edge-node-01.smartanalytica.com
    User your_username
    IdentityFile ~/.ssh/id_rsa
```

### Step 3: Python Environment Setup
```bash
# Create a fresh environment
conda create -n coe_spark python=3.8
conda activate coe_spark

# Install standard CoE libraries
pip install pyspark==3.2.0 pandas requests confluent-kafka
```

### Step 4: Configure Kerberos (Local)
On Windows/Mac, you may need a Kerberos client (like MIT Kerberos) to use `kinit` locally for remote JDBC connections.

## 5. Best Practices
- **Use Remote Development**: Use the VS Code "Remote - SSH" extension to write code directly on the Edge nodes; this avoids local dependency issues.
- **Avoid Local Data**: Never download PII or large datasets to your local laptop; process data on the cluster.
- **Git Flow**: Always create a feature branch (`feature/your-task`) before starting work.
- **Linting**: Enable Flake8 or Black in your IDE to ensure code matches CoE standards.

## 6. Common Issues & Troubleshooting
- **Permission Denied (Publickey)**: Your SSH key is not authorized on the edge node. Contact the CoE admin.
- **Spark Version Mismatch**: Your local Spark version doesn't match the cluster. Always check `spark-submit --version` on the cluster.
- **VPN Connection**: If you cannot ping the edge node, verify you are connected to the corporate VPN.

## 7. Performance & Optimization
- **SSH Tunneling for UIs**:
  ```bash
  # Tunnel to see the Spark UI (4040) on your local browser
  ssh -L 4040:localhost:4040 your_user@coe-edge
  ```

## 8. Governance & Compliance
- **No Secrets in Code**: Use `.env` files or the project's Secret Manager. Never commit passwords to Git.
- **Workstation Security**: Ensure your laptop disk is encrypted and that you use a strong password/biometrics.

## 9. Tools & Technologies
- **VS Code**: Recommended IDE.
- **Anaconda / Miniconda**: For environment management.
- **MobaXterm / iTerm2**: For terminal access.

## 10. Real-World Use Cases
- **Fast Onboarding**: Using this guide, a new joiner should be able to run `Hello World` in Spark within 2 hours.
- **Remote Debugging**: Using VS Code Remote to set breakpoints in a Python script running on the Linux cluster.

## 11. References
- [VS Code Remote SSH Documentation](https://code.visualstudio.com/docs/remote/ssh)
- [Conda User Guide](https://docs.conda.io/projects/conda/en/latest/user-guide/index.html)
