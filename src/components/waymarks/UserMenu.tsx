import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronDown, Lightbulb, LogOut, Settings as SettingsIcon, ShieldCheck } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { useAuth } from '@/lib/auth-context';
import { usePermissions } from '@/lib/permissions-context';
import { SuggestFeatureDialog } from '@/components/waymarks/SuggestFeatureDialog';

/**
 * UserMenu (M10e+). Trimmed down compared to earlier builds:
 *
 *  - Account settings is now a real link to /settings (was a "(soon)"
 *    placeholder before).
 *  - The dark/light theme toggle was removed — dark mode is intentionally
 *    disabled (M10d) so the toggle was a no-op confusing users. The
 *    Settings page explains the situation.
 */
export function UserMenu() {
  const { user, profile, signOut } = useAuth();
  const { grants } = usePermissions();
  const navigate = useNavigate();
  const [suggestOpen, setSuggestOpen] = useState(false);

  if (!user) return null;

  // M15 - Admin-gated menu item. Super admin or building_admin sees the
  // Admin entry; everyone else just sees Account settings + Sign out.
  const now = Date.now();
  const isAdmin = grants.some(
    (g) =>
      (g.role === 'super_admin' || g.role === 'building_admin') &&
      (!g.expires_at || new Date(g.expires_at).getTime() > now)
  );
  const name = profile?.display_name ?? user.email ?? 'You';

  return (
    <>
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-1.5 py-1 text-sm text-white/90 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-waymarks-gold focus-visible:ring-offset-2 focus-visible:ring-offset-waymarks-ink"
          aria-label={`Account menu for ${name}`}
        >
          <Avatar name={name} src={profile?.avatar_url ?? undefined} size="sm" />
          <span className="hidden max-w-[140px] truncate sm:inline">{name}</span>
          <ChevronDown size={14} aria-hidden className="opacity-70" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-[220px] rounded-lg border border-black/10 bg-surface p-1 text-sm text-text shadow-sheet"
        >
          <div className="flex items-center gap-2 px-2 py-2">
            <Avatar name={name} src={profile?.avatar_url ?? undefined} size="md" />
            <div className="min-w-0">
              <div className="truncate font-medium">{name}</div>
              <div className="truncate text-xs text-text-muted">{user.email}</div>
            </div>
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-black/10" />
          {isAdmin && (
            <DropdownMenu.Item
              onSelect={(e) => {
                e.preventDefault();
                navigate('/admin');
              }}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 outline-none data-[highlighted]:bg-black/5"
            >
              <ShieldCheck size={14} aria-hidden className="text-waymarks-gold" />
              <span>Admin</span>
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Item
            onSelect={(e) => {
              e.preventDefault();
              navigate('/settings');
            }}
            className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 outline-none data-[highlighted]:bg-black/5"
          >
            <SettingsIcon size={14} aria-hidden />
            <span>Account settings</span>
          </DropdownMenu.Item>
          <DropdownMenu.Item
            onSelect={(e) => {
              e.preventDefault();
              setSuggestOpen(true);
            }}
            className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 outline-none data-[highlighted]:bg-black/5"
          >
            <Lightbulb size={14} aria-hidden />
            <span>Suggest a feature</span>
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-black/10" />
          <DropdownMenu.Item
            onSelect={(e) => {
              e.preventDefault();
              void signOut();
            }}
            className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-danger outline-none data-[highlighted]:bg-danger/5"
          >
            <LogOut size={14} aria-hidden />
            <span>Sign out</span>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
    <SuggestFeatureDialog open={suggestOpen} onOpenChange={setSuggestOpen} />
    </>
  );
}
