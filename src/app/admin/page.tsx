import { and, count, eq, gte, sql, sum } from "drizzle-orm";
import { db, t } from "@/db";
import { requireStaff } from "@/lib/auth";
import { financialYear, rupees } from "@/lib/services";
import { Stat } from "./_components";

export default async function AdminHome() {
  await requireStaff();
  const fy = financialYear();
  const fyStart = new Date(`${fy.slice(0, 4)}-04-01T00:00:00+05:30`);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const [
    [users], byStatus, [openReports], [pendingVer], [monthRev], [fyRev], [creditsSold], [creditsUsed], [newUsers], [modQueue], [flaggedComments], [liveStories],
  ] = await Promise.all([
    db.select({ n: count() }).from(t.users),
    db.select({ status: t.profiles.status, n: count() }).from(t.profiles).groupBy(t.profiles.status),
    db.select({ n: count() }).from(t.reports).where(eq(t.reports.status, "OPEN")),
    db.select({ n: count() }).from(t.photoVerifications).where(eq(t.photoVerifications.status, "PENDING")),
    db.select({ v: sum(t.paymentOrders.totalPaise) }).from(t.paymentOrders).where(and(eq(t.paymentOrders.status, "PAID"), gte(t.paymentOrders.paidAt, monthStart))),
    db.select({ v: sum(t.paymentOrders.totalPaise) }).from(t.paymentOrders).where(and(eq(t.paymentOrders.status, "PAID"), gte(t.paymentOrders.paidAt, fyStart))),
    db.select({ v: sum(t.creditLedger.delta) }).from(t.creditLedger).where(eq(t.creditLedger.reason, "PURCHASE")),
    db.select({ v: sql<number>`coalesce(-sum(${t.creditLedger.delta}),0)` }).from(t.creditLedger).where(sql`${t.creditLedger.delta} < 0 and ${t.creditLedger.reason} in ('UNLOCK_CONTACT','SEND_INTEREST','SHORTLIST')`),
    db.select({ n: count() }).from(t.users).where(gte(t.users.createdAt, new Date(Date.now() - 7 * 86400_000))),
    db.select({ n: count() }).from(t.stories).where(sql`${t.stories.status} in ('FLAGGED','PENDING')`),
    db.select({ n: count() }).from(t.storyComments).where(eq(t.storyComments.status, "FLAGGED")),
    db.select({ n: count() }).from(t.stories).where(eq(t.stories.status, "PUBLISHED")),
  ]);
  const st = (k: string) => byStatus.find((x) => x.status === k)?.n ?? 0;

  return (
    <div className="space-y-6">
      <h1 className="h1">Admin dashboard</h1>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Waiting for approval" value={<span className="text-amber-700">{st("PENDING")}</span>} href="/admin/profiles?status=PENDING" />
        <Stat label="Open reports" value={<span className="text-red-700">{openReports.n}</span>} href="/admin/reports" />
        <Stat label="Selfies to verify" value={pendingVer.n} href="/admin/verifications" />
        <Stat label="Stories / comments to moderate" value={<span className="text-red-700">{modQueue.n} / {flaggedComments.n}</span>} href="/admin/moderation" />
        <Stat label="Published success stories" value={liveStories.n} href="/stories" />
        <Stat label="Live profiles" value={st("APPROVED")} href="/admin/profiles?status=APPROVED" />
        <Stat label="Registered users" value={users.n} href="/admin/users" />
        <Stat label="New users (7 days)" value={newUsers.n} />
        <Stat label="Revenue this month" value={rupees(Number(monthRev.v ?? 0))} href="/admin/finance" />
        <Stat label={`Revenue FY ${fy}`} value={rupees(Number(fyRev.v ?? 0))} href="/admin/finance" />
        <Stat label="Credits sold (all time)" value={Number(creditsSold.v ?? 0)} />
        <Stat label="Credits used (all time)" value={Number(creditsUsed.v ?? 0)} />
        <Stat label="Drafts" value={st("DRAFT")} href="/admin/profiles?status=DRAFT" />
        <Stat label="Married (success stories)" value={st("MARRIED")} href="/admin/profiles?status=MARRIED" />
      </div>
    </div>
  );
}
