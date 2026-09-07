import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../../../../supabaseClient';
import { Search, Plus, Trash2, Edit2, Download, Copy, ExternalLink, Calendar, MapPin, CheckCircle, RefreshCw, Eye, MessageCircle, FileText, X, School, Flame, LayoutGrid, LayoutList, CheckCircle2, User, Users, ChevronRight, ChevronLeft, Grid, List, Star, Heart, Columns, Settings, ClipboardList, Save, Clock, Cookie } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSchoolDetail } from '../hooks/useSchoolDetail';
import SchoolDetailSidebar from '../components/SchoolDetailSidebar';
import SchoolLogsView from '../views/SchoolLogsView';
import CallingForestView from '../views/CallingForestView';
import SnackHistoryView from '../views/SnackHistoryView';

import LogFormModal from './LogFormModal';
import LogDetailModal from './LogDetailModal';
import UserEditModal from '../../users/modals/UserEditModal';
import UserMergeModal from '../../users/modals/UserMergeModal';
import ImageOverlayModal from '../../users/modals/ImageOverlayModal';
import useAdminUsers from '../../users/hooks/useAdminUsers';
import LogSelectorModal from '../LogSelectorModal';
const SchoolDetailModal = ({ school, logs, staffList, onClose, isSettingsMode, setIsSettingsMode, onSaveMetadata, onToggleLeader, refreshLogs, refreshDashboardData, allUsers }) => {
    if (!school) return null;

    const hookData = useSchoolDetail({ school, refreshLogs, refreshDashboardData });
        const { 
        activeTab, setActiveTab, 
        selectedLog, setSelectedLog, 
        isLogFormOpen, setIsLogFormOpen,
        selectedStudent, setSelectedStudent,
        selectorState, setSelectorState,
        handleLinkLog,
        isAddTempStudentModalOpen, setIsAddTempStudentModalOpen,
        newTempStudentName, setNewTempStudentName,
        newTempStudentPhone, setNewTempStudentPhone,
        addingTempStudent, handleAddTempStudent
    } = hookData;
    const refreshAllUserData = useCallback(async () => {
        await refreshLogs?.();
        await refreshDashboardData?.();
    }, [refreshLogs, refreshDashboardData]);
    const memberCard = useAdminUsers({ users: allUsers || [], allLogs: [], locations: [], fetchData: refreshAllUserData });
    const setMemberCardUser = useCallback((user) => {
        setSelectedStudent(user);
        memberCard.setEditingUser(user);
    }, [setSelectedStudent, memberCard.setEditingUser]);
    const detailHookData = useMemo(() => ({ ...hookData, setSelectedStudent: setMemberCardUser }), [hookData, setMemberCardUser]);

    return (
        <>
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md flex items-center justify-center p-2 md:p-8"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
                className="bg-white w-full max-w-6xl h-[95vh] rounded-[2.5rem] md:rounded-[3rem] shadow-2xl overflow-hidden flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                {/* Modal Header */}
                <div className="p-5 md:p-8 border-b border-gray-100 bg-gray-50/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 md:gap-0 shrink-0 relative">
                    {/* Mobile Close Button (Absolute Top Right) */}
                    <button onClick={onClose} className="absolute top-4 right-4 p-2 hover:bg-gray-200 rounded-full text-gray-400 transition-colors md:hidden z-10">
                        <X size={20} />
                    </button>

                    <div className="flex items-center gap-3 md:gap-4 min-w-0 pr-10 md:pr-0">
                        <div className="w-10 h-10 md:w-14 md:h-14 bg-indigo-600 rounded-2xl md:rounded-3xl flex items-center justify-center text-white shadow-lg shrink-0">
                            <School size={20} className="md:w-7 md:h-7" />
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-lg md:text-2xl font-black text-gray-800 tracking-tighter truncate">{school.name}</h2>
                            <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-md">Adolescent Member</span>
                                <span className="text-gray-300 hidden md:inline">|</span>
                                <span className="text-[10px] md:text-xs font-bold text-gray-400 truncate hidden sm:inline">{school.students.length}명의 소속 학생</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center w-full md:w-auto gap-2 shrink-0">
                        <div className="flex bg-gray-100/80 p-1 rounded-xl md:rounded-2xl w-full md:w-auto overflow-x-auto no-scrollbar md:mr-4">
                            <button
                                onClick={() => setActiveTab('logs')}
                                className={`flex-1 md:flex-none px-3 py-2 md:px-4 md:py-2 rounded-lg md:rounded-xl text-xs md:text-sm font-black transition-all whitespace-nowrap ${activeTab === 'logs' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                            >
                                학교 현황
                            </button>
                            <button
                                onClick={() => setActiveTab('calling_forest')}
                                className={`flex-1 md:flex-none px-3 py-2 md:px-4 md:py-2 rounded-lg md:rounded-xl text-xs md:text-sm font-black transition-all whitespace-nowrap ${activeTab === 'calling_forest' ? 'bg-white text-green-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                            >
                                콜링포레스트
                            </button>
                            <button
                                onClick={() => setActiveTab('snacks')}
                                className={`flex-1 md:flex-none px-3 py-2 md:px-4 md:py-2 rounded-lg md:rounded-xl text-xs md:text-sm font-black transition-all whitespace-nowrap ${activeTab === 'snacks' ? 'bg-white text-amber-500 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                            >
                                간식
                            </button>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full text-gray-400 transition-colors hidden md:block">
                            <X size={24} />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
                    <SchoolDetailSidebar 
                        school={school}
                        staffList={staffList}
                        isSettingsMode={isSettingsMode}
                        setIsSettingsMode={setIsSettingsMode}
                        onSaveMetadata={onSaveMetadata}
                        onToggleLeader={onToggleLeader}
                        hookData={detailHookData}
                    />

                    <div className="flex-1 overflow-y-auto custom-scrollbar p-5 md:p-8 bg-white flex flex-col gap-6 md:gap-8">
                        {activeTab === 'logs' && <SchoolLogsView school={school} logs={logs} staffList={staffList} allUsers={allUsers} hookData={detailHookData} />}
                        {activeTab === 'calling_forest' && <CallingForestView school={school} logs={logs} hookData={detailHookData} />}
                        {activeTab === 'snacks' && <SnackHistoryView onSaveMetadata={onSaveMetadata} hookData={detailHookData} />}
                    </div>
                </div>
            </motion.div>
        </motion.div>

        {/* Log Entry Form Modal */}
        <AnimatePresence>
                    {isLogFormOpen && (
                        <LogFormModal
                            school={school}

                            staffList={staffList}
                            onClose={() => setIsLogFormOpen(false)}
                            onSave={async (formData) => {
                                try {
                                    let schoolId = school.metadata?.id;
                                    if (!schoolId) {
                                        // Auto-create school entry
                                        const { data: newSchool, error: schoolErr } = await supabase
                                            .from('schools')
                                            .insert([{ name: school.name }])
                                            .select('id')
                                            .single();
                                        if (schoolErr) throw schoolErr;
                                        schoolId = newSchool.id;
                                    }

                                    const { error } = await supabase.from('school_logs').insert([{
                                        school_id: schoolId,
                                        author_id: (JSON.parse(localStorage.getItem('admin_user')) || JSON.parse(localStorage.getItem('user')))?.id,
                                        ...formData
                                    }]);
                                    if (error) throw error;
                                    await refreshLogs();
                                    if (refreshDashboardData) await refreshDashboardData();
                                    setIsLogFormOpen(false);
                                } catch (err) {
                                    alert('사역일지 저장 실패: ' + err.message);
                                }
                            }}
                        />
                    )}
                </AnimatePresence>

                {/* Log Detail Modal - Feed Version */}
                <AnimatePresence>
                    {selectedLog && (
                        <LogDetailModal
                            logs={logs}
                            initialLogId={selectedLog.id}
                            school={school}
                            staffList={staffList}
                            allUsers={allUsers}
                            onClose={() => setSelectedLog(null)}
                            onRefresh={async () => {
                                await refreshLogs();
                                if (refreshDashboardData) await refreshDashboardData();
                            }}
                            onDelete={async (id) => {
                                if (confirm('정말 삭제하시겠습니까?')) {
                                    try {
                                        await supabase.from('school_logs').delete().eq('id', id);
                                        await refreshLogs();
                                        if (refreshDashboardData) await refreshDashboardData();
                                        setSelectedLog(null);
                                    } catch (err) { alert('삭제 실패'); }
                                }
                            }}
                        />
                    )}
                </AnimatePresence>

                {/* Student Detail Modal */}
                <AnimatePresence>
                    {selectedStudent && (
                        <UserEditModal
                            editingUser={selectedStudent}
                            setEditingUser={setMemberCardUser}
                            handleDeleteUser={async (user) => {
                                if (await memberCard.handleDeleteUser(user)) setMemberCardUser(null);
                            }}
                            handleResetPassword={memberCard.handleResetPassword}
                            handleToggleAdminRole={memberCard.handleToggleAdminRole}
                            handleApproveUser={memberCard.handleApproveUser}
                            userStats={null}
                            fetchData={refreshAllUserData}
                            setIsMergeModalOpen={memberCard.setIsMergeModalOpen}
                            setViewerImage={memberCard.setViewerImage}
                            locations={[]}
                        />
                    )}
                </AnimatePresence>
                <UserMergeModal
                    isMergeModalOpen={memberCard.isMergeModalOpen}
                    setIsMergeModalOpen={memberCard.setIsMergeModalOpen}
                    editingUser={selectedStudent}
                    setEditingUser={setMemberCardUser}
                    users={allUsers || []}
                    fetchData={refreshAllUserData}
                />
                <ImageOverlayModal viewerImage={memberCard.viewerImage} setViewerImage={memberCard.setViewerImage} />

                {/* Log Selector Modal for Calling Forest */}
                <AnimatePresence>
                    {selectorState.isOpen && (
                        <LogSelectorModal
                            student={selectorState.student}
                            schoolLogs={logs}
                            onClose={() => setSelectorState({ isOpen: false, student: null, week: null })}
                            onSelect={handleLinkLog}
                        />
                    )}
                </AnimatePresence>

                {/* Add Temporary Student Modal */}
                <AnimatePresence>
                    {isAddTempStudentModalOpen && (
                        <div
                            className="fixed inset-0 z-[110] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
                            onClick={() => setIsAddTempStudentModalOpen(false)}
                        >
                            <motion.div
                                initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
                                onClick={e => e.stopPropagation()}
                                className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden"
                            >
                                <div className="p-4 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
                                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                        <Plus size={18} className="text-amber-500" /> 임시 학생 추가
                                    </h3>
                                    <button onClick={() => setIsAddTempStudentModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
                                </div>
                                <div className="p-6 space-y-4">
                                    <div className="bg-blue-50 text-blue-800 p-3 rounded-xl text-xs font-bold leading-relaxed mb-4">
                                        아직 가입하지 않은 청소년을 임시로 학생 목록에 추가하여 일지 기록 등의 사역 관리를 할 수 있습니다. 
                                        추후 청소년이 앱에 가입하면 계정을 연동시킬 수 있습니다.
                                    </div>
                                    <div className="flex gap-3">
                                        <div className="space-y-1.5 flex-[4]">
                                            <label className="text-xs font-bold text-gray-600">학생 이름</label>
                                            <input
                                                type="text"
                                                value={newTempStudentName}
                                                onChange={(e) => setNewTempStudentName(e.target.value)}
                                                placeholder="이름 입력"
                                                maxLength={5}
                                                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl font-bold outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
                                                autoFocus
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') handleAddTempStudent();
                                                }}
                                            />
                                        </div>
                                        <div className="space-y-1.5 flex-[6]">
                                            <label className="text-xs font-bold text-gray-600">연락처 (선택)</label>
                                            <input
                                                type="text"
                                                value={newTempStudentPhone}
                                                onChange={(e) => setNewTempStudentPhone(e.target.value)}
                                                placeholder="예: 01012345678"
                                                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl font-bold outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') handleAddTempStudent();
                                                }}
                                            />
                                        </div>
                                    </div>
                                    <button
                                        onClick={handleAddTempStudent}
                                        disabled={!newTempStudentName.trim() || addingTempStudent}
                                        className="w-full mt-4 py-3 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                        {addingTempStudent ? <RefreshCw className="animate-spin" size={16} /> : <Save size={16} />} 임시 학생 등록하기
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>
        </>
    );
};

export default SchoolDetailModal;
