import "server-only";
import { prisma } from "../db";
import { slugify } from "../slug";

const BATCH_SIZE = 100;

function metadataValue(content: string, key: string): string | null {
  const match = content.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  return match?.[1]?.trim() || null;
}

function categoryName(category: string): string {
  return category
    .replace(/^\d+[\s_-]*/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim() || "Uncategorized";
}

export async function organizeImportedDrafts() {
  const articles = await prisma.knowledgeBaseArticle.findMany({
    where: {
      deletedAt: null,
      status: "DRAFT",
      technologyId: null,
      content: { contains: "NETOPS_AI_SOURCE_METADATA" },
    },
    select: { id: true, content: true },
    orderBy: { id: "asc" },
    take: BATCH_SIZE,
  });
  const categorized = articles
    .map((article) => ({ ...article, category: metadataValue(article.content, "category") }))
    .filter((article): article is typeof article & { category: string } => Boolean(article.category));
  const categories = [...new Set(categorized.map((article) => article.category))];
  const technologies = await Promise.all(
    categories.map((category) => {
      const slug = slugify(category) || "uncategorized";
      return prisma.technology.upsert({
        where: { slug },
        update: {},
        create: { slug, name: categoryName(category) },
        select: { id: true },
      });
    }),
  );
  const technologyByCategory = new Map(categories.map((category, index) => [category, technologies[index].id]));
  await Promise.all(
    categorized.map((article) =>
      prisma.knowledgeBaseArticle.update({
        where: { id: article.id },
        data: { technologyId: technologyByCategory.get(article.category) },
      }),
    ),
  );
  const remaining = await prisma.knowledgeBaseArticle.count({
    where: {
      deletedAt: null,
      status: "DRAFT",
      technologyId: null,
      content: { contains: "NETOPS_AI_SOURCE_METADATA" },
    },
  });
  return { organized: categorized.length, skipped: articles.length - categorized.length, remaining };
}