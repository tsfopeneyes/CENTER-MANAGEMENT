import React from 'react';
import { motion } from 'framer-motion';
import { Users, X } from 'lucide-react';
import useModalClose from '../../../../hooks/useModalClose';

const GuestListModal = ({ isOpen, onClose, spaceName, guests }) => {
    useModalClose(isOpen, onClose);
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/40 z-[120] flex items-center justify-center p-4 backdrop-blur-lg animate-fade-in">
            <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                className="bg-white w-full max-w-lg rounded-[2.5rem] p-8 shadow-2xl relative border border-gray-100 flex flex-col max-h-[80vh]"
            >
                <div className="flex justify-between items-center mb-6 shrink-0">
                    <div>
                        <h3 className="text-2xl font-black text-gray-800 tracking-tight flex items-center gap-2">
                            <Users className="text-indigo-600" />
                            {spaceName} 게스트 명단
                        </h3>
                        <p className="text-sm font-bold text-gray-400 mt-1">총 {guests.length}명의 게스트가 방문했습니다.</p>
                    </div>
                    <button onClick={onClose} className="p-2 bg-gray-50 text-gray-400 hover:text-gray-600 rounded-xl transition">
                        <X size={24} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-3">
                    {guests.length === 0 ? (
                        <div className="text-center py-10 text-gray-400 font-bold">방문한 게스트가 없습니다.</div>
                    ) : (
                        guests.map((g, idx) => (
                            <div key={idx} className="bg-gray-50 p-4 rounded-2xl flex justify-between items-center border border-gray-100">
                                <div>
                                    <p className="font-black text-gray-800 text-lg">{g.name}</p>
                                    <p className="text-xs font-bold text-gray-500">{g.school} | {g.phone}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm font-black text-indigo-600">{g.visits}회 방문</p>
                                    <p className="text-xs font-bold text-gray-400">총 {Math.floor(g.duration / 60)}h {g.duration % 60}m</p>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </motion.div>
        </div>
    );
};

export default GuestListModal;
