import { notFound } from "next/navigation";

// Placeholder for the owner team's capability grants. Platform access is
// off, so this address shows the not-found page until the console is built.
export default function Page() {
  notFound();
}
