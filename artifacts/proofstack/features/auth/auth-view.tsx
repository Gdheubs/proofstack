"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { createAuthReturn, type AuthReturn } from "../../lib/auth-return";
import { useQuery } from "@tanstack/react-query";
import {
  BrowserAuthSelection,
  fetchBrowserAuthConfig,
} from "./browser-firebase-auth";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { errInfo, useAct, useSession } from "@/hooks/use-auth";
import { AgreementFields, agreementProblem } from "@/features/legal/agreement";
import type {
  AuthCapabilities,
  SocialProvider,
} from "@workspace/api-client-react";

const SOCIAL_LABELS: Record<SocialProvider, string> = {
  google: "Google",
  github: "GitHub",
  azure: "Microsoft",
  linkedin_oidc: "LinkedIn",
  gitlab: "GitLab",
  discord: "Discord",
  x: "X",
  facebook: "Facebook",
};
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
} from "@/features/auth/shared";
import { MfaEnroll, MfaVerify } from "@/features/auth/mfa";

type Method = "password" | "email-code" | "phone-code";

function Shell({
  children,
  firebase = false,
}: {
  children: React.ReactNode;
  firebase?: boolean;
}) {
  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-5 py-12 md:grid-cols-[1fr_30rem] md:py-20">
      <div className="rise">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">
          ProofStack
        </p>
        <h1 className="mt-3 text-4xl font-semibold leading-[1.05] sm:text-5xl">
          Build something.
          <br />
          <span className="italic text-primary dark:text-accent">
            Let it open doors.
          </span>
        </h1>
        <p className="mt-5 max-w-md text-muted-foreground">
          One free account for developers and recruiters. Show real projects,
          check your skills and get found for what you can do.
        </p>
        <ul className="mt-8 space-y-3 text-sm text-muted-foreground">
          <li className="border-l-2 border-accent pl-3">
            {firebase
              ? "Sign in with your existing Google or GitHub account."
              : "New passwords need 12+ characters."}
          </li>
          <li className="border-l-2 border-accent pl-3">
            Privileged roles always require a second factor.
          </li>
          <li className="border-l-2 border-accent pl-3">
            {firebase
              ? "Only a short-lived sign-in token is sent to this app. Account access tokens are never kept."
              : "Codes are checked by the server. Provider credentials stay there."}
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

function PasswordTab({
  caps,
  initialMode = "login",
  onUseCode,
}: {
  caps: AuthCapabilities;
  initialMode?: "login" | "signup";
  onUseCode?: () => void;
}) {
  const s = useSend();
  const [mode, setMode] = useState<"login" | "signup" | "reset">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Kind>("developer");
  const [birthDate, setBirthDate] = useState("");
  const [accepted, setAccepted] = useState(false);
  const switchMode = (next: typeof mode) => {
    setMode(next);
    s.setErr(null);
    s.setMsg(null);
  };
  if (!caps.password)
    return (
      <Notice tone="warn">Password sign-in is not available right now.</Notice>
    );
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
          const agreement = agreementProblem(birthDate, accepted);
          if (agreement) return s.setErr(agreement);
          return s.send(async () => {
            const r = await s.raw({
              action: "signup",
              email,
              password,
              displayName: name.trim(),
              kind,
              birthDate,
              acceptTerms: true,
            });
            s.setMsg(r.message);
          });
        }
        s.send(() => s.raw({ action: "password-login", email, password }));
      }}
    >
      <h2 className="text-2xl font-semibold">
        {mode === "signup"
          ? "Create your account"
          : mode === "reset"
            ? "Reset your password"
            : "Welcome back"}
      </h2>
      {mode === "reset" && (
        <p className="text-sm text-muted-foreground">
          Enter your email and we will send a reset link.
        </p>
      )}
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
      {mode === "login" && (
        <div className="-mt-2 flex justify-end">
          <button
            type="button"
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            onClick={() => switchMode("reset")}
          >
            Forgot password?
          </button>
        </div>
      )}
      {mode === "signup" && <KindPicker value={kind} onChange={setKind} />}
      {mode === "signup" && (
        <AgreementFields
          birthDate={birthDate}
          onBirthDate={setBirthDate}
          accepted={accepted}
          onAccepted={setAccepted}
        />
      )}
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
            ? "Log in"
            : mode === "signup"
              ? "Create account"
              : "Send reset link"}
      </Button>
      <div className="space-y-1 border-t pt-4 text-center text-sm text-muted-foreground">
        {mode === "login" && onUseCode && (
          <p>
            <button
              type="button"
              className="underline underline-offset-2 hover:text-foreground"
              onClick={onUseCode}
            >
              Email me a one-time code instead
            </button>
          </p>
        )}
        <p>
          {mode === "signup"
            ? "Already have an account? "
            : "New to ProofStack? "}
          <button
            type="button"
            className="font-medium text-foreground underline underline-offset-2"
            onClick={() => switchMode(mode === "signup" ? "login" : "signup")}
          >
            {mode === "signup" ? "Log in" : "Create account"}
          </button>
        </p>
      </div>
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
        {via === "email" ? "Email" : "Phone"} codes are not available right now.
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

