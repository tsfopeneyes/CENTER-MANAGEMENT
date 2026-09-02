import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Star } from 'lucide-react';
import { feedbackApi } from '../../../api/feedbackApi';
import { haifnApi } from '../../../api/haifnApi';
import { supabase } from '../../../supabaseClient';
import useModalClose from '../../../hooks/useModalClose';

const ProgramFeedbackModal = ({ program, existingFeedback, onClose, onSuccess }) => {
    useModalClose(!!program, onClose);
    const [submitting, setSubmitting] = useState(false);
    const [currentFeedback, setCurrentFeedback] = useState(existingFeedback || null);

    // Extract custom questions configured by manager in program settings
    const customConfig = program.guest_properties?.custom_feedback_config || program.custom_feedback_config;
    const customQuestions = Array.isArray(customConfig?.questions) ? customConfig.questions : [];
    const hasCustomQuestions = customQuestions.length > 0;

    // Custom Answers State
    const [customAnswers, setCustomAnswers] = useState({});

    // Default Fixed Questions State (Fallback)
    const [q1, setQ1] = useState('');
    const [q1Other, setQ1Other] = useState('');
    const [isQ1Other, setIsQ1Other] = useState(false);

    const [q2, setQ2] = useState('');
    const [q3, setQ3] = useState(0);
    const [q4, setQ4] = useState('');
    const [q5, setQ5] = useState('');
    const [q6, setQ6] = useState(0);
    const [q7, setQ7] = useState('');
    const [q8, setQ8] = useState('');

    const populateFields = (fb) => {
        if (!fb) return;
        if (fb.q8_additional_comments) {
            try {
                const parsed = JSON.parse(fb.q8_additional_comments);
                if (parsed && typeof parsed === 'object') {
                    setCustomAnswers(parsed);
                }
            } catch (e) {}
        }
        if (fb.q1_reason) {
            const standardOpts = ['친구 추천', '기존 센터 경험', '프로그램 흥미'];
            if (standardOpts.includes(fb.q1_reason)) {
                setQ1(fb.q1_reason);
                setIsQ1Other(false);
            } else {
                setIsQ1Other(true);
                setQ1Other(fb.q1_reason);
            }
        }
        if (fb.q2_experience) setQ2(fb.q2_experience);
        if (fb.q3_satisfaction) setQ3(fb.q3_satisfaction);
        if (fb.q4_best_moment) setQ4(fb.q4_best_moment);
        if (fb.q5_disappointments) setQ5(fb.q5_disappointments);
        if (fb.q6_would_rejoin) setQ6(fb.q6_would_rejoin);
        if (fb.q7_rejoin_reason) setQ7(fb.q7_rejoin_reason);
        if (fb.q8_additional_comments) setQ8(fb.q8_additional_comments);
    };

    useEffect(() => {
        const loadExisting = async () => {
            if (existingFeedback) {
                setCurrentFeedback(existingFeedback);
                populateFields(existingFeedback);
                return;
            }
            try {
                const userStr = localStorage.getItem('user');
                if (userStr && program?.id) {
                    const user = JSON.parse(userStr);
                    const { data } = await supabase
                        .from('program_feedback')
                        .select('*')
                        .eq('notice_id', program.id)
                        .eq('user_id', user.id)
                        .maybeSingle();

                    if (data) {
                        setCurrentFeedback(data);
                        populateFields(data);
                    }
                }
            } catch (e) {
                console.error('Failed to load existing feedback:', e);
            }
        };
        loadExisting();
    }, [program?.id, existingFeedback]);

    const handleCustomAnswerChange = (qKey, val) => {
        setCustomAnswers(prev => ({ ...prev, [qKey]: val }));
    };

    const handleQ1Select = (val) => {
        if (val === '기타') {
            setIsQ1Other(true);
            setQ1('');
        } else {
            setIsQ1Other(false);
            setQ1(val);
        }
    };

    const handleSubmit = async () => {
        setSubmitting(true);
        try {
            const user = JSON.parse(localStorage.getItem('user')) || {};
            let payload = {};

            if (hasCustomQuestions) {
                // Validate custom questions using unique qKey
                for (let i = 0; i < customQuestions.length; i++) {
                    const q = customQuestions[i];
                    const isUniqueId = q.id && customQuestions.filter(item => item.id === q.id).length === 1;
                    const qKey = isUniqueId ? q.id : `q_idx_${i}`;

                    if (q.required) {
                        const val = customAnswers[qKey];
                        if (val === undefined || val === null || (typeof val === 'string' && !val.trim()) || (typeof val === 'number' && val === 0)) {
                            alert(`'${q.title}' 항목에 답변해 주세요.`);
                            setSubmitting(false);
                            return;
                        }
                    }
                }

                // Format answers summary
                const answersSummary = customQuestions.map((q, idx) => {
                    const isUniqueId = q.id && customQuestions.filter(item => item.id === q.id).length === 1;
                    const qKey = isUniqueId ? q.id : `q_idx_${idx}`;
                    const ans = customAnswers[qKey] || '';
                    return `Q${idx + 1}. ${q.title}: ${ans}`;
                }).join('\n');

                const getFirstAns = (idx) => {
                    const q = customQuestions[idx];
                    if (!q) return '';
                    const isUniqueId = q.id && customQuestions.filter(item => item.id === q.id).length === 1;
                    const qKey = isUniqueId ? q.id : `q_idx_${idx}`;
                    return customAnswers[qKey] || '';
                };

                payload = {
                    notice_id: program.id,
                    user_id: user.id,
                    q1_reason: String(getFirstAns(0) || '맞춤 설문 제출'),
                    q2_experience: String(getFirstAns(1) || answersSummary),
                    q3_satisfaction: typeof getFirstAns(2) === 'number' ? getFirstAns(2) : 5,
                    q4_best_moment: String(getFirstAns(3) || ''),
                    q5_disappointments: String(getFirstAns(4) || ''),
                    q6_would_rejoin: 5,
                    q7_rejoin_reason: '',
                    q8_additional_comments: JSON.stringify(customAnswers)
                };
            } else {
                // Fallback default validation
                if (!q1 && !q1Other) { alert('참여 이유를 선택해주세요.'); setSubmitting(false); return; }
                if (!q2.trim()) { alert('경험한 것을 적어주세요.'); setSubmitting(false); return; }
                if (q3 === 0) { alert('만족도 별점을 선택해주세요.'); setSubmitting(false); return; }
                if (!q4.trim()) { alert('가장 좋았던 순간을 적어주세요.'); setSubmitting(false); return; }
                if (!q5.trim()) { alert('아쉬웠던 점을 적어주세요.'); setSubmitting(false); return; }
                if (q6 === 0) { alert('재참여 의사 별점을 선택해주세요.'); setSubmitting(false); return; }
                if (!q7.trim()) { alert('재참여 또는 망설여지는 이유를 적어주세요.'); setSubmitting(false); return; }

                const finalQ1 = isQ1Other ? q1Other : q1;

                payload = {
                    notice_id: program.id,
                    user_id: user.id,
                    q1_reason: finalQ1,
                    q2_experience: q2,
                    q3_satisfaction: q3,
                    q4_best_moment: q4,
                    q5_disappointments: q5,
                    q6_would_rejoin: q6,
                    q7_rejoin_reason: q7,
                    q8_additional_comments: q8
                };
            }

            const data = await feedbackApi.upsertFeedback(payload);

            if (!currentFeedback && program.is_review_required && program.haifn_reward > 0) {
                try {
                    await haifnApi.grantProgramReward(
                        user.id, 
                        program.id, 
                        program.haifn_reward, 
                        'System',
                        program.title + ' (리뷰 작성 완료)'
                    );
                    alert(`피드백 제출 완료! ${program.haifn_reward}H가 지급되었습니다.`);
                } catch (rErr) {
                    console.error('Reward error:', rErr);
                    alert('피드백이 저장되었으나 포인트 지급 중 오류가 발생했습니다.');
                }
            } else if (!currentFeedback) {
                alert('피드백이 정상적으로 제출되었습니다.');
            } else {
                alert('피드백이 수정되었습니다.');
            }

            onSuccess(data);
        } catch (err) {
            console.error('Feedback Error:', err);
            alert('오류가 발생했습니다: ' + err.message);
        } finally {
            setSubmitting(false);
        }
    };

    const StarRating = ({ value, onChange }) => (
        <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map(v => (
                <button
                    key={v}
                    type="button"
                    onClick={() => onChange(v)}
                    className="focus:outline-none transition-transform active:scale-90 cursor-pointer"
                >
                    <Star
                        size={32}
                        className={value >= v ? 'fill-amber-400 text-amber-400' : 'text-tossGrey200 fill-tossGrey100'}
                    />
                </button>
            ))}
        </div>
    );

    return (
        <div 
            className="fixed inset-0 z-[999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-xs"
            onClick={onClose}
        >
            <motion.div
                initial={{ opacity: 0, y: "100%" }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: "100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 200 }}
                className="bg-white w-full h-[90vh] sm:h-auto sm:max-h-[90vh] sm:max-w-md rounded-t-toss-2xl sm:rounded-toss-2xl shadow-toss-elevated flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header Section */}
                <div className="flex items-center justify-between px-6 py-5 border-b border-tossGrey100 bg-white z-10 sticky top-0 shrink-0">
                    <div>
                        <h2 className="text-xl font-bold text-tossGrey900 tracking-tight">프로그램 피드백</h2>
                        <p className="text-xs font-medium text-tossGrey500 mt-0.5 line-clamp-1">{program.title}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 bg-tossGrey50 rounded-full text-tossGrey400 hover:text-tossGrey800 transition-colors cursor-pointer"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Form Content */}
                <div className="flex-1 overflow-y-auto px-6 py-6 pb-24 touch-pan-y bg-tossGrey50/50 space-y-7">
                    {hasCustomQuestions ? (
                        /* Render Custom Questions Configured by Manager */
                        customQuestions.map((q, idx) => {
                            const isUniqueId = q.id && customQuestions.filter(item => item.id === q.id).length === 1;
                            const qKey = isUniqueId ? q.id : `q_idx_${idx}`;

                            const qType = q.type || 'text';
                            const rawOpts = q.options;
                            let optsArray = [];
                            if (Array.isArray(rawOpts)) {
                                optsArray = rawOpts;
                            } else if (typeof rawOpts === 'string' && rawOpts.trim()) {
                                optsArray = rawOpts.split(',').map(s => s.trim()).filter(Boolean);
                            }

                            const currentAns = customAnswers[qKey];
                            const isChoice = qType === 'choice' && optsArray.length > 0;
                            const isStar = qType === 'star';
                            const isShort = qType === 'short';

                            return (
                                <div key={qKey} className="space-y-2.5">
                                    <label className="block text-sm font-bold text-tossGrey900 leading-snug">
                                        {idx + 1}. {q.title} {q.required && <span className="text-tossError">*</span>}
                                    </label>

                                    {isChoice ? (
                                        /* 객관식 (Choice) */
                                        <div className="space-y-2">
                                            <div className="flex flex-wrap gap-2">
                                                {optsArray.map(opt => (
                                                    <button
                                                        key={opt}
                                                        type="button"
                                                        onClick={() => handleCustomAnswerChange(qKey, opt)}
                                                        className={`px-4 py-2.5 rounded-toss-lg text-sm font-bold border transition-colors cursor-pointer ${
                                                            currentAns === opt
                                                            ? 'bg-tossBlue border-tossBlue text-white shadow-xs' 
                                                            : 'bg-white border-tossGrey200 text-tossGrey700 hover:bg-tossGrey50'
                                                        }`}
                                                    >
                                                        {opt}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ) : isStar ? (
                                        /* 별점 평가 (Star) */
                                        <StarRating 
                                            value={typeof currentAns === 'number' ? currentAns : 0} 
                                            onChange={(val) => handleCustomAnswerChange(qKey, val)} 
                                        />
                                    ) : isShort ? (
                                        /* 단답형 (Short) */
                                        <input
                                            type="text"
                                            placeholder="자유롭게 작성해주세요!"
                                            value={typeof currentAns === 'string' ? currentAns : ''}
                                            onChange={e => handleCustomAnswerChange(qKey, e.target.value)}
                                            className="w-full p-4 bg-white border border-tossGrey200 rounded-toss-xl text-sm font-medium text-tossGrey900 focus:border-tossBlue focus:ring-2 focus:ring-tossBlueLight outline-none shadow-xs placeholder:text-tossGrey400"
                                        />
                                    ) : (
                                        /* 주관식 (Text / Essay) */
                                        <textarea
                                            rows={3}
                                            placeholder="자유롭게 작성해주세요!"
                                            value={typeof currentAns === 'string' ? currentAns : ''}
                                            onChange={e => handleCustomAnswerChange(qKey, e.target.value)}
                                            className="w-full p-4 bg-white border border-tossGrey200 rounded-toss-xl text-sm font-medium text-tossGrey900 focus:border-tossBlue focus:ring-2 focus:ring-tossBlueLight outline-none resize-none shadow-xs placeholder:text-tossGrey400"
                                        />
                                    )}
                                </div>
                            );
                        })
                    ) : (
                        /* Default Fixed Questions Fallback */
                        <>
                            {/* Q1 */}
                            <div className="space-y-2.5">
                                <label className="block text-sm font-bold text-tossGrey900">1. 이 프로그램에 참여한 이유는 무엇이었나요? <span className="text-tossError">*</span></label>
                                <div className="flex flex-wrap gap-2">
                                    {['친구 추천', '기존 센터 경험', '프로그램 흥미', '기타'].map(opt => (
                                        <button
                                            key={opt}
                                            type="button"
                                            onClick={() => handleQ1Select(opt)}
                                            className={`px-4 py-2.5 rounded-toss-lg text-sm font-bold border transition-colors cursor-pointer ${
                                                (isQ1Other && opt === '기타') || (!isQ1Other && q1 === opt)
                                                ? 'bg-tossBlue border-tossBlue text-white shadow-xs' 
                                                : 'bg-white border-tossGrey200 text-tossGrey700 hover:bg-tossGrey50'
                                            }`}
                                        >
                                            {opt}
                                        </button>
                                    ))}
                                </div>
                                {isQ1Other && (
                                    <input
                                        type="text"
                                        placeholder="자유롭게 작성해주세요!"
                                        value={q1Other}
                                        onChange={e => setQ1Other(e.target.value)}
                                        className="w-full mt-2 p-3.5 bg-white border border-tossGrey200 rounded-toss-xl text-sm font-medium text-tossGrey900 focus:border-tossBlue outline-none placeholder:text-tossGrey400"
                                    />
                                )}
                            </div>

                            {/* Q2 */}
                            <div className="space-y-2.5">
                                <label className="block text-sm font-bold text-tossGrey900">2. 오늘 프로그램을 통해 어떤 것을 경험했나요? <span className="text-tossError">*</span></label>
                                <textarea
                                    rows={3}
                                    placeholder="자유롭게 작성해주세요!"
                                    value={q2}
                                    onChange={e => setQ2(e.target.value)}
                                    className="w-full p-4 bg-white border border-tossGrey200 rounded-toss-xl text-sm font-medium text-tossGrey900 focus:border-tossBlue outline-none resize-none placeholder:text-tossGrey400"
                                />
                            </div>

                            {/* Q3 */}
                            <div className="space-y-2.5">
                                <label className="block text-sm font-bold text-tossGrey900">3. 오늘 경험은 얼마나 만족스러웠나요? <span className="text-tossError">*</span></label>
                                <StarRating value={q3} onChange={setQ3} />
                            </div>

                            {/* Q4 */}
                            <div className="space-y-2.5">
                                <label className="block text-sm font-bold text-tossGrey900">4. 가장 좋았던 순간은 언제였나요? <span className="text-tossError">*</span></label>
                                <textarea
                                    rows={2}
                                    placeholder="자유롭게 작성해주세요!"
                                    value={q4}
                                    onChange={e => setQ4(e.target.value)}
                                    className="w-full p-4 bg-white border border-tossGrey200 rounded-toss-xl text-sm font-medium text-tossGrey900 focus:border-tossBlue outline-none resize-none placeholder:text-tossGrey400"
                                />
                            </div>

                            {/* Q5 */}
                            <div className="space-y-2.5">
                                <label className="block text-sm font-bold text-tossGrey900">5. 아쉽거나 불편했던 순간이 있었나요? <span className="text-tossError">*</span></label>
                                <textarea
                                    rows={2}
                                    placeholder="자유롭게 작성해주세요!"
                                    value={q5}
                                    onChange={e => setQ5(e.target.value)}
                                    className="w-full p-4 bg-white border border-tossGrey200 rounded-toss-xl text-sm font-medium text-tossGrey900 focus:border-tossBlue outline-none resize-none placeholder:text-tossGrey400"
                                />
                            </div>

                            {/* Q6 */}
                            <div className="space-y-2.5">
                                <label className="block text-sm font-bold text-tossGrey900">6. 비슷한 프로그램이 열린다면 다시 함께하고 싶나요? <span className="text-tossError">*</span></label>
                                <StarRating value={q6} onChange={setQ6} />
                            </div>

                            {/* Q7 */}
                            <div className="space-y-2.5">
                                <label className="block text-sm font-bold text-tossGrey900">7. 어떤 점 때문에 다시 참여하고 싶거나, 망설여지나요? <span className="text-tossError">*</span></label>
                                <textarea
                                    rows={3}
                                    placeholder="자유롭게 작성해주세요!"
                                    value={q7}
                                    onChange={e => setQ7(e.target.value)}
                                    className="w-full p-4 bg-white border border-tossGrey200 rounded-toss-xl text-sm font-medium text-tossGrey900 focus:border-tossBlue outline-none resize-none placeholder:text-tossGrey400"
                                />
                            </div>

                            {/* Q8 */}
                            <div className="space-y-2.5">
                                <label className="block text-sm font-bold text-tossGrey900">8. 마지막으로 하고 싶은 말이 있다면 자유롭게 적어주세요!</label>
                                <textarea
                                    rows={3}
                                    placeholder="자유롭게 작성해주세요!"
                                    value={q8}
                                    onChange={e => setQ8(e.target.value)}
                                    className="w-full p-4 bg-white border border-tossGrey200 rounded-toss-xl text-sm font-medium text-tossGrey900 focus:border-tossBlue outline-none resize-none placeholder:text-tossGrey400"
                                />
                            </div>
                        </>
                    )}
                </div>

                {/* Footer Action */}
                <div className="shrink-0 p-4 bg-white border-t border-tossGrey100">
                    <button
                        onClick={handleSubmit}
                        disabled={submitting}
                        className="w-full py-4 bg-tossBlue disabled:bg-tossGrey300 text-white rounded-toss-xl font-bold text-base transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center"
                    >
                        {submitting ? '제출 중...' : (currentFeedback ? '수정하기' : '제출하기')}
                    </button>
                </div>
            </motion.div>
        </div>
    );
};

export default ProgramFeedbackModal;
