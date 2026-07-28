import { format } from 'date-fns';
import { getWeekIdentifier, parseTimeRange } from './dateUtils';
import { supabase } from '../supabaseClient';

/**
 * Trigger Realtime LINE / Discord Checkin Notification
 */
export const sendCheckinNotification = async ({ userName, schoolName, locationName, studentRegion, isGuest = false, purposes = [] }) => {
    try {
        const targetLocName = locationName || (studentRegion === '강서' ? '이높플레이스' : '하이픈');
        const locNameStr = (targetLocName || '').toString();

        const isHaifnLoc = (
            locNameStr.includes('하이픈') ||
            locNameStr.includes('HAIFN') ||
            locNameStr.includes('강동')
        ) && !(
            locNameStr.includes('이높') ||
            locNameStr.includes('ENOUGH_PLACE') ||
            locNameStr.includes('강서')
        );

        const { data: settings } = await supabase.from('global_settings').select('*');
        let lineToken = '', lineGroupId = '', gsWebhookUrl = '', discordWebhookUrl = '';

        if (settings) {
            settings.forEach(s => {
                if (s.key === 'line_channel_access_token') lineToken = s.value;
                if (s.key === 'line_group_id') lineGroupId = s.value;
                if (s.key === 'gs_webhook_url') gsWebhookUrl = s.value;
                if (s.key === 'discord_webhook_url') discordWebhookUrl = s.value;
            });
        }

        const timeStr = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
        const cleanName = userName || '알 수 없음';
        const cleanSchool = schoolName ? `(${schoolName})` : '';
        const tag = isGuest ? '[GUEST CHECK-IN]' : '[WEB CHECK-IN]';
        
        let purposeText = '';
        if (purposes && purposes.length > 0) {
            purposeText = `\n🎯 이용 목적: ${purposes.join(', ')}`;
        }

        const alertMessage = `${tag}\n💌 ${cleanName}${cleanSchool}님이 ${targetLocName} 센터에 체크인했어요 (${timeStr})${purposeText}`;

        // 1. LINE Notify (Strictly ONLY for Haifn center)
        if (isHaifnLoc && lineToken && lineGroupId && gsWebhookUrl) {
            fetch(gsWebhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify({
                    action: 'LINE_NOTIFY',
                    token: lineToken,
                    to: lineGroupId,
                    message: alertMessage
                })
            }).catch(e => console.error('LINE Notify error:', e));
        }

        // 2. Discord Notify
        if (discordWebhookUrl) {
            fetch(discordWebhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: alertMessage })
            }).catch(e => console.error('Discord Notify error:', e));
        }
    } catch (e) {
        console.error('sendCheckinNotification error:', e);
    }
};

/**
 * Generic Sync to Google Sheets
 * @param {string} webhookUrl 
 * @param {string} tabName - The name of the tab in Google Sheets
 * @param {Array} rows - Array of objects (data)
 * @param {Array} headers - Optional headers for first-time creation
 */
export const syncToGoogleSheets = async (webhookUrl, tabName, rows, headers = []) => {
    return await bulkSyncToGoogleSheets(webhookUrl, [{ tabName, rows, headers }]);
};

/**
 * Bulk Sync to Google Sheets (Multiple tabs in one request)
 * @param {string} webhookUrl 
 * @param {Array} payloads - Array of { tabName, rows, headers }
 */
export const bulkSyncToGoogleSheets = async (webhookUrl, payloads) => {
    if (!webhookUrl) throw new Error('Google Sheets Webhook URL이 설정되지 않았습니다.');

    try {
        await fetch(webhookUrl, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ isBulk: true, payloads })
        });
        return { success: true };
    } catch (error) {
        console.error('Google Sheets Bulk Sync Error:', error);
        throw error;
    }
};

/**
 * Legacy wrapper for backward compatibility or convenience
 */
