import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, t } from "@/db";
import { requireStaff } from "@/lib/auth";
import { pickL } from "@/lib/i18n";
import { Flash } from "@/components/server";
import { resolveReportAction, saveReasonAction } from "../actions";
import { Check, L10nInputs } from "../_components";

export default async function Reports({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const admin = await requireStaff();
  const status = sp.status ?? "OPEN";
  const reasons = await db.select().from(t.reportReasons).orderBy(asc(t.reportReasons.order));
  const reporter = alias(t.users, "reporter");
  const rows = await db
    .select({ r: t.reports, p: t.profiles, by: reporter })
    .from(t.reports)
    .innerJoin(t.profiles, eq(t.profiles.id, t.reports.profileId))
    .innerJoin(reporter, eq(reporter.id, t.reports.reporterId))
    .where(eq(t.reports.status, status))
    .orderBy(desc(t.reports.createdAt))
    .limit(100);

  return (
    <div className="space-y-4">
      <h1 className="h1">Reports: spam, fake profiles & bad behaviour</h1>
      <Flash sp={sp} />
      <div className="flex gap-2">
        {["OPEN", "ACTIONED", "DISMISSED"].map((x) => <Link key={x} href={`?status=${x}`} className={x === status ? "btn-maroon btn-sm" : "btn-outline btn-sm"}>{x}</Link>)}
      </div>
      <div className="space-y-3">
        {rows.map(({ r, p, by }) => (
          <div key={r.id} className="card p-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="badge bg-red-100 text-red-700">{pickL(reasons.find((x) => x.key === r.reasonKey)?.label, "en") || r.reasonKey}</span>
              <Link className="link font-semibold" href={`/p/${p.code}`} target="_blank">{p.fullName} ({p.code})</Link>
              <span className="text-stone-500">reported by <Link className="link" href={`/admin/users/${by.id}`}>{by.name}</Link> · {r.createdAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</span>
            </div>
            {r.details && <p className="mt-2 rounded bg-stone-50 p-2">{r.details}</p>}
            {r.adminNote && <p className="mt-2 text-stone-500">Admin note: {r.adminNote}</p>}
            {r.status === "OPEN" && (
              <form action={resolveReportAction} className="mt-3 flex flex-wrap gap-2">
                <input type="hidden" name="rid" value={r.id} />
                <input name="note" placeholder="Internal note" className="input w-56 py-1 text-xs" />
                <button name="op" value="dismiss" className="btn-outline btn-sm">Dismiss</button>
                <button name="op" value="warn" className="btn-outline btn-sm">Mark actioned</button>
                <button name="op" value="hide_profile" className="btn-maroon btn-sm">Hide profile</button>
                {admin.role === "ADMIN" && <button name="op" value="suspend_user" className="btn-danger btn-sm">Suspend account</button>}
              </form>
            )}
          </div>
        ))}
        {rows.length === 0 && <div className="card p-10 text-center muted">No reports</div>}
      </div>

      {admin.role === "ADMIN" && (
        <section className="card space-y-3 p-4">
          <h2 className="h2">Report reasons shown to members</h2>
          {reasons.map((r) => (
            <details key={r.id} className="rounded border border-stone-200 p-2">
              <summary className="cursor-pointer text-sm">{pickL(r.label, "en")} {!r.active && <span className="badge bg-stone-100">inactive</span>}</summary>
              <form action={saveReasonAction} className="mt-2 space-y-2">
                <input type="hidden" name="rid" value={r.id} />
                <L10nInputs prefix="label" value={r.label} label="Label" required />
                <div className="flex items-center gap-4"><Check name="active" label="Active" checked={r.active} /><input name="order" type="number" defaultValue={r.order} className="input w-24" /><button className="btn-primary btn-sm">Save</button></div>
              </form>
            </details>
          ))}
          <details className="rounded border border-dashed border-stone-300 p-2">
            <summary className="cursor-pointer text-sm font-medium">+ Add reason</summary>
            <form action={saveReasonAction} className="mt-2 space-y-2">
              <L10nInputs prefix="label" label="Label" required />
              <div className="flex items-center gap-4"><Check name="active" label="Active" checked /><input name="order" type="number" defaultValue={reasons.length} className="input w-24" /><button className="btn-primary btn-sm">Add</button></div>
            </form>
          </details>
        </section>
      )}
    </div>
  );
}
