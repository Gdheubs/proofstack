import { redirect } from "next/navigation";

// Account settings moved under /settings; administration pages stay here.
export default function AccountPage() {
  redirect("/settings/account");
}
