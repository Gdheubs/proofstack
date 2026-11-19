import { notFound } from "next/navigation";

// Placeholder for the results candidates have shared with an organisation.
// Skill checks are off, so this address shows the not-found page until then.
export default function Page() {
  notFound();
}
