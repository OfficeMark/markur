import { supabase } from '@/lib/supabase';
import type { Profile } from '@/types/database';

/**
 * Profile mutations (M10e+ Settings page).
 *
 * Profiles are 1:1 with auth.users. Only the signed-in user can update
 * their own profile (RLS in 0001_init.sql). The fields a user is
 * allowed to change today are display_name and avatar_url; email is
 * managed by Supabase Auth and isn't editable here.
 */

export type UpdateMyProfilePatch = Partial<
  Pick<Profile, 'display_name' | 'avatar_url' | 'show_action_hints'>
>;

export async function updateMyProfile(
  userId: string,
  patch: UpdateMyProfilePatch
): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .select('*')
    .single();
  if (error) throw error;
  return data as Profile;
}
