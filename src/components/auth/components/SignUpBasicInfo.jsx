import React from 'react';
import { User, Smartphone, School, Calendar } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const SignUpBasicInfo = ({ formData, setFormData, handleChange, handlePhoneChange, handleGuardianPhoneChange, isUnder14, isKiosk }) => {
    return (
        <div className="w-full">
            {/* Group 1: Profile & Contact Info */}
            <div className={`mt-2 border ${isKiosk ? 'border-slate-200 rounded-2xl bg-white' : 'border-gray-300 rounded-xl bg-white'} overflow-hidden focus-within:border-[#E63946] transition-colors`}>
                
                {/* Row 1: Name and Gender */}
                <div className="flex border-b border-gray-200">
                    <div className="relative flex-1 border-r border-gray-200">
                        <User className={`absolute left-4 top-1/2 -translate-y-1/2 ${isKiosk ? 'text-slate-300' : 'text-[#8B95A1]'}`} size={isKiosk ? 22 : 20} />
                        <input
                            type="text" name="name" required
                            value={formData.name} onChange={handleChange}
                            placeholder="이름"
                            className={`w-full pl-12 pr-4 py-3 bg-transparent outline-none font-bold text-sm text-[#191F28] placeholder-[#B0B8C1] placeholder:font-bold ${isKiosk ? 'sm:py-4' : ''}`}
                        />
                    </div>
                    <div className="flex w-1/3 sm:w-1/4">
                        {[
                            { label: isKiosk ? '남자' : '남', value: 'M' },
                            { label: isKiosk ? '여자' : '여', value: 'F' }
                        ].map((g, idx) => (
                            <button
                                key={g.value} type="button"
                                onClick={() => setFormData(prev => ({ ...prev, gender: g.value }))}
                                className={`flex-1 py-3 text-sm font-bold transition ${formData.gender === g.value ? 'bg-[#E63946] text-white' : 'bg-transparent text-gray-500 hover:bg-gray-50'} ${idx === 0 ? 'border-r border-gray-200' : ''} ${isKiosk ? 'sm:py-4 font-black' : ''}`}
                            >
                                {g.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Row 2: User Group */}
                <div className="flex border-b border-gray-200">
                    {['청소년', '졸업생'].map((g, idx) => (
                        <button
                            key={g} type="button"
                            onClick={() => setFormData(prev => ({ ...prev, user_group: g }))}
                            className={`flex-1 py-3 text-sm font-bold transition ${formData.user_group === g ? 'bg-[#E63946] text-white' : 'bg-transparent text-gray-500 hover:bg-gray-50'} ${idx === 0 ? 'border-r border-gray-200' : ''} ${isKiosk ? 'sm:py-4 font-black' : ''}`}
                        >
                            {g}
                        </button>
                    ))}
                </div>

                {/* School */}
                <div className="relative border-b border-gray-200">
                    <School className={`absolute left-4 top-1/2 -translate-y-1/2 ${isKiosk ? 'text-slate-300' : 'text-[#8B95A1]'}`} size={isKiosk ? 22 : 20} />
                    <input
                        type="text" name="school" required
                        value={formData.school} onChange={handleChange}
                        placeholder="학교 (00고등학교)"
                        className={`w-full pl-12 pr-4 py-3 bg-transparent outline-none font-bold text-sm text-[#191F28] placeholder-[#B0B8C1] placeholder:font-bold ${isKiosk ? 'sm:py-4' : ''}`}
                    />
                </div>

                {/* Church */}
                <div className="relative border-b border-gray-200">
                    <User className={`absolute left-4 top-1/2 -translate-y-1/2 ${isKiosk ? 'text-slate-300' : 'text-[#8B95A1]'}`} size={isKiosk ? 22 : 20} />
                    <input
                        type="text" name="church"
                        value={formData.church} onChange={handleChange}
                        placeholder="출석교회 (00교회)"
                        className={`w-full pl-12 pr-16 py-3 bg-transparent outline-none font-bold text-sm text-[#191F28] placeholder-[#B0B8C1] placeholder:font-bold ${isKiosk ? 'sm:py-4' : ''}`}
                    />
                    <button 
                        type="button" 
                        onClick={() => setFormData(prev => ({ ...prev, church: '없음' }))} 
                        className="absolute right-3 top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-gray-100 text-gray-500 rounded-lg text-[11px] font-bold hover:bg-gray-200 transition-colors"
                    >
                        없음
                    </button>
                </div>

                {/* Birth Date */}
                <div className="relative border-b border-gray-200">
                    <Calendar className={`absolute left-4 top-1/2 -translate-y-1/2 ${isKiosk ? 'text-slate-300' : 'text-[#8B95A1]'}`} size={isKiosk ? 22 : 20} />
                    <input
                        type="tel" pattern="[0-9]*" name="birth" required maxLength="6"
                        value={formData.birth}
                        onChange={(e) => setFormData(prev => ({ ...prev, birth: e.target.value.replace(/[^0-9]/g, '') }))}
                        inputMode="numeric" placeholder="생년월일 6자리 (YYMMDD)"
                        className={`w-full pl-12 pr-4 py-3 bg-transparent outline-none tracking-widest font-bold text-sm text-[#191F28] placeholder-[#B0B8C1] placeholder:font-bold placeholder:tracking-normal ${isKiosk ? 'sm:py-4' : ''}`}
                    />
                </div>

                {/* Phone Number */}
                <div className="relative">
                    <Smartphone className={`absolute left-4 top-1/2 -translate-y-1/2 ${isKiosk ? 'text-slate-300' : 'text-[#8B95A1]'}`} size={isKiosk ? 22 : 20} />
                    <input
                        type="tel" name="phone" required
                        value={formData.phone} onChange={handlePhoneChange}
                        inputMode="numeric" placeholder="휴대폰 번호 (010-0000-0000)"
                        className={`w-full pl-12 pr-4 py-3 bg-transparent outline-none tracking-widest font-bold text-sm text-[#191F28] placeholder-[#B0B8C1] placeholder:font-bold placeholder:tracking-normal ${isKiosk ? 'sm:py-4' : ''}`}
                    />
                </div>
            </div>

            {/* Guardian Information for Under 14 */}
            <AnimatePresence>
                {isUnder14(formData.birth) && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden transition-all"
                    >
                        <div className="flex items-center gap-2 mb-2 mt-2">
                            <div className="w-2 h-2 bg-[#E63946] rounded-full" />
                            <h4 className={`text-xs font-bold text-[#E63946] uppercase tracking-widest ${isKiosk ? 'text-sm' : ''}`}>보호자 정보 (만 14세 미만 필수)</h4>
                        </div>

                        <div className={`border ${isKiosk ? 'border-[#E63946]/30 rounded-2xl bg-[#E63946]/5' : 'border-[#E63946]/30 rounded-xl bg-[#E63946]/5'} overflow-hidden focus-within:border-[#E63946] transition-colors`}>
                            <div className="flex border-b border-[#E63946]/20">
                                <input
                                    type="text" name="guardianName" required
                                    value={formData.guardianName} onChange={handleChange}
                                    placeholder="보호자 이름"
                                    className={`w-1/2 px-4 py-3 bg-transparent border-r border-[#E63946]/20 outline-none font-bold text-sm text-[#191F28] placeholder-[#B0B8C1] placeholder:font-bold ${isKiosk ? 'sm:py-4' : ''}`}
                                />
                                <input
                                    type="text" name="guardianRelation" required
                                    value={formData.guardianRelation} onChange={handleChange}
                                    placeholder="보호자 관계 (부, 모 등)"
                                    className={`w-1/2 px-4 py-3 bg-transparent outline-none font-bold text-sm text-[#191F28] placeholder-[#B0B8C1] placeholder:font-bold ${isKiosk ? 'sm:py-4' : ''}`}
                                />
                            </div>
                            <div>
                                <input
                                    type="text" name="guardianPhone" required inputMode="tel"
                                    value={formData.guardianPhone} onChange={handleGuardianPhoneChange}
                                    placeholder="보호자 휴대폰 번호 (010-0000-0000)"
                                    className={`w-full px-4 py-3 bg-transparent outline-none tracking-widest font-bold text-sm text-[#191F28] placeholder-[#B0B8C1] placeholder:font-bold placeholder:tracking-normal ${isKiosk ? 'sm:py-4' : ''}`}
                                />
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default SignUpBasicInfo;
