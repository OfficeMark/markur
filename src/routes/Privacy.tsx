import { LegalLayout } from './LegalLayout';

/**
 * Privacy policy (M10e). Plain language, structured to satisfy PIPEDA
 * (federal Canada) and Quebec's Law 25 disclosure requirements: who we
 * are, what we collect, why, how long we keep it, who we share with,
 * and how to reach us.
 *
 * This is a starting-point template, not legal advice — Randy should
 * have a Canadian privacy lawyer review before onboarding the first
 * paying customer.
 */
export function Privacy() {
  return (
    <LegalLayout title="Privacy Policy" effective="April 30, 2026">
      <p>
        Markur (the "Service") is operated by Officemark, a Canadian sole
        proprietorship. This policy explains what personal information we
        collect when you use Markur, why, and what choices you have.
      </p>

      <h2>Who we are</h2>
      <p>
        Officemark is the controller of the personal information collected
        through Markur. You can reach us at{' '}
        <a href="mailto:support@officemark.ca">support@officemark.ca</a>.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Account information.</strong> Your email address, your role
          in a building (admin, auditor, tenant rep), and the buildings or
          floors you've been granted access to.
        </li>
        <li>
          <strong>Content you create.</strong> Building names, floor names,
          asset pins, photos you upload, audit notes, and the floor-plan
          files you import.
        </li>
        <li>
          <strong>Activity logs.</strong> A timestamped record of who created,
          edited, moved, or deleted assets, and who flagged or audited them,
          so a building admin can see the history of changes on their
          properties.
        </li>
        <li>
          <strong>Technical information.</strong> Standard server logs (IP
          address, browser type, request paths) kept by our hosting
          providers (Netlify and Supabase) to keep the Service running and
          to detect abuse.
        </li>
      </ul>
      <p>We do not knowingly collect information from anyone under 16.</p>

      <h2>Why we collect it</h2>
      <ul>
        <li>
          To run the Service: signing you in, showing you the buildings you
          have access to, and saving your edits.
        </li>
        <li>To produce audit reports for the building admin.</li>
        <li>To investigate bugs and abuse.</li>
        <li>To send you essential service emails (e.g. invitation links).</li>
      </ul>
      <p>
        We do not use your data to train AI models, we do not sell your data,
        and we do not send marketing emails through Markur.
      </p>

      <h2>Where it lives</h2>
      <p>
        Markur is hosted on Netlify (frontend) and Supabase (database,
        authentication, file storage). Both are operated by US-based
        companies and may store data on servers in Canada or the United
        States. By using Markur you consent to your information being
        processed in those locations.
      </p>

      <h2>How long we keep it</h2>
      <p>
        We retain account and content data for as long as your account is
        active. If you delete your account, we delete your personal account
        record and disassociate your audit-log entries within 30 days, except
        where we are required by law to keep them longer or where they
        relate to a building you no longer own (in which case the building
        admin retains the audit history).
      </p>

      <h2>Who we share with</h2>
      <ul>
        <li>
          <strong>Other people on your buildings.</strong> Building admins
          see who edited what. Tenant reps and auditors only see floors
          they've been granted access to.
        </li>
        <li>
          <strong>Service providers.</strong> Netlify (hosting), Supabase
          (database, auth, file storage). They process data on our behalf
          under their own published privacy policies.
        </li>
        <li>
          <strong>If required by law.</strong> We will respond to a valid
          Canadian court order or law enforcement request.
        </li>
      </ul>
      <p>We do not sell or rent your personal information.</p>

      <h2>Your choices</h2>
      <ul>
        <li>
          <strong>Access and correction.</strong> You can view and edit most
          of your information directly in the app. For anything you can't
          reach, email us.
        </li>
        <li>
          <strong>Deletion.</strong> You can delete content you created
          (assets, photos) from inside the app. To delete your whole account,
          email us.
        </li>
        <li>
          <strong>Withdraw consent.</strong> You can stop using Markur at any
          time. We'll process a deletion request within 30 days.
        </li>
      </ul>

      <h2>Cookies and similar technologies</h2>
      <p>
        Markur uses cookies (or equivalent local-storage entries) only to
        keep you signed in and to remember your in-app preferences such as
        your cookie-consent choice. We do not use third-party advertising
        cookies. The cookie banner you see on your first visit lets you
        accept all essential cookies; there are no optional categories yet.
      </p>

      <h2>Quebec residents (Law 25)</h2>
      <p>
        Officemark's privacy contact for Quebec residents is the same as
        above: <a href="mailto:support@officemark.ca">support@officemark.ca</a>.
        You have the right to know whether we hold information about you, to
        access and correct it, to ask us to stop using or sharing it, and to
        receive it in a portable format. We will respond to written requests
        within 30 days.
      </p>

      <h2>Changes</h2>
      <p>
        If we make a material change to this policy we will post the new
        version here and update the "Effective" date at the top. If the
        change affects how we use your existing data, we'll email account
        admins before the change takes effect.
      </p>

      <h2>Questions</h2>
      <p>
        Email <a href="mailto:support@officemark.ca">support@officemark.ca</a>{' '}
        with anything privacy-related. If you're unsatisfied with how we've
        handled a complaint, you can also escalate to the{' '}
        <a
          href="https://www.priv.gc.ca/en/"
          target="_blank"
          rel="noreferrer"
        >
          Office of the Privacy Commissioner of Canada
        </a>{' '}
        or, in Quebec, the{' '}
        <a
          href="https://www.cai.gouv.qc.ca/"
          target="_blank"
          rel="noreferrer"
        >
          Commission d'accès à l'information
        </a>
        .
      </p>
    </LegalLayout>
  );
}
