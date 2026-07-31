import { getWeekIdentifier, getKSTDateString, calculateAge } from './dateUtils';
import { isAdminOrStaff } from './userUtils';

/**
 * Aggregates raw logs into visit sessions (CHECKIN-CHECKOUT pairs).
 * @param {Array} allLogs - Raw logs from Supabase
 * @param {Array} users - User list
 * @param {Array} locations - Location list
 * @param {string} startDate - Optional YYYY-MM-DD
 * @param {string} endDate - Optional YYYY-MM-DD
 * @returns {Array} List of visit sessions
 */
export const aggregateVisitSessions = (allLogs, users, locations, startDate = '', endDate = '') => {
    const isWithinRange = (dateStr) => {
        if (!dateStr) return true;
        const target = dateStr.includes('T') || dateStr.includes(' ')
            ? getKSTDateString(dateStr)
            : dateStr;
        if (startDate && target < startDate) return false;
        if (endDate && target > endDate) return false;
        return true;
    };

    const visitLogs = allLogs.filter(log => ['CHECKIN', 'CHECKOUT', 'MOVE', 'GUEST_ENTRY'].includes(log.type));
    const userMap = new Map(users.map(u => [u.id, u]));
    const locationMap = new Map(locations.map(l => [l.id, l]));

    // Group logs by user (or process mobile guest logs directly)
    const userLogs = {};
    const aggregated = [];

    visitLogs.forEach(log => {
        if (!log.user_id || log.metadata?.is_guest) {
            const guestName = log.metadata?.guest_name || '게스트';
            const guestSchool = log.metadata?.guest_school || '-';
            const startAt = new Date(log.created_at);
            const date = getKSTDateString(startAt);
            if (!isWithinRange(date)) return;

            const loc = locationMap.get(log.location_id);
            const locName = loc?.name || '하이픈';
            const startTimeStr = startAt.toLocaleTimeString('ko-KR', { hour12: false, hour: '2-digit', minute: '2-digit' });

            aggregated.push({
                id: `guest_${log.id}_${startAt.getTime()}`,
                userId: `guest_${log.id}`,
                date,
                weekId: getWeekIdentifier(startAt.toISOString()),
                dayOfWeek: startAt.toLocaleDateString('ko-KR', { weekday: 'short' }),
                school: guestSchool,
                name: guestName.includes('게스트') ? guestName : `${guestName}(게스트)`,
                userGroup: '게스트',
                birth: '-',
                phone: '-',
                age: '-',
                rawLogs: [log],
                startTime: startTimeStr,
                endTime: '-',
                durationStr: '0:00:00',
                durationMin: '0분',
                usedSpaces: locName,
                sortTime: startAt.getTime()
            });
            return;
        }

        const user = userMap.get(log.user_id);
        if (!user || isAdminOrStaff(user)) return;
        if (!userLogs[log.user_id]) userLogs[log.user_id] = [];
        userLogs[log.user_id].push(log);
    });

    Object.entries(userLogs).forEach(([userId, logs]) => {
        const user = userMap.get(userId);
        const sortedLogs = [...logs].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

        const sessions = [];
        let currentLogs = [];
        let sessionHasCheckout = false;

        sortedLogs.forEach(log => {
            const logDate = getKSTDateString(log.created_at);
            const currentSessionDate = currentLogs.length > 0 ? getKSTDateString(currentLogs[0].created_at) : null;

            if (currentSessionDate && logDate !== currentSessionDate) {
                sessions.push(currentLogs);
                currentLogs = [];
                sessionHasCheckout = false;
            } else if (log.type === 'CHECKIN' && sessionHasCheckout) {
                sessions.push(currentLogs);
                currentLogs = [];
                sessionHasCheckout = false;
            }
            currentLogs.push(log);
            if (log.type === 'CHECKOUT') sessionHasCheckout = true;
        });
        if (currentLogs.length > 0) sessions.push(currentLogs);

        sessions.forEach(sessionLogs => {
            const firstCheckIn = sessionLogs.find(l => l.type === 'CHECKIN');
            const hasMove = sessionLogs.some(l => l.type === 'MOVE');

            // Skip orphan sessions that consist solely of a CHECKOUT log without any prior CHECKIN or MOVE
            if (!firstCheckIn && !hasMove) {
                return;
            }

            const startAt = firstCheckIn ? new Date(firstCheckIn.created_at) : new Date(sessionLogs[0].created_at);
            
            const date = getKSTDateString(startAt);
            if (!isWithinRange(date)) return;

            const lastCheckOut = [...sessionLogs].reverse().find(l => l.type === 'CHECKOUT');
            let endAt;
            let isAutoCheckOut = false;
            let isActiveNow = false;

            if (lastCheckOut) {
                endAt = new Date(lastCheckOut.created_at);
            } else {
                const todayStr = getKSTDateString(new Date().toISOString());
                const nowKSTHour = parseInt(new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Seoul', hour12: false, hour: '2-digit' }));
                const isPast22Today = date === todayStr && nowKSTHour >= 22;

                if (date === todayStr && !isPast22Today) {
                    endAt = new Date();
                    isActiveNow = true;
                } else {
                    // If checkout is missing on a past day or after 22:00, default to 22:00 of the check-in day (KST)
                    const startLocal = new Date(startAt);
                    const fallbackEnd = new Date(startLocal.getFullYear(), startLocal.getMonth(), startLocal.getDate(), 22, 0, 0, 0);
                    
                    if (startAt >= fallbackEnd) {
                        endAt = startAt;
                    } else {
                        endAt = fallbackEnd;
                        isAutoCheckOut = true;
                    }
                }
            }

            const durationMs = endAt - startAt;
            const durationMin = Math.max(0, Math.floor(durationMs / 60000));

            const hours = Math.floor(durationMin / 60);
            const mins = durationMin % 60;
            const durationStr = `${hours}:${String(mins).padStart(2, '0')}:00`;

            const startTimeStr = startAt.toLocaleTimeString('ko-KR', { hour12: false, hour: '2-digit', minute: '2-digit' });

            const spaceChain = [];
            sessionLogs.forEach(l => {
                const loc = locationMap.get(l.location_id);
                const locName = loc?.name;
                if (locName && spaceChain[spaceChain.length - 1] !== locName) {
                    spaceChain.push(locName);
                }
            });

            const groupKey = `${userId}_${date}`;

            aggregated.push({
                id: `${groupKey}_${startAt.getTime()}`,
                userId,
                date,
                weekId: getWeekIdentifier(startAt.toISOString()),
                dayOfWeek: startAt.toLocaleDateString('ko-KR', { weekday: 'short' }),
                school: user.school || '-',
                name: user.name,
                birth: user.birth || '-',
                phone: user.phone || (user.phone_back4 ? `***-****-${user.phone_back4}` : '-'),
                age: calculateAge(user.birth) || '-',
                rawLogs: sessionLogs,
                startTime: startTimeStr,
                endTime: (lastCheckOut || isAutoCheckOut) ? endAt.toLocaleTimeString('ko-KR', { hour12: false, hour: '2-digit', minute: '2-digit' }) : '-',
                durationStr,
                durationMin: `${durationMin}분`,
                usedSpaces: spaceChain.join('-'),
                sortTime: startAt.getTime()
            });
        });
    });

    return aggregated;
};
