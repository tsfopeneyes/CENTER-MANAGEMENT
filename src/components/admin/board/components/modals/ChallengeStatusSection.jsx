import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { Award, CheckCircle, Clock, FileText, Check, X as XIcon } from 'lucide-react';
import { supabase } from '../../../../../supabaseClient';
import { haifnApi } from '../../../../../api/haifnApi';

const ChallengeStatusSection = ({ notice, participantList, onRefresh, onUserClick }) => {
    const [previewImage, setPreviewImage] = useState(null);
    const [actionLoading, setActionLoading] = useState(false);
    const challengers = participantList.JOIN || [];
    const missions = notice.challenge_missions || [];

    const handleMissionAction = async (studentId, missionId, approve) => {
        setActionLoading(true);
        try {
            // 1. Get current response row
            const { data: response, error: fetchErr } = await supabase
                .from('notice_responses')
                .select('challenge_mission_statuses')
                .eq('notice_id', notice.id)
                .eq('user_id', studentId)
                .single();

            if (fetchErr) throw fetchErr;

            const currentStatuses = response.challenge_mission_statuses || {};
            const missionStatus = currentStatuses[missionId] || {};

            if (approve) {
                // Approve submission
                missionStatus.completed = true;
                missionStatus.completed_at = new Date().toISOString();
                currentStatuses[missionId] = missionStatus;
            } else {
                // Reject submission: clear image and status
                delete currentStatuses[missionId];
            }

            // 2. Save back to notice_responses
            const { error: updateErr } = await supabase
                .from('notice_responses')
                .update({ challenge_mission_statuses: currentStatuses })
                .eq('notice_id', notice.id)
                .eq('user_id', studentId);

            if (updateErr) throw updateErr;

            // 3. If approved, check if all missions are completed to grant haifn reward
            if (approve) {
                const isAllCompleted = missions.every(m => currentStatuses[m.id]?.completed);
                if (isAllCompleted && notice.haifn_reward > 0) {
                    const admin = JSON.parse(localStorage.getItem('admin_user'));
                    const adminId = admin?.id || null;
                    // Grant haifn reward
                    await haifnApi.grantProgramReward(studentId, notice.id, notice.haifn_reward, adminId, notice.title);
                    alert(`${challengers.find(c => c.id === studentId)?.name || '학생'}님이 모든 미션을 완료하여 ${notice.haifn_reward} 하이픈 보상이 수여되었습니다!`);
                } else {
                    alert('미션이 승인되었습니다.');
                }
            } else {
                alert('미션 인증이 반려되었습니다. (학생이 다시 등록할 수 있습니다)');
            }

            setPreviewImage(null);
            if (onRefresh) onRefresh();
        } catch (err) {
            console.error('Mission action failed:', err);
            alert('인증 처리 중 오류가 발생했습니다: ' + err.message);
        } finally {
            setActionLoading(false);
        }
    };

    return (
        <div className="flex-1 flex flex-col min-h-0 bg-white p-6">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h3 className="text-lg font-black text-gray-800 flex items-center gap-2">
                        <Award className="text-blue-500" size={20} />
                        챌린지 미션 인증 및 진행도 관리
                    </h3>
                    <p className="text-xs text-gray-400 font-bold mt-1">
                        전체 도전자 {challengers.length}명 / 등록된 미션 {missions.length}개
                    </p>
                </div>
            </div>

            {challengers.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-gray-100 rounded-3xl p-8 text-gray-400">
                    <p className="font-bold text-sm">아직 이 챌린지에 도전한 학생이 없습니다.</p>
                </div>
            ) : (
                <div className="flex-1 overflow-y-auto pr-1">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-gray-100 text-[10px] font-black text-gray-400 uppercase tracking-wider">
                                <th className="pb-3 pl-3">학생 정보</th>
                                <th className="pb-3 text-center">미션 달성도</th>
                                <th className="pb-3 pl-6">미션별 인증 세부 (클릭하여 검토)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {challengers.map((student) => {
                                const statuses = student.challenge_mission_statuses || {};
                                const completedCount = missions.filter(m => statuses[m.id]?.completed).length;
                                const isAllCompleted = completedCount === missions.length && missions.length > 0;

                                return (
                                    <tr key={student.id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="py-4 pl-3">
                                            <div className="flex flex-col">
                                                <button
                                                    type="button"
                                                    onClick={() => onUserClick && onUserClick(student)}
                                                    className="font-bold text-sm text-gray-800 hover:text-blue-600 hover:underline flex items-center gap-1.5 text-left"
                                                    title="회원 정보 카드 보기"
                                                >
                                                    {student.name}
                                                    {student.is_leader && (
                                                        <span className="px-1.5 py-0.5 bg-amber-50 text-amber-600 border border-amber-100 rounded text-[9px] font-bold">리더</span>
                                                    )}
                                                </button>
                                                <span className="text-[10px] text-gray-400 font-bold mt-0.5">
                                                    {student.school} • 번호 {student.phone_back4 || '----'}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="py-4 text-center">
                                            <div className="inline-flex flex-col items-center">
                                                <span className={`px-2.5 py-1 rounded-full text-xs font-black leading-none ${
                                                    isAllCompleted 
                                                        ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' 
                                                        : 'bg-blue-50 text-blue-600 border border-blue-100'
                                                }`}>
                                                    {completedCount} / {missions.length} 완료
                                                </span>
                                                {isAllCompleted && (
                                                    <span className="text-[9px] text-emerald-500 font-black mt-1 uppercase tracking-wider">SUCCESS!</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="py-4 pl-6">
                                            <div className="flex flex-wrap gap-2.5">
                                                {missions.map((mission) => {
                                                    const mStatus = statuses[mission.id] || {};
                                                    const isDone = mStatus.completed;
                                                    const hasImage = !!mStatus.auth_image;
                                                    const hasText = !!mStatus.auth_text;
                                                    const hasEvidence = hasImage || hasText;

                                                    return (
                                                        <button
                                                            key={mission.id}
                                                            type="button"
                                                            onClick={() => {
                                                                if (hasEvidence) {
                                                                    setPreviewImage({
                                                                        url: mStatus.auth_image,
                                                                        text: mStatus.auth_text,
                                                                        type: hasText ? 'text' : 'photo',
                                                                        title: `${student.name} - ${mission.title}`,
                                                                        date: mStatus.submitted_at || mStatus.completed_at,
                                                                        studentId: student.id,
                                                                        missionId: mission.id,
                                                                        isCompleted: isDone
                                                                    });
                                                                }
                                                            }}
                                                            disabled={!hasEvidence}
                                                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] font-bold transition-all ${
                                                                isDone 
                                                                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100/50' 
                                                                    : hasEvidence
                                                                        ? 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100/50 animate-pulse'
                                                                        : 'bg-gray-50/30 border-dashed border-gray-200 text-gray-400 cursor-not-allowed'
                                                            }`}
                                                        >
                                                            {isDone ? (
                                                                <CheckCircle size={12} className="text-emerald-500" />
                                                            ) : hasEvidence ? (
                                                                <Clock size={12} className="text-amber-500 animate-spin" />
                                                            ) : (
                                                                <Clock size={12} className="text-gray-300" />
                                                            )}
                                                            <span>{mission.title}</span>
                                                            {hasEvidence && !isDone && (
                                                                <span className="text-[9px] bg-amber-200 text-amber-800 px-1 rounded ml-1 font-black">검토필요</span>
                                                            )}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* 미션 인증 검토 팝업 */}
            {previewImage && (
                <div 
                    className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-4 backdrop-blur-md animate-fade-in"
                    onClick={() => setPreviewImage(null)}
                >
                    <div 
                        className="bg-white rounded-3xl overflow-hidden max-w-lg w-full shadow-2xl relative flex flex-col"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <div>
                                <h4 className="font-black text-gray-800 text-sm">{previewImage.title}</h4>
                                {previewImage.date && (
                                    <p className="text-[10px] text-gray-400 font-bold mt-0.5">
                                        인증 등록일: {new Date(previewImage.date).toLocaleString('ko-KR')}
                                    </p>
                                )}
                            </div>
                            <button 
                                onClick={() => setPreviewImage(null)}
                                className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-600 rounded-lg text-xs font-bold transition-colors"
                            >
                                닫기
                            </button>
                        </div>
                        
                        {previewImage.type === 'text' ? (
                            <div className="p-6 bg-slate-50 min-h-[220px] max-h-[500px] overflow-y-auto">
                                <div className="flex items-center gap-2 mb-3 text-blue-600">
                                    <FileText size={17} />
                                    <span className="text-xs font-black">텍스트 인증 내용</span>
                                </div>
                                <p className="whitespace-pre-wrap break-words text-sm font-semibold leading-7 text-slate-700 bg-white border border-slate-200 rounded-2xl p-4">
                                    {previewImage.text}
                                </p>
                            </div>
                        ) : (
                            <div className="p-3 bg-black flex items-center justify-center min-h-[300px] max-h-[500px]">
                                <img
                                    src={previewImage.url}
                                    alt="미션 인증샷"
                                    className="max-w-full max-h-[400px] object-contain rounded-xl"
                                />
                            </div>
                        )}

                        {/* Approve/Reject actions */}
                        <div className="p-4 border-t border-gray-100 flex gap-3 bg-gray-50/50">
                            {!previewImage.isCompleted ? (
                                <>
                                    <button
                                        type="button"
                                        disabled={actionLoading}
                                        onClick={() => handleMissionAction(previewImage.studentId, previewImage.missionId, true)}
                                        className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white rounded-xl font-bold flex items-center justify-center gap-1.5 transition-all shadow-md shadow-emerald-100 text-sm"
                                    >
                                        <Check size={16} /> 승인
                                    </button>
                                    <button
                                        type="button"
                                        disabled={actionLoading}
                                        onClick={() => {
                                            if (window.confirm('정말 이 미션 인증을 반려하시겠습니까? (등록 내용이 초기화됩니다)')) {
                                                handleMissionAction(previewImage.studentId, previewImage.missionId, false);
                                            }
                                        }}
                                        className="flex-1 py-3 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 disabled:bg-gray-50 disabled:text-gray-400 rounded-xl font-bold flex items-center justify-center gap-1.5 transition-all text-sm"
                                    >
                                        <XIcon size={16} /> 반려 (인증 삭제)
                                    </button>
                                </>
                            ) : (
                                <button
                                    type="button"
                                    disabled={actionLoading}
                                    onClick={() => {
                                        if (window.confirm('이미 승인 완료된 미션입니다. 취소하여 반려 상태로 돌리시겠습니까?')) {
                                            handleMissionAction(previewImage.studentId, previewImage.missionId, false);
                                        }
                                    }}
                                    className="w-full py-3 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 rounded-xl font-bold transition-all text-sm"
                                >
                                    승인 취소 (반려 처리)
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

ChallengeStatusSection.propTypes = {
    notice: PropTypes.object.isRequired,
    participantList: PropTypes.object.isRequired,
    onRefresh: PropTypes.func
};

export default ChallengeStatusSection;