export function SocialTab({
  caps,
  returnTo,
}: {
  caps: AuthCapabilities;
  returnTo: AuthReturn;
}) {
  const s = useSend();
  const [framed, setFramed] = useState(false);
  useEffect(() => {
    try {
      setFramed(window.self !== window.top);
    } catch {
      setFramed(true);
    }
  }, []);
  const start = (provider: SocialProvider) =>
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
              <a
                href={`/auth?next=${encodeURIComponent(returnTo.destination)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-4 w-4" /> Open /auth in a new tab
              </a>
            </Button>
          </div>
        </Notice>
      )}
      {/* Only providers enabled in the identity project are offered. */}
      {caps.socialProviders.length === 0 && (
        <Notice tone="warn">Social sign-in is not available yet.</Notice>
      )}
      {caps.socialProviders.map((p) => (
        <Button
          key={p}
          variant="outline"
          className="w-full justify-start"
          disabled={s.busy || framed}
          onClick={() => start(p)}
          data-testid={`button-oauth-${p}`}
        >
          Continue with {SOCIAL_LABELS[p]}
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

function AuthInner({ returnTo }: { returnTo: AuthReturn }) {
  const q = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const { act } = useAct();
  const [method, setMethod] = useState<Method>("password");
  const ctx = q.data;
  const ready =
    !q.isLoading && !q.isError && !!ctx?.authenticated && !ctx.mfaRequired;
  useEffect(() => {
    if (ready) returnTo.complete(ctx, (path) => router.replace(path));
  }, [ready, ctx, router, returnTo]);

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
        <p className="text-sm">Signed in. Taking you to your destination...</p>
        <Button asChild className="mt-3">
          <Link href={returnTo.destination}>Continue</Link>
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
  const signup = params.get("mode") === "signup";
  const current: Method =
    method === "password" && !caps.password
      ? caps.emailOtp
        ? "email-code"
        : "phone-code"
      : method;
  const social = caps.socialProviders.length > 0;
  return (
    <Shell>
      {params.get("error") === "callback_failed" && (
        <div className="mb-4">
          <Notice tone="error">
            That link could not sign you in here. Your email is usually verified
            already, so try signing in with your email and password. Links only
            sign you in on the same browser and device where you started;
            otherwise request a new link and open it there.
          </Notice>
        </div>
      )}
      {social && (
        <div className="mb-5 space-y-4">
          <SocialTab caps={caps} returnTo={returnTo} />
          <div className="flex items-center gap-3 text-xs uppercase tracking-wider text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>
        </div>
      )}
      {current === "password" && (
        <PasswordTab
          caps={caps}
          // "Get started" links open straight to account creation.
          initialMode={signup ? "signup" : "login"}
          onUseCode={caps.emailOtp ? () => setMethod("email-code") : undefined}
        />
      )}
      {current === "email-code" && (
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold">Log in with a code</h2>
          <OtpTab via="email" caps={caps} />
        </div>
      )}
      {current === "phone-code" && (
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold">Log in with a phone code</h2>
          <OtpTab via="phone" caps={caps} />
        </div>
      )}
      {current !== "password" && (
        <div className="mt-4 space-y-2 border-t pt-4 text-center text-sm text-muted-foreground">
          {caps.password && (
            <p>
              <button
                type="button"
                className="underline underline-offset-2 hover:text-foreground"
                onClick={() => setMethod("password")}
              >
                Use your password instead
              </button>
            </p>
          )}
          {current === "email-code" && caps.phoneOtp && (
            <p>
              <button
                type="button"
                className="underline underline-offset-2 hover:text-foreground"
                onClick={() => setMethod("phone-code")}
              >
                Use a phone code
              </button>
            </p>
          )}
          <p className="text-xs leading-relaxed">
            New accounts confirm their date of birth (18 or over) and accept the{" "}
            <Link href="/terms" className="underline underline-offset-2">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="underline underline-offset-2">
              Privacy Policy
            </Link>{" "}
            right after signing in.
          </p>
        </div>
      )}
    </Shell>
  );
}

function LegacyAuthView({ returnTo }: { returnTo: AuthReturn }) {
  return (
    <Suspense fallback={null}>
      <AuthInner returnTo={returnTo} />
    </Suspense>
  );
}

export function AuthView() {
  const capturedReturn = useRef<AuthReturn | null>(null);
  const [returnTo, setReturnTo] = useState<AuthReturn | null>(null);
  useEffect(() => {
    if (!capturedReturn.current) {
      let storage: Storage | undefined;
      try {
        storage = window.sessionStorage;
      } catch {
        /* Private browsing may deny access to sessionStorage. */
      }
      capturedReturn.current = createAuthReturn(
        window.location.search,
        storage,
      );
    }
    setReturnTo(capturedReturn.current);
  }, []);
  const query = useQuery({
    queryKey: ["/api/auth/firebase/config"],
    queryFn: ({ signal }) => fetchBrowserAuthConfig(signal),
    staleTime: 0,
    retry: 1,
  });
  // Capture the URL once before mounting either flow: callbacks may omit next,
  // and already-authenticated users must not race the initial capture effect.
  if (!returnTo)
    return (
      <Shell>
        <p role="status">Loading sign-in options...</p>
      </Shell>
    );
  const content = (
    <BrowserAuthSelection
      query={query}
      returnTo={returnTo}
      legacy={<LegacyAuthView returnTo={returnTo} />}
    />
  );
  // The legacy view owns its original shell. Failed/stale configuration must
  // never render it, even if an earlier request selected Supabase.
  if (!query.isPending && !query.isError && query.data?.provider === "supabase")
    return content;
  return <Shell firebase>{content}</Shell>;
}
