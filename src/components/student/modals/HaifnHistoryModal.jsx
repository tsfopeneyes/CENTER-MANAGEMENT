import React, { useState, useEffect } from 'react';
import { supabase } from '../../../supabaseClient';
import { X, RefreshCw, Clock } from 'lucide-react';
import { motion } from 'framer-motion';
import PurchaseReceiptModal from './PurchaseReceiptModal';
import useModalClose from '../../../hooks/useModalClose';

const HaifnHistoryModal = ({ user, onClose, storeItems = [] }) => {
    useModalClose(!!user, onClose);
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [receiptData, setReceiptData] = useState(null);

    const fetchHistory = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('haifn_transactions')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setHistory(data || []);
        } catch (err) {
            console.error('Failed to fetch haifn history:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (user) fetchHistory();
    }, [user]);

    return (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center sm:p-4">
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                onClick={onClose}
            />
            
            <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 200 }}
                className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden relative z-10 flex flex-col max-h-[90vh]"
            >
                <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-white sticky top-0 shrink-0">
                    <h3 className="text-lg font-black text-gray-800">나의 하이픈 내역</h3>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="overflow-y-auto w-full flex-1 p-5 bg-gray-50/50 custom-scrollbar">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-3">
                            <RefreshCw className="animate-spin text-blue-500" size={24} />
                            <p className="font-bold text-gray-400 text-sm">기록을 불러오는 중...</p>
                        </div>
                    ) : history.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
                            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-2">
                                <Clock size={32} className="text-gray-300" />
                            </div>
                            <h4 className="font-black text-gray-800">아직 내역이 없습니다</h4>
                            <p className="text-xs text-gray-500 font-medium leading-relaxed">센터를 방문하고 프로그램에 참여하여<br/>하이픈을 모아보세요!</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {history.map(item => (
                                <div key={item.id} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col gap-2">
                                    <div className="flex items-center justify-between">
                                        <div className="min-w-0 pr-4">
                                            <p className="font-black text-gray-800 text-sm mb-1 truncate">{item.source_description}</p>
                                            <p className="text-[10px] text-gray-400 font-medium">{new Date(item.created_at).toLocaleString()}</p>
                                        </div>
                                        <div className={`text-lg font-black whitespace-nowrap flex flex-col items-end ${item.amount > 0 ? 'text-blue-500' : 'text-red-500'}`}>
                                            {item.amount > 0 ? '+' : ''}{item.amount}H
                                        </div>
                                    </div>
                                    {item.amount < 0 && item.source_description.includes('[스토어 교환]') && (
                                        <button 
                                            onClick={() => {
                                                const itemName = item.source_description.replace('[스토어 교환] ', '').trim();
                                                const matchedItem = storeItems.find(s => s.name === itemName);
                                                setReceiptData({
                                                    ...item,
                                                    image_url: matchedItem ? matchedItem.image_url : null
                                                });
                                            }}
                                            className="mt-2 w-full py-2.5 bg-indigo-50 text-indigo-600 font-black text-xs rounded-xl hover:bg-indigo-100 transition-colors"
                                        >
                                            교환권 확인하기
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </motion.div>
            
            {receiptData && <PurchaseReceiptModal transaction={receiptData} onClose={() => setReceiptData(null)} />}
        </div>
    );
};

export default HaifnHistoryModal;
