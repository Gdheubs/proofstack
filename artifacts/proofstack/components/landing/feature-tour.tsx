"use client";
import { onTabKeyDown, tabProps } from "@/lib/a11y";
import { useState } from "react";
import {
  CollabMock,
  EditorMock,
  FeedMock,
  OpportunitiesMock,
  ProfileMock,
  SkillsMock,
} from "./mockups";

const FEATURES = [
  {
    key: "projects",
    label: "Projects",
    title: "Give every project a home",
    body: "Screenshots, the repository, a live demo and what you personally built. People explore the work, not a list of claims.",
    Mock: FeedMock,
  },
  {
    key: "code",
    label: "Code editor",
    title: "Edit and commit from the browser",
    body: "Connect GitHub once, then open any repository in a VS Code-style editor. Branch, change several files, and commit without leaving ProofStack.",
    Mock: EditorMock,
  },
  {
    key: "collab",
    label: "Collaboration",
    title: "Build with a team",
    body: "Organizations and teams by invitation only. Each project has a Work board where tasks, owners and finished work are tracked.",
    Mock: CollabMock,
  },
  {
    key: "skills",
    label: "Skill checks",
    title: "Show what you know",
    body: "Short checks with a fresh question set every attempt and a report on what to practise next. Results appear on your profile.",
    Mock: SkillsMock,
  },
  {
    key: "jobs",
    label: "Opportunities",
    title: "Apply with your work",
    body: "Roles and collaborations from organizations on ProofStack. Every application attaches a project, so employers see the evidence first.",
    Mock: OpportunitiesMock,
  },
  {
    key: "profile",
    label: "Profile",
    title: "Get found for what you do",
    body: "Choose whether recruiters can discover you. Your profile shows projects, evidence and skill results together.",
    Mock: ProfileMock,
  },
] as const;

export function FeatureTour() {
  const [active, setActive] =
    useState<(typeof FEATURES)[number]["key"]>("projects");
  const feature = FEATURES.find((f) => f.key === active)!;
  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div>
        <div
          role="tablist"
          aria-label="Features"
          className="mb-6 flex flex-wrap gap-2"
        >
          {FEATURES.map((f, i) => (
            <button
              key={f.key}
              type="button"
              {...tabProps(active === f.key)}
              onClick={() => setActive(f.key)}
              onKeyDown={(e) =>
                onTabKeyDown(e, i, FEATURES.length, (n) =>
                  setActive(FEATURES[n]!.key),
                )
              }
              className={`rounded-full border px-3 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${active === f.key ? "border-primary bg-primary text-primary-foreground dark:border-accent dark:bg-accent dark:text-accent-foreground" : "hover:bg-muted"}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <h3 className="text-2xl font-semibold sm:text-3xl">{feature.title}</h3>
        <p className="mt-3 max-w-lg text-muted-foreground">{feature.body}</p>
      </div>
      <div key={feature.key} className="rise">
        <feature.Mock />
      </div>
    </div>
  );
}
