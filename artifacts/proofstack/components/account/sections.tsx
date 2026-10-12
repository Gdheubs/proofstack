"use client";
import { useState } from "react";
import { Monitor } from "lucide-react";
import type {
  AccountDetails,
  AuthActionInput,
  AuthActionResult,
  AuthContext,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { errInfo } from "@/hooks/use-auth";
import {
  CODE_RE,
  CodeField,
  Confirm,
  CopyButton,
  Field,
  KindPicker,
  Notice,
  Panel,
  PHONE_RE,
  passwordProblem,
  type Kind,
} from "@/components/auth/shared";
import { MfaEnroll } from "@/components/auth/mfa";

export type Act = (d: AuthActionInput) => Promise<AuthActionResult>;
type Props = { account: AccountDetails; ctx: AuthContext; act: Act };

function useRun(act: Act) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [mfa, setMfa] = useState(false);
  const run = async (
    d: AuthActionInput,
    ok?: (r: AuthActionResult) => void,
  ) => {
    setBusy(true);
    setErr(null);
    setMfa(false);
    setMsg(null);
    try {
      const r = await act(d);
      setMsg(r.message);
      ok?.(r);
    } catch (e) {
      const i = errInfo(e);
      setErr(i.message);
      setMfa(i.code === "MFA_REQUIRED");
    } finally {
      setBusy(false);
    }
  };
  return { busy, err, msg, mfa, run, setErr };
}

function Out({
  err,
  msg,
  mfa,
}: {
  err: string | null;
  msg: string | null;
  mfa?: boolean;
}) {
  return (
    <>
      {err && <Notice tone="error">{err}</Notice>}
      {mfa && (
        <Notice tone="warn">
          This needs two-step verification on your account. Add and verify an
          authenticator app or phone factor in{" "}
          <a href="#security" className="underline">
            Two-step verification
          </a>
          , then repeat this action.
        </Notice>
      )}
      {msg && <Notice tone="ok">{msg}</Notice>}
    </>
  );
}

const fmt = (s: string) =>
  new Date(s).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

export function IdentityPanel({ account, act }: Props) {
  const u = account.user;
  const r = useRun(act);
  const [name, setName] = useState(u.displayName);
  const [kind, setKind] = useState<Kind>(u.kind);
  return (
    <Panel title="Profile" eyebrow="Identity">
      <div className="mb-5 rounded-md border bg-muted/50 p-3">
        <p className="text-xs text-muted-foreground">
          Account ID - share this to be added to an organization
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <code
            className="break-all font-mono text-sm"
            data-testid="text-account-id"
          >
            {u.id}
          </code>
          <CopyButton text={u.id} label="Copy ID" />
        </div>
      </div>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return r.setErr("Display name is required.");
          r.run({ action: "update-profile", displayName: name.trim(), kind });
        }}
      >
        <Field
          label="Display name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <KindPicker value={kind} onChange={setKind} />
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">Email</dt>
            <dd>
              {u.email ?? "none"}{" "}
              {u.email && (u.emailVerified ? "(verified)" : "(unverified)")}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Platform role</dt>
            <dd>
              {u.platformRole ? u.platformRole.replace("_", " ") : "none"}
            </dd>
          </div>
        </dl>
        <Out err={r.err} msg={r.msg} />
        <Button type="submit" disabled={r.busy}>
          Save profile
        </Button>
      </form>
    </Panel>
  );
}

export function PhonePanel({ account, ctx, act }: Props) {
  const u = account.user;
  const r = useRun(act);
  const [phone, setPhone] = useState("");
  const [handle, setHandle] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const enabled = ctx.capabilities.phoneOtp;
  return (
    <Panel title="Phone" eyebrow="Verification">
      <p className="mb-3 text-sm">
        {u.phone
          ? `${u.phone} - ${u.phoneVerified ? "verified" : "not verified"}`
          : "No phone number on file."}
      </p>
      {!enabled && (
        <Notice tone="warn">Phone verification is pending setup.</Notice>
      )}
      {enabled && !handle && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!PHONE_RE.test(phone))
              return r.setErr("Use international format, e.g. +14155550123.");
            r.run({ action: "send-phone-verification", phone }, (x) =>
              setHandle(x.handle ?? null),
            );
          }}
        >
          <Field
            label="Phone number"
            value={phone}
            onChange={(e) => setPhone(e.target.value.trim())}
            placeholder="+14155550123"
          />
          <Out err={r.err} msg={r.msg} />
          <Button type="submit" disabled={r.busy}>
            Send verification code
          </Button>
        </form>
      )}
      {enabled && handle && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!CODE_RE.test(code))
              return r.setErr("Enter the 6 to 10 digit code.");
            r.run({ action: "verify-otp", handle, code }, () => {
              setHandle(null);
              setCode("");
            });
          }}
        >
          <CodeField value={code} onChange={setCode} />
          <Out err={r.err} msg={r.msg} />
          <div className="flex gap-2">
            <Button type="submit" disabled={r.busy}>
              Verify phone
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setHandle(null)}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </Panel>
  );
}

