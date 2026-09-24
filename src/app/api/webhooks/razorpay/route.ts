import { eq } from "drizzle-orm";
import { db, t } from "@/db";
import { fulfilOrder, verifyRazorpayWebhook } from "@/lib/billing";

/**
 * Razorpay webhook (configure in Razorpay dashboard → Webhooks with event
 * "payment.captured" / "order.paid", URL https://<your-domain>/api/webhooks/razorpay).
 * Makes sure credits are added even if the user closes the browser after paying.
 */
export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get("x-razorpay-signature") ?? "";
  if (!(await verifyRazorpayWebhook(body, sig))) return new Response("bad signature", { status: 400 });
  const evt = JSON.parse(body);
  const payment = evt?.payload?.payment?.entity;
  const gatewayOrderId: string | undefined = payment?.order_id ?? evt?.payload?.order?.entity?.id;
  if (gatewayOrderId && (evt.event === "payment.captured" || evt.event === "order.paid")) {
    const [o] = await db.select().from(t.paymentOrders).where(eq(t.paymentOrders.gatewayOrderId, gatewayOrderId));
    if (o && o.totalPaise === Number(payment?.amount ?? o.totalPaise)) await fulfilOrder(o.id, payment?.id);
  }
  return Response.json({ ok: true });
}
