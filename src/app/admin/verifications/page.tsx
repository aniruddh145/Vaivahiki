import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, t } from "@/db";
import { requireStaff } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { Flash } from "@/components/server";
import { reviewVerificationAction } from "../actions";

export default async function Verifications({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  await requireStaff();
  const s = await getSettings();
  const status = sp.status ?? "PENDING";
  const rows = await db
    .select({ v: t.photoVerifications, p: t.profiles })
    .from(t.photoVerifications)
    .innerJoin(t.profiles, eq(t.profiles.id, t.photoVerifications.profileId))
    .where(eq(t.photoVerifications.status, status))
    .orderBy(desc(t.photoVerifications.createdAt))
    .limit(50);
  const photos = rows.length ? await db.select().from(t.photos).where(and(inArray(t.photos.profileId, rows.map((r) => r.p.id)))) : [];
  return (
    <div className="space-y-4">
      <h1 className="h1">Photo verification</h1>
      <Flash sp={sp} />
      {!s.bool("verify.selfieEnabled") && <p className="rounded bg-amber-50 p-3 text-sm text-amber-800">Selfie verification is currently switched off for members. Turn it on in Settings → Verification.</p>}
      <div className="flex gap-2">
        {["PENDING", "APPROVED", "REJECTED"].map((x) => <Link key={x} href={`?status=${x}`} className={x === status ? "btn-maroon btn-sm" : "btn-outline btn-sm"}>{x}</Link>)}
      </div>
      {rows.map(({ v, p }) => (
        <div key={v.id} className="card p-4">
          <div className="mb-2 text-sm"><Link className="link font-semibold" href={`/p/${p.code}`} target="_blank">{p.fullName} ({p.code})</Link> · submitted {v.createdAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</div>
          <div className="flex flex-wrap gap-4">
            <div>
              <div className="muted mb-1">Selfie</div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={v.selfieUrl} alt="selfie" className="h-48 w-48 rounded-lg border-4 border-brand-200 object-cover" />
            </div>
            <div>
              <div className="muted mb-1">Profile photos</div>
              <div className="flex flex-wrap gap-2">
                {photos.filter((x) => x.profileId === p.id).map((x) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={x.id} src={x.url} alt="" className="h-48 w-48 rounded-lg object-cover" />
                ))}
              </div>
            </div>
          </div>
          {v.status === "PENDING" ? (
            <form action={reviewVerificationAction} className="mt-3 flex flex-wrap gap-2">
              <input type="hidden" name="rid" value={v.id} />
              <button name="op" value="approve" className="btn-primary btn-sm">Same person – verify</button>
              <input name="note" placeholder="Note to member (for reject)" className="input w-64 py-1 text-xs" />
              <button name="op" value="reject" className="btn-outline btn-sm">Reject</button>
            </form>
          ) : (
            <div className="mt-2 text-sm text-stone-500">{v.status} {v.reviewedAt?.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} {v.note}</div>
          )}
        </div>
      ))}
      {rows.length === 0 && <div className="card p-10 text-center muted">Nothing to review</div>}
    </div>
  );
}
