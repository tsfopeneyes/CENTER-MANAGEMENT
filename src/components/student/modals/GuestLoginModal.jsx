import React from 'react';
import { motion } from 'framer-motion';
import { X, User, Lock, ArrowRight } from 'lucide-react';

const GuestLoginModal = ({
    showLoginModal,
    setShowLoginModal,
    handleLoginSubmit,
    loginName,
    setLoginName,
    loginPassword,
    setLoginPassword,
    loginLoading
}) => {
    if (!showLoginModal) return null;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowLoginModal(false)}
        >
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl relative"
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    onClick={() => setShowLoginModal(false)}
                    className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-full text-gray-400 transition"
                >
                    <X size={20} />
                </button>

                <div className="mb-6">
                    <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                        <span className="text-2xl">🔑</span> 로그인
                    </h3>
                    <p className="text-xs text-gray-400 font-semibold mt-1">
                        로그인 시 자동으로 체크인이 진행됩니다
                    </p>
                </div>

                <form onSubmit={handleLoginSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1 ml-1">이름</label>
                        <div className="relative">
                            <User size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                type="text"
                                value={loginName}
                                onChange={(e) => setLoginName(e.target.value)}
                                placeholder="이름을 입력하세요"
                                className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-bold"
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1 ml-1">비밀번호</label>
                        <div className="relative">
                            <Lock size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                type="password"
                                value={loginPassword}
                                onChange={(e) => setLoginPassword(e.target.value)}
                                placeholder="비밀번호를 입력하세요"
                                className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-bold"
                                required
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loginLoading}
                        className="w-full py-3.5 bg-rose-500 hover:bg-rose-600 disabled:bg-rose-300 text-white font-bold rounded-xl shadow-md transition flex items-center justify-center gap-2 mt-2"
                    >
                        {loginLoading ? '로그인 중...' : '로그인 및 체크인'}
                        <ArrowRight size={18} />
                    </button>
                </form>
            </motion.div>
        </motion.div>
    );
};

export default GuestLoginModal;
