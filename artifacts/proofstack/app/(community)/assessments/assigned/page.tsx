import { notFound } from "next/navigation";

// Placeholder for the viewer's assignments and invitations. Skill checks are
// off, so this address shows the not-found page until the skills hub is built.
export default function Page() {
  notFound();
}
