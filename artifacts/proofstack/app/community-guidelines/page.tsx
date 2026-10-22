import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/features/legal/legal-page";
import { OPERATOR } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Community Guidelines",
  description: "How to take part in ProofStack respectfully and safely.",
};

export default function CommunityGuidelinesPage() {
  return (
    <LegalPage
      eyebrow="Community"
      title="Community Guidelines"
      intro={
        <p>
          ProofStack is a place to show real work and find real opportunities.
          These guidelines summarise what that means in practice. They sit
          alongside our <Link href="/terms">Terms of Service</Link>, which list
          in full what is not allowed.
        </p>
      }
    >
      <h2>Be genuine</h2>
      <ul>
        <li>
          Use your real identity and show only work you did or helped with.
        </li>
        <li>Credit collaborators, and mark AI-assisted work as AI-assisted.</li>
        <li>
          Do not share skill-check questions or answers, or let someone else
          take a check for you.
        </li>
      </ul>

      <h2>Be respectful</h2>
      <ul>
        <li>
          No harassment, threats, hate speech, or insults based on gender,
          religion, caste, race, ethnicity, disability or sexual orientation.
        </li>
        <li>No sexual content, and nothing harmful to children.</li>
        <li>
          Do not post other people&apos;s personal details, private messages or
          photos without their permission.
        </li>
      </ul>

      <h2>Keep it safe and legal</h2>
      <ul>
        <li>
          No spam, scams, fake jobs or requests for money from candidates.
        </li>
        <li>No malware, phishing links or attempts to break security.</li>
        <li>Only share code and content you have the right to share.</li>
        <li>No content that breaks Indian law.</li>
      </ul>

      <h2>Reporting a problem</h2>
      <p>
        Email our Grievance Officer at {OPERATOR.grievanceEmail} with a link to
        the content and what is wrong. We acknowledge reports within 24 hours.
        Read more on the <Link href="/contact">Contact and grievances</Link>{" "}
        page.
      </p>

      <h2>What happens when guidelines are broken</h2>
      <p>
        We may remove content, limit features, or suspend or close accounts,
        depending on how serious the problem is and whether it is repeated.
      </p>
    </LegalPage>
  );
}
