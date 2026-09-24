import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { SETTINGS, getSettings } from "@/lib/settings";
import { Flash } from "@/components/server";
import { saveSettingsAction } from "../actions";
import { L10nInputs } from "../_components";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  await requireAdmin();
  const s = await getSettings();
  const groups = [...new Set(SETTINGS.map((d) => d.group))];
  const g = groups.includes(sp.g) ? sp.g : groups[0];
  return (
    <div className="space-y-4">
      <h1 className="h1">Settings</h1>
      <Flash sp={sp} />
      <div className="flex flex-wrap gap-1">
        {groups.map((x) => <Link key={x} href={`?g=${encodeURIComponent(x)}`} className={x === g ? "btn-maroon btn-sm" : "btn-outline btn-sm"}>{x}</Link>)}
      </div>
      <form action={saveSettingsAction} className="card space-y-5 p-5">
        <input type="hidden" name="group" value={g} />
        {SETTINGS.filter((d) => d.group === g).map((d) => {
          const v = s.get(d.key);
          return (
            <div key={d.key}>
              {d.type === "bool" ? (
                <label className="flex items-start gap-3">
                  <input type="checkbox" name={d.key} defaultChecked={Boolean(v)} className="mt-1 h-4 w-4 accent-brand-600" />
                  <span><span className="font-medium">{d.label}</span>{d.help && <span className="block text-xs text-stone-500">{d.help}</span>}</span>
                </label>
              ) : d.type === "l10n" ? (
                <L10nInputs prefix={d.key} value={v as Record<string, string>} label={d.label} />
              ) : (
                <>
                  <label className="label">{d.label}</label>
                  {d.type === "select" ? (
                    <select name={d.key} defaultValue={String(v)} className="input max-w-sm">{d.options!.map((o) => <option key={o}>{o}</option>)}</select>
                  ) : d.type === "textarea" ? (
                    <textarea name={d.key} defaultValue={String(v ?? "")} className="input" rows={3} />
                  ) : d.type === "secret" ? (
                    <input name={d.key} type="password" autoComplete="off" placeholder={v ? "•••••• (saved – leave blank to keep)" : "not set"} className="input max-w-sm" />
                  ) : (
                    <input name={d.key} type={d.type === "int" ? "number" : "text"} defaultValue={String(v ?? "")} className="input max-w-sm" />
                  )}
                  {d.help && <p className="mt-1 text-xs text-stone-500">{d.help}</p>}
                </>
              )}
            </div>
          );
        })}
        <button className="btn-primary">Save {g}</button>
      </form>
    </div>
  );
}
