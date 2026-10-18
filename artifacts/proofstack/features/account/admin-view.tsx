"use client";
import { useState } from "react";
import Link from "next/link";
import {
  getGetAccountUsersQueryKey,
  useGetAccountUsers,
  type AccountUser,
  type AuthActionInput,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { errInfo, useAct } from "@/hooks/use-auth";
import {
  Confirm,
  CopyButton,
  ErrorBlock,
  Notice,
  Skeleton,
} from "@/features/auth/shared";
import { MfaVerify, StepUpDialog } from "@/features/auth/mfa";
import { useGate } from "@/features/account/use-gate";

const ALL_ROLES = ["none", "moderator", "admin", "super_admin"] as const;
const ADMIN_ROLES = ["none", "moderator"] as const;
type PRole = "moderator" | "admin" | "super_admin" | null;
// Mirrors documented server rules for presentation only; the server decides.
function perms(actor: PRole, target: PRole) {
  if (actor === "super_admin")
    return { status: true, roles: ALL_ROLES as readonly string[] };
  if (actor === "admin")
    return {
      status: target === null || target === "moderator",
      roles:
        target === null || target === "moderator"
          ? (ADMIN_ROLES as readonly string[])
          : [],
    };
  if (actor === "moderator")
    return { status: target === null, roles: [] as readonly string[] };
  return { status: false, roles: [] as readonly string[] };
}
type Pending = {
  title: string;
  desc: string;
  label: string;
  data: AuthActionInput;
};

export function AdminView() {
  const { q, ctx, ok } = useGate();
  const { act, raw, stepUp, settleStepUp } = useAct();
  const role = ctx?.user?.platformRole ?? null;
  const allowed = ok && !!role;
  const users = useGetAccountUsers({
    query: {
      queryKey: getGetAccountUsersQueryKey(),
      enabled: allowed,
      retry: false,
    },
  });
  const [pending, setPending] = useState<Pending | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [errMfa, setErrMfa] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const apply = async (p: Pending) => {
    setBusy(p.data.userId ?? "");
    setErr(null);
    setMsg(null);
    setErrMfa(false);
    try {
      const r = await act(p.data);
      setMsg(r.message);
    } catch (e) {
      const i = errInfo(e);
      setErr(i.message);
      setErrMfa(i.code === "MFA_REQUIRED");
    } finally {
      setBusy(null);
    }
  };

  const ask = (u: AccountUser, kind: "role" | "status", value: string) => {
    if (kind === "role") {
      const next =
        value === "none"
          ? null
          : (value as "moderator" | "admin" | "super_admin");
      setPending({
        title: next
          ? `Grant ${value.replace("_", " ")}?`
          : "Remove platform role?",
        desc: `This changes administrative access for ${u.displayName}. The server verifies that you are permitted.`,
        label: "Apply",
        data: { action: "user-role", userId: u.id, role: next },
      });
    } else {
      setPending({
        title:
          value === "disabled"
            ? "Disable this account?"
            : "Re-enable this account?",
        desc:
          value === "disabled"
            ? `${u.displayName} will be blocked from signing in.`
            : `${u.displayName} will be able to sign in again.`,
        label: value === "disabled" ? "Disable account" : "Enable account",
        data: {
          action: "user-status",
          userId: u.id,
          status: value as "active" | "disabled",
        },
      });
    }
  };

  const head = (
    <div className="mb-8 rise">
      <Link
        href="/account"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        Back to account
      </Link>
      <p className="mt-3 font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">
        Platform
      </p>
      <h1 className="text-4xl font-semibold">Administration</h1>
      {(role === "admin" || role === "super_admin") && (
        <Link
          className="mt-3 inline-block underline"
          href="/account/operations"
        >
          Operations dashboard
        </Link>
      )}
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">
        Roles here are platform privileges, separate from profile type. Every
        change is checked and recorded by the server. Moderators can enable or
        disable standard accounts. Admins can also grant or remove Moderator.
        Only Super Admins manage Admin and Super Admin roles.
      </p>
    </div>
  );

  let body;
  if (q.isLoading || (!ctx && !q.isError)) body = <Skeleton className="h-64" />;
  else if (q.isError)
    body = (
      <ErrorBlock
        message={errInfo(q.error).message}
        onRetry={() => q.refetch()}
      />
    );
  else if (!ok) body = <Skeleton className="h-64" />;
  else if (!role)
    body = (
      <Notice tone="warn">
        This area is for Moderators, Admins and Super Admins. Your account does
        not hold a platform role.
      </Notice>
    );
  else if (users.isLoading) body = <Skeleton className="h-64" />;
  else if (users.isError) {
    const e = errInfo(users.error);
    body = (
      <div className="space-y-4">
        <ErrorBlock message={e.message} onRetry={() => users.refetch()} />
        {ctx?.factors.some((f) => f.status === "verified") ? (
          <div className="max-w-sm rounded-lg border bg-card p-4">
            <p className="mb-3 text-sm">
              If this needs a stronger sign-in, verify your second factor.
            </p>
            <MfaVerify
              factors={ctx.factors}
              run={raw}
              onDone={() => users.refetch()}
            />
          </div>
        ) : (
          <Notice>
            Administration needs a verified second factor.{" "}
            <Link href="/account" className="underline">
              Enroll one in your account.
            </Link>
          </Notice>
        )}
      </div>
    );
  } else {
    const list = users.data ?? [];
    body = (
      <div className="space-y-3">
        {err && <Notice tone="error">{err}</Notice>}
        {errMfa && (
          <Notice tone="warn">
            Verify a second factor or enroll one from your{" "}
            <Link href="/account#security" className="underline">
              account security
            </Link>{" "}
            first.
          </Notice>
        )}
        {msg && <Notice tone="ok">{msg}</Notice>}
        {list.length === 0 && <Notice>No accounts returned.</Notice>}
        <ul className="divide-y rounded-lg border bg-card">
          {list.map((u) => {
            const self = u.id === ctx?.user?.id;
            const p = perms(role, u.platformRole);
            const canRole = !self && p.roles.length > 0;
            const canStatus = !self && p.status;
            return (
              <li
                key={u.id}
                className="grid gap-3 p-4 md:grid-cols-[1fr_auto] md:items-center"
              >
                <div className="min-w-0">
                  <p className="font-medium">
                    {u.displayName}
                    {self && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        (you)
                      </span>
                    )}
                    {u.status === "disabled" && (
                      <span className="ml-2 rounded bg-destructive/15 px-1.5 py-0.5 text-[11px] text-destructive">
                        disabled
                      </span>
                    )}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {u.kind} - {u.email ?? u.phone ?? "no contact"}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <code className="truncate font-mono text-[11px] text-muted-foreground">
                      {u.id}
                    </code>
                    <CopyButton text={u.id} label="ID" />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {canRole ? (
                    <select
                      aria-label={`Platform role for ${u.displayName}`}
                      disabled={busy === u.id}
                      value={u.platformRole ?? "none"}
                      onChange={(e) => ask(u, "role", e.target.value)}
                      className="h-9 rounded-md border bg-background px-2 text-sm disabled:opacity-50"
                    >
                      {p.roles.map((r) => (
                        <option key={r} value={r}>
                          {r === "none"
                            ? "No platform role"
                            : r.replace("_", " ")}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      {u.platformRole
                        ? u.platformRole.replace("_", " ")
                        : "No platform role"}
                    </span>
                  )}
                  {canStatus ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy === u.id}
                      onClick={() =>
                        ask(
                          u,
                          "status",
                          u.status === "active" ? "disabled" : "active",
                        )
                      }
                    >
                      {u.status === "active" ? "Disable" : "Enable"}
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {self ? "your account" : "not permitted"}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-10">
      {head}
      {body}
      <Confirm
        open={!!pending}
        title={pending?.title ?? ""}
        description={pending?.desc ?? ""}
        confirmLabel={pending?.label ?? "Confirm"}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          const p = pending;
          setPending(null);
          if (p) apply(p);
        }}
      />
      <StepUpDialog
        open={!!stepUp}
        factors={ctx?.factors ?? []}
        run={raw}
        onSettle={settleStepUp}
      />
    </div>
  );
}
