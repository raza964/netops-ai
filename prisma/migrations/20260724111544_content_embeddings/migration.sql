-- CreateEnum
CREATE TYPE "EmbeddingSourceType" AS ENUM ('KB_ARTICLE', 'COMMAND_CATALOG_ENTRY');

-- CreateTable
CREATE TABLE "ContentEmbedding" (
    "id" TEXT NOT NULL,
    "sourceType" "EmbeddingSourceType" NOT NULL,
    "kbArticleId" TEXT,
    "commandId" TEXT,
    "content" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "embedding" DOUBLE PRECISION[],
    "model" TEXT NOT NULL,
    "dimensions" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentEmbedding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContentEmbedding_kbArticleId_key" ON "ContentEmbedding"("kbArticleId");

-- CreateIndex
CREATE UNIQUE INDEX "ContentEmbedding_commandId_key" ON "ContentEmbedding"("commandId");

-- CreateIndex
CREATE INDEX "ContentEmbedding_sourceType_idx" ON "ContentEmbedding"("sourceType");

-- CreateIndex
CREATE INDEX "ContentEmbedding_contentHash_idx" ON "ContentEmbedding"("contentHash");

-- AddForeignKey
ALTER TABLE "ContentEmbedding" ADD CONSTRAINT "ContentEmbedding_kbArticleId_fkey" FOREIGN KEY ("kbArticleId") REFERENCES "KnowledgeBaseArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentEmbedding" ADD CONSTRAINT "ContentEmbedding_commandId_fkey" FOREIGN KEY ("commandId") REFERENCES "CommandCatalogEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
