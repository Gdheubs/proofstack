import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/features/legal/legal-page";
import { MINIMUM_AGE, OPERATOR } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How ProofStack collects, uses, shares and protects your data.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Privacy Policy"
      intro={
        <p>
          This policy explains what personal data ProofStack collects, why, who
          it is shared with, how long it is kept and the rights you have. It is
          our notice under India&apos;s Digital Personal Data Protection Act,
          2023 (DPDP Act) and the Information Technology (Reasonable Security
          Practices and Procedures and Sensitive Personal Data or Information)
          Rules, 2011. We do not sell your data, show advertising or use
          tracking or analytics tools.
        </p>
      }
    >
      <h2 id="who">1. Who is responsible for your data</h2>
      <p>
        ProofStack is operated by {OPERATOR.legalName}, {OPERATOR.address}{" "}
        (&quot;we&quot;, &quot;us&quot;). We are the Data Fiduciary for the
        personal data described here. Questions about this policy or your data
        go to our Grievance Officer, {OPERATOR.grievanceOfficer}, at{" "}
        {OPERATOR.grievanceEmail}. See also{" "}
        <Link href="/contact">Contact and grievances</Link>.
      </p>

      <h2 id="collect">2. What we collect</h2>
      <ul>
        <li>
          <strong>Account details:</strong> email address, phone number (if you
          add one), whether each is verified, your date of birth, and your
          account role and status. Your password is handled by our sign-in
          provider and is never stored by ProofStack.
        </li>
        <li>
          <strong>Sign-in through another service</strong> (such as Google or
          GitHub): the email address and name that service shares with us.
        </li>
        <li>
          <strong>Profile:</strong> display name, handle, profile type
          (developer, company or recruiter), photo, bio, location and skills.
        </li>
        <li>
          <strong>Content you create:</strong> posts, comments, reactions,
          projects, portfolio entries, uploaded images, organizations and teams,
          follows and bookmarks.
        </li>
        <li>
          <strong>Careers:</strong> your career profile (headline, roles,
          availability, whether recruiters can discover you), job applications
          and notes, messages with employers, and jobs you post.
        </li>
        <li>
          <strong>Skill checks:</strong> the questions you were given, your
          answers and your results.
        </li>
        <li>
          <strong>Security records:</strong> sign-in sessions with a simple
          device label (for example &quot;Chrome on Windows&quot;), and logs of
          security events such as sign-ins, MFA changes and account changes. For
          rate limiting and lockouts we keep only a one-way hash of your network
          address, never the address itself.
        </li>
        <li>
          <strong>Your consent:</strong> which version of these terms you
          accepted and when.
        </li>
      </ul>
      <p>
        We do not collect financial information, government ID numbers,
        biometric data or health data. Please do not put such information in
        your profile or content.
      </p>

      <h2 id="use">3. Why we use it</h2>
      <ul>
        <li>
          To run your account and the features you choose: your profile,
          community, projects, careers and skill checks. We rely on the consent
          you give when you create your account.
        </li>
        <li>
          To keep ProofStack secure: verifying sign-ins, multi-factor
          authentication, preventing abuse, fraud and spam, and investigating
          incidents.
        </li>
        <li>
          To send messages you need: verification codes, sign-in alerts and
          notifications about activity on your account. We do not send marketing
          messages.
        </li>
        <li>To check that you meet the minimum age of {MINIMUM_AGE}.</li>
        <li>
          To meet legal duties, such as answering lawful requests from
          authorities and keeping records the law requires.
        </li>
      </ul>
      <p>
        Skill checks use your earlier results to choose the topics of your next
        question set. This happens only inside the skill-check feature and is
        not used for advertising or shared with anyone.
      </p>

      <h2 id="ai">4. AI-assisted features</h2>
      <p>
        Two optional features use an AI model provider. The writing assistant
        sends the text you submit, and nothing else, when you ask it to. The
        career plan sends only your self-reported skills and the skill topics of
        jobs, and only after you tick the consent box. We do not send your name,
        email or contact details with these requests.
      </p>

      <h2 id="visible">5. What other people can see</h2>
      <ul>
        <li>
          Your public profile, public posts, comments and public projects can be
          seen by anyone, including people who are not signed in.
        </li>
        <li>
          Organization-only and private content is visible only to the people it
          is shared with.
        </li>
        <li>
          If you make your career profile discoverable, recruiters on ProofStack
          can find it. Employers see the applications and messages you send
          them.
        </li>
        <li>
          Your email, phone number and date of birth are never shown to other
          users. Platform moderators see a masked email address only.
        </li>
      </ul>

      <h2 id="processors">6. Who processes data for us</h2>
      <p>
        We use these service providers to run ProofStack. Each processes data
        only to provide its service to us.
      </p>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Provider</th>
              <th>Purpose</th>
              <th>Location</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Supabase</td>
              <td>Sign-in, passwords, verification codes, MFA</td>
              <td>Japan</td>
            </tr>
            <tr>
              <td>Neon</td>
              <td>Main database</td>
              <td>Singapore</td>
            </tr>
            <tr>
              <td>Render</td>
              <td>Application servers</td>
              <td>United States</td>
            </tr>
            <tr>
              <td>Cloudflare</td>
              <td>Website delivery, security, image storage and backups</td>
              <td>Global network</td>
            </tr>
            <tr>
              <td>Email provider (Resend)</td>
              <td>Sending account emails</td>
              <td>United States</td>
            </tr>
            <tr>
              <td>MSG91</td>
              <td>Sending SMS codes, when phone sign-in is enabled</td>
              <td>India</td>
            </tr>
            <tr>
              <td>AI model provider</td>
              <td>The optional AI features in section 4</td>
              <td>United States</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        We may also disclose data when Indian law requires it, for example on a
        lawful order from a court or government agency, or to protect people
        from harm.
      </p>

      <h2 id="transfers">7. Data stored outside India</h2>
      <p>
        Our providers store data in the countries listed above. The DPDP Act
        allows this, except to countries the Government of India restricts; we
        will move data if a country we use is restricted. For users in the
        European Union or United Kingdom, transfers rely on the providers&apos;
        standard contractual clauses.
      </p>

      <h2 id="retention">8. How long we keep data</h2>
      <ul>
        <li>
          While your account is open, we keep your data so the service works.
        </li>
        <li>
          When you delete your account, your profile, content, applications,
          messages, skill-check results and images are deleted immediately. Your
          email, phone number and registration date are kept for 180 days, as
          rule 3(1)(h) of the IT (Intermediary Guidelines) Rules, 2021 requires,
          and then erased.
        </li>
        <li>Ended sign-in sessions are deleted after 180 days.</li>
        <li>Security logs and notifications are deleted after one year.</li>
        <li>
          Encrypted database backups are deleted after 30 days, so deleted data
          can remain in a backup for up to 30 days.
        </li>
      </ul>

      <h2 id="rights">9. Your rights</h2>
      <p>Under the DPDP Act you can:</p>
      <ul>
        <li>
          <strong>Get a copy</strong> of your personal data: use{" "}
          <em>Download my data</em> on your <Link href="/account">account</Link>{" "}
          page.
        </li>
        <li>
          <strong>Correct or update</strong> it: edit your profile and account
          details at any time.
        </li>
        <li>
          <strong>Erase</strong> it and <strong>withdraw consent</strong>: use{" "}
          <em>Delete my account</em> on your account page. Withdrawing consent
          does not affect what was done before.
        </li>
        <li>
          <strong>Nominate</strong> someone to act for you if you die or cannot
          act: email the Grievance Officer.
        </li>
        <li>
          <strong>Complain:</strong> contact our Grievance Officer first. If you
          are not satisfied, you can complain to the Data Protection Board of
          India.
        </li>
      </ul>
      <p>
        If you are in the European Union or United Kingdom, you also have rights
        under the GDPR, including to object to processing and to complain to
        your local data protection authority. Contact us to use them.
      </p>

      <h2 id="age">10. Age requirement</h2>
      <p>
        ProofStack is for people aged {MINIMUM_AGE} or over. We ask for your
        date of birth when you sign up. If you are under {MINIMUM_AGE}, we do
        not create an account and we delete what you entered. If we learn that
        an account belongs to someone under {MINIMUM_AGE}, we delete it.
      </p>

      <h2 id="security">11. How we protect data</h2>
      <p>
        All connections use HTTPS. Sign-in credentials are encrypted, network
        addresses are hashed, access inside ProofStack is checked on every
        request, and you can turn on authenticator-app MFA. If a personal data
        breach happens, we will tell affected users and the Data Protection
        Board of India as the DPDP Act requires, and report it to CERT-In within
        6 hours.
      </p>

      <h2 id="cookies">12. Cookies and browser storage</h2>
      <p>
        We use only cookies that are strictly necessary for ProofStack to work,
        so we do not ask for cookie consent. We use no advertising, analytics or
        tracking cookies.
      </p>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Purpose</th>
              <th>Lasts</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>__Host-ps-session</td>
              <td>Keeps you signed in</td>
              <td>Up to 7 days</td>
            </tr>
            <tr>
              <td>__Host-ps-csrf</td>
              <td>Protects forms against cross-site attacks</td>
              <td>1 day</td>
            </tr>
            <tr>
              <td>__Host-ps-flow</td>
              <td>Completes a sign-in or verification step</td>
              <td>20 minutes</td>
            </tr>
            <tr>
              <td>__Host-ps-device</td>
              <td>Recognises your device for new-sign-in alerts</td>
              <td>1 year</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Your browser also stores your light or dark theme choice and, during
        sign-in, the page to return to. These never leave your device.
      </p>

      <h2 id="changes">13. Changes to this policy</h2>
      <p>
        If we change this policy materially, we will show the new version and
        ask you to accept it before you continue using ProofStack. The date at
        the top shows the current version.
      </p>

      <h2 id="contact">14. Contact</h2>
      <p>
        Grievance Officer: {OPERATOR.grievanceOfficer},{" "}
        {OPERATOR.grievanceEmail}, {OPERATOR.address}. General enquiries:{" "}
        {OPERATOR.contactEmail}.
      </p>
    </LegalPage>
  );
}
