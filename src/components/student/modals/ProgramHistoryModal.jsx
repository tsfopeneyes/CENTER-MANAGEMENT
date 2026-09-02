import React from 'react';
import { motion } from 'framer-motion';
import { X, CheckCircle } from 'lucide-react';
import useModalClose from '../../../hooks/useModalClose';

const ProgramHistoryModal = ({ attendedProgramsList, setShowProgramHistory }) => {
    useModalClose(true, () => setShowProgramHistory(false));
    return (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm"
                        onClick={() => setShowProgramHistory(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.9, y: 20 }}
                            className="bg-white w-full max-w-sm rounded-[2.5rem] overflow-hidden shadow-2xl"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="p-8 pb-4 flex justify-between items-center">
                                <h3 className="text-xl font-black text-gray-800">참여 프로그램 내역</h3>
                                <button onClick={() => setShowProgramHistory(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                                    <X size={20} className="text-gray-400" />
                                </button>
                            </div>
                            <div className="px-8 pb-10 max-h-[60vh] overflow-y-auto">
                                {attendedProgramsList.length === 0 ? (
                                    <div className="text-center py-10">
                                        <p className="text-gray-400 font-bold">참여한 프로그램이 없습니다.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {attendedProgramsList.map((title, idx) => (
                                            <div key={idx} className="p-4 bg-blue-50/50 rounded-2xl border border-blue-100 flex items-center gap-3">
                                                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600">
                                                    <CheckCircle size={16} strokeWidth={3} />
                                                </div>
                                                <span className="text-gray-700 font-bold text-sm leading-tight">{title}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
    );
};
export default ProgramHistoryModal;
