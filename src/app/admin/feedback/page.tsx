import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, t } from "@/db";
import { requireStaff } from "@/lib/auth";
import { feedbackVisibilityAction } from "../actions";

export default async function Feedback() {
  await requireStaff();
  const rows = await db
    .select({ f: t.feedbacks, p: t.profiles, u: t.users })
    .from(t.feedbacks)
    .innerJoin(t.profiles, eq(t.profiles.id, t.feedbacks.profileId))
    .innerJoin(t.users, eq(t.users.id, t.feedbacks.userId))
    .orderBy(desc(t.feedbacks.createdAt))
    .limit(200);
  return (
    <div className="space-y-4">
      <h1 className="h1">Member feedback</h1>
      <p className="muted">Feedback is only possible after a member has unlocked contacts or exchanged an interest. Hide anything abusive.</p>
      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>Date</th><th>About</th><th>By</th><th>Rating</th><th>Comment</th><th></th></tr></thead>
          <tbody>
            {rows.map(({ f, p, u }) => (
              <tr key={f.id} className={f.hidden ? "opacity-50" : ""}>
                <td className="whitespace-nowrap">{f.createdAt.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}</td>
                <td><Link className="link" href={`/p/${p.code}`} target="_blank">{p.code}</Link></td>
                <td><Link className="link" href={`/admin/users/${u.id}`}>{u.name}</Link></td>
                <td className="whitespace-nowrap text-amber-600">{"★".repeat(f.rating)}</td>
                <td>{f.interaction && <span className="badge bg-stone-100">{f.interaction}</span>} {f.comment}</td>
                <td>
                  <form action={feedbackVisibilityAction}>
                    <input type="hidden" name="rid" value={f.id} />
                    <button name="hidden" value={f.hidden ? "0" : "1"} className="btn-ghost btn-sm">{f.hidden ? "Show" : "Hide"}</button>
                  </form>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="text-center muted">No feedback yet</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
