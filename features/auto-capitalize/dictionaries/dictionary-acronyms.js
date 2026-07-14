window.GMAIL_CAPITALIZER_DICTIONARY =
  window.GMAIL_CAPITALIZER_DICTIONARY || {};

// MERGE with (never replace) the base list from dictionary.js — a plain
// reassignment here silently dropped base acronyms like IVR/URL/SOP (audit fix
// 2026-07-14).
window.GMAIL_CAPITALIZER_DICTIONARY.acronyms = [...new Set([
  ...(window.GMAIL_CAPITALIZER_DICTIONARY.acronyms || []),

  // ===========================
  // ITSM / INCIDENT MANAGEMENT
  // ===========================

  "MIM",
  "RCA",
  "SLA",
  "OLA",
  "KPI",
  "OKR",
  "ITSM",
  "ITOM",
  "CMDB",
  "CAB",
  "SME",
  "PIR",
  "P1",
  "P2",
  "P3",
  "P4",
  "P5",
  "SEV1",
  "SEV2",
  "SEV3",
  "SEV4",

  // ===========================
  // GOOGLE ENVIRONMENT
  // ===========================

  "GTI",
  "GWS",
  "GCP",
  "GWSMO",

  // ===========================
  // MICROSOFT
  // ===========================

  "AAD",
  "AD",
  "MFA",
  "SSO",
  "M365",
  "O365",
  "ADFS",

  // ===========================
  // NETWORKING
  // ===========================

  "LAN",
  "WAN",
  "VPN",
  "VLAN",
  "DNS",
  "DHCP",
  "TCP",
  "UDP",
  "IP",
  "IPv4",
  "IPv6",
  "NAT",
  "SSL",
  "TLS",
  "SSH",
  "SNMP",
  "BGP",
  "OSPF",
  "ARP",
  "ICMP",

  // ===========================
  // SECURITY
  // ===========================

  "SOC",
  "SIEM",
  "IAM",
  "PAM",
  "EDR",
  "XDR",
  "CASB",
  "WAF",
  "MDR",
  "DLP",
  "OTP",
  "PKI",
  "JWT",
  "SAML",
  "OAuth",
  "OIDC",

  // ===========================
  // CLOUD
  // ===========================

  "AWS",
  "EC2",
  "S3",
  "RDS",
  "EKS",
  "ECS",
  "IAM",
  "AMI",
  "VPC",
  "CDN",

  // ===========================
  // DEVOPS
  // ===========================

  "CI",
  "CD",
  "CI/CD",
  "API",
  "REST",
  "SOAP",
  "JSON",
  "XML",
  "YAML",
  "SQL",
  "NoSQL",
  "CLI",
  "SDK",
  "IDE",
  "JDK",
  "JVM",

  // ===========================
  // PROGRAMMING
  // ===========================

  "HTML",
  "CSS",
  "JS",
  "TS",
  "PHP",
  "ASP.NET",
  ".NET",

  // ===========================
  // DATABASES
  // ===========================

  "DB",
  "DBA",
  "ETL",
  "OLTP",
  "OLAP",

  // ===========================
  // PROJECT MANAGEMENT
  // ===========================

  "UAT",
  "SIT",
  "PAT",
  "POC",
  "BRD",
  "FRD",
  "PRD",
  "PM",
  "PMO",
  "BA",
  "QA",
  "QC",

  // ===========================
  // BUSINESS
  // ===========================

  "CEO",
  "CFO",
  "CTO",
  "CIO",
  "COO",
  "VP",
  "AVP",
  "SVP",
  "HR",
  "ERP",
  "CRM",
  "BPO",
  "KYC",
  "GST",
  "PAN",

  // ===========================
  // EMAIL
  // ===========================

  "FYI",
  "ASAP",
  "ETA",
  "EOD",
  "COB",
  "OOO",
  "FYA",
  "IMO",
  "IMHO",
  "NRN",
  "TLDR",
  "TBD",
  "TBA",
  "WIP",

  // ===========================
  // FILE FORMATS
  // ===========================

  "PDF",
  "CSV",
  "XLS",
  "XLSX",
  "DOC",
  "DOCX",
  "PPT",
  "PPTX",
  "ZIP",
  "RAR",
  "ISO",

  // ===========================
  // GENERAL TECH
  // ===========================

  "CPU",
  "GPU",
  "RAM",
  "SSD",
  "HDD",
  "USB",
  "HDMI",
  "BIOS",
  "UEFI",
  "OS",
  "MAC",

  // ===========================
  // YOUR ORGANIZATION
  // ===========================

  "BRM",
  "iSmart",
  "Webex",
  "Connect"

])];