"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, count, eq, inArray, sql } from "drizzle-orm";
import { db, t } from "@/db";
import { requireMember } from "@/lib/member";
import { getSettings } from "@/lib/settings";
import { moderate } from "@/lib/moderation";
import { saveUpload } from "@/lib/storage";
import { audit, notify } from "@/lib/services";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const back = (path: string, params: Record<string, string>) => redirect(`${path}?${new URLSearchParams(params)}`);

/** Status after text/partner checks pass. */
async function liveStatus() {
  return (await getSettings()).bool("stories.requireApproval") ? "PENDING" : "PUBLISHED";
}

export async function createStoryAction(form: FormData) {
  const u = await requireMember();
  const st = await getSettings();
  if (!st.bool("stories.enabled")) redirect("/dashboard");
  const [own] = await db.select().from(t.profiles).where(and(eq(t.profiles.id, s(form, "profileId")), eq(t.profiles.userId, u.id)));
  const path = "/stories/new";
  if (!own) back(path, { err: "story.err.profile" });

  const coupleNames = s(form, "coupleNames").slice(0, 150);
  const message = s(form, "message").slice(0, 3000);
  if (!coupleNames) back(path, { err: "story.err.names", profile: own!.id });

  // optional partner tag by profile ID (e.g. DNB1009)
  let partner: typeof t.profiles.$inferSelect | undefined;
  const pcode = s(form, "partnerCode").toUpperCase();
  if (pcode) {
    [partner] = await db.select().from(t.profiles).where(eq(t.profiles.code, pcode));
    if (!partner || partner.id === own!.id) back(path, { err: "story.err.partner", profile: own!.id });
  }

  const files = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0).slice(0, st.int("stories.maxPhotos"));
  if (files.length === 0) back(path, { err: "story.err.photos", profile: own!.id });

  const mod = await moderate([coupleNames, s(form, "city"), message].join("\n"), "story", files);
  let urls: string[] = [];
  try {
    for (const f of files) urls.push(await saveUpload(f, "stories"));
  } catch (e) {
    back(path, { err: (e as Error).message, profile: own!.id });
  }

  const partnerSameAccount = partner && partner.userId === u.id;
  const needsPartner = partner && !partnerSameAccount && st.bool("stories.requirePartnerConfirm");
  const status = !mod.ok ? "FLAGGED" : needsPartner ? "AWAITING_PARTNER" : await liveStatus();

  const [story] = await db
    .insert(t.stories)
    .values({
      userId: u.id,
      profileId: own!.id,
      partnerProfileId: partner?.id ?? null,
      partnerConfirmed: !!partnerSameAccount,
      coupleNames,
      weddingDate: s(form, "weddingDate") || null,
      city: s(form, "city").slice(0, 100) || null,
      message: message || null,
      photos: urls,
      visibility: s(form, "visibility") === "PUBLIC" && st.bool("stories.allowPublic") ? "PUBLIC" : "MEMBERS",
      status,
      flagReason: mod.ok ? null : mod.reason,
      publishedAt: status === "PUBLISHED" ? new Date() : null,
    })
    .returning();

  // Marking married takes the biodata(s) out of search
  await db.update(t.profiles).set({ status: "MARRIED" }).where(inArray(t.profiles.id, [own!.id, ...(partnerSameAccount ? [partner!.id] : [])]));
  if (needsPartner && mod.ok) await notify(partner!.userId, "STORY_CONFIRM", { name: own!.fullName, code: own!.code }, `/stories/${story.id}`);
  await audit(u.id, "story.create", "story", story.id, { status, flag: mod.reason });
  revalidatePath("/stories");
  back(`/stories/${story.id}`, { msg: status === "PUBLISHED" ? "story.published" : status === "FLAGGED" || status === "PENDING" ? "story.underReview" : "story.awaitingPartner" });
}

export async function confirmPartnerAction(form: FormData) {
  const u = await requireMember();
  const [story] = await db.select().from(t.stories).where(eq(t.stories.id, s(form, "storyId")));
  if (!story?.partnerProfileId) redirect("/stories");
  const [partner] = await db.select().from(t.profiles).where(eq(t.profiles.id, story.partnerProfileId!));
  if (partner.userId !== u.id || story.status !== "AWAITING_PARTNER") redirect(`/stories/${story.id}`);
  if (s(form, "op") === "confirm") {
    const status = await liveStatus();
    await db.update(t.stories).set({ partnerConfirmed: true, status, publishedAt: status === "PUBLISHED" ? new Date() : null }).where(eq(t.stories.id, story.id));
    await db.update(t.profiles).set({ status: "MARRIED" }).where(eq(t.profiles.id, partner.id));
    await notify(story.userId, "STORY_CONFIRMED", { code: partner.code }, `/stories/${story.id}`);
  } else {
    // "Not us" – untag and send to admin for a look
    await db.update(t.stories).set({ partnerProfileId: null, status: "FLAGGED", flagReason: `Tagged partner ${partner.code} said this is not them` }).where(eq(t.stories.id, story.id));
  }
  await audit(u.id, `story.partner_${s(form, "op")}`, "story", story.id);
  back(`/stories/${story.id}`, { msg: "common.saved" });
}

