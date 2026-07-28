import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, User, School, ArrowRight, LogIn, ShieldCheck, Heart, CheckCircle2, LogOut } from 'lucide-react';
import { useGuestMobileWelcome } from '../hooks/useGuestMobileWelcome';
import GuestLoginModal from '../components/student/modals/GuestLoginModal';
import GuestDuplicateUsersModal from '../components/student/modals/GuestDuplicateUsersModal';

const VISIT_REASON_OPTIONS = [
    { id: '1', emoji: '👥', label: '친구 / 지인 추천' },
    { id: '2', emoji: '🏫', label: '학교 / 선생님 추천' },
    { id: '3', emoji: '📱', label: 'SNS / 포스터 / 홍보물' },
    { id: '4', emoji: '🚶', label: '지나가다가 궁금해서' }
];

const GuestMobileWelcome = () => {
    const {
        step, setStep,
        name, setName,
        school, setSchool,
        visitReason, setVisitReason,
        activeSession,
        loading, isRedirecting,
        showLoginModal, setShowLoginModal,
        loginName, setLoginName,
        loginPassword, setLoginPassword,
        loginLoading,
        showDuplicatesModal, setShowDuplicatesModal,
        loginDuplicates, hashedPassword,
        handleLoginSubmit, attemptLoginAuth,
        isQRCheckin
    } = useGuestMobileWelcome();

    if (isRedirecting) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-indigo-950 to-slate-900 flex flex-col items-center justify-center p-6 text-white text-center">
                <div className="w-12 h-12 border-4 border-indigo-400 border-t-transparent rounded-full animate-spin mb-4" />
                <p className="font-bold text-lg">내 계정으로 자동 입장 중...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden font-sans select-none">
            {/* Ambient Background Decorative Gradients */}
            <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-600/20 rounded-full blur-[128px] pointer-events-none" />
            <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-rose-600/15 rounded-full blur-[128px] pointer-events-none" />

            <div className="w-full max-w-md z-10 space-y-6 my-auto py-6">
                {/* Header Section */}
                <div className="text-center space-y-2">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/15 text-indigo-300 text-xs font-bold tracking-wide">
                        <Sparkles size={14} className="text-amber-400 animate-pulse" />
                        <span>SCHOOL CHURCH IMPACT</span>
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                        {isQRCheckin ? '모바일 QR 체크인' : 'SCI 쉼터 환영합니다'}
                    </h1>
                    <p className="text-xs text-slate-400 font-medium">
                        센터 체크인을 위해 로그인하거나 정보를 입력해 주세요
                    </p>
                </div>

                <AnimatePresence mode="wait">
                    {/* ACTIVE CHECKIN STEP */}
                    {step === 'ACTIVE_CHECKIN' && activeSession && (
                        <motion.div
                            key="active"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-white/10 backdrop-blur-xl border border-white/15 rounded-3xl p-6 shadow-2xl text-center space-y-6"
                        >
                            <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto border border-emerald-500/30">
                                <CheckCircle2 size={32} />
                            </div>

                            <div className="space-y-1">
                                <span className="text-xs font-bold text-emerald-400 tracking-wider uppercase">체크인 진행 중</span>
                                <h2 className="text-2xl font-black text-white">{activeSession.displayName || activeSession.name}님</h2>
                                <p className="text-xs text-slate-300">
                                    {activeSession.school ? `${activeSession.school} · ` : ''}
                                    {activeSession.locationName}에 이용 중입니다
                                </p>
                            </div>

                            <button
                                onClick={() => setStep('FORM')}
                                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl transition shadow-lg"
                            >
                                메인으로 돌아가기
                            </button>
                        </motion.div>
                    )}

                    {/* FORM STEP */}
                    {step === 'FORM' && (
                        <motion.div
                            key="form"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="bg-white/10 backdrop-blur-xl border border-white/15 rounded-3xl p-6 shadow-2xl space-y-5"
                        >
                            {/* Member Login Quick Banner */}
                            <div className="bg-indigo-600/30 border border-indigo-500/40 rounded-2xl p-4 flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-bold text-indigo-200">기존 회원이신가요?</p>
                                    <p className="text-[11px] text-slate-300 mt-0.5">로그인하면 대시보드로 자동 이동됩니다</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowLoginModal(true)}
                                    className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-md transition shrink-0 flex items-center gap-1"
                                >
                                    <LogIn size={14} />
                                    로그인
                                </button>
                            </div>

                            <div className="flex items-center gap-3 my-2">
                                <div className="flex-1 h-px bg-white/10" />
                                <span className="text-[11px] font-bold text-slate-400">또는 게스트 간편 체크인</span>
                                <div className="flex-1 h-px bg-white/10" />
                            </div>

                            {/* Guest Form Input */}
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-300 mb-1.5 ml-1">이름</label>
                                    <div className="relative">
                                        <User size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <input
                                            type="text"
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            placeholder="이름을 입력해 주세요"
                                            className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/15 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-bold text-white placeholder-slate-500"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-300 mb-1.5 ml-1">학교 (선택)</label>
                                    <div className="relative">
                                        <School size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <input
                                            type="text"
                                            value={school}
                                            onChange={(e) => setSchool(e.target.value)}
                                            placeholder="학교 이름을 입력해 주세요 (예: 00고)"
                                            className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/15 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-bold text-white placeholder-slate-500"
                                        />
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => setShowLoginModal(true)}
                                    className="w-full py-4 bg-gradient-to-r from-indigo-500 to-rose-500 hover:from-indigo-600 hover:to-rose-600 text-white font-bold rounded-2xl shadow-lg transition flex items-center justify-center gap-2 text-base mt-2"
                                >
                                    로그인하고 바로 체크인
                                    <ArrowRight size={18} />
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Submodals */}
            <GuestLoginModal
                showLoginModal={showLoginModal}
                setShowLoginModal={setShowLoginModal}
                handleLoginSubmit={handleLoginSubmit}
                loginName={loginName}
                setLoginName={setLoginName}
                loginPassword={loginPassword}
                setLoginPassword={setLoginPassword}
                loginLoading={loginLoading}
            />

            <GuestDuplicateUsersModal
                showDuplicatesModal={showDuplicatesModal}
                setShowDuplicatesModal={setShowDuplicatesModal}
                loginDuplicates={loginDuplicates}
                handleDuplicateSelect={(user) => attemptLoginAuth(user, hashedPassword, loginPassword)}
                loginPassword={loginPassword}
                attemptLoginAuth={attemptLoginAuth}
                hashedPassword={hashedPassword}
            />
        </div>
    );
};

export default GuestMobileWelcome;
