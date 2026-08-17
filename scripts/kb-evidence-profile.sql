-- KB Source Path Evidence Profile — Read-Only Production Analysis
-- Each query is fully self-contained with its own CTEs (PostgreSQL statement-scoped).
-- Validated for PostgreSQL syntax. No writes, no classification, no article bodies.
-- PRODUCTION EXECUTION: Wrap entire file in:
--   BEGIN TRANSACTION READ ONLY;
--   [paste this file]
--   COMMIT;

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
    id,
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
-- 2. Second-level segments (lvl2)
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
-- 3. Third-level segments (lvl3)
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
-- 3. Normalized tokens with counts (source_path + filename + title)
-- =====================================================================
WITH meta AS (
  SELECT id,
    (regexp_match(content, 'source_path: ([^\r\n]+)'))[1] AS source_path,
    title
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
  SELECT id, regexp_split_to_table(lower(lvl1), '[_\-]+') AS token FROM path_parts WHERE lvl1 IS NOT NULL
  UNION ALL SELECT id, regexp_split_to_table(lower(lvl2), '[_\-]+') FROM path_parts WHERE lvl2 IS NOT NULL
  UNION ALL SELECT id, regexp_split_to_table(lower(lvl3), '[_\-]+') FROM path_parts WHERE lvl3 IS NOT NULL
  UNION ALL SELECT id, regexp_split_to_table(lower(filename), '[_\-\.]+') FROM path_parts
  UNION ALL SELECT id, regexp_split_to_table(lower(title), '[_\-\. ]+') FROM path_parts
),
-- Aggregate tokens per article ID to get the full token sequence
per_id_tokens AS (
  SELECT id,
    array_agg(token ORDER BY array_position ARRAY['lvl1','lvl2','lvl3','filename','title']) AS tokens,
    array_length(array_agg(token ORDER BY array_position ARRAY['lvl1','lvl2','lvl3','filename','title']), 1) AS n_tokens
  FROM (
    SELECT id, token,
      array_position ARRAY['lvl1','lvl2','lvl3','filename','title'] AS position
    FROM norm_tokens
  ) t
  GROUP BY id
),
-- Generate bigrams from the token sequence
bigrams AS (
  SELECT id,
    tokens[1] AS unigram,
    CASE WHEN n_tokens > 1 THEN tokens[1] || ' ' || tokens[2] END AS bigram
  FROM per_id_tokens
),
-- Dictionary with unigram and bigram aliases
-- Unigram aliases: iosxe→ios-xe, iosxr→ios-xr, sdwan→sdwan
-- Bigram aliases: iosxe→ios-xe (via bigram ios xe), iosxr→ios-xr (via bigram ios xr), sdwan→sdwan (via bigram sd wan)
dict AS (
  SELECT 'ios-xe' AS alias, unnest(ARRAY['iosxe', 'ios xe']) AS token UNION ALL
  SELECT 'ios-xr', unnest(ARRAY['iosxr', 'ios xr']) UNION ALL
  SELECT 'sdwan', unnest(ARRAY['sdwan', 'sd wan']) UNION ALL
  -- Identity mappings
  SELECT 'ios', unnest(ARRAY['ios']) UNION ALL
  SELECT 'junos', unnest(ARRAY['junos']) UNION ALL
  SELECT 'nxos', unnest(ARRAY['nxos']) UNION ALL
  SELECT 'fortios', unnest(ARRAY['fortios']) UNION ALL
  SELECT 'panos', unnest(ARRAY['panos']) UNION ALL
  SELECT 'vmanage', unnest(ARRAY['vmanage']) UNION ALL
  SELECT 'vsmart', unnest(ARRAY['vsmart']) UNION ALL
  SELECT 'vbond', unnest(ARRAY['vbond']) UNION ALL
  SELECT 'catalyst', unnest(ARRAY['catalyst']) UNION ALL
  SELECT 'nexus', unnest(ARRAY['nexus']) UNION ALL
  SELECT 'asr', unnest(ARRAY['asr']) UNION ALL
  SELECT 'isr', unnest(ARRAY['isr']) UNION ALL
  SELECT 'csr', unnest(ARRAY['csr']) UNION ALL
  SELECT 'qfx', unnest(ARRAY['qfx']) UNION ALL
  SELECT 'ptx', unnest(ARRAY['ptx']) UNION ALL
  SELECT 'ccr', unnest(ARRAY['ccr']) UNION ALL
  SELECT 'crs', unnest(ARRAY['crs']) UNION ALL
  SELECT 'fortigate', unnest(ARRAY['fortigate']) UNION ALL
  SELECT 'fortiswitch', unnest(ARRAY['fortiswitch']) UNION ALL
  SELECT 'fortiap', unnest(ARRAY['fortiap'])
),
-- Match each article's token sequence against the dictionary
matched AS (
  SELECT id,
    CASE
      -- Unigram matches for single-token articles
      WHEN n_tokens = 1 AND tokens[1] IN (SELECT alias FROM dict WHERE alias IN ('iosxe', 'iosxr', 'sdwan')) THEN
        (SELECT alias FROM dict WHERE token = tokens[1] AND alias IS NOT NULL LIMIT 1)
      -- Two-token sequences with bigram matching
      WHEN n_tokens = 2 THEN
        CASE
          WHEN tokens[1] = 'ios' AND tokens[2] = 'xe' THEN 'ios-xe'
          WHEN tokens[1] = 'ios' AND tokens[2] = 'xr' THEN 'ios-xr'
          WHEN tokens[1] = 'sd' AND tokens[2] = 'wan' THEN 'sdwan'
          WHEN tokens[1] || ' ' || tokens[2] IN (SELECT alias FROM dict) THEN (SELECT alias FROM dict WHERE token = tokens[1] || ' ' || tokens[2] LIMIT 1)
          ELSE tokens[1]  -- fallback to first token
        END
      -- Single token: keep as-is (ios stays ios, junos stays junos)
      WHEN n_tokens = 1 THEN tokens[1]
      ELSE tokens[1]
    END AS canonical_token
  FROM per_id_tokens
)
SELECT 'platform_token' AS metric, canonical_token AS token, count(DISTINCT id) AS article_cnt
FROM matched
WHERE canonical_token IS NOT NULL
GROUP BY canonical_token ORDER BY article_cnt DESC;

