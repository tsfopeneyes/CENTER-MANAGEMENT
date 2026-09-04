import { supabase } from '../supabaseClient';

export const SCREEN_CONFIG_TITLE = 'SCREEN_DISPLAY_CONFIG';
export const DEFAULT_SCREEN_CONFIG = Object.freeze({ images: [], intervalSeconds: 10, version: 1 });

export function normalizeScreenConfig(value) {
    const images = Array.isArray(value?.images)
        ? value.images.filter(item => item && typeof item.id === 'string' && typeof item.url === 'string' && item.url.startsWith('https://'))
            .slice(0, 30).map(item => ({ id: item.id, url: item.url, name: String(item.name || '이미지').slice(0, 120) }))
        : [];
    const intervalSeconds = [5, 10, 15, 30, 60].includes(Number(value?.intervalSeconds))
        ? Number(value.intervalSeconds) : 10;
    return { images, intervalSeconds, version: 1 };
}

export async function loadScreenConfig() {
    const { data, error } = await supabase.from('notices').select('content')
        .eq('category', 'SYSTEM').eq('title', SCREEN_CONFIG_TITLE).maybeSingle();
    if (error) throw error;
    if (!data?.content) return DEFAULT_SCREEN_CONFIG;
    try { return normalizeScreenConfig(JSON.parse(data.content)); }
    catch { return DEFAULT_SCREEN_CONFIG; }
}

export async function saveScreenConfig(config) {
    const normalized = normalizeScreenConfig(config);
    const { data: existing, error: readError } = await supabase.from('notices').select('id')
        .eq('category', 'SYSTEM').eq('title', SCREEN_CONFIG_TITLE).maybeSingle();
    if (readError) throw readError;
    const payload = { content: JSON.stringify(normalized) };
    const request = existing?.id
        ? supabase.from('notices').update(payload).eq('id', existing.id)
        : supabase.from('notices').insert({ ...payload, title: SCREEN_CONFIG_TITLE, category: 'SYSTEM' });
    const { error } = await request;
    if (error) throw error;
    return normalized;
}
