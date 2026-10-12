"use client";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import {
  useRunCareerAction,
  getGetCareersQueryKey,
  getGetCommunityQueryKey,
  type CareerInput,
  type CareerProof,
} from "@workspace/api-client-react";
import { useCsrf } from "@/hooks/use-community";
import { errInfo, useAct, type StepUpState } from "@/hooks/use-auth";
import { toast } from "sonner";
import { useState, type FormEvent, type ReactNode } from "react";
import { StepUpDialog } from "@/components/auth/mfa";
import { Button } from "@/components/ui/button";
export const field = "w-full rounded-md border bg-background px-3 py-2 text-sm";
export const card = "rounded-xl border bg-card p-5 space-y-3";
export function useCareerRun() {
  const { request, canAct, session } = useCsrf();
  const { raw } = useAct();
  const [stepUp, setStepUp] = useState<StepUpState>(null);
  const m = useRunCareerAction({ request });
  const qc = useQueryClient();
  const [error, setError] = useState("");
  return {
    pending: m.isPending || !!stepUp,
    stepUp,
    raw,
    factors: session.data?.factors ?? [],
    settle: (ok: boolean) => {
      const current = stepUp;
      setStepUp(null);
      if (current) (ok ? current.resolve : () => current.reject())();
    },
    canAct,
    viewerId: session.data?.user?.id,
    error,
    run: async (data: CareerInput) => {
      setError("");
      try {
        let r;
        try {
          r = await m.mutateAsync({ data });
        } catch (e) {
          const code = errInfo(e).code;
          if (
            code !== "MFA_STEP_UP_REQUIRED" &&
            !(
              code === "MFA_REQUIRED" &&
              session.data?.factors.some((f) => f.status === "verified")
            )
          )
            throw e;
          await new Promise<void>((resolve, reject) =>
            setStepUp({
              resolve,
              reject: () => reject(new Error("Verification cancelled.")),
            }),
          );
          r = await m.mutateAsync({ data });
        }
        await qc.invalidateQueries({ queryKey: getGetCareersQueryKey() });
        await qc.invalidateQueries({ queryKey: getGetCommunityQueryKey() });
        toast.success(r.message);
        return r;
      } catch (e) {
        setError(errInfo(e).message);
        return null;
      }
    },
  };
}
export function CareerForm({
  children,
  submit,
  action,
}: {
  children: ReactNode;
  submit: string;
  action: ReturnType<typeof useCareerRun>;
}) {
  return (
    <>
      <StepUpDialog
        open={!!action.stepUp}
        factors={action.factors}
        run={action.raw}
        onSettle={action.settle}
      />
      {children}
      <p role="alert" className="text-sm text-destructive">
        {action.error}
      </p>
      {/security factor|verification/i.test(action.error) && (
        <Link href="/account" className="underline">
          Verify your account
        </Link>
      )}
      <Button type="submit" disabled={action.pending || !action.canAct}>
        {action.pending ? "Saving…" : submit}
      </Button>
      {!action.canAct && (
        <Link className="ml-3 underline" href="/auth">
          Sign in to continue
        </Link>
      )}
    </>
  );
}
export function values(e: FormEvent<HTMLFormElement>) {
  e.preventDefault();
  return new FormData(e.currentTarget);
}
export const val = (f: FormData, k: string) => String(f.get(k) ?? "");
export const list = (s: string) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
export function Field({
  label,
  name,
  value = "",
  required = false,
  area = false,
  max = 160,
}: {
  label: string;
  name: string;
  value?: string;
  required?: boolean;
  area?: boolean;
  max?: number;
}) {
  return (
    <label className="block space-y-1 text-sm">
      <span>{label}</span>
      {area ? (
        <textarea
          className={field}
          name={name}
          defaultValue={value}
          required={required}
          maxLength={max}
          rows={5}
        />
      ) : (
        <input
          className={field}
          name={name}
          defaultValue={value}
          required={required}
          maxLength={max}
        />
      )}
    </label>
  );
}
export function Select({
  label,
  name,
  items,
  value,
}: {
  label: string;
  name: string;
  items: readonly string[];
  value?: string;
}) {
  return (
    <label className="block space-y-1 text-sm">
      <span>{label}</span>
      <select name={name} defaultValue={value} className={field}>
        {items.map((x) => (
          <option key={x}>{x}</option>
        ))}
      </select>
    </label>
  );
}
export function Evidence({ projects }: { projects: CareerProof[] }) {
  return (
    <div className="space-y-2">
      {projects.map((p) => (
        <div key={p.id} className="rounded-lg border p-3">
          <Link className="font-medium underline" href={`/projects/${p.slug}`}>
            {p.title}
          </Link>
          <span className="ml-2 text-xs text-muted-foreground">
            {p.relationship} · linked evidence
          </span>
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {p.description}
          </p>
          <div className="flex gap-4 text-sm">
            {p.repositoryUrl && (
              <a
                href={p.repositoryUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Repository ↗
              </a>
            )}
            {p.demoUrl && (
              <a
                href={p.demoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Demo ↗
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
export function PickProof({
  projects,
  selected = [],
}: {
  projects: CareerProof[];
  selected?: string[];
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-medium">
        Project evidence (choose up to 3)
      </legend>
      {projects.map((p) => (
        <label key={p.id} className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="projects"
            value={p.id}
            defaultChecked={selected.includes(p.id)}
          />
          {p.title}
        </label>
      ))}
      {!projects.length && (
        <p className="text-sm text-muted-foreground">
          Publish a project or accept a contributor invitation first.
        </p>
      )}
    </fieldset>
  );
}
export function Pager({
  offset,
  more,
  change,
}: {
  offset: number;
  more: boolean;
  change: (n: number) => void;
}) {
  return (
    <div className="mt-6 flex gap-3">
      <Button
        variant="outline"
        disabled={!offset}
        onClick={() => change(Math.max(0, offset - 20))}
      >
        Previous
      </Button>
      <Button
        variant="outline"
        disabled={!more || offset >= 10000}
        onClick={() => change(offset + 20)}
      >
        Next
      </Button>
    </div>
  );
}