export function PasswordPanel({ account, act }: Props) {
  const r = useRun(act);
  const [pw, setPw] = useState("");
  const [ask, setAsk] = useState(false);
  return (
    <Panel title="Password" eyebrow="Credentials">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const p = passwordProblem(pw);
          if (p) return r.setErr(p);
          setAsk(true);
        }}
      >
        {account.passwordRecovery && (
          <Notice tone="warn">
            You arrived through password recovery. Set a new password now.
          </Notice>
        )}
        <Field
          label="New password"
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          autoComplete="new-password"
          hint="12+ characters. You will be signed out everywhere after changing it."
        />
        <Out err={r.err} msg={r.msg} />
        <Button type="submit" disabled={r.busy}>
          Change password
        </Button>
      </form>
      <Confirm
        open={ask}
        title="Change password and sign out?"
        description="Changing your password signs you out. Sign in again with the new password."
        confirmLabel="Change password"
        onCancel={() => setAsk(false)}
        onConfirm={() => {
          setAsk(false);
          r.run({ action: "update-password", password: pw });
          setPw("");
        }}
      />
    </Panel>
  );
}

export function SessionsPanel({ account, act }: Props) {
  const r = useRun(act);
  const [revoke, setRevoke] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  return (
    <Panel
      title="Devices"
      eyebrow="Sessions"
      action={
        <Button variant="outline" size="sm" onClick={() => setAll(true)}>
          Sign out everywhere
        </Button>
      }
    >
      <ul className="divide-y">
        {account.sessions.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-3 py-3">
            <Monitor
              className="h-4 w-4 text-muted-foreground"
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {s.deviceLabel}
                {s.current && (
                  <span className="ml-2 rounded bg-accent/25 px-1.5 py-0.5 text-[11px]">
                    this device
                  </span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                Last seen {fmt(s.lastSeenAt)} - expires {fmt(s.expiresAt)}
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                s.current
                  ? r.run({ action: "logout", scope: "local" })
                  : setRevoke(s.id)
              }
            >
              {s.current ? "Sign out" : "Revoke"}
            </Button>
          </li>
        ))}
        {account.sessions.length === 0 && (
          <li className="py-3 text-sm text-muted-foreground">
            No sessions listed.
          </li>
        )}
      </ul>
      <div className="mt-3 space-y-2">
        <Out err={r.err} msg={r.msg} />
      </div>
      <Confirm
        open={!!revoke}
        title="Revoke this session?"
        description="That device will be signed out immediately."
        confirmLabel="Revoke"
        onCancel={() => setRevoke(null)}
        onConfirm={() => {
          const id = revoke;
          setRevoke(null);
          if (id) r.run({ action: "revoke-session", sessionId: id });
        }}
      />
      <Confirm
        open={all}
        title="Sign out of every device?"
        description="All sessions, including this one, will end."
        confirmLabel="Sign out everywhere"
        onCancel={() => setAll(false)}
        onConfirm={() => {
          setAll(false);
          r.run({ action: "logout", scope: "global" });
        }}
      />
    </Panel>
  );
}

