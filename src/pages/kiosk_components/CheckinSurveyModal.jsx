import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HelpCircle, ChevronRight, X, Sparkles, Clock, CheckCircle } from 'lucide-react';

const CheckinSurveyModal = ({
    isOpen,
    status,
    surveyConfig,
    selections,
    onComplete,
    onClose,
    onBack,
    user
}) => {
    const [selectedIds, setSelectedIds] = useState([]);
    const [countdown, setCountdown] = useState(10);

    // Reset selection state when modal opens
    useEffect(() => {
        if (isOpen && status === 'SHOW_SURVEY') {
            setSelectedIds([]);
        }
    }, [isOpen, status]);

    // Handle 10-second countdown in recommendation view
    useEffect(() => {
        let timer;
        if (isOpen && status === 'SHOW_RECOMMENDATIONS') {
            setCountdown(10);
            timer = setInterval(() => {
                setCountdown(prev => {
                    if (prev <= 1) {
                        clearInterval(timer);
                        onClose();
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        }
        return () => clearInterval(timer);
    }, [isOpen, status, onClose]);

    if (!isOpen) return null;

    const [customText, setCustomText] = useState('');

    const activeMode = surveyConfig?.mode || 'SURVEY';
    const question = surveyConfig?.question || '오늘 하이픈에서 무엇을 하고 싶나요?';
    const description = surveyConfig?.description || '';
    const options = surveyConfig?.options || [];
    const qaQuestion = surveyConfig?.qaQuestion || '오늘 센터에서 꼭 해보고 싶은 한 가지는 무엇인가요?';
    const qaPlaceholder = surveyConfig?.qaPlaceholder || '자유롭게 작성해 주세요';
    const chatPrompt = surveyConfig?.chatPrompt || '센터에 있는 친구들에게 한마디 인사를 남겨보세요!';
    const chatPlaceholder = surveyConfig?.chatPlaceholder || '예: 3층 빈백존 입성! 보드게임 할 사람 덤벼라~';

    const handleToggleSelect = (id) => {
        if (selectedIds.includes(id)) {
            setSelectedIds(selectedIds.filter(x => x !== id));
        } else {
            setSelectedIds([...selectedIds, id]);
        }
    };

    const handleConfirm = () => {
        if (activeMode === 'CHAT_SHOUTOUT' || activeMode === 'QUESTION_QA') {
            onComplete(customText.trim() ? [customText.trim()] : []);
        } else if (activeMode === 'HYBRID') {
            const combined = [...selectedIds];
            if (customText.trim()) combined.push(customText.trim());
            onComplete(combined);
        } else {
            onComplete(selectedIds);
        }
    };

    // Filter configuration options that match student's selections
    const matchedRecommendations = options.filter(o => selections.includes(o.id));

    return (
        <div className="fixed inset-0 bg-slate-900/80 z-[130] flex items-start sm:items-center justify-center p-4 sm:p-6 backdrop-blur-md animate-fade-in overflow-y-auto">
            <AnimatePresence mode="wait">
                {status === 'SHOW_SURVEY' ? (
                    <motion.div
                        key="survey-step"
                        initial={{ scale: 0.95, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.95, opacity: 0, y: -20 }}
                        className="bg-white w-full max-w-2xl rounded-[3rem] p-8 sm:p-12 shadow-2xl relative flex flex-col gap-6"
                    >
                        <div className="text-center space-y-2">
                            <span className="text-xs font-black text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full uppercase tracking-wider">
                                {user?.name ? `${user.name}님 입실 확인` : '입실 설문'}
                            </span>
                            <h3 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight mt-2">
                                {activeMode === 'CHAT_SHOUTOUT' ? chatPrompt :
                                 activeMode === 'QUESTION_QA' ? qaQuestion :
                                 question}
                            </h3>
                            {description && (
                                <p className="text-slate-400 text-xs font-bold leading-relaxed whitespace-pre-line">
                                    {description}
                                </p>
                            )}
                        </div>

                        {/* Mode 2: 주관식 오늘의 질문 / Mode 3: 라이브 채팅 한마디 */}
                        {(activeMode === 'CHAT_SHOUTOUT' || activeMode === 'QUESTION_QA') ? (
                            <div className="my-4 space-y-3">
                                <textarea
                                    value={customText}
                                    onChange={(e) => setCustomText(e.target.value)}
                                    placeholder={activeMode === 'CHAT_SHOUTOUT' ? chatPlaceholder : qaPlaceholder}
                                    rows={4}
                                    className="w-full p-5 bg-slate-50 border-2 border-slate-200 focus:border-blue-500 focus:bg-white rounded-2xl outline-none font-bold text-slate-800 text-base resize-none transition-all shadow-inner"
                                />
                            </div>
                        ) : (
                            /* Mode 1 & Mode 4: 객관식 설문 카드 목록 */
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-4 max-h-[50vh] overflow-y-auto pr-1">
                                {options.map((opt) => {
                                    const isSelected = selectedIds.includes(opt.id);
                                    return (
                                        <button
                                            key={opt.id}
                                            type="button"
                                            onClick={() => handleToggleSelect(opt.id)}
                                            className={`p-6 rounded-[2rem] border-2 text-left flex items-center gap-4 transition-all duration-200 active:scale-95 ${isSelected ? 'bg-blue-50 border-blue-500 shadow-lg shadow-blue-50/50' : 'bg-slate-50 border-slate-100 hover:border-slate-200'}`}
                                        >
                                            <span className="text-3xl shrink-0">{opt.emoji}</span>
                                            <div className="flex-1 min-w-0">
                                                <p className={`font-black text-sm sm:text-base whitespace-normal break-keep ${isSelected ? 'text-blue-600' : 'text-slate-700'}`}>
                                                    {opt.label}
                                                </p>
                                            </div>
                                            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${isSelected ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300 bg-white'}`}>
                                                {isSelected && <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {/* Mode 4: HYBRID 인 경우 채팅 메시지 추가 입력 */}
                        {activeMode === 'HYBRID' && (
                            <div className="my-2 space-y-1">
                                <label className="text-xs font-bold text-slate-600 block">{chatPrompt}</label>
                                <input
                                    type="text"
                                    value={customText}
                                    onChange={(e) => setCustomText(e.target.value)}
                                    placeholder={chatPlaceholder}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-xl outline-none text-xs font-bold text-slate-800 transition-all"
                                />
                            </div>
                        )}

                        <div className="flex gap-4 border-t border-slate-100 pt-6">
                            <button
                                type="button"
                                onClick={() => onComplete([])}
                                className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-2xl font-black transition-all active:scale-95 text-center text-sm"
                            >
                                건너뛰기
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirm}
                                className="flex-1 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black transition-all active:scale-95 shadow-lg shadow-blue-100 text-center text-sm flex items-center justify-center gap-1.5"
                            >
                                완료 <ChevronRight size={16} />
                            </button>
                        </div>
                    </motion.div>
                ) : (
                    <motion.div
                        key="recommendation-step"
                        initial={{ scale: 0.95, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.95, opacity: 0, y: -20 }}
                        className="bg-white text-slate-800 w-full max-w-2xl rounded-[3rem] p-8 sm:p-12 shadow-2xl relative flex flex-col gap-6 border border-slate-50"
                    >
                        <div className="flex justify-between items-center border-b border-slate-100 pb-5 shrink-0">
                            <div className="flex items-center gap-2 text-emerald-600">
                                <CheckCircle size={20} className="fill-emerald-50" />
                                <span className="text-xs font-black uppercase tracking-wider">입실 등록 성공</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-blue-600 font-black bg-blue-50 border border-blue-100 px-3 py-1.5 rounded-full animate-pulse">
                                <Clock size={12} />
                                <span>{countdown}초 후 자동 닫힘</span>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto space-y-4 max-h-[50vh] pr-1">
                            <div className="text-center py-4">
                                <h3 className="text-xl sm:text-2xl font-black text-slate-800 leading-tight">
                                    오늘의 하이픈 추천 ✨
                                </h3>
                                <p className="text-slate-500 text-xs mt-1">하이픈에서 오늘의 나에게 맞는 콘텐츠를 제안해드립니다</p>
                            </div>

                            {matchedRecommendations.length === 0 ? (
                                <div className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100 text-center text-slate-500 text-xs font-bold leading-relaxed">
                                    자유롭게 공간을 둘러보세요!<br />
                                    이용 중 질문이나 필요한 것이 있으면 언제든 선생님께 문의해 주세요 👋
                                </div>
                            ) : (
                                matchedRecommendations.map(rec => (
                                    <div key={rec.id} className="p-6 bg-slate-50/50 hover:bg-slate-50 rounded-[2rem] border border-slate-100 flex gap-4 items-start transition-colors duration-150">
                                        <span className="text-3xl shrink-0 p-2.5 bg-white border border-slate-100/60 shadow-sm rounded-2xl">{rec.emoji}</span>
                                        <div className="space-y-1">
                                            <h4 className="font-black text-sm sm:text-base text-blue-600 flex items-center gap-1.5">
                                                <Sparkles size={14} className="text-blue-500 shrink-0" />
                                                {rec.recommendTitle}
                                            </h4>
                                            <p className="text-slate-600 text-xs leading-relaxed font-bold break-all">
                                                {rec.recommendText}
                                            </p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        <div className="flex gap-4 mt-2 shrink-0">
                            <button
                                type="button"
                                onClick={onClose}
                                className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black transition-all active:scale-95 text-center text-sm shadow-lg shadow-blue-100"
                            >
                                확인
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default CheckinSurveyModal;
