import { ContactsCard } from '@/components/waymarks/ContactsCard';
import { VendorsCard } from '@/components/waymarks/VendorsCard';

/**
 * /admin/directory — the "Contacts & Vendors" admin section (M34, Phase 0).
 * Two org-scoped directories the rest of the app reads from (items 1, 2, 3).
 */
export function AdminDirectoryPane() {
  return (
    <div className="space-y-5">
      <ContactsCard />
      <VendorsCard />
    </div>
  );
}
