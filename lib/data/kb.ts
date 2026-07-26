import "server-only";
import { prisma } from "../db";
import { slugify } from "../slug";
import type { ArticleStatus } from "@prisma/client";

export type ArticleListFilter = {
  // Caller decides which statuses are visible for the current role (e.g. a
  // VIEWER only ever passes ["PUBLISHED"]) - the DAL does not enforce RBAC.
  statuses: ArticleStatus[];
  vendorId?: string;
  technologyId?: string;
  query?: string;
  page?: number;
  pageSize?: number;
};

export async function listArticles(filter: ArticleListFilter) {
  const page = filter.page ?? 1;
  const pageSize = filter.pageSize ?? 50;
  const where = {
      deletedAt: null,
      status: { in: filter.statuses },
      ...(filter.vendorId ? { vendorId: filter.vendorId } : {}),
      ...(filter.technologyId ? { technologyId: filter.technologyId } : {}),
      ...(filter.query
        ? {
            OR: [
              { title: { contains: filter.query, mode: "insensitive" as const } },
              { summary: { contains: filter.query, mode: "insensitive" as const } },
              { content: { contains: filter.query, mode: "insensitive" as const } },
            ],
          }
        : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.knowledgeBaseArticle.findMany({
      where,
      select: {
      id: true,
      title: true,
      summary: true,
      status: true,
      createdAt: true,
      vendor: { select: { name: true } },
      technology: { select: { name: true } },
      createdBy: { select: { name: true } },
    },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.knowledgeBaseArticle.count({ where }),
  ]);
  return { items, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getArticleDetail(articleId: string) {
  return prisma.knowledgeBaseArticle.findFirst({
    where: { id: articleId, deletedAt: null },
    include: {
      vendor: true,
      technology: true,
      createdBy: { select: { id: true, name: true } },
      updatedBy: { select: { id: true, name: true } },
      sourceCase: { select: { id: true, title: true } },
    },
  });
}

async function generateUniqueSlug(title: string): Promise<string> {
  const base = slugify(title) || "article";
  let candidate = base;
  let suffix = 1;
  while (await prisma.knowledgeBaseArticle.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
  return candidate;
}

export async function createArticle(input: {
  title: string;
  summary: string;
  content: string;
  vendorId: string | null;
  technologyId: string | null;
  sourceCaseId: string | null;
  createdById: string;
}) {
  const slug = await generateUniqueSlug(input.title);
  return prisma.knowledgeBaseArticle.create({ data: { ...input, slug } });
}

/**
 * Slug is intentionally immutable once created, so existing links to an
 * article keep working even after its title is edited.
 */
export async function updateArticle(input: {
  articleId: string;
  title: string;
  summary: string;
  content: string;
  vendorId: string | null;
  technologyId: string | null;
  updatedById: string;
}) {
  const { articleId, ...data } = input;
  return prisma.knowledgeBaseArticle.update({ where: { id: articleId }, data });
}

export async function publishArticle(articleId: string) {
  return prisma.knowledgeBaseArticle.update({ where: { id: articleId }, data: { status: "PUBLISHED" } });
}

export async function archiveArticle(articleId: string) {
  return prisma.knowledgeBaseArticle.update({ where: { id: articleId }, data: { status: "ARCHIVED" } });
}

export async function softDeleteArticle(articleId: string) {
  return prisma.knowledgeBaseArticle.update({ where: { id: articleId }, data: { deletedAt: new Date() } });
}
