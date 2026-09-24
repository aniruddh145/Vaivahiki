import Link from "next/link";
import { asc } from "drizzle-orm";
import { db, t } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { pickL } from "@/lib/i18n";
import { Flash } from "@/components/server";
import { saveSectionAction } from "../actions";
import { Check, L10nInputs } from "../_components";

const VIS_COLOR: Record<string, string> = { PUBLIC: "bg-green-100 text-green-700", MEMBERS: "bg-blue-100 text-blue-700", PREMIUM: "bg-amber-100 text-amber-800", PRIVATE: "bg-stone-200 text-stone-700" };

export default async function Fields({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  await requireAdmin();
  const sections = await db.select().from(t.fieldSections).orderBy(asc(t.fieldSections.order));
  const fields = await db.select().from(t.fieldDefinitions).orderBy(asc(t.fieldDefinitions.order));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="h1">Biodata fields</h1>
        <Link href="/admin/fields/new" className="btn-primary">+ New field</Link>
      </div>
      <p className="muted">
        Everything members fill in the biodata comes from here. <b>Visibility</b>: PUBLIC = anyone, MEMBERS = logged-in members, PREMIUM = only after contact unlock / accepted interest, PRIVATE = owner & admin only.
        <b> Filterable</b> fields appear as search filters automatically; <b>Card</b> fields show on search result cards.
      </p>
      <Flash sp={sp} />
      {sections.map((sec) => {
        const fs = fields.filter((f) => f.sectionId === sec.id);
        return (
          <section key={sec.id} className="card">
            <details className="border-b border-stone-100 p-3">
              <summary className="cursor-pointer font-semibold">
                {pickL(sec.label, "en")} / {pickL(sec.label, "hi")} {!sec.active && <span className="badge bg-stone-100">hidden</span>} <span className="text-xs font-normal text-stone-400">(edit section)</span>
              </summary>
              <form action={saveSectionAction} className="mt-2 space-y-2">
                <input type="hidden" name="rid" value={sec.id} />
                <L10nInputs prefix="label" value={sec.label} label="Section title" required />
                <div className="flex items-center gap-4"><Check name="active" label="Active" checked={sec.active} /><input name="order" type="number" defaultValue={sec.order} className="input w-24" /><button className="btn-primary btn-sm">Save section</button></div>
              </form>
            </details>
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead><tr><th>#</th><th>Field</th><th>Type</th><th>Visibility</th><th>Flags</th><th></th></tr></thead>
                <tbody>
                  {fs.map((f) => (
                    <tr key={f.id} className={f.active ? "" : "opacity-40"}>
                      <td className="text-stone-400">{f.order}</td>
                      <td>{pickL(f.label, "en")}<div className="text-xs text-stone-500">{pickL(f.label, "hi")} · <code>{f.key}</code></div></td>
                      <td>{f.type}{f.options && <span className="text-xs text-stone-500"> ({f.options.length})</span>}</td>
                      <td><span className={`badge ${VIS_COLOR[f.visibility]}`}>{f.visibility}</span></td>
                      <td className="space-x-1 text-xs">
                        {f.required && <span className="badge bg-red-50 text-red-700">required</span>}
                        {f.filterable && <span className="badge bg-brand-50 text-brand-700">filter</span>}
                        {f.showInCard && <span className="badge bg-purple-50 text-purple-700">card</span>}
                        {f.communityIds && <span className="badge bg-stone-100">limited</span>}
                        {!f.active && <span className="badge bg-stone-100">disabled</span>}
                      </td>
                      <td><Link className="link" href={`/admin/fields/${f.id}`}>Edit</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
      <details className="card border-dashed p-4">
        <summary className="cursor-pointer font-medium">+ Add section</summary>
        <form action={saveSectionAction} className="mt-2 space-y-2">
          <L10nInputs prefix="label" label="Section title" required />
          <div className="flex items-center gap-4"><Check name="active" label="Active" checked /><input name="order" type="number" defaultValue={sections.length} className="input w-24" /><button className="btn-primary btn-sm">Add section</button></div>
        </form>
      </details>
    </div>
  );
}
