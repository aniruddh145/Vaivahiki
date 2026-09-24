import Link from "next/link";
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { db, t } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { financialYear, rupees } from "@/lib/services";
import { Flash } from "@/components/server";
import { ConfirmButton } from "@/components/ui";
import { refundOrderAction } from "../actions";
import { Stat } from "../_components";

export default async function Finance({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  await requireAdmin();
  const fy = financialYear();
  const from = sp.from || `${fy.slice(0, 4)}-04-01`;
  const to = sp.to || new Date().toISOString().slice(0, 10);
  const fromD = new Date(from + "T00:00:00+05:30");
  const toD = new Date(new Date(to + "T00:00:00+05:30").getTime() + 86400_000);
  const status = sp.status ?? "";
  const range = and(gte(t.paymentOrders.createdAt, fromD), lt(t.paymentOrders.createdAt, toD));

  const [[tot], monthly, orders, ledgerSum] = await Promise.all([
    db.select({
      n: sql<number>`count(*)`, taxable: sql<number>`coalesce(sum(${t.paymentOrders.taxablePaise}),0)`,
      cgst: sql<number>`coalesce(sum(${t.paymentOrders.cgstPaise}),0)`, sgst: sql<number>`coalesce(sum(${t.paymentOrders.sgstPaise}),0)`,
      igst: sql<number>`coalesce(sum(${t.paymentOrders.igstPaise}),0)`, total: sql<number>`coalesce(sum(${t.paymentOrders.totalPaise}),0)`,
      credits: sql<number>`coalesce(sum(${t.paymentOrders.credits}),0)`,
    }).from(t.paymentOrders).where(and(range, eq(t.paymentOrders.status, "PAID"))),
    db.select({
      m: sql<string>`to_char(${t.paymentOrders.paidAt} at time zone 'Asia/Kolkata', 'YYYY-MM')`,
      n: sql<number>`count(*)`, taxable: sql<number>`sum(${t.paymentOrders.taxablePaise})`,
      tax: sql<number>`sum(${t.paymentOrders.cgstPaise} + ${t.paymentOrders.sgstPaise} + ${t.paymentOrders.igstPaise})`,
      total: sql<number>`sum(${t.paymentOrders.totalPaise})`,
    }).from(t.paymentOrders).where(and(range, eq(t.paymentOrders.status, "PAID"))).groupBy(sql`1`).orderBy(sql`1 desc`),
    db.select({ o: t.paymentOrders, u: t.users, inv: t.invoices }).from(t.paymentOrders)
      .innerJoin(t.users, eq(t.users.id, t.paymentOrders.userId))
      .leftJoin(t.invoices, eq(t.invoices.orderId, t.paymentOrders.id))
      .where(and(range, status ? eq(t.paymentOrders.status, status) : undefined))
      .orderBy(desc(t.paymentOrders.createdAt)).limit(300),
    db.select({ reason: t.creditLedger.reason, v: sql<number>`sum(${t.creditLedger.delta})`, n: sql<number>`count(*)` }).from(t.creditLedger)
      .where(and(gte(t.creditLedger.createdAt, fromD), lt(t.creditLedger.createdAt, toD))).groupBy(t.creditLedger.reason),
  ]);
  const q = `from=${from}&to=${to}`;

  return (
    <div className="space-y-5">
      <h1 className="h1">Payments, GST & audit reports</h1>
      <Flash sp={sp} />
      <form className="flex flex-wrap items-end gap-2">
        <div><label className="label">From</label><input type="date" name="from" defaultValue={from} className="input" /></div>
        <div><label className="label">To</label><input type="date" name="to" defaultValue={to} className="input" /></div>
        <div><label className="label">Status</label><select name="status" defaultValue={status} className="input"><option value="">All</option><option>PAID</option><option>CREATED</option><option>FAILED</option><option>REFUNDED</option></select></div>
        <button className="btn-primary">Apply</button>
      </form>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Paid orders" value={Number(tot.n)} />
        <Stat label="Gross collected" value={rupees(Number(tot.total))} />
        <Stat label="Taxable value" value={rupees(Number(tot.taxable))} />
        <Stat label="CGST" value={rupees(Number(tot.cgst))} />
        <Stat label="SGST" value={rupees(Number(tot.sgst))} />
        <Stat label="IGST" value={rupees(Number(tot.igst))} />
      </div>

      <div className="flex flex-wrap gap-2">
        <a className="btn-outline btn-sm" href={`/api/admin/export?type=orders&${q}`}>Download transactions CSV</a>
        <a className="btn-outline btn-sm" href={`/api/admin/export?type=invoices&${q}`}>Download invoice register (GST) CSV</a>
        <a className="btn-outline btn-sm" href={`/api/admin/export?type=ledger&${q}`}>Download credit ledger CSV</a>
        <a className="btn-outline btn-sm" href={`/api/admin/export?type=audit&${q}`}>Download activity log CSV</a>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card overflow-x-auto">
          <div className="p-3 font-medium">Month-wise</div>
          <table className="tbl">
            <thead><tr><th>Month</th><th className="text-right">Orders</th><th className="text-right">Taxable</th><th className="text-right">GST</th><th className="text-right">Total</th></tr></thead>
            <tbody>{monthly.map((m) => <tr key={m.m}><td>{m.m}</td><td className="text-right">{m.n}</td><td className="text-right">{rupees(Number(m.taxable))}</td><td className="text-right">{rupees(Number(m.tax))}</td><td className="text-right font-medium">{rupees(Number(m.total))}</td></tr>)}</tbody>
          </table>
        </div>
        <div className="card overflow-x-auto">
          <div className="p-3 font-medium">Credits movement (period)</div>
          <table className="tbl">
            <thead><tr><th>Type</th><th className="text-right">Entries</th><th className="text-right">Credits</th></tr></thead>
            <tbody>{ledgerSum.map((l) => <tr key={l.reason}><td>{l.reason}</td><td className="text-right">{l.n}</td><td className="text-right">{l.v}</td></tr>)}</tbody>
          </table>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <div className="p-3 font-medium">Transactions</div>
        <table className="tbl">
          <thead><tr><th>Date</th><th>Member</th><th>Package</th><th className="text-right">Total</th><th>Gateway</th><th>Status</th><th>Invoice</th><th></th></tr></thead>
          <tbody>
            {orders.map(({ o, u, inv }) => (
              <tr key={o.id}>
                <td className="whitespace-nowrap">{o.createdAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "short", timeStyle: "short" })}</td>
                <td><Link className="link" href={`/admin/users/${u.id}`}>{u.name}</Link><div className="text-xs text-stone-500">{u.mobile}</div></td>
                <td>{o.packageName} ({o.credits})</td>
                <td className="text-right">{rupees(o.totalPaise)}</td>
                <td className="text-xs">{o.gateway}<div className="text-stone-400">{o.gatewayPaymentId}</div></td>
                <td>{o.status}</td>
                <td>{inv && <Link className="link" href={`/invoices/${inv.id}`}>{inv.number}</Link>}</td>
                <td>{o.status === "PAID" && (
                  <form action={refundOrderAction}><input type="hidden" name="rid" value={o.id} /><ConfirmButton className="btn-ghost btn-sm text-red-600" message="Mark as refunded? Refund the money in the payment gateway first. Unused credits will be removed.">Refund</ConfirmButton></form>
                )}</td>
              </tr>
            ))}
            {orders.length === 0 && <tr><td colSpan={8} className="text-center muted">No transactions</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
