-- KB Source Path Evidence Profile
-- Run in production read-only mode
-- No writes, no exports, no classification.

BEGIN TRANSACTION READ ONLY;

-- =====================================================================
-- 1. First-level path segments (vendor/origin identifiers)
-- =====================================================================
SELECT 'first_level_segment' AS metric,
       split_part(source_path, '/', 1) AS segment,
       count(*) AS cnt
FROM (
  SELECT (regexp_match(content, 'source_path: ([^\r\n]+)'))[1] AS source_path
  FROM "KnowledgeBaseArticle"
  WHERE "deletedAt" IS NULL
    AND content LIKE '%NETOPS_AI_SOURCE_METADATA%'
) s
GROUP BY segment
ORDER BY cnt DESC;

-- =====================================================================
-- 2. Second-level path segments (platform/family)
-- =====================================================================
SELECT 'second_level_segment' AS metric,
       split_part(source_path, '/', 2) AS segment,
       count(*) AS cnt
FROM (
  SELECT (regexp_match(content, 'source_path: ([^\r\n]+)'))[1] AS source_path
  FROM "KnowledgeBaseArticle"
  WHERE "deletedAt" IS NULL
    AND content LIKE '%NETOPS_AI_SOURCE_METADATA%'
) s
WHERE source_path LIKE '%/%'
GROUP BY segment
ORDER BY cnt DESC;

-- =====================================================================
-- 3. Third-level path segments (where useful)
-- =====================================================================
SELECT 'third_level_segment' AS metric,
       split_part(source_path, '/', 3) AS segment,
       count(*) AS cnt
FROM (
  SELECT (regexp_match(content, 'source_path: ([^\r\n]+)'))[1] AS source_path
  FROM "KnowledgeBaseArticle"
  WHERE "deletedAt" IS NULL
    AND content LIKE '%NETOPS_AI_SOURCE_METADATA%'
) s
WHERE source_path LIKE '%/%/%'
GROUP BY segment
ORDER BY cnt DESC
LIMIT 50;

-- =====================================================================
-- 4. Filename extensions
-- =====================================================================
SELECT 'filename_extension' AS metric,
       CASE
         WHEN source_path ~ '\.([a-zA-Z0-9]+)$' THEN regexp_match(source_path, '\.([a-zA-Z0-9]+)$')[1]
         ELSE 'no_extension'
       END AS ext,
       count(*) AS cnt
FROM (
  SELECT (regexp_match(content, 'source_path: ([^\r\n]+)'))[1] AS source_path
  FROM "KnowledgeBaseArticle"
  WHERE "deletedAt" IS NULL
    AND content LIKE '%NETOPS_AI_SOURCE_METADATA%'
) s
GROUP BY ext
ORDER BY cnt DESC;

-- =====================================================================
-- 5. Filename tokens (split by _, -, .)
-- =====================================================================
SELECT 'filename_token' AS metric,
       token,
       count(*) AS cnt
FROM (
  SELECT (regexp_match(content, 'source_path: ([^\r\n]+)'))[1] AS source_path
  FROM "KnowledgeBaseArticle"
  WHERE "deletedAt" IS NULL
    AND content LIKE '%NETOPS_AI_SOURCE_METADATA%'
) s,
LATERAL regexp_split_to_table(source_path, '[/_.-]+') AS token
WHERE token ~ '^[a-z0-9]+$'
  AND length(token) > 1
GROUP BY token
ORDER BY cnt DESC
LIMIT 100;

-- =====================================================================
-- 6. Explicit vendor tokens in source_path
-- =====================================================================
SELECT 'vendor_token_in_path' AS metric,
       v.vendor_token,
       count(*) AS cnt
FROM (
  SELECT (regexp_match(content, 'source_path: ([^\r\n]+)'))[1] AS source_path
  FROM "KnowledgeBaseArticle"
  WHERE "deletedAt" IS NULL
    AND content LIKE '%NETOPS_AI_SOURCE_METADATA%'
) s
CROSS JOIN LATERAL (
  VALUES
    ('cisco'), ('juniper'), ('mikrotik'), ('routeros'),
    ('huawei'), ('fortinet'), ('arista'), ('paloalto'),
    ('aruba'), ('ubiquiti'), ('nokia'), ('h3c'),
    ('extreme'), ('dell'), ('avaya'), ('alcatel'),
    ('checkpoint'), ('f5'), ('a10'), ('infoblox')
) v(vendor_token)
WHERE lower(s.source_path) LIKE '%' || v.vendor_token || '%'
GROUP BY v.vendor_token
ORDER BY cnt DESC;

