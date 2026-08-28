import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { UserPlus, Smartphone, LogIn, ArrowRight } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '../../supabaseClient';

const KioskWelcomeSection = ({ setShowSignupForm, setShowGuestForm, selectedLocation }) => {
    const [branchName, setBranchName] = useState('센터');
    const [engName, setEngName] = useState('SCI CENTER');

    useEffect(() => {
        const fetchBranchName = async () => {
            if (selectedLocation?.group_id) {
                try {
                    const { data: grp } = await supabase
                        .from('location_groups')
                        .select('name')
                        .eq('id', selectedLocation.group_id)
                        .maybeSingle();
                    if (grp?.name) {
                        const name = grp.name;
                        if (name.includes('하이픈') || name.includes('HAIFN') || name.includes('강동')) {
                            setBranchName('하이픈');
                            setEngName('HAIFN');
                        } else if (name.includes('이높플레이스') || name.includes('ENOUGH_PLACE') || name.includes('이높') || name.includes('강서')) {
                            setBranchName('이높플레이스');
                            setEngName('ENOUGH PLACE');
                        } else {
                            setBranchName(name);
                            setEngName(name.toUpperCase());
                        }
                    }
                } catch (err) {
                    console.error("Failed to fetch branch name:", err);
                }
            }
        };
        fetchBranchName();
    }, [selectedLocation]);

    return (
        <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col gap-8 w-full lg:order-first pb-20 lg:pb-0"
        >
            {/* Main Welcome Card */}
            <div className="relative overflow-hidden bg-white/60 backdrop-blur-2xl border border-white/80 p-8 sm:p-12 rounded-[2.5rem] sm:rounded-[3.5rem] shadow-[0_30px_70px_-20px_rgba(15,23,42,0.08)] group">
                {/* Subtle Artistic Glows */}
                <div className="absolute -top-12 -right-12 w-48 h-48 bg-blue-400/10 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute -bottom-16 -left-16 w-52 h-52 bg-indigo-400/10 rounded-full blur-3xl pointer-events-none" />
                
                {/* Top Typography Accent Line */}
                <div className="flex items-center gap-3 mb-6">
                    <span className="h-[1px] w-8 bg-blue-600/30"></span>
                    <span className="text-[10px] sm:text-xs font-black uppercase tracking-[0.3em] text-blue-600/80">
                        WELCOME TO {engName}
                    </span>
                </div>

                {/* Main Heading with rich typography */}
                <h2 className="text-3xl sm:text-4.5xl font-black text-slate-800 tracking-tight leading-[1.25] mb-5">
                    {branchName}에 오신 여러분을 <br />
                    <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent font-extrabold">
                        진심으로 환영합니다
                    </span>
                </h2>
                
                {/* Subtitle */}
                <p className="text-slate-500 font-bold text-sm sm:text-[15px] mb-10 leading-relaxed tracking-wide opacity-90 max-w-md">
                    {branchName === '하이픈' ? '휴대폰 카메라로 QR을 스캔해서' : '전화번호 뒤 4자리를 입력해서'} <br className="hidden sm:block" />
                    공간에 체크인·체크아웃해 주세요!
                </p>

                {/* Interactive Action Buttons */}
                {branchName !== '하이픈' && <div className="flex flex-col sm:flex-row gap-4">
                    <button
                        onClick={() => setShowSignupForm(true)}
                        className="flex-grow py-5 bg-gradient-to-b from-slate-900 to-slate-950 text-white rounded-2xl font-black text-sm sm:text-base flex items-center justify-center gap-2.5 hover:from-slate-850 hover:to-slate-900 active:scale-98 transition-all shadow-xl shadow-slate-950/10 border border-slate-800/80 group/btn"
                    >
                        <UserPlus size={18} className="text-slate-400 group-hover/btn:text-blue-400 transition-colors" />
                        <span>회원가입</span>
                        <ArrowRight size={14} className="opacity-0 -ml-1 group-hover/btn:opacity-100 group-hover/btn:translate-x-1 transition-all" />
                    </button>
                    
                    <button
                        onClick={() => setShowGuestForm(true)}
                        className="flex-grow py-5 bg-white text-indigo-600 border border-indigo-100 rounded-2xl font-black text-sm sm:text-base flex items-center justify-center gap-2.5 hover:bg-slate-50 active:scale-98 transition-all shadow-sm group/btn2"
                    >
                        <LogIn size={18} className="text-indigo-400 group-hover/btn2:text-indigo-600 transition-colors" />
                        <span>게스트 입장</span>
                        <ArrowRight size={14} className="opacity-0 -ml-1 group-hover/btn2:opacity-100 group-hover/btn2:translate-x-1 transition-all" />
                    </button>
                </div>}
            </div>

            {/* App Install Info Bar (Sophisticated styling) */}
            {branchName !== '하이픈' && <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-8 bg-white/40 backdrop-blur-xl p-6 rounded-[2rem] border border-white/70 shadow-sm">
                <div className="p-2.5 bg-white rounded-xl border border-slate-100 shrink-0 shadow-sm">
                    <QRCodeSVG value="https://app.schoolchurchimpact.org" size={80} level="H" />
                </div>
                <div className="text-center sm:text-left">
                    <h3 className="text-sm sm:text-base font-black text-slate-800 mb-0.5 flex items-center justify-center sm:justify-start gap-2">
                        <Smartphone className="text-blue-500" size={15} />
                        모바일 앱 설치
                    </h3>
                    <p className="text-xs text-slate-400 font-bold leading-normal mb-2 opacity-85">
                        QR을 스캔하여 앱을 설치하시면 <br className="hidden sm:block" />
                        훨씬 더 신속하고 편리하게 체크인할 수 있습니다.
                    </p>
                    <div className="inline-flex items-center gap-1.5 text-[8px] font-black text-blue-500 uppercase tracking-widest bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-100/50">
                        Quick Access
                    </div>
                </div>
            </div>}
        </motion.div>
    );
};

export default KioskWelcomeSection;
