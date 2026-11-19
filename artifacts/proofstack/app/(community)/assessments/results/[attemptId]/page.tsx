import { notFound } from "next/navigation";

// Placeholder for one result: score report, receipt, appeal and credential.
// Skill checks are off, so this address shows the not-found page until then.
export default function Page() {
  notFound();
}
