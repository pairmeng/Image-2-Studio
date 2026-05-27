import { redirect } from "next/navigation";
import { AdminConsole } from "@/components/admin/admin-console";
import { requireAdmin, toPublicUser } from "@/lib/server/auth";

export const runtime = "nodejs";

export default async function AdminPage() {
  try {
    const admin = await requireAdmin();

    return <AdminConsole currentUser={toPublicUser(admin)} />;
  } catch {
    redirect("/");
  }
}
