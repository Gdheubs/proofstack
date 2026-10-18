"use client";
import { useState } from "react";
import type {
  AuthActionInput,
  AuthActionResult,
  AuthFactor,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { errInfo } from "@/hooks/use-auth";
import {
  CODE_RE,
  CodeField,
  CopyButton,
  Field,
  Notice,
  PHONE_RE,
} from "@/features/auth/shared";

type Run = (d: AuthActionInput) => Promise<AuthActionResult>;

export function MfaVerify({
  factors,
  run,
  onDone,
}: {
  factors: AuthFactor[];
  run: Run;
  onDone?: () => void;
}) {
  const verified = factors.filter((f) => f.status === "verified");
  const [factorId, setFactorId] = useState(verified[0]?.id ?? "");
  const [challengeId, setChallengeId] = useState<string | undefined>();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const factor = verified.find((f) => f.id === factorId);

  if (!factor)
    return <Notice tone="warn">No verified second factor is available.</Notice>;

  const go = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(errInfo(e).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!CODE_RE.test(code)) return setErr("Enter the 6 to 10 digit code.");
        go(async () => {
          await run({
            action: "mfa-verify",
            factorId: factor.id,
            code,
            ...(challengeId ? { challengeId } : {}),
          });
          setCode("");
          onDone?.();
        });
      }}
    >
      {verified.length > 1 && (
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Factor</span>
          <select
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            value={factorId}
            onChange={(e) => {
              setFactorId(e.target.value);
              setChallengeId(undefined);
              setInfo(null);
            }}
          >
            {verified.map((f) => (
              <option key={f.id} value={f.id}>
                {f.type === "totp" ? "Authenticator app" : "Phone"}
                {f.name ? ` - ${f.name}` : ""}
              </option>
            ))}
          </select>
        </label>
      )}
      {factor.type === "phone" ? (
        <div className="space-y-2">
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() =>
              go(async () => {
                const r = await run({
                  action: "mfa-challenge",
                  factorId: factor.id,
                });
                setChallengeId(r.challengeId);
                setInfo(r.message);
              })
            }
          >
            {challengeId ? "Send a new code" : "Text me a code"}
          </Button>
          {info && <Notice tone="ok">{info}</Notice>}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Open your authenticator app and enter the current code.
        </p>
      )}
      <CodeField value={code} onChange={setCode} />
      {err && <Notice tone="error">{err}</Notice>}
      <Button
        type="submit"
        disabled={busy || (factor.type === "phone" && !challengeId)}
        data-testid="button-mfa-verify"
      >
        {busy ? "Verifying..." : "Verify and continue"}
      </Button>
    </form>
  );
}

export function MfaEnroll({
  run,
  phoneEnabled,
  totpEnabled,
  onDone,
}: {
  run: Run;
  phoneEnabled: boolean;
  totpEnabled: boolean;
  onDone?: () => void;
}) {
  const [type, setType] = useState<"totp" | "phone">(
    totpEnabled || !phoneEnabled ? "totp" : "phone",
  );
  const [phone, setPhone] = useState("");
  const [factor, setFactor] = useState<AuthActionResult["factor"]>();
  const [challengeId, setChallengeId] = useState<string | undefined>();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const go = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(errInfo(e).message);
    } finally {
      setBusy(false);
    }
  };

  if (!totpEnabled && !phoneEnabled)
    return (
      <Notice tone="warn">
        Second-factor enrollment is pending provider setup. Check back once MFA
        is enabled.
      </Notice>
    );

  if (!factor) {
    return (
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (type === "phone" && !PHONE_RE.test(phone))
            return setErr("Use international format, e.g. +14155550123.");
          go(async () => {
            const r = await run({
              action: "mfa-enroll",
              factorType: type,
              ...(type === "phone" ? { phone } : {}),
            });
            if (!r.factor)
              throw new Error("Enrollment did not return a factor.");
            setFactor(r.factor);
            if (type === "phone") {
              const c = await run({
                action: "mfa-challenge",
                factorId: r.factor.id,
              });
              setChallengeId(c.challengeId);
            }
          });
        }}
      >
        <div className="flex gap-2" role="radiogroup" aria-label="Factor type">
          {(
            [
              ["totp", "Authenticator app", totpEnabled],
              ["phone", "Phone (SMS)", phoneEnabled],
            ] as const
          ).map(([v, l, on]) => (
            <Button
              key={v}
              type="button"
              role="radio"
              aria-checked={type === v}
              variant={type === v ? "default" : "outline"}
              disabled={!on}
              onClick={() => setType(v)}
            >
              {l}
              {!on && " (pending setup)"}
            </Button>
          ))}
        </div>
        {type === "phone" && (
          <Field
            label="Phone number"
            value={phone}
            onChange={(e) => setPhone(e.target.value.trim())}
            placeholder="+14155550123"
            inputMode="tel"
            autoComplete="tel"
          />
        )}
        {err && <Notice tone="error">{err}</Notice>}
        <Button type="submit" disabled={busy} data-testid="button-mfa-enroll">
          {busy ? "Preparing..." : "Begin enrollment"}
        </Button>
      </form>
    );
  }

  const qr = factor.qrCode
    ? factor.qrCode.startsWith("<svg")
      ? `data:image/svg+xml;utf8,${encodeURIComponent(factor.qrCode)}`
      : factor.qrCode
    : null;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!CODE_RE.test(code)) return setErr("Enter the 6 to 10 digit code.");
        go(async () => {
          await run({
            action: "mfa-verify",
            factorId: factor.id,
            code,
            ...(challengeId ? { challengeId } : {}),
          });
          setFactor(undefined);
          setCode("");
          onDone?.();
        });
      }}
    >
      {factor.type === "totp" ? (
        <div className="space-y-3">
          <p className="text-sm">
            Scan with an authenticator app, then enter the code it shows. This
            setup is shown only now.
          </p>
          {qr && (
            <img
              src={qr}
              alt="Authenticator QR code"
              className="h-44 w-44 rounded-md border bg-white p-2"
            />
          )}
          {factor.secret && (
            <div className="flex flex-wrap items-center gap-2">
              <code className="break-all rounded bg-muted px-2 py-1 font-mono text-xs">
                {factor.secret}
              </code>
              <CopyButton text={factor.secret} label="Copy secret" />
            </div>
          )}
        </div>
      ) : (
        <Notice tone="ok">A code was sent to {phone}.</Notice>
      )}
      <CodeField value={code} onChange={setCode} />
      {err && <Notice tone="error">{err}</Notice>}
      <Button type="submit" disabled={busy}>
        {busy ? "Verifying..." : "Confirm factor"}
      </Button>
    </form>
  );
}

export function StepUpDialog({
  open,
  factors,
  run,
  onSettle,
}: {
  open: boolean;
  factors: AuthFactor[];
  run: Run;
  onSettle: (ok: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onSettle(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm it is you</DialogTitle>
          <DialogDescription>
            This action needs a fresh second-factor check. Verify, and it will
            continue automatically.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <MfaVerify
            factors={factors}
            run={run}
            onDone={() => onSettle(true)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