export function SecurityPanel({ account, ctx, act }: Props) {
  const r = useRun(act);
  const [enroll, setEnroll] = useState(false);
  const [rm, setRm] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [recover, setRecover] = useState("");
  const [askCodes, setAskCodes] = useState(false);
  const verified = account.factors.filter((f) => f.status === "verified");
  return (
    <Panel
      id="security"
      title="Two-step verification"
      eyebrow="Security"
      action={
        <Button
          variant="outline"
          size="sm"
          onClick={() => setEnroll((v) => !v)}
        >
          {enroll ? "Close" : "Add factor"}
        </Button>
      }
    >
      {account.user.mfaRecoveryRequired && (
        <div className="mb-3">
          <Notice tone="warn">
            Recovery was used. Enroll a new factor to restore full access.
          </Notice>
        </div>
      )}
      <ul className="divide-y">
        {account.factors.map((f) => (
          <li key={f.id} className="flex items-center gap-3 py-3">
            <div className="flex-1">
              <p className="text-sm font-medium">
                {f.type === "totp" ? "Authenticator app" : "Phone"}
                {f.name ? ` - ${f.name}` : ""}
              </p>
              <p className="text-xs text-muted-foreground">{f.status}</p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setRm(f.id)}>
              Remove
            </Button>
          </li>
        ))}
        {account.factors.length === 0 && (
          <li className="py-3 text-sm text-muted-foreground">
            No second factor yet. Privileged roles require one.
          </li>
        )}
      </ul>
      {enroll && (
        <div className="mt-4 rounded-md border p-4">
          <MfaEnroll
            run={act}
            totpEnabled={ctx.capabilities.totp}
            phoneEnabled={ctx.capabilities.phoneMfa}
            onDone={() => setEnroll(false)}
          />
        </div>
      )}
      <div className="mt-6 border-t pt-4">
        <h3 className="text-base font-semibold">Backup codes</h3>
        <p className="mb-3 text-sm text-muted-foreground">
          {account.recoveryCodesRemaining} unused. Each works once. A new set
          replaces the old one.
        </p>
        {codes ? (
          <div className="space-y-3 rounded-md border border-accent/60 bg-accent/10 p-4">
            <p className="text-sm font-medium">
              Save these now. They will not be shown again.
            </p>
            <ul
              className="grid grid-cols-2 gap-1 font-mono text-sm"
              data-testid="list-recovery-codes"
            >
              {codes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <div className="flex gap-2">
              <CopyButton text={codes.join("\n")} label="Copy all" />
              <Button size="sm" onClick={() => setCodes(null)}>
                I saved them
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="secondary"
            disabled={verified.length === 0 || r.busy}
            onClick={() => setAskCodes(true)}
          >
            Generate backup codes
          </Button>
        )}
        {verified.length === 0 && !codes && (
          <p className="mt-2 text-xs text-muted-foreground">
            Verify a factor first.
          </p>
        )}
      </div>
      <form
        className="mt-6 space-y-2 border-t pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (recover.trim())
            r.run({ action: "recover-mfa", code: recover.trim() }, () =>
              setRecover(""),
            );
        }}
      >
        <h3 className="text-base font-semibold">Use a backup code</h3>
        <p className="text-sm text-muted-foreground">
          Lost your factor? This signs you out and requires re-enrollment.
        </p>
        <div className="flex gap-2">
          <Field
            label="Backup code"
            value={recover}
            onChange={(e) => setRecover(e.target.value)}
            autoComplete="off"
          />
          <Button
            type="submit"
            variant="outline"
            className="self-end"
            disabled={r.busy}
          >
            Recover
          </Button>
        </div>
      </form>
      <div className="mt-3 space-y-2">
        <Out err={r.err} msg={codes ? null : r.msg} />
      </div>
      <Confirm
        open={askCodes}
        title="Generate new backup codes?"
        description="Any earlier backup codes stop working."
        confirmLabel="Generate"
        onCancel={() => setAskCodes(false)}
        onConfirm={() => {
          setAskCodes(false);
          r.run({ action: "recovery-codes" }, (x) =>
            setCodes(x.recoveryCodes ?? null),
          );
        }}
      />
      <Confirm
        open={!!rm}
        title="Remove this factor?"
        description="Removing a factor signs you out. Accounts with privileged roles must enroll again."
        confirmLabel="Remove factor"
        onCancel={() => setRm(null)}
        onConfirm={() => {
          const id = rm;
          setRm(null);
          if (id) r.run({ action: "mfa-remove", factorId: id });
        }}
      />
    </Panel>
  );
}

