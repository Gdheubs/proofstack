"use client";
import Link from "next/link";
import { useState } from "react";
import {
  useGetCareers,
  type CareerCandidate,
  type CareerJob,
  type GetCareersAvailability,
  type GetCareersKind,
  type GetCareersWorkplace,
} from "@workspace/api-client-react";
import { Building2, MapPin, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  PageHead,
  PersonAvatar,
  QueryError,
  Tags,
} from "@/features/community/ui";
import { useCsrf } from "@/hooks/use-community";
import { useViewer } from "@/hooks/use-viewer";
import { OpportunitiesShell } from "@/features/opportunities/shell";
import { card, field, Evidence, Pager } from "./shared";

const KIND_LABEL: Record<string, string> = {
  job: "Job",
  internship: "Internship",
  contract: "Contract",
  collaboration: "Collaboration",
};
const WORKPLACE_LABEL: Record<string, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "On-site",
};
const AVAILABILITY_LABEL: Record<string, string> = {
  open: "Open to offers",
  exploring: "Exploring",
  closed: "Not available",
};
const chip = "rounded-full border bg-muted/60 px-2.5 py-0.5 font-mono text-xs";

export function JobCard({ job: j }: { job: CareerJob }) {
  return (
    <article className={card + " flex flex-col"}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={chip}>{KIND_LABEL[j.kind] ?? j.kind}</span>
        <span className={chip}>
          {WORKPLACE_LABEL[j.workplace] ?? j.workplace}
        </span>
        {j.status !== "open" && (
          <span className="ml-auto text-xs uppercase text-muted-foreground">
            {j.status}
          </span>
        )}
      </div>
      <Link
        href={`/opportunities/${j.id}`}
        className="text-xl font-semibold leading-snug hover:underline"
      >
        {j.title}
      </Link>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
        <Link
          href={`/organizations/${j.organizationSlug}`}
          className="inline-flex items-center gap-1 hover:underline"
        >
          <Building2 aria-hidden="true" className="h-3.5 w-3.5" />
          {j.organizationName}
        </Link>
        {j.location && (
          <span className="inline-flex items-center gap-1">
            <MapPin aria-hidden="true" className="h-3.5 w-3.5" />
            {j.location}
          </span>
        )}
      </p>
      <p className="line-clamp-3 flex-1 text-sm">{j.description}</p>
      <p className="text-sm font-medium">
        {j.compensation || "Compensation not specified"}
      </p>
      <Tags items={j.skills} />
      {j.applied && (
        <p className="text-sm">
          Application submitted ·{" "}
          <Link href="/opportunities/applications" className="underline">
            Track progress
          </Link>
        </p>
      )}
    </article>
  );
}

export function CandidateCard({
  candidate: c,
}: {
  candidate: CareerCandidate;
}) {
  return (
    <article className={card}>
      <div className="flex items-start gap-3">
        <PersonAvatar person={c} size={48} />
        <div className="min-w-0 flex-1">
          <Link
            className="block truncate text-lg font-semibold hover:underline"
            href={`/profile/${c.handle}`}
          >
            {c.displayName}
          </Link>
          <p className="truncate font-mono text-xs text-muted-foreground">
            @{c.handle}
          </p>
        </div>
        <span className={chip}>
          {AVAILABILITY_LABEL[c.availability] ?? c.availability}
        </span>
      </div>
      {c.headline && <p className="text-sm">{c.headline}</p>}
      {c.roles.length > 0 && (
        <p className="text-sm text-muted-foreground">{c.roles.join(" · ")}</p>
      )}
      <Tags items={c.skills} skill />
      <Evidence projects={c.projects} />
    </article>
  );
}

