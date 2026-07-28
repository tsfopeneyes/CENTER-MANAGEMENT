import React, { useState } from 'react';
import { Clock, Save, MapPin } from 'lucide-react';

const defaultSingleHours = {
    monday: { isOpen: false, open: '10:00', close: '19:00', label: '월요일' },
    tuesday: { isOpen: true, open: '10:00', close: '19:00', label: '화요일' },
    wednesday: { isOpen: true, open: '10:00', close: '19:00', label: '수요일' },
    thursday: { isOpen: true, open: '10:00', close: '19:00', label: '목요일' },
    friday: { isOpen: true, open: '10:00', close: '19:00', label: '금요일' },
    saturday: { isOpen: true, open: '10:00', close: '19:00', label: '토요일' },
    sunday: { isOpen: false, open: '10:00', close: '19:00', label: '일요일' }
};

const OperatingHoursSettings = ({
    operatingHours,
    handleUpdateOperatingHours,
    handleSaveOperatingHours,
    hoursLoading
}) => {
    const [activeSpace, setActiveSpace] = useState('하이픈');
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

    const spaces = [
        { key: '하이픈', name: '하이픈', region: '강동', color: 'blue' },
        { key: '이높플레이스', name: '이높플레이스', region: '강서', color: 'purple' }
    ];

    const getSpaceHours = (spaceKey) => {
        if (!operatingHours) return defaultSingleHours;
        if (operatingHours[spaceKey]) return operatingHours[spaceKey];
        if (operatingHours.monday || operatingHours.tuesday) return operatingHours;
        return defaultSingleHours;
    };

    const currentSpaceHours = getSpaceHours(activeSpace);

    const onFieldChange = (day, field, value) => {
        if (typeof handleUpdateOperatingHours === 'function') {
            if (handleUpdateOperatingHours.length >= 4) {
                handleUpdateOperatingHours(activeSpace, day, field, value);
            } else {
                handleUpdateOperatingHours(activeSpace, day, field, value);
            }
        }
    };

    return (
        <div className="w-full bg-white rounded-[24px] border border-[#f2f4f6] p-6 shadow-sm flex flex-col gap-6">
            {/* Top Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-100 pb-6">
                <div>
                    <h3 className="text-lg font-bold text-[#191f28] flex items-center gap-2 tracking-tight">
                        <Clock className="text-[#3182f6]" size={20} />
                        기본 운영 시간 설정
                    </h3>
                    <p className="text-xs md:text-sm text-[#8b95a1] mt-1 font-medium leading-relaxed">
                        공간별(하이픈 / 이높플레이스) 요일별 운영 시간을 각각 독립적으로 설정할 수 있습니다.
                    </p>
                </div>
                <button
                    onClick={handleSaveOperatingHours}
                    disabled={hoursLoading}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold transition-all shadow-sm shrink-0 text-xs ${
                        hoursLoading
                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                            : 'bg-indigo-600 text-white hover:bg-indigo-500 hover:-translate-y-0.5 hover:shadow-md'
                    }`}
                >
                    <Save size={18} />
                    {hoursLoading ? '저장 중...' : '운영 시간 저장'}
                </button>
            </div>

            {/* Sub Tabs: 공간 선택 */}
            <div className="flex items-center justify-between gap-3 bg-gray-50/80 p-1.5 rounded-2xl border border-gray-100">
                <div className="flex items-center gap-2 w-full sm:w-auto">
                    {spaces.map(sp => {
                        const isActive = activeSpace === sp.key;
                        const spaceData = getSpaceHours(sp.key);
                        const openDaysCount = days.filter(d => spaceData[d]?.isOpen).length;

                        return (
                            <button
                                key={sp.key}
                                onClick={() => setActiveSpace(sp.key)}
                                className={`flex-1 sm:flex-initial px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 ${
                                    isActive
                                        ? 'bg-white text-[#191f28] shadow-sm border border-gray-200/80'
                                        : 'text-gray-500 hover:text-gray-800 hover:bg-white/50'
                                }`}
                            >
                                <span className={`w-2 h-2 rounded-full ${sp.color === 'blue' ? 'bg-blue-500' : 'bg-purple-500'}`}></span>
                                <span>{sp.name}</span>
                                <span className="text-[10px] font-semibold text-gray-400">({sp.region})</span>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                                    isActive ? 'bg-indigo-50 text-indigo-600' : 'bg-gray-200/60 text-gray-500'
                                }`}>
                                    주 {openDaysCount}일 오픈
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Operating Days Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 pt-2">
                {days.map(day => {
                    const data = currentSpaceHours[day] || defaultSingleHours[day];
                    return (
                        <div
                            key={day}
                            className={`p-4 rounded-2xl border transition-colors ${
                                data.isOpen ? 'bg-indigo-50/30 border-indigo-100' : 'bg-gray-50 border-gray-100'
                            }`}
                        >
                            <div className="flex items-center justify-between mb-3">
                                <span className="font-black text-gray-700">{data.label}</span>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={data.isOpen}
                                        onChange={(e) => onFieldChange(day, 'isOpen', e.target.checked)}
                                        className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#3182f6]"></div>
                                </label>
                            </div>

                            <div className={`flex items-center gap-1.5 ${!data.isOpen && 'opacity-40 pointer-events-none'}`}>
                                <input
                                    type="time"
                                    value={data.open}
                                    onChange={(e) => onFieldChange(day, 'open', e.target.value)}
                                    className="w-full min-w-[70px] px-2 py-2 bg-[#f2f4f6] border border-transparent rounded-xl outline-none focus:bg-white focus:border-[#3182f6] transition-all font-bold text-[#191f28] text-xs md:text-sm text-center"
                                />
                                <span className="text-gray-400 font-bold text-xs">-</span>
                                <input
                                    type="time"
                                    value={data.close}
                                    onChange={(e) => onFieldChange(day, 'close', e.target.value)}
                                    className="w-full min-w-[70px] px-2 py-2 bg-[#f2f4f6] border border-transparent rounded-xl outline-none focus:bg-white focus:border-[#3182f6] transition-all font-bold text-[#191f28] text-xs md:text-sm text-center"
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default OperatingHoursSettings;
