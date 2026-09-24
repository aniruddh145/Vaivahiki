"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, t } from "@/db";
import type { FieldOption } from "@/db/schema";
import { hashPassword, requireAdmin, requireStaff } from "@/lib/auth";
import { SETTINGS, setSetting } from "@/lib/settings";
import { FIELD_TYPES, VISIBILITIES } from "@/lib/fields";
import { audit, changeCredits, CreditError, notify } from "@/lib/services";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const b = (f: FormData, k: string) => f.get(k) === "on" || f.get(k) === "true";
const n = (f: FormData, k: string) => (s(f, k) === "" ? null : Number(s(f, k)));
const back = (path: string, params: Record<string, string> = {}) => redirect(`${path}${Object.keys(params).length ? "?" + new URLSearchParams(params) : ""}`);

/** Collect {en: .., hi: ..} from inputs named `${prefix}__${lang}` */
function l10n(f: FormData, prefix: string) {
  const out: Record<string, string> = {};
  for (const [k, v] of f.entries()) {
    if (k.startsWith(prefix + "__")) {
      const val = String(v).trim();
      if (val) out[k.slice(prefix.length + 2)] = val;
    }
  }
  return out;
}
const slug = (x: string) => x.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

// ───────────── Profiles moderation ─────────────

export async function moderateProfileAction(form: FormData) {
  const admin = await requireStaff();
  const id = s(form, "rid");
  const op = s(form, "op");
  const [p] = await db.select().from(t.profiles).where(eq(t.profiles.id, id));
  if (!p) back("/admin/profiles");
  const ret = s(form, "return") || "/admin/profiles";
  switch (op) {
    case "approve":
      await db.update(t.profiles).set({ status: "APPROVED", rejectReason: null }).where(eq(t.profiles.id, id));
      await db.update(t.photos).set({ status: "APPROVED" }).where(and(eq(t.photos.profileId, id), eq(t.photos.status, "PENDING")));
      await notify(p.userId, "PROFILE_APPROVED", { code: p.code }, `/p/${p.code}`);
      break;
    case "reject":
      await db.update(t.profiles).set({ status: "REJECTED", rejectReason: s(form, "reason") || null }).where(eq(t.profiles.id, id));
      await notify(p.userId, "PROFILE_REJECTED", { code: p.code }, `/profiles/${p.id}/edit`);
      break;
    case "hide":
      await db.update(t.profiles).set({ status: "HIDDEN" }).where(eq(t.profiles.id, id));
      break;
    case "feature": {
      const days = Number(s(form, "days")) || 30;
      await db.update(t.profiles).set({ featuredUntil: days > 0 ? new Date(Date.now() + days * 86400_000) : null }).where(eq(t.profiles.id, id));
      break;
    }
    case "verify":
      await db.update(t.profiles).set({ photoVerified: !p.photoVerified }).where(eq(t.profiles.id, id));
      break;
    case "delete":
      if (admin.role !== "ADMIN") back(ret, { err: "Only admins can delete" });
      await db.delete(t.profiles).where(eq(t.profiles.id, id));
      break;
  }
  await audit(admin.id, `profile.${op}`, "profile", id, { code: p.code, reason: s(form, "reason") || undefined });
  revalidatePath("/admin");
  back(ret, { msg: `${p.code}: ${op} ✓` });
}

export async function moderatePhotoAction(form: FormData) {
  const admin = await requireStaff();
  const status = s(form, "op") === "reject" ? "REJECTED" : "APPROVED";
  await db.update(t.photos).set({ status }).where(eq(t.photos.id, s(form, "photoId")));
  await audit(admin.id, `photo.${status.toLowerCase()}`, "photo", s(form, "photoId"));
  back(s(form, "return") || "/admin/profiles");
}

// ───────────── Users ─────────────

