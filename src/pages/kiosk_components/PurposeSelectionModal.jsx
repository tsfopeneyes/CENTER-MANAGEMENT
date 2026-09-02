import React from 'react';
import { Check, ChevronRight, Edit3, BookOpen, Coffee, Heart, Smile } from 'lucide-react';
import { motion } from 'framer-motion';

const PurposeSelectionModal = ({ isOpen, user, onComplete, surveyConfig }) => {
    const [selected, setSelected] = React.useState([]);
    const [textAnswer, setTextAnswer] = React.useState('');

    React.useEffect(() => {
        if (isOpen) { setSelected([]); setTextAnswer(''); }
    }, [isOpen]);

    const fallbackCategories = [
        { id: '개인 할 일', label: '개인 할 일', icon: Edit3, color: 'bg-blue-50 text-blue-600', active: 'bg-blue-600 text-white shadow-blue-200' },
        { id: '프로그램 참여', label: '프로그램 참여', icon: BookOpen, color: 'bg-indigo-50 text-indigo-600', active: 'bg-indigo-600 text-white shadow-indigo-200' },
        { id: '교제 및 휴식', label: '교제 및 휴식', icon: Coffee, color: 'bg-orange-50 text-orange-600', active: 'bg-orange-600 text-white shadow-orange-200' },
        { id: '스처쌤 만남', label: '스처쌤 만남', icon: Heart, color: 'bg-rose-50 text-rose-600', active: 'bg-rose-600 text-white shadow-rose-200' }
    ];
    const categories = surveyConfig?.options?.length
        ? surveyConfig.options.map((option, index) => ({
            id: option.label,
            label: option.label,
            icon: [Edit3, BookOpen, Coffee, Heart][index % 4],
            color: 'bg-blue-50 text-blue-600',
            active: 'bg-blue-600 text-white shadow-blue-200'
        }))
        : fallbackCategories;
    const isTextSurvey = surveyConfig?.mode === 'FEEDBACK_QA';
    const question = isTextSurvey
        ? (surveyConfig?.qaQuestion || surveyConfig?.question)
        : surveyConfig?.question;

    const toggle = (id) => {
        setSelected(prev =>
            prev.includes(id)
                ? prev.filter(i => i !== id)
                : [...prev, id]
        );
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/60 z-[150] flex items-center justify-center p-4 backdrop-blur-xl animate-fade-in">
            <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 40 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                className="bg-white w-full max-w-xl rounded-[3.5rem] p-10 sm:p-14 shadow-2xl relative overflow-hidden"
            >
                <div className="absolute top-0 right-0 w-64 h-64 bg-blue-50/50 rounded-full -mr-32 -mt-32 blur-3xl -z-10" />
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-50/50 rounded-full -ml-32 -mb-32 blur-3xl -z-10" />

                <div className="text-center mb-12">
                    <div className="inline-flex items-center justify-center w-20 h-20 bg-blue-50 rounded-3xl mb-6 shadow-sm border border-blue-100/50">
                        <Smile className="text-blue-600" size={40} />
                    </div>
                    <h3 className="text-3xl sm:text-4xl font-black text-slate-800 mb-3 tracking-tight">{question || <>오늘 센터에서<br />어떤 활동을 했나요?</>}</h3>
                    <p className="text-slate-400 font-bold text-lg">{isTextSurvey ? '자유롭게 의견을 남겨 주세요.' : '중복 선택이 가능해요!'}</p>
                </div>

                {isTextSurvey ? <textarea value={textAnswer} onChange={event => setTextAnswer(event.target.value)} placeholder={surveyConfig?.qaPlaceholder || '자유롭게 작성해 주세요'} rows={5} className="w-full mb-12 rounded-3xl border-2 border-slate-100 bg-slate-50 p-5 text-lg font-bold outline-none focus:border-blue-500" /> : <div className="grid grid-cols-2 gap-4 sm:gap-6 mb-12">
                    {categories.map((cat) => {
                        const Icon = cat.icon;
                        const isActive = selected.includes(cat.id);
                        return (
                            <button
                                key={cat.id}
                                onClick={() => toggle(cat.id)}
                                className={`flex flex-col items-center justify-center p-6 sm:p-8 rounded-[2.5rem] transition-all duration-300 border-2 group active:scale-95 ${isActive
                                    ? `${cat.active} border-transparent shadow-xl scale-[1.02]`
                                    : `${cat.color} border-transparent opacity-70 hover:opacity-100 hover:scale-[1.01]`
                                    }`}
                            >
                                <Icon size={32} className={`mb-3 transition-transform duration-300 ${isActive ? 'scale-110' : 'group-hover:scale-110'}`} />
                                <span className={`text-base sm:text-lg font-black tracking-tight whitespace-nowrap ${isActive ? 'text-white' : ''}`}>
                                    {cat.label}
                                </span>
                                {isActive && (
                                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute top-4 right-4 bg-white/20 p-1 rounded-full">
                                        <Check size={14} className="text-white" strokeWidth={4} />
                                    </motion.div>
                                )}
                            </button>
                        );
                    })}
                </div>}

                <button
                    disabled={isTextSurvey ? !textAnswer.trim() : selected.length === 0}
                    onClick={() => onComplete(isTextSurvey ? [textAnswer.trim()] : selected)}
                    className={`w-full py-6 rounded-3xl font-black text-xl transition-all shadow-xl active:scale-95 flex items-center justify-center gap-3 ${(isTextSurvey ? textAnswer.trim() : selected.length > 0)
                        ? 'bg-slate-800 text-white hover:bg-slate-900 shadow-slate-200'
                        : 'bg-slate-100 text-slate-300 cursor-not-allowed shadow-none'
                        }`}
                >
                    체크아웃 완료 <ChevronRight size={24} />
                </button>
            </motion.div>
        </div>
    );
};

export default PurposeSelectionModal;
