"use client";
import Link from "next/link";
import {
  getGetOperationsQueryKey,
  useGetOperations,
} from "@workspace/api-client-react";
import { useGate } from "./use-gate";
import { errInfo, useAct } from "@/hooks/use-auth";
import { MfaVerify } from "@/features/auth/mfa";
import { ErrorBlock, Notice } from "@/features/auth/shared";
import { Button } from "@/components/ui/button";
import { card } from "@/features/careers/shared";
export function OperationsView() {
  const { ctx, ok, q: session } = useGate(),
    { raw } = useAct();
  const allowed =
    ok && ["admin", "super_admin"].includes(ctx?.user?.platformRole ?? "");
  const q = useGetOperations({
    query: {
      queryKey: [...getGetOperationsQueryKey(), ctx?.user?.id],
      enabled: allowed,
      retry: false,
      gcTime: 0,
      refetchOnWindowFocus: false,
    },
  });
  if (session.isPending) return <p className="p-8">Loading account…</p>;
  if (session.error)
    return (
      <ErrorBlock
        message={errInfo(session.error).message}
        onRetry={() => session.refetch()}
      />
    );
  if (!allowed)
    return (
      <div className="mx-auto max-w-4xl p-8">
        <Notice>
          Operations requires an active platform Admin or Super Admin account.
        </Notice>
        <Link className="underline" href="/account">
          Account settings
        </Link>
      </div>
    );
  const d = q.data,
    e = q.error ? errInfo(q.error) : null;
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-5 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link className="text-sm underline" href="/account/admin">
            Administration
          </Link>
          <h1 className="mt-3 text-4xl font-semibold">Operations</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Private service status. Runtime metrics describe this API process;
            queue health is shared across workers.
          </p>
        </div>
        <Button disabled={q.isFetching} onClick={() => q.refetch()}>
          Refresh snapshot
        </Button>
      </div>
      {q.isPending && <p>Loading operations…</p>}
      {e && (
        <div className={card}>
          <ErrorBlock message={e.message} onRetry={() => q.refetch()} />
          {["MFA_STEP_UP_REQUIRED", "MFA_REQUIRED"].includes(e.code ?? "") && (
            <MfaVerify
              factors={ctx?.factors ?? []}
              run={raw}
              onDone={() => q.refetch()}
            />
          )}
        </div>
      )}
      {d && !e && (
        <>
          <p className="text-xs text-muted-foreground">
            Checked {new Date(d.checkedAt).toLocaleString()}
          </p>
          <section className={card} aria-live="polite">
            <h2 className="text-xl font-semibold">Attention required</h2>
            {d.alerts.length ? (
              d.alerts.map((a) => (
                <p key={a} className="text-sm">
                  {a}
                </p>
              ))
            ) : (
              <p className="text-sm">
                No configured runtime alerts in this snapshot. This is not a
                security audit or launch approval.
              </p>
            )}
          </section>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Queued jobs", d.queue.queued],
              ["Running jobs", d.queue.running],
              ["Failed jobs · 24 hours", d.queue.failed],
              ["Healthy workers", d.queue.workers],
              ["Oldest queued · seconds", d.queue.oldestQueuedSeconds],
              ["API requests · since restart", d.runtime.requests],
              ["API errors · since restart", d.runtime.errors],
              ["Recent p95 · milliseconds", d.runtime.latencyP95Ms],
              ["In-flight requests", d.runtime.inFlight],
              ["Database waiters", d.runtime.dbWaiting],
              ["Resident memory · MiB", d.runtime.memoryMb],
              ["Process uptime · seconds", d.runtime.uptimeSeconds],
            ].map(([label, value]) => (
              <section className={card} key={label}>
                <h2 className="text-xs text-muted-foreground">{label}</h2>
                <p className="text-3xl font-semibold tabular-nums">{value}</p>
              </section>
            ))}
          </div>
          <section className={card}>
            <h2 className="text-xl font-semibold">Configured services</h2>
            <dl className="grid gap-3 sm:grid-cols-2">
              {Object.entries(d.configuration).map(([name, enabled]) => (
                <div
                  key={name}
                  className="flex justify-between gap-3 border-b pb-2 text-sm"
                >
                  <dt>
                    {
                      (
                        {
                          maintenance: "Maintenance mode",
                          gitEnabled: "Native repositories",
                          intelligenceEnabled: "Intelligence jobs",
                          aiEnabled: "AI learning plans",
                        } as Record<string, string>
                      )[name]
                    }
                  </dt>
                  <dd>{enabled ? "Enabled" : "Disabled"}</dd>
                </div>
              ))}
            </dl>
            <p className="text-xs text-muted-foreground">
              Configuration flags do not verify external provider delivery,
              storage durability, backups, or recovery. Recent latency uses at
              most 256 completed requests and is not a load-test result. No
              configuration or credentials are changed here.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