export async function adminUserAction(form: FormData) {
  const admin = await requireAdmin();
  const id = s(form, "rid");
  const op = s(form, "op");
  const path = `/admin/users/${id}`;
  const [u] = await db.select().from(t.users).where(eq(t.users.id, id));
  if (!u) back("/admin/users");
  if (op === "credits") {
    const delta = Math.trunc(Number(s(form, "delta")));
    if (!delta) back(path, { err: "Enter a non-zero amount" });
    try {
      await db.transaction((tx) => changeCredits(tx, { userId: id, delta, reason: s(form, "reason") === "REFUND" ? "REFUND" : "ADMIN_ADJUST", note: s(form, "note") || undefined, actorId: admin.id }));
    } catch (e) {
      if (e instanceof CreditError) back(path, { err: "Balance cannot go below zero" });
      throw e;
    }
    if (delta > 0) await notify(id, "CREDITS_ADDED", { n: delta }, "/wallet");
    await audit(admin.id, "user.credits", "user", id, { delta, note: s(form, "note") });
  } else if (op === "status") {
    if (id === admin.id) back(path, { err: "You cannot change your own status" });
    await db.update(t.users).set({ status: s(form, "status") }).where(eq(t.users.id, id));
    if (s(form, "status") !== "ACTIVE") await db.update(t.profiles).set({ status: "HIDDEN" }).where(and(eq(t.profiles.userId, id), eq(t.profiles.status, "APPROVED")));
    await audit(admin.id, "user.status", "user", id, { status: s(form, "status") });
  } else if (op === "role") {
    if (id === admin.id) back(path, { err: "You cannot change your own role" });
    await db.update(t.users).set({ role: s(form, "role") }).where(eq(t.users.id, id));
    await audit(admin.id, "user.role", "user", id, { role: s(form, "role") });
  } else if (op === "password") {
    const pw = s(form, "password");
    if (pw.length < 6) back(path, { err: "Password must be at least 6 characters" });
    await db.update(t.users).set({ passwordHash: await hashPassword(pw) }).where(eq(t.users.id, id));
    await audit(admin.id, "user.password_reset", "user", id);
  } else if (op === "verifyMobile") {
    await db.update(t.users).set({ mobileVerified: !u.mobileVerified }).where(eq(t.users.id, id));
    await audit(admin.id, "user.mobile_verified", "user", id, { value: !u.mobileVerified });
  }
  back(path, { msg: "Saved" });
}

// ───────────── Communities ─────────────

export async function saveCommunityAction(form: FormData) {
  const admin = await requireAdmin();
  const id = s(form, "rid");
  const name = l10n(form, "name");
  if (!name.en) back("/admin/communities", { err: "English name is required" });
  const values = {
    name,
    description: l10n(form, "desc"),
    codePrefix: (s(form, "codePrefix") || "SV").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5) || "SV",
    active: b(form, "active"),
    order: Number(s(form, "order")) || 0,
  };
  if (id) await db.update(t.communities).set(values).where(eq(t.communities.id, id));
  else await db.insert(t.communities).values({ ...values, slug: slug(name.en) + "_" + Date.now().toString(36) });
  await audit(admin.id, id ? "community.update" : "community.create", "community", id || undefined, values);
  back("/admin/communities", { msg: "Saved" });
}

// ───────────── Fields & sections ─────────────

export async function saveSectionAction(form: FormData) {
  const admin = await requireAdmin();
  const id = s(form, "rid");
  const label = l10n(form, "label");
  if (!label.en) back("/admin/fields", { err: "English label is required" });
  const values = { label, order: Number(s(form, "order")) || 0, active: b(form, "active") };
  if (id) await db.update(t.fieldSections).set(values).where(eq(t.fieldSections.id, id));
  else await db.insert(t.fieldSections).values({ ...values, key: slug(label.en) + "_" + Date.now().toString(36) });
  await audit(admin.id, "section.save", "section", id || undefined, values);
  back("/admin/fields", { msg: "Saved" });
}

/**
 * Options textarea format, one per line:
 *   value | English label | हिंदी लेबल | (more languages in order of the header)
 * If value is omitted ("English | हिंदी") a value is generated from the English label.
 */
function parseOptions(raw: string, langs: string[]): FieldOption[] {
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("|").map((x) => x.trim());
      const hasValue = parts.length === langs.length + 1;
      const value = hasValue ? parts[0] : slug(parts[0]);
      const labels = hasValue ? parts.slice(1) : parts;
      const label: Record<string, string> = {};
      langs.forEach((code, i) => { if (labels[i]) label[code] = labels[i]; });
      return { value: value || slug(labels[0] ?? ""), label };
    });
}

