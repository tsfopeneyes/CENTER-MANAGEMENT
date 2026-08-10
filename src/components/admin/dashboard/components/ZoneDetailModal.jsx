import React, { useEffect } from 'react';
import { X } from 'lucide-react';

const ZoneDetailModal = ({
    zoneDetailModal,
    setZoneDetailModal,
    handleForceCheckout,
    onUserClick
}) => {
    // ESC key listener to close modal
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                setZoneDetailModal(prev => ({ ...prev, isOpen: false }));
            }
        };
        if (zoneDetailModal.isOpen) {
            window.addEventListener('keydown', handleKeyDown);
        }
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [zoneDetailModal.isOpen, setZoneDetailModal]);

    if (!zoneDetailModal.isOpen) return null;

    const totalCount = zoneDetailModal.activeUsers.length;
    const activeCount = zoneDetailModal.activeUsers.filter(u => u.isActive).length;

    return (
        <div 
            className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4 animate-fade-in"
            onClick={() => setZoneDetailModal({ ...zoneDetailModal, isOpen: false })}
        >
            <div 
                className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center bg-blue-50/70">
                    <div className="flex items-center gap-2.5">
                        <h3 className="font-black text-blue-900 text-base">{zoneDetailModal.locationName}</h3>
                        <span className="text-[11px] font-bold text-blue-600 bg-white/90 border border-blue-200 px-2.5 py-0.5 rounded-full shadow-sm">
                            오늘 이용 (총 {totalCount}명 | 이용 중 {activeCount}명)
                        </span>
                    </div>
                    <button onClick={() => setZoneDetailModal({ ...zoneDetailModal, isOpen: false })}>
                        <X size={18} className="text-blue-400 hover:text-blue-600 transition" />
                    </button>
                </div>

                {/* Sub Header Column Titles */}
                <div className="px-5 py-2 bg-gray-50/80 border-b border-gray-100 text-[11px] font-black text-gray-400 uppercase tracking-widest grid grid-cols-[1fr_125px_55px] gap-3 items-center">
                    <span>이용자 (이름 / 학교)</span>
                    <span>입/퇴실 시간</span>
                    <span className="text-right">관리</span>
                </div>

                {/* Body - Compact 1-Line List View */}
                <div className="flex-1 overflow-y-auto p-3.5 space-y-1.5 custom-scrollbar">
                    {totalCount === 0 ? (
                        <div className="text-center py-10 text-gray-400 font-bold text-sm">오늘 이용한 사람이 없습니다.</div>
                    ) : (
                        zoneDetailModal.activeUsers.map(u => {
                            const cleanNameStr = (u.name || '')
                                .replace('(guest)', '')
                                .replace(/@/g, '')
                                .replace(/\(guest\)/gi, '')
                                .replace(/\(게스트\)/gi, '')
                                .trim() || '게스트';

                            return (
                                <div 
                                    key={u.id} 
                                    className={`px-3.5 py-2 rounded-xl border grid grid-cols-[1fr_125px_55px] gap-3 items-center transition-all duration-200 text-xs ${
                                        u.isActive 
                                            ? 'bg-white border-gray-100 hover:bg-blue-50/30' 
                                            : 'bg-slate-100/90 border-slate-200 text-slate-500 opacity-60'
                                    }`}
                                >
                                    {/* Col 1: Avatar + Name (Star) + School in 1 Single Line */}
                                    <div 
                                        onClick={() => onUserClick?.(u)}
                                        className="flex items-center gap-2 min-w-0 overflow-hidden cursor-pointer group/user"
                                        title="회원 정보 카드 보기"
                                    >
                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold ${
                                            u.isActive ? 'bg-blue-100 text-blue-600' : 'bg-gray-300 text-gray-600'
                                        }`}>
                                            {cleanNameStr[0] || ''}
                                        </div>

                                        <div className="flex items-center gap-1 min-w-0 overflow-hidden text-xs">
                                            <span className="font-bold text-gray-800 shrink-0 group-hover/user:text-blue-600 group-hover/user:underline">
                                                {cleanNameStr}
                                            </span>
                                            {u.is_leader && <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="#FACC15" stroke="#FACC15" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>}
                                            {u.school && (
                                                <span className="text-[11px] text-gray-400 font-medium truncate">
                                                    ({u.school})
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Col 2: Entry / Exit Time */}
                                    <div className="font-semibold text-gray-600 truncate text-[11px]">
                                        {u.checkInTime ? (
                                            u.isActive ? (
                                                <span className="text-blue-600 font-bold">
                                                    {new Date(u.checkInTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })} 입실
                                                </span>
                                            ) : (
                                                <span className="text-gray-500">
                                                    {new Date(u.checkInTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })} 입실
                                                    {u.checkOutTime ? (
                                                        <span className="font-bold text-gray-700 ml-1">
                                                            | {new Date(u.checkOutTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })} 퇴실
                                                        </span>
                                                    ) : (
                                                        <span className="text-gray-400 font-medium ml-1">
                                                            (퇴실완료)
                                                        </span>
                                                    )}
                                                </span>
                                            )
                                        ) : '-'}
                                    </div>

                                    {/* Col 3: Action Button */}
                                    <div className="text-right shrink-0">
                                        {u.isActive ? (
                                            <button
                                                onClick={() => handleForceCheckout(u.id)}
                                                className="text-[10px] bg-white text-red-500 hover:bg-red-500 hover:text-white px-2 py-0.5 rounded-md font-bold transition border border-red-200 hover:border-red-500 shadow-sm"
                                            >
                                                퇴실
                                            </button>
                                        ) : (
                                            <span className="text-[10px] font-bold text-gray-400">퇴실완료</span>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
};

export default ZoneDetailModal;
