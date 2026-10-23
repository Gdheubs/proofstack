import { redirect } from "next/navigation";

// The editor moved under Code; keep old links working.
export default function EditorPage() {
  redirect("/code");
}
