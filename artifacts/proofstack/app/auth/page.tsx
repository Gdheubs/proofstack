import type { Metadata } from "next";
import { AuthView } from "@/components/auth/auth-view";

export const metadata: Metadata = { title: "Sign in" };

export default function Page() {
  return <AuthView />;
}
