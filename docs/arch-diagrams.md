# Architecture Diagrams & Blueprints

## 1. Overview
Visualizing the complex interactions between CDP services, external applications, and data sources is essential for alignment across engineering teams. This document provides a catalog of standard architecture diagrams and guidance on how to interpret them.

## 2. Architecture Context
The CoE maintains diagrams across four levels:
- **Level 1: Enterprise Ecosystem**: High-level view of data producers and consumers.
- **Level 2: Platform Architecture**: Internal CDP components (SDX, CDW, CDE).
- **Level 3: Security Architecture**: Network zones, Knox gateways, and Kerberos flow.
- **Level 4: Data Flow / Pipeline**: Detailed transformation logic and zone movement.

## 3. Core Concepts
- **Component**: A logical or physical service (e.g., Hive, Kafka).
- **Connector**: The method of integration (JDBC, REST, DistCP).
- **Security Boundary**: Firewalls, subnets, and Knox perimeter.
- **Zone**: Logical data separation (Raw, Staging, Core, Mart).

## 4. Detailed Design / Implementation

### Accessing the Diagrams
Diagrams are stored in the CoE SharePoint and versioned in Git.
- **Location**: `docs/diagrams/` in the `sa-coe-portal` repo.
- **Format**: `.drawio` (editable) and `.png` (viewable).

### Interpreting Icons
- **Blue Boxes**: Compute services (Spark, Impala).
- **Green Cylinders**: Storage services (HDFS, Ozone, S3).
- **Red Padlocks**: Security services (Ranger, Atlas, FreeIPA).
- **Yellow Arrows**: Real-time streaming flows.

## 5. Best Practices
- **Use Standard Icons**: Use the official Cloudera/Azure icon sets to maintain consistency.
- **Keep it Simple**: Avoid "spaghetti" diagrams; break complex architectures into sub-diagrams.
- **Version Everything**: Include the version number and last-updated date in the diagram footer.
- **Include Legend**: Always provide a legend for colors and symbols.

## 6. Common Issues & Troubleshooting
- **Outdated Diagrams**: The architecture changed but the diagram wasn't updated. Check the "Last Modified" metadata.
- **Missing Context**: A diagram shows services but not how they authenticate. Refer to the Level 3 Security diagrams for detail.

## 7. Performance & Optimization
- **Vector Graphics**: Use SVG or Draw.io formats to ensure diagrams remain crisp when scaled for presentations.
- **Layering**: Use layers in Draw.io to show/hide different aspects (e.g., show network paths vs. show data paths).

## 8. Governance & Compliance
- **PII Labeling**: Clearly label zones or services that handle PII data.
- **Review Cycle**: Diagrams must be reviewed quarterly during the CoE Architecture Review Board (ARB).

## 9. Tools & Technologies
- **Draw.io / diagrams.net**: The primary tool for editable diagrams.
- **Lucidchart**: Secondary tool for complex process flows.
- **PowerPoint**: For simplified "Executive View" slides.

## 10. Real-World Use Cases
- **New Project Onboarding**: Walking a new engineering team through the Level 2 Platform diagram to explain where their data will reside.
- **Incident Response**: Using the Level 3 Security diagram to identify which Knox gateway might be blocking a connection.

## 11. References
- [Cloudera Icon Library](https://www.cloudera.com/content/dam/www/marketing/resources/icons/cloudera-icon-library.zip)
- [C4 Model for Software Architecture](https://c4model.com/)
