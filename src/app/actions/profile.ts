"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, count, eq } from "drizzle-orm";
import { db, t } from "@/db";
import { requireUser } from "@/lib/auth";
import { requireMember } from "@/lib/member";
import { getSettings } from "@/lib/settings";
import { fieldAppliesTo, getFieldSchema, parseFieldValues } from "@/lib/fields";
import { ageFrom, audit, nextCounter } from "@/lib/services";
import { deleteUpload, saveUpload } from "@/lib/storage";
import { normalizeMobile } from "@/lib/auth";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const back = (path: string, params: Record<string, string>) => redirect(`${path}?${new URLSearchParams(params)}`);

export async function ownProfile(profileId: string) {
  const u = await requireUser();
  const [p] = await db.select().from(t.profiles).where(eq(t.profiles.id, profileId));
  if (!p || (p.userId !== u.id && u.role !== "ADMIN")) redirect("/dashboard");
  return { u, p };
}

/** Decide status after the owner submits. */
async function statusOnSubmit(photoVerified: boolean) {
  const st = await getSettings();
  if (st.bool("verify.selfieEnabled") && st.bool("verify.selfieRequired") && !photoVerified) return "PENDING";
  return st.bool("profile.requireApproval") ? "PENDING" : "APPROVED";
}

export async function saveProfileAction(form: FormData) {
  const u = await requireMember();
  const st = await getSettings();
  const id = s(form, "rid");
  const intent = s(form, "intent"); // draft | submit
  const communityId = s(form, "communityId");
  const fullName = s(form, "fullName");
  const gender = s(form, "gender");
  const dobRaw = s(form, "dob");
  const path = id ? `/profiles/${id}/edit` : "/profiles/new";

  const [comm] = communityId ? await db.select().from(t.communities).where(eq(t.communities.id, communityId)) : [];
  if (!comm || !fullName || !["MALE", "FEMALE"].includes(gender) || !dobRaw) back(path, { err: "Please fill name, gender, date of birth and community" });
  const dob = new Date(dobRaw + "T00:00:00Z");
  const minAge = gender === "MALE" ? st.int("profile.minAgeMale") : st.int("profile.minAgeFemale");
  if (isNaN(dob.getTime()) || ageFrom(dob) < minAge || ageFrom(dob) > 90) back(path, { err: `Age must be at least ${minAge}` });

  const schema = await getFieldSchema();
  const fields = schema.flatMap((x) => x.fields).filter((f) => fieldAppliesTo(f, communityId));
  const { data, missing } = parseFieldValues(fields, form);
  if (intent === "submit" && missing.length) {
    back(path, { err: "Required: " + missing.map((k) => fields.find((f) => f.key === k)?.label.en ?? k).join(", ") });
  }

  let profileId = id;
  if (id) {
    const { p } = await ownProfile(id);
    let status = p.status;
    if (intent === "submit" || p.status === "APPROVED" || p.status === "REJECTED") {
      if (p.status !== "HIDDEN" && p.status !== "MARRIED") status = await statusOnSubmit(p.photoVerified);
    }
    await db
      .update(t.profiles)
      .set({ fullName, gender, dateOfBirth: dob, communityId, data: { ...(p.data ?? {}), ...Object.fromEntries(fields.map((f) => [f.key, data[f.key]])) }, status, rejectReason: status === "PENDING" ? null : p.rejectReason, updatedAt: new Date() })
      .where(eq(t.profiles.id, id));
    await audit(u.id, "profile.update", "profile", id, { status });
  } else {
    const [{ n }] = await db.select({ n: count() }).from(t.profiles).where(eq(t.profiles.userId, u.id));
    if (n >= st.int("profile.maxPerUser") && u.role !== "ADMIN") back("/dashboard", { err: "dash.limitReached" });
    const seq = await nextCounter(db, `profile:${comm.codePrefix}`, 1001);
    const [p] = await db
      .insert(t.profiles)
      .values({
        code: `${comm.codePrefix}${seq}`,
        userId: u.id,
        communityId,
        fullName,
        gender,
        dateOfBirth: dob,
        data,
        status: intent === "submit" ? await statusOnSubmit(false) : "DRAFT",
      })
      .returning();
    profileId = p.id;
    // pre-fill account holder as a contact
    if (u.mobile) await db.insert(t.contacts).values({ profileId: p.id, name: u.name, relation: "SELF", phone: u.mobile, isPrimary: true });
    await audit(u.id, "profile.create", "profile", p.id);
  }
  revalidatePath("/dashboard");
  back(`/profiles/${profileId}/edit`, { msg: intent === "submit" ? "profile.pendingNote" : "common.saved", tab: "photos" });
}

