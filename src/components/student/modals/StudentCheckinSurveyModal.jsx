import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Check, X, ChevronRight, CheckCircle, MapPin } from 'lucide-react';
import { supabase } from '../../../supabaseClient';
import { sendCheckinNotification } from '../../../utils/integrationUtils';
import { resolveSchoolRegion } from '../../../utils/schoolRegionUtils';
import useModalClose from '../../../hooks/useModalClose';
import { loadAssignedSurvey } from '../../../utils/surveyAssignments';

const DEFAULT_SURVEY_OPTIONS = [
    { id: '1', emoji: '🍽️', label: '당 충전하며 쉬고 싶어요', recommendTitle: '2F SQUARE, 3F ROUND 빈백존', recommendText: '2층 냉장고에서 간식 먹고, 3층 빈백에서 뒹굴뒹굴' },
    { id: '2', emoji: '🎲', label: '아무 생각 없이 놀고 싶어요', recommendTitle: '3F ROUND', recommendText: '루미큐브, 텔레스트레이션 등 보드게임 ㄱㄱ' },
    { id: '3', emoji: '☕', label: '누군가와 이야기하고 싶어요', recommendTitle: 'COFFEE CHAT', recommendText: '스처쌤과 함께 진대 어떰?\n인포에 있는 쌤이나 앱에서 커피챗 ㄱㄱ' },
    { id: '4', emoji: '🙏', label: '기도하거나 예배하고 싶어요', recommendTitle: '2F SQUARE ROOM 1', recommendText: '조용히 방에 들어가 필사와 기도의 시간을 가져보자' },
    { id: '5', emoji: '📚', label: '조용히 집중하고 싶어요', recommendTitle: '4F CONNECT', recommendText: '해야 하는 숙제나 일이 있다면 짧고 굵게 집중해보자' },
    { id: '6', emoji: '🤷', label: '아직 잘 모르겠어요', recommendTitle: '랜덤 챌린지', recommendText: '인포에 있는 쌤에게 말하고 랜덤 챌린지를 뽑아보세요!' }
];

