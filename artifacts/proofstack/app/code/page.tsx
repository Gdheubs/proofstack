import type { Metadata } from "next";
import { EditorLoader } from "@/features/editor/editor-loader";

export const metadata: Metadata = {
  title: "Code",
  description: "Edit your GitHub and ProofStack repositories in the browser.",
};

export default function CodePage() {
  return <EditorLoader />;
}
