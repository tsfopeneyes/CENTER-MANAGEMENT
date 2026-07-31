import React, { useState, useEffect } from 'react';
import { X, Calendar, Clock, BookOpen, AlertCircle, Map } from 'lucide-react';

const standardCheckinOptions = [
    '🍽️ 당 충전하며 쉬고 싶어요',
    '🎲 아무 생각 없이 놀고 싶어요',
    '☕ 누군가와 이야기하고 싶어요',
    '🙏 기도하거나 예배하고 싶어요',
    '📚 조용히 집중하고 싶어요',
    '🤷 아직 잘 모르겠어요'
];

const standardCheckoutOptions = [
    '개인 할 일',
    '프로그램 참여',
    '교제 및 휴식',
    '스처쌤 만남'
];

const VisitLogEditModal = ({ isOpen, onClose, sessionLog, onSave, visitNotes, locations = [] }) => {
    const [date, setDate] = useState('');
    const [startTime, setStartTime] = useState('');
    const [endTime, setEndTime] = useState('');
    
    // Spaces/Locations State
    const [selectedLocationIds, setSelectedLocationIds] = useState([]);
    
    // Check-in Purpose State
    const [selectedCheckinPurposes, setSelectedCheckinPurposes] = useState([]);
    const [hasCustomCheckin, setHasCustomCheckin] = useState(false);
    const [customCheckinText, setCustomCheckinText] = useState('');

    // Checkout Feedback State
    const [selectedCheckoutOptions, setSelectedCheckoutOptions] = useState([]);
    const [hasCustomCheckout, setHasCustomCheckout] = useState(false);
    const [customCheckoutText, setCustomCheckoutText] = useState('');
    
    const [remarks, setRemarks] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (sessionLog) {
            setDate(sessionLog.date || '');
            setStartTime(sessionLog.startTime === '-' ? '' : sessionLog.startTime);
            setEndTime(sessionLog.endTime === '-' ? '' : sessionLog.endTime);

            // Extract initial location IDs from rawLogs
            const locIds = (sessionLog.rawLogs || [])
                .map(l => l.location_id)
                .filter(Boolean);
            const uniqueLocIds = Array.from(new Set(locIds));
            setSelectedLocationIds(uniqueLocIds);

            const noteKey = `${sessionLog.userId}_${sessionLog.date}`;
            const note = visitNotes[noteKey] || {};
            setRemarks(note.remarks || '');

            // Parse Checkin Purpose
            const rawPurpose = note.purpose || sessionLog.purpose || '';
            const checkinParts = rawPurpose ? rawPurpose.split(',').map(p => p.trim()).filter(Boolean) : [];
            const matchedCheckin = checkinParts.filter(p => standardCheckinOptions.includes(p));
            const unmatchedCheckin = checkinParts.filter(p => !standardCheckinOptions.includes(p));

            setSelectedCheckinPurposes(matchedCheckin);
            if (unmatchedCheckin.length > 0) {
                setHasCustomCheckin(true);
                setCustomCheckinText(unmatchedCheckin.join(', '));
            } else {
                setHasCustomCheckin(false);
                setCustomCheckinText('');
            }

            // Parse Checkout Feedback
            const rawCheckout = note.checkoutFeedback || sessionLog.checkoutFeedback || '';
            const checkoutParts = rawCheckout ? rawCheckout.split(',').map(p => p.trim()).filter(Boolean) : [];
            const matchedCheckout = checkoutParts.filter(p => standardCheckoutOptions.includes(p));
            const unmatchedCheckout = checkoutParts.filter(p => !standardCheckoutOptions.includes(p));

            setSelectedCheckoutOptions(matchedCheckout);
            if (unmatchedCheckout.length > 0) {
                setHasCustomCheckout(true);
                setCustomCheckoutText(unmatchedCheckout.join(', '));
            } else {
                setHasCustomCheckout(false);
                setCustomCheckoutText('');
            }
        }
    }, [sessionLog, visitNotes]);

    if (!isOpen || !sessionLog) return null;

    const handleCheckinToggle = (option) => {
        setSelectedCheckinPurposes(prev =>
            prev.includes(option) ? prev.filter(p => p !== option) : [...prev, option]
        );
    };

    const handleCheckoutToggle = (option) => {
        setSelectedCheckoutOptions(prev =>
            prev.includes(option) ? prev.filter(p => p !== option) : [...prev, option]
        );
    };

    const handleLocationToggle = (locId) => {
        setSelectedLocationIds(prev =>
            prev.includes(locId) ? prev.filter(id => id !== locId) : [...prev, locId]
        );
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        // Time format check (HH:mm)
        const timeRegex = /^([01]?\d|2[0-3]):?([0-5]\d)$/;
        if (startTime && !startTime.match(timeRegex)) {
            return alert('올바른 시작 시간 형식이 아닙니다. (예: 14:30)');
        }
        if (endTime && endTime !== '-' && !endTime.match(timeRegex)) {
            return alert('올바른 종료 시간 형식이 아닙니다. (예: 16:30)');
        }

        if (selectedLocationIds.length === 0) {
            return alert('사용 공간을 최소 하나 이상 선택해주세요.');
        }

        // Combine Checkin Purposes
        const finalCheckin = [...selectedCheckinPurposes];
        if (hasCustomCheckin && customCheckinText.trim()) {
            finalCheckin.push(customCheckinText.trim());
        }

        // Combine Checkout Feedbacks
        const finalCheckout = [...selectedCheckoutOptions];
        if (hasCustomCheckout && customCheckoutText.trim()) {
            finalCheckout.push(customCheckoutText.trim());
        }

        setLoading(true);
        try {
            await onSave({
                ...sessionLog,
                date,
                startTime,
                endTime: endTime === '' ? '-' : endTime,
                purpose: finalCheckin.join(', '),
                checkoutFeedback: finalCheckout.join(', '),
                remarks,
                locationIds: selectedLocationIds
            });
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    return (
        <div onClick={onClose} className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in animate-duration-200" style={{ zIndex: 110 }}>
            <div className="bg-white w-full max-w-lg rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-fade-in-up" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 shrink-0">
                    <div>
                        <h3 className="font-extrabold text-gray-900 text-lg tracking-tight">방문 기록 수정</h3>
                        <p className="text-xs font-bold text-gray-400 mt-1">{sessionLog.name} ({sessionLog.school})</p>
                    </div>
                    <button onClick={onClose} type="button" className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-400 hover:text-gray-600 rounded-full transition-colors">
                        <X size={18} />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar">
                    {/* Date */}
                    <div>
                        <label className="block text-[11px] font-bold text-gray-400 mb-2 flex items-center gap-1.5 uppercase tracking-wider">
                            <Calendar size={13} className="text-gray-450" /> 방문 날짜
                        </label>
                        <input
                            type="date"
                            required
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-800 focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-100 outline-none transition-all"
                        />
                    </div>

                    {/* Time Range */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[11px] font-bold text-gray-400 mb-2 flex items-center gap-1.5 uppercase tracking-wider">
                                <Clock size={13} className="text-gray-450" /> 입실 시간
                            </label>
                            <input
                                type="text"
                                placeholder="14:30"
                                required
                                value={startTime}
                                onChange={(e) => setStartTime(e.target.value)}
                                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono font-bold text-gray-800 focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-100 outline-none transition-all text-center"
                            />
                        </div>
                        <div>
                            <label className="block text-[11px] font-bold text-gray-400 mb-2 flex items-center gap-1.5 uppercase tracking-wider">
                                <Clock size={13} className="text-gray-450" /> 퇴실 시간
                            </label>
                            <input
                                type="text"
                                placeholder="18:00 (또는 -)"
                                value={endTime}
                                onChange={(e) => setEndTime(e.target.value)}
                                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono font-bold text-gray-800 focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-100 outline-none transition-all text-center"
                            />
                        </div>
                    </div>

                    {/* Used Spaces (Locations) */}
                    <div>
                        <label className="block text-[11px] font-bold text-gray-400 mb-2.5 flex items-center gap-1.5 uppercase tracking-wider">
                            <Map size={13} className="text-gray-450" /> 사용 공간 (중복 선택)
                        </label>
                        <div className="flex flex-wrap gap-2 p-3 bg-gray-50 rounded-2xl border border-gray-150">
                            {locations.map(loc => {
                                const isChecked = selectedLocationIds.includes(loc.id);
                                return (
                                    <button
                                        key={loc.id}
                                        type="button"
                                        onClick={() => handleLocationToggle(loc.id)}
                                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                                            isChecked
                                                ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                                                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                                        }`}
                                    >
                                        {loc.name}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Check-in Purpose */}
                    <div>
                        <label className="block text-[11px] font-bold text-blue-600 mb-2.5 flex items-center gap-1.5 uppercase tracking-wider">
                            <BookOpen size={13} className="text-blue-500" /> 입실 기록 / 방문 목적 (중복 선택)
                        </label>
                        <div className="grid grid-cols-2 gap-2 mb-3">
                            {standardCheckinOptions.map(purp => {
                                const isChecked = selectedCheckinPurposes.includes(purp);
                                return (
                                    <button
                                        key={purp}
                                        type="button"
                                        onClick={() => handleCheckinToggle(purp)}
                                        className={`p-2.5 rounded-xl text-xs font-bold transition-all border flex items-center gap-2 ${
                                            isChecked
                                                ? 'bg-blue-50 border-blue-200 text-blue-700 font-extrabold shadow-sm'
                                                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                                        }`}
                                    >
                                        <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${isChecked ? 'border-blue-600 bg-blue-600' : 'border-gray-300 bg-white'}`}>
                                            {isChecked && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                                        </div>
                                        <span className="truncate">{purp}</span>
                                    </button>
                                );
                            })}
                            <button
                                type="button"
                                onClick={() => setHasCustomCheckin(prev => !prev)}
                                className={`p-2.5 rounded-xl text-xs font-bold transition-all border flex items-center gap-2 ${
                                    hasCustomCheckin
                                        ? 'bg-orange-50 border-orange-200 text-orange-700 font-extrabold shadow-sm'
                                        : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                                }`}
                            >
                                <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${hasCustomCheckin ? 'border-orange-500 bg-orange-500' : 'border-gray-300 bg-white'}`}>
                                    {hasCustomCheckin && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                                </div>
                                기타 (직접 입력)
                            </button>
                        </div>

                        {hasCustomCheckin && (
                            <input
                                type="text"
                                placeholder="입실 목적 직접 입력 (쉼표로 구분 가능)..."
                                value={customCheckinText}
                                onChange={(e) => setCustomCheckinText(e.target.value)}
                                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-800 focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-100 outline-none transition-all animate-fade-in animate-duration-150"
                            />
                        )}
                    </div>

                    {/* Checkout Feedback */}
                    <div>
                        <label className="block text-[11px] font-bold text-emerald-600 mb-2.5 flex items-center gap-1.5 uppercase tracking-wider">
                            <BookOpen size={13} className="text-emerald-500" /> 퇴실 기록 / 이용 소감 (중복 선택)
                        </label>
                        <div className="grid grid-cols-2 gap-2 mb-3">
                            {standardCheckoutOptions.map(purp => {
                                const isChecked = selectedCheckoutOptions.includes(purp);
                                return (
                                    <button
                                        key={purp}
                                        type="button"
                                        onClick={() => handleCheckoutToggle(purp)}
                                        className={`p-2.5 rounded-xl text-xs font-bold transition-all border flex items-center gap-2 ${
                                            isChecked
                                                ? 'bg-emerald-50 border-emerald-200 text-emerald-700 font-extrabold shadow-sm'
                                                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                                        }`}
                                    >
                                        <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${isChecked ? 'border-emerald-600 bg-emerald-600' : 'border-gray-300 bg-white'}`}>
                                            {isChecked && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                                        </div>
                                        <span className="truncate">{purp}</span>
                                    </button>
                                );
                            })}
                            <button
                                type="button"
                                onClick={() => setHasCustomCheckout(prev => !prev)}
                                className={`p-2.5 rounded-xl text-xs font-bold transition-all border flex items-center gap-2 ${
                                    hasCustomCheckout
                                        ? 'bg-orange-50 border-orange-200 text-orange-700 font-extrabold shadow-sm'
                                        : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                                }`}
                            >
                                <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${hasCustomCheckout ? 'border-orange-500 bg-orange-500' : 'border-gray-300 bg-white'}`}>
                                    {hasCustomCheckout && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                                </div>
                                기타 (직접 입력)
                            </button>
                        </div>

                        {hasCustomCheckout && (
                            <input
                                type="text"
                                placeholder="퇴실 소감 직접 입력 (쉼표로 구분 가능)..."
                                value={customCheckoutText}
                                onChange={(e) => setCustomCheckoutText(e.target.value)}
                                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-800 focus:bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-100 outline-none transition-all animate-fade-in animate-duration-150"
                            />
                        )}
                    </div>

                    {/* Remarks */}
                    <div>
                        <label className="block text-[11px] font-bold text-gray-400 mb-2 flex items-center gap-1.5 uppercase tracking-wider">
                            <AlertCircle size={13} className="text-gray-450" /> 비고
                        </label>
                        <textarea
                            placeholder="특이사항 입력..."
                            value={remarks}
                            onChange={(e) => setRemarks(e.target.value)}
                            rows={3}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-800 focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-100 outline-none transition-all resize-none"
                        />
                    </div>
                </form>

                {/* Footer Buttons */}
                <div className="p-6 border-t border-gray-100 bg-gray-50/50 flex items-center justify-end gap-3 shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-5 py-3 bg-gray-200 hover:bg-gray-300 text-gray-600 rounded-xl text-xs font-bold transition-all active:scale-[0.98]"
                    >
                        취소
                    </button>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={loading}
                        className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-extrabold shadow-md shadow-blue-100 transition-all active:scale-[0.98] disabled:opacity-50 min-w-[120px]"
                    >
                        {loading ? '저장 중...' : '변경 사항 저장'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default VisitLogEditModal;