export async function saveFieldAction(form: FormData) {
  const admin = await requireAdmin();
  const id = s(form, "rid");
  const label = l10n(form, "label");
  const type = s(form, "type");
  const visibility = s(form, "visibility");
  const ret = id ? `/admin/fields/${id}` : "/admin/fields/new";
  if (!label.en) back(ret, { err: "English label is required" });
  if (!(FIELD_TYPES as readonly string[]).includes(type)) back(ret, { err: "Invalid type" });
  if (!(VISIBILITIES as readonly string[]).includes(visibility)) back(ret, { err: "Invalid visibility" });
  const langs = s(form, "optionLangs").split(",").filter(Boolean);
  const options = type === "SELECT" || type === "MULTISELECT" ? parseOptions(s(form, "options"), langs) : null;
  if (options && options.length === 0) back(ret, { err: "Add at least one option" });
  const communityIds = form.getAll("communityIds").map(String).filter(Boolean);
  const values = {
    sectionId: s(form, "sectionId"),
    type,
    label,
    placeholder: l10n(form, "ph"),
    helpText: l10n(form, "help"),
    options,
    required: b(form, "required"),
    visibility,
    filterable: b(form, "filterable"),
    showInCard: b(form, "showInCard"),
    min: n(form, "min"),
    max: n(form, "max"),
    communityIds: communityIds.length ? communityIds : null,
    order: Number(s(form, "order")) || 0,
    active: b(form, "active"),
  };
  let fid = id;
  if (id) await db.update(t.fieldDefinitions).set(values).where(eq(t.fieldDefinitions.id, id));
  else {
    const key = slug(s(form, "key") || label.en);
    const [exists] = await db.select().from(t.fieldDefinitions).where(eq(t.fieldDefinitions.key, key));
    if (exists) back(ret, { err: `Field key "${key}" already exists` });
    const [row] = await db.insert(t.fieldDefinitions).values({ ...values, key }).returning();
    fid = row.id;
  }
  await audit(admin.id, id ? "field.update" : "field.create", "field", fid, { key: s(form, "key"), label: label.en, type });
  back("/admin/fields", { msg: `Saved: ${label.en}` });
}

export async function deleteFieldAction(form: FormData) {
  const admin = await requireAdmin();
  // Soft-disable keeps existing profile answers safe; hard delete only on request
  if (s(form, "hard") === "1") await db.delete(t.fieldDefinitions).where(eq(t.fieldDefinitions.id, s(form, "rid")));
  else await db.update(t.fieldDefinitions).set({ active: false }).where(eq(t.fieldDefinitions.id, s(form, "rid")));
  await audit(admin.id, "field.delete", "field", s(form, "rid"), { hard: s(form, "hard") === "1" });
  back("/admin/fields", { msg: "Removed" });
}

// ───────────── Languages & translations ─────────────

export async function saveLanguageAction(form: FormData) {
  const admin = await requireAdmin();
  const code = s(form, "code").toLowerCase().replace(/[^a-z-]/g, "");
  if (!code || !s(form, "name")) back("/admin/languages", { err: "Code and name are required" });
  const values = { name: s(form, "name"), nativeName: s(form, "nativeName") || s(form, "name"), active: b(form, "active"), isDefault: b(form, "isDefault"), order: Number(s(form, "order")) || 0 };
  if (values.isDefault) await db.update(t.languages).set({ isDefault: false });
  await db.insert(t.languages).values({ code, ...values }).onConflictDoUpdate({ target: t.languages.code, set: values });
  await audit(admin.id, "language.save", "language", code, values);
  back("/admin/languages", { msg: "Saved" });
}

export async function saveTranslationsAction(form: FormData) {
  const admin = await requireAdmin();
  const lang = s(form, "lang");
  const rows: { lang: string; key: string; value: string }[] = [];
  const clear: string[] = [];
  for (const [k, v] of form.entries()) {
    if (!k.startsWith("tr:")) continue;
    const key = k.slice(3);
    const val = String(v).trim();
    const orig = s(form, `orig:${key}`);
    if (val === orig) continue; // unchanged
    if (val) rows.push({ lang, key, value: val });
    else clear.push(key);
  }
  for (const r of rows) {
    await db.insert(t.translations).values(r).onConflictDoUpdate({ target: [t.translations.lang, t.translations.key], set: { value: r.value } });
  }
  if (clear.length) await db.delete(t.translations).where(and(eq(t.translations.lang, lang), inArray(t.translations.key, clear)));
  await audit(admin.id, "translations.save", "language", lang, { changed: rows.length, cleared: clear.length });
  revalidatePath("/", "layout");
  back("/admin/languages/" + lang, { msg: `Saved ${rows.length + clear.length} change(s)`, q: s(form, "q") });
}

