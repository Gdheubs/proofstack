"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Notice } from "@/features/auth/shared";
import { errInfo, useAct, useSession } from "@/hooks/use-auth";
import { MINIMUM_AGE, ageOn } from "@/lib/legal";

// Client-side check only; the server enforces the same rule.
export function agreementProblem(birthDate: string, accepted: boolean) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate))
    return "Enter your date of birth.";
  const age = ageOn(birthDate);
  if (age < 0 || age > 120) return "Enter your real date of birth.";
  if (age < MINIMUM_AGE)
    return `ProofStack accounts are currently for people aged ${MINIMUM_AGE} or over.`;
  if (!accepted)
    return "Accept the Terms of Service and Privacy Policy to continue.";
  return null;
}

export function AgreementFields({
  birthDate,
  onBirthDate,
  accepted,
  onAccepted,
}: {
  birthDate: string;
  onBirthDate: (value: string) => void;
  accepted: boolean;
  onAccepted: (value: boolean) => void;
}) {
  return (
    <div className="space-y-3">
      <Field
        label="Date of birth"
        type="date"
        required
        value={birthDate}
        onChange={(e) => onBirthDate(e.target.value)}
        autoComplete="bday"
        hint={`You must be ${MINIMUM_AGE} or over. We use this only to check your age.`}
      />
      <label className="flex items-start gap-2 text-sm leading-relaxed">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 shrink-0 accent-primary"
          checked={accepted}
          onChange={(e) => onAccepted(e.target.checked)}
          required
        />
        <span>
          I am {MINIMUM_AGE} or over and I agree to the{" "}
          <Link
            href="/terms"
            target="_blank"
            className="underline underline-offset-2"
          >
            Terms of Service
          </Link>{" "}
          and the{" "}
          <Link
            href="/privacy"
            target="_blank"
            className="underline underline-offset-2"
          >
            Privacy Policy
          </Link>
          .
        </span>
      </label>
    </div>
  );
}

const OPEN_PATHS = ["/terms", "/privacy", "/community-guidelines", "/contact"];

// Shown to a signed-in account that has not yet given its date of birth or
// accepted the current terms (for example after social or email-code sign-up).
export function AgreementGate() {
  const session = useSession();
  const path = usePathname();
  const { raw } = useAct();
  const [birthDate, setBirthDate] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!session.data?.user?.agreementRequired) return null;
  if (OPEN_PATHS.some((p) => path === p)) return null;
  const submit = async () => {
    const problem = agreementProblem(birthDate, accepted);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      await raw({ action: "accept-terms", birthDate, acceptTerms: true });
    } catch (e) {
      setError(errInfo(e).message);
      await session.refetch();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="agreement-title"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-background/95 p-4"
    >
      <form
        className="w-full max-w-md space-y-4 rounded-lg border bg-card p-6 shadow-lg"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <h2 id="agreement-title" className="text-xl font-semibold">
          One step before you continue
        </h2>
        <p className="text-sm text-muted-foreground">
          Confirm your date of birth and accept our terms. If you are under{" "}
          {MINIMUM_AGE}, your account and its details will be deleted.
        </p>
        <AgreementFields
          birthDate={birthDate}
          onBirthDate={setBirthDate}
          accepted={accepted}
          onAccepted={setAccepted}
        />
        {error && <Notice tone="error">{error}</Notice>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={busy}>
            {busy ? "Saving..." : "Continue"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => void raw({ action: "logout", scope: "local" })}
          >
            Sign out
          </Button>
        </div>
      </form>
    </div>
  );
}
