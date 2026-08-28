import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { X, ClipboardList } from 'lucide-react';
import useParticipantManagement from '../../hooks/useParticipantManagement';
import { exportParticipantsToExcel } from '../../../../../utils/exportUtils';
import useModalClose from '../../../../../hooks/useModalClose';

import AttendanceSection from './AttendanceSection';
import WalkInSection from './WalkInSection';
import PollResultsSection from './PollResultsSection';
import ChallengeStatusSection from './ChallengeStatusSection';
import UserEditModal from '../../../users/modals/UserEditModal';
import { supabase } from '../../../../../supabaseClient';

const getKoreanDayOfWeek = (dateStr) => {
    if (!dateStr) return '';
    try {
        const date = new Date(dateStr);
        const days = ['일', '월', '화', '수', '목', '금', '토'];
        const dayOfWeek = days[date.getDay()];
        const [year, month, day] = dateStr.split('-');
        return `${parseInt(month)}/${parseInt(day)}(${dayOfWeek})`;
    } catch (e) {
        return dateStr;
    }
};

const ParticipantModal = ({ notice, onClose, onRefresh, initialView }) => {
    useModalClose(!!notice, onClose);
    const {
        participantList,
        pollModalResults,
        modalLoading,
        fetchParticipants,
        handleAttendanceToggle,
        handleStaffToggle,
        handleDeleteParticipant,
        handleMarkAllAttended,
        searchQuery,
        setSearchQuery,
        searchResults,
        handleUserSearch,
        showEntranceList,
        setShowEntranceList,
        lastAddedUser,
        addWalkIn,
        addMultipleWalkIns,
        activeSpaceUsers,
        selectedDate,
        setSelectedDate,
        availableDates
    } = useParticipantManagement(notice, onRefresh);
    const [activeView, setActiveView] = useState(() => {
        if (initialView) return initialView;
        if (notice?._initialView) return notice._initialView;
        if (notice?.is_poll) return 'poll';
        if (notice?.is_challenge) return 'challenge';
        return 'attendance';
    });
    const [selectedUserForModal, setSelectedUserForModal] = useState(null);

    useEffect(() => {
        const targetView = initialView || notice?._initialView;
        if (targetView) {
            setActiveView(targetView);
        }
    }, [initialView, notice?._initialView]);

    const handleUserClick = async (user) => {
        if (!user || !user.id) return;
        try {
            const { data, error } = await supabase
                .from('users')
                .select('*')
                .eq('id', user.id)
                .maybeSingle();
            if (data) {
                setSelectedUserForModal(data);
            } else {
                setSelectedUserForModal(user);
            }
        } catch (err) {
            console.error('Failed to fetch full user detail:', err);
            setSelectedUserForModal(user);
        }
    };

    useEffect(() => {
        if (notice) {
            fetchParticipants(notice);
        }
    }, [notice, fetchParticipants]);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [onClose]);

    if (!notice) return null;

    const hasMultipleViews = Boolean(notice.is_poll || notice.is_challenge);

    return (
        <div className="fixed inset-0 z-[150] bg-black/50 flex items-center justify-center p-4 md:p-6 backdrop-blur-sm animate-fade-in dropdown-overlay">
            <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col md:flex-row overflow-hidden animate-fade-in-up" onClick={e => e.stopPropagation()}>
                
                {/* Mobile Header (Hidden on md+) */}
                <div className="md:hidden flex justify-between items-center p-4 border-b border-gray-100 bg-white z-10">
                    <h2 className="font-bold text-lg text-gray-800 tracking-tight truncate pr-4">
                        {notice.title} 
                        {activeView === 'poll' ? ' 투표 결과' : ' 참여자 명단'}
                    </h2>
                    <button onClick={onClose} className="p-2 bg-gray-50 text-gray-400 hover:text-gray-600 rounded-full shrink-0">
                        <X size={20} />
                    </button>
                </div>

                {/* Desktop Sidebar (Hidden on mobile) */}
                <div className="hidden md:flex w-72 bg-gray-50 flex-col border-r border-gray-100">
                    <div className="p-6 border-b border-gray-200/60 bg-white">
                        <div className="flex justify-between items-start mb-4">
                            <h2 className="font-black text-xl text-gray-800 tracking-tight leading-snug">
                                {notice.title}
                            </h2>
                        </div>
                        <span className="inline-block px-3 py-1 bg-blue-100 text-blue-700 rounded-lg text-xs font-bold shadow-sm">
                            {activeView === 'poll' ? '투표/설문' : '참석 여부 관리'}
                        </span>
                    </div>

                    {activeView !== 'poll' && (
                        <div className="p-6 flex-1 text-sm text-gray-500 space-y-4 font-medium overflow-y-auto">
                            {notice.is_recruiting === false ? (
                                availableDates.length <= 1 ? (
                                    <div className="space-y-1 bg-slate-100/70 border border-slate-200/60 p-4 rounded-2xl shadow-sm">
                                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">운영 날짜</span>
                                        <span className="text-sm font-extrabold text-slate-700 block">{getKoreanDayOfWeek(selectedDate)}</span>
                                    </div>
                                ) : (
                                    <div className="space-y-2.5 bg-blue-50/50 border border-blue-100 p-4 rounded-2xl">
                                        <label className="text-[10px] font-black text-blue-600 uppercase tracking-widest block">조회/등록 날짜</label>
                                        <div className="flex flex-col gap-1.5 max-h-[220px] overflow-y-auto pr-1">
                                            {availableDates.map(dateStr => {
                                                const isActive = selectedDate === dateStr;
                                                return (
                                                    <button
                                                        key={dateStr}
                                                        onClick={() => setSelectedDate(dateStr)}
                                                        className={`w-full py-2 px-3 rounded-xl font-extrabold text-xs transition-all text-left border ${
                                                            isActive 
                                                                ? 'bg-blue-600 border-blue-600 text-white shadow-sm shadow-blue-200' 
                                                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                                                        }`}
                                                    >
                                                        {getKoreanDayOfWeek(dateStr)}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        <p className="text-[10px] text-slate-400 font-medium leading-normal">프로그램이 실행된 날짜를 선택하여 참석자 명단을 확인하세요.</p>
                                    </div>
                                )
                            ) : (
                                <>
                                    <p>학생들의 참석 여부를 확인하고<br/>수동으로 출석 체크 할 수 있습니다.</p>
                                    <p>사전 신청하지 않은 학생은<br/>'상단 버튼'을 클릭하여<br/>현장에서 바로 추가 가능합니다.</p>
                                </>
                            )}
                            
                            <button 
                                onClick={() => exportParticipantsToExcel(participantList.JOIN, notice.title, notice.guest_properties?.custom_fields || [])}
                                className="w-full py-3 bg-green-50 hover:bg-green-100 text-green-700 rounded-xl flex justify-center items-center gap-2 font-bold transition mt-4 border border-green-200 shadow-sm"
                            >
                                <ClipboardList size={16} /> 엑셀 다운로드
                            </button>
                        </div>
                    )}
                    
                    <div className="p-6 bg-gray-100 border-t border-gray-200/50 mt-auto">
                        <button 
                            onClick={onClose}
                            className="w-full py-3 bg-white text-gray-600 rounded-xl font-bold hover:bg-gray-50 transition border border-gray-200 shadow-sm"
                        >
                            닫기
                        </button>
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 flex flex-col min-h-0 bg-white relative">
                    {hasMultipleViews && !showEntranceList && (
                        <div className="flex border-b border-gray-100 bg-white sticky top-0 z-10 shrink-0">
                            <button
                                onClick={() => setActiveView('attendance')}
                                className={`flex-1 py-3 text-center text-xs font-black border-b-2 transition-all ${
                                    activeView === 'attendance' 
                                        ? 'border-blue-600 text-blue-600' 
                                        : 'border-transparent text-gray-400 hover:text-gray-600'
                                }`}
                            >
                                명단 및 출석 관리
                            </button>
                            {notice.is_poll && (
                                <button
                                    onClick={() => setActiveView('poll')}
                                    className={`flex-1 py-3 text-center text-xs font-black border-b-2 transition-all ${
                                        activeView === 'poll' 
                                            ? 'border-purple-600 text-purple-600' 
                                            : 'border-transparent text-gray-400 hover:text-gray-600'
                                    }`}
                                >
                                    투표 결과
                                </button>
                            )}
                            {notice.is_challenge && (
                                <button
                                    onClick={() => setActiveView('challenge')}
                                    className={`flex-1 py-3 text-center text-xs font-black border-b-2 transition-all ${
                                        activeView === 'challenge' 
                                            ? 'border-emerald-600 text-emerald-600' 
                                            : 'border-transparent text-gray-400 hover:text-gray-600'
                                    }`}
                                >
                                    미션 인증 현황
                                </button>
                            )}
                        </div>
                    )}

                    {modalLoading ? (
                        <div className="flex-1 flex items-center justify-center p-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                        </div>
                    ) : activeView === 'poll' ? (
                        <PollResultsSection 
                            notice={notice} 
                            pollModalResults={pollModalResults} 
                        />
                    ) : showEntranceList ? (
                        <WalkInSection 
                            searchQuery={searchQuery}
                            handleUserSearch={handleUserSearch}
                            searchResults={searchResults}
                            addWalkIn={addWalkIn}
                            addMultipleWalkIns={addMultipleWalkIns}
                            lastAddedUser={lastAddedUser}
                            activeUsersCount={participantList.JOIN?.filter(u => u.is_attended).length || 0}
                            setShowEntranceList={setShowEntranceList}
                            activeSpaceUsers={activeSpaceUsers}
                            alreadyJoinedUserIds={new Set((participantList.JOIN || []).map(u => u.id))}
                        />
                    ) : (notice.is_challenge && activeView === 'challenge') ? (
                        <ChallengeStatusSection
                            notice={notice}
                            participantList={participantList}
                            onRefresh={() => fetchParticipants(notice)}
                            onUserClick={handleUserClick}
                        />
                    ) : (
                        <AttendanceSection 
                            notice={notice}
                            participantList={participantList}
                            onAttendanceToggle={handleAttendanceToggle}
                            onStaffToggle={handleStaffToggle}
                            onDeleteParticipant={handleDeleteParticipant}
                            onMarkAllAttended={handleMarkAllAttended}
                            showEntranceList={showEntranceList}
                            setShowEntranceList={setShowEntranceList}
                            selectedDate={selectedDate}
                            setSelectedDate={setSelectedDate}
                            onUserClick={handleUserClick}
                        />
                    )}
                </div>
            </div>

            {selectedUserForModal && (
                <UserEditModal
                    editingUser={selectedUserForModal}
                    setEditingUser={setSelectedUserForModal}
                    fetchData={() => {
                        if (notice) fetchParticipants(notice);
                        if (onRefresh) onRefresh();
                    }}
                />
            )}
        </div>
    );
};

ParticipantModal.propTypes = {
    notice: PropTypes.object.isRequired,
    onClose: PropTypes.func.isRequired,
    onRefresh: PropTypes.func
};

export default React.memo(ParticipantModal);
