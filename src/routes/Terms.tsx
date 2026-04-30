import { LegalLayout } from './LegalLayout';

/**
 * Terms of Service (M10e). SaaS basics + tenant-data handling. Like the
 * Privacy page, this is a starting-point template — a Canadian SaaS
 * lawyer should review before the first paid contract.
 */
export function Terms() {
  return (
    <LegalLayout title="Terms of Service" effective="April 30, 2026">
      <p>
        These terms govern your use of Markur (the "Service"), operated by
        Officemark. By signing in or by using a Markur invitation link, you
        agree to these terms. If you don't agree, don't use the Service.
      </p>

      <h2>Who can use Markur</h2>
      <p>
        You must be at least 18 years old, you must have legal authority to
        accept these terms (either for yourself or for the organization you
        represent), and you must comply with applicable Canadian and
        provincial law.
      </p>

      <h2>Accounts and access</h2>
      <ul>
        <li>
          You're responsible for keeping your sign-in credentials safe.
          Notify us immediately at{' '}
          <a href="mailto:support@officemark.ca">support@officemark.ca</a> if
          you suspect unauthorized access.
        </li>
        <li>
          A building admin can grant or revoke access to other people on
          their buildings. Grants control which floors a person can see and
          what they can do.
        </li>
        <li>
          We may suspend or close accounts that abuse the Service, breach
          these terms, or fail to pay (when paid plans are introduced).
        </li>
      </ul>

      <h2>Your data</h2>
      <p>
        You keep ownership of the floor plans, photos, asset records, and
        audit notes you put into Markur ("Customer Data"). By using the
        Service you give Officemark a non-exclusive licence to host,
        process, and display the Customer Data solely so we can run Markur
        for you. We won't share Customer Data with third parties except as
        described in our{' '}
        <a href="/legal/privacy">Privacy Policy</a>.
      </p>
      <p>
        Floor plans and tenant identifiers are confidential. Don't upload
        third-party data unless you have the right to do so.
      </p>

      <h2>Acceptable use</h2>
      <ul>
        <li>Don't upload malware or content you don't have rights to.</li>
        <li>
          Don't try to break the Service, scrape it, reverse-engineer it, or
          probe its security without prior written permission.
        </li>
        <li>
          Don't use Markur to impersonate someone else or to mislead
          building tenants.
        </li>
        <li>
          Don't use Markur for anything illegal under Canadian or
          provincial law.
        </li>
      </ul>

      <h2>Service availability</h2>
      <p>
        Markur is in active development. We aim for high availability, but
        we don't currently offer an uptime SLA. Scheduled maintenance and
        unexpected outages may interrupt service. The Service is provided
        "as is" without warranties of any kind, express or implied, except
        as required by applicable consumer-protection law.
      </p>

      <h2>Pricing and payments</h2>
      <p>
        While Markur is in preview, the Service is offered at no charge.
        When paid plans launch, we will publish pricing and give existing
        users at least 30 days' notice before any charge. Continuing to use
        the Service after that notice means you accept the new pricing.
      </p>

      <h2>Cancellation and termination</h2>
      <ul>
        <li>You can stop using Markur at any time.</li>
        <li>
          You can request account deletion by emailing{' '}
          <a href="mailto:support@officemark.ca">support@officemark.ca</a>.
          See our <a href="/legal/privacy">Privacy Policy</a> for the
          specifics on what we delete.
        </li>
        <li>
          We can terminate or suspend access for breach of these terms,
          fraud, or non-payment. We'll give reasonable notice unless the
          breach is severe.
        </li>
      </ul>

      <h2>Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, Officemark's total
        liability for any claim arising out of or relating to the Service
        is limited to the amount you paid Officemark for Markur in the
        twelve months preceding the claim, or one hundred Canadian dollars
        (CAD $100) if you haven't paid anything. We are not liable for
        indirect, incidental, special, consequential, or punitive damages,
        including lost profits or lost data, even if we were advised of the
        possibility.
      </p>

      <h2>Indemnity</h2>
      <p>
        You agree to indemnify Officemark from third-party claims arising
        out of (a) your Customer Data, (b) your breach of these terms, or
        (c) your misuse of the Service.
      </p>

      <h2>Governing law</h2>
      <p>
        These terms are governed by the laws of the Province of Ontario,
        Canada, without regard to conflict-of-laws principles. The courts
        of Ontario have exclusive jurisdiction over any dispute, except
        that we may seek injunctive relief in any competent court.
      </p>

      <h2>Changes</h2>
      <p>
        We may update these terms. Material changes will be posted here
        with a new "Effective" date. Continuing to use the Service after a
        change means you accept the new terms. If you don't, stop using the
        Service.
      </p>

      <h2>Questions</h2>
      <p>
        Email <a href="mailto:support@officemark.ca">support@officemark.ca</a>.
      </p>
    </LegalLayout>
  );
}
