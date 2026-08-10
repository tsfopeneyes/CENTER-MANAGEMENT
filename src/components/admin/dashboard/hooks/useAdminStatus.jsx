import { useState } from 'react';
import { isAdminOrStaff } from '../../../../utils/userUtils';

export const useAdminStatus = ({ users, locations, locationGroups = [], zoneStats, currentLocations, dailyVisitStats, allLogs = [] }) => {
    const [locationTab, setLocationTab] = useState('ALL');
    const [zoneDetailModal, setZoneDetailModal] = useState({ isOpen: false, locationId: null, locationName: '', activeUsers: [] });

    const isPast10PM = new Date().getHours() >= 22;
    const adminIdsSet = new Set(users.filter(isAdminOrStaff).map(u => u.id));
    
    // Only count locations that are active and belong to an active group
    const activeLocations = locations.filter(loc => {
        if (loc.is_active === false) return false;
        const group = locationGroups.find(g => g.id === loc.group_id);
        if (group && group.is_active === false) return false;
        return true;
    });
    
    // Calculate total non-staff active members
    const activeUserCount = Object.keys(currentLocations).filter(uid => {
        const locId = currentLocations[uid]?.locId;
        if (!locId || adminIdsSet.has(uid)) return false;
        return activeLocations.some(l => l.id === locId);
    }).length;

    // Filter Locations
    const getFilteredLocations = () => {
        if (locationTab === 'ALL') return activeLocations;

        const haifnGroup = locationGroups.find(g => g && g.name && (g.name.includes('하이픈') || g.name.includes('HAIFN')));
        const enoughPlaceGroup = locationGroups.find(g => g && g.name && (g.name.includes('이높플레이스') || g.name.includes('ENOUGH_PLACE') || g.name.includes('이높')));

        if (locationTab === 'HAIFN') {
            return activeLocations.filter(loc => {
                const matchesGroup = haifnGroup && loc.group_id === haifnGroup.id;
                const matchesFallbackName = 
                    loc.name.includes('라운지') ||
                    loc.name.includes('워크숍') ||
                    loc.name.includes('회의실') ||
                    loc.name.includes('멤버십') ||
                    loc.name.includes('맴버십') ||
                    loc.name.includes('고백') ||
                    loc.name.includes('하이픈');
                return matchesGroup || matchesFallbackName;
            });
        }
        if (locationTab === 'ENOUGH_PLACE') {
            return activeLocations.filter(loc => {
                const matchesGroup = enoughPlaceGroup && loc.group_id === enoughPlaceGroup.id;
                const matchesFallbackName = loc.name.includes('이높');
                return matchesGroup || matchesFallbackName;
            });
        }
        return activeLocations;
    };
    const filteredLocations = getFilteredLocations();
    const totalActive = filteredLocations.reduce((sum, loc) => sum + (zoneStats[loc.id] || 0), 0);

    const activeUsersList = Object.entries(currentLocations)
        .filter(([key, locData]) => {
            const locId = locData?.locId;
            if (!locId) return false;
            const isGuestKey = locData?.isGuest || key.startsWith('guest_');
            if (!isGuestKey && adminIdsSet.has(key)) return false;
            return filteredLocations.some(l => l.id === locId);
        })
        .map(([key, locData]) => {
            const isGuestKey = locData?.isGuest || key.startsWith('guest_');
            if (isGuestKey) {
                const userObj = users.find(u => u.id === key);
                const rawGuestName = userObj?.name || locData.guestName || '게스트';
                const cleanGuestName = rawGuestName
                    .replace('(guest)', '')
                    .replace(/@/g, '')
                    .replace(/\(guest\)/gi, '')
                    .replace(/\(게스트\)/gi, '')
                    .trim();

                return {
                    id: key,
                    name: cleanGuestName || '게스트',
                    school: userObj?.school || locData.guestSchool || '-',
                    user_group: '게스트',
                    currentLocationName: locations.find(l => l.id === locData.locId)?.name || 'Unknown',
                    checkInTime: locData.checkInTime
                };
            }
            const user = users.find(u => u.id === key);
            if (!user) return null;
            return {
                ...user,
                currentLocationName: locations.find(l => l.id === locData.locId)?.name || 'Unknown',
                checkInTime: locData.checkInTime
            };
        })
        .filter(Boolean)
        .sort((a, b) => new Date(b.checkInTime) - new Date(a.checkInTime));

    const handleZoneClick = (location) => {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const todayLocationLogs = allLogs.filter(log => {
            const isToday = new Date(log.created_at) >= todayStart;
            const isTargetLocation = log.location_id === location.id;
            const isNotAdmin = !log.user_id || !adminIdsSet.has(log.user_id);
            return isToday && isTargetLocation && isNotAdmin;
        });

        const logsByUser = {};
        todayLocationLogs.forEach(log => {
            const key = log.user_id || `guest_${log.id}`;
            if (!logsByUser[key]) logsByUser[key] = [];
            logsByUser[key].push(log);
        });

        const activeUserIds = Object.keys(currentLocations).filter(uid =>
            currentLocations[uid]?.locId === location.id && (!uid || !adminIdsSet.has(uid))
        );

        const combinedUserKeys = Array.from(new Set([...activeUserIds, ...Object.keys(logsByUser)]));

        const mappedUsers = combinedUserKeys.map(key => {
            const uLogs = logsByUser[key] || [];
            const sortedAsc = [...uLogs].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
            const firstLog = sortedAsc[0];

            const userObj = users.find(u => u.id === key);
            const isGuest = userObj?.user_group === '게스트' || key.startsWith('guest_') || (firstLog && !firstLog.user_id);

            const userAllLogsToday = allLogs.filter(l => (l.user_id === key || `guest_${l.id}` === key) && new Date(l.created_at) >= todayStart);
            const checkOutLog = userAllLogsToday.slice().reverse().find(l => l.type === 'CHECKOUT') || uLogs.find(l => l.type === 'CHECKOUT');

            if (isGuest) {
                const rawGuestName = userObj?.name || (firstLog && firstLog.metadata?.guest_name) || '게스트';
                const cleanGuestName = rawGuestName
                    .replace('(guest)', '')
                    .replace(/@/g, '')
                    .replace(/\(guest\)/gi, '')
                    .replace(/\(게스트\)/gi, '')
                    .trim();
                const guestSchool = userObj?.school || (firstLog && firstLog.metadata?.guest_school) || '-';
                const locId = currentLocations[key]?.locId;
                const isActive = locId === location.id || (!checkOutLog && firstLog?.location_id === location.id);

                return {
                    id: key,
                    name: cleanGuestName || '게스트',
                    school: guestSchool,
                    user_group: '게스트',
                    isActive,
                    checkInTime: firstLog ? firstLog.created_at : (currentLocations[key]?.checkInTime || null),
                    checkOutTime: checkOutLog ? checkOutLog.created_at : null
                };
            } else {
                if (!userObj) return null;

                const locId = currentLocations[key]?.locId;
                const isActive = locId === location.id;
                const firstLogAtLoc = uLogs.find(log => log.type === 'CHECKIN' || log.type === 'MOVE');

                return {
                    ...userObj,
                    isActive,
                    checkInTime: firstLogAtLoc ? firstLogAtLoc.created_at : (currentLocations[key]?.checkInTime || null),
                    checkOutTime: checkOutLog ? checkOutLog.created_at : null
                };
            }
        }).filter(Boolean)
        .sort((a, b) => {
            if (a.isActive && !b.isActive) return -1;
            if (!a.isActive && b.isActive) return 1;
            return new Date(b.checkInTime) - new Date(a.checkInTime);
        });

        setZoneDetailModal({
            isOpen: true,
            locationId: location.id,
            locationName: location.name,
            activeUsers: mappedUsers
        });
    };

    return {
        locationTab, setLocationTab,
        zoneDetailModal, setZoneDetailModal,
        isPast10PM,
        adminIdsSet,
        activeUserCount,
        filteredLocations,
        totalActive,
        activeUsersList,
        handleZoneClick
    };
};
