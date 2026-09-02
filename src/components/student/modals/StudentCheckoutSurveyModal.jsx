import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LogOut, Check, X, Sparkles, HeartHandshake } from 'lucide-react';
import { requestSupabaseRest } from '../../../utils/supabaseRest';
import useModalClose from '../../../hooks/useModalClose';
import { loadAssignedSurvey } from '../../../utils/surveyAssignments';

const DEFAULT_CHECKOUT_OPTIONS = [
    { id: '1', emoji: '😊', label: '교제 및 휴식', recommendTitle: '휴식 세션 완료', recommendText: '편안한 휴식이 되었기를 바랍니다!' },
    { id: '2', emoji: '📚', label: '개인 할 일', recommendTitle: '집중 공부 완료', recommendText: '오늘도 수고 많으셨습니다!' },
    { id: '3', emoji: '🎯', label: '프로그램 참여', recommendTitle: '프로그램 참여 완료', recommendText: '알찬 시간이 되었길 바래요!' },
    { id: '4', emoji: '☕', label: '스처쌤 만남', recommendTitle: '커피챗 완료', recommendText: '유익한 대화의 시간이었기를 진심으로 바래요!' }
];

const StudentCheckoutSurveyModal = ({ isOpen, onClose, onSurveySaved, onSurveySkipped, user, locationName }) => {
    useModalClose(isOpen, onClose);
    const [mode, setMode] = useState('SURVEY'); // 'SURVEY' | 'FEEDBACK_QA' | 'CHAT_SHOUTOUT' | 'HYBRID'
    const [questionText, setQuestionText] = useState('오늘 센터에서의 시간은 어떠셨나요?');
    const [qaQuestionText, setQaQuestionText] = useState('오늘 센터 이용 소감이나 하고 싶은 말을 남겨주세요!');
    const [qaPlaceholderText, setQaPlaceholderText] = useState('자유롭게 작성해 주세요 (예: 보드게임이 재밌었어요, 공간이 깨끗해요)');
    const [chatPromptText, setChatPromptText] = useState('퇴실하면서 친구들에게 작별 인사를 남겨보세요!');
    const [chatPlaceholderText, setChatPlaceholderText] = useState('예: 먼저 가볼게! 다들 재미있게 놀아~');
    const [surveyId, setSurveyId] = useState(null);

    const [optionsList, setOptionsList] = useState(DEFAULT_CHECKOUT_OPTIONS);
    const [selectedLabels, setSelectedLabels] = useState([DEFAULT_CHECKOUT_OPTIONS[0].label]);
    const [userAnswerText, setUserAnswerText] = useState('');
    const [chatShoutoutText, setChatShoutoutText] = useState('');

    const [isSubmitting, setIsSubmitting] = useState(false);
    const submissionLockRef = useRef(false);

    useEffect(() => {
        if (!isOpen) return;
        setUserAnswerText('');
        setChatShoutoutText('');
        const fetchConfig = async () => {
            try {
                const assigned = await loadAssignedSurvey({ surveyType: 'CHECKOUT', locationName });
                if (!assigned) {
                    await onSurveySkipped?.();
                    onClose();
                    return;
                }
                if (assigned?.config) {
                    const parsed = assigned.config;
                    setSurveyId(assigned.id || null);
                    if (parsed.mode) setMode(parsed.mode);
                    if (parsed.question) setQuestionText(parsed.question);
                    if (parsed.qaQuestion) setQaQuestionText(parsed.qaQuestion);
                    if (parsed.qaPlaceholder) setQaPlaceholderText(parsed.qaPlaceholder);
                    if (parsed.chatPrompt) setChatPromptText(parsed.chatPrompt);
                    if (parsed.chatPlaceholder) setChatPlaceholderText(parsed.chatPlaceholder);
                    if (parsed.options && parsed.options.length > 0) {
                        setOptionsList(parsed.options);
                        setSelectedLabels([parsed.options[0].label]);
                    }
                }
            } catch (e) {
                console.error('Failed to fetch checkout survey config:', e);
            }
        };
        fetchConfig();
    }, [isOpen, locationName]);

    if (!isOpen) return null;

    const toggleOption = (label) => {
        if (selectedLabels.includes(label)) {
            if (selectedLabels.length > 1) {
                setSelectedLabels(selectedLabels.filter(l => l !== label));
            }
        } else {
            setSelectedLabels([...selectedLabels, label]);
        }
    };

    const handleConfirmCheckoutSubmit = async () => {
        if (submissionLockRef.current) return;
        submissionLockRef.current = true;
        setIsSubmitting(true);

        try {
            const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
            
            // Build survey payload
            let finalSelections = [];
            let textAns = null;

            if (mode === 'SURVEY') {
                finalSelections = selectedLabels;
            } else if (mode === 'FEEDBACK_QA') {
                textAns = userAnswerText.trim();
            } else if (mode === 'CHAT_SHOUTOUT') {
                textAns = chatShoutoutText.trim();
            } else if (mode === 'HYBRID') {
                finalSelections = selectedLabels;
                textAns = chatShoutoutText.trim();
            }

            const userId = user?.id || user?.userId || null;

            // Save to checkin_surveys with survey_type = 'CHECKOUT'
            await requestSupabaseRest('checkin_surveys', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                user_id: userId,
                survey_type: 'CHECKOUT',
                selections: finalSelections,
                text_answer: textAns,
                mode: mode,
                ...(surveyId ? {
                    survey_id: surveyId,
                    survey_snapshot: { question: questionText, qaQuestion: qaQuestionText, options: optionsList }
                } : {}),
                created_at: new Date().toISOString()
                })
            });

            // Format survey response text for the checkout notification.
            let surveySummaryText = '';
            if (finalSelections.length > 0) {
                surveySummaryText = finalSelections.join(', ');
            }
            if (textAns) {
                surveySummaryText = surveySummaryText ? `${surveySummaryText} | [퇴실소감] ${textAns}` : `[퇴실소감] ${textAns}`;
            }

            // Auto-post to live chat unconditionally for shoutout/hybrid modes
            if (textAns && (mode === 'CHAT_SHOUTOUT' || mode === 'HYBRID')) {
                const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                const validUserId = (userId && uuidRegex.test(userId)) ? userId : null;
                const centerCode = (locationName && locationName.includes('이높')) ? '이높플레이스' : '하이픈';
                
                await requestSupabaseRest('center_daily_chats', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                    center_code: centerCode,
                    user_id: validUserId || userId,
                    user_name: user?.name || '익명',
                    user_avatar: user?.profile_image_url || null,
                    school_name: user?.school || null,
                    message: `[CHECK-OUT] ${textAns}`
                    })
                });
            }

            await onSurveySaved?.({
                feedbackText: surveySummaryText,
                surveyQuestion: mode === 'FEEDBACK_QA' ? qaQuestionText : questionText,
                surveyAnswers: textAns && mode === 'FEEDBACK_QA' ? [textAns] : finalSelections
            });
        } catch (err) {
            console.error('Checkout survey save error:', err);
            // The visitor has already checked out. If the optional survey fails,
            // complete the flow with the basic checkout notification instead.
            await onSurveySkipped?.();
        } finally {
            setIsSubmitting(false);
            submissionLockRef.current = false;
            onClose();
        }
    };

    const handleSkipCheckoutSurvey = async () => {
        if (submissionLockRef.current) return;
        submissionLockRef.current = true;
        setIsSubmitting(true);
        try {
            await onSurveySkipped?.();
        } finally {
            setIsSubmitting(false);
            submissionLockRef.current = false;
            onClose();
        }
    };

    return (
        <AnimatePresence>
            <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 z-50">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className="bg-white w-full max-w-lg rounded-[28px] shadow-2xl overflow-hidden flex flex-col border border-slate-100 max-h-[90vh]"
                >
                    {/* Header */}
                    <div className="bg-gradient-to-r from-emerald-600 to-teal-600 p-6 text-white relative shrink-0">
                        <button
                            onClick={handleSkipCheckoutSurvey}
                            disabled={isSubmitting}
                            className="absolute top-5 right-5 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all"
                        >
                            <X size={18} />
                        </button>
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-xs font-black tracking-wider mb-2">
                            <HeartHandshake size={14} /> 퇴실 설문 & 소감
                        </div>
                        <h2 className="text-xl md:text-2xl font-black tracking-tight leading-snug">
                            조만간 또 만나요🖐️
                        </h2>
                        <p className="text-emerald-100 text-xs md:text-sm mt-1 font-medium">
                            {user?.name || '학생'}님, 퇴실 전 오늘 센터 이용 소감을 들려주세요.
                        </p>
                    </div>

                    {/* Content Body */}
                    <div className="p-6 overflow-y-auto space-y-6 flex-1 custom-scrollbar">
                        {/* Mode 1: SURVEY */}
                        {mode === 'SURVEY' && (
                            <div>
                                <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                                    <Sparkles size={16} className="text-emerald-500" />
                                    {questionText}
                                </h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {optionsList.map((opt) => {
                                        const isSelected = selectedLabels.includes(opt.label);
                                        return (
                                            <button
                                                key={opt.id}
                                                type="button"
                                                onClick={() => toggleOption(opt.label)}
                                                className={`p-3.5 rounded-2xl border text-left transition-all flex items-center gap-3 relative ${
                                                    isSelected
                                                        ? 'bg-emerald-50 border-emerald-500 ring-2 ring-emerald-500/20 text-emerald-900 shadow-sm'
                                                        : 'bg-slate-50 border-slate-200/80 text-slate-700 hover:bg-slate-100/70'
                                                }`}
                                            >
                                                <span className="text-2xl shrink-0">{opt.emoji}</span>
                                                <span className="text-xs font-extrabold truncate">{opt.label}</span>
                                                {isSelected && (
                                                    <div className="ml-auto w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0">
                                                        <Check size={12} strokeWidth={3} />
                                                    </div>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Mode 2: FEEDBACK_QA */}
                        {mode === 'FEEDBACK_QA' && (
                            <div>
                                <h3 className="text-sm font-bold text-slate-800 mb-2">
                                    {qaQuestionText}
                                </h3>
                                <textarea
                                    value={userAnswerText}
                                    onChange={(e) => setUserAnswerText(e.target.value)}
                                    placeholder={qaPlaceholderText}
                                    rows={4}
                                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs md:text-sm font-bold text-slate-800 outline-none focus:border-emerald-500 focus:bg-white transition-all resize-none"
                                />
                            </div>
                        )}

                        {/* Mode 3: CHAT_SHOUTOUT */}
                        {mode === 'CHAT_SHOUTOUT' && (
                            <div>
                                <h3 className="text-sm font-bold text-slate-800 mb-2 flex items-center gap-2">
                                    <Sparkles size={16} className="text-emerald-500" />
                                    {chatPromptText}
                                </h3>
                                <textarea
                                    value={chatShoutoutText}
                                    onChange={(e) => setChatShoutoutText(e.target.value)}
                                    placeholder={chatPlaceholderText}
                                    rows={3}
                                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs md:text-sm font-bold text-slate-800 outline-none focus:border-emerald-500 focus:bg-white transition-all resize-none"
                                />
                            </div>
                        )}

                        {/* Mode 4: HYBRID */}
                        {mode === 'HYBRID' && (
                            <div className="space-y-5">
                                <div>
                                    <h3 className="text-xs font-bold text-slate-700 mb-2.5">
                                        {questionText}
                                    </h3>
                                    <div className="grid grid-cols-2 gap-2.5">
                                        {optionsList.map((opt) => {
                                            const isSelected = selectedLabels.includes(opt.label);
                                            return (
                                                <button
                                                    key={opt.id}
                                                    type="button"
                                                    onClick={() => toggleOption(opt.label)}
                                                    className={`p-3 rounded-xl border text-left transition-all flex items-center gap-2.5 ${
                                                        isSelected
                                                            ? 'bg-emerald-50 border-emerald-500 text-emerald-900 font-extrabold shadow-sm'
                                                            : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                                                    }`}
                                                >
                                                    <span className="text-lg">{opt.emoji}</span>
                                                    <span className="text-xs font-bold truncate">{opt.label}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div>
                                    <h3 className="text-xs font-bold text-slate-700 mb-2">
                                        {chatPromptText}
                                    </h3>
                                    <input
                                        type="text"
                                        value={chatShoutoutText}
                                        onChange={(e) => setChatShoutoutText(e.target.value)}
                                        placeholder={chatPlaceholderText}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-emerald-500 focus:bg-white transition-all"
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Footer Button */}
                    <div className="p-5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between shrink-0">
                        <button
                            type="button"
                            onClick={handleSkipCheckoutSurvey}
                            disabled={isSubmitting}
                            className="px-4 py-2.5 text-xs font-bold text-slate-500 hover:text-slate-700 transition-colors disabled:opacity-50"
                        >
                            건너뛰고 퇴실하기
                        </button>
                        <button
                            type="button"
                            disabled={isSubmitting}
                            onClick={handleConfirmCheckoutSubmit}
                            className="px-6 py-3 bg-emerald-600 text-white rounded-2xl font-black text-xs md:text-sm hover:bg-emerald-700 active:scale-95 transition-all shadow-md shadow-emerald-200 flex items-center gap-2 disabled:opacity-50"
                        >
                            <LogOut size={16} />
                            {isSubmitting ? '처리 중...' : '설문 제출 및 퇴실완료'}
                        </button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

export default StudentCheckoutSurveyModal;
