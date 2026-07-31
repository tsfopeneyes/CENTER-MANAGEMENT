import { useState, useMemo, useRef, useEffect } from 'react';
import { supabase } from '../../../../supabaseClient';
import { exportLogsToExcel, exportVisitLogToExcel } from '../../../../utils/exportUtils';
import { aggregateVisitSessions } from '../../../../utils/visitUtils';
import { getWeekIdentifier, parseTimeRange } from '../../../../utils/dateUtils';
import { isAdminOrStaff } from '../../../../utils/userUtils';

export const useAdminLogs = ({ allLogs, schoolLogs, users, locations, notices, fetchData }) => {
    const [logCategory, setLogCategory] = useState(() => {
        const saved = localStorage.getItem('adminLogs_defaultTab');
        if (saved) {
            localStorage.removeItem('adminLogs_defaultTab');
            return saved;
        }
        return 'VISIT';
    }); // VISIT, SPACE, PROGRAM, STUDENT
    const [selectedLogId, setSelectedLogId] = useState(null);
    const [visitNotes, setVisitNotes] = useState({}); // { 'userId_date': { purpose, remarks } }
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [visitFilters, setVisitFilters] = useState({
        weekIds: [],
        dates: [],
        days: [],
        school: '',
        name: '',
        age: '',
        space: [],
        duration: '',
        purpose: [],
        remarks: ''
    });
    const [selectedRows, setSelectedRows] = useState(new Set());
    const [isManualModalOpen, setIsManualModalOpen] = useState(false);
    const [manualEntry, setManualEntry] = useState({
        entryType: 'MEMBER', // MEMBER, GUEST
        userId: '',
        guestName: '',
        guestSchool: '',
        guestBirth: '',
        guestPhone: '',
        date: new Date().toLocaleDateString('en-CA'),
        startTime: '14:00',
        endTime: '16:00',
        locationId: '',
        purpose: '',
        remarks: ''
    });
    const [userSearchText, setUserSearchText] = useState('');
    const [showUserResults, setShowUserResults] = useState(false);

    const inputRefs = useRef({}); // { 'rowIdx-field': ref }
    const [selection, setSelection] = useState({ startIdx: null, endIdx: null, field: null, isDragging: false });
    const focusValRef = useRef({});

    // --- Helper Functions ---

    const isWithinRange = (dateStr) => {
        if (!dateStr) return true;
        const target = dateStr.includes('T') || dateStr.includes(' ') ? new Date(dateStr).toLocaleDateString('en-CA') : dateStr;
        if (startDate && target < startDate) return false;
        if (endDate && target > endDate) return false;
        return true;
    };

    const parseLocationId = (locId) => {
        if (!locId) return { id: '', title: '', date: '', time: '', location: '' };
        if (locId.includes('|')) {
            const [id, title, date, time, location] = locId.split('|');
            return { id, title, date, time, location: location || '' };
        }
        return { id: locId, title: '', date: '', time: '', location: '' };
    };

    const extractProgramInfo = (content) => {
        const info = { date: '', duration: '', location: '', cleanContent: content };
        if (!content) return info;
        const match = content.match(/<div style="background-color: #f8fafc;[\s\S]*?<\/div>/);
        if (match) {
            const locMatch = match[0].match(/📍 장소:<\/strong>\s*([^<]+)/);
            if (locMatch) info.location = locMatch[1].trim() === '미정' ? '' : locMatch[1].trim();
        }
        return info;
    };

    const formatShortTime = (rawDate, rawTime, fallbackTime) => {
        let d;
        if (rawDate?.includes('T')) d = new Date(rawDate);
        else if (rawDate && rawTime) d = new Date(`${rawDate}T${rawTime}`);
        else d = new Date(rawDate || fallbackTime);
        if (isNaN(d.getTime())) d = new Date(fallbackTime);
        const y = String(d.getFullYear()).slice(2), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
        const h = d.getHours(), min = String(d.getMinutes()).padStart(2, '0'), ampm = h >= 12 ? 'pm' : 'am', dh = h % 12 || 12;
        return `${y}.${m}.${dd} ${ampm} ${dh}:${min}`;
    };

    const toggleFilter = (field, value) => {
        setVisitFilters(prev => {
            const current = prev[field] || [];
            return { ...prev, [field]: current.includes(value) ? current.filter(v => v !== value) : [...current, value] };
        });
    };

    // --- Memos & Data Processing ---

    const userGroupMap = useMemo(() => {
        const map = new Map();
        users.forEach(u => map.set(u.id, u.user_group));
        return map;
    }, [users]);

    const visitSummaries = useMemo(() => {
        const aggregated = aggregateVisitSessions(allLogs, users, locations, startDate, endDate);
        const withGroup = aggregated.map(s => ({ ...s, userGroup: userGroupMap.get(s.userId) || '-' }));
        const uniqueOptions = {
            weekIds: [...new Set(withGroup.map(s => s.weekId))].sort().reverse(),
            dates: [...new Set(withGroup.map(s => s.date))].sort().reverse(),
            days: ['월', '화', '수', '목', '금', '토', '일'],
            spaces: [...new Set(locations.map(l => l.name))].sort(),
            purposes: ['개인 할 일', '프로그램 참여', '교제 및 휴식', '스처쌤 만남']
        };
        const filtered = withGroup.filter(summary => {
            const noteKey = `${summary.userId}_${summary.date}`;
            const note = visitNotes[noteKey] || {};
            const matchFilter = (val, filter) => !filter || val.toLowerCase().includes(filter.toLowerCase());
            const matchArray = (val, arr) => !arr || arr.length === 0 || arr.includes(val);
            return matchArray(summary.weekId, visitFilters.weekIds) &&
                matchArray(summary.date, visitFilters.dates) &&
                matchArray(summary.dayOfWeek, visitFilters.days) &&
                matchFilter(summary.school, visitFilters.school) &&
                matchFilter(summary.name, visitFilters.name) &&
                matchFilter(summary.age?.toString() || '', visitFilters.age) &&
                (visitFilters.space.length === 0 || visitFilters.space.some(s => summary.usedSpaces.split('-').includes(s))) &&
                matchFilter(summary.durationMin?.toString() || '', visitFilters.duration) &&
                (visitFilters.purpose.length === 0 || visitFilters.purpose.some(p => (note.purpose || '').split(',').map(x => x.trim()).includes(p))) &&
                matchFilter(note.remarks || '', visitFilters.remarks);
        });
        const sorted = filtered.sort((a, b) => {
            if (a.date !== b.date) {
                return b.date.localeCompare(a.date);
            }
            return b.startTime.localeCompare(a.startTime);
        });
        return { data: sorted, options: uniqueOptions };
    }, [allLogs, users, locations, startDate, endDate, visitFilters, visitNotes, userGroupMap]);

    const filteredVisitSummaries = useMemo(() => visitSummaries.data, [visitSummaries.data]);
    const filteredGuestSummaries = useMemo(() => visitSummaries.data.filter(s => s.userGroup === '게스트'), [visitSummaries.data]);

    const currentSummaries = useMemo(() => {
        if (logCategory === 'GUEST') return filteredGuestSummaries;
        return filteredVisitSummaries;
    }, [logCategory, filteredVisitSummaries, filteredGuestSummaries]);

    const filterOptions = visitSummaries.options;

    const processedSchoolLogs = useMemo(() => {
        if (!schoolLogs) return [];
        return schoolLogs.map(log => {
            const timeInfo = parseTimeRange(log.time_range);
            const hasStudentLeader = log.participant_ids?.some(pid => users.find(user => user.id === pid)?.is_leader);
            return {
                ...log,
                weekId: getWeekIdentifier(log.date),
                category: hasStudentLeader ? '학생리더만남' : '학생만남',
                schoolName: log.schools?.name || log.users?.school || '-',
                participantCount: log.participant_ids?.length || 0,
                startTime: timeInfo.start,
                endTime: timeInfo.end,
                durationStr: timeInfo.durationStr,
                durationMin: timeInfo.durationMin,
                facilitatorNames: log.facilitator_ids?.map(fid => users.find(u => u.id === fid)?.name).filter(Boolean).join(', ') || ''
            };
        });
    }, [schoolLogs, users, locations]);

    const filteredSchoolLogs = useMemo(() => {
        return processedSchoolLogs.filter(log => isWithinRange(log.date));
    }, [processedSchoolLogs, startDate, endDate]);

    const selectedSchoolLogs = useMemo(() => {
        if (!selectedLogId) return [];
        const clickedLog = processedSchoolLogs.find(l => l.id === selectedLogId);
        if (!clickedLog) return [];
        return processedSchoolLogs.filter(l => l.school_id === clickedLog.school_id);
    }, [selectedLogId, processedSchoolLogs]);

    const programSummaries = useMemo(() => {
        const prgLogs = allLogs.filter(log => log.type.startsWith('PRG_'));
        const groups = {};
        prgLogs.forEach(log => {
            const { id: prgId, title: prgTitle, date, time, location } = parseLocationId(log.location_id);
            const timeKey = new Date(log.created_at).toISOString().slice(0, 16);
            const groupKey = `${prgId}_${timeKey}`;
            if (!groups[groupKey]) {
                const notice = notices?.find(n => n.id === prgId);
                const actualDate = date || notice?.program_date;
                let actualTime = time || '';
                if (!actualTime && notice?.program_date) {
                    try {
                        const dateObj = new Date(notice.program_date);
                        if (!isNaN(dateObj.getTime())) {
                            const hh = String(dateObj.getHours()).padStart(2, '0');
                            const mm = String(dateObj.getMinutes()).padStart(2, '0');
                            actualTime = `${hh}:${mm}`;
                        }
                    } catch (e) {
                        console.error("Failed to parse program_time:", e);
                    }
                }
                let sortTime = actualDate ? new Date(actualDate).getTime() : new Date(log.created_at).getTime();
                if (actualDate?.length <= 10 && actualTime) sortTime = new Date(`${actualDate}T${actualTime}`).getTime();
                const info = notice ? extractProgramInfo(notice.content) : null;
                groups[groupKey] = {
                    id: groupKey, prgId, prgTitle: prgTitle || notice?.title || '삭제된 프로그램',
                    prgLocation: location || info?.location || '', prgType: notice?.program_type || 'CENTER',
                    target_regions: notice?.target_regions || [],
                    displayTime: formatShortTime(actualDate, actualTime, log.created_at),
                    sortTime, type: (log.type === 'PRG_CANCELLED' || log.type === 'PRG_CANCEL_SYSTEM') ? 'CANCELLED' : 'COMPLETED',
                    attendees: [], absentees: [], cancelled: [], logIds: []
                };
            }
            groups[groupKey].logIds.push(log.id);
            const user = users.find(u => u.id === log.user_id);
            if (user) {
                const pInfo = { name: user.name, type: log.type };
                if (log.type === 'PRG_ATTENDED' || log.type === 'PRG_COMPLETED' || log.type === 'PRG_REGISTERED') groups[groupKey].attendees.push(pInfo);
                else if (log.type === 'PRG_ABSENT') groups[groupKey].absentees.push(pInfo);
                else if (log.type === 'PRG_CANCELLED') groups[groupKey].cancelled.push(pInfo);
            }
        });
        return Object.values(groups).filter(g => isWithinRange(new Date(g.sortTime).toISOString().split('T')[0])).sort((a, b) => b.sortTime - a.sortTime);
    }, [allLogs, notices, users, startDate, endDate]);

    const filteredLogs = useMemo(() => {
        if (logCategory === 'SPACE') {
            return allLogs.filter(log => ['CHECKIN', 'CHECKOUT', 'MOVE'].includes(log.type) && isWithinRange(new Date(log.created_at).toLocaleDateString('en-CA')));
        }
        return [];
    }, [allLogs, logCategory, startDate, endDate]);


    const handleDeleteLog = async (id) => {
        if (!confirm('해당 로그(들)를 삭제하시겠습니까?')) return;
        const ids = Array.isArray(id) ? id : [id];
        try {
            const logsToDelete = allLogs.filter(l => ids.includes(l.id));
            
            const { error } = await supabase.from('logs').delete().in('id', ids);
            if (error) throw error;
            
            for (const log of logsToDelete) {
                if (log.user_id && log.created_at) {
                    const logDate = new Date(log.created_at);
                    const startOfDay = new Date(logDate.getFullYear(), logDate.getMonth(), logDate.getDate(), 0, 0, 0, 0).toISOString();
                    const endOfDay = new Date(logDate.getFullYear(), logDate.getMonth(), logDate.getDate(), 23, 59, 59, 999).toISOString();
                    await supabase
                        .from('checkin_surveys')
                        .delete()
                        .eq('user_id', log.user_id)
                        .gte('created_at', startOfDay)
                        .lte('created_at', endOfDay);
                }
            }
            
            setSelectedRows(new Set());
            fetchData();
        } catch (err) { alert('삭제 실패: ' + err.message); }
    };

    const handleDeleteProgramSummary = async (ids) => {
        if (!confirm('이 프로그램의 모든 참여 기록을 삭제하시겠습니까?')) return;
        try {
            const { error } = await supabase.from('logs').delete().in('id', ids);
            if (error) throw error;
            fetchData();
        } catch (err) { alert('삭제 실패: ' + err.message); }
    };

    const handleBulkDelete = () => {
        if (selectedRows.size === 0) return;
        const allLogIds = [];
        selectedRows.forEach(rowId => {
            const row = currentSummaries.find(s => s.id === rowId);
            if (row && row.rawLogs) {
                allLogIds.push(...row.rawLogs.map(l => l.id));
            }
        });
        if (allLogIds.length === 0) {
            alert('삭제할 수 있는 로그 데이터가 없습니다.');
            return;
        }
        handleDeleteLog(allLogIds);
    };

    const handleSelectiveExport = () => {
        const isGuest = logCategory === 'GUEST';
        const title = isGuest ? "게스트 방문일지" : "학생방문일지";
        const prefix = isGuest ? "게스트방문일지" : "학생방문일지";

        if (selectedRows.size === 0) {
            exportVisitLogToExcel(currentSummaries, visitNotes, title, prefix);
            return;
        }
        const selectedSummaries = currentSummaries.filter(s => selectedRows.has(s.id));
        exportVisitLogToExcel(selectedSummaries, visitNotes, title, prefix);
    };

    const handleSelectAll = (e) => {
        if (e.target.checked) {
            setSelectedRows(new Set(currentSummaries.map(s => s.id)));
        } else {
            setSelectedRows(new Set());
        }
    };

    const handleRowSelect = (id) => {
        setSelectedRows(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };


    const handleManualSubmit = async (e) => {
        e.preventDefault();
        
        const { entryType, userId, guestName, guestSchool, guestBirth, guestPhone, date, startTime, endTime, locationId } = manualEntry;

        if (entryType === 'MEMBER' && !userId) {
            alert('회원을 선택해주세요.');
            return;
        }

        if (entryType === 'GUEST' && (!guestName || !guestBirth || !guestPhone || !guestSchool)) {
            alert('게스트의 모든 정보를 입력해주세요.');
            return;
        }

        if (!locationId || !startTime || !endTime) {
            alert('장소 및 시간을 입력해주세요.');
            return;
        }

        try {
            let finalUserId = userId;

            // Handle Guest Creation/Lookup
            if (entryType === 'GUEST') {
                const formattedPhone = guestPhone.replace(/[^0-9]/g, '').replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
                const phoneParts = formattedPhone.split('-');
                const back4 = phoneParts[2] || formattedPhone.slice(-4);

                // Check for existing guest
                const { data: existingGuest, error: checkError } = await supabase
                    .from('users')
                    .select('id')
                    .eq('phone', formattedPhone)
                    .maybeSingle();
                
                if (checkError) throw checkError;

                if (existingGuest) {
                    finalUserId = existingGuest.id;
                } else {
                    // Create new guest user
                    const memoText = `[가입일: ${new Date().toLocaleDateString()}] [수기작성을 통한 게스트 등록]`;
                    const { data: newUser, error: createError } = await supabase.from('users').insert([{
                        name: `${guestName}(guest)`,
                        gender: 'M',
                        school: guestSchool,
                        birth: guestBirth,
                        phone: formattedPhone,
                        phone_back4: back4,
                        user_group: '게스트',
                        password: '0000',
                        role: 'student',
                        status: 'approved',
                        memo: memoText
                    }]).select().single();

                    if (createError) throw createError;
                    finalUserId = newUser.id;
                }
            }

            const startTimestamp = `${date}T${startTime}:00+09:00`;
            const endTimestamp = `${date}T${endTime}:00+09:00`;

            // Insert CHECKIN and CHECKOUT logs
            const { error: error1 } = await supabase.from('logs').insert({
                user_id: finalUserId,
                type: 'CHECKIN',
                location_id: locationId,
                created_at: startTimestamp
            });
            if (error1) throw error1;

            const { error: error2 } = await supabase.from('logs').insert({
                user_id: finalUserId,
                type: 'CHECKOUT',
                location_id: locationId,
                created_at: endTimestamp
            });
            if (error2) throw error2;

            // Save purpose and remarks if provided
            if (manualEntry.purpose || manualEntry.remarks) {
                await supabase.from('visit_notes').upsert({
                    user_id: finalUserId,
                    visit_date: date,
                    purpose: manualEntry.purpose,
                    remarks: manualEntry.remarks,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id,visit_date' });

                setVisitNotes(prev => ({
                    ...prev,
                    [`${finalUserId}_${date}`]: {
                        ...(prev[`${finalUserId}_${date}`] || {}),
                        purpose: manualEntry.purpose,
                        remarks: manualEntry.remarks
                    }
                }));
            }

            alert('방문 기록이 성공적으로 저장되었습니다.');
            setIsManualModalOpen(false);
            setManualEntry({
                entryType: 'MEMBER',
                userId: '',
                guestName: '',
                guestSchool: '',
                guestBirth: '',
                guestPhone: '',
                date: new Date().toLocaleDateString('en-CA'),
                startTime: '14:00',
                endTime: '16:00',
                locationId: '',
                purpose: '',
                remarks: ''
            });
            setUserSearchText('');
            fetchData();
        } catch (err) {
            console.error(err);
            alert('저장 실패: ' + err.message);
        }
    };


    const handleSaveNote = async (userId, date, field, value) => {
        try {
            const key = `${userId}_${date}`;
            const { error } = await supabase.from('visit_notes').upsert({
                user_id: userId,
                visit_date: date,
                [field]: value,
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id,visit_date' });

            if (error) throw error;

            setVisitNotes(prev => ({
                ...prev,
                [key]: { ...prev[key], [field]: value }
            }));
        } catch (err) {
            console.error(err);
            alert('저장 실패: ' + err.message);
        }
    };

    const handleTimeUpdate = async (summary, field, newTime) => {
        try {
            // 빈 칸이면 무시
            if (!newTime || newTime.trim() === '' || newTime === '-') return;

            // HH:mm 또는 HHmm 형식 검증
            const timeRegex = /^([01]?\d|2[0-3]):?([0-5]\d)$/;
            const match = newTime.match(timeRegex);
            if (!match) {
                alert('올바른 시간 형식이 아닙니다. (예: 14:30 또는 1430)');
                return;
            }
            
            const hours = match[1].padStart(2, '0');
            const mins = match[2];
            const timeStr = `${hours}:${mins}`;

            // timezone +09:00 반영
            const targetTimestamp = `${summary.date}T${timeStr}:00+09:00`;

            if (field === 'startTime') {
                const targetLog = summary.rawLogs.find(l => l.type === 'CHECKIN' || l.type === 'GUEST_ENTRY') || summary.rawLogs[0];
                if (!targetLog) return;
                
                const { error } = await supabase.from('logs').update({ created_at: targetTimestamp }).eq('id', targetLog.id);
                if (error) throw error;

            } else if (field === 'endTime') {
                const targetLog = [...summary.rawLogs].reverse().find(l => l.type === 'CHECKOUT');
                
                if (targetLog) {
                    const { error } = await supabase.from('logs').update({ created_at: targetTimestamp }).eq('id', targetLog.id);
                    if (error) throw error;
                } else {
                    // 퇴실 기록이 없는 경우 새로 생성
                    const lastLog = summary.rawLogs[summary.rawLogs.length - 1];
                    const { error } = await supabase.from('logs').insert({
                        user_id: summary.userId,
                        type: 'CHECKOUT',
                        location_id: lastLog ? lastLog.location_id : null,
                        created_at: targetTimestamp
                    });
                    if (error) throw error;
                }
            }

            // 표 데이터 갱신
            fetchData();
        } catch (err) {
            console.error(err);
            alert('시간 수정 실패: ' + err.message);
        }
    };

    const handleBulkSaveNote = async (summaries, field, value) => {
        try {
            const updates = summaries.map(s => ({
                user_id: s.userId,
                visit_date: s.date,
                [field]: value,
                updated_at: new Date().toISOString()
            }));

            const { error } = await supabase.from('visit_notes').upsert(updates, { onConflict: 'user_id,visit_date' });
            if (error) throw error;

            setVisitNotes(prev => {
                const next = { ...prev };
                summaries.forEach(s => {
                    const key = `${s.userId}_${s.date}`;
                    next[key] = { ...next[key], [field]: value };
                });
                return next;
            });
        } catch (err) {
            console.error(err);
            alert('일괄 저장 실패: ' + err.message);
        }
    };

    const handleNoteKeyDown = (e, rowIdx, field) => {
        if (e.key === 'Enter' || e.key === 'ArrowDown') {
            e.preventDefault();
            const nextRef = inputRefs.current[`${rowIdx + 1}-${field}`];
            if (nextRef) nextRef.focus();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const prevRef = inputRefs.current[`${rowIdx - 1}-${field}`];
            if (prevRef) prevRef.focus();
        } else if ((e.key === 'Delete' || e.key === 'Backspace') && selection.startIdx !== null && selection.endIdx !== null) {
            const min = Math.min(selection.startIdx, selection.endIdx);
            const max = Math.max(selection.startIdx, selection.endIdx);
            if (min !== max) {
                e.preventDefault();
                const selectedRows = filteredVisitSummaries.slice(min, max + 1);
                handleBulkSaveNote(selectedRows, selection.field, '');
            }
        }
    };

    const handleNotePaste = (e, rowIdx, field) => {
        if (selection.startIdx !== null && selection.endIdx !== null) {
            const min = Math.min(selection.startIdx, selection.endIdx);
            const max = Math.max(selection.startIdx, selection.endIdx);
            if (min !== max) {
                e.preventDefault();
                const pastedText = e.clipboardData.getData('text');
                const targetSummaries = (logCategory === 'GUEST') ? filteredGuestSummaries : filteredVisitSummaries;
                const selectedRowsList = targetSummaries.slice(min, max + 1);
                handleBulkSaveNote(selectedRowsList, selection.field, pastedText);
            }
        }
    };

    const handleCellMouseDown = (idx, field) => {
        setSelection({ startIdx: idx, endIdx: idx, field, isDragging: true });
    };

    const handleCellMouseEnter = (idx, field) => {
        if (selection.isDragging && selection.field === field) {
            setSelection(prev => ({ ...prev, endIdx: idx }));
        }
    };

    useEffect(() => {
        const handleGlobalMouseUp = () => {
            setSelection(prev => ({ ...prev, isDragging: false }));
        };
        window.addEventListener('mouseup', handleGlobalMouseUp);
        return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
    }, []);

    const isCellSelected = (idx, field) => {
        if (selection.startIdx === null || selection.endIdx === null || selection.field !== field) return false;
        const min = Math.min(selection.startIdx, selection.endIdx);
        const max = Math.max(selection.startIdx, selection.endIdx);
        return idx >= min && idx <= max;
    };

    // Auto-fetch notes on mount/change
    useEffect(() => {
        const fetchNotes = async () => {
            try {
                const [notesRes, surveysRes, configRes] = await Promise.all([
                    supabase.from('visit_notes').select('*'),
                    supabase.from('checkin_surveys').select('*').order('created_at', { ascending: false }),
                    supabase.from('notices').select('content').eq('category', 'SYSTEM').eq('title', 'CHECKIN_SURVEY_CONFIG').maybeSingle()
                ]);

                const data = notesRes.data || [];
                const surveys = surveysRes.data || [];

                // Default option ID to Label mapping dictionary
                const optionMap = {
                    '1': '🍽️ 당 충전하며 쉬고 싶어요',
                    '2': '🎲 아무 생각 없이 놀고 싶어요',
                    '3': '☕ 누군가와 이야기하고 싶어요',
                    '4': '🙏 기도하거나 예배하고 싶어요',
                    '5': '📚 조용히 집중하고 싶어요',
                    '6': '🤷 아직 잘 모르겠어요'
                };

                // Merge custom admin settings from CHECKIN_SURVEY_CONFIG if present
                if (configRes.data?.content) {
                    try {
                        const parsed = JSON.parse(configRes.data.content);
                        if (Array.isArray(parsed.options)) {
                            parsed.options.forEach(opt => {
                                if (opt.id && opt.label) {
                                    optionMap[String(opt.id)] = opt.emoji ? `${opt.emoji} ${opt.label}` : opt.label;
                                }
                            });
                        }
                    } catch (e) {}
                }

                // Map checkin surveys by `${user_id}_${date}`
                const surveyMap = {};
                surveys.forEach(s => {
                    if (s.user_id && s.created_at) {
                        const kstDate = new Date(s.created_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
                        const key = `${s.user_id}_${kstDate}`;
                        if (!surveyMap[key]) {
                            let textParts = [];
                            if (Array.isArray(s.selections) && s.selections.length > 0) {
                                const formattedSel = s.selections.map(item => {
                                    const strItem = String(item).trim();
                                    return optionMap[strItem] || strItem;
                                }).filter(Boolean);
                                if (formattedSel.length > 0) {
                                    textParts.push(formattedSel.join(', '));
                                }
                            }
                            if (s.text_answer) {
                                const prefix = s.mode === 'QUESTION_QA'
                                    ? '[질문답변]'
                                    : (s.mode === 'CHAT_SHOUTOUT' ? '[한마디]' : '[입력]');
                                textParts.push(`${prefix} ${s.text_answer}`);
                            }
                            if (textParts.length > 0) {
                                surveyMap[key] = textParts.join(' | ');
                            }
                        }
                    }
                });

                const mapped = {};
                for (const n of data) {
                    let corrected = false;
                    let newPurpose = n.purpose || '';
                    let newRemarks = n.remarks || '';

                    const surveyText = surveyMap[`${n.user_id}_${n.visit_date}`];
                    if (surveyText) {
                        if (!newPurpose || newPurpose === '1' || newPurpose === '2' || newPurpose === '3' || newPurpose === '4' || newPurpose === '5' || newPurpose === '6') {
                            newPurpose = surveyText;
                            corrected = true;
                        }
                        if (!newRemarks || newRemarks === '게스트 체크인' || newRemarks === '모바일 QR 체크인') {
                            newRemarks = surveyText;
                            corrected = true;
                        }
                    }

                    if (newPurpose) {
                        const parts = newPurpose.split(',').map(p => {
                            let trimmed = p.trim();
                            if (optionMap[trimmed]) {
                                corrected = true;
                                return optionMap[trimmed];
                            }
                            if (trimmed === '1') return '🍽️ 당 충전하며 쉬고 싶어요';
                            if (trimmed === '2') return '🎲 아무 생각 없이 놀고 싶어요';
                            if (trimmed === '3') return '☕ 누군가와 이야기하고 싶어요';
                            if (trimmed === '4') return '🙏 기도하거나 예배하고 싶어요';
                            if (trimmed === '5') return '📚 조용히 집중하고 싶어요';
                            if (trimmed === '6') return '🤷 아직 잘 모르겠어요';
                            if (trimmed === '교재' || trimmed === '교제') {
                                corrected = true;
                                return '교제 및 휴식';
                            }
                            if (trimmed === '스처썜 만남') {
                                corrected = true;
                                return '스처쌤 만남';
                            }
                            return trimmed;
                        });
                        newPurpose = parts.filter(Boolean).join(', ');
                    }

                    n.purpose = newPurpose;
                    n.remarks = newRemarks;
                    
                    if (corrected) {
                        await supabase.from('visit_notes').update({ purpose: newPurpose, remarks: newRemarks }).eq('id', n.id);
                    }
                    mapped[`${n.user_id}_${n.visit_date}`] = n;
                }

                // Also populate for survey entries that don't have a visit_note record yet
                Object.entries(surveyMap).forEach(([key, surveyText]) => {
                    if (!mapped[key]) {
                        mapped[key] = { purpose: surveyText, remarks: surveyText };
                    }
                });

                setVisitNotes(mapped);
            } catch (err) {
                console.error('Failed to fetch visit notes/surveys:', err);
            }
        };
        fetchNotes();
    }, []);


    const [isLogEditModalOpen, setIsLogEditModalOpen] = useState(false);
    const [editingSessionLog, setEditingSessionLog] = useState(null);

    const handleSaveSessionEdit = async (updatedData) => {
        try {
            const kstOffset = "+09:00";
            
            // 1. Update checkout log
            if (updatedData.endTime && updatedData.endTime !== '-') {
                const targetTimestamp = `${updatedData.date}T${updatedData.endTime}:00${kstOffset}`;
                const targetLog = [...updatedData.rawLogs].reverse().find(l => l.type === 'CHECKOUT');
                if (targetLog) {
                    const { error } = await supabase.from('logs').update({ created_at: targetTimestamp }).eq('id', targetLog.id);
                    if (error) throw error;
                } else {
                    const lastLog = updatedData.rawLogs[updatedData.rawLogs.length - 1];
                    const { error } = await supabase.from('logs').insert({
                        user_id: updatedData.userId,
                        type: 'CHECKOUT',
                        location_id: lastLog ? lastLog.location_id : null,
                        created_at: targetTimestamp
                    });
                    if (error) throw error;
                }
            } else {
                const targetLog = [...updatedData.rawLogs].reverse().find(l => l.type === 'CHECKOUT');
                if (targetLog) {
                    const { error } = await supabase.from('logs').delete().eq('id', targetLog.id);
                    if (error) throw error;
                }
            }

            // 2. Update checkin log
            if (updatedData.startTime) {
                const targetTimestamp = `${updatedData.date}T${updatedData.startTime}:00${kstOffset}`;
                const targetLog = updatedData.rawLogs.find(l => l.type === 'CHECKIN' || l.type === 'GUEST_ENTRY') || updatedData.rawLogs[0];
                if (targetLog) {
                    const { error } = await supabase.from('logs').update({ created_at: targetTimestamp }).eq('id', targetLog.id);
                    if (error) throw error;
                }
            }

            // 3. Update spaces/locations
            if (updatedData.locationIds && updatedData.locationIds.length > 0) {
                const existingLogs = [...updatedData.rawLogs].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
                const nonCheckoutLogs = existingLogs.filter(l => l.type !== 'CHECKOUT');
                
                if (nonCheckoutLogs.length > 0) {
                    const firstLog = nonCheckoutLogs[0];
                    const firstLocId = updatedData.locationIds[0];
                    if (firstLog.location_id !== firstLocId) {
                        const { error } = await supabase.from('logs').update({ location_id: firstLocId }).eq('id', firstLog.id);
                        if (error) throw error;
                    }
                }
                
                const remainingLocIds = updatedData.locationIds.slice(1);
                const existingMoveLogs = nonCheckoutLogs.slice(1);
                
                for (let i = 0; i < Math.min(remainingLocIds.length, existingMoveLogs.length); i++) {
                    const moveLog = existingMoveLogs[i];
                    const locId = remainingLocIds[i];
                    if (moveLog.location_id !== locId) {
                        const { error } = await supabase.from('logs').update({ location_id: locId }).eq('id', moveLog.id);
                        if (error) throw error;
                    }
                }
                
                if (remainingLocIds.length > existingMoveLogs.length) {
                    const baseTime = new Date(nonCheckoutLogs[0].created_at);
                    for (let i = existingMoveLogs.length; i < remainingLocIds.length; i++) {
                        const newTime = new Date(baseTime.getTime() + (i + 1) * 60 * 1000).toISOString();
                        const { error } = await supabase.from('logs').insert({
                            user_id: updatedData.userId,
                            type: 'MOVE',
                            location_id: remainingLocIds[i],
                            created_at: newTime
                        });
                        if (error) throw error;
                    }
                }
                
                if (existingMoveLogs.length > remainingLocIds.length) {
                    const excessLogs = existingMoveLogs.slice(remainingLocIds.length);
                    for (const exLog of excessLogs) {
                        const { error } = await supabase.from('logs').delete().eq('id', exLog.id);
                        if (error) throw error;
                    }
                }
            }

            // 4. Update all other rawLogs in this session to have the correct date!
            // Retrieve fresh logs for this user on this date to ensure all dates match (including newly added moves)
            const { data: freshSessionLogs } = await supabase
                .from('logs')
                .select('*')
                .eq('user_id', updatedData.userId);
            
            // Filter logs that belong to the same session KST date
            const getKSTDateString = (date) => {
                if (!date) return '';
                const d = new Date(date);
                if (isNaN(d.getTime())) return '';
                return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
            };
            const targetDateLogs = (freshSessionLogs || []).filter(l => getKSTDateString(l.created_at) === updatedData.date);

            for (const log of targetDateLogs) {
                const timePart = new Date(log.created_at).toLocaleTimeString('ko-KR', { hour12: false, hour: '2-digit', minute: '2-digit' });
                const newTimestamp = `${updatedData.date}T${timePart}:00${kstOffset}`;
                const { error } = await supabase.from('logs').update({ created_at: newTimestamp }).eq('id', log.id);
                if (error) throw error;
            }

            // 4. Update visit note
            const noteKey = `${updatedData.userId}_${updatedData.date}`;
            const { data: existingNote } = await supabase
                .from('visit_notes')
                .select('*')
                .eq('user_id', updatedData.userId)
                .eq('visit_date', updatedData.date)
                .maybeSingle();

            if (existingNote) {
                const { error } = await supabase
                    .from('visit_notes')
                    .update({ purpose: updatedData.purpose, remarks: updatedData.remarks })
                    .eq('id', existingNote.id);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('visit_notes')
                    .insert({
                        user_id: updatedData.userId,
                        visit_date: updatedData.date,
                        purpose: updatedData.purpose,
                        remarks: updatedData.remarks
                    });
                if (error) throw error;
            }

            setVisitNotes(prev => ({
                ...prev,
                [noteKey]: {
                    ...prev[noteKey],
                    purpose: updatedData.purpose,
                    remarks: updatedData.remarks,
                    user_id: updatedData.userId,
                    visit_date: updatedData.date
                }
            }));

            await fetchData();
            setIsLogEditModalOpen(false);
            setEditingSessionLog(null);
            alert('수정되었습니다.');
        } catch (err) {
            console.error(err);
            alert('수정 실패: ' + err.message);
        }
    };

    return {
        logCategory, setLogCategory,
        selectedLogId, setSelectedLogId,
        visitNotes, setVisitNotes,
        startDate, setStartDate,
        endDate, setEndDate,
        visitFilters, setVisitFilters,
        selectedRows, setSelectedRows,
        isManualModalOpen, setIsManualModalOpen,
        manualEntry, setManualEntry,
        userSearchText, setUserSearchText,
        showUserResults, setShowUserResults,
        inputRefs, selection, setSelection, focusValRef,
        isLogEditModalOpen, setIsLogEditModalOpen,
        editingSessionLog, setEditingSessionLog,
        
        isWithinRange, parseLocationId, extractProgramInfo, formatShortTime, toggleFilter,
        
        visitSummaries, filteredVisitSummaries, filteredGuestSummaries, currentSummaries, filterOptions,
        processedSchoolLogs, filteredSchoolLogs, selectedSchoolLogs, programSummaries, filteredLogs,
        
        handleDeleteLog, handleDeleteProgramSummary, handleBulkDelete, handleSelectiveExport,
        handleSelectAll, handleRowSelect, handleManualSubmit, handleSaveNote, handleBulkSaveNote,
        handleNoteKeyDown, handleNotePaste, handleCellMouseDown, handleCellMouseEnter, isCellSelected, handleTimeUpdate,
        handleSaveSessionEdit
    };
};
