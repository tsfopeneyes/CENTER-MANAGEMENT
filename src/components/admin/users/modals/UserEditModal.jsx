import React, { useState, useEffect } from 'react';
import { RefreshCw, Trash2, X, Save, School, ShieldAlert, KeyRound, Shield, MessageSquare, Star } from 'lucide-react';
import { supabase } from '../../../../supabaseClient';
import { feedbackApi } from '../../../../api/feedbackApi';
import { extractProgramInfo } from '../../../../utils/textUtils';
import UserAvatar from '../../../common/UserAvatar';
import { aggregateVisitSessions } from '../../../../utils/visitUtils';
import { normalizeSchoolName } from '../../../../utils/userUtils';
import useModalClose from '../../../../hooks/useModalClose';

const isAdministrator = (user) => (
    user?.is_master || user?.role === 'admin' || user?.user_group === '관리자'
);

const UserEditModal = ({
    editingUser, setEditingUser,
    handleDeleteUser, handleResetPassword, handleToggleAdminRole, handleApproveUser,
    userStats, fetchData, setIsMergeModalOpen, setViewerImage, locations
}) => {
    useModalClose(!!editingUser, () => setEditingUser(null));
    const [editFormData, setEditFormData] = useState({
        name: '', school: '', church: '', phone: '', user_group: '재학생', memo: '',
        status: 'approved', guardian_name: '', guardian_phone: '', guardian_relation: '',
        is_leader: false, is_master: false, terms_agreed: false, is_school_church: false
    });
    
    const [activeTab, setActiveTab] = useState('INFO');

    const [participatedPrograms, setParticipatedPrograms] = useState([]);
    const [userFeedbacks, setUserFeedbacks] = useState([]);
    const [programTotalHours, setProgramTotalHours] = useState(0);
    const [isLoadingPrograms, setIsLoadingPrograms] = useState(false);

    const [schoolRegion, setSchoolRegion] = useState('미지정');
    const [visitHistory, setVisitHistory] = useState([]);
    const [stats, setStats] = useState({ monthCount: 0, yearCount: 0, dailyAvgMinutes: 0 });
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [historyFilter, setHistoryFilter] = useState('ALL'); // 'ALL' or 'MONTH'

    const formatDuration = (dur) => {
        if (!dur) return '';
        const cleaned = String(dur).trim();
        if (!isNaN(cleaned)) {
            return `${cleaned}시간`;
        }
        return cleaned;
    };

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                if (isHistoryOpen) {
                    setIsHistoryOpen(false);
                } else {
                    setEditingUser(null);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isHistoryOpen, setEditingUser]);

    const handleBackdropClick = (e) => {
        if (e.target === e.currentTarget) {
            setEditingUser(null);
        }
    };

    const handleHistoryBackdropClick = (e) => {
        if (e.target === e.currentTarget) {
            setIsHistoryOpen(false);
        }
    };

    useEffect(() => {
        const fetchSchoolRegion = async () => {
            if (!editingUser || !editingUser.school) {
                setSchoolRegion('미지정');
                return;
            }
            try {
                const { data, error } = await supabase
                    .from('schools')
                    .select('region')
                    .eq('name', editingUser.school)
                    .maybeSingle();
                if (data && data.region) {
                    setSchoolRegion(data.region);
                } else {
                    setSchoolRegion('미지정');
                }
            } catch (err) {
                console.error(err);
                setSchoolRegion('미지정');
            }
        };
        fetchSchoolRegion();
    }, [editingUser]);

    useEffect(() => {
        const calculateStats = async () => {
            if (!editingUser) return;
            try {
                const { data: rawLogs } = await supabase
                    .from('logs')
                    .select('*')
                    .eq('user_id', editingUser.id);

                const sessions = aggregateVisitSessions(rawLogs || [], [editingUser], locations || []);
                
                const now = new Date();
                const currentYear = now.getFullYear();
                const currentMonth = now.getMonth();

                let monthCount = 0;
                let yearCount = 0;
                let totalDurationMin = 0;

                sessions.forEach(s => {
                    const [y, m, d] = s.date.split('-').map(Number);
                    if (y === currentYear) {
                        yearCount++;
                        if (m === currentMonth + 1) {
                            monthCount++;
                        }
                    }
                    const minVal = parseInt(s.durationMin) || 0;
                    totalDurationMin += minVal;
                });

                const dailyAvgMinutes = sessions.length > 0 ? Math.round(totalDurationMin / sessions.length) : 0;

                setVisitHistory(sessions);
                setStats({ monthCount, yearCount, dailyAvgMinutes });
            } catch (err) {
                console.error(err);
            }
        };
        calculateStats();
    }, [editingUser, locations]);

    useEffect(() => {
        const fetchPrograms = async () => {
            if (!editingUser) {
                setParticipatedPrograms([]);
                setProgramTotalHours(0);
                return;
            }
            setIsLoadingPrograms(true);
            try {
                const { data, error } = await supabase
                    .from('notice_responses')
                    .select(`
                        status,
                        is_attended,
                        notices (
                            id,
                            title,
                            category,
                            program_date,
                            content
                        )
                    `)
                    .eq('user_id', editingUser.id)
                    .eq('status', 'JOIN');

                if (error) throw error;

                let totalMins = 0;
                const progs = [];
                
                (data || []).forEach(r => {
                    const notice = r.notices;
                    if (!notice) return;
                    
                    // Case-insensitive check for prior data
                    if (String(notice.category).toUpperCase() !== 'PROGRAM') return;
                    
                    // Extract duration from content
                    const programInfo = extractProgramInfo(notice.content);
                    const extDuration = programInfo.duration;
                    
                    let mins = 0;
                    if (extDuration) {
                        const durationStr = extDuration.replace(/\s+/g, '');
                        const hourMatch = durationStr.match(/(\d+(?:\.\d+)?)(?:시간|h|hr)/i);
                        const minMatch = durationStr.match(/(\d+(?:\.\d+)?)(?:분|m)/i);
                        
                        if (hourMatch) mins += parseFloat(hourMatch[1]) * 60;
                        if (minMatch) mins += parseFloat(minMatch[1]);
                        
                        if (!hourMatch && !minMatch) {
                            const num = parseFloat(durationStr);
                            if (!isNaN(num)) {
                                mins += (num <= 10 ? num * 60 : num); // Assume <= 10 is hours, else minutes
                            }
                        }
                    }
                    
                    // Only count and show programs that they ACTUALLY attended, 
                    // to match Student "나의 참여 내역" logic:
                    if (r.is_attended) {
                        totalMins += mins;
                        progs.push({
                            ...notice,
                            is_attended: r.is_attended,
                            mins
                        });
                    }
                });

                // Fetch Feedbacks for these notices
                const feedbacks = await feedbackApi.fetchUserFeedbacks(editingUser.id);
                setUserFeedbacks(feedbacks || []);

                // Sort by date descending
                progs.sort((a, b) => new Date(b.program_date || 0) - new Date(a.program_date || 0));

                setParticipatedPrograms(progs);
                setProgramTotalHours(totalMins / 60);
            } catch (err) {
                console.error('Failed to fetch user programs:', err);
            } finally {
                setIsLoadingPrograms(false);
            }
        };

        fetchPrograms();
    }, [editingUser]);


    useEffect(() => {
        if (editingUser) {
            setEditFormData({
                name: editingUser.name || '',
                school: editingUser.school || '',
                church: editingUser.church || '',
                phone: editingUser.phone || editingUser.phone_back4 || '',
                user_group: editingUser.user_group || '재학생',
                memo: editingUser.memo || '',
                status: editingUser.status || 'approved',
                guardian_name: editingUser.guardian_name || '',
                guardian_phone: editingUser.guardian_phone || '',
                guardian_relation: editingUser.guardian_relation || '',
                is_leader: editingUser.is_leader || false,
                is_master: editingUser.is_master || false,
                terms_agreed: editingUser.preferences?.terms_agreed || false,
                is_school_church: editingUser.preferences?.is_school_church || false
            });
        }
    }, [editingUser]);

    const handleSaveUser = async () => {
        if (!editingUser) return;
        try {
            const { error } = await supabase.from('users').update({
                name: editFormData.name,
                school: normalizeSchoolName(editFormData.school),
                church: editFormData.church,
                phone: editFormData.phone,
                user_group: editFormData.user_group,
                memo: editFormData.memo,
                is_leader: editFormData.is_leader,
                is_master: editFormData.is_master,
                preferences: { ...(editingUser.preferences || {}), terms_agreed: editFormData.terms_agreed, is_school_church: editFormData.is_school_church }
            }).eq('id', editingUser.id);
            if (error) throw error;
            alert('회원 정보가 수정되었습니다.');
            setEditingUser(null);
            fetchData();
        } catch (err) { alert('수정 실패'); }
    };

    if (!editingUser) return null;
    const adminUser = JSON.parse(localStorage.getItem('admin_user')) || {};
    const canResetPassword = isAdministrator(adminUser) && !isAdministrator(editingUser);

    return (
        <div onClick={handleBackdropClick} className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white w-full max-w-sm rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
                    <h3 className="font-bold text-gray-800">회원 카드</h3>
                    <div className="flex gap-2">
                        {canResetPassword && (
                            <button onClick={() => handleResetPassword(editingUser)} className="p-2 text-indigo-400 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg transition" title="비밀번호 초기화">
                                <KeyRound size={20} />
                            </button>
                        )}
                        <button onClick={() => handleDeleteUser(editingUser)} className="p-2 text-red-400 hover:bg-red-50 hover:text-red-500 rounded-lg transition"><Trash2 size={20} /></button>
                        <button onClick={() => setEditingUser(null)}><X size={20} className="text-gray-400" /></button>
                    </div>
                </div>
                <div className="flex border-b border-gray-100 bg-white shrink-0 px-2 mt-2">
                    <div className="flex-1 py-3 text-sm font-bold border-b-2 border-blue-500 text-blue-600 text-center">
                        기본 정보
                    </div>
                </div>
                <div className="overflow-y-auto custom-scrollbar flex-1">
                    <div className="p-4 flex flex-col items-center border-b border-gray-50 bg-gray-50/30">
                        {editingUser.profile_image_url ? (
                            <button onClick={() => setViewerImage(editingUser.profile_image_url)} title="프로필 사진 크게 보기" className="active:scale-95 transition-transform focus:outline-none">
                                <UserAvatar user={editingUser} size="w-20 h-20" textSize="text-2xl" />
                            </button>
                        ) : (
                            <UserAvatar user={editingUser} size="w-20 h-20" textSize="text-2xl" />
                        )}
                        <div className="mt-2.5 text-xs font-bold text-gray-500 bg-gray-100 px-3 py-1 rounded-full flex items-center gap-1.5 shadow-xs">
                            <span>최근 웹 접속:</span>
                            <span className="text-blue-600 font-extrabold">{editingUser.lastActiveFormatted || '-'}</span>
                        </div>
                    </div>
                    <div className="p-5 space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-[10px] font-bold text-gray-500 block mb-1">이름</label>
                                <input type="text" value={editFormData.name} onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })} className="w-full p-2.5 bg-white border border-gray-200 rounded-xl outline-none focus:border-blue-500 font-bold text-sm" />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-gray-500 block mb-1">그룹</label>
                                <select value={editFormData.user_group} onChange={(e) => setEditFormData({ ...editFormData, user_group: e.target.value })} className="w-full p-2.5 border border-gray-200 rounded-xl outline-none focus:border-blue-500 bg-white font-bold text-sm">
                                    <option value="청소년">청소년</option><option value="졸업생">졸업생</option><option value="STAFF">STAFF</option><option value="재학생">재학생(구)</option><option value="일반인">일반인(구)</option>
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <div className="flex items-center gap-1.5 mb-1">
                                    <label className="text-[10px] font-bold text-gray-500">학교</label>
                                    {schoolRegion !== '미지정' && (
                                        <span className={`px-1.5 py-0.25 rounded text-[8px] font-black leading-none ${schoolRegion === '강동' ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'}`}>
                                            {schoolRegion}
                                        </span>
                                    )}
                                </div>
                                <input type="text" value={editFormData.school} onChange={(e) => setEditFormData({ ...editFormData, school: e.target.value })} className="w-full p-2.5 border border-gray-200 rounded-xl outline-none focus:border-blue-500 font-bold text-sm" />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-gray-500 block mb-1">출석교회</label>
                                <input type="text" value={editFormData.church} onChange={(e) => setEditFormData({ ...editFormData, church: e.target.value })} className="w-full p-2.5 border border-gray-200 rounded-xl outline-none focus:border-blue-500 font-bold text-sm" />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 divide-y divide-transparent">
                            <div>
                                <label className="text-[10px] font-bold text-gray-500 block mb-1">연락처</label>
                                <input type="text" value={editFormData.phone} onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })} className="w-full p-2.5 border border-gray-200 rounded-xl outline-none focus:border-blue-500 font-bold font-mono text-sm" />
                            </div>
                        </div>



                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div className="flex items-center gap-2 p-2.5 bg-blue-50 border border-blue-100 rounded-xl">
                                <input
                                    type="checkbox"
                                    id="terms_agreed"
                                    checked={editFormData.terms_agreed}
                                    onChange={(e) => setEditFormData({ ...editFormData, terms_agreed: e.target.checked })}
                                    className="w-4 h-4 text-blue-500 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                                />
                                <label htmlFor="terms_agreed" className="text-xs font-bold text-gray-700 cursor-pointer flex items-center gap-1">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                    가입 약관 동의
                                </label>
                            </div>

                            <div className="flex items-center gap-2 p-2.5 bg-emerald-50 border border-emerald-100 rounded-xl">
                                <input
                                    type="checkbox"
                                    id="is_school_church"
                                    checked={editFormData.is_school_church}
                                    onChange={(e) => setEditFormData({ ...editFormData, is_school_church: e.target.checked })}
                                    className="w-4 h-4 text-emerald-500 border-gray-300 rounded focus:ring-emerald-500 cursor-pointer"
                                />
                                <label htmlFor="is_school_church" className="text-xs font-bold text-gray-700 cursor-pointer flex items-center gap-1">
                                    <School size={14} className="text-emerald-500" />
                                    스쿨처치 참여
                                </label>
                            </div>

                            {(editFormData.user_group === '청소년' || editFormData.user_group === '졸업생' || editFormData.user_group === '재학생') && (
                                <div className="flex items-center gap-2 p-2.5 bg-yellow-50 border border-yellow-100 rounded-xl">
                                    <input
                                        type="checkbox"
                                        id="is_leader"
                                        checked={editFormData.is_leader}
                                        onChange={(e) => setEditFormData({ ...editFormData, is_leader: e.target.checked })}
                                        className="w-4 h-4 text-yellow-500 border-gray-300 rounded focus:ring-yellow-500 cursor-pointer"
                                    />
                                    <label htmlFor="is_leader" className="text-xs font-bold text-gray-700 cursor-pointer flex items-center gap-1">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="#FACC15" stroke="#FACC15" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-star"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
                                        리더 분배
                                    </label>
                                </div>
                            )}

                            {editFormData.user_group === 'STAFF' && (adminUser?.is_master || adminUser?.name === 'Rok') && (
                                <div className="flex items-center gap-2 p-2.5 bg-red-50 border border-red-100 rounded-xl">
                                    <input
                                        type="checkbox"
                                        id="is_master"
                                        checked={editFormData.is_master}
                                        onChange={(e) => setEditFormData({ ...editFormData, is_master: e.target.checked })}
                                        className="w-4 h-4 text-red-500 border-gray-300 rounded focus:ring-red-500 cursor-pointer"
                                    />
                                    <label htmlFor="is_master" className="text-xs font-bold text-gray-700 cursor-pointer flex items-center gap-1">
                                        <ShieldAlert size={14} className="text-red-500" />
                                        마스터 권한
                                    </label>
                                </div>
                            )}
                        </div>

                        {editFormData.guardian_name && (
                            <div className="p-4 bg-blue-50 rounded-xl border border-blue-100 space-y-2">
                                <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-1">보호자 정보 (만 14세 미만)</p>
                                <div className="grid grid-cols-2 gap-4 text-xs font-bold">
                                    <div><span className="text-blue-400 block text-[9px]">성함</span>{editFormData.guardian_name}</div>
                                    <div><span className="text-blue-400 block text-[9px]">관계</span>{editFormData.guardian_relation}</div>
                                    <div className="col-span-2"><span className="text-blue-400 block text-[9px]">연락처</span>{editFormData.guardian_phone}</div>
                                </div>
                            </div>
                        )}

                                                {stats && (
                            <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100/60 mt-4">
                                <h4 className="text-[11px] font-black text-blue-500 uppercase tracking-widest mb-3">ACTIVITY STATS</h4>
                                <div className="grid grid-cols-3 gap-2 text-center mb-4">
                                    <button 
                                        type="button"
                                        onClick={() => { setHistoryFilter('MONTH'); setIsHistoryOpen(true); }} 
                                        className="bg-white p-2.5 rounded-xl border border-blue-100 hover:bg-blue-50/30 transition-all cursor-pointer shadow-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                    >
                                        <span className="text-[9px] text-gray-400 block font-bold mb-0.5">이번 달 방문</span>
                                        <span className="font-extrabold text-blue-600 text-sm whitespace-nowrap">{stats.monthCount}회</span>
                                    </button>
                                    <button 
                                        type="button"
                                        onClick={() => { setHistoryFilter('YEAR'); setIsHistoryOpen(true); }} 
                                        className="bg-white p-2.5 rounded-xl border border-blue-100 hover:bg-blue-50/30 transition-all cursor-pointer shadow-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                    >
                                        <span className="text-[9px] text-gray-400 block font-bold mb-0.5">올해 방문</span>
                                        <span className="font-extrabold text-blue-600 text-sm whitespace-nowrap">{stats.yearCount}회</span>
                                    </button>
                                    <div className="bg-white p-2.5 rounded-xl border border-blue-100 shadow-sm flex flex-col justify-center items-center">
                                        <span className="text-[9px] text-gray-400 block font-bold mb-0.5">일 평균 시간</span>
                                        <span className="font-extrabold text-gray-800 text-xs whitespace-nowrap">
                                            {stats.dailyAvgMinutes >= 60 
                                                ? `${Math.floor(stats.dailyAvgMinutes / 60)}h ${stats.dailyAvgMinutes % 60}m`
                                                : `${stats.dailyAvgMinutes}m`
                                            }
                                        </span>
                                    </div>
                                </div>
                                
                                <div className="border-t border-blue-100/50 pt-4 mt-2">
                                    <div className="flex justify-between items-end mb-2">
                                        <h5 className="text-[11px] font-extrabold text-gray-600">참여 프로그램</h5>
                                        <span className="text-[10px] font-bold text-blue-600 bg-blue-100/50 px-2 py-0.5 rounded-full">
                                            총 {programTotalHours > 0 ? (Number.isInteger(programTotalHours) ? programTotalHours : programTotalHours.toFixed(1)) : 0}시간
                                        </span>
                                    </div>
                                    
                                    {isLoadingPrograms ? (
                                        <div className="text-center py-4 text-xs text-blue-400 animate-pulse font-bold">명단 확인중...</div>
                                    ) : participatedPrograms.length > 0 ? (
                                        <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                                            {participatedPrograms.map(p => {
                                                return (
                                                    <div key={p.id} className="bg-white p-2.5 rounded-lg shadow-sm border border-blue-50 flex flex-col gap-2">
                                                        <div className="flex justify-between items-start gap-2">
                                                            <div className="flex-1 min-w-0">
                                                                <div className="text-xs font-bold text-gray-800 truncate" title={p.title}>{p.title}</div>
                                                                <div className="text-[10px] text-gray-400 mt-0.5">
                                                                    {p.program_date ? new Date(p.program_date).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }) : '일정미정'} 
                                                                    {extractProgramInfo(p.content).duration ? ` • ${formatDuration(extractProgramInfo(p.content).duration)}` : ''}
                                                                </div>
                                                            </div>
                                                            <div className="text-[10px] font-bold px-2 py-1 rounded-md shrink-0 bg-emerald-50 text-emerald-600">
                                                                출석완료
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="text-center py-4 text-xs text-gray-400 bg-white/50 rounded-lg">
                                            참여한 프로그램이 없습니다.
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* 메모(관리자용) - 최하단 이동 */}
                        <div className="mt-4">
                            <label className="text-[10px] font-extrabold text-gray-400 block mb-1">메모 (관리자용)</label>
                            <textarea 
                                value={editFormData.memo} 
                                onChange={(e) => setEditFormData({ ...editFormData, memo: e.target.value })} 
                                className="w-full p-3 border border-gray-200 rounded-xl outline-none focus:border-blue-500 resize-none h-16 text-xs font-bold" 
                                placeholder="특이사항 입력" 
                            />
                        </div>
                    </div>
                    <div className="p-6 pt-0 space-y-3 mt-4">
                        {editingUser.status === 'pending' && (
                            <button
                                onClick={async () => {
                                    await handleApproveUser(editingUser);
                                    setEditingUser(null);
                                }}
                                className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition flex items-center justify-center gap-2 shadow-md mb-3"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                회원 승인 완료하기
                            </button>
                        )}
                        {(editingUser.user_group === '게스트' || editingUser.preferences?.is_temporary) && (
                            <button
                                onClick={() => setIsMergeModalOpen(true)}
                                className="w-full py-3 bg-amber-50 text-amber-600 border border-amber-200 rounded-xl font-bold hover:bg-amber-100 transition flex items-center justify-center gap-2 shadow-sm mb-3"
                            >
                                <RefreshCw size={18} /> 계정 연결 확인 안내
                            </button>
                        )}
                        {editingUser.user_group === 'STAFF' && (adminUser?.is_master || adminUser?.name === 'Rok') && (
                            <button
                                onClick={() => handleToggleAdminRole(editingUser)}
                                className={`w-full py-3 border rounded-xl font-bold transition flex items-center justify-center gap-2 shadow-sm mb-3 ${editingUser.role === 'admin' ? 'bg-indigo-50 text-indigo-600 border-indigo-200 hover:bg-indigo-100' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'}`}
                            >
                                <Shield size={18} /> {editingUser.role === 'admin' ? '관리자 권한 해제' : '관리자 권한 부여'}
                            </button>
                        )}
                        <button onClick={handleSaveUser} className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition flex items-center justify-center gap-2 shadow-lg hover:shadow-xl mt-3">
                            <Save size={20} /> 수정사항 저장
                        </button>
                    </div>

                    {/* 방문 이력 상세 모달 overlay */}
                    {isHistoryOpen && (() => {
                        const filteredHistory = historyFilter === 'MONTH' 
                            ? visitHistory.filter(s => {
                                const now = new Date();
                                const [y, m, d] = s.date.split('-').map(Number);
                                return y === now.getFullYear() && m === now.getMonth() + 1;
                              })
                            : visitHistory;

                        return (
                            <div onClick={handleHistoryBackdropClick} className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
                                <div className="bg-white w-full max-w-sm rounded-2xl shadow-xl p-5 max-h-[75vh] flex flex-col">
                                    <div className="flex justify-between items-center pb-3 border-b border-gray-100 shrink-0">
                                        <h4 className="font-extrabold text-gray-800 text-sm">
                                            {editingUser.name}님의 {historyFilter === 'MONTH' ? '이번 달' : '올해'} 방문 기록
                                        </h4>
                                        <button onClick={() => setIsHistoryOpen(false)} className="text-gray-400 hover:text-gray-600 focus:outline-none p-1">
                                            <X size={18} />
                                        </button>
                                    </div>
                                    <div className="overflow-y-auto flex-1 mt-3 space-y-2 pr-1 custom-scrollbar">
                                        {filteredHistory.length === 0 ? (
                                            <div className="text-center text-gray-400 py-8 text-xs font-bold italic">
                                                {historyFilter === 'MONTH' ? '이번 달 ' : ''}방문 기록이 없습니다.
                                            </div>
                                        ) : (
                                            filteredHistory.map((s, idx) => (
                                                <div key={idx} className="p-3 bg-gray-50/50 border border-gray-100 rounded-xl space-y-1 text-xs">
                                                    <div className="flex justify-between font-bold">
                                                        <span className="text-gray-700">{s.date} ({s.dayOfWeek})</span>
                                                        <span className="text-blue-600 font-mono">{s.startTime} ~ {s.endTime}</span>
                                                    </div>
                                                    <div className="text-[10px] text-gray-500 flex justify-between gap-2">
                                                        <span className="truncate">공간: <strong className="text-gray-700">{s.usedSpaces || '-'}</strong></span>
                                                        <span className="shrink-0">이용: <strong className="text-gray-700">{s.durationMin}</strong></span>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })()}
                </div>
            </div>
        </div>
    );
};

export default UserEditModal;