-- =====================================================================
-- 12. Explicit platform tokens (negative evidence - identical CTE chain)
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
  SELECT id, regexp_split_to_table(lower(lvl1), '[_\-]+') AS token FROM path_parts WHERE lvl1 IS NOT NULL
  UNION ALL SELECT id, regexp_split_to_table(lower(lvl2), '[_\-]+') FROM path_parts WHERE lvl2 IS NOT NULL
  UNION ALL SELECT id, regexp_split_to_table(lower(lvl3), '[_\-]+') FROM path_parts WHERE lvl3 IS NOT NULL
  UNION ALL SELECT id, regexp_split_to_table(lower(filename), '[_\-\.]+') FROM path_parts
  UNION ALL SELECT id, regexp_split_to_table(lower(title), '[_\-\. ]+') FROM path_parts
),
per_id_tokens AS (
  SELECT id,
    array_agg(token ORDER BY array_position ARRAY['lvl1','lvl2','lvl3','filename','title']) AS tokens,
    array_length(array_agg(token ORDER BY array_position ARRAY['lvl1','lvl2','lvl3','filename','title']), 1) AS n_tokens
  FROM (
    SELECT id, regexp_split_to_table(lower(lvl1), '[_\-]+') AS token FROM path_parts WHERE lvl1 IS NOT NULL
    UNION ALL SELECT id, regexp_split_to_table(lower(lvl2), '[_\-]+') FROM path_parts WHERE lvl2 IS NOT NULL
    UNION ALL SELECT id, regexp_split_to_table(lower(lvl3), '[_\-]+') FROM path_parts WHERE lvl3 IS NOT NULL
    UNION ALL SELECT id, regexp_split_to_table(lower(filename), '[_\-\.]+') FROM path_parts
    UNION ALL SELECT id, regexp_split_to_table(lower(title), '[_\-\. ]+') FROM path_parts
  ) t
  GROUP BY id
),
bigrams AS (
  SELECT id,
    tokens[1] AS unigram,
    CASE WHEN n_tokens > 1 THEN tokens[1] || ' ' || tokens[2] END AS bigram
  FROM per_id_tokens
),
dict AS (
  SELECT 'ios-xe' AS alias, unnest(ARRAY['iosxe', 'ios xe']) AS token UNION ALL
  SELECT 'ios-xr', unnest(ARRAY['iosxr', 'ios xr']) UNION ALL
  SELECT 'sdwan', unnest(ARRAY['sdwan', 'sd wan']) UNION ALL
  SELECT 'ios', unnest(ARRAY['ios']) UNION ALL
  SELECT 'junos', unnest(ARRAY['junos']) UNION ALL
  SELECT 'nxos', unnest(ARRAY['nxos']) UNION ALL
  SELECT 'fortios', unnest(ARRAY['fortios']) UNION ALL
  SELECT 'panos', unnest(ARRAY['panos']) UNION ALL
  SELECT 'vmanage', unnest(ARRAY['vmanage']) UNION ALL
  SELECT 'vsmart', unnest(ARRAY['vsmart']) UNION ALL
  SELECT 'vbond', unnest(ARRAY['vbond']) UNION ALL
  SELECT 'catalyst', unnest(ARRAY['catalyst']) UNION ALL
  SELECT 'nexus', unnest(ARRAY['nexus']) UNION ALL
  SELECT 'asr', unnest(ARRAY['asr']) UNION ALL
  SELECT 'isr', unnest(ARRAY['isr']) UNION ALL
  SELECT 'csr', unnest(ARRAY['csr']) UNION ALL
  SELECT 'qfx', unnest(ARRAY['qfx']) UNION ALL
  SELECT 'ptx', unnest(ARRAY['ptx']) UNION ALL
  SELECT 'ccr', unnest(ARRAY['ccr']) UNION ALL
  SELECT 'crs', unnest(ARRAY['crs']) UNION ALL
  SELECT 'fortigate', unnest(ARRAY['fortigate']) UNION ALL
  SELECT 'fortiswitch', unnest(ARRAY['fortiswitch']) UNION ALL
  SELECT 'fortiap', unnest(ARRAY['fortiap'])
),
matched AS (
  SELECT id,
    CASE
      WHEN n_tokens = 1 AND tokens[1] IN (SELECT alias FROM dict WHERE alias IN ('iosxe', 'iosxr', 'sdwan')) THEN
        (SELECT alias FROM dict WHERE token = tokens[1] AND alias IS NOT NULL LIMIT 1)
      WHEN n_tokens = 2 THEN
        CASE
          WHEN tokens[1] = 'ios' AND tokens[2] = 'xe' THEN 'ios-xe'
          WHEN tokens[1] = 'ios' AND tokens[2] = 'xr' THEN 'ios-xr'
          WHEN tokens[1] = 'sd' AND tokens[2] = 'wan' THEN 'sdwan'
          WHEN tokens[1] || ' ' || tokens[2] IN (SELECT alias FROM dict) THEN (SELECT alias FROM dict WHERE token = tokens[1] || ' ' || tokens[2] LIMIT 1)
          ELSE tokens[1]
        END
      WHEN n_tokens = 1 THEN tokens[1]
      ELSE tokens[1]
    END AS canonical_token
  FROM per_id_tokens
)
SELECT 'no_platform_token' AS metric, count(*) AS cnt
FROM matched
WHERE canonical_token IS NULL;

-- =====================================================================
-- 13. Validation: Total article count
-- =====================================================================
WITH meta AS (
  SELECT count(*) AS total_articles
  FROM "KnowledgeBaseArticle"
  WHERE "deletedAt" IS NULL AND content LIKE '%NETOPS_AI_SOURCE_METADATA%'
)
SELECT 'validation' AS metric, 'read_only' AS status, total_articles FROM meta;