// ───────────── Packages ─────────────

export async function savePackageAction(form: FormData) {
  const admin = await requireAdmin();
  const id = s(form, "rid");
  const name = l10n(form, "name");
  const credits = Number(s(form, "credits"));
  const price = Number(s(form, "price"));
  if (!name.en || !(credits > 0) || !(price >= 0)) back("/admin/packages", { err: "Name, credits and price are required" });
  const values = {
    name,
    description: l10n(form, "desc"),
    credits: Math.trunc(credits),
    pricePaise: Math.round(price * 100),
    highlight: b(form, "highlight"),
    active: b(form, "active"),
    order: Number(s(form, "order")) || 0,
  };
  if (id) await db.update(t.creditPackages).set(values).where(eq(t.creditPackages.id, id));
  else await db.insert(t.creditPackages).values(values);
  await audit(admin.id, id ? "package.update" : "package.create", "package", id || undefined, values);
  back("/admin/packages", { msg: "Saved" });
}

// ───────────── Settings ─────────────

export async function saveSettingsAction(form: FormData) {
  const admin = await requireAdmin();
  const group = s(form, "group");
  const changed: string[] = [];
  for (const def of SETTINGS.filter((d) => d.group === group)) {
    let v: unknown;
    if (def.type === "bool") v = b(form, def.key);
    else if (def.type === "int") v = Math.trunc(Number(s(form, def.key)) || 0);
    else if (def.type === "l10n") v = l10n(form, def.key);
    else if (def.type === "secret") {
      const raw = s(form, def.key);
      if (!raw) continue; // blank = keep existing secret
      v = raw;
    } else v = s(form, def.key);
    await setSetting(def.key, v);
    changed.push(def.key);
  }
  await audit(admin.id, "settings.save", "settings", group, { keys: changed });
  revalidatePath("/", "layout");
  back("/admin/settings", { msg: `${group} saved`, g: group });
}

// ───────────── Reports, feedback, verification ─────────────

export async function resolveReportAction(form: FormData) {
  const admin = await requireStaff();
  const id = s(form, "rid");
  const op = s(form, "op");
  const [r] = await db.select().from(t.reports).where(eq(t.reports.id, id));
  if (!r) back("/admin/reports");
  if (op === "hide_profile") await db.update(t.profiles).set({ status: "HIDDEN" }).where(eq(t.profiles.id, r.profileId));
  if (op === "suspend_user" && admin.role === "ADMIN") {
    const [p] = await db.select().from(t.profiles).where(eq(t.profiles.id, r.profileId));
    if (p) {
      await db.update(t.users).set({ status: "SUSPENDED" }).where(eq(t.users.id, p.userId));
      await db.update(t.profiles).set({ status: "HIDDEN" }).where(eq(t.profiles.userId, p.userId));
    }
  }
  await db.update(t.reports).set({ status: op === "dismiss" ? "DISMISSED" : "ACTIONED", adminNote: s(form, "note") || null, resolvedAt: new Date() }).where(eq(t.reports.id, id));
  await audit(admin.id, `report.${op}`, "report", id, { profileId: r.profileId });
  back("/admin/reports", { msg: "Saved" });
}

export async function saveReasonAction(form: FormData) {
  const admin = await requireAdmin();
  const id = s(form, "rid");
  const label = l10n(form, "label");
  if (!label.en) back("/admin/reports", { err: "English label is required" });
  const values = { label, active: b(form, "active"), order: Number(s(form, "order")) || 0 };
  if (id) await db.update(t.reportReasons).set(values).where(eq(t.reportReasons.id, id));
  else await db.insert(t.reportReasons).values({ ...values, key: slug(label.en) });
  await audit(admin.id, "report_reason.save", "report_reason", id || undefined, values);
  back("/admin/reports", { msg: "Saved", tab: "reasons" });
}

export async function feedbackVisibilityAction(form: FormData) {
  const admin = await requireStaff();
  await db.update(t.feedbacks).set({ hidden: s(form, "hidden") === "1" }).where(eq(t.feedbacks.id, s(form, "rid")));
  await audit(admin.id, "feedback.visibility", "feedback", s(form, "rid"), { hidden: s(form, "hidden") });
  back("/admin/feedback");
}

