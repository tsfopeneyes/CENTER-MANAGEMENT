import React, { useEffect } from 'react';
import TermsConsentModal from './TermsConsentModal';
import SignUpBasicInfo from './components/SignUpBasicInfo';
import SignUpSecurityInfo from './components/SignUpSecurityInfo';
import { useSignUp } from './hooks/useSignUp';

const SignUpForm = ({ onSuccess, onCancel, isKiosk = false, prefilledData = null, guestUserId = null }) => {
    const {
        formData, setFormData,
        agreements, setAgreements,
        loading, showConsentModal, setShowConsentModal,
        isUnder14, handleChange, handlePhoneChange, handleGuardianPhoneChange, handleSignUp
    } = useSignUp(onSuccess, guestUserId);

    React.useEffect(() => {
        if (prefilledData) {
            setFormData(prev => ({
                ...prev,
                ...prefilledData
            }));
        }
    }, [prefilledData, setFormData]);

    return (
        <div className="w-full">
            <form onSubmit={handleSignUp} className="space-y-4">
                
                <SignUpBasicInfo
                    formData={formData}
                    setFormData={setFormData}
                    handleChange={handleChange}
                    handlePhoneChange={handlePhoneChange}
                    handleGuardianPhoneChange={handleGuardianPhoneChange}
                    isUnder14={isUnder14}
                    isKiosk={isKiosk}
                />

                <SignUpSecurityInfo
                    formData={formData}
                    setFormData={setFormData}
                    handleChange={handleChange}
                    agreements={agreements}
                    setAgreements={setAgreements}
                    setShowConsentModal={setShowConsentModal}
                    isKiosk={isKiosk}
                />

                <button
                    type="submit"
                    disabled={
                        loading ||
                        !(agreements.art1 && agreements.art2 && agreements.art3 && agreements.art4) ||
                        formData.birth.length < 6 ||
                        formData.phone.replace(/[^0-9]/g, '').length < 11
                    }
                    className={`w-full h-14 bg-[#E63946] hover:bg-[#D62839] text-white font-bold rounded-2xl transition shadow-md shadow-[#E63946]/25 active:scale-[0.98] disabled:opacity-50 mt-4 text-[16px] tracking-tight flex items-center justify-center ${isKiosk ? 'sm:h-16 sm:rounded-[2rem] sm:text-xl' : ''}`}
                >
                    {loading ? '가입 처리 중...' : '회원가입 완료'}
                </button>
            </form>

            <TermsConsentModal
                isOpen={showConsentModal}
                onClose={() => setShowConsentModal(false)}
                onAgree={(agreedStates) => {
                    setAgreements(agreedStates);
                    setShowConsentModal(false);
                }}
                isKiosk={isKiosk}
            />
        </div>
    );
};

export default SignUpForm;
