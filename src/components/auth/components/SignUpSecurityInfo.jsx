import React from 'react';
import { AlertCircle, CheckCircle } from 'lucide-react';

const SignUpSecurityInfo = ({ formData, setFormData, handleChange, agreements, setAgreements, setShowConsentModal, isKiosk }) => {
    return (
        <div className="w-full space-y-4">
            {/* Group 2: Password */}
            <div className={`border ${isKiosk ? 'border-slate-200 rounded-2xl bg-white' : 'border-gray-300 rounded-xl bg-white'} overflow-hidden focus-within:border-[#E63946] transition-colors`}>
                <div className="relative border-b border-gray-200">
                    <AlertCircle className={`absolute left-4 top-1/2 -translate-y-1/2 ${isKiosk ? 'text-slate-300' : 'text-[#8B95A1]'}`} size={isKiosk ? 22 : 20} />
                    <input
                        type="password" name="password" required minLength="6"
                        value={formData.password} onChange={handleChange}
                        placeholder="비밀번호 설정 (6자리 이상)"
                        className={`w-full pl-12 pr-4 py-3 bg-transparent outline-none font-bold text-sm text-[#191F28] placeholder-[#B0B8C1] placeholder:font-bold ${isKiosk ? 'sm:py-4' : ''}`}
                    />
                </div>
                <div className="relative">
                    <CheckCircle className={`absolute left-4 top-1/2 -translate-y-1/2 ${isKiosk ? 'text-slate-300' : 'text-[#8B95A1]'}`} size={isKiosk ? 22 : 20} />
                    <input
                        type="password" name="confirmPassword" required minLength="6"
                        value={formData.confirmPassword} onChange={handleChange}
                        placeholder="비밀번호 재입력"
                        className={`w-full pl-12 pr-4 py-3 bg-transparent outline-none font-bold text-sm text-[#191F28] placeholder-[#B0B8C1] placeholder:font-bold ${formData.confirmPassword && formData.password !== formData.confirmPassword ? 'bg-red-50 text-red-600' : ''} ${isKiosk ? 'sm:py-4' : ''}`}
                    />
                </div>
            </div>

            {/* Group 3: School Church Preference */}
            <div className={`border ${isKiosk ? 'border-[#E63946]/20 rounded-2xl bg-[#E63946]/5' : 'border-[#E63946]/20 rounded-xl bg-[#E63946]/5'} flex justify-between items-center p-4 transition-colors`}>
                <div className="flex flex-col">
                    <span className={`text-sm font-bold ${isKiosk ? 'text-slate-600' : 'text-gray-700'}`}>학교에서 스쿨처치를 하고 있나요?</span>
                    <span className="text-xs text-gray-500 mt-1">참여하고 계신다면 체크해 주세요.</span>
                </div>
                <div className="flex bg-white rounded-lg border border-[#E63946]/20 overflow-hidden shadow-sm">
                    <button
                        type="button" onClick={() => setFormData(prev => ({ ...prev, isSchoolChurch: true }))}
                        className={`px-4 py-2 text-sm font-bold transition-colors ${formData.isSchoolChurch ? 'bg-[#E63946] text-white' : 'text-gray-500 hover:bg-gray-50'}`}
                    >
                        네
                    </button>
                    <button
                        type="button" onClick={() => setFormData(prev => ({ ...prev, isSchoolChurch: false }))}
                        className={`px-4 py-2 text-sm font-bold transition-colors border-l border-[#E63946]/20 ${!formData.isSchoolChurch ? 'bg-[#E63946] text-white' : 'text-[#8B95A1] hover:bg-gray-50'}`}
                    >
                        아니요
                    </button>
                </div>
            </div>

            <div className={`space-y-3 ${isKiosk ? 'bg-slate-50 p-6 rounded-[2rem] border border-slate-100' : 'bg-gray-50 p-4 rounded-2xl border border-gray-100'}`}>
                <div className="flex items-start gap-2">
                    <input
                        type="checkbox" id="total-agree"
                        checked={agreements.art1 && agreements.art2 && agreements.art3 && agreements.art4}
                        onChange={() => {
                            if (agreements.art1 && agreements.art2 && agreements.art3 && agreements.art4) {
                                setAgreements({ art1: false, art2: false, art3: false, art4: false });
                            } else {
                                setShowConsentModal(true);
                            }
                        }}
                        className={`mt-1 w-4 h-4 text-[#E63946] rounded focus:ring-[#E63946] accent-[#E63946] ${isKiosk ? 'w-6 h-6 border-slate-200' : ''}`}
                    />
                    <label htmlFor="total-agree" className={`text-sm leading-snug cursor-pointer ${isKiosk ? 'text-slate-600 font-bold' : 'text-gray-600'}`}>
                        <span className="font-bold text-[#E63946]">[전체동의]</span> SCI CENTER 이용 약관 및 개인정보 수집에 동의합니다.
                    </label>
                </div>
                <button
                    type="button" onClick={() => setShowConsentModal(true)}
                    className={`text-xs text-[#E63946] font-bold ml-6 underline ${isKiosk ? 'sm:text-sm font-black underline-offset-4' : ''}`}
                >
                    개인정보 수집 및 이용 자세히 보기
                </button>
            </div>
        </div>
    );
};

export default SignUpSecurityInfo;