export async function reviewVerificationAction(form: FormData) {
  const admin = await requireStaff();
  const id = s(form, "rid");
  const approve = s(form, "op") === "approve";
  const [v] = await db.select().from(t.photoVerifications).where(eq(t.photoVerifications.id, id));
  if (!v) back("/admin/verifications");
  await db.update(t.photoVerifications).set({ status: approve ? "APPROVED" : "REJECTED", reviewerId: admin.id, reviewedAt: new Date(), note: s(form, "note") || null }).where(eq(t.photoVerifications.id, id));
  const [p] = await db.select().from(t.profiles).where(eq(t.profiles.id, v.profileId));
  if (approve && p) {
    await db.update(t.profiles).set({ photoVerified: true }).where(eq(t.profiles.id, p.id));
    await notify(p.userId, "PHOTO_VERIFIED", { code: p.code }, `/p/${p.code}`);
  }
  await audit(admin.id, `verification.${approve ? "approve" : "reject"}`, "profile", v.profileId);
  back("/admin/verifications", { msg: "Saved" });
}

export async function refundOrderAction(form: FormData) {
  const admin = await requireAdmin();
  const [o] = await db.select().from(t.paymentOrders).where(eq(t.paymentOrders.id, s(form, "rid")));
  if (!o || o.status !== "PAID") back("/admin/finance", { err: "Only paid orders can be marked refunded" });
  // Refund money in the gateway dashboard first; this records it and claws back unused credits.
  const [u] = await db.select().from(t.users).where(eq(t.users.id, o.userId));
  const claw = Math.min(u.credits, o.credits);
  await db.transaction(async (tx) => {
    await tx.update(t.paymentOrders).set({ status: "REFUNDED" }).where(eq(t.paymentOrders.id, o.id));
    if (claw > 0) await changeCredits(tx, { userId: o.userId, delta: -claw, reason: "REFUND", refId: o.id, actorId: admin.id, note: "Order refunded" });
  });
  await audit(admin.id, "payment.refund", "order", o.id, { creditsRemoved: claw, total: o.totalPaise });
  back("/admin/finance", { msg: "Order marked refunded" });
}

// ───────────── Success stories & comments moderation ─────────────

export async function moderateStoryAction(form: FormData) {
  const admin = await requireStaff();
  const id = s(form, "rid");
  const op = s(form, "op");
  const [st] = await db.select().from(t.stories).where(eq(t.stories.id, id));
  if (!st) back("/admin/moderation");
  if (op === "publish") {
    await db.update(t.stories).set({ status: "PUBLISHED", flagReason: null, reportCount: 0, publishedAt: st.publishedAt ?? new Date() }).where(eq(t.stories.id, id));
    await notify(st.userId, "STORY_PUBLISHED", {}, `/stories/${id}`);
  } else if (op === "remove") {
    await db.update(t.stories).set({ status: "REMOVED" }).where(eq(t.stories.id, id));
  }
  await audit(admin.id, `story.${op}`, "story", id, { flag: st.flagReason });
  back("/admin/moderation", { msg: `Story ${op} ✓` });
}

export async function moderateCommentAction(form: FormData) {
  const admin = await requireStaff();
  const id = s(form, "rid");
  const op = s(form, "op");
  const [c] = await db.select().from(t.storyComments).where(eq(t.storyComments.id, id));
  if (!c) back("/admin/moderation", { tab: "comments" });
  const wasLive = c.status === "PUBLISHED";
  const status = op === "publish" ? "PUBLISHED" : "REMOVED";
  await db.update(t.storyComments).set({ status, reportCount: op === "publish" ? 0 : c.reportCount }).where(eq(t.storyComments.id, id));
  const delta = (status === "PUBLISHED" ? 1 : 0) - (wasLive ? 1 : 0);
  if (delta) await db.update(t.stories).set({ commentCount: sql`greatest(${t.stories.commentCount} + ${delta}, 0)` }).where(eq(t.stories.id, c.storyId));
  await audit(admin.id, `comment.${op}`, "comment", id, { body: c.body.slice(0, 200), flag: c.flagReason });
  back("/admin/moderation", { tab: "comments", msg: `Comment ${op} ✓` });
}
