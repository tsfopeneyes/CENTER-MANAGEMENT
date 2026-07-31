import React, { useState, useEffect } from 'react';
import { HelpCircle, Plus, Trash2, Save, Sparkles, Smile } from 'lucide-react';

const CheckinSurveySettings = ({ checkinSurveyConfig, onSave, isSaving }) => {
    const [mode, setMode] = useState('SURVEY'); // 'SURVEY' | 'QUESTION_QA' | 'CHAT_SHOUTOUT' | 'HYBRID'
    const [question, setQuestion] = useState('');
    const [qaQuestion, setQaQuestion] = useState('');
    const [qaPlaceholder, setQaPlaceholder] = useState('');
    const [chatPrompt, setChatPrompt] = useState('');
    const [chatPlaceholder, setChatPlaceholder] = useState('');
    const [options, setOptions] = useState([]);

    useEffect(() => {
        if (checkinSurveyConfig) {
            setMode(checkinSurveyConfig.mode || 'SURVEY');
            setQuestion(checkinSurveyConfig.question || '오늘 센터에서 무엇을 하고 싶나요?');
            setQaQuestion(checkinSurveyConfig.qaQuestion || '오늘 센터에서 꼭 해보고 싶은 한 가지는 무엇인가요?');
            setQaPlaceholder(checkinSurveyConfig.qaPlaceholder || '자유롭게 적어주세요 (예: 루미큐브, 시험 공부, 친구랑 수다)');
            setChatPrompt(checkinSurveyConfig.chatPrompt || '센터에 있는 친구들에게 반가운 한마디 인사를 남겨보세요!');
            setChatPlaceholder(checkinSurveyConfig.chatPlaceholder || '예: 3층 빈백존 입성! 보드게임 할 사람 덤벼라~');
            setOptions(checkinSurveyConfig.options || []);
        }
    }, [checkinSurveyConfig]);

    const handleOptionChange = (index, field, value) => {
        const updated = [...options];
        updated[index] = { ...updated[index], [field]: value };
        setOptions(updated);
    };

    const handleAddOption = () => {
        const nextId = String(options.length > 0 ? Math.max(...options.map(o => parseInt(o.id) || 0)) + 1 : 1);
        setOptions([
            ...options,
            { id: nextId, emoji: '😊', label: '새 행동 옵션', recommendTitle: '추천 콘텐츠 제목', recommendText: '여기에 매칭 콘텐츠나 이용 안내 팁을 상세히 적어주세요.' }
        ]);
    };

    const handleDeleteOption = (index) => {
        if (options.length <= 1) {
            alert('최소한 1개 이상의 설문 항목이 존재해야 합니다.');
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
        { id: 'SURVEY', title: '1. 객관식 설문 모드', desc: '이모지 카드를 선택하여 방문 목적 파악 및 맞춤 공간 추천' },
        { id: 'QUESTION_QA', title: '2. 주관식 오늘의 질문', desc: '관리자가 던진 질문에 학생이 직접 글자로 답변 작성' },
        { id: 'CHAT_SHOUTOUT', title: '3. 라이브 채팅 한마디', desc: '도착 인사를 작성하면 센터 라이브 채팅에 [👋 체크인 한마디] 자동 게시' },
        { id: 'HYBRID', title: '4. 설문 + 채팅 한마디', desc: '객관식 설문 선택과 라이브 채팅 한마디 작성을 동시에 진행' }
    ];

    return (
        <div className="w-full bg-white rounded-[24px] border border-[#f2f4f6] p-6 shadow-sm flex flex-col gap-6">
            <div className="flex flex-col gap-1 border-b border-gray-50 pb-5">
                <h3 className="text-lg font-bold text-[#191f28] flex items-center gap-2 tracking-tight">
                    <HelpCircle size={20} className="text-[#3182f6]" />
                    체크인 입실 참여 방식 설정
                </h3>
                <p className="text-xs md:text-sm text-[#8b95a1] mt-1 font-medium leading-relaxed">
                    학생 및 게스트 체크인 시 제공될 참여 모드(객관식 설문, 주관식 오늘의 질문, 라이브 채팅 한마디)를 선택하고 문구를 수정할 수 있습니다.
                </p>
            </div>

            <form onSubmit={handleSubmit} className="w-full space-y-6">
                {/* Mode Selector Cards */}
                <div>
                    <label className="block text-xs font-bold text-gray-500 mb-2 ml-1">
                        체크인 참여 모드 선택
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                        {MODES.map((m) => (
                            <button
                                key={m.id}
                                type="button"
                                onClick={() => setMode(m.id)}
                                className={`p-4 rounded-2xl border text-left transition-all relative flex flex-col justify-between ${
                                    mode === m.id
                                        ? 'bg-blue-50/70 border-blue-500 ring-2 ring-blue-500/20 shadow-sm'
                                        : 'bg-slate-50/70 border-slate-200/80 hover:bg-slate-100/70'
                                }`}
                            >
                                <div>
                                    <div className="flex items-center justify-between mb-1.5">
                                        <span className={`text-xs font-black ${mode === m.id ? 'text-blue-600' : 'text-slate-800'}`}>
                                            {m.title}
                                        </span>
                                        {mode === m.id && (
                                            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
                                        )}
                                    </div>
                                    <p className="text-[11px] text-slate-500 font-medium leading-snug">
                                        {m.desc}
                                    </p>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Mode-Specific Field Settings */}
                {(mode === 'QUESTION_QA') && (
                    <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-2xl space-y-3 animate-fade-in">
                        <h4 className="text-xs font-bold text-blue-700 flex items-center gap-1.5">
                            <Sparkles size={14} /> 주관식 [오늘의 질문] 설정
                        </h4>
                        <div>
                            <label className="block text-[11px] font-bold text-gray-600 mb-1 ml-0.5">질문 문구</label>
                            <input
                                type="text"
                                value={qaQuestion}
                                onChange={(e) => setQaQuestion(e.target.value)}
                                placeholder="예: 오늘 센터에서 가장 해보고 싶은 한 가지는?"
                                className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-800 outline-none focus:border-blue-500"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-[11px] font-bold text-gray-600 mb-1 ml-0.5">입력 힌트 (Placeholder)</label>
                            <input
                                type="text"
                                value={qaPlaceholder}
                                onChange={(e) => setQaPlaceholder(e.target.value)}
                                placeholder="예: 자유롭게 입력해주세요"
                                className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 outline-none focus:border-blue-500"
                            />
                        </div>
                    </div>
                )}

                {(mode === 'CHAT_SHOUTOUT' || mode === 'HYBRID') && (
                    <div className="p-4 bg-emerald-50/50 border border-emerald-100 rounded-2xl space-y-3 animate-fade-in">
                        <h4 className="text-xs font-bold text-emerald-700 flex items-center gap-1.5">
                            <Smile size={14} /> [라이브 채팅 한마디] 설정
                        </h4>
                        <div>
                            <label className="block text-[11px] font-bold text-gray-600 mb-1 ml-0.5">안내 문구</label>
                            <input
                                type="text"
                                value={chatPrompt}
                                onChange={(e) => setChatPrompt(e.target.value)}
                                placeholder="예: 센터 친구들에게 반가운 한마디 인사를 남겨보세요!"
                                className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-800 outline-none focus:border-emerald-500"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-[11px] font-bold text-gray-600 mb-1 ml-0.5">입력 힌트 (Placeholder)</label>
                            <input
                                type="text"
                                value={chatPlaceholder}
                                onChange={(e) => setChatPlaceholder(e.target.value)}
                                placeholder="예: 3층 빈백존에 있어~ 같이 루미큐브 할 사람!"
                                className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 outline-none focus:border-emerald-500"
                            />
                        </div>
                    </div>
                )}

                {(mode === 'SURVEY' || mode === 'HYBRID') && (
                    <div className="space-y-6 pt-2">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1.5 ml-1">
                                객관식 체크인 질문 문구
                            </label>
                            <input
                                type="text"
                                value={question}
                                onChange={(e) => setQuestion(e.target.value)}
                                placeholder="예: 오늘 하이픈에서 무엇을 하고 싶나요?"
                                className="w-full px-4 py-3 bg-[#f2f4f6] border border-transparent rounded-xl outline-none focus:bg-white focus:border-[#3182f6] focus:ring-4 focus:ring-[#3182f6]/10 transition-all font-semibold text-[#191f28] text-sm"
                                required
                            />
                        </div>

                        <div className="space-y-4">
                            <div className="flex justify-between items-center ml-1">
                                <label className="block text-xs font-bold text-gray-500 mb-1.5 ml-1">
                                    선택지 및 맞춤 콘텐츠 매칭 리스트
                                </label>
                                <button
                                    type="button"
                                    onClick={handleAddOption}
                                    className="text-blue-600 font-bold text-xs hover:underline flex items-center gap-1.5 active:scale-95 transition-transform"
                                >
                                    <Plus size={14} /> 새 선택지 추가
                                </button>
                            </div>

                            <div className="w-full grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                {options.map((option, idx) => (
                                    <div key={option.id} className="p-4 bg-slate-50 border border-slate-100 rounded-2xl relative flex flex-col gap-3">
                                        <button
                                            type="button"
                                            onClick={() => handleDeleteOption(idx)}
                                            className="absolute top-3 right-3 p-1.5 text-gray-400 hover:text-red-500 hover:bg-white rounded-lg transition duration-150 shadow-sm z-10"
                                            title="선택지 삭제"
                                        >
                                            <Trash2 size={12} />
                                        </button>

                                        <div className="space-y-3 pr-2">
                                            {/* Button Config */}
                                            <div className="space-y-1.5">
                                                <div className="flex items-center gap-1.5 text-xs font-bold text-gray-400 ml-0.5">
                                                    <Smile size={12} />
                                                    <span>선택 버튼 설정</span>
                                                </div>
                                                <div className="flex gap-2">
                                                    <div className="w-12 shrink-0">
                                                        <input
                                                            type="text"
                                                            value={option.emoji}
                                                            onChange={(e) => handleOptionChange(idx, 'emoji', e.target.value)}
                                                            className="w-full p-2.5 bg-white border border-gray-100 rounded-xl text-center font-bold text-sm outline-none focus:border-[#3182f6]"
                                                            maxLength={2}
                                                            placeholder="😊"
                                                            title="이모지"
                                                        />
                                                    </div>
                                                    <div className="flex-1">
                                                        <input
                                                            type="text"
                                                            value={option.label}
                                                            onChange={(e) => handleOptionChange(idx, 'label', e.target.value)}
                                                            placeholder="버튼 라벨"
                                                            className="w-full p-2.5 bg-white border border-gray-100 rounded-xl font-bold text-xs outline-none focus:border-[#3182f6]"
                                                            required
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="border-t border-slate-200/50 my-1"></div>

                                            {/* Recommendation Config */}
                                            <div className="space-y-1.5">
                                                <div className="flex items-center gap-1.5 text-xs font-bold text-blue-500 ml-0.5">
                                                    <Sparkles size={12} />
                                                    <span>추천 콘텐츠 매칭</span>
                                                </div>
                                                <div className="flex flex-col gap-1.5">
                                                    <input
                                                        type="text"
                                                        value={option.recommendTitle}
                                                        onChange={(e) => handleOptionChange(idx, 'recommendTitle', e.target.value)}
                                                        placeholder="추천 제목 (예: 🍽️ 스낵존 안내)"
                                                        className="w-full px-3 py-2 bg-white border border-gray-100 rounded-xl font-bold text-xs outline-none focus:border-[#3182f6]"
                                                        required
                                                    />
                                                    <textarea
                                                        value={option.recommendText}
                                                        onChange={(e) => handleOptionChange(idx, 'recommendText', e.target.value)}
                                                        placeholder="학생 추천 공간 안내문 및 설명 팁"
                                                        className="w-full px-3 py-2 h-16 bg-white border border-gray-100 rounded-xl text-xs leading-normal font-semibold outline-none focus:border-[#3182f6] resize-none"
                                                        required
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                <div className="flex justify-end pt-4 border-t border-gray-50">
                    <button
                        type="submit"
                        disabled={isSaving}
                        className="px-6 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl transition duration-150 flex items-center gap-2 shadow-lg shadow-blue-100 disabled:opacity-50 text-sm active:scale-95"
                    >
                        <Save size={16} />
                        {isSaving ? '저장 중...' : '체크인 참여 설정 저장'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default CheckinSurveySettings;
