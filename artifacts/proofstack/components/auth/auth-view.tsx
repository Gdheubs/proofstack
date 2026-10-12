"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { errInfo, useAct, useSession } from "@/hooks/use-auth";
import type { AuthCapabilities } from "@workspace/api-client-react";
import {
  CODE_RE,
  CodeField,
  Confirm,
  ErrorBlock,
  Field,
  Kind,
  KindPicker,
  Notice,
  PHONE_RE,
  Skeleton,
  passwordProblem,
} from "@/components/auth/shared";
import { MfaEnroll, MfaVerify } from "@/components/auth/mfa";

type Tab = "password" | "email" | "phone" | "social";
const TABS: [Tab, string][] = [
  ["password", "Password"],
  ["email", "Email code"],
  ["phone", "Phone code"],
  ["social", "Google / GitHub"],
];

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-5 py-12 md:grid-cols-[1fr_30rem] md:py-20">
      <div className="rise">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">
          Identity
        </p>
        <h1 className="mt-3 text-4xl font-semibold leading-[1.05] sm:text-5xl">
          Prove who you are,
          <br />
          <span className="italic text-primary">then be found.</span>
        </h1>
        <p className="mt-5 max-w-md text-muted-foreground">
          One account for developers, recruiters and companies. Your profile
          type says who you are; it never decides what you can administer.
        </p>
        <ul className="mt-8 space-y-3 text-sm text-muted-foreground">
          <li className="border-l-2 border-accent pl-3">
            New passwords need 12+ characters.
          </li>
          <li className="border-l-2 border-accent pl-3">
            Privileged roles always require a second factor.
          </li>
          <li className="border-l-2 border-accent pl-3">
            Codes are checked by the server. Provider credentials stay there.
          </li>
        </ul>
      </div>
      <div className="rise d2 rounded-lg border bg-card p-5 sm:p-7">
        {children}
      </div>
    </div>
  );
}

function useSend() {
  const { raw } = useAct();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const send = async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      return await fn();
    } catch (e) {
      setErr(errInfo(e).message);
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  return { raw, busy, err, msg, setMsg, setErr, send };
}

function Status({ err, msg }: { err: string | null; msg: string | null }) {
  return (
    <>
      {err && <Notice tone="error">{err}</Notice>}
      {msg && <Notice tone="ok">{msg}</Notice>}
    </>
  );
}

function OtpVerify({ handle, onBack }: { handle: string; onBack: () => void }) {
  const s = useSend();
  const [code, setCode] = useState("");
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!CODE_RE.test(code))
          return s.setErr("Enter the 6 to 10 digit code.");
        s.send(() => s.raw({ action: "verify-otp", handle, code }));
      }}
    >
      <Notice>
        Enter the code we sent. If your email contains a sign-in link instead of
        a code, open it in this browser; it will bring you back here signed in.
      </Notice>
      <CodeField value={code} onChange={setCode} />
      <Status err={s.err} msg={s.msg} />
      <div className="flex gap-2">
        <Button type="submit" disabled={s.busy}>
          {s.busy ? "Verifying..." : "Verify code"}
        </Button>
        <Button type="button" variant="ghost" onClick={onBack}>
          Start over
        </Button>
      </div>
    </form>
  );
}

function PasswordTab({ caps }: { caps: AuthCapabilities }) {
  const s = useSend();
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Kind>("developer");
  if (!caps.password)
    return <Notice tone="warn">Password sign-in is pending setup.</Notice>;
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (mode === "reset") {
          return s.send(async () => {
            const r = await s.raw({ action: "password-reset", email });
            s.setMsg(r.message);
          });
        }
        if (mode === "signup") {
          const p = passwordProblem(password);
          if (p) return s.setErr(p);
          if (!name.trim()) return s.setErr("Add a display name.");
          return s.send(async () => {
            const r = await s.raw({
              action: "signup",
              email,
              password,
              displayName: name.trim(),
              kind,
            });
            s.setMsg(r.message);
          });
        }
        s.send(() => s.raw({ action: "password-login", email, password }));
      }}
    >
      <div className="flex gap-1 text-sm">
        {(["login", "signup", "reset"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              s.setErr(null);
              s.setMsg(null);
            }}
            className={`rounded-md px-3 py-1.5 ${mode === m ? "bg-secondary font-medium" : "text-muted-foreground hover:text-foreground"}`}
          >
            {m === "login"
              ? "Sign in"
              : m === "signup"
                ? "Create account"
                : "Forgot password"}
          </button>
        ))}
      </div>
      {mode === "signup" && (
        <Field
          label="Display name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
        />
      )}
      <Field
        label="Email"
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
      />
      {mode !== "reset" && (
        <Field
          label="Password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          hint={
            mode === "signup"
              ? "At least 12 characters, 72 bytes at most."
              : undefined
          }
        />
      )}
      {mode === "signup" && <KindPicker value={kind} onChange={setKind} />}
      <Status err={s.err} msg={s.msg} />
      <Button
        type="submit"
        disabled={s.busy}
        className="w-full"
        data-testid="button-password-submit"
      >
        {s.busy
          ? "Working..."
          : mode === "login"
            ? "Sign in"
            : mode === "signup"
              ? "Create account"
              : "Send reset instructions"}
      </Button>
    </form>
  );
}

