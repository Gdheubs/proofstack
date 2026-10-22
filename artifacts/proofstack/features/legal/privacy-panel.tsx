"use client";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Notice, Panel } from "@/features/auth/shared";
import { errInfo } from "@/hooks/use-auth";
import type { Act } from "@/features/account/sections";

// Data rights under the DPDP Act: a copy of your data, and erasure.
export function PrivacyPanel({ act }: { act: Act }) {
  const [busy, setBusy] = useState<"export" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState("");
  const download = async () => {
    setBusy("export");
    setError(null);
    try {
      const response = await fetch("/api/auth/account/export", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(
          payload?.error?.message ?? "Could not prepare your data. Try again.",
        );
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = "proofstack-data.json";
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not prepare your data.");
    } finally {
      setBusy(null);
    }
  };
  const remove = async () => {
    setBusy("delete");
    setError(null);
    try {
      await act({ action: "delete-account", confirm: "DELETE" });
      // A full reload clears every cached view of the deleted account.
      window.location.assign("/");
    } catch (e) {
      const info = errInfo(e);
      setError(
        info.code === "REAUTHENTICATION_REQUIRED"
          ? "For your safety, sign out and sign in again, then delete your account within 5 minutes."
          : info.message,
      );
    } finally {
      setBusy(null);
    }
  };
  return (
    <Panel title="Your data" eyebrow="Privacy">
      <div className="space-y-5 text-sm">
        <div className="space-y-2">
          <p>
            Download a copy of the personal data ProofStack holds about you, in
            a machine-readable file.
          </p>
          <Button
            variant="outline"
            disabled={busy !== null}
            onClick={() => void download()}
          >
            {busy === "export" ? "Preparing..." : "Download my data"}
          </Button>
        </div>
        <div className="space-y-2 border-t pt-4">
          <p className="font-medium">Delete account</p>
          <p className="text-muted-foreground">
            This permanently deletes your profile, posts, projects, applications
            and uploaded images, and signs you out everywhere. Your email and
            phone number are kept for 180 days because Indian law requires it,
            then erased. See the{" "}
            <Link href="/privacy" className="underline underline-offset-2">
              Privacy Policy
            </Link>
            .
          </p>
          <label className="block space-y-1.5">
            <span>
              Type <span className="font-mono">DELETE</span> to confirm
            </span>
            <Input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="off"
            />
          </label>
          <Button
            variant="destructive"
            disabled={busy !== null || confirm !== "DELETE"}
            onClick={() => void remove()}
          >
            {busy === "delete" ? "Deleting..." : "Delete my account"}
          </Button>
        </div>
        {error && <Notice tone="error">{error}</Notice>}
      </div>
    </Panel>
  );
}
