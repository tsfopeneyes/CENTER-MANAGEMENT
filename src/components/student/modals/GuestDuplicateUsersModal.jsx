import React from 'react';
import { motion } from 'framer-motion';
import { X, User, School, ArrowRight } from 'lucide-react';

const GuestDuplicateUsersModal = ({
    showDuplicatesModal,
    setShowDuplicatesModal,
    loginDuplicates,
    handleDuplicateSelect,
    loginPassword,
    attemptLoginAuth,
    hashedPassword
}) => {
    if (!showDuplicatesModal) return null;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowDuplicatesModal(false)}
        >
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl relative"
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    onClick={() => setShowDuplicatesModal(false)}
                    className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-full text-gray-400 transition"
                >
                    <X size={20} />
                </button>

                <div className="mb-4">
                    <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        <span>👥</span> 동일한 이름이 여러 명 있습니다
                    </h3>
                    <p className="text-xs text-gray-400 font-semibold mt-1">
                        본인의 학교와 소속 정보를 확인 후 선택해 주세요.
                    </p>
                </div>

                <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                    {loginDuplicates.map((candidate) => (
                        <button
                            key={candidate.id}
                            onClick={async () => {
                                setShowDuplicatesModal(false);
                                await attemptLoginAuth(candidate, hashedPassword, loginPassword);
                            }}
                            className="w-full p-3.5 bg-gray-50 hover:bg-blue-50 border border-gray-200 hover:border-blue-300 rounded-2xl text-left transition flex items-center justify-between group"
                        >
                            <div>
                                <p className="font-bold text-gray-800 text-sm flex items-center gap-1.5">
                                    <User size={15} className="text-gray-400" />
                                    {candidate.name}
                                </p>
                                <p className="text-xs text-gray-500 font-medium flex items-center gap-1 mt-1">
                                    <School size={13} className="text-gray-400" />
                                    {candidate.school || '학교 미등록'}
                                </p>
                            </div>
                            <ArrowRight size={16} className="text-gray-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition" />
                        </button>
                    ))}
                </div>
            </motion.div>
        </motion.div>
    );
};

export default GuestDuplicateUsersModal;