function OtpTab({
  via,
  caps,
}: {
  via: "email" | "phone";
  caps: AuthCapabilities;
}) {
  const s = useSend();
  const [value, setValue] = useState("");
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Kind>("developer");
  const [handle, setHandle] = useState<string | null>(null);
  const enabled = via === "email" ? caps.emailOtp : caps.phoneOtp;
  if (!enabled)
    return (
      <Notice tone="warn">
        {via === "email" ? "Email" : "Phone"} codes are pending setup.
      </Notice>
    );
  if (handle)
    return <OtpVerify handle={handle} onBack={() => setHandle(null)} />;
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (via === "phone" && !PHONE_RE.test(value))
          return s.setErr("Use international format, e.g. +14155550123.");
        s.send(async () => {
          const r = await s.raw({
            action: via === "email" ? "email-otp" : "phone-otp",
            [via]: value,
            kind,
            ...(name.trim() ? { displayName: name.trim() } : {}),
          });
          if (r.handle) setHandle(r.handle);
          else s.setMsg(r.message);
        });
      }}
    >
      <p className="text-sm text-muted-foreground">
        New here? The same flow creates your account.
      </p>
      <Field
        label={via === "email" ? "Email" : "Phone number"}
        type={via === "email" ? "email" : "tel"}
        required
        value={value}
        onChange={(e) => setValue(e.target.value.trim())}
        placeholder={via === "phone" ? "+14155550123" : undefined}
      />
      <Field
        label="Display name (new accounts)"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <KindPicker value={kind} onChange={setKind} />
      {via === "email" && caps.emailDelivery === "development-limited" && (
        <Notice tone="warn">
          Email delivery is development-limited: only approved team addresses
          receive mail, capped at 2 emails per hour.
        </Notice>
      )}
      <Status err={s.err} msg={s.msg} />
      <Button type="submit" disabled={s.busy} className="w-full">
        {s.busy ? "Sending..." : "Send code"}
      </Button>
    </form>
  );
}

function SocialTab({ caps }: { caps: AuthCapabilities }) {
  const s = useSend();
  const [framed, setFramed] = useState(false);
  useEffect(() => {
    try {
      setFramed(window.self !== window.top);
    } catch {
      setFramed(true);
    }
  }, []);
  const start = (provider: "google" | "github") =>
    s.send(async () => {
      const r = await s.raw({ action: "oauth", provider });
      if (r.authorizationUrl) window.location.assign(r.authorizationUrl);
      else s.setErr("The provider did not return a sign-in address.");
    });
  return (
    <div className="space-y-3">
      {framed && (
        <Notice tone="warn">
          Providers refuse to load inside a preview frame. Open this page in its
          own tab, then continue.
          <div className="mt-2">
            <Button asChild size="sm" variant="outline">
              <a href="/auth" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" /> Open /auth in a new tab
              </a>
            </Button>
          </div>
        </Notice>
      )}
      {(["google", "github"] as const).map((p) => (
        <Button
          key={p}
          variant="outline"
          className="w-full justify-start"
          disabled={!caps[p] || s.busy || framed}
          onClick={() => start(p)}
          data-testid={`button-oauth-${p}`}
        >
          Continue with {p === "google" ? "Google" : "GitHub"}
          {!caps[p] && (
            <span className="ml-auto text-xs text-muted-foreground">
              pending setup
            </span>
          )}
        </Button>
      ))}
      <Status err={s.err} msg={s.msg} />
    </div>
  );
}

