-- KB Source Path Evidence Profile — Read-Only Production Analysis
-- Validated for PostgreSQL syntax. No writes, no classification, no article bodies.
-- Run in Neon SQL Editor: BEGIN TRANSACTION READ ONLY; [paste this] COMMIT;

BEGIN TRANSACTION READ ONLY;

-- =====================================================================
-- 0. Base CTE: extract source_path, category, collection, title from metadata
-- =====================================================================
WITH meta AS (
  SELECT
    id,
    title,
    (regexp_match(content, 'collection: ([^\r\n]+)'))[1] AS collection,
    (regexp_match(content, 'source_path: ([^\r\n]+)'))[1] AS source_path,
    (regexp_match(content, 'category: ([^\r\n]+)'))[1] AS category,
    (regexp_match(content, 'sensitivity: ([^\r\n]+)'))[1] AS sensitivity
  FROM "KnowledgeBaseArticle"
  WHERE "deletedAt" IS NULL
    AND content LIKE '%NETOPS_AI_SOURCE_METADATA%'
),
path_parts AS (
  SELECT
    *,
    split_part(source_path, '/', 1) AS lvl1,
    split_part(source_path, '/', 2) AS lvl2,
    split_part(source_path, '/', 3) AS lvl3,
    -- derive filename from last path segment
    split_part(source_path, '/', -1) AS filename,
    -- derive extension from filename
    CASE
      WHEN split_part(source_path, '/', -1) ~ '\.([a-zA-Z0-9]+)$'
      THEN regexp_match(split_part(source_path, '/', -1), '\.([a-zA-Z0-9]+)$')[1]
      ELSE 'no_extension'
    END AS extension
  FROM meta
),
tokens AS (
  SELECT
    id,
    title,
    category,
    collection,
    source_path,
    lvl1,
    lvl2,
    lvl3,
    filename,
    extension,
    -- normalized tokens from path segments and filename
    unnest(string_to_array(lower(lvl1), '_')) AS lvl1_token,
    unnest(string_to_array(lower(lvl2), '_')) AS lvl2_token,
    unnest(string_to_array(lower(lvl3), '_')) AS lvl3_token,
    unnest(string_to_array(lower(filename), '[_\-.]+')) AS filename_token
  FROM path_parts
  WHERE lvl1 IS NOT NULL
)
-- =====================================================================
-- 1. Path depth distribution
-- =====================================================================
SELECT 'path_depth' AS metric,
       CASE
         WHEN lvl3 IS NOT NULL AND lvl3 <> '' THEN 3
         WHEN lvl2 IS NOT NULL AND lvl2 <> '' THEN 2
         ELSE 1
       END AS depth,
       count(*) AS cnt
FROM path_parts
GROUP BY depth
ORDER BY depth;

-- =====================================================================
-- 2. First-level segments (lvl1)
-- =====================================================================
SELECT 'lvl1_segment' AS metric,
       lvl1 AS segment,
       count(*) AS cnt
FROM path_parts
GROUP BY lvl1
ORDER BY cnt DESC;

-- =====================================================================
-- 3. Second-level segments (lvl2)
-- =====================================================================
SELECT 'lvl2_segment' AS metric,
       lvl2 AS segment,
       count(*) AS cnt
FROM path_parts
WHERE lvl2 IS NOT NULL AND lvl2 <> ''
GROUP BY lvl2
ORDER BY cnt DESC;

-- =====================================================================
-- 4. Third-level segments (lvl3)
-- =====================================================================
SELECT 'lvl3_segment' AS metric,
       lvl3 AS segment,
       count(*) AS cnt
FROM path_parts
WHERE lvl3 IS NOT NULL AND lvl3 <> ''
GROUP BY lvl3
ORDER BY cnt DESC
LIMIT 50;

-- =====================================================================
-- 5. Filenames (derived from source_path)
-- =====================================================================
SELECT 'filename' AS metric,
       filename,
       count(*) AS cnt
FROM path_parts
GROUP BY filename
ORDER BY cnt DESC
LIMIT 100;

-- =====================================================================
-- 6. File extensions
-- =====================================================================
SELECT 'extension' AS metric,
       extension,
       count(*) AS cnt
FROM path_parts
GROUP BY extension
ORDER BY cnt DESC;

-- =====================================================================
-- 7. Normalized filename tokens (from lvl1, lvl2, lvl3, filename)
-- =====================================================================
SELECT 'normalized_token' AS metric,
       token,
       count(DISTINCT id) AS article_cnt,
       count(*) AS total_occurrences
FROM (
  SELECT id, lvl1_token AS token FROM tokens WHERE lvl1_token ~ '^[a-z0-9]+$' AND length(lvl1_token) > 1
  UNION ALL
  SELECT id, lvl2_token AS token FROM tokens WHERE lvl2_token ~ '^[a-z0-9]+$' AND length(lvl2_token) > 1
  UNION ALL
  SELECT id, lvl3_token AS token FROM tokens WHERE lvl3_token ~ '^[a-z0-9]+$' AND length(lvl3_token) > 1
  UNION ALL
  SELECT id, filename_token AS token FROM tokens WHERE filename_token ~ '^[a-z0-9]+$' AND length(filename_token) > 1
) t
GROUP BY token
ORDER BY article_cnt DESC
LIMIT 150;

