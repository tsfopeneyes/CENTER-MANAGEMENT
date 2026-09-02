import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { supabase } from '../../../../supabaseClient';
import UserAvatar from '../../../common/UserAvatar';
import { Loader2, Settings, X, UserCheck } from 'lucide-react';
import StaffPresenceSettings from '../../settings/components/StaffPresenceSettings';
import CheckinSurveySettings from '../../settings/components/CheckinSurveySettings';
import AdminPageHeader from '../../common/AdminPageHeader';

const StaffPresenceToggleCard = ({ users }) => {
    const [staffConfig, setStaffConfig] = useState({ "하이픈": [], "이높플레이스": [] });
    const [presenceStatus, setPresenceStatus] = useState({});
    const [dutyStaff, setDutyStaff] = useState({ "하이픈": "", "이높플레이스": "" });
    const [loading, setLoading] = useState(true);
    const [updatingId, setUpdatingId] = useState(null);
    
    // Settings modal state
    const [showSettingsModal, setShowSettingsModal] = useState(false);
    const [isSavingSettings, setIsSavingSettings] = useState(false);

    // Checkin Survey config state
    const [checkinSurveyConfig, setCheckinSurveyConfig] = useState(null);
    const [isSavingSurvey, setIsSavingSurvey] = useState(false);

    const fetchConfigAndStatus = async () => {
        try {
            const { data, error } = await supabase
                .from('notices')
                .select('id, title, content')
                .eq('category', 'SYSTEM')
                .in('title', ['STAFF_PRESENCE_CONFIG', 'STAFF_PRESENCE_STATUS', 'DAILY_DUTY_STAFF', 'CHECKIN_SURVEY_CONFIG']);

            if (!error && data) {
                const configNotice = data.find(n => n.title === 'STAFF_PRESENCE_CONFIG');
                const statusNotice = data.find(n => n.title === 'STAFF_PRESENCE_STATUS');
                const dutyNotice = data.find(n => n.title === 'DAILY_DUTY_STAFF');
                const surveyNotice = data.find(n => n.title === 'CHECKIN_SURVEY_CONFIG');

                if (surveyNotice?.content) {
                    try {
                        setCheckinSurveyConfig(JSON.parse(surveyNotice.content));
                    } catch (e) { console.error('Failed to parse survey config', e); }
                }

                if (configNotice?.content) {
                    try {
                        const parsed = JSON.parse(configNotice.content);
                        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                            setStaffConfig(parsed);
                        } else if (Array.isArray(parsed)) {
                            setStaffConfig({
                                "하이픈": parsed,
                                "이높플레이스": parsed
                            });
                        }
                    } catch (e) { console.error('Failed to parse staff config', e); }
                }

                if (statusNotice?.content) {
                    try {
                        let parsedStatus = JSON.parse(statusNotice.content) || {};
                        
                        const now = new Date();
                        const todayStr = now.toLocaleDateString('sv');
                        const currentHour = now.getHours();
                        const isAfter6PM = currentHour >= 18;
                        
                        let needsReset = false;
                        
                        if (parsedStatus.date && parsedStatus.date !== todayStr) {
                            needsReset = true;
                        }
                        
                        if (needsReset || isAfter6PM) {
                            const resetStatus = { date: todayStr };
                            Object.keys(parsedStatus).forEach(key => {
                                if (key !== 'date') {
                                    resetStatus[key] = false;
                                }
                            });
                            setPresenceStatus(resetStatus);
                            
                            // Silently update the database to reset values
                            await supabase
                                .from('notices')
                                .update({ content: JSON.stringify(resetStatus) })
                                .eq('id', statusNotice.id);
                        } else {
                            setPresenceStatus(parsedStatus);
                        }
                    } catch (e) { console.error('Failed to parse staff status', e); }
                } else {
                    const now = new Date();
                    const todayStr = now.toLocaleDateString('sv');
                    setPresenceStatus({ date: todayStr });
                }

                if (dutyNotice?.content) {
                    try {
                        const parsedDuty = JSON.parse(dutyNotice.content);
                        if (parsedDuty && typeof parsedDuty === 'object') {
                            setDutyStaff(parsedDuty);
                        }
                    } catch (e) { console.error('Failed to parse duty staff', e); }
                }
            }
        } catch (error) {
            console.error('Failed to fetch config and status:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchConfigAndStatus();

        // Subscribe to changes in notices table for configs
        const subscription = supabase
            .channel('realtime-staff-presence')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'notices', filter: 'category=eq.SYSTEM' },
                (payload) => {
                    const { title, content } = payload.new || {};
                    if (title === 'STAFF_PRESENCE_CONFIG') {
                        try {
                            const parsed = JSON.parse(content);
                            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                                setStaffConfig(parsed);
                            } else if (Array.isArray(parsed)) {
                                setStaffConfig({
                                    "하이픈": parsed,
                                    "이높플레이스": parsed
                                });
                            }
                        } catch (e) { console.error(e); }
                    } else if (title === 'STAFF_PRESENCE_STATUS') {
                        try {
                            const parsedStatus = JSON.parse(content);
                            setPresenceStatus(parsedStatus || {});
                        } catch (e) { console.error(e); }
                    } else if (title === 'DAILY_DUTY_STAFF') {
                        try {
                            const parsedDuty = JSON.parse(content);
                            setDutyStaff(parsedDuty || { "하이픈": "", "이높플레이스": "" });
                        } catch (e) { console.error(e); }
                    } else if (title === 'CHECKIN_SURVEY_CONFIG') {
                        try {
                            const parsedSurvey = JSON.parse(content);
                            setCheckinSurveyConfig(parsedSurvey);
                        } catch (e) { console.error(e); }
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
                fetchConfigAndStatus();
            }
        }, 30000);

        return () => clearInterval(interval);
    }, [presenceStatus]);

    const handleTogglePresence = async (userId) => {
        setUpdatingId(userId);
        const currentPresent = !!presenceStatus[userId];
        
        const now = new Date();
        const todayStr = now.toLocaleDateString('sv');
        
        const nextStatus = {
            ...presenceStatus,
            date: todayStr,
            [userId]: !currentPresent
        };

        try {
            // Find existing record
            const { data: existing } = await supabase
                .from('notices')
                .select('id')
                .eq('category', 'SYSTEM')
                .eq('title', 'STAFF_PRESENCE_STATUS')
                .maybeSingle();

            const payload = {
                title: 'STAFF_PRESENCE_STATUS',
                content: JSON.stringify(nextStatus),
                category: 'SYSTEM',
                is_sticky: false,
                is_recruiting: false
            };

            if (existing) {
                await supabase.from('notices').update(payload).eq('id', existing.id);
            } else {
                await supabase.from('notices').insert([payload]);
            }
            setPresenceStatus(nextStatus);
        } catch (err) {
            console.error('Failed to update staff status', err);
            alert('상태 업데이트 실패');
        } finally {
            setUpdatingId(null);
        }
    };

    const handleSetDutyStaff = async (spaceKey, userId) => {
        // HAIFN is edited only through the shared date-specific roster below.
        if (spaceKey !== '이높플레이스') return;
        const nextDuty = {
            ...dutyStaff,
            [spaceKey]: userId
        };

        try {
            const { data: existing } = await supabase
                .from('notices')
                .select('id')
                .eq('category', 'SYSTEM')
                .eq('title', 'DAILY_DUTY_STAFF')
                .maybeSingle();

            const payload = {
                title: 'DAILY_DUTY_STAFF',
                content: JSON.stringify(nextDuty),
                category: 'SYSTEM',
                is_sticky: false,
                is_recruiting: false
            };

            if (existing) {
                await supabase.from('notices').update(payload).eq('id', existing.id);
            } else {
                await supabase.from('notices').insert([payload]);
            }
            setDutyStaff(nextDuty);
        } catch (err) {
            console.error('Failed to update duty staff', err);
            alert('당직 정보 업데이트 실패');
        }
    };

    const handleSaveSettingsConfig = async (newConfig) => {
        setIsSavingSettings(true);
        try {
            const { data: existing } = await supabase
                .from('notices')
                .select('id')
                .eq('category', 'SYSTEM')
                .eq('title', 'STAFF_PRESENCE_CONFIG')
                .maybeSingle();

            const payload = {
                title: 'STAFF_PRESENCE_CONFIG',
                content: JSON.stringify(newConfig),
                category: 'SYSTEM',
                is_sticky: false,
                is_recruiting: false
            };

            if (existing) {
                await supabase.from('notices').update(payload).eq('id', existing.id);
            } else {
                await supabase.from('notices').insert([payload]);
            }
            setStaffConfig(newConfig);
            alert('스탭 설정이 저장되었습니다.');
            setShowSettingsModal(false);
        } catch (err) {
            console.error('Failed to save staff config', err);
            alert('설정 저장 실패');
        } finally {
            setIsSavingSettings(false);
        }
    };

    const handleSaveCheckinSurveyConfig = async (newConfig) => {
        setIsSavingSurvey(true);
        try {
            const { data: existing } = await supabase
                .from('notices')
                .select('id')
                .eq('category', 'SYSTEM')
                .eq('title', 'CHECKIN_SURVEY_CONFIG')
                .maybeSingle();

            const payload = {
                title: 'CHECKIN_SURVEY_CONFIG',
                content: JSON.stringify(newConfig),
                category: 'SYSTEM',
                is_sticky: false,
                is_recruiting: false
            };

            if (existing) {
                await supabase.from('notices').update(payload).eq('id', existing.id);
            } else {
                await supabase.from('notices').insert([payload]);
            }
            setCheckinSurveyConfig(newConfig);
            alert('설문 설정이 저장되었습니다.');
        } catch (err) {
            console.error('Failed to save survey config', err);
            alert('설문 저장 실패');
        } finally {
            setIsSavingSurvey(false);
        }
    };

    // Filter candidate details from the full users prop
    const allStaffIds = Array.from(new Set([
        ...(staffConfig["하이픈"] || []),
        ...(staffConfig["이높플레이스"] || [])
    ]));

    const staffMembers = allStaffIds
        .map(id => users.find(u => u.id === id))
        .filter(Boolean);

    const haifnStaff = staffMembers.filter(member => staffConfig["하이픈"]?.includes(member.id));
    const enough_placeStaff = staffMembers.filter(member => staffConfig["이높플레이스"]?.includes(member.id));

    // Duty candidates: only admin users, excluding those configured as staff in the other space
    const enough_placeDutyCandidates = users
        .filter(u => u.role === 'admin' && !staffConfig["하이픈"]?.includes(u.id))
        .sort((a, b) => a.name.localeCompare(b.name, 'ko'));

    if (loading) {
        return (
            <div className="p-6 bg-white rounded-3xl border border-gray-100 shadow-sm flex items-center justify-center py-10">
                <Loader2 className="animate-spin text-blue-500 mr-2" size={20} />
                <span className="text-sm font-semibold text-slate-500">스탭 현황 로드 중...</span>
            </div>
        );
    }

    const renderStaffCard = (member) => {
        const isPresent = !!presenceStatus[member.id];
        const isUpdating = updatingId === member.id;

        return (
            <button
                type="button"
                key={member.id}
                disabled={isUpdating}
                onClick={() => handleTogglePresence(member.id)}
                className={`p-4 rounded-2xl border transition-all duration-200 flex items-center justify-between gap-3 text-left w-full focus:outline-none ${
                    isPresent
                        ? 'bg-emerald-50/20 border-emerald-100 shadow-[0_2px_8px_rgba(16,185,129,0.01)]'
                        : 'bg-slate-50/30 border-slate-200/60 hover:bg-slate-50'
                }`}
            >
                <div className="flex items-center gap-3 min-w-0">
                    <UserAvatar user={member} size="w-10 h-10" />
                    <div className="min-w-0 flex flex-col items-start">
                        <span className="text-sm md:text-base font-bold text-slate-800 truncate leading-tight">{member.name}</span>
                        <span className={`text-xs font-bold mt-1 leading-none ${
                            isUpdating ? 'text-slate-400' : (isPresent ? 'text-emerald-600' : 'text-slate-400')
                        }`}>
                            {isUpdating ? '변경 중...' : (isPresent ? '근무 중' : '부재 중')}
                        </span>
                    </div>
                </div>

                {/* iOS/Toss-style Toggle Switch */}
                <div className={`w-10 h-6 rounded-full p-0.5 transition-colors duration-200 flex items-center shadow-inner shrink-0 ${
                    isUpdating ? 'bg-slate-200' : (isPresent ? 'bg-emerald-500' : 'bg-red-500')
                }`}>
                    <div className={`w-5 h-5 rounded-full bg-white shadow transform transition-transform duration-200 ease-in-out flex items-center justify-center ${
                        isPresent ? 'translate-x-4' : 'translate-x-0'
                    }`}>
                        {isUpdating && (
                            <Loader2 className="animate-spin text-slate-400" size={10} />
                        )}
                    </div>
                </div>
            </button>
        );
    };

    const actions = (
        <button
            type="button"
            onClick={() => setShowSettingsModal(true)}
            className="flex items-center gap-2 px-5 py-3.5 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-2xl border border-slate-200 text-sm font-bold transition-all shadow-sm focus:outline-none shrink-0"
        >
            <Settings size={16} className="text-slate-500" />
            스탭 설정
        </button>
    );

    return (
        <div className="flex flex-col gap-6">
            <AdminPageHeader
                title="근무 현황"
                subtitle="실시간 스탭 근무 현황 설정 및 오늘의 당직자 관리"
                icon={<UserCheck />}
                actions={actions}
            />

            <div className="p-6 md:p-8 bg-white rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-8">
                <div className="space-y-8">
                    {/* Haifn space staff */}
                    {haifnStaff.length > 0 && (
                        <div className="flex flex-col gap-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-1">
                                <h4 className="text-base md:text-lg font-black text-blue-600 flex items-center gap-1.5">
                                    <span className="w-1.5 h-3.5 bg-blue-500 rounded-full"></span>
                                    하이픈 공간 스탭 ({haifnStaff.length}명)
                                </h4>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                {haifnStaff.map(member => renderStaffCard(member))}
                            </div>
                        </div>
                    )}

                    {/* Inope space staff */}
                    {enough_placeStaff.length > 0 && (
                        <div className="flex flex-col gap-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-1">
                                <h4 className="text-base md:text-lg font-black text-purple-600 flex items-center gap-1.5">
                                    <span className="w-1.5 h-3.5 bg-purple-500 rounded-full"></span>
                                    이높플레이스 공간 스탭 ({enough_placeStaff.length}명)
                                </h4>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-slate-500">오늘의 당직:</span>
                                    <select 
                                        value={dutyStaff["이높플레이스"] || ''} 
                                        onChange={(e) => handleSetDutyStaff("이높플레이스", e.target.value)}
                                        className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-700 outline-none focus:border-purple-500 transition-colors"
                                    >
                                        <option value="">선택 없음</option>
                                        {enough_placeDutyCandidates.map(member => (
                                            <option key={member.id} value={member.id}>{member.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                {enough_placeStaff.map(member => renderStaffCard(member))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Config Settings Modal Popover */}
            {showSettingsModal && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-slate-50 w-full max-w-2xl rounded-2xl md:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
                        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-white shrink-0">
                            <div className="flex items-center gap-2">
                                <span className="w-1.5 h-4 bg-blue-600 rounded-full"></span>
                                <h3 className="font-bold text-slate-800 text-sm">스탭 설정 관리</h3>
                            </div>
                            <button 
                                onClick={() => setShowSettingsModal(false)}
                                className="p-1 rounded-full hover:bg-slate-100 transition-colors"
                            >
                                <X size={18} className="text-gray-400 hover:text-gray-600" />
                            </button>
                        </div>
                        <div className="overflow-y-auto p-4 flex-1 space-y-6">
                            <StaffPresenceSettings
                                users={users}
                                selectedStaffConfig={staffConfig}
                                onSave={handleSaveSettingsConfig}
                                isSaving={isSavingSettings}
                            />
                            <CheckinSurveySettings
                                checkinSurveyConfig={checkinSurveyConfig}
                                onSave={handleSaveCheckinSurveyConfig}
                                isSaving={isSavingSurvey}
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

StaffPresenceToggleCard.propTypes = {
    users: PropTypes.array.isRequired
};

export default StaffPresenceToggleCard;
