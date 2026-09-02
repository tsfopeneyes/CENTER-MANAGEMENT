import React from 'react';
import { Delete, X } from 'lucide-react';
import { motion } from 'framer-motion';
import SignUpForm from '../../components/auth/SignUpForm';
import GuestEntryForm from '../../components/kiosk/GuestEntryForm';
import TermsConsentModal from '../../components/auth/TermsConsentModal';
import PurposeSelectionModal from './PurposeSelectionModal';
import CheckinSurveyModal from './CheckinSurveyModal';

const KioskModals = ({
    showMasterPin,
    setShowMasterPin,
    masterPinInput,
    setMasterPinInput,
    handleMasterPinSubmit,
    showOptionsMenu,
    setShowOptionsMenu,
    handleResetLocation,
    navigate,
    showSignupForm,
    setShowSignupForm,
    showGuestForm,
    setShowGuestForm,
    processKioskAction,
    status,
    handleKioskTermsAgree,
    pendingCheckoutUser,
    handleCheckoutPurpose,
    resetState,
    checkinSurveyConfig,
    checkoutSurveyConfig,
    surveySelections,
    handleSurveySubmit,
    pendingKioskUser,
    setStatus
}) => {
    return (
        <>
            {/* Master Pin Modal */}
            {showMasterPin && (
                <div className="fixed inset-0 bg-slate-900/80 z-[100] flex items-center justify-center p-4 backdrop-blur-md animate-fade-in">
                    <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-10 shadow-2xl">
                        <h3 className="text-2xl font-black text-slate-800 mb-2 tracking-tight text-center">관리자 확인</h3>
                        <p className="text-slate-400 mb-8 text-sm font-bold text-center">마스터 핀 번호를 입력해 주세요.</p>

                        <div className="flex justify-center gap-3 mb-8">
                            {[0, 1, 2, 3].map(i => (
                                <div key={i} className={`w-12 h-16 rounded-2xl flex items-center justify-center text-3xl font-black transition-all ${masterPinInput[i] ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-50 text-slate-200 border-2 border-dashed border-slate-100'}`}>
                                    {masterPinInput[i] ? '●' : ''}
                                </div>
                            ))}
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                                <button
                                    key={num}
                                    onClick={() => {
                                        if (masterPinInput.length < 4) {
                                            const next = masterPinInput + num;
                                            setMasterPinInput(next);
                                            if (next.length === 4) handleMasterPinSubmit(next);
                                        }
                                    }}
                                    className="h-16 bg-slate-50 rounded-2xl text-2xl font-black text-slate-700 hover:bg-slate-100 active:scale-95 transition-all"
                                >
                                    {num}
                                </button>
                            ))}
                            <button onClick={() => { setShowMasterPin(false); setMasterPinInput(''); }} className="h-16 bg-red-50 text-red-500 rounded-2xl font-black text-xs hover:bg-red-100 transition-all uppercase tracking-widest">Cancel</button>
                            <button
                                onClick={() => {
                                    if (masterPinInput.length < 4) {
                                        const next = masterPinInput + '0';
                                        setMasterPinInput(next);
                                        if (next.length === 4) handleMasterPinSubmit(next);
                                    }
                                }}
                                className="h-16 bg-slate-50 rounded-2xl text-2xl font-black text-slate-700 hover:bg-slate-100 active:scale-95 transition-all"
                            >
                                0
                            </button>
                            <button onClick={() => setMasterPinInput(prev => prev.slice(0, -1))} className="h-16 bg-slate-50 text-slate-300 rounded-2xl flex items-center justify-center hover:bg-slate-100 active:scale-95 transition-all"><Delete size={24} /></button>
                        </div>
                    </div>
                </div>
            )}

            {/* Options Menu Modal */}
            {showOptionsMenu && (
                <div className="fixed inset-0 bg-slate-900/80 z-[101] flex items-center justify-center p-4 backdrop-blur-md animate-fade-in">
                    <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-10 shadow-2xl flex flex-col gap-4">
                        <h3 className="text-2xl font-black text-slate-800 mb-6 tracking-tight text-center">키오스크 설정</h3>

                        <button
                            onClick={handleResetLocation}
                            className="w-full py-6 bg-slate-50 text-slate-700 rounded-3xl font-black text-lg hover:bg-blue-600 hover:text-white transition-all shadow-sm active:scale-95"
                        >
                            장소 다시 선택
                        </button>

                        <button
                            onClick={() => navigate('/')}
                            className="w-full py-6 bg-slate-50 text-red-500 rounded-3xl font-black text-lg hover:bg-red-500 hover:text-white transition-all shadow-sm active:scale-95"
                        >
                            키오스크 종료
                        </button>

                        <button
                            onClick={() => setShowOptionsMenu(false)}
                            className="mt-4 w-full py-4 text-slate-400 font-bold uppercase tracking-widest text-xs hover:text-slate-800 transition-all"
                        >
                            닫기
                        </button>
                    </div>
                </div>
            )}

            {/* Direct Signup Form Modal */}
            {showSignupForm && (
                <div className="fixed inset-0 bg-slate-900/40 z-[120] flex items-center justify-center p-4 sm:p-6 backdrop-blur-lg animate-fade-in overflow-y-auto">
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        className="bg-white/95 w-full max-w-2xl rounded-[3rem] p-8 sm:p-12 shadow-2xl relative my-auto border border-white/50 backdrop-blur-xl"
                    >
                        <button
                            onClick={() => setShowSignupForm(false)}
                            className="absolute top-8 right-8 p-3 bg-slate-100 rounded-2xl text-slate-400 hover:text-slate-600 transition-all active:scale-90"
                        >
                            <X size={24} />
                        </button>

                        <div className="mb-10">
                            <h3 className="text-3xl sm:text-4xl font-black text-slate-800 mb-2 tracking-tight">회원가입</h3>
                            <p className="text-slate-400 font-bold">센터 패스 이용을 위한 정보를 입력해 주세요.</p>
                        </div>

                        <SignUpForm
                            isKiosk={true}
                            onSuccess={() => setShowSignupForm(false)}
                            onCancel={() => setShowSignupForm(false)}
                        />
                    </motion.div>
                </div >
            )}

            {/* Guest Entry Form Modal */}
            {showGuestForm && (
                <div className="fixed inset-0 bg-slate-900/40 z-[120] flex items-center justify-center p-4 sm:p-6 backdrop-blur-lg animate-fade-in overflow-y-auto">
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        className="bg-white/95 w-full max-w-2xl rounded-[3rem] p-8 sm:p-12 shadow-2xl relative my-auto border border-white/50 backdrop-blur-xl"
                    >
                        <button
                            onClick={() => setShowGuestForm(false)}
                            className="absolute top-8 right-8 p-3 bg-slate-100 rounded-2xl text-slate-400 hover:text-slate-600 transition-all active:scale-90"
                        >
                            <X size={24} />
                        </button>

                        <div className="mb-10">
                            <h3 className="text-3xl sm:text-4xl font-black text-slate-800 mb-2 tracking-tight">게스트 입장</h3>
                            <p className="text-slate-400 font-bold">센터 패스를 한 번만 이용할 거라면 간편하게 입장하세요!</p>
                        </div>

                        <GuestEntryForm
                            onSuccess={(newUser) => {
                                setShowGuestForm(false);
                                processKioskAction(newUser);
                            }}
                            onCancel={() => setShowGuestForm(false)}
                        />
                    </motion.div>
                </div>
            )}

            {/* Consent Modals */}
            <TermsConsentModal
                isOpen={status === 'REQUIRE_TERMS_AGREEMENT'}
                onClose={resetState}
                onAgree={handleKioskTermsAgree}
                isKiosk={true}
            />

            <PurposeSelectionModal
                isOpen={status === 'REQUIRE_PURPOSE'}
                user={pendingCheckoutUser}
                onComplete={handleCheckoutPurpose}
                surveyConfig={checkoutSurveyConfig}
            />

            <CheckinSurveyModal
                isOpen={status === 'SHOW_SURVEY' || status === 'SHOW_RECOMMENDATIONS'}
                status={status}
                surveyConfig={checkinSurveyConfig}
                selections={surveySelections}
                onComplete={handleSurveySubmit}
                onClose={resetState}
                onBack={() => setStatus('SHOW_SURVEY')}
                user={pendingKioskUser}
            />
        </>
    );
};

export default KioskModals;
