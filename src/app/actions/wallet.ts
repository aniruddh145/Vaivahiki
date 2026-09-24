"use server";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, t } from "@/db";
import { requireMember } from "@/lib/member";
import { activeGateway, computeTax, fulfilOrder, GATEWAYS } from "@/lib/billing";
import { pickL } from "@/lib/i18n";
import { audit } from "@/lib/services";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function createOrderAction(form: FormData) {
  const u = await requireMember();
  const [pkg] = await db.select().from(t.creditPackages).where(and(eq(t.creditPackages.id, s(form, "packageId")), eq(t.creditPackages.active, true)));
  if (!pkg) redirect("/wallet");
  const billingState = s(form, "billingState") || u.billingState || null;
  if (billingState && billingState !== u.billingState) await db.update(t.users).set({ billingState }).where(eq(t.users.id, u.id));
  const tax = await computeTax(pkg.pricePaise, billingState);
  const gw = await activeGateway();
  const [order] = await db
    .insert(t.paymentOrders)
    .values({ userId: u.id, packageId: pkg.id, packageName: pickL(pkg.name, "en"), credits: pkg.credits, ...tax, gateway: gw.name, billingState })
    .returning();
  let err: string | null = null;
  try {
    const { gatewayOrderId, checkout } = await gw.createOrder({ id: order.id, totalPaise: order.totalPaise, receipt: order.id });
    await db.update(t.paymentOrders).set({ gatewayOrderId, meta: checkout }).where(eq(t.paymentOrders.id, order.id));
  } catch (e) {
    err = (e as Error).message;
    await db.update(t.paymentOrders).set({ status: "FAILED", meta: { error: err } }).where(eq(t.paymentOrders.id, order.id));
  }
  await audit(u.id, "payment.create", "order", order.id, { total: order.totalPaise, gateway: gw.name, err });
  if (err) redirect(`/wallet?err=${encodeURIComponent(err)}`);
  redirect(`/pay/${order.id}`);
}

/** Called after checkout (test gateway buttons or Razorpay handler). */
export async function confirmPaymentAction(form: FormData) {
  const u = await requireMember();
  const [order] = await db.select().from(t.paymentOrders).where(and(eq(t.paymentOrders.id, s(form, "orderId")), eq(t.paymentOrders.userId, u.id)));
  if (!order) redirect("/wallet");
  if (order.status !== "CREATED") redirect(`/wallet?msg=${order.status === "PAID" ? "wallet.paySuccess" : "wallet.payFailed"}`);
  const gw = GATEWAYS[order.gateway];
  const payload = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
  const { ok, paymentId } = await gw.verify(order, payload);
  if (!ok) {
    await db.update(t.paymentOrders).set({ status: "FAILED" }).where(and(eq(t.paymentOrders.id, order.id), eq(t.paymentOrders.status, "CREATED")));
    redirect("/wallet?err=wallet.payFailed");
  }
  await fulfilOrder(order.id, paymentId);
  redirect("/wallet?msg=wallet.paySuccess");
}
