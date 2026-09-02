import React from 'react';
import { X, RefreshCw } from 'lucide-react';
import useModalClose from '../../../../hooks/useModalClose';

const ManualEntryModal = ({ hookData, users, locations }) => {
    const {
        isManualModalOpen, setIsManualModalOpen,
        manualEntry, setManualEntry,
        userSearchText, setUserSearchText,
        showUserResults, setShowUserResults,
        handleManualSubmit
    } = hookData;

    useModalClose(isManualModalOpen, () => setIsManualModalOpen(false));

    if (!isManualModalOpen) return null;

    return (
        <div onClick={(e) => { if (e.target === e.currentTarget) setIsManualModalOpen(false); }} className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                    <div>
                        <h3 className="text-xl font-extrabold text-gray-800">방문 기록 수기작성</h3>
                        <p className="text-xs text-gray-400 font-bold">오프라인 방문 데이터를 수동으로 입력합니다.</p>
                    </div>
                    <button onClick={() => setIsManualModalOpen(false)} className="p-2 hover:bg-white rounded-full transition text-gray-400">
                        <X size={24} />
                    </button>
                </div>

                {/* Entry Type Tabs */}
                <div className="flex bg-gray-100 p-1 mx-6 mt-6 rounded-xl">
                    <button
                        type="button"
                        onClick={() => setManualEntry({ ...manualEntry, entryType: 'MEMBER' })}
                        className={`flex-1 py-2 text-xs font-black rounded-lg transition-all ${manualEntry.entryType === 'MEMBER' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                        회원 기록
                    </button>
                    <button
                        type="button"
                        onClick={() => setManualEntry({ ...manualEntry, entryType: 'GUEST' })}
                        className={`flex-1 py-2 text-xs font-black rounded-lg transition-all ${manualEntry.entryType === 'GUEST' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                        게스트 기록
                    </button>
                </div>

                <form onSubmit={handleManualSubmit} className="p-6 pt-4 space-y-4">
                    {/* Type-Specific Selection */}
                    {manualEntry.entryType === 'MEMBER' ? (
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-gray-500 flex items-center gap-1"><RefreshCw size={12} /> 회원 선택</label>
                            <div className="relative">
                                <input
                                    type="text"
                                    placeholder="이름 또는 학교 검색..."
                                    value={userSearchText}
                                    onChange={(e) => {
                                        setUserSearchText(e.target.value);
                                        setShowUserResults(true);
                                    }}
                                    onFocus={() => setShowUserResults(true)}
                                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-400 focus:bg-white transition-all text-sm font-bold"
                                />
                                {showUserResults && userSearchText && (
                                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-100 rounded-xl shadow-xl max-h-[160px] overflow-y-auto z-10 custom-scrollbar">
                                        {users.filter(u =>
                                            u.name.includes(userSearchText) || (u.school && u.school.includes(userSearchText))
                                        ).map(u => (
                                            <button
                                                key={u.id}
                                                type="button"
                                                onClick={() => {
                                                    setManualEntry({ ...manualEntry, userId: u.id });
                                                    setUserSearchText(`${u.name} (${u.school || '-'})`);
                                                    setShowUserResults(false);
                                                }}
                                                className="w-full p-2.5 text-left hover:bg-blue-50 transition border-b border-gray-50 last:border-0 flex justify-between items-center"
                                            >
                                                <span className="font-bold text-gray-700 text-sm">{u.name}</span>
                                                <span className="text-[10px] text-gray-400 font-bold">{u.school} | {u.birth}</span>
                                            </button>
                                        ))}
                                        {users.filter(u => u.name.includes(userSearchText) || (u.school && u.school.includes(userSearchText))).length === 0 && (
                                            <div className="p-4 text-center text-xs text-gray-400">검색 결과가 없습니다.</div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-gray-500">게스트 이름</label>
                                <input
                                    type="text"
                                    value={manualEntry.guestName}
                                    onChange={(e) => setManualEntry({ ...manualEntry, guestName: e.target.value })}
                                    placeholder="이름 입력"
                                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-indigo-400 focus:bg-white transition-all text-sm font-bold"
                                    required
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-gray-500">학교 / 소속</label>
                                <input
                                    type="text"
                                    value={manualEntry.guestSchool}
                                    onChange={(e) => setManualEntry({ ...manualEntry, guestSchool: e.target.value })}
                                    placeholder="학교명 입력"
                                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-indigo-400 focus:bg-white transition-all text-sm font-bold"
                                    required
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-gray-500">생년월일 (6자리)</label>
                                <input
                                    type="text"
                                    maxLength="6"
                                    value={manualEntry.guestBirth}
                                    onChange={(e) => setManualEntry({ ...manualEntry, guestBirth: e.target.value.replace(/[^0-9]/g, '') })}
                                    placeholder="YYMMDD"
                                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-indigo-400 focus:bg-white transition-all text-sm font-bold"
                                    required
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-gray-500">휴대폰 번호</label>
                                <input
                                    type="text"
                                    value={manualEntry.guestPhone}
                                    onChange={(e) => {
                                        let val = e.target.value.replace(/[^0-9]/g, '');
                                        if (val.length > 11) val = val.slice(0, 11);
                                        setManualEntry({ ...manualEntry, guestPhone: val });
                                    }}
                                    placeholder="01012345678"
                                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-indigo-400 focus:bg-white transition-all text-sm font-bold"
                                    required
                                />
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-gray-500">방문 날짜</label>
                            <input
                                type="date"
                                value={manualEntry.date}
                                onChange={(e) => setManualEntry({ ...manualEntry, date: e.target.value })}
                                className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-400 focus:bg-white transition-all text-sm font-bold"
                                required
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-gray-500">사용 공간</label>
                            <select
                                value={manualEntry.locationId}
                                onChange={(e) => setManualEntry({ ...manualEntry, locationId: e.target.value })}
                                className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-400 focus:bg-white transition-all text-sm font-bold appearance-none"
                                required
                            >
                                <option value="">장소 선택...</option>
                                {locations.filter(loc => loc.is_active !== false).map(loc => (
                                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-gray-500">방문 목적</label>
                            <input
                                type="text"
                                value={manualEntry.purpose}
                                onChange={(e) => setManualEntry({ ...manualEntry, purpose: e.target.value })}
                                placeholder="방문 목적 입력..."
                                className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-400 focus:bg-white transition-all text-sm font-bold"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-gray-500">비고</label>
                            <input
                                type="text"
                                value={manualEntry.remarks}
                                onChange={(e) => setManualEntry({ ...manualEntry, remarks: e.target.value })}
                                placeholder="비고 입력..."
                                className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-400 focus:bg-white transition-all text-sm font-bold"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-gray-500">시작 시간</label>
                            <input
                                type="time"
                                step="300"
                                value={manualEntry.startTime}
                                onChange={(e) => setManualEntry({ ...manualEntry, startTime: e.target.value })}
                                className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-400 focus:bg-white transition-all text-sm font-bold"
                                required
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-gray-500">종료 시간</label>
                            <input
                                type="time"
                                step="300"
                                value={manualEntry.endTime}
                                onChange={(e) => setManualEntry({ ...manualEntry, endTime: e.target.value })}
                                className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-400 focus:bg-white transition-all text-sm font-bold"
                                required
                            />
                        </div>
                    </div>

                    <div className="pt-4 flex gap-2">
                        <button
                            type="button"
                            onClick={() => setIsManualModalOpen(false)}
                            className="flex-1 py-3 bg-gray-100 text-gray-500 rounded-2xl font-bold hover:bg-gray-200 transition"
                        >
                            취소
                        </button>
                        <button
                            type="submit"
                            className="flex-[2] py-3 bg-blue-600 text-white rounded-2xl font-extrabold hover:bg-blue-700 transition shadow-lg shadow-blue-100"
                        >
                            저장하기
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ManualEntryModal;
