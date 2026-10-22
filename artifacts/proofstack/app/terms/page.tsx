import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/features/legal/legal-page";
import { MINIMUM_AGE, OPERATOR } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The agreement between you and ProofStack.",
};

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Terms of Service"
      intro={
        <p>
          These terms are the agreement between you and {OPERATOR.legalName}{" "}
          (&quot;ProofStack&quot;, &quot;we&quot;) for using ProofStack. By
          creating an account or using ProofStack you accept these terms, our{" "}
          <Link href="/privacy">Privacy Policy</Link> and our{" "}
          <Link href="/community-guidelines">Community Guidelines</Link>. They
          also serve as our rules and user agreement under the Information
          Technology (Intermediary Guidelines and Digital Media Ethics Code)
          Rules, 2021.
        </p>
      }
    >
      <h2>1. Who can use ProofStack</h2>
      <p>
        You must be at least {MINIMUM_AGE} years old and able to enter a binding
        contract under Indian law. You must give your real date of birth and
        accurate account details, and keep them up to date. Recruiters must be
        authorised to act for the organization they represent.
      </p>

      <h2>2. Your account</h2>
      <ul>
        <li>
          Keep your password and verification codes secret, and turn on
          multi-factor authentication if you can. You are responsible for
          activity on your account.
        </li>
        <li>Tell us promptly if you think your account has been misused.</li>
        <li>
          One person may not hold several accounts to get around limits,
          suspensions or skill-check rules.
        </li>
      </ul>

      <h2>3. What ProofStack is, and is not</h2>
      <ul>
        <li>
          ProofStack lets people show projects and skills, collaborate, take
          skill checks and connect with employers.
        </li>
        <li>
          <strong>Skill checks are self-directed knowledge checks.</strong> They
          are not proctored and do not verify identity, qualifications,
          seniority or employment. Results must not be presented as
          certification.
        </li>
        <li>
          <strong>
            We are not an employer, recruitment agency or party to any job.
          </strong>{" "}
          Employers are responsible for their job posts and hiring decisions,
          and candidates for the information they provide. We do not guarantee
          any job, interview or outcome.
        </li>
        <li>
          ProofStack is free to use. If we introduce paid features, we will show
          the price and refund terms before you buy.
        </li>
      </ul>

      <h2>4. Rules for employers and job posts</h2>
      <ul>
        <li>Post only real jobs you are authorised to fill.</li>
        <li>
          Never ask candidates for money, deposits, fees or bank details to
          apply, train or be hired.
        </li>
        <li>
          Follow Indian employment law, including the Child and Adolescent
          Labour (Prohibition and Regulation) Act, 1986, and do not set
          requirements that discriminate on religion, caste, sex, disability or
          other grounds the law protects.
        </li>
        <li>
          Use candidates&apos; data only to consider them for the job they
          applied to.
        </li>
      </ul>
      <p>
        <strong>Candidates:</strong> genuine employers never charge you to
        apply. Report any job post that asks for money.
      </p>

      <h2 id="prohibited">5. What you must not post or do</h2>
      <p>
        You must not host, display, upload, modify, publish, transmit, store,
        update or share any information that:
      </p>
      <ol>
        <li>belongs to another person and to which you have no right;</li>
        <li>
          is obscene, pornographic, paedophilic, invasive of another&apos;s
          privacy (including bodily privacy), insulting or harassing on the
          basis of gender, racially or ethnically objectionable, relating to or
          encouraging money laundering or gambling, or promoting enmity between
          groups on the grounds of religion or caste with intent to incite
          violence;
        </li>
        <li>is harmful to children;</li>
        <li>
          infringes any patent, trademark, copyright or other proprietary right;
        </li>
        <li>
          deceives or misleads about the origin of a message, or knowingly and
          intentionally communicates misinformation or information that is
          patently false and untrue or misleading in nature;
        </li>
        <li>impersonates another person;</li>
        <li>
          threatens the unity, integrity, defence, security or sovereignty of
          India, friendly relations with foreign States or public order, causes
          incitement to any cognisable offence, prevents the investigation of
          any offence, or insults another nation;
        </li>
        <li>
          contains a software virus or any other code, file or program designed
          to interrupt, destroy or limit the functionality of any computer
          resource;
        </li>
        <li>violates any law in force.</li>
      </ol>
      <p>
        You also must not scrape or harvest other users&apos; data, send spam,
        attack or overload our systems, try to get around security or limits, or
        use ProofStack to commit fraud.
      </p>

      <h2>6. Your content</h2>
      <p>
        You keep ownership of what you post. You give us a non-exclusive,
        royalty-free, worldwide licence to host, store, display and share it
        only as needed to run ProofStack and show it to the audience you choose.
        This licence ends when you delete the content or your account, except
        where the law requires us to keep it.
      </p>

      <h2 id="enforcement">7. How we enforce these terms</h2>
      <ul>
        <li>
          We may remove or disable access to content, and suspend or close
          accounts, that break these terms or the law. Where reasonable, we tell
          you why.
        </li>
        <li>
          When we receive an order from a court or an authorised government
          agency, we remove or disable the content concerned within 36 hours, as
          the IT Rules require.
        </li>
        <li>
          Content that shows someone in a sexual act or conduct, or exposes
          their private area, or is an impersonation in such material, is
          removed within 24 hours of a complaint by that person or someone
          acting for them.
        </li>
        <li>
          For repeated or serious violations we may end your access immediately.
          We may keep information about violations as the law requires.
        </li>
      </ul>

      <h2 id="grievances">8. Complaints and grievances</h2>
      <p>
        Report content or raise a complaint with our Grievance Officer,{" "}
        {OPERATOR.grievanceOfficer}, at {OPERATOR.grievanceEmail}. We
        acknowledge complaints within 24 hours and resolve them within 15 days.
        Requests to remove content that breaks section 5 are resolved within 72
        hours. If you are not satisfied with our decision, you may appeal to the
        Grievance Appellate Committee set up by the Government of India within
        30 days. Details are on our{" "}
        <Link href="/contact">Contact and grievances</Link> page.
      </p>

      <h2>9. Intellectual property complaints</h2>
      <p>
        If you believe content on ProofStack infringes your copyright or
        trademark, email the Grievance Officer with the link to the content,
        proof that you own the right, and your contact details. We review and
        remove infringing content.
      </p>

      <h2>10. Ending your account</h2>
      <p>
        You can delete your account at any time from your account page; see the{" "}
        <Link href="/privacy#retention">Privacy Policy</Link> for what happens
        to your data. We may suspend or close accounts as described in section
        7, or if we stop offering ProofStack, in which case we will give
        reasonable notice where we can.
      </p>

      <h2>11. Disclaimers and liability</h2>
      <p>
        ProofStack is provided &quot;as is&quot;. We work to keep it available
        and secure but do not promise it will be uninterrupted or error-free.
        Content posted by users is their responsibility, not ours. To the extent
        the law allows, we are not liable for indirect or consequential loss,
        and our total liability to you is limited to ₹1,000. Nothing in these
        terms limits rights you have under the Consumer Protection Act, 2019 or
        any liability that cannot legally be limited.
      </p>
      <p>
        You agree to compensate us for losses caused by your breach of these
        terms or the law, to the extent the law allows.
      </p>

      <h2>12. Changes to these terms</h2>
      <p>
        We may update these terms. For material changes we will ask you to
        accept the new version before you continue. We will also remind all
        users of these rules at least once a year, as the IT Rules require.
      </p>

      <h2>13. Law and disputes</h2>
      <p>
        These terms are governed by the laws of India. Courts at{" "}
        {OPERATOR.jurisdiction} have jurisdiction, without affecting your right
        to approach a consumer commission where you live.
      </p>

      <h2>14. Contact</h2>
      <p>
        {OPERATOR.legalName}, {OPERATOR.address}. Email: {OPERATOR.contactEmail}
        .
      </p>
    </LegalPage>
  );
}
