import { getLanguages } from "@/lib/i18n";

/** One input per active language, named `${prefix}__${code}`. */
export async function L10nInputs({ prefix, value, label, textarea = false, required = false }: { prefix: string; value?: Record<string, string> | null; label: string; textarea?: boolean; required?: boolean }) {
  const langs = [...(await getLanguages())].sort((a, b) => (a.code === "en" ? -1 : b.code === "en" ? 1 : 0));
  return (
    <div>
      <div className="label">{label}</div>
      <div className="grid gap-2 sm:grid-cols-2">
        {langs.map((l) => (
          <div key={l.code} className="flex items-start gap-2">
            <span className="mt-2 w-8 shrink-0 text-xs uppercase text-stone-400">{l.code}</span>
            {textarea ? (
              <textarea className="input" rows={2} name={`${prefix}__${l.code}`} defaultValue={value?.[l.code] ?? ""} />
            ) : (
              <input className="input" name={`${prefix}__${l.code}`} defaultValue={value?.[l.code] ?? ""} required={required && l.code === "en"} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function Check({ name, label, checked }: { name: string; label: string; checked?: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" name={name} defaultChecked={checked} className="accent-brand-600" /> {label}
    </label>
  );
}

export function Stat({ label, value, href }: { label: string; value: React.ReactNode; href?: string }) {
  const inner = (
    <>
      <div className="muted">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </>
  );
  return href ? <a href={href} className="card block p-4 hover:border-brand-200">{inner}</a> : <div className="card p-4">{inner}</div>;
}
