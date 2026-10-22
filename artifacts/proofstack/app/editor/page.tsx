import type { Metadata } from "next";
import { EditorLoader } from "@/features/editor/editor-loader";

export const metadata: Metadata = {
  title: "Code editor",
  description: "Edit your GitHub and ProofStack repositories in the browser.",
};

export default function EditorPage() {
  return <EditorLoader />;
}
