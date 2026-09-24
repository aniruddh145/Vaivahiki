import { requireUser } from "@/lib/auth";
import { getLanguages, getT } from "@/lib/i18n";
import { Flash } from "@/components/server";
import { SubmitButton } from "@/components/ui";
import { updateAccountAction } from "../actions/auth";

export default async function Account({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const u = await requireUser();
  const [{ t: tr }, langs] = await Promise.all([getT(), getLanguages()]);
  return (
    <div className="container-x max-w-2xl py-8">
      <h1 className="h1 mb-4">{tr("account.title")}</h1>
      <Flash sp={sp} />
      <form action={updateAccountAction} className="card space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="label">{tr("auth.name")}</label><input className="input" name="name" defaultValue={u.name} required /></div>
          <div>
            <label className="label">{tr("account.language")}</label>
            <select className="input" name="lang" defaultValue={u.lang}>{langs.map((l) => <option key={l.code} value={l.code}>{l.nativeName}</option>)}</select>
          </div>
          <div>
            <label className="label">{tr("auth.mobile")} {u.mobileVerified && <span className="text-green-700">✓</span>}</label>
            <input className="input" name="mobile" type="tel" defaultValue={u.mobile ?? ""} />
          </div>
          <div>
            <label className="label">{tr("auth.email")} {u.emailVerified && <span className="text-green-700">✓</span>}</label>
            <input className="input" name="email" type="email" defaultValue={u.email ?? ""} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">{tr("account.changePassword")}</label>
            <input className="input" name="password" type="password" minLength={6} placeholder={tr("account.newPassword")} autoComplete="new-password" />
          </div>
        </div>
        <h2 className="h2 pt-2">{tr("wallet.billing")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="label">{tr("wallet.billingName")}</label><input className="input" name="billingName" defaultValue={u.billingName ?? ""} /></div>
          <div><label className="label">{tr("wallet.billingState")}</label><input className="input" name="billingState" defaultValue={u.billingState ?? ""} /></div>
          <div className="sm:col-span-2"><label className="label">{tr("wallet.billingAddress")}</label><textarea className="input" name="billingAddress" rows={2} defaultValue={u.billingAddress ?? ""} /></div>
          <div><label className="label">{tr("wallet.gstin")}</label><input className="input" name="gstin" defaultValue={u.gstin ?? ""} /></div>
        </div>
        <SubmitButton>{tr("common.save")}</SubmitButton>
      </form>
    </div>
  );
}
