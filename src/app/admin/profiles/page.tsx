import Link from "next/link";
import { and, desc, eq, ilike, or, inArray, type SQL } from "drizzle-orm";
import { db, t } from "@/db";
import { requireStaff } from "@/lib/auth";
import { ageFrom } from "@/lib/services";
import { Avatar, Flash, Pager } from "@/components/server";
import { ConfirmButton } from "@/components/ui";
import { moderateProfileAction, moderatePhotoAction } from "../actions";

const STATUSES = ["PENDING", "APPROVED", "REJECTED", "DRAFT", "HIDDEN", "MARRIED"];
const PER = 25;

export default async function AdminProfiles({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const admin = await requireStaff();
  const status = sp.status ?? "PENDING";
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, Number(sp.page) || 1);
  const where: SQL[] = [];
  if (status !== "ALL") where.push(eq(t.profiles.status, status));
  if (q) where.push(or(ilike(t.profiles.fullName, `%${q}%`), ilike(t.profiles.code, `%${q}%`), ilike(t.users.mobile, `%${q}%`))!);
  const rows = await db
    .select({ p: t.profiles, u: t.users })
    .from(t.profiles)
    .innerJoin(t.users, eq(t.users.id, t.profiles.userId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(t.profiles.updatedAt))
    .limit(PER + 1)
    .offset((page - 1) * PER);
  const hasMore = rows.length > PER;
  const list = rows.slice(0, PER);
  const photos = list.length ? await db.select().from(t.photos).where(inArray(t.photos.profileId, list.map((r) => r.p.id))) : [];
  const ret = `/admin/profiles?status=${status}&q=${encodeURIComponent(q)}&page=${page}`;
  const base = new URLSearchParams({ status, q });

  return (
    <div className="space-y-4">
      <h1 className="h1">Profiles & approvals</h1>
      <Flash sp={sp} />
      <form className="flex flex-wrap gap-2">
        <select name="status" defaultValue={status} className="input w-auto">
          <option value="ALL">All</option>
          {STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <input name="q" defaultValue={q} placeholder="Name, profile ID or mobile" className="input w-64" />
        <button className="btn-primary">Filter</button>
      </form>

      <div className="space-y-3">
        {list.map(({ p, u }) => {
          const ph = photos.filter((x) => x.profileId === p.id);
          return (
            <div key={p.id} className="card p-4">
              <div className="flex flex-wrap gap-4">
                <Avatar name={p.fullName} url={ph.find((x) => x.isPrimary)?.url} size={72} />
                <div className="min-w-0 flex-1 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/p/${p.code}`} target="_blank" className="font-semibold hover:underline">{p.fullName}</Link>
                    <span className="badge bg-stone-100">{p.code}</span>
                    <span className="badge bg-amber-100 text-amber-800">{p.status}</span>
                    {p.photoVerified && <span className="badge bg-green-100 text-green-700">photo ✓</span>}
                    {p.featuredUntil && p.featuredUntil > new Date() && <span className="badge bg-purple-100 text-purple-700">featured</span>}
                  </div>
                  <div className="text-stone-500">
                    {p.gender} · {ageFrom(p.dateOfBirth)} yrs · account: <Link className="link" href={`/admin/users/${u.id}`}>{u.name}</Link> {u.mobile} {u.mobileVerified ? "✓" : "(unverified)"} · updated {p.updatedAt.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}
                  </div>
                  {p.rejectReason && <div className="text-red-700">Reject reason: {p.rejectReason}</div>}
                  {ph.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {ph.map((x) => (
                        <div key={x.id} className="text-center">
                          <a href={x.url} target="_blank">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={x.url} alt="" className={`h-16 w-16 rounded object-cover ${x.status === "REJECTED" ? "opacity-30" : ""}`} />
                          </a>
                          {x.status !== "APPROVED" && (
                            <form action={moderatePhotoAction} className="mt-1 flex gap-1">
                              <input type="hidden" name="photoId" value={x.id} />
                              <input type="hidden" name="return" value={ret} />
                              <button name="op" value="approve" className="btn-ghost btn-sm px-1 text-green-700">✓</button>
                              {x.status === "PENDING" && <button name="op" value="reject" className="btn-ghost btn-sm px-1 text-red-700">✗</button>}
                            </form>
                          )}
                          {x.status === "APPROVED" && (
                            <form action={moderatePhotoAction}>
                              <input type="hidden" name="photoId" value={x.id} />
                              <input type="hidden" name="return" value={ret} />
                              <button name="op" value="reject" className="text-[10px] text-red-600">remove</button>
                            </form>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <form action={moderateProfileAction} className="mt-3 flex flex-wrap items-center gap-2 border-t border-stone-100 pt-3">
                <input type="hidden" name="rid" value={p.id} />
                <input type="hidden" name="return" value={ret} />
                {p.status !== "APPROVED" && <button name="op" value="approve" className="btn-primary btn-sm">Approve</button>}
                <input name="reason" placeholder="Reason (for reject)" className="input w-48 py-1 text-xs" />
                <button name="op" value="reject" className="btn-outline btn-sm">Reject</button>
                {p.status === "APPROVED" && <button name="op" value="hide" className="btn-outline btn-sm">Hide</button>}
                <button name="op" value="verify" className="btn-ghost btn-sm">{p.photoVerified ? "Remove verified badge" : "Mark photo verified"}</button>
                <select name="days" className="input w-auto py-1 text-xs" defaultValue="30">
                  <option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option><option value="0">Unfeature</option>
                </select>
                <button name="op" value="feature" className="btn-ghost btn-sm">Feature</button>
                {admin.role === "ADMIN" && <span className="ml-auto"><ConfirmButton name="op" value="delete" message={`Delete ${p.code} permanently?`}>Delete</ConfirmButton></span>}
              </form>
            </div>
          );
        })}
        {list.length === 0 && <div className="card p-10 text-center muted">No profiles</div>}
      </div>
      <Pager page={page} pages={hasMore ? page + 1 : page} base={base} />
    </div>
  );
}
