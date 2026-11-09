import type { Metadata } from "next";
import { NewPasswordView } from "@/features/auth/auth-view";

export const metadata: Metadata = { title: "Choose a new password" };

export default function Page() {
  return <NewPasswordView />;
}
