import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, t } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { ALL_KEYS, BUILTIN } from "@/lib/i18n";
import en from "@/lib/i18n/en";
import { Flash } from "@/components/server";
import { saveTranslationsAction } from "../../actions";

export default async function EditTexts({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<Record<string, string>> }) {
  const [{ code }, sp] = await Promise.all([params, searchParams]);
  await requireAdmin();
  const [lang] = await db.select().from(t.languages).where(eq(t.languages.code, code));
  const rows = await db.select().from(t.translations).where(eq(t.translations.lang, code));
  const over = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const builtin = BUILTIN[code] ?? {};
  const q = (sp.q ?? "").toLowerCase();
  const onlyMissing = sp.missing === "1";
  const keys = ALL_KEYS.filter((k) => {
    const enVal = (en as Record<string, string>)[k];
    if (q && !k.toLowerCase().includes(q) && !enVal.toLowerCase().includes(q) && !(over[k] ?? builtin[k] ?? "").toLowerCase().includes(q)) return false;
    if (onlyMissing && (over[k] || builtin[k])) return false;
    return true;
  });
  const groups = [...new Set(keys.map((k) => k.split(".")[0]))];

  return (
    <div className="space-y-4">
      <Link href="/admin/languages" className="link text-sm">← Languages</Link>
      <h1 className="h1">Website text – {lang?.nativeName ?? code}</h1>
      <Flash sp={sp} />
      <form className="flex flex-wrap items-center gap-2">
        <input name="q" defaultValue={sp.q} placeholder="Search text…" className="input w-64" />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="missing" value="1" defaultChecked={onlyMissing} /> Only untranslated</label>
        <button className="btn-outline btn-sm">Filter</button>
      </form>
      <p className="muted">Leave a box empty to use the built-in text. Use {"{name}"}-style placeholders exactly as in English.</p>
      <form action={saveTranslationsAction} className="space-y-4">
        <input type="hidden" name="lang" value={code} />
        <input type="hidden" name="q" value={sp.q ?? ""} />
        {groups.map((g) => (
          <details key={g} open={!!q || onlyMissing} className="card">
            <summary className="cursor-pointer p-3 font-semibold capitalize">{g}</summary>
            <table className="tbl">
              <tbody>
                {keys.filter((k) => k.split(".")[0] === g).map((k) => {
                  const current = over[k] ?? "";
                  return (
                    <tr key={k}>
                      <td className="w-1/3 text-xs"><code className="text-stone-400">{k}</code><div className="text-sm text-stone-700">{(en as Record<string, string>)[k]}</div></td>
                      <td>
                        <input type="hidden" name={`orig:${k}`} value={current} />
                        <input name={`tr:${k}`} defaultValue={current} placeholder={code === "en" ? "" : builtin[k] ?? "(uses English)"} className="input" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </details>
        ))}
        <div className="sticky bottom-0 border-t border-stone-200 bg-white/95 py-3"><button className="btn-primary">Save changes</button></div>
      </form>
    </div>
  );
}
