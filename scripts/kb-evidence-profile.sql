-- KB Source Path Evidence Profile — Read-Only Production Analysis
-- Each query is fully self-contained with its own CTEs (PostgreSQL statement-scoped).
-- Validated for PostgreSQL syntax. No writes, no classification, no article bodies.
-- Run in Neon SQL Editor: BEGIN TRANSACTION READ ONLY; [paste this] COMMIT;

-- =====================================================================
-- 1. Path depth distribution
-- =====================================================================
WITH meta AS (
  SELECT
    id,
    (regexp_match(content, 'source_path: ([^\r\n]+)'))[1] AS source_path
  FROM "KnowledgeBaseArticle"
  WHERE "deletedAt" IS NULL
    AND content LIKE '%NETOPS_AI_SOURCE_METADATA%'
),
path_parts AS (
  SELECT
    source_path,
    split_part(source_path, '/', 1) AS lvl1,
    split_part(source_path, '/', 2) AS lvl2,
    split_part(source_path, '/', 3) AS lvl3
  FROM meta
)
SELECT 'path_depth' AS metric,
       CASE WHEN lvl3 IS NOT NULL AND lvl3 <> '' THEN 3
            WHEN lvl2 IS NOT NULL AND lvl2 <> '' THEN 2
            ELSE 1 END AS depth,
       count(*) AS cnt
FROM path_parts
GROUP BY depth ORDER BY depth;

-- =====================================================================
-- 2. First-level segments (lvl1)
-- =====================================================================
WITH meta AS (
  SELECT (regexp_match(content, 'source_path: ([^\r\n]+)'))[1] AS source_path
  FROM "KnowledgeBaseArticle"
  WHERE "deletedAt" IS NULL AND content LIKE '%NETOPS_AI_SOURCE_METADATA%'
),
path_parts AS (
  SELECT split_part(source_path, '/', 1) AS lvl1 FROM meta
)
SELECT 'lvl1_segment' AS metric, lvl1 AS segment, count(*) AS cnt
FROM path_parts GROUP BY lvl1 ORDER BY cnt DESC;

-- =====================================================================
-- 3. Second-level segments (lvl2)
-- =====================================================================
WITH meta AS (
  SELECT (regexp_match(content, 'source_path: ([^\r\n]+)'))[1] AS source_path
  FROM "KnowledgeBaseArticle"
  WHERE "deletedAt" IS NULL AND content LIKE '%NETOPS_AI_SOURCE_METADATA%'
),
path_parts AS (
  SELECT split_part(source_path, '/', 2) AS lvl2 FROM meta
)
SELECT 'lvl2_segment' AS metric, lvl2 AS segment, count(*) AS cnt
FROM path_parts
WHERE lvl2 IS NOT NULL AND lvl2 <> ''
GROUP BY lvl2 ORDER BY cnt DESC;

-- =====================================================================
-- 4. Third-level segments (lvl3)
-- =====================================================================
WITH meta AS (
  SELECT (regexp_match(content, 'source_path: ([^\r\n]+)'))[1] AS source_path
  FROM "KnowledgeBaseArticle"
  WHERE "deletedAt" IS NULL AND content LIKE '%NETOPS_AI_SOURCE_METADATA%'
),
path_parts AS (
  SELECT split_part(source_path, '/', 3) AS lvl3 FROM meta
)
SELECT 'lvl3_segment' AS metric, lvl3 AS segment, count(*) AS cnt
FROM path_parts
WHERE lvl3 IS NOT NULL AND lvl3 <> ''
GROUP BY lvl3 ORDER BY cnt DESC LIMIT 50;

-- =====================================================================
-- 5. Filenames (derived from source_path)
-- =====================================================================
WITH meta AS (
  SELECT (regexp_match(content, 'source_path: ([^\r\n]+)'))[1] AS source_path
  FROM "KnowledgeBaseArticle"
  WHERE "deletedAt" IS NULL AND content LIKE '%NETOPS_AI_SOURCE_METADATA%'
),
path_parts AS (
  SELECT split_part(source_path, '/', -1) AS filename FROM meta
)
SELECT 'filename' AS metric, filename, count(*) AS cnt
FROM path_parts GROUP BY filename ORDER BY cnt DESC LIMIT 100;

