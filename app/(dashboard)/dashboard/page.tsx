import Link from "next/link";
import { getCurrentUser } from "@/lib/dal";

export default async function DashboardPage() {
  const user = await getCurrentUser();

  const modules = [
    {
      name: "Troubleshooting Cases",
      href: "/cases",
      available: true,
      description: "Create and work network troubleshooting sessions.",
    },
    {
      name: "Knowledge Base",
      href: "#",
      available: false,
      description: "Search resolved cases and reusable articles.",
    },
    {
      name: "Admin",
      href: "/admin",
      available: user.role === "ADMIN",
      description: "Manage users and reference data.",
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Welcome, {user.name}</h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Signed in as <span className="font-medium">{user.email}</span> · role {user.role}
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((moduleItem) => (
          <div
            key={moduleItem.name}
            className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
          >
            <h2 className="font-medium text-zinc-900 dark:text-zinc-50">{moduleItem.name}</h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{moduleItem.description}</p>
            {moduleItem.available ? (
              <Link href={moduleItem.href} className="mt-3 inline-block text-sm font-medium text-blue-600 dark:text-blue-400">
                Open →
              </Link>
            ) : (
              <span className="mt-3 inline-block text-xs font-medium uppercase tracking-wide text-zinc-400">
                Coming soon
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
