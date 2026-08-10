import { startOfWeek, endOfWeek, differenceInDays } from 'date-fns';

export const formatToLocalISO = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';
    const offset = date.getTimezoneOffset() * 60000;
    const localDate = new Date(date.getTime() - offset);
    return localDate.toISOString().substring(0, 16);
};

export const getKSTDateString = (date) => {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
};

export const getWeekIdentifier = (date) => {
    const d = new Date(date);
    const year = String(d.getFullYear()).slice(2);
    const month = String(d.getMonth() + 1).padStart(2, '0');

    const weekNum = getKSTWeekOfMonth(d);

    return `${year}${month}_W${weekNum}`;
};

export const calculateAge = (birthDate) => {
    if (!birthDate) return '';
    const cleanStr = String(birthDate).replace(/[^0-9]/g, '');
    if (cleanStr.length !== 6) return '';

    // Ignore dummy / placeholder dates
    if (cleanStr === '990101' || cleanStr === '999999' || cleanStr === '000000') return '';

    const yy = parseInt(cleanStr.substring(0, 2), 10);
    const mm = parseInt(cleanStr.substring(2, 4), 10);
    const dd = parseInt(cleanStr.substring(4, 6), 10);

    if (isNaN(yy) || isNaN(mm) || isNaN(dd)) return '';
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return '';

    const today = new Date();
    const currentYear = today.getFullYear();

    const year = (yy <= 30) ? 2000 + yy : 1900 + yy;
    let age = currentYear - year + 1;

    if (isNaN(age) || age <= 0 || age > 100) return '';

    return age;
};

/**
 * Standard Korean Week of Month calculation.
 * Rule: The first week of the month is the one containing the first Thursday.
 * Weeks start on Monday.
 */
export const getKSTWeekOfMonth = (date) => {
    const d = new Date(date);

    // Find the Thursday of this week
    const day = d.getDay();
    const diffToThursday = (day === 0 ? -3 : 4 - day);
    const thursday = new Date(d);
    thursday.setDate(d.getDate() + diffToThursday);

    const month = thursday.getMonth();
    const year = thursday.getFullYear();

    // Find the first Thursday of that month
    const firstOfMonth = new Date(year, month, 1);
    const firstDay = firstOfMonth.getDay();
    const diffToFirstThursday = (firstDay <= 4 ? 4 - firstDay : 11 - firstDay);
    const firstThursday = new Date(year, month, 1 + diffToFirstThursday);

    // Week number = (thursday - firstThursday) / 7 + 1
    const weeks = Math.round((thursday - firstThursday) / (7 * 24 * 60 * 60 * 1000)) + 1;

    return weeks;
};

export const parseTimeRange = (timeRangeStr) => {
    if (!timeRangeStr) return { start: '', end: '', durationStr: '', durationMin: 0 };

    // Format: "HH:mm ~ HH:mm"
    const parts = timeRangeStr.split('~').map(s => s.trim());
    if (parts.length !== 2) return { start: timeRangeStr, end: '', durationStr: '', durationMin: 0 };

    const start = parts[0];
    const end = parts[1];

    const startTime = new Date(`2000-01-01T${start}:00`);
    const endTime = new Date(`2000-01-01T${end}:00`);

    let diffMs = endTime - startTime;
    if (diffMs < 0) diffMs += 24 * 60 * 60 * 1000; // Handle overnight

    const diffMin = Math.floor(diffMs / 60000);
    const hours = Math.floor(diffMin / 60);
    const mins = diffMin % 60;

    const durationStr = `${hours}:${String(mins).padStart(2, '0')}:00`; // As per excel screenshot "2:00:00"

    return { start, end, durationStr, durationMin: diffMin };
};