-- =====================================================================
-- 6. File extensions
-- =====================================================================
WITH meta AS (
  SELECT (regexp_match(content, 'source_path: ([^\r\n]+)'))[1] AS source_path
  FROM "KnowledgeBaseArticle"
  WHERE "deletedAt" IS NULL AND content LIKE '%NETOPS_AI_SOURCE_METADATA%'
),
path_parts AS (
  SELECT
    split_part(source_path, '/', -1) AS filename,
    CASE
      WHEN split_part(source_path, '/', -1) ~ '\.([a-zA-Z0-9]+)$'
      THEN (regexp_match(split_part(source_path, '/', -1), '\.([a-zA-Z0-9]+)$'))[1]
      ELSE 'no_extension'
    END AS extension
  FROM meta
)
SELECT 'extension' AS metric, extension, count(*) AS cnt
FROM path_parts GROUP BY extension ORDER BY cnt DESC;

-- =====================================================================
-- 7. Normalized tokens with counts
-- =====================================================================
WITH meta AS (
  SELECT id,
    (regexp_match(content, 'source_path: ([^\r\n]+)'))[1] AS source_path
  FROM "KnowledgeBaseArticle"
  WHERE "deletedAt" IS NULL AND content LIKE '%NETOPS_AI_SOURCE_METADATA%'
),
path_parts AS (
  SELECT
    id,
    split_part(source_path, '/', 1) AS lvl1,
    split_part(source_path, '/', 2) AS lvl2,
    split_part(source_path, '/', 3) AS lvl3,
    split_part(source_path, '/', -1) AS filename
  FROM meta
),
norm_tokens AS (
  SELECT id,
    regexp_split_to_table(lower(lvl1), '[_\-]+') AS token FROM path_parts WHERE lvl1 IS NOT NULL
  UNION ALL
  SELECT id,
    regexp_split_to_table(lower(lvl2), '[_\-]+') AS token FROM path_parts WHERE lvl2 IS NOT NULL
  UNION ALL
  SELECT id,
    regexp_split_to_table(lower(lvl3), '[_\-]+') AS token FROM path_parts WHERE lvl3 IS NOT NULL
  UNION ALL
  SELECT id,
    regexp_split_to_table(lower(filename), '[_\-\.]+') AS token FROM path_parts
)
SELECT 'normalized_token' AS metric,
       token,
       count(DISTINCT id) AS article_cnt,
       count(*) AS total_occurrences
FROM norm_tokens
WHERE token ~ '^[a-z0-9]+$' AND length(token) > 1
GROUP BY token ORDER BY article_cnt DESC LIMIT 150;

-- =====================================================================
-- 8. Category × first-level path segment
-- =====================================================================
WITH meta AS (
  SELECT
    (regexp_match(content, 'category: ([^\r\n]+)'))[1] AS category,
    (regexp_match(content, 'source_path: ([^\r\n]+)'))[1] AS source_path
  FROM "KnowledgeBaseArticle"
  WHERE "deletedAt" IS NULL AND content LIKE '%NETOPS_AI_SOURCE_METADATA%'
),
path_parts AS (
  SELECT category, split_part(source_path, '/', 1) AS lvl1 FROM meta
)
SELECT 'category_lvl1' AS metric, category, lvl1, count(*) AS cnt
FROM path_parts GROUP BY category, lvl1 ORDER BY category, cnt DESC;

-- =====================================================================
-- 9. Capped title samples per category (max 3)
-- =====================================================================
WITH meta AS (
  SELECT
    id,
    (regexp_match(content, 'category: ([^\r\n]+)'))[1] AS category,
    title
  FROM "KnowledgeBaseArticle"
  WHERE "deletedAt" IS NULL AND content LIKE '%NETOPS_AI_SOURCE_METADATA%'
),
ranked AS (
  SELECT category, title, row_number() OVER (PARTITION BY category ORDER BY id) AS rn
  FROM meta
)
SELECT 'title_sample' AS metric, category, title
FROM ranked WHERE rn <= 3 ORDER BY category, rn;

