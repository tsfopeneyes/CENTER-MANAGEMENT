import React, { useEffect, useState } from 'react';
import { Check, ListChecks, MessageSquareText, Plus, Save, Sparkles, Trash2, MapPin, Repeat2 } from 'lucide-react';

const isTextMode = (type, mode) => mode === (type === 'CHECKIN' ? 'QUESTION_QA' : 'FEEDBACK_QA');

const SurveyEditor = ({ type, initialConfig, onSave, onCancel, isSaving }) => {
    const [answerType, setAnswerType] = useState('CHOICE');
    const [question, setQuestion] = useState('');
    const [description, setDescription] = useState('');
    const [placeholder, setPlaceholder] = useState('자유롭게 작성해 주세요');
    const [options, setOptions] = useState([]);
    const [recommendationsEnabled, setRecommendationsEnabled] = useState(false);
    const [additionalComment, setAdditionalComment] = useState({ enabled: false, label: '추가 의견이 있다면 적어주세요', placeholder: '선택한 이유나 의견을 자유롭게 알려주세요.', required: false, maxLength: 300 });
    const [frequency, setFrequency] = useState('EVERY_VISIT');
    const [centers, setCenters] = useState(['HAIFN']);
    const [isDefault, setIsDefault] = useState(false);

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
        setAdditionalComment({ enabled: false, label: '추가 의견이 있다면 적어주세요', placeholder: '선택한 이유나 의견을 자유롭게 알려주세요.', required: false, maxLength: 300, ...(initialConfig?.additionalComment || {}) });
        setFrequency(initialConfig?.exposure?.frequency || 'EVERY_VISIT');
        setCenters(initialConfig?.exposure?.centers?.length ? initialConfig.exposure.centers : ['HAIFN']);
        setIsDefault(initialConfig?.exposure?.isDefault === true);
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
            additionalComment: answerType === 'CHOICE' ? additionalComment : { ...additionalComment, enabled: false },
            exposure: {
                enabled: true,
                frequency,
                centers,
                isDefault,
                priority: initialConfig?.exposure?.priority ?? 999
            },
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

                <div className="border-t border-gray-100 pt-4">
                    <div className="flex items-center justify-between gap-4">
                        <div><p className="text-sm font-bold text-gray-900">추가 의견 받기</p><p className="mt-1 text-xs text-gray-500">선택 응답 아래에 자유 입력란을 함께 보여줍니다.</p></div>
                        <button type="button" role="switch" aria-checked={additionalComment.enabled} onClick={() => setAdditionalComment(current => ({ ...current, enabled: !current.enabled }))} className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${additionalComment.enabled ? 'bg-blue-600' : 'bg-gray-300'}`}><span className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${additionalComment.enabled ? 'translate-x-5' : ''}`} /></button>
                    </div>
                    {additionalComment.enabled && <div className="mt-4 grid gap-3 rounded-2xl bg-gray-50 p-4 md:grid-cols-2">
                        <label className="text-xs font-bold text-gray-600">입력란 제목<input value={additionalComment.label} onChange={e => setAdditionalComment(current => ({ ...current, label: e.target.value }))} className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500" /></label>
                        <label className="text-xs font-bold text-gray-600">안내 문구<input value={additionalComment.placeholder} onChange={e => setAdditionalComment(current => ({ ...current, placeholder: e.target.value }))} className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500" /></label>
                        <label className="flex items-center gap-2 text-xs font-bold text-gray-600"><input type="checkbox" checked={additionalComment.required} onChange={e => setAdditionalComment(current => ({ ...current, required: e.target.checked }))} className="h-4 w-4 rounded border-gray-300" />필수 입력</label>
                        <label className="flex items-center justify-end gap-2 text-xs font-bold text-gray-600">최대 글자 수<input type="number" min="50" max="1000" value={additionalComment.maxLength} onChange={e => setAdditionalComment(current => ({ ...current, maxLength: Math.min(1000, Math.max(50, Number(e.target.value) || 300)) }))} className="w-24 rounded-lg border border-gray-200 bg-white px-2 py-2 text-center" /></label>
                    </div>}
                </div>
            </div>}

            <div className="space-y-5 border-t border-gray-100 pt-6">
                <div><p className="flex items-center gap-2 text-sm font-bold text-gray-900"><Repeat2 size={17} className="text-blue-600" />노출 설정</p><p className="mt-1 text-xs text-gray-500">목록에는 결과만 간단히 표시하고 세부 조건은 여기에서 관리합니다.</p></div>
                <div className="grid gap-4 md:grid-cols-2">
                    <div><p className="mb-2 text-xs font-bold text-gray-600">응답 주기</p><div className="grid grid-cols-2 gap-2">{[['ONCE','이용자당 1회'],['EVERY_VISIT','방문마다']].map(([value,label]) => <button key={value} type="button" onClick={() => setFrequency(value)} className={`rounded-xl border px-3 py-3 text-sm font-bold ${frequency === value ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-600'}`}>{label}</button>)}</div></div>
                    <div><p className="mb-2 flex items-center gap-1 text-xs font-bold text-gray-600"><MapPin size={14} />노출 공간</p><div className="grid grid-cols-2 gap-2">{[['HAIFN','하이픈'],['ENOUGH_PLACE','이높플레이스']].map(([value,label]) => { const selected=centers.includes(value); return <button key={value} type="button" onClick={() => setCenters(current => selected ? (current.length > 1 ? current.filter(item => item !== value) : current) : [...current,value])} className={`rounded-xl border px-3 py-3 text-sm font-bold ${selected ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-600'}`}>{label}</button>; })}</div></div>
                </div>
                <label className="flex cursor-pointer items-center justify-between rounded-2xl bg-gray-50 p-4"><span><strong className="block text-sm text-gray-900">기본 설문</strong><span className="mt-1 block text-xs text-gray-500">응답 가능한 다른 설문이 없을 때 마지막으로 표시합니다.</span></span><input type="checkbox" checked={isDefault} onChange={e => setIsDefault(e.target.checked)} className="h-5 w-5 rounded border-gray-300 text-blue-600" /></label>
            </div>

            <div className="flex justify-end border-t border-gray-100 pt-5">
                <button type="submit" disabled={isSaving} className="px-5 py-3 rounded-xl bg-blue-600 text-white text-sm font-bold flex items-center gap-2 shadow-sm hover:bg-blue-700 disabled:opacity-50"><Save size={16} />{isSaving ? '저장 중...' : '설문 저장'}</button>
            </div>
        </form>
    );
};

export default SurveyEditor;