export const backupLogsToGoogleSheets = async (webhookUrl, logs, users, locations, notices) => {
    const adminIds = new Set(users.filter(u =>
        u.name === 'admin' || u.user_group === '관리자' || u.role === 'admin'
    ).map(u => u.id));

    const formatted = logs
        .filter(l => !adminIds.has(l.user_id))
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
        .map(log => {
        const user = users.find(u => u.id === log.user_id);
        const location = locations.find(l => l.id === log.location_id);

        let targetName = location ? location.name : '-';
        if (log.type?.startsWith('PRG_')) {
            const notice = notices?.find(n => n.id === log.location_id);
            targetName = notice ? `[프로그램] ${notice.title}` : '삭제된 프로그램';
        }

        return {
            '일시': format(new Date(log.created_at), 'yyyy-MM-dd HH:mm:ss'),
            '이름': user ? user.name : '알 수 없음',
            '학교': user ? user.school : '-',
            '구분': log.type,
            '장소/프로그램': targetName
        };
    });

    return await syncToGoogleSheets(webhookUrl, '공간로그', formatted, ['일시', '이름', '학교', '구분', '장소/프로그램']);
};

/**
 * Upload daily summary to Notion
 * @param {string} apiKey - Notion API Key (Internal Integration Token)
 * @param {string} databaseId - Notion Database ID
 * @param {Object} summaryData - Processed summary data from analyticsUtils
 */
export const uploadSummaryToNotion = async (apiKey, databaseId, summaryData) => {
    if (!apiKey || !databaseId) throw new Error('Notion API 설정이 부족합니다.');

    // Note: This requires a proxy or a serverless function if calling directly from browser 
    // because Notion API doesn't support CORS from browsers.
    // For now, we will assume the user might use a simple relay or we provide the structure.
    // In a real Netlify/Vite environment, we'd use a Netlify Function.

    // We'll prepare the payload first.
    const today = format(new Date(), 'yyyy-MM-dd');
    const dayStats = summaryData.timeSeries.find(d => d.date === today) || {
        visitCount: 0,
        activeUsers: 0,
        totalDuration: 0
    };

    const payload = {
        parent: { database_id: databaseId },
        properties: {
            "날짜": {
                title: [{ text: { content: today } }]
            },
            "총 방문 횟수": {
                number: dayStats.visitCount || 0
            },
            "고유 방문자 수": {
                number: dayStats.activeUsers || 0
            },
            "총 이용 시간(분)": {
                number: Math.round(dayStats.totalDuration || 0)
            },
            "최고 인기 공간": {
                rich_text: [{ text: { content: summaryData.roomAnalysis[0]?.name || '-' } }]
            }
        }
    };

    try {
        // Direct call might fail due to CORS. 
        // Suggestion: Use a Netlify function if this is deployed on Netlify.
        const response = await fetch('https://api.notion.com/v1/pages', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Notion-Version': '2022-06-28'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Notion 업로드 실패');
        }

        return await response.json();
    } catch (error) {
        console.error('Notion Upload Error:', error);
        throw error;
    }
};

/**
 * Perform a full sync of all data categories to Google Sheets.
 * This function encapsulates the entire data preparation and bulk sync process.
 */
