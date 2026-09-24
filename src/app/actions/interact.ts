"use server";
import { redirect } from "next/navigation";
import { and, count, eq, gt } from "drizzle-orm";
import { db, t } from "@/db";
import { requireMember } from "@/lib/member";
import { getSettings } from "@/lib/settings";
import { audit, changeCredits, CreditError, notify } from "@/lib/services";
import { accessFor } from "@/lib/access";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const back = (path: string, params: Record<string, string>) => redirect(`${path}?${new URLSearchParams(params)}`);

async function target(form: FormData) {
  const [p] = await db.select().from(t.profiles).where(eq(t.profiles.id, s(form, "profileId")));
  if (!p) redirect("/search");
  return p;
}

async function contactGate(u: { mobileVerified: boolean; role: string }, path: string) {
  const st = await getSettings();
  if (st.bool("verify.onlyVerifiedCanContact") && !u.mobileVerified && u.role === "USER") back("/verify-mobile", { err: "dash.mobileNotVerified" });
  void path;
}

export async function toggleShortlistAction(form: FormData) {
  const u = await requireMember();
  const p = await target(form);
  const kind = s(form, "kind") === "WISHLIST" ? "WISHLIST" : "BOOKMARK";
  const ret = s(form, "return") || `/p/${p.code}`;
  const [ex] = await db.select().from(t.shortlists).where(and(eq(t.shortlists.userId, u.id), eq(t.shortlists.profileId, p.id), eq(t.shortlists.kind, kind)));
  if (ex) {
    await db.delete(t.shortlists).where(eq(t.shortlists.id, ex.id));
  } else {
    const cost = (await getSettings()).int("credits.shortlistCost");
    try {
      await db.transaction(async (tx) => {
        if (cost > 0) await changeCredits(tx, { userId: u.id, delta: -cost, reason: "SHORTLIST", refId: p.id });
        await tx.insert(t.shortlists).values({ userId: u.id, profileId: p.id, kind });
      });
    } catch (e) {
      if (e instanceof CreditError) back(ret, { err: "profile.notEnoughCredits" });
      throw e;
    }
  }
  redirect(ret);
}

export async function sendInterestAction(form: FormData) {
  const u = await requireMember();
  const p = await target(form);
  const path = `/p/${p.code}`;
  await contactGate(u, path);
  const st = await getSettings();
  const [from] = await db.select().from(t.profiles).where(and(eq(t.profiles.id, s(form, "fromProfileId")), eq(t.profiles.userId, u.id)));
  if (!from || from.status !== "APPROVED") back(path, { err: "profile.needOwnProfile" });
  if (from!.id === p.id || p.status !== "APPROVED") back(path, { err: "Not allowed" });

  const [dup] = await db.select().from(t.interests).where(and(eq(t.interests.fromProfileId, from!.id), eq(t.interests.toProfileId, p.id)));
  if (dup) back(path, { msg: "profile.interestSent" });

  const since = new Date(Date.now() - 24 * 3600_000);
  const [{ n }] = await db.select({ n: count() }).from(t.interests).where(and(eq(t.interests.senderId, u.id), gt(t.interests.createdAt, since)));
  const cost = n >= st.int("credits.freeInterestsPerDay") ? st.int("credits.sendInterestCost") : 0;

  try {
    await db.transaction(async (tx) => {
      const [i] = await tx
        .insert(t.interests)
        .values({ senderId: u.id, fromProfileId: from!.id, toProfileId: p.id, message: s(form, "message").slice(0, 500) || null, creditsSpent: cost })
        .returning();
      if (cost > 0) await changeCredits(tx, { userId: u.id, delta: -cost, reason: "SEND_INTEREST", refId: i.id, note: p.code });
      await notify(p.userId, "INTEREST_RECEIVED", { name: from!.fullName, code: from!.code, to: p.code }, "/interests", tx);
    });
  } catch (e) {
    if (e instanceof CreditError) back(path, { err: "profile.notEnoughCredits" });
    throw e;
  }
  back(path, { msg: "profile.interestSent" });
}

export async function respondInterestAction(form: FormData) {
  const u = await requireMember();
  const [i] = await db.select().from(t.interests).where(eq(t.interests.id, s(form, "interestId")));
  if (!i) redirect("/interests");
  const op = s(form, "op");
  if (op === "withdraw") {
    if (i.senderId === u.id && i.status === "SENT") await db.update(t.interests).set({ status: "WITHDRAWN" }).where(eq(t.interests.id, i.id));
    redirect("/interests?tab=sent");
  }
  const [to] = await db.select().from(t.profiles).where(eq(t.profiles.id, i.toProfileId));
  if (to.userId !== u.id) redirect("/interests");
  const status = op === "accept" ? "ACCEPTED" : "DECLINED";
  await db.update(t.interests).set({ status, respondedAt: new Date() }).where(eq(t.interests.id, i.id));
  await notify(i.senderId, status === "ACCEPTED" ? "INTEREST_ACCEPTED" : "INTEREST_DECLINED", { name: to.fullName, code: to.code }, `/p/${to.code}`);
  redirect("/interests?msg=common.saved");
}

export async function unlockContactAction(form: FormData) {
  const u = await requireMember();
  const p = await target(form);
  const path = `/p/${p.code}`;
  await contactGate(u, path);
  if (p.status !== "APPROVED") back(path, { err: "Not allowed" });
  const cost = (await getSettings()).int("credits.unlockContactCost");
  try {
    await db.transaction(async (tx) => {
      const ins = await tx.insert(t.unlocks).values({ userId: u.id, profileId: p.id, creditsSpent: cost }).onConflictDoNothing().returning();
      if (ins.length === 0) return; // already unlocked
      if (cost > 0) await changeCredits(tx, { userId: u.id, delta: -cost, reason: "UNLOCK_CONTACT", refId: p.id, note: p.code });
      await notify(p.userId, "CONTACT_VIEWED", { code: p.code }, `/p/${p.code}`, tx);
    });
  } catch (e) {
    if (e instanceof CreditError) back(path, { err: "profile.notEnoughCredits" });
    throw e;
  }
  await audit(u.id, "contact.unlock", "profile", p.id, { cost });
  redirect(path + "#contacts");
}

export async function reportAction(form: FormData) {
  const u = await requireMember();
  const p = await target(form);
  await db.insert(t.reports).values({ reporterId: u.id, profileId: p.id, reasonKey: s(form, "reason") || "other", details: s(form, "details").slice(0, 2000) || null });
  back(`/p/${p.code}`, { msg: "report.thanks" });
}

export async function feedbackAction(form: FormData) {
  const u = await requireMember();
  const p = await target(form);
  const acc = await accessFor(u, p);
  if (!acc.interacted) back(`/p/${p.code}`, { err: "Feedback is allowed after you contact or send interest to this profile" });
  const rating =Math.min(5, Math.max(1, Number(s(form, "rating")) || 3));
  const values = { userId: u.id, profileId: p.id, rating, interaction: s(form, "interaction") || null, comment: s(form, "comment").slice(0, 1000) || null };
  await db.insert(t.feedbacks).values(values).onConflictDoUpdate({ target: [t.feedbacks.userId, t.feedbacks.profileId], set: { rating, interaction: values.interaction, comment: values.comment } });
  back(`/p/${p.code}`, { msg: "feedback.thanks" });
}

export async function markNotificationsReadAction() {
  const u = await requireMember();
  await db.update(t.notifications).set({ read: true }).where(eq(t.notifications.userId, u.id));
  redirect("/notifications");
}
