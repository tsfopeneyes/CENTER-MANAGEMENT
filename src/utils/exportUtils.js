import * as XLSX from 'xlsx';
import { format } from 'date-fns';

/**
 * Export user data to Excel
 * @param {Array} users - User list
 * @param {Array} logs - All logs (to calculate visit counts or status)
 */
export const exportUsersToExcel = (users, logs) => {
    // Prepare data
    const exportData = users.map(user => {
        // Simple visit count calculation
        const visitCount = logs.filter(l => l.user_id === user.id && l.type === 'CHECKIN').length;

        return {
            '이름': user.name,
            '휴대폰번호': user.phone || user.phone_back4 || '-',
            '소속/그룹': user.user_group || '-',
            '가입일': user.created_at ? format(new Date(user.created_at), 'yyyy-MM-dd') : '-',
            '총 방문 횟수': visitCount
        };
    });

    // Create worksheet
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "회원목록");

    // Download
    const fileName = `회원명단_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`;
    XLSX.writeFile(workbook, fileName);
};

/**
 * Export logs data to Excel
 * @param {Array} logs - Raw logs
 * @param {Array} users - User list for mapping
 * @param {Array} locations - Location list for mapping
 */
export const exportLogsToExcel = (logs, users, locations, notices) => {
    // Prepare data
    const exportData = [...logs].reverse().map(log => {
        const user = users.find(u => u.id === log.user_id);
        const location = locations.find(l => l.id === log.location_id);

        // Handle new ID:Title format
        let prgTitleResolved = '';
        if (log.location_id?.includes(':')) {
            prgTitleResolved = log.location_id.split(':').slice(1).join(':');
        } else {
            const notice = notices?.find(n => n.id === log.location_id);
            prgTitleResolved = notice ? notice.title : '삭제된 프로그램';
        }

        let typeLabel = '';
        switch (log.type) {
            case 'CHECKIN': typeLabel = '입실'; break;
            case 'CHECKOUT': typeLabel = '퇴실'; break;
            case 'MOVE': typeLabel = '이동'; break;
            case 'PRG_ATTENDED': typeLabel = '프로그램 완료(참석)'; break;
            case 'PRG_ABSENT': typeLabel = '프로그램 완료(미참석)'; break;
            case 'PRG_CANCELLED': typeLabel = '프로그램 취소'; break;
            default: typeLabel = log.type;
        }

        const isProgramType = log.type.startsWith('PRG_');

        return {
            '시간': format(new Date(log.created_at), 'yyyy-MM-dd HH:mm:ss'),
            '이름': user ? user.name : '알 수 없음',
            '소속': user ? user.user_group : '-',
            '종류': typeLabel,
            '위치/프로그램': isProgramType ? prgTitleResolved : (location ? location.name : '-')
        };
    });

    // Create worksheet
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "로그기록");

    // Download
    const fileName = `시스템로그_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`;
    XLSX.writeFile(workbook, fileName);
};

/**
 * Export program participants to Excel
 * @param {Array} participants - Program participant rows
 * @param {string} noticeTitle - Program title
 * @param {Array} customFields - Program-specific application fields
 */
export const exportParticipantsToExcel = (participants, noticeTitle, customFields = []) => {
    if (!participants || participants.length === 0) {
        alert('참여 신청 인원이 없습니다.');
        return;
    }

    const correctPin = localStorage.getItem('kiosk_master_pin') || '1801';
    const enteredPin = window.prompt('전화번호 전체가 포함된 엑셀을 다운로드하려면 마스터 PIN 번호를 입력하세요 (취소하거나 잘못 입력하면 뒷자리 4자리만 표시됩니다):');
    const showFullPhone = enteredPin === correctPin;

    if (enteredPin !== null && !showFullPhone) {
        alert('마스터 PIN 번호가 올바르지 않습니다. 전화번호는 뒷자리 4자리만 표시됩니다.');
    }

    const exportData = participants.map((user, idx) => {
        const customAnswers = Object.fromEntries(
            customFields.map(field => [field.label, user.application_answers?.[field.id] || '-'])
        );
        return {
            '순번': idx + 1,
            '이름': user.name,
            '소속': user.school || '-',
            '전화번호': showFullPhone ? (user.phone || user.phone_back4 || '-') : (user.phone_back4 || '-'),
            ...customAnswers,
            '출석여부': user.is_attended ? '참석' : '미참석'
        };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "참여자명단");

    // Add info row at the top or adjust Column widths
    const fileName = `[명단]_${noticeTitle}_${format(new Date(), 'yyyyMMdd')}.xlsx`;
    XLSX.writeFile(workbook, fileName);
};

/**
 * Export visit log to Excel (Universal for Student/Guest)
 * @param {Array} visitSummaries - Aggregated visit data
 * @param {Object} visitNotes - Manual notes
 * @param {string} title - Sheet title
 * @param {string} fileNamePrefix - Filename prefix
 */
export const exportVisitLogToExcel = (visitSummaries, visitNotes, title = "학생방문일지", fileNamePrefix = "학생방문일지") => {
    const exportData = visitSummaries.map(summary => {
        const noteKey = `${summary.userId}_${summary.date}`;
        const note = visitNotes[noteKey] || {};

        return {
            '주차구분': summary.weekId,
            '날짜': summary.date,
            '요일': summary.dayOfWeek,
            '학교': summary.school,
            '나이': summary.age,
            '이름': summary.name,
            '시작시간': summary.startTime,
            '끝시간': summary.endTime,
            '사용공간': summary.usedSpaces,
            '센터타임': summary.durationStr,
            '센터타임(분)': summary.durationMin,
            '방문목적 (수기작성)': note.purpose || '',
            '상세 방문 목적 및 비고 (수기작성)': note.remarks || ''
        };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, title);

    const fileName = `${fileNamePrefix}_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`;
    XLSX.writeFile(workbook, fileName);
};
