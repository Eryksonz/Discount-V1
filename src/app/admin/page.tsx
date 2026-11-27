import { isAdminAuthenticated } from "@/lib/admin/auth";
import { AdminClient } from "@/components/AdminClient";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const authenticated = await isAdminAuthenticated();
  return <AdminClient initialAuthenticated={authenticated} />;
}
