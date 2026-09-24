import Link from "next/link";
import { and, count, eq, inArray } from "drizzle-orm";
import { db, t } from "@/db";
import { requireMember } from "@/lib/member";
import { getT } from "@/lib/i18n";
import { getSettings } from "@/lib/settings";
import { ageFrom } from "@/lib/services";
import { Avatar, Flash } from "@/components/server";
import { setProfileStatusAction } from "../actions/profile";

const STATUS_COLOR: Record<string, string> = {
  DRAFT: "bg-stone-100 text-stone-600",
  PENDING: "bg-amber-100 text-amber-800",
  APPROVED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
  HIDDEN: "bg-stone-200 text-stone-700",
  MARRIED: "bg-pink-100 text-pink-700",
};

export default async function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const u = await requireMember();
  const [{ t: tr }, s] = await Promise.all([getT(), getSettings()]);
  const profiles = await db.select().from(t.profiles).where(eq(t.profiles.userId, u.id));
  const ids = profiles.map((p) => p.id);
  const photos = ids.length ? await db.select().from(t.photos).where(and(inArray(t.photos.profileId, ids), eq(t.photos.isPrimary, true))) : [];
  const recv = ids.length
    ? await db.select({ id: t.interests.toProfileId, n: count() }).from(t.interests).where(inArray(t.interests.toProfileId, ids)).groupBy(t.interests.toProfileId)
    : [];

  return (
    <div className="container-x py-8">
      <Flash sp={sp} />
      {s.bool("auth.requireMobileVerification") === false && u.mobile && !u.mobileVerified && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {tr("dash.mobileNotVerified")}
          <Link className="btn-outline btn-sm" href="/verify-mobile">{tr("dash.verifyNow")}</Link>
        </div>
      )}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="h1">{tr("dash.title")}</h1>
        <div className="flex gap-2">
          <Link className="btn-outline" href="/account">{tr("dash.account")}</Link>
          <Link className="btn-primary" href="/profiles/new">+ {tr("dash.createProfile")}</Link>
        </div>
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <div className="card p-5">
          <div className="muted">{tr("dash.credits")}</div>
          <div className="mt-1 text-3xl font-bold text-brand-700">{u.credits}</div>
          <Link href="/wallet" className="link text-sm">{tr("dash.buyCredits")} →</Link>
        </div>
        <Link href="/interests" className="card p-5 hover:border-brand-200">
          <div className="muted">{tr("dash.interestsReceived")}</div>
          <div className="mt-1 text-3xl font-bold">{recv.reduce((a, r) => a + r.n, 0)}</div>
        </Link>
        <Link href="/shortlist" className="card p-5 hover:border-brand-200">
          <div className="muted">{tr("nav.shortlist")}</div>
          <div className="mt-1 text-3xl font-bold">→</div>
        </Link>
      </div>

      <h2 className="h2 mb-3">{tr("dash.myProfiles")}</h2>
      {profiles.length === 0 && (
        <div className="card p-8 text-center">
          <p className="mb-4 muted">{tr("common.none")}</p>
          <Link className="btn-primary" href="/profiles/new">{tr("profile.create")}</Link>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {profiles.map((p) => (
          <div key={p.id} className="card p-4">
            <div className="flex gap-4">
              <Avatar name={p.fullName} url={photos.find((x) => x.profileId === p.id)?.url} size={80} />
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{p.fullName}</span>
                  <span className={`badge ${STATUS_COLOR[p.status]}`}>{tr(`status.${p.status}`)}</span>
                  {p.photoVerified && <span className="badge bg-green-100 text-green-700">✓ {tr("profile.photoVerified")}</span>}
                </div>
                <div className="muted">{p.code} · {ageFrom(p.dateOfBirth)} {tr("common.years")} · {s.bool("profile.showViewCount") && `${tr("dash.views")}: ${p.views}`}</div>
                {p.status === "REJECTED" && p.rejectReason && <div className="mt-1 text-sm text-red-700">{tr("profile.rejectReason")}: {p.rejectReason}</div>}
                {p.status === "PENDING" && <div className="mt-1 text-xs text-amber-700">{tr("profile.pendingNote")}</div>}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link className="btn-outline btn-sm" href={`/profiles/${p.id}/edit`}>{tr("common.edit")}</Link>
              <Link className="btn-outline btn-sm" href={`/p/${p.code}`}>{tr("common.view")}</Link>
              {p.status === "MARRIED" && s.bool("stories.enabled") && <Link className="btn-primary btn-sm" href={`/stories/new?profile=${p.id}`}>💍 {tr("story.share")}</Link>}
              {s.bool("verify.selfieEnabled") && !p.photoVerified && <Link className="btn-outline btn-sm" href={`/profiles/${p.id}/verify`}>{tr("profile.verifyPhoto")}</Link>}
              <form action={setProfileStatusAction} className="contents">
                <input type="hidden" name="rid" value={p.id} />
                {["APPROVED", "PENDING"].includes(p.status) && <button name="to" value="HIDDEN" className="btn-ghost btn-sm">{tr("profile.hide")}</button>}
                {["HIDDEN", "MARRIED"].includes(p.status) && <button name="to" value="SHOW" className="btn-ghost btn-sm">{tr("profile.unhide")}</button>}
                {p.status !== "MARRIED" && <button name="to" value="MARRIED" className="btn-ghost btn-sm">{tr("profile.markMarried")}</button>}
              </form>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
