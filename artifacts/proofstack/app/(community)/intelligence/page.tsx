import { redirect } from "next/navigation";

// The intelligence workspace was split: matches live under Opportunities,
// practice plans under Skills, security reviews under each repository.
export default function Page() {
  redirect("/opportunities/suggested");
}
