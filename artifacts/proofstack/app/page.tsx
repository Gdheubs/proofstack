import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  FolderGit2,
  GraduationCap,
  Lock,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FeatureTour } from "@/components/landing/feature-tour";
import { FeedMock, ProfileMock } from "@/components/landing/mockups";
import { HeroCta, LandingRedirect } from "@/features/home/hero-cta";
import { MINIMUM_AGE } from "@/lib/legal";

const steps = [
  {
    icon: FolderGit2,
    title: "Show your work",
    body: "Add projects with screenshots, repositories and demos. Connect GitHub and edit code right here.",
  },
  {
    icon: GraduationCap,
    title: "Prove your skills",
    body: "Take short skill checks with new questions every attempt. Results and topic scores appear on your profile.",
  },
  {
    icon: Search,
    title: "Get found",
    body: "Recruiters search the talent directory by evidence. Apply to roles with a project attached.",
  },
];

const trust = [
  { icon: Lock, text: "No ads and no selling of data" },
  {
    icon: ShieldCheck,
    text: "Download your data or delete your account any time",
  },
  { icon: BadgeCheck, text: "Candidates never pay to apply" },
  { icon: Users, text: `For people aged ${MINIMUM_AGE} and over` },
];

export default function Landing() {
  return (
    <>
      <LandingRedirect />
      <section className="ledger border-b">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 md:py-28 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">
              A community built around the work
            </p>
            <h1 className="mt-6 text-5xl font-semibold leading-[1.04] md:text-7xl">
              Build something.
              <br />
              <em className="text-primary dark:text-accent">
                Let it open doors.
              </em>
            </h1>
            <p className="mt-8 max-w-xl text-lg text-muted-foreground">
              ProofStack is where developers show real projects, check their
              skills and get hired for what they can do. Free to join.
            </p>
            <HeroCta />
          </div>
          <div className="relative mx-auto w-full max-w-md lg:max-w-none">
            <div className="rise">
              <FeedMock />
            </div>
            <div className="rise d2 absolute -bottom-8 -left-6 hidden w-64 sm:block">
              <ProfileMock />
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16 md:py-20">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
          How it works
        </p>
        <h2 className="mt-3 text-3xl font-semibold sm:text-4xl">
          Three steps from first commit to next chapter.
        </h2>
        <ol className="mt-10 grid gap-5 md:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title} className="rounded-xl border bg-card p-6">
              <div className="mb-4 flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary font-mono text-sm text-primary-foreground dark:bg-accent dark:text-accent-foreground">
                  {i + 1}
                </span>
                <s.icon
                  aria-hidden="true"
                  className="h-5 w-5 text-primary dark:text-accent"
                />
              </div>
              <h3 className="text-xl font-semibold">{s.title}</h3>
              <p className="mt-2 text-muted-foreground">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-y bg-muted/30">
        <div className="mx-auto max-w-6xl px-5 py-16 md:py-20">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Inside ProofStack
          </p>
          <h2 className="mb-10 mt-3 text-3xl font-semibold sm:text-4xl">
            One place for your projects, code, team and career.
          </h2>
          <FeatureTour />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16 md:py-20">
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
              For recruiters and teams
            </p>
            <h2 className="mt-3 text-3xl font-semibold sm:text-4xl">
              Hire on evidence, not keywords.
            </h2>
            <p className="mt-4 max-w-lg text-muted-foreground">
              Post roles from your organization, search the talent directory by
              real projects and skill results, and review applications that
              arrive with work attached. Messages with candidates stay in one
              inbox.
            </p>
            <Button asChild variant="outline" className="mt-6">
              <Link href="/auth?mode=signup">
                Create a recruiter account
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {trust.map((t) => (
              <li
                key={t.text}
                className="flex items-start gap-3 rounded-lg border bg-card p-4"
              >
                <t.icon
                  aria-hidden="true"
                  className="mt-0.5 h-5 w-5 shrink-0 text-primary dark:text-accent"
                />
                <span className="text-sm">{t.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="border-t">
        <div className="mx-auto max-w-6xl px-5 py-16 text-center md:py-24">
          <h2 className="text-3xl font-semibold sm:text-4xl">
            Ready to show what you can build?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            It takes two minutes to create a profile. Add a project, connect
            GitHub, and you are on the map.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button size="lg" asChild className="w-full sm:w-auto">
              <Link href="/auth?mode=signup">Get started free</Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              asChild
              className="w-full sm:w-auto"
            >
              <Link href="/about">Learn more</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