export async function congratsAction(form: FormData) {
  const u = await requireMember();
  const [story] = await db.select().from(t.stories).where(and(eq(t.stories.id, s(form, "storyId")), eq(t.stories.status, "PUBLISHED")));
  if (!story) redirect("/stories");
  const ins = await db.insert(t.storyCongrats).values({ storyId: story.id, userId: u.id }).onConflictDoNothing().returning();
  if (ins.length) {
    await db.update(t.stories).set({ congratsCount: sql`${t.stories.congratsCount} + 1` }).where(eq(t.stories.id, story.id));
    if (story.userId !== u.id) await notify(story.userId, "STORY_CONGRATS", { name: u.name }, `/stories/${story.id}`);
  }
  redirect(`/stories/${story.id}#comments`);
}

export async function commentAction(form: FormData) {
  const u = await requireMember();
  const st = await getSettings();
  const [story] = await db.select().from(t.stories).where(and(eq(t.stories.id, s(form, "storyId")), eq(t.stories.status, "PUBLISHED")));
  if (!story || !st.bool("stories.commentsEnabled")) redirect("/stories");
  const path = `/stories/${story.id}`;
  const body = s(form, "body").slice(0, 1000);
  if (!body) redirect(path);

  // repeat offenders lose commenting
  const limit = st.int("moderation.autoBlockAfter");
  if (limit > 0) {
    const [{ n }] = await db
      .select({ n: count() })
      .from(t.storyComments)
      .where(and(eq(t.storyComments.userId, u.id), inArray(t.storyComments.status, ["FLAGGED", "REMOVED"])));
    if (n >= limit) back(path, { err: "story.err.blocked" });
  }

  const mod = await moderate(body, "comment");
  await db.insert(t.storyComments).values({ storyId: story.id, userId: u.id, body, status: mod.ok ? "PUBLISHED" : "FLAGGED", flagReason: mod.ok ? null : mod.reason });
  if (mod.ok) {
    await db.update(t.stories).set({ commentCount: sql`${t.stories.commentCount} + 1` }).where(eq(t.stories.id, story.id));
    if (story.userId !== u.id) await notify(story.userId, "STORY_COMMENT", { name: u.name }, `${path}#comments`);
  } else {
    await audit(u.id, "comment.auto_flagged", "story", story.id, { reason: mod.reason });
  }
  back(path, { msg: mod.ok ? "story.commentPosted" : "story.commentHeld" });
}

export async function reportContentAction(form: FormData) {
  const u = await requireMember();
  const st = await getSettings();
  const type = s(form, "type") === "COMMENT" ? "COMMENT" : "STORY";
  const id = s(form, "targetId");
  const storyId = s(form, "storyId");
  const ins = await db.insert(t.contentReports).values({ targetType: type, targetId: id, reporterId: u.id, reason: s(form, "reason").slice(0, 300) || null }).onConflictDoNothing().returning();
  if (ins.length) {
    const threshold = Math.max(1, st.int("moderation.autoHideReports"));
    if (type === "COMMENT") {
      const [c] = await db.update(t.storyComments).set({ reportCount: sql`${t.storyComments.reportCount} + 1` }).where(eq(t.storyComments.id, id)).returning();
      if (c && c.reportCount >= threshold && c.status === "PUBLISHED") {
        await db.update(t.storyComments).set({ status: "FLAGGED", flagReason: `Reported by ${c.reportCount} members` }).where(eq(t.storyComments.id, id));
        await db.update(t.stories).set({ commentCount: sql`greatest(${t.stories.commentCount} - 1, 0)` }).where(eq(t.stories.id, c.storyId));
      }
    } else {
      const [x] = await db.update(t.stories).set({ reportCount: sql`${t.stories.reportCount} + 1` }).where(eq(t.stories.id, id)).returning();
      if (x && x.reportCount >= threshold && x.status === "PUBLISHED") {
        await db.update(t.stories).set({ status: "FLAGGED", flagReason: `Reported by ${x.reportCount} members` }).where(eq(t.stories.id, id));
      }
    }
  }
  back(`/stories/${storyId || id}`, { msg: "report.thanks" });
}

export async function deleteOwnCommentAction(form: FormData) {
  const u = await requireMember();
  const [c] = await db.select().from(t.storyComments).where(eq(t.storyComments.id, s(form, "commentId")));
  if (c && c.userId === u.id && c.status === "PUBLISHED") {
    await db.delete(t.storyComments).where(eq(t.storyComments.id, c.id));
    await db.update(t.stories).set({ commentCount: sql`greatest(${t.stories.commentCount} - 1, 0)` }).where(eq(t.stories.id, c.storyId));
  }
  redirect(`/stories/${c?.storyId ?? ""}#comments`);
}