export function OrgPanel({ account, act }: Props) {
  const r = useRun(act);
  const m = useRun(act);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [orgId, setOrgId] = useState("");
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<"organization_owner" | "organization_admin">(
    "organization_admin",
  );
  const [ask, setAsk] = useState(false);
  const managed = account.memberships.filter(
    (x) => x.role === "organization_owner",
  );
  return (
    <Panel title="Organizations" eyebrow="Membership">
      <ul className="space-y-4">
        {account.memberships.map((o) => (
          <li key={o.organizationId} className="rounded-md border p-3">
            <p className="font-medium">
              {o.name}{" "}
              <span className="font-mono text-xs text-muted-foreground">
                /{o.slug}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              Your role: {o.role.replace("organization_", "")} - org ID{" "}
              <code className="font-mono">{o.organizationId}</code>
            </p>
            <ul className="mt-2 space-y-1 text-sm">
              {o.members.map((p) => (
                <li key={p.userId} className="flex justify-between gap-2">
                  <span>{p.displayName}</span>
                  <span className="text-muted-foreground">
                    {p.role.replace("organization_", "")}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
        {account.memberships.length === 0 && (
          <li className="text-sm text-muted-foreground">
            You do not belong to an organization yet. Create one below, or give
            an owner your Account ID.
          </li>
        )}
      </ul>
      <form
        className="mt-5 grid gap-3 border-t pt-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          r.run(
            {
              action: "create-organization",
              name: name.trim(),
              slug: slug.trim(),
            },
            () => {
              setName("");
              setSlug("");
            },
          );
        }}
      >
        <h3 className="text-base font-semibold sm:col-span-2">
          Create organization
        </h3>
        <p className="text-sm text-muted-foreground sm:col-span-2">
          Creating an organization requires a verified second factor.
        </p>
        <Field
          label="Name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Field
          label="Slug"
          required
          value={slug}
          onChange={(e) =>
            setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
          }
          hint="lowercase letters, numbers, hyphens"
        />
        <div className="space-y-2 sm:col-span-2">
          <Out err={r.err} msg={r.msg} mfa={r.mfa} />
          <Button type="submit" disabled={r.busy}>
            Create organization
          </Button>
        </div>
      </form>
      {account.memberships.length > 0 && managed.length === 0 && (
        <p className="mt-5 border-t pt-4 text-sm text-muted-foreground">
          Only organization owners can add members or change roles. You can view
          memberships.
        </p>
      )}
      {managed.length > 0 && (
        <form
          className="mt-5 space-y-3 border-t pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            setAsk(true);
          }}
        >
          <h3 className="text-base font-semibold">
            Add or change a member (owners only)
          </h3>
          <p className="text-sm text-muted-foreground">
            The person must already have an account. Ask for their Account ID.
          </p>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Organization</span>
            <select
              required
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
            >
              <option value="">Select...</option>
              {managed.map((o) => (
                <option key={o.organizationId} value={o.organizationId}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
          <Field
            label="Member Account ID"
            required
            value={userId}
            onChange={(e) => setUserId(e.target.value.trim())}
            className="font-mono"
          />
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Role</span>
            <select
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={role}
              onChange={(e) => setRole(e.target.value as typeof role)}
            >
              <option value="organization_admin">Organization admin</option>
              <option value="organization_owner">Organization owner</option>
            </select>
          </label>
          <Out err={m.err} msg={m.msg} mfa={m.mfa} />
          <Button type="submit" disabled={m.busy || !orgId || !userId}>
            Apply role
          </Button>
        </form>
      )}
      <Confirm
        open={ask}
        title="Grant organization role?"
        description={`Set this account as ${role.replace("organization_", "")} of the selected organization. The server will enforce whether you may do this.`}
        confirmLabel="Apply role"
        onCancel={() => setAsk(false)}
        onConfirm={() => {
          setAsk(false);
          m.run(
            {
              action: "organization-role",
              organizationId: orgId,
              userId,
              role,
            },
            () => setUserId(""),
          );
        }}
      />
    </Panel>
  );
}

export function ActivityPanel({ account }: Props) {
  return (
    <Panel title="Security activity" eyebrow="Log">
      <ol className="relative space-y-3 border-l pl-4">
        {account.activity.map((a) => (
          <li key={a.id} className="text-sm">
            <span className="absolute -left-[3px] h-1.5 w-1.5 rounded-full bg-accent" />
            <span className="font-mono">{a.action}</span>
            <span className="block text-xs text-muted-foreground">
              {fmt(a.createdAt)}
            </span>
          </li>
        ))}
        {account.activity.length === 0 && (
          <li className="text-sm text-muted-foreground">
            Nothing recorded yet.
          </li>
        )}
      </ol>
    </Panel>
  );
}
