import { notFound } from "next/navigation";

// Placeholder for the owner team's organisation verification decisions.
// Platform access is off, so this address shows the not-found page until then.
export default function Page() {
  notFound();
}