function SearchField({
  value,
  onChange,
  label,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  placeholder: string;
}) {
  return (
    <label className="relative block min-w-0 flex-1">
      <span className="sr-only">{label}</span>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
      />
      <input
        placeholder={placeholder}
        className={field + " pl-9"}
        maxLength={120}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

// Browse: every public, open opportunity, with search and two filters.
export function OpportunityBrowse() {
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [kind, setKind] = useState<GetCareersKind | "">("");
  const [workplace, setWorkplace] = useState<GetCareersWorkplace | "">("");
  const r = useGetCareers({
    view: "jobs",
    q,
    offset,
    ...(kind ? { kind } : {}),
    ...(workplace ? { workplace } : {}),
  });
  const reset = () => setOffset(0);
  return (
    <OpportunitiesShell
      title="Find your next opportunity"
      intro="Jobs, internships, contracts and collaborations. Apply with projects that show how you build."
    >
      <div className="flex flex-wrap gap-3">
        <SearchField
          label="Search opportunities"
          placeholder="Search roles, skills, companies…"
          value={q}
          onChange={(v) => {
            setQ(v);
            reset();
          }}
        />
        <select
          aria-label="Type"
          className={field + " w-auto"}
          value={kind}
          onChange={(e) => {
            setKind(e.target.value as typeof kind);
            reset();
          }}
        >
          <option value="">All types</option>
          {Object.entries(KIND_LABEL).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        <select
          aria-label="Workplace"
          className={field + " w-auto"}
          value={workplace}
          onChange={(e) => {
            setWorkplace(e.target.value as typeof workplace);
            reset();
          }}
        >
          <option value="">All workplaces</option>
          {Object.entries(WORKPLACE_LABEL).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {r.isPending ? (
        <p role="status">Loading…</p>
      ) : r.error ? (
        <QueryError error={r.error} onRetry={() => r.refetch()} />
      ) : (
        r.data && (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              {r.data.jobs.map((j) => (
                <JobCard key={j.id} job={j} />
              ))}
            </div>
            {!r.data.jobs.length && (
              <Empty
                title="No matching opportunities yet"
                body="Try a different search or filter, or check Suggested for you once your skills are on your profile."
              />
            )}
            <Pager offset={offset} more={r.data.hasMore} change={setOffset} />
          </>
        )
      )}
    </OpportunitiesShell>
  );
}

// Talent: members who chose to be found, with availability and skill filters.
export function TalentDirectory() {
  const [q, setQ] = useState("");
  const [skill, setSkill] = useState("");
  const [availability, setAvailability] = useState<GetCareersAvailability | "">(
    "",
  );
  const [offset, setOffset] = useState(0);
  const { canAct } = useCsrf();
  const { viewer } = useViewer();
  const r = useGetCareers({
    view: "talent",
    q,
    offset,
    ...(skill.trim() ? { skill: skill.trim() } : {}),
    ...(availability ? { availability } : {}),
  });
  const reset = () => setOffset(0);
  return (
    <>
      <PageHead eyebrow="Talent" title="Discover builders">
        {canAct && viewer?.kind === "recruiter" && (
          <Button asChild>
            <Link href="/opportunities/hiring">Post an opportunity</Link>
          </Button>
        )}
      </PageHead>
      <p className="mb-6 max-w-2xl text-muted-foreground">
        Meet people through their work. Profiles here are opt-in; project links
        are evidence, not independent verification.
      </p>
      <div className="mb-6 flex flex-wrap gap-3">
        <SearchField
          label="Search people, roles, headlines"
          placeholder="Search people, roles, headlines…"
          value={q}
          onChange={(v) => {
            setQ(v);
            reset();
          }}
        />
        <label className="block">
          <span className="sr-only">Skill</span>
          <input
            placeholder="Skill, e.g. TypeScript"
            className={field + " w-44"}
            maxLength={60}
            value={skill}
            onChange={(e) => {
              setSkill(e.target.value);
              reset();
            }}
          />
        </label>
        <select
          aria-label="Availability"
          className={field + " w-auto"}
          value={availability}
          onChange={(e) => {
            setAvailability(e.target.value as typeof availability);
            reset();
          }}
        >
          <option value="">Any availability</option>
          <option value="open">Open to offers</option>
          <option value="exploring">Exploring</option>
        </select>
      </div>
      {r.isPending ? (
        <p role="status">Loading…</p>
      ) : r.error ? (
        <QueryError error={r.error} onRetry={() => r.refetch()} />
      ) : (
        r.data && (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              {r.data.candidates.map((c) => (
                <CandidateCard key={c.id} candidate={c} />
              ))}
            </div>
            {!r.data.candidates.length && (
              <Empty
                title="No matching builders yet"
                body="Try another skill or search, or return after the community grows."
              />
            )}
            <Pager offset={offset} more={r.data.hasMore} change={setOffset} />
          </>
        )
      )}
    </>
  );
}
