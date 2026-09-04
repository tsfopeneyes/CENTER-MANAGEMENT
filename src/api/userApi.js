import { supabase } from '../supabaseClient';
import { normalizeSchoolName } from '../utils/userUtils';

export const userApi = {
    async fetchLogs(userId) {
        const { data, error } = await supabase
            .from('logs')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: true });
        if (error) throw error;
        return data;
    },
    async fetchUser(userId) {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();
        if (error) throw error;
        return data;
    },

    async fetchUserPreferences(userId) {
        if (!userId) return {};
        const { data, error } = await supabase
            .from('users')
            .select('preferences')
            .eq('id', userId)
            .single();

        // Return empty object if no preferences yet, or log error
        if (error && error.code !== 'PGRST116') throw error; // ignore no rows error
        return data?.preferences || {};
    },

    async updateUserPreferences(userId, newPreferences) {
        if (!userId) return;

        // 1. Fetch current first to merge (if needed)
        const currentPrefs = await this.fetchUserPreferences(userId);
        const updatedPrefs = { ...currentPrefs, ...newPreferences };

        const { data, error } = await supabase
            .from('users')
            .update({ preferences: updatedPrefs })
            .eq('id', userId)
            .select('preferences')
            .single();

        if (error) throw error;
        return data?.preferences || updatedPrefs;
    },

    async updateProfile(userId, updates) {
        if (updates && updates.school) {
            updates.school = normalizeSchoolName(updates.school);
        }
        const { error } = await supabase
            .from('users')
            .update(updates)
            .eq('id', userId);
        if (error) throw error;
    },

    async fetchStaff() {
        const { data, error } = await supabase
            .from('users')
            .select('id, name, user_group')
            .eq('user_group', 'STAFF');
        if (error) throw error;
        return data;
    }
};
