import type { Metadata } from "next";
import { AdminView } from "@/components/account/admin-view";

export const metadata: Metadata = { title: "Administration" };

export default function Page() {
  return <AdminView />;
}
