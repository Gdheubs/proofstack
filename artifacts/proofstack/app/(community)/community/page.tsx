import { redirect } from "next/navigation";

// The feed lives on the home page.
export default function Page() {
  redirect("/home");
}
