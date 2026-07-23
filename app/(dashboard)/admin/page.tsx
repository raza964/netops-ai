import { requireRole } from "@/lib/dal";
import { listUsers } from "@/lib/data/users";

export default async function AdminPage() {
  await requireRole(["ADMIN"]);
  const users = await listUsers();

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Users</h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Admin-only view of registered users.</p>

      <div className="mt-6 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Email</th>
              <th className="px-4 py-2 font-medium">Role</th>
              <th className="px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {users.map((listedUser) => (
              <tr key={listedUser.id}>
                <td className="px-4 py-2 text-zinc-900 dark:text-zinc-50">{listedUser.name}</td>
                <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">{listedUser.email}</td>
                <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">{listedUser.role}</td>
                <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                  {listedUser.isActive ? "Active" : "Disabled"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
