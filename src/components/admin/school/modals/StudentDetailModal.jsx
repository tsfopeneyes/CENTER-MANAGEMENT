import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Plus, Trash2, Edit2, Download, Copy, ExternalLink, Calendar, MapPin, CheckCircle, RefreshCw, Eye, MessageCircle, FileText, X, School, Flame, LayoutGrid, LayoutList, CheckCircle2, User, Users, ChevronRight, ChevronLeft, Grid, List, Star, Heart, Columns, Settings, ClipboardList, Save, Clock, Cookie } from 'lucide-react';
import { supabase } from '../../../../supabaseClient';
import { mergeUserStats } from '../../../../api/userMergeApi';

const StudentDetailModal = ({ student, onClose, onSave, onMergeComplete, allUsers }) => {
    const [memo, setMemo] = useState(student.memo || '');
    const [isLeader, setIsLeader] = useState(student.is_leader || false);

    const isTemporary = student.preferences?.is_temporary;
    const [phone, setPhone] = useState(student.phone === '미가입' ? '' : (student.phone || ''));
    const [mergeTargetUserId, setMergeTargetUserId] = useState('');
    const [isMerging, setIsMerging] = useState(false);

    // Get list of registered youth users excluding the current temporary student
    const youthUsers = allUsers?.filter(u => u.user_group === '청소년' && !u.preferences?.is_temporary && u.id !== student.id) || [];

    const handleMerge = async () => {
        if (!mergeTargetUserId) {
            alert('연동할 정식 회원 계정을 선택해주세요.');
            return;
        }

        const targetUser = youthUsers.find(u => u.id === mergeTargetUserId);
        if (!targetUser) return;

        if (!confirm(`'${student.name}' 임시 학생의 모든 사역 기록을 정식 회원 '${targetUser.name}' 계정으로 연동하고 임시 계정을 삭제하시겠습니까? (이 작업은 되돌릴 수 없습니다)`)) {
            return;
        }

        setIsMerging(true);
        try {
            const result=await mergeUserStats(student.id,targetUser.id);
            if(!result.success)throw new Error(result.error);

            alert('성공적으로 계정 기록이 병합되었습니다.');
            onMergeComplete();
        } catch (err) {
            alert('계정 병합 중 오류가 발생했습니다: ' + err.message);
        } finally {
            setIsMerging(false);
        }
    };

    const handleDeleteTempStudent = async () => {
        if (!confirm(`'${student.name}' 임시 학생을 완전히 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) {
            return;
        }
        setIsMerging(true);
        try {
            // Delete from school_logs mappings
            const { data: logsData } = await supabase.from('school_logs').select('*').contains('participant_ids', [student.id]);
            if (logsData && logsData.length > 0) {
                const promises = logsData.map(log => {
                    const filtered = log.participant_ids.filter(id => id !== student.id);
                    return supabase.from('school_logs').update({ participant_ids: filtered }).eq('id', log.id);
                });
                await Promise.all(promises);
            }
            
            // Delete calling_forest_progress
            await supabase.from('calling_forest_progress').delete().eq('student_id', student.id);

            // Delete user
            const { error } = await supabase.from('users').delete().eq('id', student.id);
            if (error) throw error;

            alert('임시 학생이 완전히 삭제되었습니다.');
            onMergeComplete();
        } catch (err) {
            alert('삭제 실패: ' + err.message);
        } finally {
            setIsMerging(false);
        }
    };

    const handleSave = () => {
        if (isLeader !== student.is_leader) {
            const confirmMsg = isLeader
                ? `[${student.name}] 학생을 리더로 지정하시겠습니까?`
                : `[${student.name}] 학생의 리더 지정을 해제하시겠습니까?`;

            if (!window.confirm(confirmMsg)) {
                // If user cancels, we still save the memo but revert the leader toggle
                // but usually user might want to stay in modal. Let's return.
                return;
            }
        }
        let updates = { memo, is_leader: isLeader };
        if (isTemporary) {
            let phoneVal = phone.trim() || '미가입';
            let phoneBack4Val = phoneVal !== '미가입' ? (phoneVal.length >= 4 ? phoneVal.slice(-4) : phoneVal) : '미가입';
            updates.phone = phoneVal;
            updates.phone_back4 = phoneBack4Val;
        }
        onSave(updates);
    };

    return (
        <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[130] bg-black/60 backdrop-blur-md flex items-center justify-center p-4"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
                className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-6 bg-gradient-to-br from-indigo-500 to-indigo-600 relative overflow-hidden shrink-0">
                    <div className="absolute top-0 right-0 p-4 opacity-10 transform translate-x-1/4 -translate-y-1/4">
                        <School size={120} />
                    </div>
                    <button
                        onClick={onClose}
                        className="absolute top-0 right-0 w-24 h-24 flex items-start justify-end pt-6 pr-6 z-20 outline-none group"
                    >
                        <div className="bg-white/20 p-2.5 rounded-full text-white backdrop-blur-sm group-hover:bg-white/30 transition-colors shadow-sm">
                            <X size={20} />
                        </div>
                    </button>

                    <div className="flex flex-col items-center relative z-10">
                        <div className="w-24 h-24 rounded-full border-4 border-white/30 bg-white shadow-xl flex items-center justify-center overflow-hidden mb-4">
                            {student.profile_image_url ? (
                                <img src={student.profile_image_url} className="w-full h-full object-cover" />
                            ) : (
                                <User size={40} className="text-gray-300" />
                            )}
                        </div>
                        <h2 className="text-2xl font-black text-white tracking-tight">{student.name}</h2>
                        <div className="flex items-center gap-2 mt-1 opacity-90">
                            <span className="px-2 py-0.5 bg-white/20 rounded-lg text-xs font-bold text-white backdrop-blur-sm">
                                {student.school}
                            </span>
                            <span className="px-2 py-0.5 bg-white/20 rounded-lg text-xs font-bold text-white backdrop-blur-sm">
                                {student.birth || '생일 미입력'}
                            </span>
                        </div>
                        {student.phone && (
                            <div className="flex items-center gap-1.5 mt-2 bg-white/10 rounded-full px-3 py-1 text-xs font-bold text-white/90">
                                <span className="opacity-70">📞</span> {student.phone}
                            </div>
                        )}
                    </div>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6 bg-white overflow-y-auto custom-scrollbar md:max-h-[50vh]">
                    <div className="space-y-4">
                        <label className="text-[10px] font-black text-gray-400 uppercase ml-2 flex items-center gap-1.5">
                            <Star size={12} /> 리더 권한 설정
                        </label>
                        <button
                            onClick={() => setIsLeader(!isLeader)}
                            className={`w-full p-4 rounded-2xl border transition-all flex items-center justify-between ${isLeader ? 'bg-yellow-50 border-yellow-200 text-yellow-700 shadow-sm' : 'bg-white border-gray-100 text-gray-400 hover:bg-gray-50'}`}
                        >
                            <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isLeader ? 'bg-yellow-400 text-white' : 'bg-gray-100 text-gray-300'}`}>
                                    <Star size={20} fill={isLeader ? "currentColor" : "none"} />
                                </div>
                                <div className="text-left">
                                    <p className="text-sm font-black">{isLeader ? '학생 리더 지정됨' : '일반 학생'}</p>
                                    <p className="text-[10px] font-bold opacity-70">아이콘 및 필터링 시 리더로 표시됩니다.</p>
                                </div>
                            </div>
                            <div className={`w-12 h-6 rounded-full relative transition-colors ${isLeader ? 'bg-yellow-400' : 'bg-gray-200'}`}>
                                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${isLeader ? 'right-1' : 'left-1 shadow-sm'}`} />
                            </div>
                        </button>
                    </div>

                    {isTemporary ? (
                        <div className="space-y-3 bg-indigo-50/50 p-5 rounded-[1.5rem] border border-indigo-100">
                            <label className="text-[10px] font-black text-indigo-500 uppercase flex items-center gap-1.5 mb-1">
                                <LinkIcon size={12} /> 가입 계정과 기록 연동 (Merge)
                            </label>
                            
                            <div className="text-xs text-indigo-900/70 font-bold mb-4 flex gap-2 items-start opacity-80">
                                <AlertTriangle size={14} className="shrink-0 mt-0.5 text-indigo-400" />
                                <p>임시 데이터입니다. 실제 청소년이 가입한 계정을 선택하시면 각종 모든 활동 기록이 병합됩니다.</p>
                            </div>

                            <div className="space-y-4">
                                <select 
                                    className="w-full bg-white border border-indigo-200 text-gray-800 text-sm rounded-xl px-4 py-3 outline-none font-bold focus:ring-2 focus:ring-indigo-500/50"
                                    value={mergeTargetUserId}
                                    onChange={(e) => setMergeTargetUserId(e.target.value)}
                                >
                                    <option value="">연동할 가입 회원을 선택하세요</option>
                                    {youthUsers.map(u => (
                                        <option key={u.id} value={u.id}>
                                            {u.name} ({u.school || '학교미지정'}, {u.phone?.slice(-4) || '번호없음'})
                                        </option>
                                    ))}
                                </select>
                                
                                <button
                                    onClick={handleMerge}
                                    disabled={!mergeTargetUserId || isMerging}
                                    className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white font-black py-3 rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-2"
                                >
                                    {isMerging ? '데이터 병합 및 최적화 중...' : '선택한 계정으로 통합하기'}
                                </button>
                            </div>

                            <div className="pt-5 mt-5 border-t border-indigo-200/50">
                                <label className="text-[10px] font-black text-gray-500 uppercase flex items-center gap-1.5 mb-2">
                                    <Trash2 size={12} /> 임시 계정 영구 삭제 (초기화)
                                </label>
                                <button
                                    onClick={handleDeleteTempStudent}
                                    disabled={isMerging}
                                    className="w-full bg-white border border-red-200 hover:bg-red-50 hover:border-red-300 text-red-500 font-bold py-2.5 rounded-xl transition-all shadow-sm focus:ring-2 focus:ring-red-100 flex items-center justify-center gap-1.5 text-xs"
                                >
                                    임시 학생 목록에서 완전히 제거하기
                                </button>
                                <p className="text-[10px] text-gray-400 font-bold mt-2 text-center opacity-80 leading-relaxed">
                                    삭제 시 관련된 모든 사역/참여 기록 내역에서도 함께 제외됩니다.<br/>
                                    주의해서 사용해주세요.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-gray-400 uppercase ml-2 flex items-center gap-1.5">
                                <FileText size={12} /> 관리자 메모 (특이사항)
                            </label>
                            <textarea
                                value={memo}
                                onChange={e => setMemo(e.target.value)}
                                className="w-full h-40 p-5 bg-yellow-50 border border-yellow-100 rounded-[1.5rem] text-sm font-bold text-gray-700 outline-none focus:ring-4 focus:ring-yellow-400/20 focus:border-yellow-300 resize-none shadow-inner leading-relaxed"
                                placeholder="학생에 대한 특이사항, 기도제목, 상담 내용 등을 자유롭게 기록하세요."
                            />
                        </div>
                    )}
                    
                    {isTemporary && (
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-gray-400 uppercase ml-2 flex items-center gap-1.5">
                                <FileText size={12} /> 연락처 입력 (선택)
                            </label>
                            <input
                                type="text"
                                value={phone}
                                onChange={e => setPhone(e.target.value)}
                                className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300"
                                placeholder="예: 01012345678"
                            />
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-100 bg-gray-50/50 flex gap-3 shrink-0">
                    <button
                        onClick={onClose}
                        className="flex-1 py-3.5 bg-white border border-gray-200 text-gray-500 rounded-2xl font-black text-xs hover:bg-gray-100 transition-all"
                    >
                        취소
                    </button>
                    <button
                        onClick={handleSave}
                        className="flex-[2] py-3.5 bg-indigo-600 text-white rounded-2xl font-black text-xs shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 active:scale-95"
                    >
                        <Save size={16} /> 정보 저장
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
};

export default StudentDetailModal;
