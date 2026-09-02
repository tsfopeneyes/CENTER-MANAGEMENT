import { useEffect, useState, useCallback, useId } from 'react';
import { supabase } from '../supabaseClient';
import seed from '../data/haifnDutyRoster.json';
import { shiftCalendarMonth } from '../utils/calendarUtils';

const ROSTER_CHANGED = 'center-duty-roster-changed';
export const notifyDutyRosterChanged = () => window.dispatchEvent(new Event(ROSTER_CHANGED));

export const getSeedDutyRoster = () => ({
    ...Object.fromEntries(Object.entries(seed).map(([date, name]) => [date, { duty_date: date, staff_name: name, duty_status: 'ASSIGNED' }])),
    '2026-09-24': { duty_date: '2026-09-24', duty_status: 'OFF', label: '추석연휴' },
    '2026-09-25': { duty_date: '2026-09-25', duty_status: 'OFF', label: '추석연휴' },
});

export function useDutyRoster(month, enabled = true) {
    const instanceId = useId();
    const [state, setState] = useState({ month: '', roster: {}, loading: enabled, error: '', needsMigration: false });
    const [revision, setRevision] = useState(0);
    const refresh = useCallback(() => setRevision(value => value + 1), []);
    useEffect(() => {
        if (!enabled) return;
        let active = true;
        setState(previous => ({ ...previous, month, roster: previous.month === month ? previous.roster : {}, loading: true, error: '', needsMigration: false }));
        supabase.from('center_duty_assignments').select('duty_date,staff_name,staff_id,duty_status,label')
            .eq('center_code', 'HAIFN').gte('duty_date', `${month}-01`).lt('duty_date', `${shiftCalendarMonth(month, 1)}-01`)
            .then(async ({ data, error }) => {
                if (!active) return;
                const missingTable = error && ['PGRST205', '42P01'].includes(error.code);
                let assignments = data || [];
                const staffIds = [...new Set(assignments.map(row => row.staff_id).filter(Boolean))];
                if (!error && staffIds.length) {
                    // Profile lookup must not prevent the duty name from being shown.
                    // Read only the fields needed for the avatar, never full profiles.
                    try {
                        const { data: staff, error: profileError } = await supabase.from('users')
                            .select('id,name,profile_image_url').in('id', staffIds);
                        if (!profileError) {
                            const byId = new Map((staff || []).map(profile => [profile.id, profile]));
                            assignments = assignments.map(row => ({ ...row, staff: byId.get(row.staff_id) || null }));
                        }
                    } catch { /* Keep the roster and use the standard avatar fallback. */ }
                }
                if (!active) return;
                const roster = missingTable ? getSeedDutyRoster() : Object.fromEntries(assignments.map(row => [row.duty_date, row]));
                setState({ month, roster, loading: false, needsMigration: Boolean(missingTable), error: error && !missingTable ? '당직 정보를 불러오지 못했습니다.' : '' });
            }).catch(() => { if (active) setState({ month, roster: {}, loading: false, error: '당직 정보를 불러오지 못했습니다.', needsMigration: false }); });
        return () => { active = false; };
    }, [month, enabled, revision]);
    useEffect(() => {
        if (!enabled) return;
        window.addEventListener('focus', refresh);
        window.addEventListener(ROSTER_CHANGED, refresh);
        // Realtime may not be enabled for this table on older installations.
        // Poll visible screens as a fallback without changing the DB publication.
        const timer = window.setInterval(() => {
            if (document.visibilityState === 'visible') refresh();
        }, 30000);
        const channel = supabase.channel(`duty-roster-${instanceId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'center_duty_assignments', filter: 'center_code=eq.HAIFN' }, refresh)
            .subscribe();
        return () => {
            window.removeEventListener('focus', refresh);
            window.removeEventListener(ROSTER_CHANGED, refresh);
            window.clearInterval(timer);
            supabase.removeChannel(channel);
        };
    }, [enabled, refresh, instanceId]);
    return { ...(state.month === month ? state : { roster: {}, loading: enabled, error: '', needsMigration: false }), refresh };
}
