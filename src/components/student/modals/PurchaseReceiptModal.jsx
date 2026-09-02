import React from 'react';
import { X, CheckCircle2 } from 'lucide-react';
import useModalClose from '../../../hooks/useModalClose';

const PurchaseReceiptModal = ({ transaction, onClose }) => {
    useModalClose(!!transaction, onClose);
    if (!transaction) return null;

    // Remove prefix like "[스토어 교환] " if it exists
    const itemName = transaction.source_description.replace('[스토어 교환] ', '').replace('[관리자 지급] ', '');
    
    // Format the date carefully for a gigantic, easy-to-read timestamp
    const dateObj = new Date(transaction.created_at);
    const dateStr = dateObj.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
    const timeStr = dateObj.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

    return (
        <div 
            className="fixed inset-0 z-[999] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-fade-in"
            onClick={onClose}
        >
            <div 
                className="bg-white w-full max-w-sm rounded-[2rem] shadow-2xl relative overflow-hidden animate-slide-up flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                
                {/* Image Header Area - Full width */}
                <div className="relative h-64 w-full bg-gray-100 flex-shrink-0">
                    {transaction.image_url ? (
                        <img src={transaction.image_url} alt={itemName} className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full bg-gradient-to-br from-indigo-500 to-blue-500 flex items-center justify-center">
                            <CheckCircle2 size={48} className="text-white opacity-40" />
                        </div>
                    )}
                    
                    {/* Dark gradient overlay for text readability */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
                    
                    {/* Close Button */}
                    <button 
                        onClick={onClose}
                        className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center bg-black/20 text-white rounded-full hover:bg-black/40 backdrop-blur-md transition-colors"
                    >
                        <X size={18} />
                    </button>

                    {/* Title Text over Image */}
                    <div className="absolute bottom-6 left-6 right-6 flex flex-col items-start text-left">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="inline-flex items-center px-2 py-1 bg-blue-500/80 text-white text-[10px] font-black rounded backdrop-blur-md uppercase tracking-widest border border-white/20">
                                🎟️ 스토어 교환권
                            </span>
                            <span className="inline-flex items-center px-2 py-1 bg-black/40 text-white text-[10px] font-black rounded backdrop-blur-md tracking-widest border border-white/10">
                                사용확인용
                            </span>
                        </div>
                        <h3 className="text-3xl font-black text-white tracking-tight leading-tight drop-shadow-md">
                            {itemName}
                        </h3>
                    </div>
                </div>

                {/* Perforated Separator Line */}
                <div className="relative flex items-center bg-white h-0 z-10">
                    <div className="w-full border-t-[3px] border-dashed border-gray-200 mx-6 absolute -top-[1.5px]" />
                </div>

                {/* Details Area */}
                <div className="px-6 py-8 bg-white flex flex-col">
                    <div className="flex justify-between items-end mb-6">
                        <div>
                            <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-1">차감된 하이픈</p>
                            <p className="text-3xl font-black text-blue-600 leading-none tracking-tighter">
                                {Math.abs(transaction.amount)}<span className="text-lg text-blue-500 ml-1">H</span>
                            </p>
                        </div>
                        <div className="text-right">
                            <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-1">상태</p>
                            <div className="inline-flex items-center gap-1.5 bg-green-50 text-green-600 border border-green-100 px-2.5 py-1 rounded-lg">
                                <CheckCircle2 size={12} className="fill-green-200" />
                                <span className="font-bold text-xs tracking-tight">정상 승인</span>
                            </div>
                        </div>
                    </div>

                    {/* Timestamp Details */}
                    <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100 flex flex-col relative">
                        <div className="text-center z-10 relative">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">결제 타임스탬프</p>
                            <p className="text-xl font-black text-gray-800 tracking-tighter">
                                {dateStr} <span className="text-indigo-600 ml-1">{timeStr}</span>
                            </p>
                        </div>
                    </div>
                </div>

                {/* Footer Action */}
                <div className="p-4 bg-white border-t border-gray-100">
                    <button 
                        onClick={onClose}
                        className="w-full py-4 text-center font-bold text-gray-800 hover:text-black bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors active:scale-95"
                    >
                        확인 완료 및 닫기
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PurchaseReceiptModal;
