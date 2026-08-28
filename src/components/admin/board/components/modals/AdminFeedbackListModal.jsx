import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Star, User, Sparkles, MessageSquare, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../../../../../supabaseClient';

const AdminFeedbackListModal = ({ notice, onClose }) => {
    const [feedbacks, setFeedbacks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedIds, setExpandedIds] = useState(new Set());

    const customConfig = notice?.guest_properties?.custom_feedback_config || notice?.custom_feedback_config;
    const customQuestions = Array.isArray(customConfig?.questions) ? customConfig.questions : [];
    const hasCustomQuestions = customQuestions.length > 0;

    const getAnswerForQuestion = (feedback, question, questionIndex) => {
        let parsed = null;
        if (feedback.q8_additional_comments) {
            try { parsed = JSON.parse(feedback.q8_additional_comments); } catch (e) {}
        }

        if (parsed && typeof parsed === 'object') {
            const answer = parsed[question.id] ?? parsed[`q${questionIndex + 1}`];
            if (answer !== undefined && answer !== null && answer !== '') return answer;
        }

        if (questionIndex === 0) return feedback.q1_reason;
        if (questionIndex === 1) return feedback.q2_experience;
        if (questionIndex === 2) return feedback.q3_satisfaction;
        if (questionIndex === 3) return feedback.q4_best_moment;
        if (questionIndex === 4) return feedback.q5_disappointments;
        return null;
    };

    // Only show a rating badge when this feedback form actually has a star question.
    // For custom forms, use the configured star question instead of the legacy q3 field.
    const getFeedbackRating = (feedback) => {
        const ratingQuestionIndex = hasCustomQuestions
            ? customQuestions.findIndex(question => question.type === 'star')
            : 2;

        if (ratingQuestionIndex < 0) return null;

        const rawRating = hasCustomQuestions
            ? getAnswerForQuestion(feedback, customQuestions[ratingQuestionIndex], ratingQuestionIndex)
            : feedback.q3_satisfaction;
        const rating = Number(rawRating);

        return Number.isFinite(rating) && rating > 0 ? rating : null;
    };

    useEffect(() => {
        const loadFeedbacks = async () => {
            if (!notice?.id) return;
            setLoading(true);
            try {
                const { data, error } = await supabase
                    .from('program_feedback')
                    .select('*, users(name, school)')
                    .eq('notice_id', notice.id)
                    .order('created_at', { ascending: false });

                if (error) throw error;
                setFeedbacks(data || []);
            } catch (err) {
                console.error('Error fetching feedbacks:', err);
            } finally {
                setLoading(false);
            }
        };
        loadFeedbacks();
    }, [notice?.id]);

    // Accordion toggle helpers
    const toggleExpand = (id) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const isAllExpanded = feedbacks.length > 0 && expandedIds.size === feedbacks.length;

    const toggleAll = () => {
        if (isAllExpanded) {
            setExpandedIds(new Set());
        } else {
            const allIds = new Set(feedbacks.map((f, idx) => f.id || idx));
            setExpandedIds(allIds);
        }
    };

    // Compute question-by-question summary analytics
    const questionSummaries = useMemo(() => {
        if (!feedbacks || feedbacks.length === 0) return [];

        const total = feedbacks.length;
        const questionsToAnalyze = hasCustomQuestions 
            ? customQuestions 
            : [
                { id: 'q1', title: '참여 이유', type: 'choice' },
                { id: 'q2', title: '경험한 내용', type: 'text' },
                { id: 'q3', title: '만족도 평가', type: 'star' },
                { id: 'q4', title: '가장 좋았던 순간', type: 'text' },
                { id: 'q5', title: '아쉬웠던 점', type: 'text' }
            ];

        return questionsToAnalyze.map((q, idx) => {
            const answers = [];
            feedbacks.forEach(f => {
                let parsed = null;
                if (f.q8_additional_comments) {
                    try { parsed = JSON.parse(f.q8_additional_comments); } catch (e) {}
                }

                let val = null;
                if (parsed && typeof parsed === 'object') {
                    val = parsed[q.id] ?? parsed[`q${idx + 1}`];
                }
                if (val === undefined || val === null || val === '') {
                    if (idx === 0) val = f.q1_reason;
                    else if (idx === 1) val = f.q2_experience;
                    else if (idx === 2) val = f.q3_satisfaction;
                    else if (idx === 3) val = f.q4_best_moment;
                    else if (idx === 4) val = f.q5_disappointments;
                }

                if (val !== undefined && val !== null && val !== '') {
                    answers.push(val);
                }
            });

            const qType = q.type || 'text';
            
            if (qType === 'star') {
                const numAnswers = answers.map(Number).filter(n => !isNaN(n) && n > 0);
                const sum = numAnswers.reduce((a, b) => a + b, 0);
                const avg = numAnswers.length > 0 ? (sum / numAnswers.length).toFixed(1) : '-';
                return {
                    title: q.title || `질문 ${idx + 1}`,
                    type: 'star',
                    avg,
                    totalAnswers: numAnswers.length
                };
            } else if (qType === 'choice') {
                const counts = {};
                answers.forEach(a => {
                    const str = String(a).trim();
                    counts[str] = (counts[str] || 0) + 1;
                });

                const sorted = Object.entries(counts)
                    .map(([text, count]) => ({
                        text,
                        count,
                        percentage: Math.round((count / total) * 100)
                    }))
                    .sort((a, b) => b.count - a.count);

                return {
                    title: q.title || `질문 ${idx + 1}`,
                    type: 'choice',
                    groupedAnswers: sorted,
                    totalAnswers: answers.length
                };
            } else {
                const textList = answers.map(a => String(a).trim()).filter(Boolean);
                return {
                    title: q.title || `질문 ${idx + 1}`,
                    type: 'text',
                    responses: textList,
                    totalAnswers: textList.length
                };
            }
        });
    }, [feedbacks, customQuestions, hasCustomQuestions]);

    return (
        <div 
            className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
            onClick={onClose}
        >
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className="bg-white w-full max-w-2xl max-h-[85vh] rounded-toss-2xl shadow-toss-elevated flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-5 border-b border-tossGrey100 bg-white z-10 sticky top-0 shrink-0">
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-xl font-extrabold text-tossGrey900 tracking-tight">피드백 제출 응답</h2>
                            <span className="px-2.5 py-0.5 bg-tossBlueLight text-tossBlue rounded-full text-xs font-bold">
                                총 {feedbacks.length}건
                            </span>
                        </div>
                        <p className="text-xs font-medium text-tossGrey500 mt-1 line-clamp-1">{notice?.title}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 bg-tossGrey50 rounded-full text-tossGrey400 hover:text-tossGrey800 transition-colors cursor-pointer"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto p-6 bg-tossGrey50/50 space-y-6">
                    {loading ? (
                        <div className="py-16 text-center text-tossGrey400 font-bold text-sm">
                            피드백 불러오는 중...
                        </div>
                    ) : feedbacks.length === 0 ? (
                        <div className="py-16 text-center text-tossGrey400 font-bold text-sm">
                            아직 제출된 피드백이 없습니다.
                        </div>
                    ) : (
                        <>
                            {/* 1. TOP SUMMARY SECTION */}
                            {questionSummaries.length > 0 && (
                                <div className="bg-white rounded-toss-2xl p-5 border border-tossBlue/20 shadow-xs space-y-4">
                                    <div className="flex items-center justify-between pb-3 border-b border-tossGrey100">
                                        <div className="flex items-center gap-2">
                                            <div className="w-7 h-7 rounded-full bg-tossBlueLight text-tossBlue flex items-center justify-center font-bold text-xs">
                                                <Sparkles size={14} />
                                            </div>
                                            <h3 className="font-extrabold text-base text-tossGrey900">질문별 피드백 종합 요약</h3>
                                        </div>
                                        <span className="text-xs font-bold text-tossGrey500">
                                            총 {feedbacks.length}명 참여
                                        </span>
                                    </div>

                                    <div className="space-y-4">
                                        {questionSummaries.map((summary, sIdx) => (
                                            <div key={sIdx} className="bg-tossGrey50/80 p-4 rounded-toss-xl space-y-2 border border-tossGrey100">
                                                <div className="flex items-center justify-between">
                                                    <p className="text-xs font-bold text-tossBlue leading-snug">
                                                        Q{sIdx + 1}. {summary.title}
                                                    </p>
                                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-tossGrey200/60 text-tossGrey600">
                                                        {summary.type === 'star' ? '별점' : summary.type === 'choice' ? '객관식' : '주관식'}
                                                    </span>
                                                </div>

                                                {summary.type === 'star' ? (
                                                    <div className="flex items-center gap-2 pt-1">
                                                        <Star size={18} className="fill-amber-400 text-amber-400" />
                                                        <span className="text-lg font-black text-tossGrey900">{summary.avg}점</span>
                                                        <span className="text-xs font-medium text-tossGrey400">({summary.totalAnswers}명 평가)</span>
                                                    </div>
                                                ) : summary.type === 'choice' ? (
                                                    <div className="space-y-2 pt-1">
                                                        {summary.groupedAnswers.length === 0 ? (
                                                            <p className="text-xs text-tossGrey400 font-medium">작성된 답변이 없습니다.</p>
                                                        ) : (
                                                            summary.groupedAnswers.map((g, gIdx) => (
                                                                <div key={gIdx} className="space-y-1">
                                                                    <div className="flex justify-between items-center text-xs font-medium">
                                                                        <span className="text-tossGrey800 font-bold leading-normal break-words pr-2">{g.text}</span>
                                                                        <span className="text-tossBlue font-extrabold shrink-0">
                                                                            {g.count}명 ({g.percentage}%)
                                                                        </span>
                                                                    </div>
                                                                    <div className="w-full bg-tossGrey200/60 rounded-full h-1.5 overflow-hidden">
                                                                        <div 
                                                                            className="bg-tossBlue h-full rounded-full transition-all duration-500" 
                                                                            style={{ width: `${g.percentage}%` }}
                                                                        />
                                                                    </div>
                                                                </div>
                                                            ))
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="space-y-2 pt-1">
                                                        {summary.responses.length === 0 ? (
                                                            <p className="text-xs text-tossGrey400 font-medium">작성된 답변이 없습니다.</p>
                                                        ) : (
                                                            <div className="flex flex-col gap-1.5">
                                                                {summary.responses.map((txt, tIdx) => (
                                                                    <div key={tIdx} className="bg-white p-2.5 rounded-toss-lg border border-tossGrey200 text-xs font-medium text-tossGrey800 shadow-2xs leading-normal flex items-start gap-1.5">
                                                                        <MessageSquare size={13} className="text-tossBlue shrink-0 mt-0.5" />
                                                                        <span>"{txt}"</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* 2. INDIVIDUAL STUDENT REVIEWS LIST (COLLAPSIBLE ACCORDION) */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between px-1">
                                    <h3 className="text-xs font-bold text-tossGrey500">
                                        개별 상세 제출 내역 ({feedbacks.length}건)
                                    </h3>
                                    {feedbacks.length > 0 && (
                                        <button
                                            onClick={toggleAll}
                                            className="text-xs font-bold text-tossBlue hover:text-tossBlueHover transition-colors flex items-center gap-1 cursor-pointer px-2.5 py-1 bg-tossBlueLight rounded-toss-lg"
                                        >
                                            {isAllExpanded ? '모두 접기' : '모두 열기'}
                                        </button>
                                    )}
                                </div>

                                {feedbacks.map((fb, idx) => {
                                    const fbId = fb.id || idx;
                                    const isExpanded = expandedIds.has(fbId);

                                    let parsedCustom = null;
                                    if (fb.q8_additional_comments) {
                                        try { parsedCustom = JSON.parse(fb.q8_additional_comments); } catch (e) {}
                                    }

                                    const studentName = fb.users?.name || '참여자';
                                    const studentSchool = fb.users?.school ? `(${fb.users.school})` : '';
                                    const submittedAt = fb.created_at ? new Date(fb.created_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
                                    const rating = getFeedbackRating(fb);

                                    return (
                                        <div key={fbId} className="bg-white rounded-toss-xl border border-tossGrey100 shadow-2xs overflow-hidden transition-all">
                                            {/* Header Row (Clickable Toggle) */}
                                            <div 
                                                onClick={() => toggleExpand(fbId)}
                                                className="p-4 flex items-center justify-between hover:bg-tossGrey50/80 cursor-pointer select-none transition-colors"
                                            >
                                                <div className="flex items-center gap-2.5">
                                                    <div className="w-8 h-8 rounded-full bg-tossBlueLight text-tossBlue flex items-center justify-center font-bold text-xs shrink-0">
                                                        <User size={16} />
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="font-bold text-sm text-tossGrey900">{studentName}</span>
                                                            <span className="text-xs text-tossGrey500">{studentSchool}</span>
                                                        </div>
                                                        <span className="text-[11px] text-tossGrey400 block">{submittedAt}</span>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-3">
                                                    {rating !== null && (
                                                        <div className="flex items-center gap-1 bg-amber-50 px-2.5 py-1 rounded-toss-lg border border-amber-100">
                                                            <Star size={13} className="fill-amber-400 text-amber-400" />
                                                            <span className="text-xs font-black text-amber-700">{rating}점</span>
                                                        </div>
                                                    )}
                                                    <div className="text-tossGrey400 p-1 rounded-full hover:bg-tossGrey200/50">
                                                        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Collapsible Body */}
                                            {isExpanded && (
                                                <div className="p-5 pt-2 border-t border-tossGrey100 bg-tossGrey50/30 space-y-3">
                                                    {hasCustomQuestions ? (
                                                        customQuestions.map((q, qIdx) => {
                                                            const ans = parsedCustom?.[q.id] ?? '';
                                                            return (
                                                                <div key={q.id || qIdx} className="bg-white p-3.5 rounded-toss-lg border border-tossGrey100 space-y-1">
                                                                    <p className="text-xs font-bold text-tossGrey600">Q{qIdx + 1}. {q.title}</p>
                                                                    <p className="text-sm font-medium text-tossGrey900 whitespace-pre-wrap">
                                                                        {typeof ans === 'number' ? `${ans}점` : (ans ? String(ans) : '(미응답)')}
                                                                    </p>
                                                                </div>
                                                            );
                                                        })
                                                    ) : (
                                                        <>
                                                            {fb.q1_reason && (
                                                                <div className="bg-white p-3.5 rounded-toss-lg border border-tossGrey100 space-y-1">
                                                                    <p className="text-xs font-bold text-tossGrey600">Q1. 참여 이유</p>
                                                                    <p className="text-sm font-medium text-tossGrey900">{fb.q1_reason}</p>
                                                                </div>
                                                            )}
                                                            {fb.q2_experience && (
                                                                <div className="bg-white p-3.5 rounded-toss-lg border border-tossGrey100 space-y-1">
                                                                    <p className="text-xs font-bold text-tossGrey600">Q2. 경험한 내용</p>
                                                                    <p className="text-sm font-medium text-tossGrey900 whitespace-pre-wrap">{fb.q2_experience}</p>
                                                                </div>
                                                            )}
                                                            {fb.q4_best_moment && (
                                                                <div className="bg-white p-3.5 rounded-toss-lg border border-tossGrey100 space-y-1">
                                                                    <p className="text-xs font-bold text-tossGrey600">Q4. 좋았던 순간</p>
                                                                    <p className="text-sm font-medium text-tossGrey900 whitespace-pre-wrap">{fb.q4_best_moment}</p>
                                                                </div>
                                                            )}
                                                            {fb.q5_disappointments && (
                                                                <div className="bg-white p-3.5 rounded-toss-lg border border-tossGrey100 space-y-1">
                                                                    <p className="text-xs font-bold text-tossGrey600">Q5. 아쉬웠던 점</p>
                                                                    <p className="text-sm font-medium text-tossGrey900 whitespace-pre-wrap">{fb.q5_disappointments}</p>
                                                                </div>
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 bg-white border-t border-tossGrey100 text-right">
                    <button
                        onClick={onClose}
                        className="px-5 py-2.5 bg-tossGrey100 hover:bg-tossGrey200 text-tossGrey700 rounded-toss-xl text-sm font-bold transition-colors cursor-pointer"
                    >
                        닫기
                    </button>
                </div>
            </motion.div>
        </div>
    );
};

export default AdminFeedbackListModal;
