import { notFound } from "next/navigation";
import { requireRole } from "@/lib/dal";
import { getArticleDetail } from "@/lib/data/kb";
import { getVendorsWithDeviceTypes, getTechnologies } from "@/lib/data/reference";
import { EditArticleForm } from "./edit-article-form";

export default async function EditArticlePage({ params }: { params: Promise<{ articleId: string }> }) {
  await requireRole(["ENGINEER", "ADMIN"]);
  const { articleId } = await params;

  const [article, vendors, technologies] = await Promise.all([
    getArticleDetail(articleId),
    getVendorsWithDeviceTypes(),
    getTechnologies(),
  ]);

  if (!article) {
    notFound();
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Edit Article</h1>
      <EditArticleForm article={article} vendors={vendors} technologies={technologies} />
    </div>
  );
}
