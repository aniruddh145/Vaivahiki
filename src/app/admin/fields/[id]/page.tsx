import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, t } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { getLanguages, pickL } from "@/lib/i18n";
import { FIELD_TYPES, VISIBILITIES } from "@/lib/fields";
import { Flash } from "@/components/server";
import { ConfirmButton } from "@/components/ui";
import { deleteFieldAction, saveFieldAction } from "../../actions";
import { Check, L10nInputs } from "../../_components";

const TYPE_HELP: Record<string, string> = {
  TEXT: "Short text", TEXTAREA: "Long text / paragraph", NUMBER: "Number", SELECT: "Dropdown – pick one",
  MULTISELECT: "Checkboxes – pick many", DATE: "Date", TIME: "Time", BOOLEAN: "Yes / No", HEIGHT: "Height picker (feet / cm)",
};

export default async function EditField({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  await requireAdmin();
  const isNew = id === "new";
  const [f] = isNew ? [undefined] : await db.select().from(t.fieldDefinitions).where(eq(t.fieldDefinitions.id, id));
  if (!isNew && !f) notFound();
  const [sections, communities, langs] = await Promise.all([
    db.select().from(t.fieldSections).orderBy(asc(t.fieldSections.order)),
    db.select().from(t.communities).orderBy(asc(t.communities.order)),
    getLanguages(),
  ]);
  const codes = ["en", ...langs.map((l) => l.code).filter((c) => c !== "en")]; // English always first
  const optionsText = (f?.options ?? []).map((o) => [o.value, ...codes.map((c) => o.label[c] ?? "")].join(" | ")).join("\n");

  return (
    <div className="max-w-3xl space-y-4">
      <Link href="/admin/fields" className="link text-sm">← All fields</Link>
      <h1 className="h1">{isNew ? "New field" : `Edit: ${pickL(f!.label, "en")}`}</h1>
      <Flash sp={sp} />
      <form action={saveFieldAction} className="card space-y-4 p-5">
        {f && <input type="hidden" name="rid" value={f.id} />}
        <input type="hidden" name="optionLangs" value={codes.join(",")} />
        <L10nInputs prefix="label" value={f?.label} label="Label (shown to members)" required />
        <div className="grid gap-4 sm:grid-cols-3">
          {isNew ? (
            <div><label className="label">Key (internal, optional)</label><input name="key" className="input" placeholder="auto from English label" /></div>
          ) : (
            <div><label className="label">Key</label><code className="block py-2">{f!.key}</code></div>
          )}
          <div>
            <label className="label">Type</label>
            <select name="type" className="input" defaultValue={f?.type ?? "TEXT"}>{FIELD_TYPES.map((x) => <option key={x} value={x}>{TYPE_HELP[x]}</option>)}</select>
          </div>
          <div>
            <label className="label">Section</label>
            <select name="sectionId" className="input" defaultValue={f?.sectionId}>{sections.map((s) => <option key={s.id} value={s.id}>{pickL(s.label, "en")}</option>)}</select>
          </div>
          <div>
            <label className="label">Visibility</label>
            <select name="visibility" className="input" defaultValue={f?.visibility ?? "MEMBERS"}>{VISIBILITIES.map((v) => <option key={v}>{v}</option>)}</select>
          </div>
          <div><label className="label">Display order</label><input name="order" type="number" className="input" defaultValue={f?.order ?? 100} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="label">Min</label><input name="min" type="number" step="any" className="input" defaultValue={f?.min ?? ""} /></div>
            <div><label className="label">Max</label><input name="max" type="number" step="any" className="input" defaultValue={f?.max ?? ""} /></div>
          </div>
        </div>
        <div className="flex flex-wrap gap-6">
          <Check name="required" label="Required" checked={f?.required} />
          <Check name="filterable" label="Use as search filter" checked={f?.filterable} />
          <Check name="showInCard" label="Show on result cards" checked={f?.showInCard} />
          <Check name="active" label="Active" checked={f?.active ?? true} />
        </div>
        <div>
          <label className="label">Options (for dropdown / checkboxes) – one per line</label>
          <p className="mb-1 text-xs text-stone-500">Format: <code>value | {codes.join(" | ")}</code> — e.g. <code>never_married | Never married | अविवाहित</code>. Keep the value unchanged once members start using it.</p>
          <textarea name="options" className="input font-mono text-xs" rows={8} defaultValue={optionsText} />
        </div>
        <L10nInputs prefix="ph" value={f?.placeholder} label="Placeholder (optional)" />
        <L10nInputs prefix="help" value={f?.helpText} label="Help text (optional)" />
        <div>
          <label className="label">Only for these communities (leave all unticked = every community)</label>
          <div className="flex flex-wrap gap-4">
            {communities.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="communityIds" value={c.id} defaultChecked={f?.communityIds?.includes(c.id)} className="accent-brand-600" /> {pickL(c.name, "en")}
              </label>
            ))}
          </div>
        </div>
        <button className="btn-primary">Save field</button>
      </form>
      {f && (
        <form action={deleteFieldAction} className="flex gap-2">
          <input type="hidden" name="rid" value={f.id} />
          <ConfirmButton message="Disable this field? Existing answers are kept." className="btn-outline btn-sm">Disable</ConfirmButton>
          <ConfirmButton name="hard" value="1" message="Delete permanently? Answers stay in profiles but will no longer display.">Delete permanently</ConfirmButton>
        </form>
      )}
    </div>
  );
}
