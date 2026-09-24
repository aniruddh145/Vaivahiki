import { asc, count } from "drizzle-orm";
import { db, t } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { pickL } from "@/lib/i18n";
import { Flash } from "@/components/server";
import { saveCommunityAction } from "../actions";
import { Check, L10nInputs } from "../_components";

export default async function Communities({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  await requireAdmin();
  const rows = await db.select().from(t.communities).orderBy(asc(t.communities.order));
  const counts = await db.select({ id: t.profiles.communityId, n: count() }).from(t.profiles).groupBy(t.profiles.communityId);
  const Form = ({ c }: { c?: (typeof rows)[number] }) => (
    <form action={saveCommunityAction} className="space-y-3">
      {c && <input type="hidden" name="rid" value={c.id} />}
      <L10nInputs prefix="name" value={c?.name} label="Name" required />
      <L10nInputs prefix="desc" value={c?.description} label="Description (optional)" textarea />
      <div className="flex flex-wrap items-end gap-4">
        <div><label className="label">Profile ID prefix</label><input name="codePrefix" defaultValue={c?.codePrefix ?? ""} className="input w-28" placeholder="e.g. SIN" /></div>
        <div><label className="label">Order</label><input name="order" type="number" defaultValue={c?.order ?? rows.length} className="input w-24" /></div>
        <Check name="active" label="Active (members can choose it)" checked={c?.active ?? true} />
        <button className="btn-primary">Save</button>
      </div>
    </form>
  );
  return (
    <div className="space-y-4">
      <h1 className="h1">Communities / Samaj</h1>
      <p className="muted">Each community gets its own profile ID series (e.g. DNB1001, SIN1001). Fields can be limited to specific communities in Biodata fields. When more than one community is active, members pick one while creating a biodata and can filter by it in search.</p>
      <Flash sp={sp} />
      {rows.map((c) => (
        <details key={c.id} className="card p-4">
          <summary className="cursor-pointer">
            <b>{pickL(c.name, "en")}</b> / {pickL(c.name, "hi")} · {c.codePrefix} · {counts.find((x) => x.id === c.id)?.n ?? 0} profiles {c.active ? <span className="badge bg-green-100 text-green-700">active</span> : <span className="badge bg-stone-100">inactive</span>}
          </summary>
          <div className="mt-3"><Form c={c} /></div>
        </details>
      ))}
      <details className="card border-dashed p-4">
        <summary className="cursor-pointer font-medium">+ Add community</summary>
        <div className="mt-3"><Form /></div>
      </details>
    </div>
  );
}
