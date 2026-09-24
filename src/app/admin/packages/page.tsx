import { asc } from "drizzle-orm";
import { db, t } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { pickL } from "@/lib/i18n";
import { getSettings } from "@/lib/settings";
import { rupees } from "@/lib/services";
import { Flash } from "@/components/server";
import { savePackageAction } from "../actions";
import { Check, L10nInputs } from "../_components";

export default async function Packages({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  await requireAdmin();
  const s = await getSettings();
  const rows = await db.select().from(t.creditPackages).orderBy(asc(t.creditPackages.order));
  const PForm = ({ p }: { p?: (typeof rows)[number] }) => (
    <form action={savePackageAction} className="space-y-3">
      {p && <input type="hidden" name="rid" value={p.id} />}
      <L10nInputs prefix="name" value={p?.name} label="Package name" required />
      <L10nInputs prefix="desc" value={p?.description} label="Description" />
      <div className="flex flex-wrap items-end gap-4">
        <div><label className="label">Credits</label><input name="credits" type="number" min={1} defaultValue={p?.credits} className="input w-28" required /></div>
        <div><label className="label">Price (₹)</label><input name="price" type="number" min={0} step="0.01" defaultValue={p ? p.pricePaise / 100 : ""} className="input w-32" required /></div>
        <div><label className="label">Order</label><input name="order" type="number" defaultValue={p?.order ?? rows.length} className="input w-20" /></div>
        <Check name="highlight" label="Highlight as popular" checked={p?.highlight} />
        <Check name="active" label="Active" checked={p?.active ?? true} />
        <button className="btn-primary">Save</button>
      </div>
    </form>
  );
  return (
    <div className="space-y-4">
      <h1 className="h1">Credit packages</h1>
      <p className="muted">
        Members buy credits and spend them on actions. Current costs: unlock contact = <b>{s.int("credits.unlockContactCost")}</b>, send interest = <b>{s.int("credits.sendInterestCost")}</b> (after {s.int("credits.freeInterestsPerDay")} free/day), bookmark = <b>{s.int("credits.shortlistCost")}</b>. Change costs in Settings → Credits.
        GST is {s.bool("billing.gstEnabled") ? `on (${s.int("billing.gstRate")}%, prices ${s.bool("billing.pricesIncludeGst") ? "include" : "exclude"} GST)` : "off"}.
      </p>
      <Flash sp={sp} />
      {rows.map((p) => (
        <details key={p.id} className="card p-4">
          <summary className="cursor-pointer">
            <b>{pickL(p.name, "en")}</b> – {p.credits} credits for {rupees(p.pricePaise)} ({rupees(Math.round(p.pricePaise / p.credits))}/credit) {p.active ? <span className="badge bg-green-100 text-green-700">active</span> : <span className="badge bg-stone-100">inactive</span>}
          </summary>
          <div className="mt-3"><PForm p={p} /></div>
        </details>
      ))}
      <details className="card border-dashed p-4">
        <summary className="cursor-pointer font-medium">+ Add package</summary>
        <div className="mt-3"><PForm /></div>
      </details>
    </div>
  );
}
