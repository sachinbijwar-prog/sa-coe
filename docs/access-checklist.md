# Access Request Checklist

## 1. Overview
Obtaining the correct permissions is the first step for any new project or team member joining the CoE. This document provides a consolidated checklist of the systems and access levels required to develop, deploy, and monitor data applications on the platform.

## 2. Architecture Context
Access is managed through a multi-layered security model:
- **Network Layer**: VPN / Office Network access.
- **Identity Layer**: Active Directory (AD) / LDAP / FreeIPA.
- **Authorization Layer**: Apache Ranger (for data) and Cloudera Manager (for services).

## 3. Core Concepts
- **RBAC (Role-Based Access Control)**: Permissions granted based on job function (e.g., Developer, Analyst, Admin).
- **Service Account**: A non-human identity used for automated jobs and applications.
- **Keytab**: A file used by services to authenticate via Kerberos without human intervention.
- **SUDO Access**: Root-level access to Linux servers, strictly controlled.

## 4. Detailed Design / Implementation

### Access Levels Table
| System | Access Level | Description | Request via |
|---|---|---|---|
| **VPN** | Corporate | Access to the internal data network | IT Support Portal |
| **Linux Edge Nodes** | User | SSH access for Spark/Sqoop development | CoE Support Team |
| **Hue** | User | SQL editor and file browser access | Self-Service (AD sync) |
| **Cloudera Manager** | Read-Only | Monitor service health and logs | CM Admin |
| **Ranger** | DB/Table | Permission to read/write specific data | Data Owner (Ranger UI) |
| **GitLab/GitHub** | Developer | Access to source code repositories | Repo Owner |
| **Jira/Confluence** | User | Project tracking and documentation | Project PM |

### Required Information for Requests
When requesting access, please provide:
1.  **Project ID / Cost Center**.
2.  **Manager Approval**.
3.  **Environment** (Dev, Test, or Prod).
4.  **Specific Tables/Databases** required.

## 5. Best Practices
- **Least Privilege Principle**: Request only the access you need to perform your current task.
- **Use Group-Based Access**: Prefer AD Groups over individual user permissions for easier management.
- **Keep Keytabs Secure**: Never store keytabs in Git or shared folders; use restricted Linux directories.
- **De-provision Promptly**: Notify the CoE team immediately when a member leaves the project.

## 6. Common Issues & Troubleshooting
- **Kerberos Authentication Failure**: Check if your password expired or if your TGT has timed out (`klist`).
- **HTTP 403 Forbidden**: You have connected but don't have Ranger permission for that specific resource.
- **SSH Timeout**: Ensure you are on the correct VPN and that your IP is whitelisted for the Edge node.

## 7. Performance & Optimization
- **SSO Integration**: Most CoE tools (Hue, Atlas, Ranger) use Single Sign-On (SSO) via AD, reducing the need for multiple passwords.

## 8. Governance & Compliance
- **Quarterly Access Review**: All project permissions are reviewed every 90 days.
- **PII Access**: Special justification and security clearance are required for access to raw PII data.

## 9. Tools & Technologies
- **Azure AD / Okta**: For identity management.
- **Apache Ranger**: For fine-grained authorization.
- **FreeIPA**: For Kerberos and Linux identity.

## 10. Real-World Use Cases
- **New Developer Onboarding**: Completing this checklist within 48 hours to ensure a developer can run their first Spark job.
- **Audit Compliance**: Providing the "Access Log" from Ranger to show who has accessed sensitive financial data.

## 11. References
- [Cloudera Security Guide](https://docs.cloudera.com/runtime/7.2.10/security-overview/topics/security-introduction.html)
- [Enterprise RBAC Standards](https://csrc.nist.gov/projects/role-based-access-control)
