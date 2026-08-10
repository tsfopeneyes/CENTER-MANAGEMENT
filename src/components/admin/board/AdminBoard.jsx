import React, { useState, useEffect, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import { noticesApi } from '../../../api/noticesApi';
import { supabase } from '../../../supabaseClient';

// Hooks
import useViewPreferences from './hooks/useViewPreferences';
import useNoticeFiltering from './hooks/useNoticeFiltering';
import useNoticeStats from './hooks/useNoticeStats';

// Components
import AdminBoardHeader from './components/header/AdminBoardHeader';
import FilterBar from './components/filters/FilterBar';
import WriteForm from './components/forms/WriteForm';
import NoticeGrid from './components/grid/NoticeGrid';
import ParticipantModal from './components/modals/ParticipantModal';
import NoticeModal from '../../student/NoticeModal';

// Constants
import { CATEGORIES } from './utils/constants';

const isNoticeFutureOrOngoing = (notice) => {
    const today = new Date().toISOString().split('T')[0];
    if (notice.is_recruiting === false) {
        const endDate = notice.program_end_date || notice.program_start_date || notice.program_date;
        if (endDate) {
            const endDateStr = endDate.match(/\d{4}-\d{2}-\d{2}/) ? endDate.match(/\d{4}-\d{2}-\d{2}/)[0] : endDate;
            return endDateStr >= today;
        }
    } else {
        if (notice.program_date) {
            const dateStr = notice.program_date.match(/\d{4}-\d{2}-\d{2}/) ? notice.program_date.match(/\d{4}-\d{2}-\d{2}/)[0] : notice.program_date;
            return dateStr >= today;
        }
    }
    return true;
};

const AdminBoard = ({ mode = CATEGORIES.NOTICE, setActiveMenu }) => {
    const [notices, setNotices] = useState([]);
    const [loading, setLoading] = useState(true);
    
    const [showWriteForm, setShowWriteForm] = useState(false);
    const [editNoticeId, setEditNoticeId] = useState(null);
    const [selectedNoticeForEdit, setSelectedNoticeForEdit] = useState(null);

    const [modalNotice, setModalNotice] = useState(null);
    const [viewNotice, setViewNotice] = useState(null); // For NoticeModal

    const { viewMode, setViewMode } = useViewPreferences();
    const { 
        filters, 
        updateFilter: handleFilterChange, 
        resetFilters, 
        filteredNotices,
        activePrograms,
        completedPrograms
    } = useNoticeFiltering(notices, mode);

    const [programTab, setProgramTab] = useState('ACTIVE');

    const displayNotices = mode === CATEGORIES.PROGRAM 
        ? (programTab === 'ACTIVE' ? activePrograms : completedPrograms)
        : filteredNotices;

    const { noticeStats } = useNoticeStats(filteredNotices, mode);

    const fetchNotices = useCallback(async () => {
        try {
            setLoading(true);
            const dataRes = await noticesApi.fetchAll();
            setNotices(dataRes);
        } catch (error) {
            console.error('Error fetching notices:', error);
            alert('데이터를 불러오는데 실패했습니다.');
        } finally {
            setLoading(false);
        }
    }, [mode]);

    useEffect(() => {
        fetchNotices();

        // Supabase Realtime Subscription for instant cross-device updates
        const channel = supabase
            .channel('admin_notices_realtime')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notices' }, (payload) => {
                if (payload.new) {
                    setNotices(prev => prev.map(n => n.id === payload.new.id ? { ...n, ...payload.new } : n));
                    setViewNotice(prev => (prev && prev.id === payload.new.id) ? { ...prev, ...payload.new } : prev);
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [fetchNotices]);

    // Deep-linking: Open notice from URL query parameter
    useEffect(() => {
        if (notices.length > 0) {
            const params = new URLSearchParams(window.location.search);
            const queryNoticeId = params.get('noticeId');
            if (queryNoticeId) {
                const target = notices.find(n => String(n.id) === String(queryNoticeId));
                if (target) {
                    setViewNotice(target);
                    window.history.replaceState({}, '', window.location.pathname);
                }
            }
        }
    }, [notices]);

    const handleFormSave = useCallback((noticeData) => {
        setEditNoticeId(null);
        setSelectedNoticeForEdit(null);
        setShowWriteForm(false);
        fetchNotices();
    }, [fetchNotices]);

    const handleFormCancel = useCallback(() => {
        setEditNoticeId(null);
        setSelectedNoticeForEdit(null);
        setShowWriteForm(false);
    }, []);

    const handleEditNotice = useCallback((notice) => {
        setEditNoticeId(notice.id);
        setSelectedNoticeForEdit(notice);
        setShowWriteForm(true);
    }, []);

    const handleDeleteNotice = useCallback(async (id) => {
        if (window.confirm('정말 삭제하시겠습니까? 관련 데이터가 모두 삭제됩니다.')) {
            try {
                await noticesApi.delete(id);
                setNotices(prev => prev.filter(n => n.id !== id));
            } catch (error) {
                console.error('Error deleting notice:', error);
                alert('삭제 중 오류가 발생했습니다.');
            }
        }
    }, []);

    const handleProgramStatusChange = useCallback(async (id, newStatus) => {
        try {
            const notice = notices.find(n => n.id === id);
            const currentGp = notice?.guest_properties || {};
            const isEndedVal = newStatus === 'COMPLETED';

            await noticesApi.update(id, { 
                program_status: newStatus,
                guest_properties: {
                    ...currentGp,
                    is_ended: isEndedVal
                }
            });
            setNotices(prev => prev.map(n => n.id === id ? { 
                ...n, 
                program_status: newStatus,
                guest_properties: {
                    ...(n.guest_properties || {}),
                    is_ended: isEndedVal
                }
            } : n));
            
            if (newStatus === 'COMPLETED') {
                if (notice) await noticesApi.finalizeProgramLogs(id, notice);
            } else if (newStatus === 'ACTIVE') {
                 // REVERT: Delete generated PRG logs
                 await noticesApi.revertProgramLogs(id, notice?.title);
            }
        } catch (error) {
            console.error('Error updating status:', error);
            alert('상태 변경에 실패했습니다.');
        }
    }, [setActiveMenu, notices]);

    const handleOpenParticipants = useCallback((notice, initialView) => {
        setModalNotice({ notice, initialView });
    }, []);

    const handleCloseParticipants = useCallback(() => {
        setModalNotice(null);
    }, []);

    const handleViewDetails = useCallback((notice) => {
        setViewNotice(notice);
    }, []);

    return (
        <div className="space-y-4 md:space-y-6 animate-fade-in-up">
            <AdminBoardHeader 
                mode={mode} 
                showWriteForm={showWriteForm} 
                onToggleWriteForm={() => {
                    if (showWriteForm) handleFormCancel();
                    else setShowWriteForm(true);
                }} 
            />
            
            <div className="bg-white rounded-2xl md:rounded-3xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
                {!showWriteForm && (
                    <FilterBar 
                        mode={mode}
                        filters={filters}
                        onFilterChange={handleFilterChange}
                        onResetFilters={resetFilters}
                        viewMode={viewMode}
                        onViewModeChange={setViewMode}
                        resultCount={displayNotices.length}
                    />
                )}
            </div>

            {!showWriteForm && mode === CATEGORIES.PROGRAM && (
                <div className="flex gap-2.5 mb-2 pl-2">
                    <button 
                        onClick={() => setProgramTab('ACTIVE')}
                        className={`px-5 py-2.5 rounded-xl font-black text-sm transition-all duration-300 ${programTab === 'ACTIVE' ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'bg-white text-gray-500 hover:bg-gray-50 border border-gray-100'}`}
                    >
                        진행 중 / 예정 <span className="ml-1.5 opacity-80 text-xs px-1.5 py-0.5 rounded-md bg-white/20">{activePrograms.length}</span>
                    </button>
                    <button 
                        onClick={() => setProgramTab('COMPLETED')}
                        className={`px-5 py-2.5 rounded-xl font-black text-sm transition-all duration-300 ${programTab === 'COMPLETED' ? 'bg-gray-800 text-white shadow-lg shadow-gray-300' : 'bg-white text-gray-500 hover:bg-gray-50 border border-gray-100'}`}
                    >
                        종료 / 취소 <span className="ml-1.5 opacity-80 text-xs px-1.5 py-0.5 rounded-md bg-white/20">{completedPrograms.length}</span>
                    </button>
                </div>
            )}

            <div className="bg-white rounded-[2rem] p-6 md:p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 min-h-[500px] relative">
                {showWriteForm ? (
                    <WriteForm 
                        mode={mode}
                        editNoticeId={editNoticeId}
                        existingNotice={selectedNoticeForEdit}
                        onSave={handleFormSave}
                        onCancel={handleFormCancel}
                    />
                ) : loading ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm z-10 rounded-[2rem]">
                        <div className="w-16 h-16 border-4 border-blue-100 border-t-blue-500 rounded-full animate-spin shadow-lg"></div>
                        <p className="mt-4 font-bold text-gray-500 animate-pulse">데이터를 불러오는 중입니다...</p>
                    </div>
                ) : displayNotices.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-[400px] text-gray-400">
                        <div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center mb-6 shadow-inner">
                            <svg className="w-12 h-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
                            </svg>
                        </div>
                        <p className="text-xl font-black text-gray-700 tracking-tight">등록된 {mode === CATEGORIES.PROGRAM ? '일정이' : '게시글이'} 없습니다</p>
                        <p className="text-sm font-bold text-gray-400 mt-2">상단의 추가 버튼을 눌러 새로운 내용을 작성해보세요</p>
                    </div>
                ) : (
                    <>
                        <NoticeGrid 
                            notices={displayNotices}
                            viewMode={viewMode}
                            mode={mode}
                            noticeStats={noticeStats}
                            onViewDetails={handleViewDetails}
                            onOpenParticipants={handleOpenParticipants}
                            onStatusChange={handleProgramStatusChange}
                            onEdit={handleEditNotice}
                            onDelete={handleDeleteNotice}
                        />
                        <div className="text-center mt-8 mb-4 text-[11px] md:text-xs font-bold text-gray-400">
                            총 {displayNotices.length}개의 {mode === CATEGORIES.PROGRAM ? '일정' : '게시글'}
                        </div>
                    </>
                )}
            </div>

            {/* Modals */}
            {modalNotice && (
                <ParticipantModal 
                    notice={modalNotice.notice || modalNotice}
                    initialView={modalNotice.initialView}
                    onClose={handleCloseParticipants}
                    onRefresh={() => fetchNotices()}
                />
            )}

            {viewNotice && (
                <NoticeModal
                    fromAdmin={true}
                    notice={viewNotice}
                    onClose={() => setViewNotice(null)}
                    user={JSON.parse(localStorage.getItem('admin_user')) || {}}
                    responses={{}}
                    onResponse={() => {}}
                    onUpdate={async (updated, isAlreadySaved = false) => {
                        try {
                            let finalUpdate = { ...updated };
                            if (updated.category === 'PROGRAM' && updated.program_status === 'COMPLETED') {
                                if (isNoticeFutureOrOngoing(updated)) {
                                    finalUpdate.program_status = 'ACTIVE';
                                }
                            }
                            if (!isAlreadySaved) {
                                await noticesApi.update(finalUpdate.id, finalUpdate);
                            }
                            setViewNotice(finalUpdate);
                            fetchNotices();
                        } catch (err) {
                            console.error('onUpdate error:', err);
                            alert('수정 실패: ' + (err.message || err));
                        }
                    }}
                    onDelete={handleDeleteNotice}
                    onViewParticipants={handleOpenParticipants}
                    comments={[]}
                    newComment=""
                    setNewComment={() => {}}
                    onPostComment={() => {}}
                    onDeleteComment={() => {}}
                />
            )}
        </div>
    );
};

AdminBoard.propTypes = {
    mode: PropTypes.string
};

export default React.memo(AdminBoard);
