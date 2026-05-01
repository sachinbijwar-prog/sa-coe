# Application Integration with CDP

## 1. Overview
Application integration with Cloudera Data Platform (CDP) involves connecting external applications (custom Java/Python apps, microservices, or 3rd-party tools) to the CDP ecosystem for data consumption or ingestion. This document provides a framework for secure, high-performance connectivity.

## 2. Architecture Context
Applications connect to CDP through multiple entry points depending on the workload:
- **Direct SQL**: Connecting to Impala or Hive via JDBC/ODBC.
- **REST APIs**: Using CDP service APIs (e.g., CDE API, CML API, or Knox).
- **Messaging**: Integration via Apache Kafka for real-time streaming.
- **Gateway**: Secure access through Apache Knox for edge-node-less connectivity.

## 3. Core Concepts
- **Apache Knox**: A perimeter security gateway that provides a single point of access for CDP services.
- **Kerberos/FreeIPA**: The foundation of identity management in CDP.
- **Service Discovery**: Using Knox or service-specific discovery mechanisms.
- **Connection Pooling**: Managing resource-intensive database connections effectively.

## 4. Detailed Design / Implementation

### JDBC Connectivity (Impala/Hive)
```java
// Example Connection String via Knox
String url = "jdbc:impala://knox-host:8443/;ssl=1;transportMode=http;httpPath=gateway/cdp-proxy-api/impala";
Properties props = new Properties();
props.setProperty("user", "application_user");
props.setProperty("password", "secure_password");
Connection conn = DriverManager.getConnection(url, props);
```

### Kafka Producer/Consumer
```python
# Python Kafka Producer Example
from confluent_kafka import Producer

p = Producer({
    'bootstrap.servers': 'kafka-broker:9092',
    'security.protocol': 'SASL_SSL',
    'sasl.mechanism': 'GSSAPI',
    'sasl.kerberos.service.name': 'kafka'
})

def delivery_report(err, msg):
    if err is not None:
        print(f'Message delivery failed: {err}')
    else:
        print(f'Message delivered to {msg.topic()} [{msg.partition()}]')

p.produce('application.events', 'event_data'.encode('utf-8'), callback=delivery_report)
p.flush()
```

## 5. Best Practices
- **Use Knox for Perimeter Security**: Avoid exposing internal service ports (10000, 21050) directly to external applications.
- **Implement Robust Retries**: Use exponential backoff for transient network issues or service restarts.
- **Monitor Connection Health**: Regularly validate pooled connections (e.g., `SELECT 1`).
- **Externalize Configuration**: Use environment variables or secret managers for credentials.

## 6. Common Issues & Troubleshooting
- **Kerberos Ticket Expiry**: Ensure the application has a process to automatically renew its TGT via a keytab.
- **SSL/TLS Mismatch**: Verify that the truststore contains the CDP CA certificate.
- **Knox Timeout**: Increase `gateway.httpclient.readTimeout` in Knox if long-running queries are timed out.

## 7. Performance & Optimization
- **Enable Result Set Compression**: Reduces network I/O for large query results.
- **Batch Processing**: Use batch inserts/updates to minimize round-trips.
- **Connection Reuse**: Always use a connection pool (e.g., HikariCP) instead of opening a new connection per request.

## 8. Governance & Compliance
- **Service Accounts**: Use dedicated service accounts with minimal required privileges (Least Privilege Principle).
- **Audit Logging**: Ensure application identity is preserved in service audits (e.g., via Knox proxy user).
- **Data Encryption**: Always use TLS for data in transit.

## 9. Tools & Technologies
- **Apache Knox**: Gateway for secure REST and JDBC/ODBC access.
- **Apache Kafka**: Streaming integration.
- **CDP CLI/SDK**: For managing CDP resources programmatically.

## 10. Real-World Use Cases
- **Customer Portal**: A web application querying Impala via Knox to display real-time transaction history.
- **Log Analytics**: Microservices streaming application logs to Kafka for ingestion into the data lake.

## 11. References
- [Apache Knox User Guide](https://knox.apache.org/books/knox-2-0-0/user-guide.html)
- [Cloudera JDBC/ODBC Drivers](https://www.cloudera.com/downloads/connectors.html)
- [Kafka Security with Kerberos](https://docs.confluent.io/platform/current/kafka/authentication_sasl/authentication_sasl_gssapi.html)
