import React, { useState, useEffect, useMemo } from 'react';
import ProgramCard from './ProgramCard';
import ProgramFeedbackModal from './modals/ProgramFeedbackModal';
import { motion, AnimatePresence } from 'framer-motion';
import { feedbackApi } from '../../api/feedbackApi';
import { buildTutorialPrograms } from './studentTutorialData';

const StudentProgramsTab = ({
    filteredPrograms,
    allPrograms,
    responses,
    responseDetails,
    openNoticeDetail,
    tutorialMode = false,
    tutorialStep = '',
    tutorialResponses = {},
    onTutorialProgramOpen
}) => {
    const [subTab, setSubTab] = useState('AVAILABLE'); // 'AVAILABLE' | 'HISTORY'
    const [selectedFeedbackProgram, setSelectedFeedbackProgram] = useState(null);
    const [userFeedbacks, setUserFeedbacks] = useState([]);
    const tutorialPrograms = useMemo(() => buildTutorialPrograms(allPrograms), [allPrograms]);
    const tutorialApplicationPrograms = tutorialPrograms.filter((program) => program.is_recruiting && !program.is_challenge);
    const tutorialOpenPrograms = tutorialPrograms.filter((program) => !program.is_recruiting);
    const tutorialChallenges = tutorialPrograms.filter((program) => program.is_challenge);

    const openTutorialProgram = (program) => {
        onTutorialProgramOpen?.(program);
        openNoticeDetail(program, 'tutorial');
    };

    useEffect(() => {
        const fetchFeedback = async () => {
            const userStr = localStorage.getItem('user');
            if (userStr) {
                const user = JSON.parse(userStr);
                try {
                    const data = await feedbackApi.fetchUserFeedbacks(user.id);
                    setUserFeedbacks(data || []);
                } catch (e) {
                    console.error('Failed to fetch user feedbacks:', e);
                }
            }
        };
        fetchFeedback();
    }, []);

    // History: attended & ENDED programs only
    const historyPrograms = (allPrograms || []).filter(n => {
        const isJoined = responses?.[n.id] === 'JOIN' || responseDetails?.[n.id]?.status === 'JOIN';
        if (!isJoined) return false;

        // 종료 되었거나 종료 시간이 지난 프로그램만 '나의 참여 내역'에 노출
        const isEnded = n.program_status === 'COMPLETED' || 
                        (n.guest_properties?.is_ended ?? n.is_ended) === true ||
                        (() => {
                            const pDateStr = n.program_end_date || n.program_date;
                            if (!pDateStr) return false;
                            const pDate = new Date(pDateStr);
                            const durationHours = parseFloat(n.program_duration) || 0;
                            const pEndDate = new Date(pDate.getTime() + (durationHours > 0 ? durationHours : 2) * 60 * 60 * 1000);
                            return new Date() >= pEndDate;
                        })();

        return isEnded;
    });

    return (
        <div className="animate-fade-in relative">
            {/* Custom Tab Switcher (TDS Segmented 스타일) */}
            <div className="px-0">
                <div className="flex bg-tossGrey100 p-1 rounded-[12px] mb-6 relative">
                    <div
                        className="absolute top-1 bottom-1 w-[calc(50%-4px)] bg-white rounded-[10px] shadow-[0px_2px_4px_rgba(0,0,0,0.06)] transition-transform duration-300 ease-out"
                        style={{ transform: subTab === 'AVAILABLE' ? 'translateX(0)' : 'translateX(calc(100% + 8px))' }}
                    />
                    <button
                        onClick={() => setSubTab('AVAILABLE')}
                        className={`flex-1 relative z-10 py-2.5 text-sm font-bold transition-colors ${subTab === 'AVAILABLE' ? 'text-tossGrey900' : 'text-tossGrey500'}`}
                    >
                        진행·모집 예정
                    </button>
                    <button
                        onClick={() => setSubTab('HISTORY')}
                        className={`flex-1 relative z-10 py-2.5 text-sm font-bold transition-colors ${subTab === 'HISTORY' ? 'text-tossGrey900' : 'text-tossGrey500'}`}
                    >
                        나의 참여 내역
                    </button>
                </div>

                <div className="space-y-6">
                    <AnimatePresence mode="wait">
                        {subTab === 'AVAILABLE' ? (
                            <motion.div
                                key="AVAILABLE"
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 10 }}
                                className="space-y-6"
                            >
                                {filteredPrograms.length === 0 && !tutorialMode ? (
                                    <div className="text-center py-20 text-tossGrey400 font-bold">진행 중이거나 모집 예정인 프로그램이 없습니다.</div>
                                ) : tutorialMode ? (
                                    <div className="space-y-7">
                                        <section data-tour="tutorial-application-programs" className="rounded-toss-xl overflow-hidden">
                                            <div className="mb-3">
                                                <h3 className="text-sm font-black text-tossGrey900">신청 프로그램</h3>
                                                <p className="mt-0.5 text-[11px] font-semibold text-tossGrey500">아래 프로그램 중 관심 있는 하나를 직접 골라 보세요.</p>
                                            </div>
                                            {tutorialStep === 'programSelect' && (
                                                <div className="mb-3 rounded-2xl border border-tossBlue/15 bg-tossBlueLight px-4 py-3 text-xs font-bold leading-5 text-tossGrey700">
                                                    세 카드 중 관심 있는 프로그램 하나를 직접 눌러 상세 소개, 일정, 장소와 정원을 확인해 보세요.
                                                </div>
                                            )}
                                            <div className="grid grid-cols-2 gap-3">
                                                {tutorialApplicationPrograms.slice(0, 1).map((program) => (
                                                    <ProgramCard
                                                        key={program.id}
                                                        program={{ ...program, responseStatus: tutorialResponses[program.id] }}
                                                        onClick={openTutorialProgram}
                                                        compact={true}
                                                        tourTarget="tutorial-program-card-0"
                                                        tourLabel={program.title}
                                                    />
                                                ))}
                                            </div>
                                        </section>

                                        <section data-tour="tutorial-open-programs">
                                            <div className="mb-3">
                                                <h3 className="text-sm font-black text-tossGrey900">오픈 프로그램</h3>
                                                <p className="mt-0.5 text-[11px] font-semibold text-tossGrey500">신청 버튼 없이 일정과 장소를 확인하고 참여해요.</p>
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                                {tutorialOpenPrograms.map((program, index) => (
                                                    <ProgramCard
                                                        key={program.id}
                                                        program={program}
                                                        onClick={openTutorialProgram}
                                                        compact={true}
                                                        tourTarget={`tutorial-open-card-${index}`}
                                                        tourLabel={program.title}
                                                    />
                                                ))}
                                            </div>
                                        </section>

                                        <section data-tour="tutorial-challenge-programs">
                                            <div className="mb-3">
                                                <h3 className="text-sm font-black text-tossGrey900">챌린지</h3>
                                                <p className="mt-0.5 text-[11px] font-semibold text-tossGrey500">상세 화면에서 미션과 인증 방법을 확인해요.</p>
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                                {tutorialChallenges.map((program, index) => (
                                                    <ProgramCard
                                                        key={program.id}
                                                        program={program}
                                                        onClick={openTutorialProgram}
                                                        compact={true}
                                                        tourTarget={`tutorial-challenge-card-${index}`}
                                                        tourLabel={program.title}
                                                    />
                                                ))}
                                            </div>
                                        </section>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-2 gap-3">
                                        {filteredPrograms.map(n => (
                                            <ProgramCard
                                                key={n.id}
                                                program={{ ...n, responseStatus: responses[n.id] }}
                                                onClick={openNoticeDetail}
                                                compact={true}
                                            />
                                        ))}
                                    </div>
                                )}
                            </motion.div>
                        ) : (
                            <motion.div
                                key="HISTORY"
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 10 }}
                                className="space-y-4"
                            >
                                {historyPrograms.length === 0 ? (
                                    <div className="text-center py-20 text-tossGrey400 font-bold">참여 완료된 내역이 없습니다.</div>
                                ) : (
                                    <div className="grid grid-cols-2 gap-3">
                                        {historyPrograms.map(n => {
                                            const hasReviewed = userFeedbacks.some(f => f.notice_id === n.id);
                                            const isFeedbackEnabled = (n.guest_properties?.enable_feedback ?? n.enable_feedback) === true;
                                            
                                            return (
                                                <div key={n.id} className="bg-white text-left shadow-toss-standard rounded-toss-xl p-4 flex flex-col justify-between hover:shadow-toss-elevated active:scale-[0.98] transition-all border border-tossGrey100/50">
                                                    <div className="flex gap-3 mb-3 cursor-pointer" onClick={() => openNoticeDetail(n)}>
                                                        {/* Optional smaller thumbnail */}
                                                        <div className="w-12 h-12 rounded-toss-lg bg-tossGrey50 flex-shrink-0 overflow-hidden border border-tossGrey100">
                                                            {(n.image_url || n.images?.[0]) ? (
                                                                <img src={n.image_url || n.images[0]} alt="" className="w-full h-full object-cover" />
                                                            ) : (
                                                                <div className="w-full h-full bg-tossBlueLight" />
                                                            )}
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <h3 className="font-bold text-tossGrey900 text-xs mb-0.5 truncate">{n.title}</h3>
                                                            <p className="text-[10px] text-tossGrey500 font-medium line-clamp-1">{n.short_description || '설명 없음'}</p>
                                                            <p className="text-[9px] font-bold text-tossGrey450 mt-1">{new Date(n.program_date || n.created_at).toLocaleDateString()}</p>
                                                        </div>
                                                    </div>
     
                                                    {/* Action Area */}
                                                    {isFeedbackEnabled ? (
                                                        hasReviewed ? (
                                                            <button
                                                                onClick={() => setSelectedFeedbackProgram(n)}
                                                                className="w-full py-2 rounded-toss-lg text-tossGrey700 text-xs font-bold bg-tossGrey100 hover:bg-tossGrey200 transition-colors cursor-pointer"
                                                            >
                                                                피드백 작성 완료
                                                            </button>
                                                        ) : (
                                                            <button
                                                                onClick={() => setSelectedFeedbackProgram(n)}
                                                                className="w-full py-2 rounded-toss-lg text-white text-xs font-bold bg-tossBlue hover:bg-tossBlueHover transition-all flex items-center justify-center gap-1 cursor-pointer"
                                                            >
                                                                피드백 작성 {n.haifn_reward && n.haifn_reward > 0 ? `(${n.haifn_reward}H)` : ''}
                                                            </button>
                                                        )
                                                    ) : (
                                                        <div className="w-full py-2 rounded-toss-lg text-tossGrey400 text-xs font-bold bg-tossGrey50 border border-tossGrey100 text-center select-none">
                                                            참여 완료
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

            {/* Feedback Modal */}
            <AnimatePresence>
                {selectedFeedbackProgram && (
                    <ProgramFeedbackModal
                        program={selectedFeedbackProgram}
                        existingFeedback={userFeedbacks.find(f => f.notice_id === selectedFeedbackProgram.id)}
                        onClose={() => setSelectedFeedbackProgram(null)}
                        onSuccess={(newFeedback) => {
                            setUserFeedbacks(prev => {
                                const exists = prev.find(f => f.notice_id === newFeedback.notice_id);
                                if (exists) {
                                    return prev.map(f => f.notice_id === newFeedback.notice_id ? newFeedback : f);
                                }
                                return [...prev, newFeedback];
                            });
                            setSelectedFeedbackProgram(null);
                        }}
                    />
                )}
            </AnimatePresence>

            </div>
        </div>
    );
};

export default StudentProgramsTab;
