import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabaseClient';
import { calculateCurrentLocations } from '../../utils/liveOccupancyUtils';

export const useRealtimePresence = () => {
    const [locationGroups, setLocationGroups] = useState([]);
    const [locations, setLocations] = useState([]);
    const [allUsers, setAllUsers] = useState([]);
    const [activeUserCountByGroup, setActiveUserCountByGroup] = useState({});

    const fetchRealtimeStatusData = useCallback(async () => {
        try {
            const [usersRes, locRes, groupRes, logsRes] = await Promise.all([
                supabase.from('users').select('id, name, user_group, role'),
                supabase.from('locations').select('id, group_id, name, is_active'),
                supabase.from('location_groups').select('id, name'),
                supabase.from('logs').select('id, user_id, location_id, type, created_at').order('created_at', { ascending: false }).limit(3000)
            ]);

            const fetchedUsers = usersRes.data || [];
            const fetchedLocations = (locRes.data || []).filter(l => l.is_active !== false);
            const fetchedGroups = groupRes.data || [];
            const fetchedLogs = logsRes.data || [];

            const activeGroups = fetchedGroups.filter(g =>
                fetchedLocations.some(l => l.group_id === g.id)
            );

            setAllUsers(fetchedUsers);
            setLocations(fetchedLocations);
            setLocationGroups(activeGroups);

            const adminIdsSet = new Set(fetchedUsers.filter(u =>
                u.name === 'admin' || u.user_group === '관리자' || u.role === 'admin'
            ).map(u => u.id));

            const currentLocationDetails = calculateCurrentLocations(fetchedLogs);

            const groupCounts = {};
            fetchedGroups.forEach(g => { groupCounts[g.id] = 0; });
            groupCounts['unassigned'] = 0;

            Object.entries(currentLocationDetails).forEach(([uid, locationDetails]) => {
                const locId = locationDetails?.locId;
                const isGuestKey = uid.startsWith('guest_');
                if (locId && (isGuestKey || !adminIdsSet.has(uid))) {
                    const loc = fetchedLocations.find(l => l.id === locId);
                    if (loc && loc.group_id) {
                        if (groupCounts[loc.group_id] !== undefined) {
                            groupCounts[loc.group_id]++;
                        }
                    } else if (loc) {
                        groupCounts['unassigned']++;
                    }
                }
            });

            setActiveUserCountByGroup(groupCounts);
        } catch (err) {
            console.error('Error fetching realtime status:', err);
        }
    }, []);

    useEffect(() => {
        fetchRealtimeStatusData();

        let debounceTimer;
        const debouncedFetchStatus = () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                fetchRealtimeStatusData();
            }, 1000);
        };

        const subscription = supabase
            .channel('public:logs_student_dashboard')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'logs' }, debouncedFetchStatus)
            .subscribe();

        return () => {
            clearTimeout(debounceTimer);
            supabase.removeChannel(subscription);
        };
    }, [fetchRealtimeStatusData]);

    return {
        locationGroups,
        locations,
        allUsers,
        activeUserCountByGroup,
        fetchRealtimeStatusData
    };
};
