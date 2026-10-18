"use client";
import { RefreshCw, ShieldOff, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { StatusPill, type Tone } from "@/components/status-pill";
import { useAuthSummary } from "@/features/auth/status";
import { useFoundationStatus } from "@/hooks/use-foundation-status";

function Row({
  name,
  path,
  tone,
  label,
  loading,
  detail,
}: {
  name: string;
  path: string;
  tone: Tone;
  label: string;
  loading: boolean;
  detail?: string;
}) {
  return (
    <div className="grid items-center gap-3 border-b py-5 md:grid-cols-[1.2fr_1fr_auto]">
      <div>
        <h3 className="text-xl font-semibold">{name}</h3>
        <p className="font-mono text-xs text-muted-foreground">{path}</p>
      </div>
      <p className="text-sm text-muted-foreground">{detail}</p>
      {loading ? (
        <Skeleton className="h-7 w-28 rounded-full" />
      ) : (
        <StatusPill tone={tone} label={label} />
      )}
    </div>
  );
}

export default function FoundationPage() {
  const { health, ready, refresh, refreshing, checkedAt } =
    useFoundationStatus();
  const auth = useAuthSummary();
  const hLoading = health.isLoading;
  const rLoading = ready.isLoading;
  const hTone: Tone = health.isError
    ? "bad"
    : health.data?.status
      ? "ok"
      : "pending";
  const rData = ready.data;
  const db = rData?.checks.database;
  const apiReady = !!rData && rData.status === "ready";

  return (
    <div className="mx-auto max-w-5xl px-5 py-14">
      <p className="rise font-mono text-xs uppercase tracking-widest text-muted-foreground">
        Foundation console
      </p>
      <div className="rise d1 mt-3 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-4xl font-semibold md:text-6xl">
          Live system status
        </h1>
        <Button
          onClick={() => void refresh()}
          disabled={refreshing}
          aria-label="Refresh status checks"
        >
          <RefreshCw
            className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
          />
          {refreshing ? "Checking" : "Refresh"}
        </Button>
      </div>
      <p className="mt-3 text-sm text-muted-foreground" aria-live="polite">
        {checkedAt
          ? `Last manual check ${checkedAt.toLocaleTimeString()}.`
          : "Checks run on load and repeat every 30 seconds."}
      </p>

      {(health.isError || ready.isError) && (
        <Alert variant="destructive" className="mt-6">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>One or more checks could not be completed</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            {ready.isError && !rData
              ? "The readiness endpoint returned an error or could not be reached. The database state is unknown."
              : "The API did not respond as expected."}
            <Button size="sm" variant="outline" onClick={() => void refresh()}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <section
        aria-labelledby="checks"
        className="mt-10 rounded-xl border bg-card px-6"
      >
        <h2 id="checks" className="sr-only">
          Service checks
        </h2>
        <Row
          name="API liveness"
          path="GET /api/healthz"
          loading={hLoading}
          tone={hTone}
          label={
            health.isError
              ? "Unreachable"
              : health.data
                ? `Status: ${health.data.status}`
                : "Pending"
          }
          detail="Confirms the API process is responding."
        />
        <Row
          name="API readiness"
          path="GET /api/readyz"
          loading={rLoading}
          tone={
            ready.isError && !rData
              ? "bad"
              : apiReady
                ? "ok"
                : rData
                  ? "bad"
                  : "pending"
          }
          label={
            rData
              ? apiReady
                ? "Ready"
                : "Not ready"
              : ready.isError
                ? "Unreachable"
                : "Pending"
          }
          detail="Reports whether required dependencies are available."
        />
        <Row
          name="Database"
          path="readyz / checks.database"
          loading={rLoading}
          tone={
            db === "ready"
              ? "ok"
              : db
                ? "bad"
                : ready.isError
                  ? "bad"
                  : "pending"
          }
          label={
            db
              ? db === "ready"
                ? "Ready"
                : "Unavailable"
              : ready.isError
                ? "Unknown"
                : "Pending"
          }
          detail="Reachability as reported by the readiness check."
        />
        <div className="grid items-center gap-3 py-5 md:grid-cols-[1.2fr_1fr_auto]">
          <div>
            <h3 className="text-xl font-semibold">Authentication</h3>
            <p className="font-mono text-xs text-muted-foreground">
              reported by /api/auth/context
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            {auth.q.isLoading
              ? "Reading capability state."
              : auth.q.isError
                ? "Capability state could not be read."
                : `Enabled: ${auth.enabled.join(", ") || "none"}. Pending setup: ${auth.pending.join(", ") || "none"}.`}
          </p>
          <StatusPill
            tone={auth.q.isError ? "off" : auth.enabled.length ? "ok" : "off"}
            label={
              auth.q.isLoading
                ? "Checking"
                : auth.q.isError
                  ? "Unknown"
                  : auth.enabled.length
                    ? "Partially enabled"
                    : "Not configured"
            }
          />
        </div>
      </section>

      <Alert className="mt-8">
        <ShieldOff className="h-4 w-4" />
        <AlertTitle>Public pages stay public</AlertTitle>
        <AlertDescription>
          Overview, foundation and design pages need no sign-in. Account and
          administration screens are shown according to server-verified context,
          and the server remains the authority for every action.
        </AlertDescription>
      </Alert>

      <section className="mt-12 grid gap-8 md:grid-cols-2">
        <div>
          <h2 className="text-2xl font-semibold">How to read this</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            Liveness says the process answers. Readiness says its dependencies
            do too. A healthy API with an unavailable database is a real,
            distinct state and is shown as such.
          </p>
        </div>
        <div>
          <h2 className="text-2xl font-semibold">Documentation</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            Architecture notes are kept in the repository{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
              /docs
            </code>{" "}
            folder alongside the code.
          </p>
        </div>
      </section>
    </div>
  );
}
