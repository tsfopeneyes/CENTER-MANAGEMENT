export const kstDateKey = (value) => {
    if (value == null || value === '') return '';
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(?:$|T\d{2}:\d{2}(?::\d{2})?$)/.test(value)) return value.slice(0, 10);
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : new Date(date.getTime() + 9 * 3600000).toISOString().slice(0, 10);
};
export const addCalendarDays = (key, amount) => {
    const date = new Date(`${key}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + amount);
    return date.toISOString().slice(0, 10);
};
export const calendarWeekday = (key) => new Date(`${key}T00:00:00Z`).getUTCDay();
export const shiftCalendarMonth = (month, amount) => {
    const date = new Date(`${month}-01T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + amount);
    return date.toISOString().slice(0, 7);
};
export const getMonthGrid = (month) => {
    const first = `${month}-01`;
    const last = addCalendarDays(`${shiftCalendarMonth(month, 1)}-01`, -1);
    const start = addCalendarDays(first, -calendarWeekday(first));
    const end = addCalendarDays(last, 6 - calendarWeekday(last));
    const days = [];
    for (let key = start; key <= end; key = addCalendarDays(key, 1)) days.push(key);
    return days;
};
export const dateHeading = (key) => `${Number(key.slice(5, 7))}월 ${Number(key.slice(8, 10))}일 (${['일', '월', '화', '수', '목', '금', '토'][calendarWeekday(key)]})`;

// Month mode excludes the adjacent-month padding cells. Multi-day events are
// shown on each applicable date, just like selecting those days individually.
export const getCalendarAgenda = (eventsByDay, month, selectedDate = null, today = kstDateKey(Date.now())) => {
    // Today/upcoming dates first, followed by month-start through yesterday.
    // Both groups stay chronological; event ordering within each day is kept.
    const dates = selectedDate ? [selectedDate] : Object.keys(eventsByDay)
        .filter(day => day.startsWith(`${month}-`))
        .sort((a, b) => Number(a < today) - Number(b < today) || a.localeCompare(b));
    return dates.flatMap(date => (eventsByDay[date] || [])
        .filter(event => event.type !== 'CLOSED').map(event => ({ date, event })));
};

export const parseScheduleContent = (content) => {
    try { const parsed = JSON.parse(content); return parsed && typeof parsed === 'object' ? parsed : {}; } catch { return {}; }
};

// Expand only the visible month grid, even for programs recurring over many years.
export const buildCalendarEvents = ({ programs = [], schedules = [], categories = [], region, days }) => {
    const events = Object.fromEntries(days.map(day => [day, []]));
    const space = region === '강동' ? 'HAIFN' : region === '강서' ? 'ENOUGH_PLACE' : null;
    for (const program of programs) {
        if (program.category !== 'PROGRAM') continue;
        const start = kstDateKey(program.program_start_date || program.program_date);
        const end = kstDateKey(program.program_end_date || program.program_date || program.program_start_date);
        if (!start || !end) continue;
        for (const day of days) {
            if (day < start || day > end) continue;
            if (program.is_recruiting === false && program.program_days?.length && !program.program_days.map(Number).includes(calendarWeekday(day))) continue;
            events[day].push({ id: `program-${program.id}-${day}`, type: 'PROGRAM', title: program.title, raw: program });
        }
    }
    for (const schedule of schedules) {
        if (schedule.region && region && schedule.region !== region) continue;
        const category = categories.find(item => item.id === schedule.category_id);
        const parsed = parseScheduleContent(schedule.content);
        const isClosure = category?.name === '휴관';
        const isRental = schedule.category_id === 'RENTAL' || ['대관', '공간 대여'].includes(category?.name);
        if (isClosure && space && parsed.closed_spaces?.length && !parsed.closed_spaces.includes(space)) continue;
        const start = kstDateKey(schedule.start_date);
        const end = kstDateKey(schedule.end_date || schedule.start_date);
        if (!start || !end) continue;
        for (const day of days) {
            if (day < start || day > end) continue;
            events[day].push({ id: `${isRental ? 'rental' : 'schedule'}-${schedule.id}-${day}`, type: isClosure ? 'CLOSED' : isRental ? 'RENTAL' : 'SCHEDULE', title: isClosure ? '센터 휴무' : schedule.meetingName || schedule.title, raw: schedule });
        }
    }
    for (const day of days) events[day].sort((a, b) => {
        const priority = { CLOSED: -1, PROGRAM: 0, SCHEDULE: 1, RENTAL: 2 };
        if (priority[a.type] !== priority[b.type]) return priority[a.type] - priority[b.type];
        return String(a.raw.program_date || a.raw.start_date || '').localeCompare(String(b.raw.program_date || b.raw.start_date || ''));
    });
    return events;
};
