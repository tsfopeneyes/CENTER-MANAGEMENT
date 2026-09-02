import React, { useState, useEffect } from 'react';

const IntuitiveTimePicker = ({ value, onChange, label = '시간', minuteStep = 5 }) => {
    // value format: "HH:mm" (24h)
    const [period, setPeriod] = useState('오전');
    const [hour, setHour] = useState(1);
    const [minute, setMinute] = useState(0);

    useEffect(() => {
        if (value) {
            const [h, m] = value.split(':').map(Number);
            if (h >= 12) {
                setPeriod('오후');
                setHour(h === 12 ? 12 : h - 12);
            } else {
                setPeriod('오전');
                setHour(h === 0 ? 12 : h);
            }
            setMinute(m);
        }
    }, [value]);

    const updateValue = (newPeriod, newHour, newMinute) => {
        let h = parseInt(newHour);
        if (newPeriod === '오후' && h !== 12) h += 12;
        if (newPeriod === '오전' && h === 12) h = 0;

        const m = newMinute.toString().padStart(2, '0');
        const hStr = h.toString().padStart(2, '0');
        onChange(`${hStr}:${m}`);
    };

    const handlePeriodChange = (p) => {
        setPeriod(p);
        updateValue(p, hour, minute);
    };

    const handleHourChange = (h) => {
        setHour(h);
        updateValue(period, h, minute);
    };

    const handleMinuteChange = (m) => {
        setMinute(m);
        updateValue(period, hour, m);
    };

    return (
        <div className="flex items-center justify-between gap-1 w-full h-full">
            {/* Period Selection */}
            <div className="flex bg-slate-200/60 rounded-lg p-0.5 shrink-0">
                {['오전', '오후'].map(p => (
                    <button
                        key={p}
                        type="button"
                        aria-label={`${label} ${p}`}
                        aria-pressed={period === p}
                        onClick={() => handlePeriodChange(p)}
                        className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold transition-all ${period === p ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        {p}
                    </button>
                ))}
            </div>

            {/* Time Selectors */}
            <div className="flex items-center gap-1 px-1 flex-1 justify-center">
                <select
                    aria-label={`${label} 시`}
                    value={hour}
                    onChange={(e) => handleHourChange(e.target.value)}
                    className="bg-transparent text-xs font-bold text-slate-800 outline-none scrollbar-hide appearance-none cursor-pointer hover:text-blue-600 transition-colors w-5 text-center"
                >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(h => (
                        <option key={h} value={h}>{h}</option>
                    ))}
                </select>

                <span className="text-gray-300 font-bold text-xs">:</span>

                <select
                    aria-label={`${label} 분`}
                    value={minute}
                    onChange={(e) => handleMinuteChange(parseInt(e.target.value))}
                    className="bg-transparent text-xs font-bold text-slate-800 outline-none scrollbar-hide appearance-none cursor-pointer hover:text-blue-600 transition-colors w-6 text-center"
                >
                    {Array.from(new Set([...Array.from({ length: Math.ceil(60 / minuteStep) }, (_, i) => i * minuteStep), minute])).sort((a, b) => a - b).map(m => (
                        <option key={m} value={m}>{m.toString().padStart(2, '0')}</option>
                    ))}
                </select>
            </div>
        </div>
    );
};

export default IntuitiveTimePicker;
