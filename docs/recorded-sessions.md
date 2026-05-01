# Recorded Sessions Library

## 1. Overview
The Recorded Sessions Library is a central repository of all technical training, project walkthroughs, and architecture reviews conducted within the CoE. This library serves as an "on-demand" learning center for all team members.

## 2. Architecture Context
Videos are hosted on the corporate Stream/SharePoint platform but indexed here for easy discovery.
- **Hosting**: Microsoft Stream / SharePoint.
- **Indexing**: CoE Portal (this document).
- **Security**: Access restricted to Smart Analytica employees with CoE permissions.

## 3. Core Concepts
- **On-Demand Learning**: Accessing knowledge when it's needed, not just when it's presented.
- **Searchable Transcripts**: Leveraging AI to search for keywords within the video content.
- **Categorization**: Grouping videos by technology (Spark, Hive, CDP) or project.

## 4. Detailed Design / Implementation

### Video Categories
| Category | Content Description | Recommended For |
|---|---|---|
| **Platform Basics** | Introduction to CDP, HDFS, and YARN. | New Joiners |
| **Advanced Compute** | Spark Tuning, Impala SQL Optimization. | Senior Engineers |
| **Security & Gov** | Ranger Policies, Atlas Lineage, PII Masking. | ALL Team Members |
| **Project Archives** | Historical walkthroughs of completed projects. | Case Study / Reference |
| **Vendor KT** | Training sessions provided by Cloudera or Microsoft. | Specialist Roles |

### Accessing the Library
1.  Navigate to the **CoE Video Channel** on Microsoft Stream.
2.  Use the search bar to find topics (e.g., "Ranger Audit").
3.  Follow the links provided in the "Recent Recordings" section of the Dashboard.

## 5. Best Practices
- **Watch at 1.5x**: Save time by increasing the playback speed for familiar topics.
- **Refer to Slides**: Always check the "Session Handouts" folder for the accompanying slide deck.
- **Contribute**: If you conduct a session, ensure it is uploaded and tagged correctly within 24 hours.
- **Bookmark Key Timestamps**: Use the "Comments" section in Stream to note where specific demos begin.

## 6. Common Issues & Troubleshooting
- **Access Denied**: You do not have permission to view the Stream channel. Resolution: Request access via the CoE SharePoint admin.
- **Buffering / Low Quality**: Network congestion. Resolution: Download the video for offline viewing if permitted.

## 7. Performance & Optimization
- **AI-Powered Search**: Utilize the Stream transcript feature to jump directly to the section where a specific keyword (e.g., "salting") is mentioned.

## 8. Governance & Compliance
- **Data Privacy**: No client-sensitive data or real production credentials should be visible in recordings.
- **Retention**: Videos are retained for 3 years unless tagged for permanent archive.

## 9. Tools & Technologies
- **Microsoft Stream**: The primary video hosting platform.
- **Zoom / Teams**: Tools for recording the sessions.
- **SharePoint**: For hosting metadata and handouts.

## 10. Real-World Use Cases
- **Emergency Troubleshooting**: An engineer watching a recorded session on "Impala Metadata Management" at 3 AM to resolve a production outage.
- **New Project Kickoff**: A team watching the "Project X Architecture Review" to understand the design decisions made by the previous team.

## 11. References
- [Microsoft Stream Documentation](https://docs.microsoft.com/en-us/stream/)
- [Benefits of Video-Based Training for Engineering Teams](https://www.forbes.com/sites/forbeshumanresourcescouncil/2021/04/14/the-power-of-video-for-employee-training/)
