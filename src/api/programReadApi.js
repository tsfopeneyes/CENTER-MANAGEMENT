import { supabase } from '../supabaseClient';
import { fetchAllPages } from '../utils/fetchAllPages';

const missingPreviewView = (error) => ['42P01', 'PGRST205'].includes(error?.code);

// Both paths are direct reads. Never fall back to an elevated RPC or service
// key: the original table enforces body access, the view contains safe fields.
export const fetchProgramPreviews = async () => {
    try {
        return await fetchAllPages(() => supabase.from('program_calendar_previews').select('*').order('id'));
    } catch (error) {
        if (missingPreviewView(error)) return []; // Pre-migration local environments.
        throw error;
    }
};

export const readNoticeWithPreview = async (id, columns = '*') => {
    const { data, error } = await supabase.from('notices').select(columns).eq('id', id).maybeSingle();
    if (error) throw error;
    if (data) return data;
    const preview = await supabase.from('program_calendar_previews').select('*').eq('id', id).maybeSingle();
    if (preview.error && !missingPreviewView(preview.error)) throw preview.error;
    return preview.data || null;
};

export const mergeProgramPreviews = (notices, previews) => {
    const byId = new Map(previews.map(item => [String(item.id), item]));
    // Full authorized rows always win. A preview stays marked until the server
    // actually releases the full row, even if the device clock runs fast.
    notices.forEach(item => byId.set(String(item.id), item));
    return [...byId.values()];
};