const StudentCheckinSurveyModal = ({ isOpen, onClose, user, locationName }) => {
    useModalClose(isOpen, () => onClose(false));
    const [mode, setMode] = useState('SURVEY'); // 'SURVEY' | 'QUESTION_QA' | 'CHAT_SHOUTOUT' | 'HYBRID'
    const [questionText, setQuestionText] = useState('오늘 센터에서 무엇을 하고 싶나요?');
    const [descriptionText, setDescriptionText] = useState('');
    const [qaQuestionText, setQaQuestionText] = useState('오늘 센터에서 꼭 해보고 싶은 한 가지는 무엇인가요?');
    const [qaPlaceholderText, setQaPlaceholderText] = useState('자유롭게 입력해주세요');
    const [chatPromptText, setChatPromptText] = useState('센터에 있는 친구들에게 반가운 한마디 인사를 남겨보세요!');
    const [chatPlaceholderText, setChatPlaceholderText] = useState('예: 3층 빈백존 입성! 보드게임 할 사람 덤벼라~');
    const [surveyId, setSurveyId] = useState(null);
    const [recommendationsEnabled, setRecommendationsEnabled] = useState(true);

    const [optionsList, setOptionsList] = useState(DEFAULT_SURVEY_OPTIONS);
    const [selectedLabels, setSelectedLabels] = useState([DEFAULT_SURVEY_OPTIONS[0].label]);
    const [userAnswerText, setUserAnswerText] = useState('');
    const [chatShoutoutText, setChatShoutoutText] = useState('');

    const [step, setStep] = useState('SELECT'); // 'SELECT' | 'RESULT'
    const [isSubmitting, setIsSubmitting] = useState(false);

    React.useEffect(() => {
        if (!isOpen) return;
        setStep('SELECT');
        setUserAnswerText('');
        setChatShoutoutText('');
        const fetchConfig = async () => {
            try {
                const assigned = await loadAssignedSurvey({ surveyType: 'CHECKIN', locationName });
                if (!assigned) {
                    onClose(false);
                    return;
                }
                if (assigned?.config) {
                    const parsed = assigned.config;
                    setSurveyId(assigned.id || null);
                    setRecommendationsEnabled(parsed.recommendationsEnabled !== false);
                    if (parsed.mode) setMode(parsed.mode);
                    if (parsed.question) setQuestionText(parsed.question);
                    setDescriptionText(parsed.description || '');
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
                console.error('Failed to fetch checkin survey config:', e);
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

    const handleCloseWithoutSubmitting = () => {
        try {
            const pendingNotif = sessionStorage.getItem('pending_checkin_notif');
            if (pendingNotif) {
                const parsed = JSON.parse(pendingNotif);
                sendCheckinNotification({
                    userId: parsed.userId || user?.id,
                    userName: parsed.userName || user?.name,
                    schoolName: parsed.schoolName || user?.school,
                    locationName: parsed.locationName || locationName || '하이픈',
                    isGuest: parsed.isGuest || false,
                    purposes: []
                }).catch(e => console.error('Failed fallback checkin notification:', e));
                sessionStorage.removeItem('pending_checkin_notif');
            }
        } catch (e) {
            console.error('Failed handling fallback checkin notification on close:', e);
        }
        onClose(false);
    };

    const handleConfirmSelection = async () => {
        if (!user?.id) {
            handleCloseWithoutSubmitting();
            return;
        }

        setIsSubmitting(true);
        try {
            // The QR flow records the visit before this optional survey opens.
            // Never create a second CHECKIN here: the survey can be reopened
            // and must not change a user's current visit state.

            // 1. Prepare Survey Answer Payload (survey_type: 'CHECKIN')
            const textAnswer = mode === 'QUESTION_QA'
                ? userAnswerText.trim()
                : (mode === 'CHAT_SHOUTOUT' || mode === 'HYBRID' ? chatShoutoutText.trim() : null);

            const surveyPayload = {
                user_id: user.id,
                survey_type: 'CHECKIN',
                mode: mode,
                selections: (mode === 'SURVEY' || mode === 'HYBRID') ? selectedLabels : null,
                text_answer: textAnswer,
                created_at: new Date().toISOString()
            };
            if (surveyId) {
                surveyPayload.survey_id = surveyId;
                surveyPayload.survey_snapshot = { question: questionText, description: descriptionText, qaQuestion: qaQuestionText, options: optionsList };
            }
            await supabase.from('checkin_surveys').insert([surveyPayload]);

            // 2. If Live Chat Shoutout is present, post to center_daily_chats
            const shoutoutText = chatShoutoutText.trim();
            if (shoutoutText) {
                const checkedInRegion = locationName && (locationName.includes('이높') || locationName.includes('강서'))
                    ? '강서'
                    : locationName && (locationName.includes('하이픈') || locationName.includes('강동'))
                        ? '강동'
                        : await resolveSchoolRegion(user?.school).catch(() => null);
                const centerCode = checkedInRegion === '강서'
                    ? '이높플레이스'
                    : checkedInRegion === '강동'
                        ? '하이픈'
                        : null;
                const validUserId = (user?.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id))
                    ? user.id
                    : null;

                const { error: chatErr } = centerCode
                    ? await supabase.from('center_daily_chats').insert([{
                        center_code: centerCode,
                        user_id: validUserId,
                        user_name: user.name || '익명',
                        user_avatar: user.profile_image_url || null,
                        user_role: '학생',
                        message: `[CHECK-IN] ${shoutoutText}`,
                        is_hidden: false,
                        report_count: 0
                    }])
                    : { error: new Error('학생의 센터 지역을 확인할 수 없어 라이브 한마디 전송을 건너뛰었습니다.') };

                if (chatErr) {
                    console.error('Failed to auto-post checkin shoutout to live chat:', chatErr);
                }
            }

            // 3. Trigger Realtime LINE / Discord Notification with completed answer/shoutout/survey
            let notifPurposes = [];
            if (mode === 'SURVEY' || mode === 'HYBRID') {
                notifPurposes = [...selectedLabels];
            }
            if ((mode === 'CHAT_SHOUTOUT' || mode === 'HYBRID') && chatShoutoutText.trim()) {
                notifPurposes.push(`[체크인 한마디] ${chatShoutoutText.trim()}`);
            } else if (mode === 'QUESTION_QA' && userAnswerText.trim()) {
                notifPurposes.push(`[오늘의 질문 답변] ${userAnswerText.trim()}`);
            }

            sendCheckinNotification({
                userId: user.id,
                userName: user.name,
                schoolName: user.school,
                locationName: locationName || '하이픈',
                isGuest: false,
                purposes: notifPurposes,
                surveyQuestion: mode === 'QUESTION_QA' ? qaQuestionText : questionText,
                surveyAnswers: mode === 'QUESTION_QA' ? [userAnswerText.trim()] : selectedLabels
            }).catch(e => console.error('Failed to send checkin notification:', e));

            sessionStorage.removeItem('pending_checkin_notif');
            sessionStorage.removeItem('pending_checkin_survey');
            sessionStorage.removeItem('require_checkin_survey');
            
            if ((mode === 'SURVEY' || mode === 'HYBRID') && recommendationsEnabled) {
                setStep('RESULT');
            } else {
                onClose(true);
            }
        } catch (err) {
            console.error('Failed to save student checkin survey:', err);
            onClose(true);
        } finally {
            setIsSubmitting(false);
        }
    };

    const selectedOptionsList = optionsList.filter(opt => selectedLabels.includes(opt.label));

    return (
        <div className="fixed inset-0 bg-black/60 z-[320] flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-xs">
            <motion.div
                initial={{ y: '100%', opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: '100%', opacity: 0 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl space-y-5 relative max-h-[90vh] overflow-y-auto"
            >
                {step === 'SELECT' ? (
                    <>
                        {/* Header */}
                        <div className="flex items-start justify-between">
                            <div className="space-y-1">
                                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-600 text-xs font-bold">
                                    <Sparkles size={13} className="animate-pulse" />
                                    <span>
                                        {mode === 'QUESTION_QA'
                                            ? '오늘의 체크인 질문'
                                            : (mode === 'CHAT_SHOUTOUT' ? '체크인 한마디 남기기' : '입실 방문 목적 선택')}
                                    </span>
                                </div>
                                <h3 className="text-xl font-extrabold text-[#191F28] tracking-tight">
                                    {mode === 'QUESTION_QA'
                                        ? qaQuestionText
                                        : (mode === 'CHAT_SHOUTOUT' ? chatPromptText : questionText)}
                                </h3>
                                {descriptionText && (
                                    <p className="text-xs leading-relaxed text-[#4E5968] font-medium whitespace-pre-line">
                                        {descriptionText}
                                    </p>
                                )}
                            </div>
                            <button
                                onClick={handleCloseWithoutSubmitting}
                                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 hover:text-[#191F28] transition-colors shrink-0 cursor-pointer"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        {/* QUESTION_QA Mode (Text Input) */}
                        {mode === 'QUESTION_QA' && (
                            <div className="space-y-3 pt-1">
                                <textarea
                                    value={userAnswerText}
                                    onChange={(e) => setUserAnswerText(e.target.value)}
                                    placeholder={qaPlaceholderText}
                                    rows={4}
                                    maxLength={200}
                                    className="w-full p-4 bg-[#F9FAFB] border border-gray-200 rounded-2xl text-sm font-semibold text-[#191F28] placeholder-gray-400 outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all resize-none"
                                />
                                <div className="text-right text-[11px] text-gray-400 font-medium">
                                    {userAnswerText.length} / 200자
                                </div>
                            </div>
                        )}

                        {/* CHAT_SHOUTOUT Mode (Live Chat Message Input) */}
                        {mode === 'CHAT_SHOUTOUT' && (
                            <div className="space-y-3 pt-1">
                                <textarea
                                    value={chatShoutoutText}
                                    onChange={(e) => setChatShoutoutText(e.target.value)}
                                    placeholder={chatPlaceholderText}
                                    rows={3}
                                    maxLength={150}
                                    className="w-full p-4 bg-[#F9FAFB] border border-gray-200 rounded-2xl text-sm font-semibold text-[#191F28] placeholder-gray-400 outline-none focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all resize-none"
                                />
                                <div className="text-right text-[11px] text-gray-400 font-medium">
                                    {chatShoutoutText.length} / 150자
                                </div>
                            </div>
                        )}

                        {/* SURVEY or HYBRID Mode */}
                        {(mode === 'SURVEY' || mode === 'HYBRID') && (
                            <>
                                <div className="space-y-2.5 pt-1">
                                    {optionsList.map((opt) => {
                                        const isSelected = selectedLabels.includes(opt.label);
                                        return (
                                            <button
                                                key={opt.id}
                                                type="button"
                                                onClick={() => toggleOption(opt.label)}
                                                className={`w-full p-4 rounded-2xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                                                    isSelected
                                                        ? 'bg-blue-50/70 border-blue-500 shadow-sm'
                                                        : 'bg-[#F9FAFB] border-gray-100 hover:border-gray-200'
                                                }`}
                                            >
                                                <div className="flex items-center gap-3.5">
                                                    <span className="text-2xl shrink-0">{opt.emoji}</span>
                                                    <span className={`text-sm font-extrabold ${isSelected ? 'text-blue-600' : 'text-[#191F28]'}`}>
                                                        {opt.label}
                                                    </span>
                                                </div>
                                                <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors shrink-0 ${
                                                    isSelected ? 'bg-blue-600 text-white' : 'border border-gray-300 bg-white'
                                                }`}>
                                                    {isSelected && <Check size={14} strokeWidth={3} />}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>

                                {mode === 'HYBRID' && (
                                    <div className="pt-3 border-t border-gray-100 space-y-2">
                                        <label className="block text-xs font-bold text-gray-700">
                                            💬 친구들에게 한마디 남기기 (선택)
                                        </label>
                                        <input
                                            type="text"
                                            value={chatShoutoutText}
                                            onChange={(e) => setChatShoutoutText(e.target.value)}
                                            placeholder={chatPlaceholderText}
                                            className="w-full px-3.5 py-2.5 bg-[#F9FAFB] border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 outline-none focus:bg-white focus:border-blue-500"
                                        />
                                    </div>
                                )}
                            </>
                        )}

                        {/* Submit Action Button */}
                        <button
                            onClick={handleConfirmSelection}
                            disabled={isSubmitting}
                            className="w-full py-4 bg-[#3182F6] hover:bg-[#1B64DA] text-white font-extrabold rounded-2xl shadow-[0_4px_16px_rgba(49,130,246,0.3)] active:scale-[0.98] transition-all text-base tracking-tight cursor-pointer disabled:opacity-50"
                        >
                            {isSubmitting ? '저장 중...' : '입실 완료하기'}
                        </button>
                    </>
                ) : (
                    <>
                        {/* Step 2: Recommendations Result */}
                        <div className="flex items-start justify-between border-b border-gray-100 pb-4">
                            <div className="space-y-1">
                                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-600 text-xs font-bold">
                                    <CheckCircle size={13} />
                                    <span>입실 확인 완료</span>
                                </div>
                                <h3 className="text-xl font-extrabold text-[#191F28] tracking-tight">
                                    오늘의 센터 이용 추천 ✨
                                </h3>
                                <p className="text-xs text-[#4E5968] font-medium">
                                    선택하신 목적에 맞는 공간과 추천 활동입니다.
                                </p>
                            </div>
                            <button
                                onClick={() => onClose(true)}
                                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 hover:text-[#191F28] transition-colors shrink-0 cursor-pointer"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        {/* Recommendation Cards */}
                        <div className="space-y-3 pt-1 max-h-[50vh] overflow-y-auto pr-0.5">
                            {selectedOptionsList.map((opt) => (
                                <div
                                    key={opt.id}
                                    className="p-4 rounded-2xl bg-blue-50/50 border border-blue-100 space-y-2"
                                >
                                    <div className="flex items-center gap-2">
                                        <span className="text-xl">{opt.emoji}</span>
                                        <span className="font-extrabold text-sm text-blue-900">{opt.label}</span>
                                    </div>
                                    {(opt.recommendTitle || opt.recommendText || opt.desc) && (
                                        <div className="bg-white p-3 rounded-xl border border-blue-100/80 space-y-1">
                                            {opt.recommendTitle && (
                                                <div className="text-xs font-bold text-blue-600 flex items-center gap-1">
                                                    <MapPin size={12} />
                                                    <span>{opt.recommendTitle}</span>
                                                </div>
                                            )}
                                            <p className="text-xs text-gray-600 leading-relaxed font-medium whitespace-pre-line">
                                                {opt.recommendText || opt.desc}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Close Confirm Button */}
                        <button
                            onClick={() => onClose(true)}
                            className="w-full py-4 bg-[#3182F6] hover:bg-[#1B64DA] text-white font-extrabold rounded-2xl shadow-[0_4px_16px_rgba(49,130,246,0.3)] active:scale-[0.98] transition-all text-base tracking-tight cursor-pointer"
                        >
                            확인 (센터 이용 시작하기)
                        </button>
                    </>
                )}
            </motion.div>
        </div>
    );
};

export default StudentCheckinSurveyModal;
