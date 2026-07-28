import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Check, X, ChevronRight, CheckCircle, MapPin } from 'lucide-react';
import { supabase } from '../../../supabaseClient';
import { sendCheckinNotification } from '../../../utils/integrationUtils';

const DEFAULT_SURVEY_OPTIONS = [
    { id: '1', emoji: '🍽️', label: '당 충전하며 쉬고 싶어요', recommendTitle: '2F SQUARE, 3F ROUND 빈백존', recommendText: '2층 냉장고에서 간식 먹고, 3층 빈백에서 뒹굴뒹굴' },
    { id: '2', emoji: '🎲', label: '아무 생각 없이 놀고 싶어요', recommendTitle: '3F ROUND', recommendText: '루미큐브, 텔레스트레이션 등 보드게임 ㄱㄱ' },
    { id: '3', emoji: '☕', label: '누군가와 이야기하고 싶어요', recommendTitle: 'COFFEE CHAT', recommendText: '스처쌤과 함께 진대 어떰?\n인포에 있는 쌤이나 앱에서 커피챗 ㄱㄱ' },
    { id: '4', emoji: '🙏', label: '기도하거나 예배하고 싶어요', recommendTitle: '2F SQUARE ROOM 1', recommendText: '조용히 방에 들어가 필사와 기도의 시간을 가져보자' },
    { id: '5', emoji: '📚', label: '조용히 집중하고 싶어요', recommendTitle: '4F CONNECT', recommendText: '해야 하는 숙제나 일이 있다면 짧고 굵게 집중해보자' },
    { id: '6', emoji: '🤷', label: '아직 잘 모르겠어요', recommendTitle: '랜덤 챌린지', recommendText: '인포에 있는 쌤에게 말하고 랜덤 챌린지를 뽑아보세요!' }
];

const StudentCheckinSurveyModal = ({ isOpen, onClose, user, locationName }) => {
    const [questionText, setQuestionText] = useState('오늘 센터에서 무엇을 하고 싶나요?');
    const [optionsList, setOptionsList] = useState(DEFAULT_SURVEY_OPTIONS);
    const [selectedLabels, setSelectedLabels] = useState([DEFAULT_SURVEY_OPTIONS[0].label]);
    const [step, setStep] = useState('SELECT'); // 'SELECT' | 'RESULT'
    const [isSubmitting, setIsSubmitting] = useState(false);

    React.useEffect(() => {
        if (!isOpen) return;
        setStep('SELECT');
        const fetchConfig = async () => {
            try {
                const { data } = await supabase
                    .from('notices')
                    .select('content')
                    .eq('category', 'SYSTEM')
                    .eq('title', 'CHECKIN_SURVEY_CONFIG')
                    .maybeSingle();

                if (data?.content) {
                    const parsed = JSON.parse(data.content);
                    if (parsed.question) setQuestionText(parsed.question);
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
    }, [isOpen]);

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

    const handleConfirmSelection = async () => {
        if (!user?.id) {
            onClose(false);
            return;
        }

        setIsSubmitting(true);
        try {
            const now = new Date();
            const kstDate = new Date(now.getTime() + (now.getTimezoneOffset() * 60000) + (9 * 60 * 60 * 1000));
            const y = kstDate.getFullYear();
            const m = String(kstDate.getMonth() + 1).padStart(2, '0');
            const d = String(kstDate.getDate()).padStart(2, '0');
            const todayKst = `${y}-${m}-${d}`;

            // 0. Insert CHECKIN log into logs table if not present today
            const { data: existingLogs } = await supabase
                .from('logs')
                .select('id')
                .eq('user_id', user.id)
                .eq('type', 'CHECKIN')
                .gte('created_at', `${todayKst}T00:00:00+09:00`)
                .limit(1);

            if (!existingLogs || existingLogs.length === 0) {
                const { data: locations } = await supabase.from('locations').select('id, name');
                const haifnLoc = (locations || []).find(l => l.name.includes('하이픈')) || locations?.[0];
                await supabase.from('logs').insert([{
                    user_id: user.id,
                    location_id: haifnLoc?.id || null,
                    type: 'CHECKIN'
                }]);
            }

            // 1. Insert checkin_surveys record
            await supabase.from('checkin_surveys').insert([{
                user_id: user.id,
                selections: selectedLabels,
                created_at: new Date().toISOString()
            }]);

            // 2. Trigger Realtime LINE / Discord Notification
            sendCheckinNotification({
                userName: user.name,
                schoolName: user.school,
                locationName: locationName || '하이픈',
                isGuest: false,
                purposes: selectedLabels
            }).catch(e => console.error('Failed to send checkin notification:', e));

            sessionStorage.removeItem('pending_checkin_survey');
            sessionStorage.removeItem('require_checkin_survey');
            setStep('RESULT');
        } catch (err) {
            console.error('Failed to save student checkin survey:', err);
            setStep('RESULT');
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
                                    <span>입실 방문 목적 선택</span>
                                </div>
                                <h3 className="text-xl font-extrabold text-[#191F28] tracking-tight">
                                    {questionText}
                                </h3>
                                <p className="text-xs text-[#4E5968] font-medium">
                                    원하시는 방문 목적을 자유롭게 선택해 주세요. (중복 선택 가능)
                                </p>
                            </div>
                            <button
                                onClick={() => onClose(false)}
                                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 hover:text-[#191F28] transition-colors shrink-0 cursor-pointer"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        {/* Survey Option Buttons (TITLE ONLY) */}
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

                        {/* Submit Action Button */}
                        <button
                            onClick={handleConfirmSelection}
                            disabled={isSubmitting}
                            className="w-full py-4 bg-[#3182F6] hover:bg-[#1B64DA] text-white font-extrabold rounded-2xl shadow-[0_4px_16px_rgba(49,130,246,0.3)] active:scale-[0.98] transition-all text-base tracking-tight cursor-pointer disabled:opacity-50"
                        >
                            {isSubmitting ? '저장 중...' : '선택 완료'}
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
