import { and, asc, eq, gte, lt } from "drizzle-orm";
import { db, t } from "@/db";
import { getUser } from "@/lib/auth";

function csv(rows: (string | number | null | undefined)[][]) {
  return "﻿" + rows.map((r) => r.map((c) => {
    const s = c == null ? "" : String(c);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\n");
}
const rs = (p: number) => (p / 100).toFixed(2);
const d = (x: Date | null) => (x ? x.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "");

export async function GET(req: Request) {
  const u = await getUser();
  if (!u || u.role !== "ADMIN") return new Response("Forbidden", { status: 403 });
  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  const from = new Date((url.searchParams.get("from") || "2000-01-01") + "T00:00:00+05:30");
  const to = new Date(new Date((url.searchParams.get("to") || "2100-01-01") + "T00:00:00+05:30").getTime() + 86400_000);
  let rows: (string | number | null | undefined)[][] = [];

  if (type === "orders") {
    const data = await db.select({ o: t.paymentOrders, u: t.users }).from(t.paymentOrders).innerJoin(t.users, eq(t.users.id, t.paymentOrders.userId))
      .where(and(gte(t.paymentOrders.createdAt, from), lt(t.paymentOrders.createdAt, to))).orderBy(asc(t.paymentOrders.createdAt));
    rows = [["Order ID", "Created", "Paid", "Member", "Mobile", "Package", "Credits", "Taxable", "CGST", "SGST", "IGST", "Total", "Gateway", "Gateway order", "Payment ID", "Status"],
      ...data.map(({ o, u }) => [o.id, d(o.createdAt), d(o.paidAt), u.name, u.mobile, o.packageName, o.credits, rs(o.taxablePaise), rs(o.cgstPaise), rs(o.sgstPaise), rs(o.igstPaise), rs(o.totalPaise), o.gateway, o.gatewayOrderId, o.gatewayPaymentId, o.status])];
  } else if (type === "invoices") {
    const data = await db.select().from(t.invoices).where(and(gte(t.invoices.issuedAt, from), lt(t.invoices.issuedAt, to))).orderBy(asc(t.invoices.issuedAt));
    rows = [["Invoice no", "Date", "FY", "Billed to", "Buyer GSTIN", "Place of supply", "SAC", "Taxable", "CGST", "SGST", "IGST", "Total"],
      ...data.map((i) => [i.number, d(i.issuedAt), i.financialYear, i.billingName, i.gstin, i.billingState, i.sacCode, rs(i.taxablePaise), rs(i.cgstPaise), rs(i.sgstPaise), rs(i.igstPaise), rs(i.totalPaise)])];
  } else if (type === "ledger") {
    const data = await db.select({ l: t.creditLedger, u: t.users }).from(t.creditLedger).innerJoin(t.users, eq(t.users.id, t.creditLedger.userId))
      .where(and(gte(t.creditLedger.createdAt, from), lt(t.creditLedger.createdAt, to))).orderBy(asc(t.creditLedger.createdAt));
    rows = [["Date", "Member", "Mobile", "Reason", "Credits", "Balance after", "Ref", "Note", "By admin"],
      ...data.map(({ l, u }) => [d(l.createdAt), u.name, u.mobile, l.reason, l.delta, l.balanceAfter, l.refId, l.note, l.actorId])];
  } else if (type === "audit") {
    const data = await db.select().from(t.auditLogs).where(and(gte(t.auditLogs.createdAt, from), lt(t.auditLogs.createdAt, to))).orderBy(asc(t.auditLogs.createdAt));
    rows = [["Date", "Actor", "Action", "Entity", "Entity ID", "Data"], ...data.map((a) => [d(a.createdAt), a.actorId, a.action, a.entity, a.entityId, JSON.stringify(a.data ?? "")])];
  } else if (type === "users") {
    const data = await db.select().from(t.users).orderBy(asc(t.users.createdAt));
    rows = [["Name", "Mobile", "Mobile verified", "Email", "Role", "Status", "Credits", "Joined", "Last active"],
      ...data.map((x) => [x.name, x.mobile, x.mobileVerified ? "yes" : "no", x.email, x.role, x.status, x.credits, d(x.createdAt), d(x.lastActiveAt)])];
  } else return new Response("Unknown type", { status: 400 });

  return new Response(csv(rows), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${type}-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
}
