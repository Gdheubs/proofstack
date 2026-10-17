"use client";
import Link from "next/link";
import { useState } from "react";
import { useGetCareers, type CareerJob } from "@workspace/api-client-react";
import { PageHead, QueryError, Empty } from "@/components/community/ui";
import { card, field, Evidence, Pager } from "./shared";
export function JobCard({ job: j }: { job: CareerJob }) {
  return (
    <article className={card}>
      <div className="flex justify-between gap-3">
        <Link
          href={`/opportunities/${j.id}`}
          className="text-xl font-semibold hover:underline"
        >
          {j.title}
        </Link>
        <span className="text-xs uppercase text-muted-foreground">
          {j.status}
        </span>
      </div>
      <Link
        href={`/organizations/${j.organizationSlug}`}
        className="text-sm underline"
      >
        {j.organizationName}
      </Link>
      <p className="text-sm text-muted-foreground">
        {j.kind} · {j.workplace}
        {j.location && ` · ${j.location}`}
      </p>
      <p className="line-clamp-3 text-sm">{j.description}</p>
      <p className="font-medium text-sm">
        {j.compensation || "Compensation not specified"}
      </p>
      <div className="flex flex-wrap gap-2">
        {j.skills.map((s) => (
          <span className="rounded-full bg-muted px-2 py-1 text-xs" key={s}>
            {s}
          </span>
        ))}
      </div>
      {j.applied && (
        <p className="text-sm">
          Application submitted ·{" "}
          <Link href="/career/applications" className="underline">
            Track progress
          </Link>
        </p>
      )}
    </article>
  );
}
export function Discovery({ talent = false }: { talent?: boolean }) {
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [workplace, setWorkplace] = useState<
    "" | "remote" | "hybrid" | "onsite"
  >("");
  const r = useGetCareers({
    view: talent ? "talent" : "jobs",
    q,
    offset,
    ...(workplace ? { workplace } : {}),
  });
  return (
    <>
      <PageHead
        eyebrow="Build together. Grow together."
        title={talent ? "Discover builders" : "Find your next opportunity"}
      >
        <Link href="/career" className="underline">
          Career workspace →
        </Link>
      </PageHead>
      <p className="mb-6 max-w-2xl text-muted-foreground">
        {talent
          ? "Meet people through their work. Profiles are opt-in; project links are evidence, not independent skill verification."
          : "Explore jobs, internships, contracts, and collaborations. Apply with projects that show how you build."}
      </p>
      <div className="mb-6 flex gap-3">
        <input
          aria-label={
            talent ? "Search people, roles, skills" : "Search opportunities"
          }
          placeholder={
            talent
              ? "Search people, roles, skills…"
              : "Search roles, skills, projects…"
          }
          className={field}
          maxLength={120}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOffset(0);
          }}
        />
        {!talent && (
          <select
            aria-label="Workplace"
            className={field + " max-w-40"}
            value={workplace}
            onChange={(e) => {
              setWorkplace(e.target.value as typeof workplace);
              setOffset(0);
            }}
          >
            <option value="">All workplaces</option>
            {["remote", "hybrid", "onsite"].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        )}
      </div>
      {r.isPending ? (
        <p role="status">Loading…</p>
      ) : r.error ? (
        <QueryError error={r.error} onRetry={() => r.refetch()} />
      ) : (
        r.data && (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              {talent
                ? r.data.candidates.map((c) => (
                    <article className={card} key={c.id}>
                      <div className="flex justify-between">
                        <Link
                          className="text-xl font-semibold underline"
                          href={`/profile/${c.handle}`}
                        >
                          {c.displayName}
                        </Link>
                        <span className="text-sm text-muted-foreground">
                          {c.availability}
                        </span>
                      </div>
                      <p>{c.headline}</p>
                      <p className="text-sm text-muted-foreground">
                        {c.roles.join(" · ")}
                      </p>
                      <p className="text-sm">{c.skills.join(" · ")}</p>
                      <Evidence projects={c.projects} />
                    </article>
                  ))
                : r.data.jobs.map((j) => <JobCard key={j.id} job={j} />)}
            </div>
            {!(talent ? r.data.candidates : r.data.jobs).length && (
              <Empty
                title={
                  talent
                    ? "No matching builders yet"
                    : "No matching opportunities yet"
                }
                body="Try a different search or return after the community grows."
              />
            )}
            <Pager offset={offset} more={r.data.hasMore} change={setOffset} />
          </>
        )
      )}
    </>
  );
}
