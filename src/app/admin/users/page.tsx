import Link from "next/link";
import { desc, ilike, or } from "drizzle-orm";
import { db, t } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { Pager } from "@/components/server";

const PER = 50;
export default async function Users({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  await requireAdmin();
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, Number(sp.page) || 1);
  const rows = await db
    .select()
    .from(t.users)
    .where(q ? or(ilike(t.users.name, `%${q}%`), ilike(t.users.mobile, `%${q}%`), ilike(t.users.email, `%${q}%`)) : undefined)
    .orderBy(desc(t.users.createdAt))
    .limit(PER + 1)
    .offset((page - 1) * PER);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="h1">Users & credits</h1>
        <a className="btn-outline btn-sm" href="/api/admin/export?type=users">Export CSV</a>
      </div>
      <form className="flex gap-2">
        <input name="q" defaultValue={q} placeholder="Name, mobile or email" className="input w-72" />
        <button className="btn-primary">Search</button>
      </form>
      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>Name</th><th>Mobile</th><th>Email</th><th>Role</th><th>Status</th><th className="text-right">Credits</th><th>Joined</th><th>Last active</th></tr></thead>
          <tbody>
            {rows.slice(0, PER).map((u) => (
              <tr key={u.id}>
                <td><Link className="link" href={`/admin/users/${u.id}`}>{u.name}</Link></td>
                <td>{u.mobile} {u.mobileVerified && <span className="text-green-700">✓</span>}</td>
                <td>{u.email}</td>
                <td>{u.role}</td>
                <td className={u.status === "ACTIVE" ? "" : "text-red-700"}>{u.status}</td>
                <td className="text-right">{u.credits}</td>
                <td>{u.createdAt.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}</td>
                <td>{u.lastActiveAt?.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={page} pages={rows.length > PER ? page + 1 : page} base={new URLSearchParams({ q })} />
    </div>
  );
}
