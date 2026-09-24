"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, t } from "@/db";
import {
  createSession, destroySession, findUserByIdentifier, getUser, hashPassword, isEmail, normalizeMobile, requireUser, verifyPassword,
} from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { checkOtp, sendOtp } from "@/lib/otp";
import { audit, changeCredits } from "@/lib/services";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const back = (path: string, params: Record<string, string>) => redirect(`${path}?${new URLSearchParams(params)}`);

export async function setLangAction(form: FormData) {
  const lang = s(form, "lang");
  (await cookies()).set("lang", lang, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  const u = await getUser();
  if (u) await db.update(t.users).set({ lang }).where(eq(t.users.id, u.id));
  const ref = (await headers()).get("referer");
  redirect(ref ? new URL(ref).pathname + new URL(ref).search : "/");
}

export async function logoutAction() {
  await destroySession();
  redirect("/");
}

async function afterLogin(userId: string, lang: string, next?: string) {
  await createSession(userId);
  (await cookies()).set("lang", lang, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  redirect(next && next.startsWith("/") ? next : "/dashboard");
}

export async function loginPasswordAction(form: FormData) {
  const st = await getSettings();
  if (!st.bool("auth.allowPasswordLogin")) back("/login", { err: "auth.err.invalid" });
  const u = await findUserByIdentifier(s(form, "identifier"));
  if (!u || !(await verifyPassword(s(form, "password"), u.passwordHash))) back("/login", { err: "auth.err.invalid", id: s(form, "identifier") });
  if (u!.status !== "ACTIVE") back("/login", { err: "auth.err.blocked" });
  await afterLogin(u!.id, u!.lang, s(form, "next"));
}

export async function loginOtpSendAction(form: FormData) {
  const st = await getSettings();
  const raw = s(form, "identifier");
  if (!st.bool("auth.allowOtpLogin")) back("/login", { err: "auth.err.invalid" });
  const u = await findUserByIdentifier(raw);
  if (!u) back("/login", { mode: "otp", err: "auth.err.notFound", id: raw });
  const target = isEmail(raw) ? u!.email! : u!.mobile!;
  let dev: string | undefined;
  try {
    dev = (await sendOtp(target, "LOGIN")).devCode;
  } catch (e) {
    back("/login", { mode: "otp", err: (e as Error).message, id: raw });
  }
  back("/login", { mode: "otp", sent: "1", id: raw, ...(dev ? { dev } : {}) });
}

export async function loginOtpVerifyAction(form: FormData) {
  const raw = s(form, "identifier");
  const u = await findUserByIdentifier(raw);
  if (!u) back("/login", { mode: "otp", err: "auth.err.notFound" });
  const target = isEmail(raw) ? u!.email! : u!.mobile!;
  if (!(await checkOtp(target, "LOGIN", s(form, "otp")))) back("/login", { mode: "otp", sent: "1", id: raw, err: "auth.err.otp" });
  if (u!.status !== "ACTIVE") back("/login", { err: "auth.err.blocked" });
  // A successful OTP to the mobile/email also proves ownership
  await db.update(t.users).set(isEmail(raw) ? { emailVerified: true } : { mobileVerified: true }).where(eq(t.users.id, u!.id));
  await afterLogin(u!.id, u!.lang, s(form, "next"));
}

export async function registerAction(form: FormData) {
  const st = await getSettings();
  const name = s(form, "name");
  const mobileRaw = s(form, "mobile");
  const emailRaw = s(form, "email").toLowerCase();
  const password = s(form, "password");
  const keep = { name, mobile: mobileRaw, email: emailRaw };
  const mobile = mobileRaw ? normalizeMobile(mobileRaw) : null;
  if (!name) back("/register", { err: "auth.name", ...keep });
  if ((st.bool("auth.requireMobile") || !emailRaw) && !mobile) back("/register", { err: "auth.err.mobileRequired", ...keep });
  if (st.bool("auth.requireEmail") && !isEmail(emailRaw)) back("/register", { err: "auth.err.emailRequired", ...keep });
  if (emailRaw && !isEmail(emailRaw)) back("/register", { err: "auth.err.emailRequired", ...keep });
  if (password.length < 6) back("/register", { err: "auth.err.passwordShort", ...keep });
  if (password !== s(form, "confirm")) back("/register", { err: "auth.err.passwordMatch", ...keep });

  if (mobile && (await findUserByIdentifier(mobile))) back("/register", { err: "auth.err.exists", ...keep });
  if (emailRaw && (await findUserByIdentifier(emailRaw))) back("/register", { err: "auth.err.exists", ...keep });

  const lang = (await cookies()).get("lang")?.value || "hi";
  const [u] = await db
    .insert(t.users)
    .values({ name, mobile, email: emailRaw || null, passwordHash: await hashPassword(password), lang })
    .returning();
  const bonus = st.int("credits.signupBonus");
  if (bonus > 0) await changeCredits(db, { userId: u.id, delta: bonus, reason: "SIGNUP_BONUS" });
  await audit(u.id, "user.register", "user", u.id);
  await createSession(u.id);
  if (st.bool("auth.requireMobileVerification") && mobile) redirect("/verify-mobile");
  redirect("/dashboard?msg=common.saved");
}

export async function sendVerifyOtpAction() {
  const u = await requireUser();
  if (!u.mobile) redirect("/account");
  let dev: string | undefined;
  try {
    dev = (await sendOtp(u.mobile, "VERIFY")).devCode;
  } catch (e) {
    back("/verify-mobile", { err: (e as Error).message });
  }
  back("/verify-mobile", { sent: "1", ...(dev ? { dev } : {}) });
}

export async function verifyMobileAction(form: FormData) {
  const u = await requireUser();
  if (!u.mobile || !(await checkOtp(u.mobile, "VERIFY", s(form, "otp")))) back("/verify-mobile", { sent: "1", err: "auth.err.otp" });
  await db.update(t.users).set({ mobileVerified: true }).where(eq(t.users.id, u.id));
  redirect("/dashboard?msg=profile.mobileVerified");
}

export async function updateAccountAction(form: FormData) {
  const u = await requireUser();
  const name = s(form, "name") || u.name;
  const emailRaw = s(form, "email").toLowerCase();
  const mobileRaw = s(form, "mobile");
  const mobile = mobileRaw ? normalizeMobile(mobileRaw) : null;
  if (emailRaw && !isEmail(emailRaw)) back("/account", { err: "auth.err.emailRequired" });
  if (mobileRaw && !mobile) back("/account", { err: "auth.err.mobileRequired" });
  if (emailRaw && emailRaw !== u.email) {
    const other = await findUserByIdentifier(emailRaw);
    if (other && other.id !== u.id) back("/account", { err: "auth.err.exists" });
  }
  if (mobile && mobile !== u.mobile) {
    const other = await findUserByIdentifier(mobile);
    if (other && other.id !== u.id) back("/account", { err: "auth.err.exists" });
  }
  const pw = s(form, "password");
  if (pw && pw.length < 6) back("/account", { err: "auth.err.passwordShort" });
  await db
    .update(t.users)
    .set({
      name,
      email: emailRaw || null,
      mobile: mobile || u.mobile,
      mobileVerified: mobile && mobile !== u.mobile ? false : u.mobileVerified,
      emailVerified: emailRaw !== (u.email ?? "") ? false : u.emailVerified,
      lang: s(form, "lang") || u.lang,
      billingName: s(form, "billingName") || null,
      billingAddress: s(form, "billingAddress") || null,
      billingState: s(form, "billingState") || null,
      gstin: s(form, "gstin").toUpperCase() || null,
      ...(pw ? { passwordHash: await hashPassword(pw) } : {}),
    })
    .where(eq(t.users.id, u.id));
  if (s(form, "lang")) (await cookies()).set("lang", s(form, "lang"), { path: "/", maxAge: 60 * 60 * 24 * 365 });
  back("/account", { msg: "account.saved" });
}