export const formatDateRelative = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return '방금';
    if (diffMin < 60) return `${diffMin}분`;
    if (diffHour < 24) return `${diffHour}시간`;
    if (diffDay < 7) return `${diffDay}일`;

    // if older than 7 days, just show date
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}월 ${day}일`;
};

export const parseDurationToMinutes = (durationStr) => {
    if (!durationStr) return 0;
    
    // Normalize string (remove spaces, lowercase)
    const s = durationStr.toString().replace(/\s+/g, '').toLowerCase();
    
    // Check if it matches patterns
    // 1. "1시간30분", "1h30m", etc.
    const hourMinMatch = s.match(/^(\d+(?:\.\d+)?)(?:시간|h|시간반?)?(\d+)(?:분|m)?$/);
    if (hourMinMatch) {
        const hours = parseFloat(hourMinMatch[1]);
        const mins = parseInt(hourMinMatch[2]);
        return Math.round(hours * 60 + mins);
    }
    
    // 2. "30분", "45m", etc.
    const minMatch = s.match(/^(\d+)(?:분|m)$/);
    if (minMatch) {
        return parseInt(minMatch[1]);
    }
    
    // 3. "2시간", "1.5h", etc.
    const hourMatch = s.match(/^(\d+(?:\.\d+)?)(?:시간|h)?$/);
    if (hourMatch) {
        const hours = parseFloat(hourMatch[1]);
        return Math.round(hours * 60);
    }
    
    // 4. Try parsing float
    const parsed = parseFloat(s);
    if (!isNaN(parsed)) {
        // Default to hours if it's a plain number
        return Math.round(parsed * 60);
    }
    
    return 0; // Default or fallback
};

export const formatKoreanTimeRange = (startDateStr, durationStr) => {
    if (!startDateStr) return '시간 미정';
    const startDate = new Date(startDateStr);
    if (isNaN(startDate.getTime())) return '시간 미정';
    
    const formatPart = (date) => {
        let hours = date.getHours();
        const minutes = date.getMinutes();
        const ampm = hours >= 12 ? '오후' : '오전';
        hours = hours % 12;
        hours = hours ? hours : 12;
        
        const minText = minutes > 0 ? ` ${minutes}분` : '';
        return { ampm, hours, minText, text: `${ampm} ${hours}시${minText}` };
    };
    
    const start = formatPart(startDate);
    const durationMinutes = parseDurationToMinutes(durationStr);
    if (durationMinutes > 0) {
        const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);
        const end = formatPart(endDate);
        
        if (start.ampm === end.ampm) {
            return `${start.text} ~ ${end.hours}시${end.minText}`;
        } else {
            return `${start.text} ~ ${end.text}`;
        }
    }
    return start.text;
};

export const formatProgramSchedule = (dateStr, durationStr, isRecruiting = true, programDays = [], programStartDate = null, programEndDate = null) => {
    if (isRecruiting === false || (programStartDate && programEndDate)) {
        const start = programStartDate || dateStr;
        const end = programEndDate;
        
        if (start && end && start !== end) {
            const s = new Date(start);
            const e = new Date(end);
            if (!isNaN(s.getTime()) && !isNaN(e.getTime())) {
                const daysOfWeek = ['일', '월', '화', '수', '목', '금', '토'];
                const sMonth = s.getMonth() + 1;
                const sDay = s.getDate();
                const sDayOfWeek = daysOfWeek[s.getDay()];
                
                const eMonth = e.getMonth() + 1;
                const eDay = e.getDate();
                const eDayOfWeek = daysOfWeek[e.getDay()];
                
                const timePart = formatKoreanTimeRange(dateStr || programStartDate, durationStr);
                return `${sMonth}/${sDay}(${sDayOfWeek}) ~ ${eMonth}/${eDay}(${eDayOfWeek}) ${timePart}`;
            }
        }

        if (start) {
            const targetDate = new Date(start);
            if (!isNaN(targetDate.getTime())) {
                const daysOfWeek = ['일', '월', '화', '수', '목', '금', '토'];
                const month = targetDate.getMonth() + 1;
                const day = targetDate.getDate();
                const dayOfWeek = daysOfWeek[targetDate.getDay()];
                
                const timePart = formatKoreanTimeRange(dateStr || programStartDate, durationStr);
                return `${month}/${day}(${dayOfWeek}) ${timePart}`;
            }
        }

        if (!programDays || programDays.length === 0) return '요일 미지정';
        const labels = ['일', '월', '화', '수', '목', '금', '토'];
        const sortedDays = [...programDays].sort((a, b) => a - b);
        const daysPart = sortedDays.map(d => labels[d]).join(', ');
        
        const timePart = formatKoreanTimeRange(dateStr || programStartDate, durationStr);
        return `[${daysPart}] ${timePart}`;
    }

    if (!dateStr || dateStr === '미정') return '미정';
    
    const startDate = new Date(dateStr);
    if (isNaN(startDate.getTime())) return '미정';
    
    const daysOfWeek = ['일', '월', '화', '수', '목', '금', '토'];
    const month = startDate.getMonth() + 1;
    const day = startDate.getDate();
    const dayOfWeek = daysOfWeek[startDate.getDay()];
    
    const timePart = formatKoreanTimeRange(dateStr, durationStr);
    return `${month}/${day}(${dayOfWeek}) ${timePart}`;
};