export async function setProfileStatusAction(form: FormData) {
  const { u, p } = await ownProfile(s(form, "rid"));
  const to = s(form, "to");
  let status = p.status;
  if (to === "HIDDEN" && ["APPROVED", "PENDING"].includes(p.status)) status = "HIDDEN";
  else if (to === "MARRIED") status = "MARRIED";
  else if (to === "SHOW" && ["HIDDEN", "MARRIED", "DRAFT", "REJECTED"].includes(p.status)) status = await statusOnSubmit(p.photoVerified);
  await db.update(t.profiles).set({ status }).where(eq(t.profiles.id, p.id));
  await audit(u.id, "profile.status", "profile", p.id, { from: p.status, to: status });
  if (status === "MARRIED" && (await getSettings()).bool("stories.enabled")) redirect(`/stories/new?profile=${p.id}`);
  redirect("/dashboard?msg=common.saved");
}

export async function uploadPhotosAction(form: FormData) {
  const { u, p } = await ownProfile(s(form, "rid"));
  const st = await getSettings();
  const files = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  const existing = await db.select().from(t.photos).where(eq(t.photos.profileId, p.id));
  const room = st.int("profile.maxPhotos") - existing.length;
  const path = `/profiles/${p.id}/edit`;
  if (room <= 0) back(path, { err: `Maximum ${st.int("profile.maxPhotos")} photos`, tab: "photos" });
  try {
    let i = existing.length;
    for (const f of files.slice(0, room)) {
      const url = await saveUpload(f, "photos");
      await db.insert(t.photos).values({ profileId: p.id, url, isPrimary: i === 0, order: i, status: st.bool("profile.requireApproval") && u.role === "USER" ? "PENDING" : "APPROVED" });
      i++;
    }
  } catch (e) {
    back(path, { err: (e as Error).message, tab: "photos" });
  }
  // a photo change invalidates earlier selfie verification
  if (p.photoVerified) await db.update(t.profiles).set({ photoVerified: false }).where(eq(t.profiles.id, p.id));
  back(path, { msg: "common.saved", tab: "photos" });
}

export async function photoAction(form: FormData) {
  const { p } = await ownProfile(s(form, "rid"));
  const photoId = s(form, "photoId");
  const [ph] = await db.select().from(t.photos).where(and(eq(t.photos.id, photoId), eq(t.photos.profileId, p.id)));
  if (ph) {
    if (s(form, "op") === "delete") {
      await db.delete(t.photos).where(eq(t.photos.id, ph.id));
      await deleteUpload(ph.url);
      if (ph.isPrimary) {
        const [next] = await db.select().from(t.photos).where(eq(t.photos.profileId, p.id)).limit(1);
        if (next) await db.update(t.photos).set({ isPrimary: true }).where(eq(t.photos.id, next.id));
      }
    } else {
      await db.update(t.photos).set({ isPrimary: false }).where(eq(t.photos.profileId, p.id));
      await db.update(t.photos).set({ isPrimary: true }).where(eq(t.photos.id, ph.id));
    }
  }
  back(`/profiles/${p.id}/edit`, { tab: "photos" });
}

export async function addContactAction(form: FormData) {
  const { p } = await ownProfile(s(form, "rid"));
  const phone = s(form, "phone") ? normalizeMobile(s(form, "phone")) : null;
  const email = s(form, "email") || null;
  if (!s(form, "name") || (!phone && !email)) back(`/profiles/${p.id}/edit`, { err: "auth.err.mobileRequired", tab: "contacts" });
  await db.insert(t.contacts).values({
    profileId: p.id,
    name: s(form, "name"),
    relation: s(form, "relation") || "OTHER",
    phone,
    email,
    whatsapp: form.get("whatsapp") === "on",
  });
  back(`/profiles/${p.id}/edit`, { msg: "common.saved", tab: "contacts" });
}

export async function deleteContactAction(form: FormData) {
  const { p } = await ownProfile(s(form, "rid"));
  await db.delete(t.contacts).where(and(eq(t.contacts.id, s(form, "contactId")), eq(t.contacts.profileId, p.id)));
  back(`/profiles/${p.id}/edit`, { tab: "contacts" });
}

export async function submitSelfieAction(form: FormData) {
  const { u, p } = await ownProfile(s(form, "rid"));
  const st = await getSettings();
  if (!st.bool("verify.selfieEnabled")) redirect("/dashboard");
  const f = form.get("selfie");
  if (!(f instanceof File) || f.size === 0) back(`/profiles/${p.id}/verify`, { err: "verify.upload" });
  try {
    const url = await saveUpload(f as File, "selfies");
    await db.insert(t.photoVerifications).values({ profileId: p.id, selfieUrl: url, provider: st.str("verify.provider") });
  } catch (e) {
    back(`/profiles/${p.id}/verify`, { err: (e as Error).message });
  }
  await audit(u.id, "verification.submit", "profile", p.id);
  back(`/profiles/${p.id}/verify`, { msg: "verify.pending" });
}
