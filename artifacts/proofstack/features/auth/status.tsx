"use client";
import Link from "next/link";
import { useSession } from "@/hooks/use-auth";

export function useAuthSummary() {
  const q = useSession();
  const c = q.data?.capabilities;
  const on: (readonly [string, boolean])[] = c
    ? ([
        ["password", c.password],
        ["email code", c.emailOtp],
        ["phone code", c.phoneOtp],
        ["Google", c.google],
        ["GitHub", c.github],
        ["authenticator MFA", c.totp],
        ["phone MFA", c.phoneMfa],
      ] as const)
    : [];
  return {
    q,
    enabled: on.filter(([, v]) => v).map(([k]) => k),
    pending: on.filter(([, v]) => !v).map(([k]) => k),
    delivery: c?.emailDelivery,
  };
}

export function AuthStatusCopy() {
  const { q, enabled, pending, delivery } = useAuthSummary();
  if (q.isLoading)
    return <p>Checking the server for authentication state...</p>;
  if (q.isError || !q.data)
    return (
      <p>Authentication state could not be read from the server right now.</p>
    );
  return (
    <>
      <p>
        Sign-in is handled by the server.{" "}
        {enabled.length
          ? `Reported enabled: ${enabled.join(", ")}.`
          : "No method is reported enabled."}{" "}
        {pending.length ? `Pending setup: ${pending.join(", ")}.` : ""}
      </p>
      {delivery === "development-limited" && (
        <p>Email delivery is development-limited and not production ready.</p>
      )}
      <p>
        <Link href="/auth" className="underline">
          Sign in or create an account
        </Link>
      </p>
    </>
  );
}
