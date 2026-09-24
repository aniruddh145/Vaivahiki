import Link from "next/link";
import { desc, eq, gt, inArray, or } from "drizzle-orm";
import { db, t } from "@/db";
import { requireStaff } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { Flash } from "@/components/server";
import { moderateCommentAction, moderateStoryAction } from "../actions";

const COLOR: Record<string, string> = {
  FLAGGED: "bg-red-100 text-red-700", PENDING: "bg-amber-100 text-amber-800", AWAITING_PARTNER: "bg-blue-100 text-blue-700",
  PUBLISHED: "bg-green-100 text-green-700", REMOVED: "bg-stone-200 text-stone-600",
};

export default async function Moderation({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  await requireStaff();
  const s = await getSettings();
  const tab = sp.tab === "comments" ? "comments" : sp.tab === "all" ? "all" : "stories";

  const stories = tab !== "comments"
    ? await db.select({ st: t.stories, name: t.users.name }).from(t.stories).innerJoin(t.users, eq(t.users.id, t.stories.userId))
        .where(tab === "all" ? undefined : or(inArray(t.stories.status, ["FLAGGED", "PENDING", "AWAITING_PARTNER"]), gt(t.stories.reportCount, 0)))
        .orderBy(desc(t.stories.createdAt)).limit(100)
    : [];
  const comments = tab === "comments"
    ? await db.select({ c: t.storyComments, name: t.users.name, userId: t.users.id, couple: t.stories.coupleNames }).from(t.storyComments)
        .innerJoin(t.users, eq(t.users.id, t.storyComments.userId)).innerJoin(t.stories, eq(t.stories.id, t.storyComments.storyId))
        .where(or(eq(t.storyComments.status, "FLAGGED"), gt(t.storyComments.reportCount, 0)))
        .orderBy(desc(t.storyComments.createdAt)).limit(200)
    : [];
  const ai = s.str("moderation.provider");

  return (
    <div className="space-y-4">
      <h1 className="h1">Stories & comments moderation</h1>
      <p className="muted">
        Every story and comment is checked automatically: blocked-word list{s.bool("moderation.blockContactsInComments") && ", phone numbers / links / emails in comments"}
        {ai !== "none" && s.str("moderation.apiKey") ? `, and an AI meaning check (${ai})` : " (AI meaning check is off – add a key in Settings → Spam & moderation)"}.
        Anything flagged is hidden until you decide here. Items reported by {s.int("moderation.autoHideReports")}+ members are hidden automatically.
      </p>
      <Flash sp={sp} />
      <div className="flex flex-wrap gap-2">
        <Link href="?tab=stories" className={tab === "stories" ? "btn-maroon btn-sm" : "btn-outline btn-sm"}>Stories needing action</Link>
        <Link href="?tab=comments" className={tab === "comments" ? "btn-maroon btn-sm" : "btn-outline btn-sm"}>Flagged / reported comments</Link>
        <Link href="?tab=all" className={tab === "all" ? "btn-maroon btn-sm" : "btn-outline btn-sm"}>All stories</Link>
        <Link href="/admin/settings?g=Spam%20%26%20moderation" className="btn-ghost btn-sm ml-auto">Edit blocked words →</Link>
      </div>

      {tab !== "comments" && (
        <div className="space-y-3">
          {stories.map(({ st, name }) => (
            <div key={st.id} className="card p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/stories/${st.id}`} target="_blank" className="font-semibold hover:underline">💍 {st.coupleNames}</Link>
                <span className={`badge ${COLOR[st.status]}`}>{st.status}</span>
                <span className="badge bg-stone-100">{st.visibility}</span>
                {st.reportCount > 0 && <span className="badge bg-red-50 text-red-700">⚑ {st.reportCount} reports</span>}
                <span className="text-stone-500">by {name} · {st.createdAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "short", timeStyle: "short" })}</span>
              </div>
              {st.flagReason && <div className="mt-1 text-red-700">Why flagged: {st.flagReason}</div>}
              {st.message && <p className="mt-2 line-clamp-3 rounded bg-stone-50 p-2">{st.message}</p>}
              <div className="mt-2 flex gap-2">
                {st.photos.slice(0, 6).map((u) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <a key={u} href={u} target="_blank"><img src={u} alt="" className="h-16 w-16 rounded object-cover" /></a>
                ))}
              </div>
              <form action={moderateStoryAction} className="mt-3 flex gap-2">
                <input type="hidden" name="rid" value={st.id} />
                {st.status !== "PUBLISHED" && <button name="op" value="publish" className="btn-primary btn-sm">Publish</button>}
                {st.status === "PUBLISHED" && st.reportCount > 0 && <button name="op" value="publish" className="btn-outline btn-sm">Keep (clear reports)</button>}
                {st.status !== "REMOVED" && <button name="op" value="remove" className="btn-danger btn-sm">Remove</button>}
              </form>
            </div>
          ))}
          {stories.length === 0 && <div className="card p-10 text-center muted">Nothing needs attention 🎉</div>}
        </div>
      )}

      {tab === "comments" && (
        <div className="card overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>When</th><th>By</th><th>On story</th><th>Comment</th><th>Why</th><th></th></tr></thead>
            <tbody>
              {comments.map(({ c, name, userId, couple }) => (
                <tr key={c.id}>
                  <td className="whitespace-nowrap">{c.createdAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "short", timeStyle: "short" })}</td>
                  <td><Link className="link" href={`/admin/users/${userId}`}>{name}</Link></td>
                  <td><Link className="link" href={`/stories/${c.storyId}`} target="_blank">{couple}</Link></td>
                  <td className="max-w-xs">{c.body}</td>
                  <td className="text-xs text-red-700">{c.flagReason}{c.reportCount > 0 && ` · ⚑ ${c.reportCount}`} <span className="badge bg-stone-100 text-stone-600">{c.status}</span></td>
                  <td>
                    <form action={moderateCommentAction} className="flex gap-1">
                      <input type="hidden" name="rid" value={c.id} />
                      <button name="op" value="publish" className="btn-outline btn-sm">Allow</button>
                      <button name="op" value="remove" className="btn-danger btn-sm">Remove</button>
                    </form>
                  </td>
                </tr>
              ))}
              {comments.length === 0 && <tr><td colSpan={6} className="text-center muted">No flagged comments</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
