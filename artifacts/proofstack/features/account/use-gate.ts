"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/hooks/use-auth";

export function useGate() {
  const q = useSession();
  const router = useRouter();
  const ctx = q.data;
  const ok = !!ctx?.authenticated && !ctx.mfaRequired;
  const bounce = !!ctx && !ok;
  useEffect(() => {
    if (bounce) router.replace("/auth");
  }, [bounce, router]);
  return { q, ctx, ok };
}
