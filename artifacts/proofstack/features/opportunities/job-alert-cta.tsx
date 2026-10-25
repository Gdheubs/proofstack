"use client";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetAccountQueryKey,
  useGetAccount,
} from "@workspace/api-client-react";
import { BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCommunityRun, useCsrf } from "@/hooks/use-community";

// Empty-state call to action: opt in to an email when open roles match the
// member's skills. The preference is stored now; emails start once ProofStack
// sends email from its own domain.
export function JobAlertCta() {
  const { canAct } = useCsrf();
  const qc = useQueryClient();
  const { run, pending } = useCommunityRun();
  const account = useGetAccount({
    query: { queryKey: getGetAccountQueryKey(), enabled: canAct },
  });
  if (!canAct)
    return (
      <Button asChild variant="outline">
        <Link href="/auth?mode=signup">
          Create a free account to get alerts
        </Link>
      </Button>
    );
  const prefs = account.data?.notificationPreferences as
    | Record<string, { inApp?: boolean; email?: boolean } | undefined>
    | undefined;
  const on = prefs?.opportunities?.email === true;
  if (on)
    return (
      <p className="text-sm text-muted-foreground">
        Job alerts are on. You will get an email when open roles match your
        skills, once email delivery starts.{" "}
        <Link href="/settings/notifications" className="underline">
          Manage
        </Link>
      </p>
    );
  return (
    <Button
      variant="outline"
      disabled={pending || account.isPending}
      onClick={async () => {
        const r = await run(
          {
            action: "notification-preferences-save",
            preferences: { opportunities: { inApp: false, email: true } },
          },
          "Job alerts saved. Emails start once email delivery is on.",
        );
        if (r)
          await qc.invalidateQueries({ queryKey: getGetAccountQueryKey() });
      }}
    >
      <BellRing aria-hidden="true" className="h-4 w-4" />
      Email me when roles match my skills
    </Button>
  );
}