-- =====================================================================
-- 8. Category × first-level path segment (lvl1)
-- =====================================================================
SELECT 'category_lvl1' AS metric,
       category,
       lvl1,
       count(*) AS cnt
FROM path_parts
GROUP BY category, lvl1
ORDER BY category, cnt DESC;

-- =====================================================================
-- 9. Capped title samples per category (max 3)
-- =====================================================================
WITH ranked AS (
  SELECT
    category,
    title,
    row_number() OVER (PARTITION BY category ORDER BY id) AS rn
  FROM path_parts
)
SELECT 'title_sample' AS metric,
       category,
       title
FROM ranked
WHERE rn <= 3
ORDER BY category, rn;

-- =====================================================================
-- 10. Explicit vendor tokens in source_path OR title
-- =====================================================================
SELECT 'vendor_token' AS metric,
       v.vendor_token,
       count(*) AS cnt
FROM path_parts p
CROSS JOIN LATERAL (
  VALUES
    ('cisco'), ('juniper'), ('mikrotik'), ('routeros'),
    ('huawei'), ('fortinet'), ('arista'), ('paloalto'),
    ('aruba'), ('ubiquiti'), ('nokia'), ('h3c'),
    ('extreme'), ('dell'), ('avaya'), ('alcatel'),
    ('checkpoint'), ('f5'), ('a10'), ('infoblox'),
    ('ciscoasa'), ('cisconxos'), ('ciscoios'), ('ciscoiosxe'), ('ciscoiosxr')
) v(vendor_token)
WHERE lower(p.source_path) LIKE '%' || v.vendor_token || '%'
   OR lower(p.title) LIKE '%' || v.vendor_token || '%'
GROUP BY v.vendor_token
ORDER BY cnt DESC;

-- =====================================================================
-- 11. Explicit platform tokens in source_path OR title
-- =====================================================================
SELECT 'platform_token' AS metric,
       p.platform_token,
       count(*) AS cnt
FROM path_parts p
CROSS JOIN LATERAL (
  VALUES
    ('ios'), ('ios-xe'), ('ios-xr'), ('iosxe'), ('iosxr'),
    ('nxos'), ('junos'), ('routeros'), ('vrp'), ('eos'),
    ('linux'), ('windows'), ('fortios'), ('panos'),
    ('aos'), ('gaia'), ('tmos'), ('acos'),
    ('vmanage'), ('vsmart'), ('vbond'),
    ('catalyst'), ('nexus'), ('asr'), ('isr'), ('csr'),
    ('mx'), ('srx'), ('ex'), ('qfx'), ('ptx'),
    ('ccr'), ('crs'), ('rb'), ('ch'),
    ('ne'), ('ar'), ('s'), ('ce'), ('atlas'),
    ('fortigate'), ('fortiswitch'), ('fortiap'),
    ('pa-'), ('vm-'), ('cn-')
) p(platform_token)
WHERE lower(p.source_path) LIKE '%' || p.platform_token || '%'
   OR lower(p.title) LIKE '%' || p.platform_token || '%'
GROUP BY p.platform_token
ORDER BY cnt DESC;

-- =====================================================================
-- 12. Explicit protocol/topic tokens in source_path OR title
-- =====================================================================
SELECT 'protocol_token' AS metric,
       pt.protocol_token,
       count(*) AS cnt
FROM path_parts p
CROSS JOIN LATERAL (
  VALUES
    ('bgp'), ('ospf'), ('isis'), ('eigrp'), ('rip'), ('static'),
    ('vlan'), ('stp'), ('mstp'), ('lacp'), ('vpc'), ('mlag'),
    ('vxlan'), ('evpn'), ('mpls'), ('ldp'), ('rsvp'), ('te'),
    ('atom'), ('vpls'), ('pseudowire'),
    ('ipsec'), ('ikev2'), ('ssl'), ('vpn'), ('gre'), ('dmvpn'),
    ('pppoe'), ('ppp'), ('dhcp'), ('dns'), ('ipam'),
    ('radius'), ('tacacs'), ('aaa'), ('dot1x'), ('mab'),
    ('snmp'), ('syslog'), ('netflow'), ('sflow'), ('telemetry'),
    ('netconf'), ('restconf'), ('yang'), ('gnmi'),
    ('ansible'), ('terraform'), ('python'), ('gitops'), ('ci-cd'),
    ('sd-wan'), ('sdwan'), ('viptela'), ('meraki'),
    ('qos'), ('multicast'), ('pim'), ('igmp'), ('mld'),
    ('nat'), ('firewall'), ('acl'), ('zone'), ('policy')
) pt(protocol_token)
WHERE lower(p.source_path) LIKE '%' || pt.protocol_token || '%'
   OR lower(p.title) LIKE '%' || pt.protocol_token || '%'