-- =====================================================================
-- 10. Vendor tokens (boundary-aware, exact normalized token match)
-- =====================================================================
WITH meta AS (
  SELECT id, title,
    (regexp_match(content, 'source_path: ([^\r\n]+)'))[1] AS source_path
  FROM "KnowledgeBaseArticle"
  WHERE "deletedAt" IS NULL AND content LIKE '%NETOPS_AI_SOURCE_METADATA%'
),
path_parts AS (
  SELECT id, title,
    split_part(source_path, '/', 1) AS lvl1,
    split_part(source_path, '/', 2) AS lvl2,
    split_part(source_path, '/', 3) AS lvl3,
    split_part(source_path, '/', -1) AS filename
  FROM meta
),
norm_tokens AS (
  SELECT id, title, regexp_split_to_table(lower(lvl1), '[_\-]+') AS token FROM path_parts WHERE lvl1 IS NOT NULL
  UNION ALL SELECT id, title, regexp_split_to_table(lower(lvl2), '[_\-]+') FROM path_parts WHERE lvl2 IS NOT NULL
  UNION ALL SELECT id, title, regexp_split_to_table(lower(lvl3), '[_\-]+') FROM path_parts WHERE lvl3 IS NOT NULL
  UNION ALL SELECT id, title, regexp_split_to_table(lower(filename), '[_\-\.]+') FROM path_parts
),
dict AS (
  SELECT v AS token FROM unnest(ARRAY[
    'cisco', 'juniper', 'mikrotik',
    'huawei', 'fortinet', 'arista', 'paloalto',
    'aruba', 'ubiquiti', 'nokia', 'h3c',
    'extreme', 'dell', 'avaya', 'alcatel',
    'checkpoint', 'f5', 'a10', 'infoblox'
  ]) AS v
)
SELECT 'vendor_token' AS metric, n.token, count(*) AS cnt
FROM norm_tokens n
JOIN dict d ON n.token = d.token
GROUP BY n.token ORDER BY cnt DESC;

-- =====================================================================
-- 11. Platform tokens (boundary-aware, exact normalized token match)
-- =====================================================================
WITH meta AS (
  SELECT id, title,
    (regexp_match(content, 'source_path: ([^\r\n]+)'))[1] AS source_path
  FROM "KnowledgeBaseArticle"
  WHERE "deletedAt" IS NULL AND content LIKE '%NETOPS_AI_SOURCE_METADATA%'
),
path_parts AS (
  SELECT id, title,
    split_part(source_path, '/', 1) AS lvl1,
    split_part(source_path, '/', 2) AS lvl2,
    split_part(source_path, '/', 3) AS lvl3,
    split_part(source_path, '/', -1) AS filename
  FROM meta
),
norm_tokens AS (
  SELECT id, title, regexp_split_to_table(lower(lvl1), '[_\-]+') AS token FROM path_parts WHERE lvl1 IS NOT NULL
  UNION ALL SELECT id, title, regexp_split_to_table(lower(lvl2), '[_\-]+') FROM path_parts WHERE lvl2 IS NOT NULL
  UNION ALL SELECT id, title, regexp_split_to_table(lower(lvl3), '[_\-]+') FROM path_parts WHERE lvl3 IS NOT NULL
  UNION ALL SELECT id, title, regexp_split_to_table(lower(filename), '[_\-\.]+') FROM path_parts
),
dict AS (
  SELECT p AS token FROM unnest(ARRAY[
    'ios', 'ios-xe', 'ios-xr', 'nxos',
    'junos', 'routeros', 'vrp', 'eos',
    'linux', 'windows', 'fortios', 'panos',
    'aos', 'gaia', 'tmos', 'acos',
    'vmanage', 'vsmart', 'vbond',
    'catalyst', 'nexus', 'asr', 'isr', 'csr',
    'mx', 'srx', 'ex', 'qfx', 'ptx',
    'ccr', 'crs', 'rb', 'ch',
    'ne', 'ar', 's', 'ce', 'atlas',
    'fortigate', 'fortiswitch', 'fortiap',
    'pa', 'vm', 'cn'
  ]) AS p
)
SELECT 'platform_token' AS metric, n.token, count(*) AS cnt
FROM norm_tokens n
JOIN dict d ON n.token = d.token
GROUP BY n.token ORDER BY cnt DESC;

