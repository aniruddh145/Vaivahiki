import { desc, eq, ilike } from "drizzle-orm";
import { db, t } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { Pager } from "@/components/server";

const PER = 100;
export default async function Audit({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  await requireAdmin();
  const page = Math.max(1, Number(sp.page) || 1);
  const q = (sp.q ?? "").trim();
  const rows = await db
    .select({ a: t.auditLogs, name: t.users.name })
    .from(t.auditLogs)
    .leftJoin(t.users, eq(t.users.id, t.auditLogs.actorId))
    .where(q ? ilike(t.auditLogs.action, `%${q}%`) : undefined)
    .orderBy(desc(t.auditLogs.createdAt))
    .limit(PER + 1)
    .offset((page - 1) * PER);
  return (
    <div className="space-y-4">
      <h1 className="h1">Activity log</h1>
      <p className="muted">Every admin action, payment, credit adjustment and contact unlock is recorded here.</p>
      <form className="flex gap-2"><input name="q" defaultValue={q} placeholder="Filter by action e.g. payment, credits, profile.approve" className="input w-80" /><button className="btn-primary">Filter</button></form>
      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Target</th><th>Details</th></tr></thead>
          <tbody>
            {rows.slice(0, PER).map(({ a, name }) => (
              <tr key={a.id}>
                <td className="whitespace-nowrap">{a.createdAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</td>
                <td>{name ?? "system"}</td>
                <td><code>{a.action}</code></td>
                <td className="text-xs">{a.entity} {a.entityId}</td>
                <td className="max-w-md truncate text-xs text-stone-500">{a.data ? JSON.stringify(a.data) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={page} pages={rows.length > PER ? page + 1 : page} base={new URLSearchParams({ q })} />
    </div>
  );
}