function BackupRecover({ act }: { act: ReturnType<typeof useAct>["act"] }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [ask, setAsk] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="mt-6 border-t pt-4">
      <button
        type="button"
        className="text-sm underline"
        onClick={() => setOpen((v) => !v)}
        data-testid="button-lost-factor"
      >
        Lost your second factor? Use a backup code
      </button>
      {open && (
        <form
          className="mt-3 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim()) setAsk(true);
          }}
        >
          <Notice tone="warn">
            You are signed in with your first factor only, which is required for
            recovery. Using a backup code signs you out and you must enroll a
            new factor after signing in again.
          </Notice>
          <Field
            label="Backup code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="off"
          />
          {err && <Notice tone="error">{err}</Notice>}
          <Button type="submit" variant="outline" disabled={busy}>
            Recover access
          </Button>
        </form>
      )}
      <Confirm
        open={ask}
        title="Use this backup code?"
        description="The code is spent, you are signed out, and a new second factor is required."
        confirmLabel="Use backup code"
        onCancel={() => setAsk(false)}
        onConfirm={async () => {
          setAsk(false);
          setBusy(true);
          setErr(null);
          try {
            await act({ action: "recover-mfa", code: code.trim() });
            setCode("");
          } catch (e) {
            setErr(errInfo(e).message);
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}

function AuthInner() {
  const q = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const { act } = useAct();
  const [tab, setTab] = useState<Tab>("password");
  const ctx = q.data;
  const ready = !!ctx?.authenticated && !ctx.mfaRequired;
  useEffect(() => {
    if (ready) router.replace("/account");
  }, [ready, router]);

  if (q.isLoading)
    return (
      <Shell>
        <Skeleton className="mb-3 h-8 w-2/3" />
        <Skeleton className="mb-3 h-10" />
        <Skeleton className="h-10" />
      </Shell>
    );
  if (q.isError || !ctx)
    return (
      <Shell>
        <ErrorBlock
          message={errInfo(q.error).message}
          onRetry={() => q.refetch()}
        />
      </Shell>
    );
  if (ready)
    return (
      <Shell>
        <p className="text-sm">Signed in. Taking you to your account...</p>
        <Button asChild className="mt-3">
          <Link href="/account">Open account</Link>
        </Button>
      </Shell>
    );

  if (ctx.authenticated && ctx.mfaRequired) {
    const hasVerified = ctx.factors.some((f) => f.status === "verified");
    return (
      <Shell>
        <h2 className="text-2xl font-semibold">
          {hasVerified ? "Second step" : "Set up a second factor"}
        </h2>
        <p className="mb-4 mt-1 text-sm text-muted-foreground">
          {hasVerified
            ? "Your account requires a second factor before continuing."
            : "Your role requires a second factor. Enroll one to continue."}
        </p>
        {hasVerified ? (
          <MfaVerify factors={ctx.factors} run={act} />
        ) : (
          <MfaEnroll
            run={act}
            totpEnabled={ctx.capabilities.totp}
            phoneEnabled={ctx.capabilities.phoneMfa}
          />
        )}
        <BackupRecover act={act} />
        <Button
          variant="ghost"
          size="sm"
          className="mt-4"
          onClick={() =>
            act({ action: "logout", scope: "local" }).catch(() => {})
          }
        >
          Sign out
        </Button>
      </Shell>
    );
  }

  const caps = ctx.capabilities;
  return (
    <Shell>
      {params.get("error") === "callback_failed" && (
        <div className="mb-4">
          <Notice tone="error">
            That sign-in link could not be completed. It may have expired or
            been used already. Request a fresh code or link and try again.
          </Notice>
        </div>
      )}
      <div role="tablist" className="mb-5 flex flex-wrap gap-1 border-b">
        {TABS.map(([k, l]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === k ? "border-accent font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {l}
          </button>
        ))}
      </div>
      {tab === "password" && <PasswordTab caps={caps} />}
      {tab === "email" && <OtpTab via="email" caps={caps} />}
      {tab === "phone" && <OtpTab via="phone" caps={caps} />}
      {tab === "social" && <SocialTab caps={caps} />}
      {caps.pendingSetup.length > 0 && (
        <p className="mt-5 font-mono text-[11px] text-muted-foreground">
          Pending setup: {caps.pendingSetup.join(", ")}
        </p>
      )}
    </Shell>
  );
}

export function AuthView() {
  return (
    <Suspense fallback={null}>
      <AuthInner />
    </Suspense>
  );
}