export const performFullSyncToGoogleSheets = async ({
    webhookUrl,
    users,
    logs,
    responses,
    notices,
    locations,
    visitNotes,
    schoolLogs,
    feedbacks,
    processUserAnalytics,
    processProgramAnalytics,
    processAnalyticsData,
    aggregateVisitSessions
}) => {
    if (!webhookUrl) throw new Error('Google Sheets Webhook URL이 설정되지 않았습니다.');

    console.log('--- Starting Full Data Sync ---');

    const adminIds = new Set(users.filter(u =>
        u.name === 'admin' || u.user_group === '관리자' || u.role === 'admin'
    ).map(u => u.id));

    // 1. 회원정보 (User Info)
    const userLastVisitMap = new Map();
    logs.forEach(l => {
        if (l.type === 'CHECKIN' && !adminIds.has(l.user_id)) {
            const existing = userLastVisitMap.get(l.user_id);
            if (!existing || new Date(l.created_at) > new Date(existing)) {
                userLastVisitMap.set(l.user_id, l.created_at);
            }
        }
    });

    const userRows = users.filter(u => !adminIds.has(u.id)).map(u => ({
        'ID': u.id,
        '이름': u.name,
        '그룹': u.user_group || '-',
        '학교': u.school,
        '연락처': u.phone || '-',
        '생년월일': u.birth || '-',
        '가입일': u.created_at ? format(new Date(u.created_at), 'yyyy-MM-dd') : '-',
        '최근방문': userLastVisitMap.has(u.id) ? format(new Date(userLastVisitMap.get(u.id)), 'yyyy-MM-dd HH:mm') : '-'
    }));

    // 2. 회원 통계 (User Statistics)
    const uStats = processUserAnalytics(users, logs, responses, notices, new Date(), 'YEARLY');
    const userStatRows = uStats.map(ua => ({
        '그룹': ua.group,
        '학교': ua.school,
        '이름': ua.name,
        '누적 이용시간(분)': ua.spaceDuration,
        '공간 방문 횟수': ua.spaceCount,
        '방문 일수': ua.visitDaysCount,
        '프로그램 신청': ua.programCount,
        '실제 참석': ua.attendedCount
    })).filter(row => row['공간 방문 횟수'] > 0 || row['프로그램 신청'] > 0);

    // 3. 공간로그 (Space Logs)
    const logRows = logs
        .filter(l => !l.type?.startsWith('PRG_') && !adminIds.has(l.user_id))
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
        .map(log => {
            const u = users.find(user => user.id === log.user_id);
            const loc = locations.find(l => l.id === log.location_id);
            return {
                '일시': format(new Date(log.created_at), 'yyyy-MM-dd HH:mm:ss'),
                '이름': u ? u.name : '알 수 없음',
                '학교': u ? u.school : '-',
                '장소': loc ? loc.name : '-',
                '유형': log.type === 'CHECKIN' ? '입실' : log.type === 'CHECKOUT' ? '퇴실' : log.type === 'MOVE' ? '이동' : log.type,
                '체류시간(분)': log.duration || 0
            };
        });

    // 4. 프로그램 실적
    const prgStats = processProgramAnalytics(notices, responses, new Date(), 'YEARLY');
    const prgPerfRows = prgStats.map(p => ({
        '날짜': p.program_date || format(new Date(p.created_at), 'yyyy-MM-dd'),
        '카테고리': p.category,
        '프로그램명': p.title,
        '모집정원': p.max_capacity || '-',
        '신청인원': p.joinCount,
        '참석인원': p.attendedCount,
        '출석률': `${p.attendanceRate}%`
    }));

    // 5. 프로그램 개별로그
    const prgDetailRows = (responses || []).filter(res => !adminIds.has(res.user_id)).map(res => {
        const u = users.find(user => user.id === res.user_id);
        const notice = notices.find(n => n.id === res.notice_id);
        return {
            '프로그램날짜': notice ? notice.program_date : '-',
            '프로그램명': notice ? notice.title : '삭제됨',
            '이름': u ? u.name : '알 수 없음',
            '학교': u ? u.school : '-',
            '신청상태': res.status,
            '출석여부': res.is_attended ? '참석' : '미참석',
            '신청일시': res.created_at ? format(new Date(res.created_at), 'yyyy-MM-dd HH:mm') : '-'
        };
    });

    // 6. 일별 운영지표
    const dailyAnalytics = processAnalyticsData(logs, locations, users, new Date(), 'MONTHLY');
    const dayLabels = ['일', '월', '화', '수', '목', '금', '토'];
    const dailyRows = (dailyAnalytics.timeSeries || []).map(ts => ({
        '날짜': format(new Date(ts.date), 'yyyy-MM-dd'),
        '요일': dayLabels[new Date(ts.date).getDay()],
        '방문 횟수': ts.visitCount,
        '총 이용시간(분)': Math.round(ts.totalDuration)
    }));

    // 7. 학생방문일지
    const visitNotesMap = {};
    (visitNotes || []).forEach(n => {
        visitNotesMap[`${n.user_id}_${n.visit_date}`] = { purpose: n.purpose, remarks: n.remarks };
    });

    const visitSummaries = aggregateVisitSessions(logs, users, locations);
    const visitRows = visitSummaries.map(s => {
        const note = visitNotesMap[`${s.userId}_${s.date}`] || {};
        return {
            '주차': s.weekId,
            '날짜': s.date,
            '요일': s.dayOfWeek,
            '학교': s.school,
            '이름': s.name,
            '시작': s.startTime,
            '종료': s.endTime,
            '공간': s.usedSpaces,
            '체류시간': s.durationStr,
            '방문목적': note.purpose || '',
            '비고': note.remarks || ''
        };
    }).sort((a, b) => {
        const dateDiff = new Date(a['날짜']) - new Date(b['날짜']);
        if (dateDiff !== 0) return dateDiff;
        return a['시작'].localeCompare(b['시작']);
    });

    // 8. 학생만남일지 (Student Meeting Logs)
    const schoolLogRows = (schoolLogs || [])
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .map(log => {
            const timeInfo = parseTimeRange(log.time_range);
            const facilitatorNames = log.facilitator_ids?.map(fid => users.find(u => u.id === fid)?.name).filter(Boolean).join(', ') || '';
            const participantNames = log.participant_ids?.map(pid => users.find(u => u.id === pid)?.name).filter(Boolean).join(', ') || '';

            return {
                'ID': log.id,
                '주차': getWeekIdentifier(log.date),
                '날짜': log.date,
                '시간': log.time_range,
                '장소': log.location || '-',
                '학교': log.schools?.name || log.users?.school || '-',
                '참여자': participantNames,
                '참여인원': log.participant_ids?.length || 0,
                '담당자': facilitatorNames,
                '내용': log.content || ''
            };
        });

    // 9. 리뷰분석 (Feedback Logs)
    const calculateAge = (birth) => {
        if (!birth || birth.length < 2) return '-';
        const yy = parseInt(birth.substring(0, 2));
        if (isNaN(yy)) return '-';
        const fullYear = yy > 50 ? 1900 + yy : 2000 + yy;
        return new Date().getFullYear() - fullYear + 1;
    };

    const feedbackRows = (feedbacks || [])
        .filter(fb => !adminIds.has(fb.user_id))
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
        .map((fb, idx) => {
        return {
            '번호': idx + 1,
            '날짜': format(new Date(fb.created_at), 'yyyy-MM-dd'),
            '프로그램명': fb.notices?.title || '-',
            '프로그램구분': fb.notices?.program_type || '-',
            '이름': fb.users?.name || '-',
            '학교': fb.users?.school || '-',
            '나이': calculateAge(fb.users?.birth),
            '만족도': fb.q3_satisfaction || '-',
            '재참여의사': fb.q6_would_rejoin || '-',
            '참여이유': fb.q1_reason || '-',
            '경험': fb.q2_experience || '-',
            '좋았던점': fb.q4_best_moment || '-',
            '아쉬웠던점': fb.q5_disappointments || '-',
            '재참여(망설이는)이유': fb.q7_rejoin_reason || '-',
            '기타': fb.q8_additional_comments || '-'
        };
    });

    const payloads = [
        { tabName: '회원정보', rows: userRows, headers: ['ID', '이름', '그룹', '학교', '연락처', '생년월일', '가입일', '최근방문'] },
        { tabName: '회원통계', rows: userStatRows, headers: ['그룹', '학교', '이름', '누적 이용시간(분)', '공간 방문 횟수', '방문 일수', '프로그램 신청', '실제 참석'] },
        { tabName: '공간로그', rows: logRows, headers: ['일시', '이름', '학교', '장소', '유형', '체류시간(분)'] },
        { tabName: '프로그램실적', rows: prgPerfRows, headers: ['날짜', '카테고리', '프로그램명', '모집정원', '신청인원', '참석인원', '출석률'] },
        { tabName: '프로그램로그', rows: prgDetailRows, headers: ['프로그램날짜', '프로그램명', '이름', '학교', '신청상태', '출석여부', '신청일시'] },
        { tabName: '학생방문일지', rows: visitRows, headers: ['주차', '날짜', '요일', '학교', '이름', '시작', '종료', '공간', '체류시간', '방문목적', '비고'] },
        { tabName: '학생만남일지', rows: schoolLogRows, headers: ['ID', '주차', '날짜', '시간', '장소', '학교', '참여자', '참여인원', '담당자', '내용'] },
        { tabName: '리뷰분석', rows: feedbackRows, headers: ['번호', '날짜', '프로그램명', '프로그램구분', '이름', '학교', '나이', '만족도', '재참여의사', '참여이유', '경험', '좋았던점', '아쉬웠던점', '재참여(망설이는)이유', '기타'] },
        { tabName: '일별운영지표', rows: dailyRows, headers: ['날짜', '요일', '방문 횟수', '총 이용시간(분)'] }
    ].filter(p => p.rows.length > 0);

    return await bulkSyncToGoogleSheets(webhookUrl, payloads);
};
