import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/features/legal/legal-page";
import { MINIMUM_AGE, OPERATOR } from "@/lib/legal";

export const metadata: Metadata = {
  title: "About",
  description: "What ProofStack is and who runs it.",
};

export default function AboutPage() {
  return (
    <LegalPage
      eyebrow="About"
      title="About ProofStack"
      dated={false}
      intro={
        <p>
          ProofStack is a jobs and skills platform where people show what they
          can do through real projects, build with collaborators, check their
          skills and connect with employers.
        </p>
      }
    >
      <h2>What you can do</h2>
      <ul>
        <li>
          <strong>Show your work:</strong> a profile with projects, evidence and
          contributions, not just a list of claims.
        </li>
        <li>
          <strong>Collaborate:</strong> projects, organizations and teams, by
          invitation and with consent.
        </li>
        <li>
          <strong>Check your skills:</strong> short knowledge checks with a new
          question set each attempt and a report on what to practise next. They
          are self-assessments, not certifications.
        </li>
        <li>
          <strong>Find opportunities:</strong> employers post jobs and review
          applications; candidates choose whether recruiters can find them.
        </li>
      </ul>

      <h2>Our commitments</h2>
      <ul>
        <li>No advertising, no selling of data and no tracking tools.</li>
        <li>Candidates never pay to apply for jobs.</li>
        <li>You can download your data or delete your account at any time.</li>
        <li>Accounts are for people aged {MINIMUM_AGE} or over.</li>
      </ul>

      <h2>Who runs ProofStack</h2>
      <p>
        ProofStack is operated by {OPERATOR.legalName}, {OPERATOR.address}.
        Contact us at {OPERATOR.contactEmail}, or see{" "}
        <Link href="/contact">Contact and grievances</Link>.
      </p>
    </LegalPage>
  );
}
