import Link from "next/link";
import { asc, count } from "drizzle-orm";
import { db, t } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { ALL_KEYS, BUILTIN } from "@/lib/i18n";
import { Flash } from "@/components/server";
import { saveLanguageAction } from "../actions";
import { Check } from "../_components";

export default async function Languages({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  await requireAdmin();
  const langs = await db.select().from(t.languages).orderBy(asc(t.languages.order));
  const over = await db.select({ lang: t.translations.lang, n: count() }).from(t.translations).groupBy(t.translations.lang);
  const LangForm = ({ l }: { l?: (typeof langs)[number] }) => (
    <form action={saveLanguageAction} className="flex flex-wrap items-end gap-3">
      <div><label className="label">Code</label>{l ? <><input type="hidden" name="code" value={l.code} /><code className="block py-2">{l.code}</code></> : <input name="code" className="input w-24" placeholder="gu" required />}</div>
      <div><label className="label">Name (English)</label><input name="name" className="input w-36" defaultValue={l?.name} placeholder="Gujarati" required /></div>
      <div><label className="label">Native name</label><input name="nativeName" className="input w-36" defaultValue={l?.nativeName} placeholder="ગુજરાતી" /></div>
      <div><label className="label">Order</label><input name="order" type="number" className="input w-20" defaultValue={l?.order ?? langs.length} /></div>
      <Check name="active" label="Active" checked={l?.active ?? true} />
      <Check name="isDefault" label="Default" checked={l?.isDefault} />
      <button className="btn-primary btn-sm">Save</button>
    </form>
  );
  return (
    <div className="space-y-4">
      <h1 className="h1">Languages & website text</h1>
      <p className="muted">Active languages appear in the language dropdown. Every piece of website text can be edited per language. Field labels, options, communities and packages are translated on their own admin pages (an input appears there for every active language).</p>
      <Flash sp={sp} />
      {langs.map((l) => {
        const custom = over.find((o) => o.lang === l.code)?.n ?? 0;
        const builtin = Object.keys(BUILTIN[l.code] ?? {}).length;
        return (
          <div key={l.code} className="card space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-semibold">{l.nativeName} <span className="text-stone-500">({l.name})</span> {l.isDefault && <span className="badge bg-brand-100 text-brand-700">default</span>}</div>
              <div className="flex items-center gap-3 text-sm">
                <span className="muted">{Math.min(ALL_KEYS.length, builtin + custom)}/{ALL_KEYS.length} texts translated</span>
                <Link className="btn-outline btn-sm" href={`/admin/languages/${l.code}`}>Edit texts</Link>
              </div>
            </div>
            <LangForm l={l} />
          </div>
        );
      })}
      <div className="card border-dashed p-4">
        <div className="mb-2 font-medium">+ Add language</div>
        <LangForm />
        <p className="mt-2 text-xs text-stone-500">Untranslated texts fall back to English, so a new language can be switched on and translated gradually.</p>
      </div>
    </div>
  );
}