GROUP BY pt.protocol_token
ORDER BY cnt DESC;

-- =====================================================================
-- 13. Records with NO vendor token in source_path OR title
-- =====================================================================
SELECT 'no_vendor_token' AS metric,
       count(*) AS cnt
FROM path_parts p
WHERE NOT (
  lower(p.source_path) LIKE '%cisco%' OR lower(p.source_path) LIKE '%juniper%' OR
  lower(p.source_path) LIKE '%mikrotik%' OR lower(p.source_path) LIKE '%routeros%' OR
  lower(p.source_path) LIKE '%huawei%' OR lower(p.source_path) LIKE '%fortinet%' OR
  lower(p.source_path) LIKE '%arista%' OR lower(p.source_path) LIKE '%paloalto%' OR
  lower(p.source_path) LIKE '%aruba%' OR lower(p.source_path) LIKE '%ubiquiti%' OR
  lower(p.source_path) LIKE '%nokia%' OR lower(p.source_path) LIKE '%h3c%' OR
  lower(p.source_path) LIKE '%extreme%' OR lower(p.source_path) LIKE '%dell%' OR
  lower(p.source_path) LIKE '%avaya%' OR lower(p.source_path) LIKE '%alcatel%' OR
  lower(p.source_path) LIKE '%checkpoint%' OR lower(p.source_path) LIKE '%f5%' OR
  lower(p.source_path) LIKE '%a10%' OR lower(p.source_path) LIKE '%infoblox%' OR
  lower(p.title) LIKE '%cisco%' OR lower(p.title) LIKE '%juniper%' OR
  lower(p.title) LIKE '%mikrotik%' OR lower(p.title) LIKE '%routeros%' OR
  lower(p.title) LIKE '%huawei%' OR lower(p.title) LIKE '%fortinet%' OR
  lower(p.title) LIKE '%arista%' OR lower(p.title) LIKE '%paloalto%' OR
  lower(p.title) LIKE '%aruba%' OR lower(p.title) LIKE '%ubiquiti%' OR
  lower(p.title) LIKE '%nokia%' OR lower(p.title) LIKE '%h3c%' OR
  lower(p.title) LIKE '%extreme%' OR lower(p.title) LIKE '%dell%' OR
  lower(p.title) LIKE '%avaya%' OR lower(p.title) LIKE '%alcatel%' OR
  lower(p.title) LIKE '%checkpoint%' OR lower(p.title) LIKE '%f5%' OR
  lower(p.title) LIKE '%a10%' OR lower(p.title) LIKE '%infoblox%'
);

-- =====================================================================
-- 14. Records with NO platform token in source_path OR title
-- =====================================================================
SELECT 'no_platform_token' AS metric,
       count(*) AS cnt
FROM path_parts p
WHERE NOT (
  lower(p.source_path) LIKE '%ios%' OR lower(p.source_path) LIKE '%nxos%' OR
  lower(p.source_path) LIKE '%junos%' OR lower(p.source_path) LIKE '%routeros%' OR
  lower(p.source_path) LIKE '%vrp%' OR lower(p.source_path) LIKE '%eos%' OR
  lower(p.source_path) LIKE '%linux%' OR lower(p.source_path) LIKE '%windows%' OR
  lower(p.source_path) LIKE '%fortios%' OR lower(p.source_path) LIKE '%panos%' OR
  lower(p.source_path) LIKE '%aos%' OR lower(p.source_path) LIKE '%gaia%' OR
  lower(p.source_path) LIKE '%tmos%' OR lower(p.source_path) LIKE '%acos%' OR
  lower(p.source_path) LIKE '%catalyst%' OR lower(p.source_path) LIKE '%nexus%' OR
  lower(p.source_path) LIKE '%mx%' OR lower(p.source_path) LIKE '%srx%' OR
  lower(p.source_path) LIKE '%ccr%' OR lower(p.source_path) LIKE '%crs%' OR
  lower(p.source_path) LIKE '%fortigate%' OR
  lower(p.title) LIKE '%ios%' OR lower(p.title) LIKE '%nxos%' OR
  lower(p.title) LIKE '%junos%' OR lower(p.title) LIKE '%routeros%' OR
  lower(p.title) LIKE '%vrp%' OR lower(p.title) LIKE '%eos%' OR
  lower(p.title) LIKE '%linux%' OR lower(p.title) LIKE '%windows%' OR
  lower(p.title) LIKE '%fortios%' OR lower(p.title) LIKE '%panos%' OR
  lower(p.title) LIKE '%catalyst%' OR lower(p.title) LIKE '%nexus%' OR
  lower(p.title) LIKE '%mx%' OR lower(p.title) LIKE '%srx%' OR
  lower(p.title) LIKE '%ccr%' OR lower(p.title) LIKE '%crs%' OR
  lower(p.title) LIKE '%fortigate%'
);

COMMIT;