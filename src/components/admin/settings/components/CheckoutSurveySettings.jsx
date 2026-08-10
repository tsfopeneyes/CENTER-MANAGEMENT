import React, { useState, useEffect } from 'react';
import { LogOut, Plus, Trash2, Save, Sparkles, Smile, HelpCircle } from 'lucide-react';

const CheckoutSurveySettings = ({ checkoutSurveyConfig, onSave, isSaving }) => {
    const [mode, setMode] = useState('SURVEY'); // 'SURVEY' | 'FEEDBACK_QA' | 'CHAT_SHOUTOUT' | 'HYBRID'
    const [question, setQuestion] = useState('');
    const [qaQuestion, setQaQuestion] = useState('');
    const [qaPlaceholder, setQaPlaceholder] = useState('');
    const [chatPrompt, setChatPrompt] = useState('');
    const [chatPlaceholder, setChatPlaceholder] = useState('');
    const [options, setOptions] = useState([]);

    useEffect(() => {
        if (checkoutSurveyConfig) {
            setMode(checkoutSurveyConfig.mode || 'SURVEY');
            setQuestion(checkoutSurveyConfig.question || '오늘 센터에서의 시간은 어떠셨나요?');
            setQaQuestion(checkoutSurveyConfig.qaQuestion || '오늘 센터 이용 소감이나 하고 싶은 말을 남겨주세요!');
            setQaPlaceholder(checkoutSurveyConfig.qaPlaceholder || '자유롭게 적어주세요 (예: 보드게임이 재밌었어요, 공간이 깨끗해요)');
            setChatPrompt(checkoutSurveyConfig.chatPrompt || '퇴실하면서 친구들에게 작별 인사를 남겨보세요!');
            setChatPlaceholder(checkoutSurveyConfig.chatPlaceholder || '예: 먼저 가볼게! 다들 재미있게 놀아~');
            setOptions(checkoutSurveyConfig.options || [
                { id: '1', emoji: '😊', label: '교제 및 휴식', recommendTitle: '휴식 세션 완료', recommendText: '편안한 휴식이 되었기를 바랍니다!' },
                { id: '2', emoji: '📚', label: '개인 할 일', recommendTitle: '집중 공부 완료', recommendText: '오늘도 수고 많으셨습니다!' },
                { id: '3', emoji: '🎯', label: '프로그램 참여', recommendTitle: '프로그램 참여 완료', recommendText: '알찬 시간이 되었길 바래요!' },
                { id: '4', emoji: '☕', label: '스처쌤 만남', recommendTitle: '커피챗 완료', recommendText: '유익한 대화의 시간이었기를 진심으로 바래요!' }
            ]);
        }
    }, [checkoutSurveyConfig]);

    const handleOptionChange = (index, field, value) => {
        const updated = [...options];
        updated[index] = { ...updated[index], [field]: value };
        setOptions(updated);
    };

    const handleAddOption = () => {
        const nextId = String(options.length > 0 ? Math.max(...options.map(o => parseInt(o.id) || 0)) + 1 : 1);
        setOptions([
            ...options,
            { id: nextId, emoji: '✨', label: '새 이용 소감 항목', recommendTitle: '감사 메시지', recommendText: '오늘 센터 이용에 감사드립니다.' }
        ]);
    };

    const handleDeleteOption = (index) => {
        if (options.length <= 1) {
            alert('최소한 1개 이상의 퇴실 항목이 존재해야 합니다.');
            return;
        }
        setOptions(options.filter((_, idx) => idx !== index));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave({
            mode,
            question,
            qaQuestion,
            qaPlaceholder,
            chatPrompt,
            chatPlaceholder,
            options
        });
    };

    const MODES = [
        { id: 'SURVEY', title: '1. 객관식 설문 모드', desc: '이모지 카드를 선택하여 이용 소감 파악' },
        { id: 'FEEDBACK_QA', title: '2. 주관식 한 줄 소감', desc: '관리자가 던진 퇴실 질문에 학생이 직접 소감 작성' },
        { id: 'CHAT_SHOUTOUT', title: '3. 라이브 채팅 퇴실 인사', desc: '퇴실 인사를 작성하면 라이브 채팅에 [👋 퇴실 한마디] 자동 게시' },
        { id: 'HYBRID', title: '4. 설문 + 퇴실 인사', desc: '객관식 항목 선택과 라이브 채팅 작성을 동시에 진행' }
    ];

    return (
        <div className="w-full bg-white rounded-[24px] border border-[#f2f4f6] p-6 shadow-sm flex flex-col gap-6 mt-6">
            <div className="flex flex-col gap-1 border-b border-gray-50 pb-5">
                <h3 className="text-lg font-bold text-[#191f28] flex items-center gap-2 tracking-tight">
                    <LogOut size={20} className="text-emerald-500" />
                    체크아웃 퇴실 설문 및 참여 방식 설정
                </h3>
                <p className="text-xs md:text-sm text-[#8b95a1] mt-1 font-medium leading-relaxed">
                    학생이 센터에서 퇴실할 때 보여지는 퇴실 설문 모드(객관식 이용 소감, 주관식 한 줄 후기, 퇴실 인사)를 설정할 수 있습니다.
                </p>
            </div>

            <form onSubmit={handleSubmit} className="w-full space-y-6">
                {/* Mode Selector Cards */}
                <div>
                    <label className="block text-xs font-bold text-gray-500 mb-2 ml-1">
                        퇴실 참여 모드 선택
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                        {MODES.map((m) => (
                            <button
                                key={m.id}
                                type="button"
                                onClick={() => setMode(m.id)}
                                className={`p-4 rounded-2xl border text-left transition-all relative flex flex-col justify-between ${
                                    mode === m.id
                                        ? 'bg-emerald-50/70 border-emerald-500 ring-2 ring-emerald-500/20 shadow-sm'
                                        : 'bg-slate-50/70 border-slate-200/80 hover:bg-slate-100/70'
                                }`}
                            >
                                <div>
                                    <div className="flex items-center justify-between mb-1.5">
                                        <span className={`text-xs font-black ${mode === m.id ? 'text-emerald-600' : 'text-slate-800'}`}>
                                            {m.title}
                                        </span>
                                        {mode === m.id && (
                                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                        )}
                                    </div>
                                    <p className="text-[11px] font-medium text-slate-500 leading-snug">
                                        {m.desc}
                                    </p>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Conditional Dynamic Settings depending on Mode */}
                {(mode === 'SURVEY' || mode === 'HYBRID') && (
                    <div className="space-y-4 pt-2">
                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1.5 ml-1">
                                객관식 퇴실 질문 제목
                            </label>
                            <input
                                type="text"
                                value={question}
                                onChange={(e) => setQuestion(e.target.value)}
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs md:text-sm font-bold text-slate-800 focus:bg-white focus:border-emerald-500 outline-none transition-all"
                                placeholder="예: 오늘 센터에서의 시간은 어떠셨나요?"
                            />
                        </div>

                        {/* Options Editor Cards */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <label className="block text-xs font-bold text-slate-700 ml-1">
                                    퇴실 설문 카드 목록 (선택지)
                                </label>
                                <button
                                    type="button"
                                    onClick={handleAddOption}
                                    className="px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-xl text-xs font-bold hover:bg-emerald-100 transition-all flex items-center gap-1 border border-emerald-100"
                                >
                                    <Plus size={14} /> 항목 추가
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {options.map((opt, idx) => (
                                    <div key={idx} className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200/90 space-y-3 relative group">
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="text"
                                                value={opt.emoji}
                                                onChange={(e) => handleOptionChange(idx, 'emoji', e.target.value)}
                                                className="w-12 text-center py-1.5 bg-white border border-slate-200 rounded-xl text-base outline-none focus:border-emerald-500 font-bold"
                                                placeholder="이모지"
                                            />
                                            <input
                                                type="text"
                                                value={opt.label}
                                                onChange={(e) => handleOptionChange(idx, 'label', e.target.value)}
                                                className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-emerald-500"
                                                placeholder="선택지 라벨 (예: 교제 및 휴식)"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteOption(idx)}
                                                className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                                                title="항목 삭제"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {(mode === 'FEEDBACK_QA') && (
                    <div className="space-y-4 pt-2">
                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1.5 ml-1">
                                주관식 퇴실 질문
                            </label>
                            <input
                                type="text"
                                value={qaQuestion}
                                onChange={(e) => setQaQuestion(e.target.value)}
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs md:text-sm font-bold text-slate-800 focus:bg-white focus:border-emerald-500 outline-none transition-all"
                                placeholder="예: 오늘 센터 이용 소감이나 하고 싶은 말을 남겨주세요!"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1.5 ml-1">
                                답변 입력 창 힌트 문구 (Placeholder)
                            </label>
                            <input
                                type="text"
                                value={qaPlaceholder}
                                onChange={(e) => setQaPlaceholder(e.target.value)}
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs md:text-sm font-bold text-slate-800 focus:bg-white focus:border-emerald-500 outline-none transition-all"
                                placeholder="예: 자유롭게 작성해 주세요"
                            />
                        </div>
                    </div>
                )}

                {(mode === 'CHAT_SHOUTOUT' || mode === 'HYBRID') && (
                    <div className="space-y-4 pt-2">
                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1.5 ml-1 flex items-center gap-1.5">
                                <Sparkles size={14} className="text-emerald-500" /> 라이브 채팅 퇴실 인사 안내 문구
                            </label>
                            <input
                                type="text"
                                value={chatPrompt}
                                onChange={(e) => setChatPrompt(e.target.value)}
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs md:text-sm font-bold text-slate-800 focus:bg-white focus:border-emerald-500 outline-none transition-all"
                                placeholder="예: 퇴실하면서 친구들에게 작별 인사를 남겨보세요!"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1.5 ml-1">
                                퇴실 인사 입력 창 힌트 문구 (Placeholder)
                            </label>
                            <input
                                type="text"
                                value={chatPlaceholder}
                                onChange={(e) => setChatPlaceholder(e.target.value)}
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs md:text-sm font-bold text-slate-800 focus:bg-white focus:border-emerald-500 outline-none transition-all"
                                placeholder="예: 먼저 가볼게! 다들 재미있게 놀아~"
                            />
                        </div>
                    </div>
                )}

                <div className="flex justify-end pt-4 border-t border-slate-100">
                    <button
                        type="submit"
                        disabled={isSaving}
                        className="px-6 py-3 bg-emerald-600 text-white rounded-2xl font-black text-xs md:text-sm hover:bg-emerald-700 active:scale-95 transition-all shadow-md shadow-emerald-200 flex items-center gap-2 disabled:opacity-50"
                    >
                        <Save size={16} />
                        {isSaving ? '저장 중...' : '퇴실 설문 설정 저장'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default CheckoutSurveySettings;
