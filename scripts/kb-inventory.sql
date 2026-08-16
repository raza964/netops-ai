-- KB Inventory — Read-Only Production Analysis
-- Run inside Neon Console or psql with: BEGIN TRANSACTION READ ONLY; ... COMMIT;
-- No writes, no role creation, no application endpoints.

BEGIN TRANSACTION READ ONLY;

-- =====================================================================
-- SECTION 1: SUMMARY COUNTS
-- =====================================================================

-- Total records with NETOPS_AI_SOURCE_METADATA
SELECT 'total_records' AS metric, count(*) AS value
FROM "KnowledgeBaseArticle"
WHERE "deletedAt" IS NULL
  AND content LIKE '%NETOPS_AI_SOURCE_METADATA%';

-- Records missing metadata block
SELECT 'missing_metadata' AS metric, count(*) AS value
FROM "KnowledgeBaseArticle"
WHERE "deletedAt" IS NULL
  AND content NOT LIKE '%NETOPS_AI_SOURCE_METADATA%';

-- =====================================================================
-- SECTION 2: COLLECTIONS
-- =====================================================================

SELECT 'collection' AS metric,
       (regexp_match(content, 'collection: ([^\r\n]+)'))[1] AS collection,
       count(*) AS value
FROM "KnowledgeBaseArticle"
WHERE "deletedAt" IS NULL
  AND content LIKE '%NETOPS_AI_SOURCE_METADATA%'
GROUP BY collection
ORDER BY value DESC;

-- =====================================================================
-- SECTION 3: CATEGORIES
-- =====================================================================

SELECT 'category' AS metric,
       (regexp_match(content, 'category: ([^\r\n]+)'))[1] AS category,
       count(*) AS value
FROM "KnowledgeBaseArticle"
WHERE "deletedAt" IS NULL
  AND content LIKE '%NETOPS_AI_SOURCE_METADATA%'
GROUP BY category
ORDER BY value DESC;

-- =====================================================================
-- SECTION 4: CURRENT TECHNOLOGY ASSIGNMENTS
-- =====================================================================

SELECT 'technology' AS metric,
       COALESCE(t.name || ' (' || t.slug || ')', 'NULL') AS technology,
       count(*) AS value
FROM "KnowledgeBaseArticle" a
LEFT JOIN "Technology" t ON a."technologyId" = t.id
WHERE a."deletedAt" IS NULL
  AND a.content LIKE '%NETOPS_AI_SOURCE_METADATA%'
GROUP BY technology
ORDER BY value DESC;

-- =====================================================================
-- SECTION 5: VENDOR ASSIGNMENT
-- =====================================================================

SELECT 'vendor_assignment' AS metric,
       CASE WHEN a."vendorId" IS NULL THEN 'NULL' ELSE 'SET' END AS vendor_state,
       count(*) AS value
FROM "KnowledgeBaseArticle" a
WHERE a."deletedAt" IS NULL
  AND a.content LIKE '%NETOPS_AI_SOURCE_METADATA%'
GROUP BY vendor_state;

-- =====================================================================
-- SECTION 6: SENSITIVITY DISTRIBUTION
-- =====================================================================

SELECT 'sensitivity' AS metric,
       (regexp_match(content, 'sensitivity: ([^\r\n]+)'))[1] AS sensitivity,
       count(*) AS value
FROM "KnowledgeBaseArticle"
WHERE "deletedAt" IS NULL
  AND content LIKE '%NETOPS_AI_SOURCE_METADATA%'
GROUP BY sensitivity
ORDER BY value DESC;

-- =====================================================================
-- SECTION 7: DUPLICATE SHA256 GROUPS
-- =====================================================================

SELECT 'duplicate_sha256' AS metric,
       (regexp_match(content, 'sha256: ([^\r\n]+)'))[1] AS sha256,
       count(*) AS value
FROM "KnowledgeBaseArticle"
WHERE "deletedAt" IS NULL
  AND content LIKE '%NETOPS_AI_SOURCE_METADATA%'
GROUP BY sha256
HAVING count(*) > 1
ORDER BY value DESC;

-- =====================================================================
-- SECTION 8: DUPLICATE (COLLECTION, SOURCE_PATH) GROUPS
-- =====================================================================

SELECT 'duplicate_collection_sourcepath' AS metric,
       (regexp_match(content, 'collection: ([^\r\n]+)'))[1] AS collection,
       (regexp_match(content, 'source_path: ([^\r\n]+)'))[1] AS source_path,
       count(*) AS value
FROM "KnowledgeBaseArticle"
WHERE "deletedAt" IS NULL
  AND content LIKE '%NETOPS_AI_SOURCE_METADATA%'
GROUP BY collection, source_path
HAVING count(*) > 1
ORDER BY value DESC;

-- =====================================================================
-- SECTION 9: SAME SHA256 UNDER DIFFERENT SOURCE PATHS
-- =====================================================================

WITH sha_source AS (
  SELECT
    (regexp_match(content, 'sha256: ([^\r\n]+)'))[1] AS sha256,
    (regexp_match(content, 'source_path: ([^\r\n]+)'))[1] AS source_path,
    count(*) AS cnt
  FROM "KnowledgeBaseArticle"
  WHERE "deletedAt" IS NULL
    AND content LIKE '%NETOPS_AI_SOURCE_METADATA%'
  GROUP BY sha256, source_path
),
sha_multi_source AS (
  SELECT sha256, count(DISTINCT source_path) AS path_count
  FROM sha_source
  GROUP BY sha256
  HAVING count(DISTINCT source_path) > 1
)
SELECT 'sha256_multi_source' AS metric,
       s.sha256,
       s.source_path,
       s.cnt
FROM sha_source s
JOIN sha_multi_source m ON s.sha256 = m.sha256
ORDER BY s.sha256, s.source_path;

-- =====================================================================
-- SECTION 10: METADATA EXPORT (for CSV/JSON)
-- =====================================================================
-- Use \copy to export:
-- \copy (
--   SELECT
--     a.id,
--     a.slug,
--     a.title,
--     a.status,
--     a."vendorId",
--     v.name AS vendor_name,
--     a."technologyId",
--     t.name AS technology_name,
--     a."createdAt",
--     a."updatedAt",
--     (regexp_match(a.content, 'collection: ([^\r\n]+)'))[1] AS collection,
--     (regexp_match(a.content, 'source_path: ([^\r\n]+)'))[1] AS source_path,
--     (regexp_match(a.content, 'sha256: ([^\r\n]+)'))[1] AS sha256,
--     (regexp_match(a.content, 'category: ([^\r\n]+)'))[1] AS category,
--     (regexp_match(a.content, 'sensitivity: ([^\r\n]+)'))[1] AS sensitivity,
--     (regexp_match(a.content, 'review_status: ([^\r\n]+)'))[1] AS review_status,
--     (regexp_match(a.content, 'publication_status: ([^\r\n]+)'))[1] AS publication_status
--   FROM "KnowledgeBaseArticle" a
--   LEFT JOIN "Vendor" v ON a."vendorId" = v.id
--   LEFT JOIN "Technology" t ON a."technologyId" = t.id
--   WHERE a."deletedAt" IS NULL
--     AND a.content LIKE '%NETOPS_AI_SOURCE_METADATA%'
-- ) TO 'kb-inventory.csv' CSV HEADER;

-- Preview export row count
SELECT 'export_row_count' AS metric, count(*) AS value
FROM "KnowledgeBaseArticle"
WHERE "deletedAt" IS NULL
  AND content LIKE '%NETOPS_AI_SOURCE_METADATA%';

COMMIT;