-- =====================================================================
-- 7. Platform tokens in source_path
-- =====================================================================
SELECT 'platform_token_in_path' AS metric,
       p.platform_token,
       count(*) AS cnt
FROM (
  SELECT (regexp_match(content, 'source_path: ([^\r\n]+)'))[1] AS source_path
  FROM "KnowledgeBaseArticle"
  WHERE "deletedAt" IS NULL
    AND content LIKE '%NETOPS_AI_SOURCE_METADATA%'
) s
CROSS JOIN LATERAL (
  VALUES
    ('ios'), ('ios-xe'), ('ios-xr'), ('nxos'),
    ('junos'), ('routeros'), ('vrp'), ('eos'),
    ('linux'), ('windows'), ('fortios'), ('panos'),
    ('aos'), ('gaia'), ('tmos'), ('acos'),
    ('vmanage'), ('vsmart'), ('vbond')
) p(platform_token)
WHERE lower(s.source_path) LIKE '%' || p.platform_token || '%'
GROUP BY p.platform_token
ORDER BY cnt DESC;

-- =====================================================================
-- 8. Records with NO vendor/platform evidence in path
-- =====================================================================
SELECT 'no_vendor_platform_in_path' AS metric,
       count(*) AS cnt
FROM (
  SELECT (regexp_match(content, 'source_path: ([^\r\n]+)'))[1] AS source_path
  FROM "KnowledgeBaseArticle"
  WHERE "deletedAt" IS NULL
    AND content LIKE '%NETOPS_AI_SOURCE_METADATA%'
) s
WHERE NOT lower(s.source_path) ~ '(cisco|juniper|mikrotik|routeros|huawei|fortinet|arista|paloalto|aruba|ubiquiti|nokia|h3c|extreme|dell|avaya|alcatel|checkpoint|f5|a10|infoblox|ios|ios-xe|ios-xr|nxos|junos|routeros|vrp|eos|linux|windows|fortios|panos|aos|gaia|tmos|acos)';

-- =====================================================================
-- 9. Category x first-level path prefix distribution
-- =====================================================================
SELECT 'category_path_prefix' AS metric,
       (regexp_match(content, 'category: ([^\r\n]+)'))[1] AS category,
       split_part((regexp_match(content, 'source_path: ([^\r\n]+)'))[1], '/', 1) AS path_prefix,
       count(*) AS cnt
FROM "KnowledgeBaseArticle"
WHERE "deletedAt" IS NULL
  AND content LIKE '%NETOPS_AI_SOURCE_METADATA%'
GROUP BY category, path_prefix
ORDER BY category, cnt DESC;

-- =====================================================================
-- 10. Title samples per category (max 3 per category)
-- =====================================================================
WITH ranked AS (
  SELECT
    (regexp_match(content, 'category: ([^\r\n]+)'))[1] AS category,
    title,
    row_number() OVER (PARTITION BY (regexp_match(content, 'category: ([^\r\n]+)'))[1] ORDER BY id) AS rn
  FROM "KnowledgeBaseArticle"
  WHERE "deletedAt" IS NULL
    AND content LIKE '%NETOPS_AI_SOURCE_METADATA%'
)
SELECT 'title_samples' AS metric, category, title
FROM ranked
WHERE rn <= 3
ORDER BY category, rn;

-- =====================================================================
-- 11. Collection distribution (verify)
-- =====================================================================
SELECT 'collection' AS metric,
       (regexp_match(content, 'collection: ([^\r\n]+)'))[1] AS collection,
       count(*) AS cnt
FROM "KnowledgeBaseArticle"
WHERE "deletedAt" IS NULL
  AND content LIKE '%NETOPS_AI_SOURCE_METADATA%'
GROUP BY collection
ORDER BY cnt DESC;

COMMIT;