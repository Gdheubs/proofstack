import type { Metadata } from "next";
import { LegalPage } from "@/features/legal/legal-page";
import { OPERATOR } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Contact and grievances",
  description: "Contact ProofStack and its Grievance Officer.",
};

export default function ContactPage() {
  return (
    <LegalPage
      eyebrow="Help"
      title="Contact and grievances"
      dated={false}
      intro={
        <p>How to reach ProofStack, report content or make a complaint.</p>
      }
    >
      <h2>General enquiries</h2>
      <p>
        Email {OPERATOR.contactEmail}.
        <br />
        {OPERATOR.legalName}
        <br />
        {OPERATOR.address}
      </p>

      <h2>Grievance Officer</h2>
      <p>
        Under the Information Technology (Intermediary Guidelines and Digital
        Media Ethics Code) Rules, 2021 and the Digital Personal Data Protection
        Act, 2023, complaints about content, accounts or your personal data go
        to our Grievance Officer:
      </p>
      <p>
        <strong>{OPERATOR.grievanceOfficer}</strong>
        <br />
        Email: {OPERATOR.grievanceEmail}
        <br />
        Address: {OPERATOR.address}
      </p>

      <h3>What to include</h3>
      <ul>
        <li>Your name and how to contact you.</li>
        <li>A link to the content or account concerned.</li>
        <li>What the problem is and, if relevant, which rule it breaks.</li>
        <li>
          For copyright or trademark complaints, proof that you own the right.
        </li>
      </ul>

      <h3>What happens next</h3>
      <ul>
        <li>We acknowledge your complaint within 24 hours.</li>
        <li>We resolve it within 15 days.</li>
        <li>
          Requests to remove content that breaks our rules are resolved within
          72 hours.
        </li>
        <li>
          Intimate images shared without consent are removed within 24 hours.
        </li>
      </ul>

      <h3>If you are not satisfied</h3>
      <ul>
        <li>
          You can appeal our decision to the Grievance Appellate Committee set
          up by the Government of India within 30 days, at gac.gov.in.
        </li>
        <li>
          For complaints about your personal data, you can approach the Data
          Protection Board of India after contacting us.
        </li>
      </ul>

      <h2>Your data</h2>
      <p>
        You can download a copy of your data or delete your account at any time
        from your account page.
      </p>
    </LegalPage>
  );
}
