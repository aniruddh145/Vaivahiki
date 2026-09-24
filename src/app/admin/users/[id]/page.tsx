import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db, t } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { rupees } from "@/lib/services";
import { Flash } from "@/components/server";
import { adminUserAction } from "../../actions";

export default async function UserDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  await requireAdmin();
  const [u] = await db.select().from(t.users).where(eq(t.users.id, id));
  if (!u) notFound();
  const [profiles, ledger, orders] = await Promise.all([
    db.select().from(t.profiles).where(eq(t.profiles.userId, id)),
    db.select().from(t.creditLedger).where(eq(t.creditLedger.userId, id)).orderBy(desc(t.creditLedger.createdAt)).limit(100),
    db.select().from(t.paymentOrders).where(eq(t.paymentOrders.userId, id)).orderBy(desc(t.paymentOrders.createdAt)).limit(50),
  ]);
  return (
    <div className="space-y-4">
      <Link href="/admin/users" className="link text-sm">← Users</Link>
      <h1 className="h1">{u.name}</h1>
      <Flash sp={sp} />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card space-y-1 p-4 text-sm">
          <div>Mobile: <b>{u.mobile}</b> {u.mobileVerified ? "✓ verified" : "(not verified)"}</div>
          <div>Email: {u.email ?? "—"}</div>
          <div>Role: {u.role} · Status: {u.status}</div>
          <div>Credits: <b className="text-lg">{u.credits}</b></div>
          <div>Joined: {u.createdAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} · Last login: {u.lastLoginAt?.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) ?? "—"}</div>
          <div>Billing: {u.billingName} {u.billingState} {u.gstin}</div>
          <div className="pt-2">Profiles: {profiles.map((p) => <Link key={p.id} className="link mr-2" href={`/p/${p.code}`} target="_blank">{p.code} ({p.status})</Link>)}</div>
        </div>
        <div className="card space-y-3 p-4 text-sm">
          <form action={adminUserAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="rid" value={u.id} /><input type="hidden" name="op" value="credits" />
            <div><label className="label">Add / remove credits</label><input name="delta" type="number" className="input w-28" placeholder="+5 or -2" /></div>
            <select name="reason" className="input w-auto"><option value="ADMIN_ADJUST">Adjustment</option><option value="REFUND">Refund</option></select>
            <input name="note" className="input w-40" placeholder="Note (e.g. cash paid)" />
            <button className="btn-primary btn-sm">Apply</button>
          </form>
          <form action={adminUserAction} className="flex items-end gap-2">
            <input type="hidden" name="rid" value={u.id} /><input type="hidden" name="op" value="status" />
            <div><label className="label">Account status</label>
              <select name="status" defaultValue={u.status} className="input w-auto"><option>ACTIVE</option><option>SUSPENDED</option><option>BANNED</option></select></div>
            <button className="btn-outline btn-sm">Update</button>
          </form>
          <form action={adminUserAction} className="flex items-end gap-2">
            <input type="hidden" name="rid" value={u.id} /><input type="hidden" name="op" value="role" />
            <div><label className="label">Role</label>
              <select name="role" defaultValue={u.role} className="input w-auto"><option>USER</option><option>MODERATOR</option><option>ADMIN</option></select></div>
            <button className="btn-outline btn-sm">Update</button>
          </form>
          <form action={adminUserAction} className="flex items-end gap-2">
            <input type="hidden" name="rid" value={u.id} /><input type="hidden" name="op" value="password" />
            <div><label className="label">Set new password</label><input name="password" className="input w-44" minLength={6} /></div>
            <button className="btn-outline btn-sm">Set</button>
          </form>
          <form action={adminUserAction}>
            <input type="hidden" name="rid" value={u.id} /><input type="hidden" name="op" value="verifyMobile" />
            <button className="btn-ghost btn-sm">{u.mobileVerified ? "Mark mobile as NOT verified" : "Mark mobile as verified"}</button>
          </form>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card overflow-x-auto">
          <div className="p-3 font-medium">Credit ledger</div>
          <table className="tbl">
            <thead><tr><th>Date</th><th>Reason</th><th className="text-right">Δ</th><th className="text-right">Bal</th></tr></thead>
            <tbody>{ledger.map((l) => <tr key={l.id}><td>{l.createdAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</td><td>{l.reason} {l.note}</td><td className="text-right">{l.delta}</td><td className="text-right">{l.balanceAfter}</td></tr>)}</tbody>
          </table>
        </div>
        <div className="card overflow-x-auto">
          <div className="p-3 font-medium">Payments</div>
          <table className="tbl">
            <thead><tr><th>Date</th><th>Package</th><th className="text-right">Total</th><th>Status</th></tr></thead>
            <tbody>{orders.map((o) => <tr key={o.id}><td>{o.createdAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</td><td>{o.packageName}</td><td className="text-right">{rupees(o.totalPaise)}</td><td>{o.status}</td></tr>)}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
