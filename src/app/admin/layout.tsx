import Link from "next/link";
import { requireStaff } from "@/lib/auth";

const NAV: [string, string, boolean][] = [
  ["/admin", "Dashboard", false],
  ["/admin/profiles", "Profiles & approvals", false],
  ["/admin/verifications", "Photo verification", false],
  ["/admin/reports", "Reports & spam", false],
  ["/admin/moderation", "Stories & comments", false],
  ["/admin/feedback", "Feedback", false],
  ["/admin/users", "Users & credits", true],
  ["/admin/finance", "Payments, GST & audit", true],
  ["/admin/packages", "Credit packages", true],
  ["/admin/fields", "Biodata fields", true],
  ["/admin/communities", "Communities", true],
  ["/admin/languages", "Languages & text", true],
  ["/admin/settings", "Settings", true],
  ["/admin/audit", "Activity log", true],
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const u = await requireStaff();
  return (
    <div className="container-x grid gap-6 py-6 lg:grid-cols-[220px_1fr]">
      <aside className="no-print">
        <nav className="card flex gap-1 overflow-x-auto p-2 text-sm lg:sticky lg:top-20 lg:flex-col">
          {NAV.filter(([, , adminOnly]) => !adminOnly || u.role === "ADMIN").map(([href, label]) => (
            <Link key={href} href={href} className="whitespace-nowrap rounded-lg px-3 py-2 text-stone-700 hover:bg-brand-50 hover:text-brand-700">{label}</Link>
          ))}
        </nav>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