-- =====================================================================
-- 12. Protocol/topic tokens (boundary-aware, exact normalized token match)
-- =====================================================================
WITH meta AS (
  SELECT id, title,
    (regexp_match(content, 'source_path: ([^\r\n]+)'))[1] AS source_path
  FROM "KnowledgeBaseArticle"
  WHERE "deletedAt" IS NULL AND content LIKE '%NETOPS_AI_SOURCE_METADATA%'
),
path_parts AS (
  SELECT id, title,
    split_part(source_path, '/', 1) AS lvl1,
    split_part(source_path, '/', 2) AS lvl2,
    split_part(source_path, '/', 3) AS lvl3,
    split_part(source_path, '/', -1) AS filename
  FROM meta
),
norm_tokens AS (
  SELECT id, title, regexp_split_to_table(lower(lvl1), '[_\-]+') AS token FROM path_parts WHERE lvl1 IS NOT NULL
  UNION ALL SELECT id, title, regexp_split_to_table(lower(lvl2), '[_\-]+') FROM path_parts WHERE lvl2 IS NOT NULL
  UNION ALL SELECT id, title, regexp_split_to_table(lower(lvl3), '[_\-]+') FROM path_parts WHERE lvl3 IS NOT NULL
  UNION ALL SELECT id, title, regexp_split_to_table(lower(filename), '[_\-\.]+') FROM path_parts
),
dict AS (
  SELECT pt AS token FROM unnest(ARRAY[
    'bgp', 'ospf', 'isis', 'eigrp', 'rip', 'static',
    'vlan', 'stp', 'mstp', 'lacp', 'vpc', 'mlag',
    'vxlan', 'evpn', 'mpls', 'ldp', 'rsvp', 'te',
    'atom', 'vpls', 'pseudowire',
    'ipsec', 'ikev2', 'ssl', 'vpn', 'gre', 'dmvpn',
    'pppoe', 'ppp', 'dhcp', 'dns', 'ipam',
    'radius', 'tacacs', 'aaa', 'dot1x', 'mab',
    'snmp', 'syslog', 'netflow', 'sflow', 'telemetry',
    'netconf', 'restconf', 'yang', 'gnmi',
    'ansible', 'terraform', 'python', 'gitops', 'ci-cd',
    'sdwan', 'viptela', 'meraki',
    'qos', 'multicast', 'pim', 'igmp', 'mld',
    'nat', 'firewall', 'acl', 'zone', 'policy'
  ]) AS pt
)
SELECT 'protocol_token' AS metric, n.token, count(*) AS cnt
FROM norm_tokens n
JOIN dict d ON n.token = d.token
GROUP BY n.token ORDER BY cnt DESC;

