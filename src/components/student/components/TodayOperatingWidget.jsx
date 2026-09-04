import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Clock, DoorOpen, DoorClosed, Calendar } from 'lucide-react';
import { supabase } from '../../../supabaseClient';
import { requestSupabaseFunction } from '../../../utils/supabaseRest';
import UserAvatar from '../../common/UserAvatar';
import { startOfDay, addDays, startOfWeek } from 'date-fns';
import { useDutyRoster } from '../../../hooks/useDutyRoster';
import { useSeoulDate } from '../../../hooks/useSeoulDate';
import { useCurrentTime } from '../../../hooks/useCurrentTime';
import { isDutyDisplayTime } from '../../../utils/dutyRoster';

const TodayOperatingWidget = ({ studentRegion, adminSchedules = [], calendarCategories = [], onStaffClick, tutorialMode = false, tutorialStep = null }) => {
    const todayDate = useSeoulDate();
    const currentTime = useCurrentTime();
    const { roster } = useDutyRoster(todayDate.slice(0, 7), studentRegion !== '강서');
    const haifnAssignment = roster[todayDate];
    const haifnDutyId = haifnAssignment?.duty_status === 'ASSIGNED' ? haifnAssignment.staff_id || '' : '';
    const [operatingHours, setOperatingHours] = useState(null);
    const [staffConfig, setStaffConfig] = useState({ "하이픈": [], "이높플레이스": [] });
    const [presenceStatus, setPresenceStatus] = useState({});
    const [dutyStaff, setDutyStaff] = useState({ "하이픈": "", "이높플레이스": "" });
    const [staffList, setStaffList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busyStaffNotice, setBusyStaffNotice] = useState(null);

    const fetchHoursAndStaffConfig = async () => {
        try {
            // Fetch system configs from notices
            const { data: configs, error: configError } = await supabase
                .from('notices')
                .select('id, title, content')
                .eq('category', 'SYSTEM')
                .in('title', ['OPERATING_HOURS_CONFIG', 'STAFF_PRESENCE_CONFIG', 'STAFF_PRESENCE_STATUS', 'DAILY_DUTY_STAFF']);

            if (!configError && configs) {
                const hoursNotice = configs.find(c => c.title === 'OPERATING_HOURS_CONFIG');
                const presenceConfigNotice = configs.find(c => c.title === 'STAFF_PRESENCE_CONFIG');
                const presenceStatusNotice = configs.find(c => c.title === 'STAFF_PRESENCE_STATUS');
                const dutyNotice = configs.find(c => c.title === 'DAILY_DUTY_STAFF');

                if (hoursNotice?.content) {
                    try {
                        const parsed = JSON.parse(hoursNotice.content);
                        setOperatingHours(parsed);
                    } catch (e) { console.error('Failed to parse operating hours', e); }
                }

                if (presenceConfigNotice?.content) {
                    try {
                        const parsedConfig = JSON.parse(presenceConfigNotice.content);
                        if (parsedConfig && typeof parsedConfig === 'object' && !Array.isArray(parsedConfig)) {
                            setStaffConfig(parsedConfig);
                        } else if (Array.isArray(parsedConfig)) {
                            // Legacy fallback
                            setStaffConfig({
                                "하이픈": parsedConfig,
                                "이높플레이스": parsedConfig
                            });
                        }
                    } catch (e) { console.error('Failed to parse staff config', e); }
                }

                if (presenceStatusNotice?.content) {
                    try {
                        let parsedStatus = JSON.parse(presenceStatusNotice.content) || {};
                        
                        const now = new Date();
                        const todayStr = now.toLocaleDateString('sv');
                        const currentHour = now.getHours();
                        const isAfter6PM = currentHour >= 18;
                        
                        let needsReset = false;
                        
                        if (parsedStatus.date && parsedStatus.date !== todayStr) {
                            needsReset = true;
                        }
                        
                        const hasActive = Object.keys(parsedStatus).some(k => k !== 'date' && parsedStatus[k] === true);
                        if (isAfter6PM && hasActive) {
                            needsReset = true;
                        }
                        
                        if (needsReset) {
                            parsedStatus = { date: todayStr };
                            const payload = {
                                title: 'STAFF_PRESENCE_STATUS',
                                content: JSON.stringify(parsedStatus),
                                category: 'SYSTEM',
                                is_sticky: false,
                                is_recruiting: false
                            };
                            if (presenceStatusNotice.id) {
                                await supabase.from('notices').update(payload).eq('id', presenceStatusNotice.id);
                            } else {
                                await supabase.from('notices').insert([payload]);
                            }
                        }
                        
                        setPresenceStatus(parsedStatus);
                    } catch (e) { console.error('Failed to parse staff status config', e); }
                } else {
                    const now = new Date();
                    const todayStr = now.toLocaleDateString('sv');
                    setPresenceStatus({ date: todayStr });
                }

                if (dutyNotice?.content) {
                    try {
                        const parsedDuty = JSON.parse(dutyNotice.content);
                        setDutyStaff(parsedDuty || { "하이픈": "", "이높플레이스": "" });
                    } catch (e) { console.error('Failed to parse duty config', e); }
                }
            }
        } catch (err) {
            console.error('Failed to fetch operating hours or staff config', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchHoursAndStaffConfig();

        // Realtime subscription to notice updates for config & status
        const subscription = supabase
            .channel('realtime-student-operating')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'notices', filter: 'category=eq.SYSTEM' },
                async (payload) => {
                    const { title, content } = payload.new || {};
                    if (title === 'STAFF_PRESENCE_STATUS') {
                        try {
                            const parsedStatus = JSON.parse(content);
                            setPresenceStatus(parsedStatus || {});
                        } catch (e) { console.error(e); }
                    } else if (title === 'DAILY_DUTY_STAFF') {
                        try {
                            const parsedDuty = JSON.parse(content);
                            setDutyStaff(parsedDuty || { "하이픈": "", "이높플레이스": "" });
                        } catch (e) { console.error(e); }
                    } else if (title === 'STAFF_PRESENCE_CONFIG' || title === 'OPERATING_HOURS_CONFIG') {
                        fetchHoursAndStaffConfig();
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(subscription);
        };
    }, []);

    useEffect(() => {
        // Periodic check every 30 seconds for 6 PM reset and day change
        const interval = setInterval(() => {
            const now = new Date();
            const currentHour = now.getHours();
            
            // Check if day changed or it's after 6 PM with active presence
            const todayStr = now.toLocaleDateString('sv');
            const hasActive = Object.keys(presenceStatus).some(k => k !== 'date' && presenceStatus[k] === true);
            const differentDay = presenceStatus.date && presenceStatus.date !== todayStr;
            
            if (differentDay || (currentHour >= 18 && hasActive)) {
                fetchHoursAndStaffConfig();
            }
        }, 30000);

        return () => clearInterval(interval);
    }, [presenceStatus]);

    useEffect(() => {
        const fetchStaffDetails = async () => {
            let filteredIds = [];
            if (studentRegion === '강동') {
                filteredIds = staffConfig["하이픈"] || [];
            } else if (studentRegion === '강서') {
                filteredIds = staffConfig["이높플레이스"] || [];
            } else {
                filteredIds = Array.from(new Set([
                    ...(staffConfig["하이픈"] || []),
                    ...(staffConfig["이높플레이스"] || [])
                ]));
            }

            const currentSpaceKey = studentRegion === '강서' ? '이높플레이스' : '하이픈';
            const currentDutyId = currentSpaceKey === '하이픈' ? haifnDutyId : dutyStaff[currentSpaceKey];
            
            let fetchIds = [...filteredIds];
            if (currentDutyId && !fetchIds.includes(currentDutyId)) {
                fetchIds.push(currentDutyId);
            }

            if (fetchIds.length > 0) {
                const { data: userData, error: userError } = await supabase
                    .from('users')
                    .select('id, name, profile_image_url, role, user_group, bio')
                    .in('id', fetchIds);
                
                let busyStaffIds = new Set();
                try {
                    const currentTime = new Date().toISOString();
                    const { data: activeChats } = await supabase
                        .from('coffee_chats')
                        .select('staff_id')
                        .eq('status', 'ACCEPTED')
                        .gt('ends_at', currentTime);
                    if (activeChats) {
                        busyStaffIds = new Set(activeChats.map(c => c.staff_id));
                    }
                } catch (e) {
                    console.error('Failed to fetch active coffee chats status:', e);
                }
                // RLS can return an empty array instead of an error for this
                // shared availability signal. The endpoint returns only busy
                // staff IDs, not any student or conversation information.
                try {
                    const busyStatus = await requestSupabaseFunction('dispatch-notification', {
                        action: 'get-busy-coffee-chat-staff',
                        staffIds: fetchIds,
                    });
                    busyStaffIds = new Set(busyStatus?.staffIds || []);
                } catch (e) {
                    console.error('Failed to load secure busy staff status:', e);
                }
                
                if (!userError && userData) {
                    const orderedStaff = fetchIds
                        .map(id => {
                            const u = userData.find(u => u.id === id);
                            if (u) {
                                return {
                                    ...u,
                                    isBusy: busyStaffIds.has(u.id)
                                };
                            }
                            return null;
                        })
                        .filter(Boolean);
                    setStaffList(orderedStaff);
                } else {
                    setStaffList([]);
                }
            } else {
                setStaffList([]);
            }
        };

        fetchStaffDetails();

        const channel = supabase
            .channel('today_operating_widget_coffee_chats_sync')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'coffee_chats' },
                () => {
                    fetchStaffDetails();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [staffConfig, studentRegion, dutyStaff, haifnDutyId]);

    if (loading) return null;

    const today = new Date();
    const dayMap = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayOfWeekStr = dayMap[today.getDay()];
    const currentSpaceKey = studentRegion === '강서' ? '이높플레이스' : '하이픈';
    const activeSpaceHours = operatingHours
        ? (operatingHours[currentSpaceKey] || (operatingHours.monday ? operatingHours : null))
        : null;
    const todayConfig = activeSpaceHours ? activeSpaceHours[dayOfWeekStr] : null;

    // Check if today is closed due to special schedule
    const isTodayClosedBySchedule = adminSchedules.some(sch => {
        const cat = calendarCategories.find(c => c.id === sch.category_id);
        if (cat?.name !== '휴관') return false;

        const start = startOfDay(new Date(sch.start_date));
        const end = startOfDay(new Date(sch.end_date));
        const targetDate = startOfDay(today);

        if (targetDate >= start && targetDate <= end) {
            let closedSpaces = [];
            try {
                const parsed = JSON.parse(sch.content);
                if (parsed && typeof parsed === 'object' && parsed.closed_spaces) {
                    closedSpaces = parsed.closed_spaces;
                }
            } catch (e) { }

            if (studentRegion === '강동') {
                return closedSpaces.includes('HAIFN');
            } else if (studentRegion === '강서') {
                return closedSpaces.includes('ENOUGH_PLACE') || closedSpaces.includes('ENOUGH_PLACE');
            }
            return true;
        }
        return false;
    });

    const isOpen = (todayConfig && !isTodayClosedBySchedule) ? todayConfig.isOpen : false;
    const openTime = todayConfig ? todayConfig.open : '10:00';
    const closeTime = todayConfig ? todayConfig.close : '18:00';

    const now = new Date(currentTime);
    const currentHour = now.getHours();
    const isAfter6PM = currentHour >= 18;
    const isDutyTime = isDutyDisplayTime(now);

    // Undated legacy HAIFN settings are no longer a second duty source: an
    // unassigned day stays empty and OFF never falls back to yesterday's staff.
    const dutyStaffId = currentSpaceKey === '하이픈' ? haifnDutyId : dutyStaff[currentSpaceKey];

    // A dated HAIFN assignment is the source of truth for today's duty and is
    // shown for the whole date. Presence remains a separate, live signal.
    const dutyMember = (() => {
        const member = currentSpaceKey === '하이픈'
            ? haifnAssignment?.duty_status === 'ASSIGNED'
                ? staffList.find(u => u.id === dutyStaffId) || { ...haifnAssignment.staff, id: null, name: haifnAssignment.staff_name }
                : null
            : staffList.find(u => u.id === dutyStaffId);
        if (!member || !isDutyTime) return null;
        return member;
    })();

    // Present (non-duty) staff: after 6 PM all are absent
    const presentStaff = tutorialMode ? [] : (isAfter6PM 
        ? [] 
        : staffList.filter(u => !!presenceStatus[u.id] && (!isDutyTime || u.id !== dutyStaffId)));

    const isCoffeeChatStep = tutorialMode && tutorialStep === 'homeCoffeeChat';
    const tutorialStaff = { id: 'tutorial-staff', name: '스처', user_group: 'STAFF', role: 'staff', isBusy: false };
    const effectiveDutyMember = isCoffeeChatStep && !dutyMember ? tutorialStaff : dutyMember;

    const hasDuty = !!effectiveDutyMember && (!tutorialMode || isCoffeeChatStep);
    const hasPresent = presentStaff.length > 0;
    const hasAnyone = hasDuty || hasPresent;

    const totalStaffCount = (hasDuty ? 1 : 0) + presentStaff.length;

    // Dynamic sizes based on total count (refined for visual balance)
    let dutySize = 'w-9 h-9';
    let dutyTextSize = 'text-xs';
    let dutyLabelSize = 'text-[10.5px]';
    let presentSize = 'w-8 h-8';
    let presentTextSize = 'text-xs';
    let presentLabelSize = 'text-[10.5px]';
    let containerGap = 'gap-3';
    let dividerHeight = 'h-10';

    if (totalStaffCount === 1) {
        dutySize = 'w-12 h-12';
        dutyTextSize = 'text-base';
        dutyLabelSize = 'text-[12px]';
        presentSize = 'w-11 h-11';
        presentTextSize = 'text-sm';
        presentLabelSize = 'text-[12px]';
        containerGap = 'gap-4';
    } else if (totalStaffCount >= 2 && totalStaffCount <= 3) {
        dutySize = 'w-11 h-11';
        dutyTextSize = 'text-sm';
        dutyLabelSize = 'text-[11px]';
        presentSize = 'w-10 h-10';
        presentTextSize = 'text-xs';
        presentLabelSize = 'text-[11px]';
        containerGap = 'gap-3.5';
        dividerHeight = 'h-11';
    }

    // Get current week dates (Sunday to Saturday)
    const sunday = startOfWeek(today, { weekStartsOn: 0 });
    const weekDays = Array.from({ length: 7 }, (_, i) => addDays(sunday, i));

    const dayNameMap = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const koDayMap = ['일', '월', '화', '수', '목', '금', '토'];

    const getDayStatus = (date) => {
        const targetDate = startOfDay(date);
        
        // 1. Check special closures
        const isClosed = adminSchedules.some(sch => {
            const cat = calendarCategories.find(c => c.id === sch.category_id);
            if (cat?.name !== '휴관') return false;

            const start = startOfDay(new Date(sch.start_date));
            const end = startOfDay(new Date(sch.end_date));

            if (targetDate >= start && targetDate <= end) {
                let closedSpaces = [];
                try {
                    const parsed = JSON.parse(sch.content);
                    if (parsed && typeof parsed === 'object' && parsed.closed_spaces) {
                        closedSpaces = parsed.closed_spaces;
                    }
                } catch (e) { }

                if (studentRegion === '강동') {
                    return closedSpaces.includes('HAIFN');
                } else if (studentRegion === '강서') {
                    return closedSpaces.includes('ENOUGH_PLACE');
                }
                return true;
            }
            return false;
        });

        if (isClosed) {
            return { status: 'CLOSED', text: '휴무' };
        }

        // 2. Check regular operating config
        const dayOfWeekStr = dayNameMap[date.getDay()];
        const spaceHours = operatingHours
            ? (operatingHours[currentSpaceKey] || (operatingHours.monday ? operatingHours : null))
            : null;
        const dayConfig = spaceHours ? spaceHours[dayOfWeekStr] : null;

        if (dayConfig && dayConfig.isOpen) {
            return { status: 'OPEN', text: `${dayConfig.open} ~ ${dayConfig.close}` };
        }

        return { status: 'CLOSED', text: '휴무' };
    };

    return (
        <div className="bg-white p-5 rounded-toss-xl shadow-toss-standard flex flex-col transition-all duration-300">
            <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                        <Calendar size={18} />
                    </div>
                    <div>
                        <h3 className="font-bold text-tossGrey900 text-[15px] tracking-tight leading-none">이번 주 오픈 현황</h3>
                        <p className="text-[11px] text-tossGrey500 font-semibold mt-1.5 flex items-center gap-1">
                            {isOpen ? (
                                <>
                                    <Clock size={12} className="text-tossBlue shrink-0" />
                                    <span>오늘 운영 시간: <strong className="text-tossBlue">{openTime} ~ {closeTime}</strong></span>
                                </>
                            ) : (
                                <span className="text-red-500 font-bold">오늘은 휴관일입니다</span>
                            )}
                        </p>
                    </div>
                </div>
                
                {/* Legend (범례) */}
                <div className="flex items-center gap-2.5 text-[10px] font-extrabold text-tossGrey500 select-none">
                    <div className="flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                        <span>오픈</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
                        <span>휴무</span>
                    </div>
                </div>
            </div>

            {/* 7 Days Grid */}
            <div className="grid grid-cols-7 gap-1 sm:gap-2 mt-4">
                {weekDays.map((date, idx) => {
                    const { status } = getDayStatus(date);
                    const isToday = startOfDay(date).getTime() === startOfDay(today).getTime();
                    const dayLabel = koDayMap[date.getDay()];
                    const isOpenDay = status === 'OPEN';
                    
                    let dayCircleClass = "";
                    if (isOpenDay) {
                        dayCircleClass = isToday 
                            ? 'bg-blue-600 text-white font-extrabold ring-4 ring-blue-100' 
                            : 'bg-blue-50 text-blue-600 font-bold';
                    } else {
                        dayCircleClass = isToday 
                            ? 'bg-red-500 text-white font-extrabold ring-4 ring-red-100' 
                            : 'bg-red-50 text-red-500 font-bold';
                    }

                    return (
                        <div 
                            key={idx} 
                            className={`flex flex-col items-center py-3 px-1 rounded-2xl transition-all border ${
                                isToday 
                                    ? 'bg-tossGrey50/50 border-tossGrey200 shadow-sm' 
                                    : 'bg-transparent border-transparent'
                            }`}
                        >
                            <span className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] transition-all ${dayCircleClass}`}>
                                {dayLabel}
                            </span>
                            
                            <span className={`text-[13px] font-black mt-2 ${
                                isToday ? 'text-tossGrey900' : 'text-tossGrey700'
                            }`}>
                                {date.getDate()}
                            </span>
                            
                            {isToday && (
                                <span className="text-[8px] text-tossGrey400 font-black mt-0.5 scale-90">
                                    오늘
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Present/Duty Staff Section */}
            {hasAnyone && (
                <div data-tour={tutorialMode ? 'home-coffee-chat' : undefined} className="-mx-5 px-5 w-[calc(100%+2.5rem)] flex flex-col gap-3 mt-5 pt-5 border-t border-tossGrey100 rounded-xl overflow-hidden animate-fade-in">
                    <div className="flex flex-wrap items-center gap-1">
                        <span className="text-[11px] font-bold text-tossGrey500 tracking-tight">{hasPresent ? '지금 센터에서 만나요!' : '오늘의 당직이에요'}</span>
                        <span className="text-[11px] font-bold text-tossBlue tracking-tight shrink-0">(스처쌤을 클릭하면 대화를 신청할 수 있어요)</span>
                    </div>
                    <div className={`flex items-center ${containerGap} pl-0.5`}>
                        {/* Duty Staff — always first */}
                        {hasDuty && (
                            <div className="flex flex-col items-center justify-center text-center gap-1.5 min-w-[40px] animate-scale-in">
                                <div 
                                    onClick={() => {
                                        if (!effectiveDutyMember.id) return;
                                        if (effectiveDutyMember.isBusy) {
                                            setBusyStaffNotice(effectiveDutyMember.name || '선생님');
                                            return;
                                        }
                                        onStaffClick && onStaffClick(effectiveDutyMember);
                                    }}
                                    className={`relative shrink-0 shadow-toss-subtle rounded-full ring-2 ring-tossBlue/30 transition-transform ${
                                        !effectiveDutyMember.id ? 'cursor-default' : effectiveDutyMember.isBusy ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:scale-105'
                                    }`}
                                >
                                    <UserAvatar user={effectiveDutyMember} size={dutySize} textSize={dutyTextSize} />
                                    {effectiveDutyMember.isBusy ? (
                                        <span className="absolute -top-1 -right-1 bg-amber-500 text-[8px] text-white px-1 py-0.5 rounded-full font-bold leading-none scale-90 border border-white whitespace-nowrap select-none animate-pulse">
                                            대화 중
                                         </span>
                                    ) : (
                                        <span className="absolute -top-1 -right-1 bg-tossBlue text-[8px] text-white px-1 py-0.5 rounded-full font-bold leading-none scale-90 border border-white whitespace-nowrap select-none">
                                            당직
                                         </span>
                                    )}
                                </div>
                                <span className={`font-bold leading-tight text-tossBlue`} style={{ fontSize: dutyLabelSize.replace('text-[', '').replace(']', '') }}>
                                    {effectiveDutyMember.name}
                                </span>
                            </div>
                        )}

                        {/* Vertical Gray Divider */}
                        {hasDuty && hasPresent && (
                            <div className={`w-px ${dividerHeight} bg-tossGrey200 shrink-0`} />
                        )}

                        {/* Present Staff */}
                        {hasPresent && (
                            <div className={`flex flex-wrap ${containerGap} items-center`}>
                                {presentStaff.map(member => (
                                    <div key={member.id} className="flex flex-col items-center justify-center text-center gap-1.5 min-w-[40px] animate-scale-in">
                                        <div 
                                            onClick={() => {
                                                if (member.isBusy) {
                                                    setBusyStaffNotice(member.name || '선생님');
                                                    return;
                                                }
                                                onStaffClick && onStaffClick(member);
                                            }}
                                            className={`relative shrink-0 shadow-toss-subtle rounded-full ring-1 ring-tossGrey200/50 transition-transform ${
                                                member.isBusy ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:scale-105'
                                            }`}
                                        >
                                            <UserAvatar user={member} size={presentSize} textSize={presentTextSize} />
                                            {member.isBusy && (
                                                <span className="absolute -top-1 -right-1 bg-amber-500 text-[8px] text-white px-1 py-0.5 rounded-full font-bold leading-none scale-90 border border-white whitespace-nowrap select-none animate-pulse">
                                                    대화 중
                                                </span>
                                            )}
                                        </div>
                                        <span className={`font-bold leading-tight text-tossGrey600`} style={{ fontSize: presentLabelSize.replace('text-[', '').replace(']', '') }}>
                                            {member.name}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
            {busyStaffNotice && createPortal(
                <div
                    className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]"
                    onClick={() => setBusyStaffNotice(null)}
                >
                    <div
                        className="w-full max-w-sm rounded-3xl border border-tossGrey100 bg-white p-6 text-center shadow-2xl"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-2xl">☕</div>
                        <h4 className="mt-4 text-lg font-black text-tossGrey900">지금은 대화 중이에요</h4>
                        <p className="mt-2 text-sm font-semibold leading-relaxed text-tossGrey600">
                            <strong className="text-tossGrey900">{busyStaffNotice} 쌤</strong>이 현재 커피챗 중입니다.<br />30분 뒤에 다시 신청해 주세요.
                        </p>
                        <button
                            type="button"
                            onClick={() => setBusyStaffNotice(null)}
                            className="mt-5 w-full rounded-xl bg-tossBlue py-3 text-sm font-bold text-white"
                        >
                            확인
                        </button>
                    </div>
                </div>
            , document.body)}
        </div>
    );
};

export default TodayOperatingWidget;

