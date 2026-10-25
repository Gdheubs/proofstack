"use client";
import Link from "next/link";
import { useState } from "react";
import { useGetCareers } from "@workspace/api-client-react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty, QueryError } from "@/features/community/ui";
import { JobCard } from "@/features/careers/boards";
import { JobEditor } from "@/features/careers/job";
import { Applications } from "@/features/careers/workspace";
import { OpportunitiesShell } from "./shell";

// Hiring: for members who manage an organization. Post an opportunity, see
// your listings, and review applications in the hiring inbox.
export function HiringView() {
  const r = useGetCareers({ view: "dashboard" });
  const [create, setCreate] = useState(false);
  const body = () => {
    if (r.isPending) return <p>Loading your hiring workspace…</p>;
    if (r.error) return <QueryError error={r.error} />;
    const d = r.data;
    if (!d) return null;
    if (!d.organizations.length)
      return (
        <Empty
          title="Opportunities are posted by organizations"
          body="Create an organization, or ask an owner to make you an admin, to publish opportunities and review applicants here."
          action={
            <Button asChild>
              <Link href="/organizations">Create or join an organization</Link>
            </Button>
          }
        />
      );
    return (
      <div className="space-y-8">
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">Your listings</h2>
            <Button onClick={() => setCreate(!create)}>
              <Plus className="h-4 w-4" />
              {create ? "Close editor" : "Post an opportunity"}
            </Button>
          </div>
          {create && (
            <JobEditor
              organizations={d.organizations}
              done={() => setCreate(false)}
            />
          )}
          {d.jobs.length ? (
            <div className="grid gap-4 md:grid-cols-2">
              {d.jobs.map((j) => (
                <JobCard key={j.id} job={j} />
              ))}
            </div>
          ) : (
            <Empty
              title="No listings yet"
              body="Post a job, internship, contract or collaboration. Applicants attach their projects as evidence."
            />
          )}
          {d.hasMore && (
            <Link href="/opportunities" className="text-sm underline">
              Browse more listings
            </Link>
          )}
        </section>
        <Applications initialScope="received" />
      </div>
    );
  };
  return (
    <OpportunitiesShell
      title="Hiring"
      intro="Post opportunities for your organization and review the people who apply. Hiring decisions need a recent security-factor verification."
    >
      {body()}
    </OpportunitiesShell>
  );
}
