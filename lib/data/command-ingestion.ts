import "server-only";
import { prisma } from "../db";
import { commandIdentity, extractCommandsFromMarkdown } from "../command-extraction";
import { slugify } from "../slug";

const ARTICLE_BATCH_SIZE = 10;

function metadataValue(content: string, key: string): string | null {
  const match = content.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  return match?.[1]?.trim() || null;
}

async function persistExtractedCommand(
  command: ReturnType<typeof extractCommandsFromMarkdown>[number],
  createdById: string,
) {
  const vendor = await prisma.vendor.upsert({
    where: { slug: command.vendor.slug },
    update: {},
    create: command.vendor,
    select: { id: true },
  });
  const technology = await prisma.technology.upsert({
    where: { slug: command.technology.slug },
    update: {},
    create: command.technology,
    select: { id: true },
  });
  const deviceType = command.deviceType
    ? await prisma.deviceType.upsert({
        where: { vendorId_name: { vendorId: vendor.id, name: command.deviceType } },
        update: {},
        create: { vendorId: vendor.id, name: command.deviceType },
        select: { id: true },
      })
    : null;
  const identity = commandIdentity(command.vendor.slug, command.commandText);
  const slug = `imported-command-${identity}`;
  const existing = await prisma.commandCatalogEntry.findFirst({
    where: {
      deletedAt: null,
      OR: [
        { slug },
        { vendorId: vendor.id, commandText: { equals: command.commandText, mode: "insensitive" } },
      ],
    },
    select: { id: true },
  });
  const data = {
    title: command.title,
    commandText: command.commandText,
    description: command.description,
    purpose: command.purpose,
    expectedOutput: null,
    vendorId: vendor.id,
    deviceTypeId: deviceType?.id ?? null,
    technologyId: technology.id,
    riskLevel: command.riskLevel,
    isConfigChange: command.isConfigChange,
    status: "DRAFT" as const,
    deletedAt: null,
  };
  if (existing) {
    await prisma.commandCatalogEntry.update({
      where: { id: existing.id },
      data: { ...data, updatedById: createdById },
    });
    return "updated" as const;
  }
  await prisma.commandCatalogEntry.create({
    data: { ...data, slug: slugify(slug), createdById },
  });
  return "created" as const;
}

export async function ingestCommandsFromArticles(input: {
  createdById: string;
  articleIds?: string[];
  cursor?: string | null;
}) {
  const articles = await prisma.knowledgeBaseArticle.findMany({
    where: {
      deletedAt: null,
      content: { contains: "NETOPS_AI_SOURCE_METADATA" },
      ...(input.articleIds?.length ? { id: { in: input.articleIds } } : input.cursor ? { id: { gt: input.cursor } } : {}),
    },
    select: { id: true, title: true, content: true },
    orderBy: { id: "asc" },
    take: input.articleIds?.length ? Math.min(input.articleIds.length, 20) : ARTICLE_BATCH_SIZE,
  });
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const failed: Array<{ article: string; error: string }> = [];

  for (const article of articles) {
    const commands = extractCommandsFromMarkdown({
      title: article.title,
      content: article.content.replace(/<!-- NETOPS_AI_SOURCE_METADATA[\s\S]*?END_NETOPS_AI_SOURCE_METADATA -->/, ""),
      sourcePath: metadataValue(article.content, "source_path"),
    });
    if (commands.length === 0) skipped += 1;
    for (const command of commands) {
      try {
        const result = await persistExtractedCommand(command, input.createdById);
        if (result === "created") created += 1;
        else updated += 1;
      } catch (error) {
        failed.push({
          article: article.title,
          error: error instanceof Error ? error.message : "Unknown command ingestion error",
        });
      }
    }
  }

  const nextCursor = articles.at(-1)?.id ?? null;
  const hasMore =
    !input.articleIds?.length &&
    articles.length === ARTICLE_BATCH_SIZE &&
    Boolean(
      await prisma.knowledgeBaseArticle.findFirst({
        where: {
          deletedAt: null,
          content: { contains: "NETOPS_AI_SOURCE_METADATA" },
          id: { gt: nextCursor ?? "" },
        },
        select: { id: true },
      }),
    );
  return { scanned: articles.length, created, updated, skipped, failed, nextCursor, hasMore };
}