-- =====================================================================
-- 13. Records with NO vendor token (same boundary rules)
-- =====================================================================
WITH meta AS (
  SELECT id,
    (regexp_match(content, 'source_path: ([^\r\n]+)'))[1] AS source_path
  FROM "KnowledgeBaseArticle"
  WHERE "deletedAt" IS NULL AND content LIKE '%NETOPS_AI_SOURCE_METADATA%'
),
path_parts AS (
  SELECT id,
    split_part(source_path, '/', 1) AS lvl1,
    split_part(source_path, '/', 2) AS lvl2,
    split_part(source_path, '/', 3) AS lvl3,
    split_part(source_path, '/', -1) AS filename
  FROM meta
),
norm_tokens AS (
  SELECT id, regexp_split_to_table(lower(lvl1), '[_\-]+') AS token FROM path_parts WHERE lvl1 IS NOT NULL
  UNION ALL SELECT id, regexp_split_to_table(lower(lvl2), '[_\-]+') FROM path_parts WHERE lvl2 IS NOT NULL
  UNION ALL SELECT id, regexp_split_to_table(lower(lvl3), '[_\-]+') FROM path_parts WHERE lvl3 IS NOT NULL
  UNION ALL SELECT id, regexp_split_to_table(lower(filename), '[_\-\.]+') FROM path_parts
),
dict AS (
  SELECT v AS token FROM unnest(ARRAY[
    'cisco', 'juniper', 'mikrotik',
    'huawei', 'fortinet', 'arista', 'paloalto',
    'aruba', 'ubiquiti', 'nokia', 'h3c',
    'extreme', 'dell', 'avaya', 'alcatel',
    'checkpoint', 'f5', 'a10', 'infoblox'
  ]) AS v
)
SELECT 'no_vendor_token' AS metric, count(*) AS cnt
FROM path_parts p
WHERE NOT EXISTS (
  SELECT 1 FROM norm_tokens n
  JOIN dict d ON n.token = d.token
  WHERE n.id = p.id
);

-- =====================================================================
-- 14. Records with NO platform token (same boundary rules)
-- =====================================================================
WITH meta AS (
  SELECT id,
    (regexp_match(content, 'source_path: ([^\r\n]+)'))[1] AS source_path
  FROM "KnowledgeBaseArticle"
  WHERE "deletedAt" IS NULL AND content LIKE '%NETOPS_AI_SOURCE_METADATA%'
),
path_parts AS (
  SELECT id,
    split_part(source_path, '/', 1) AS lvl1,
    split_part(source_path, '/', 2) AS lvl2,
    split_part(source_path, '/', 3) AS lvl3,
    split_part(source_path, '/', -1) AS filename
  FROM meta
),
norm_tokens AS (
  SELECT id, regexp_split_to_table(lower(lvl1), '[_\-]+') AS token FROM path_parts WHERE lvl1 IS NOT NULL
  UNION ALL SELECT id, regexp_split_to_table(lower(lvl2), '[_\-]+') FROM path_parts WHERE lvl2 IS NOT NULL
  UNION ALL SELECT id, regexp_split_to_table(lower(lvl3), '[_\-]+') FROM path_parts WHERE lvl3 IS NOT NULL
  UNION ALL SELECT id, regexp_split_to_table(lower(filename), '[_\-\.]+') FROM path_parts
),
dict AS (
  SELECT p AS token FROM unnest(ARRAY[
    'ios', 'ios-xe', 'ios-xr', 'nxos',
    'junos', 'routeros', 'vrp', 'eos',
    'linux', 'windows', 'fortios', 'panos',
    'aos', 'gaia', 'tmos', 'acos',
    'vmanage', 'vsmart', 'vbond',
    'catalyst', 'nexus', 'asr', 'isr', 'csr',
    'mx', 'srx', 'ex', 'qfx', 'ptx',
    'ccr', 'crs', 'rb', 'ch',
    'ne', 'ar', 's', 'ce', 'atlas',
    'fortigate', 'fortiswitch', 'fortiap',
    'pa', 'vm', 'cn'
  ]) AS p
)
SELECT 'no_platform_token' AS metric, count(*) AS cnt
FROM path_parts p
WHERE NOT EXISTS (
  SELECT 1 FROM norm_tokens n
  JOIN dict d ON n.token = d.token
  WHERE n.id = p.id
);

-- =====================================================================
-- Validation: Total article count
-- =====================================================================
WITH meta AS (
  SELECT count(*) AS total_articles
  FROM "KnowledgeBaseArticle"
  WHERE "deletedAt" IS NULL AND content LIKE '%NETOPS_AI_SOURCE_METADATA%'
)
SELECT 'validation' AS metric, 'read_only' AS status, total_articles FROM meta;