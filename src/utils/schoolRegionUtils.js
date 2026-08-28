import { supabase } from '../supabaseClient';
import { normalizeSchoolName } from './schoolUtils';

const SCHOOL_REGION_CACHE_MS = 60 * 1000;
let cachedSchoolRegions = null;
let schoolRegionCacheExpiresAt = 0;
let schoolRegionRequest = null;

const loadSchoolRegionMap = async () => {
    const now = Date.now();
    if (cachedSchoolRegions && now < schoolRegionCacheExpiresAt) {
        return cachedSchoolRegions;
    }
    if (schoolRegionRequest) return schoolRegionRequest;

    schoolRegionRequest = supabase
        .from('schools')
        .select('name, region')
        .then(({ data, error }) => {
            if (error) throw error;
            const regionMap = new Map();
            (data || []).forEach((school) => {
                const normalizedName = normalizeSchoolName(school.name);
                if (normalizedName && school.region) {
                    regionMap.set(normalizedName, school.region.trim());
                }
            });
            cachedSchoolRegions = regionMap;
            schoolRegionCacheExpiresAt = Date.now() + SCHOOL_REGION_CACHE_MS;
            return regionMap;
        })
        .finally(() => {
            schoolRegionRequest = null;
        });

    return schoolRegionRequest;
};
export const resolveSchoolRegion = async (schoolName) => {
    if (!schoolName) return null;

    const regionMap = await loadSchoolRegionMap();
    const normalizedName = normalizeSchoolName(schoolName);
    const registeredRegion = regionMap.get(normalizedName);
    if (registeredRegion) return registeredRegion;

    // Only use a name fallback when the region itself is explicitly written.
    if (schoolName.includes('강서')) return '강서';
    if (schoolName.includes('강동')) return '강동';
    return null;
};
