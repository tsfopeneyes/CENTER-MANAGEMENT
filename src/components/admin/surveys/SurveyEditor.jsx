import React, { useEffect, useState } from 'react';
import { Check, ListChecks, MessageSquareText, Plus, Save, Sparkles, Trash2 } from 'lucide-react';

const isTextMode = (type, mode) => mode === (type === 'CHECKIN' ? 'QUESTION_QA' : 'FEEDBACK_QA');

const SurveyEditor = ({ type, initialConfig, onSave, onCancel, isSaving }) => {
    const [answerType, setAnswerType] = useState('CHOICE');
    const [question, setQuestion] = useState('');
    const [description, setDescription] = useState('');
    const [placeholder, setPlaceholder] = useState('자유롭게 작성해 주세요');
    const [options, setOptions] = useState([]);
    const [recommendationsEnabled, setRecommendationsEnabled] = useState(false);

    useEffect(() => {
        const textMode = isTextMode(type, initialConfig?.mode);
        setAnswerType(textMode ? 'TEXT' : 'CHOICE');
        setQuestion(textMode
            ? (initialConfig?.qaQuestion || initialConfig?.question || '')
            : (initialConfig?.question || initialConfig?.qaQuestion || ''));
        setDescription(initialConfig?.description || '');
        setPlaceholder(initialConfig?.qaPlaceholder || '자유롭게 작성해 주세요');
        setOptions(initialConfig?.options || []);
        setRecommendationsEnabled(type === 'CHECKIN' && initialConfig?.recommendationsEnabled !== false);
    }, [initialConfig, type]);

    const updateOption = (index, field, value) => {
        setOptions(current => current.map((option, optionIndex) => (
            optionIndex === index ? { ...option, [field]: value } : option
        )));
    };

    const addOption = () => {
        const nextId = String(Math.max(0, ...options.map(option => Number(option.id) || 0)) + 1);
        setOptions(current => [...current, {
            id: nextId,
            emoji: '✨',
            label: '새 선택지',
            recommendTitle: '',
            recommendText: ''
        }]);
    };

    const removeOption = (index) => {
        if (options.length <= 1) {
            alert('객관식 설문에는 선택지가 한 개 이상 필요합니다.');
            return;
        }
        setOptions(current => current.filter((_, optionIndex) => optionIndex !== index));
    };

    const handleSubmit = (event) => {
        event.preventDefault();
        const trimmedQuestion = question.trim();
        if (!trimmedQuestion) {
            alert('설문 질문을 입력해 주세요.');
            return;
        }
        if (answerType === 'CHOICE' && options.some(option => !option.label?.trim())) {
            alert('모든 선택지의 내용을 입력해 주세요.');
            return;
        }

        const mode = answerType === 'TEXT'
            ? (type === 'CHECKIN' ? 'QUESTION_QA' : 'FEEDBACK_QA')
            : 'SURVEY';
        onSave({
            ...initialConfig,
            mode,
            question: trimmedQuestion,
            qaQuestion: trimmedQuestion,
            description: description.trim(),
            qaPlaceholder: placeholder.trim() || '자유롭게 작성해 주세요',
            options,
            recommendationsEnabled: type === 'CHECKIN' && answerType === 'CHOICE'
                ? recommendationsEnabled
                : false,
            chatPrompt: undefined,
            chatPlaceholder: undefined
        });
    };

    return (
        <form onSubmit={handleSubmit} className="rounded-[24px] border border-[#f2f4f6] bg-white p-5 md:p-7 space-y-7 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-gray-100 pb-5">
                <div>
                    <p className="text-xs font-bold text-blue-600">{type === 'CHECKIN' ? '입실 설문' : '퇴실 설문'}</p>
                    <h2 className="text-xl font-bold text-gray-900 mt-1">설문 편집</h2>
                    <p className="text-sm text-gray-500 mt-1">질문이 설문 목록과 결과 화면의 제목으로 사용됩니다.</p>
                </div>
                <button type="button" onClick={onCancel} className="self-start px-3 py-2 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-50">취소</button>
            </div>

            <div>
                <label className="block text-sm font-bold text-gray-800 mb-2">설문 질문</label>
                <input value={question} onChange={event => setQuestion(event.target.value)} placeholder="질문을 입력해 주세요" className="w-full rounded-xl border border-gray-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none transition focus:border-blue-500 focus:bg-white" />
            </div>

            <div>
                <label className="block text-sm font-bold text-gray-800 mb-2">설문 설명 <span className="font-medium text-gray-400">(선택)</span></label>
                <textarea
                    value={description}
                    onChange={event => setDescription(event.target.value)}
                    placeholder="응답 화면에서 질문 아래에 보여줄 안내 문구를 입력해 주세요"
                    rows={2}
                    maxLength={150}
                    className="w-full resize-none rounded-xl border border-gray-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:bg-white"
                />
                <p className="mt-1.5 text-right text-xs font-medium text-gray-400">{description.length}/150자</p>
            </div>

            <div>
                <label className="block text-sm font-bold text-gray-800 mb-3">응답 유형</label>
                <div className="grid sm:grid-cols-2 gap-3">
                    <button type="button" onClick={() => setAnswerType('CHOICE')} className={`rounded-2xl p-4 border text-left flex items-start gap-3 transition-all ${answerType === 'CHOICE' ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500/10' : 'border-gray-200 bg-slate-50 hover:bg-white'}`}>
                        <ListChecks size={20} className={answerType === 'CHOICE' ? 'text-blue-600' : 'text-gray-400'} />
                        <span><strong className="block text-sm text-gray-900">객관식</strong><span className="block text-xs text-gray-500 mt-1">여러 선택지 중 하나 이상을 선택합니다.</span></span>
                        {answerType === 'CHOICE' && <Check size={17} className="ml-auto text-blue-600" />}
                    </button>
                    <button type="button" onClick={() => setAnswerType('TEXT')} className={`rounded-2xl p-4 border text-left flex items-start gap-3 transition-all ${answerType === 'TEXT' ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500/10' : 'border-gray-200 bg-slate-50 hover:bg-white'}`}>
                        <MessageSquareText size={20} className={answerType === 'TEXT' ? 'text-blue-600' : 'text-gray-400'} />
                        <span><strong className="block text-sm text-gray-900">주관식</strong><span className="block text-xs text-gray-500 mt-1">질문에 직접 글로 답변합니다.</span></span>
                        {answerType === 'TEXT' && <Check size={17} className="ml-auto text-blue-600" />}
                    </button>
                </div>
            </div>

            {answerType === 'TEXT' && <div>
                <label className="block text-sm font-bold text-gray-800 mb-2">입력 안내 문구</label>
                <input value={placeholder} onChange={event => setPlaceholder(event.target.value)} placeholder="예: 자유롭게 작성해 주세요" className="w-full rounded-xl border border-gray-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:bg-white" />
            </div>}

            {answerType === 'CHOICE' && <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                    <label className="text-sm font-bold text-gray-800">선택지</label>
                    <button type="button" onClick={addOption} className="px-3 py-2 rounded-xl border border-blue-200 bg-blue-50 text-blue-600 text-xs font-bold flex items-center gap-1 hover:bg-blue-100"><Plus size={14} />선택지 추가</button>
                </div>

                {type === 'CHECKIN' && <div className="rounded-2xl border border-amber-100 bg-amber-50/50 p-4 flex items-center justify-between gap-4 overflow-hidden">
                    <div className="flex items-start gap-3"><Sparkles size={19} className="text-amber-500 mt-0.5" /><div><p className="text-sm font-bold text-gray-900">응답 후 콘텐츠 추천</p><p className="text-xs text-gray-500 mt-1">선택한 답변에 맞는 공간이나 활동을 설문 제출 후 보여줍니다.</p></div></div>
                    <button type="button" role="switch" aria-label="응답 후 콘텐츠 추천" aria-checked={recommendationsEnabled} onClick={() => setRecommendationsEnabled(value => !value)} className={`relative w-11 h-6 shrink-0 overflow-hidden rounded-full transition-colors ${recommendationsEnabled ? 'bg-blue-600' : 'bg-gray-300'}`}><span className={`absolute left-1 top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${recommendationsEnabled ? 'translate-x-5' : 'translate-x-0'}`} /></button>
                </div>}

                <div className="space-y-3">
                    {options.map((option, index) => <div key={option.id || index} className="rounded-2xl border border-gray-200 bg-slate-50/80 p-4 space-y-3">
                        <div className="flex gap-2 items-center">
                            <input value={option.emoji || ''} onChange={event => updateOption(index, 'emoji', event.target.value)} aria-label={`${index + 1}번 선택지 이모지`} className="w-14 rounded-xl border border-gray-200 bg-white px-2 py-2.5 text-center text-lg outline-none focus:border-blue-500" />
                            <input value={option.label || ''} onChange={event => updateOption(index, 'label', event.target.value)} aria-label={`${index + 1}번 선택지`} className="flex-1 min-w-0 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-bold outline-none focus:border-blue-500" />
                            <button type="button" onClick={() => removeOption(index)} title="선택지 삭제" className="p-2.5 rounded-xl text-gray-400 hover:bg-red-50 hover:text-red-500"><Trash2 size={17} /></button>
                        </div>
                        {type === 'CHECKIN' && recommendationsEnabled && <div className="grid md:grid-cols-2 gap-2 pl-0 md:pl-16">
                            <input value={option.recommendTitle || ''} onChange={event => updateOption(index, 'recommendTitle', event.target.value)} placeholder="추천 제목" className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-bold outline-none focus:border-blue-500" />
                            <input value={option.recommendText || ''} onChange={event => updateOption(index, 'recommendText', event.target.value)} placeholder="추천 설명" className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500" />
                        </div>}
                    </div>)}
                </div>
            </div>}

            <div className="flex justify-end border-t border-gray-100 pt-5">
                <button type="submit" disabled={isSaving} className="px-5 py-3 rounded-xl bg-blue-600 text-white text-sm font-bold flex items-center gap-2 shadow-sm hover:bg-blue-700 disabled:opacity-50"><Save size={16} />{isSaving ? '저장 중...' : '설문 저장'}</button>
            </div>
        </form>
    );
};

export default SurveyEditor;
