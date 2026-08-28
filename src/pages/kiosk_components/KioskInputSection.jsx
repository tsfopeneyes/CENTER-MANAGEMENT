import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Delete, Scan, SwitchCamera, ChevronRight, CheckCircle } from 'lucide-react';
import { Scanner } from '@yudiel/react-qr-scanner';
import HaifnRotatingQr from './HaifnRotatingQr';

const KioskInputSection = ({
    status,
    setStatus,
    pincode,
    setPincode,
    handleNumberClick,
    handleQrScan,
    facingMode,
    setFacingMode,
    resetState,
    matchingUsers,
    processKioskAction,
    isHaifn,
    selectedLocation
}) => {
    if (isHaifn) {
        return <HaifnRotatingQr selectedLocation={selectedLocation} />;
    }

    return (
        <AnimatePresence mode="wait">
            {status === 'IDLE' && (
                <motion.div key="idle" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.05 }} className="w-full max-w-xl bg-white rounded-[2rem] sm:rounded-[3rem] shadow-2xl border border-gray-100 p-6 sm:p-10 flex flex-col items-center">
                    <h2 className="text-xl sm:text-2xl font-black text-slate-800 mb-2 sm:mb-6">휴대폰 뒤 4자리 입력</h2>
                    <div className="flex gap-2 sm:gap-4 mb-4 sm:mb-8">
                        {[0, 1, 2, 3].map(i => (
                            <div key={i} className={`w-[clamp(3rem,8vw,4.5rem)] h-[clamp(4rem,10vh,6.5rem)] rounded-2xl flex items-center justify-center text-[clamp(1.875rem,6vh,3rem)] font-black transition-all ${pincode[i] ? 'bg-blue-600 text-white shadow-xl scale-105' : 'bg-slate-50 text-slate-200 border-2 border-dashed border-slate-200'}`}>
                                {pincode[i] || ''}
                                {!pincode[i] && i === pincode.length && <motion.div animate={{ opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 1 }} className="w-1 h-8 sm:h-[4vh] bg-blue-300 rounded-full" />}
                            </div>
                        ))}
                    </div>
                    <div className="grid grid-cols-3 gap-2 sm:gap-4 w-full">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                            <button key={num} onClick={() => handleNumberClick(num.toString())} className="h-[clamp(3.5rem,10vh,6rem)] bg-slate-50 rounded-2xl text-[clamp(1.5rem,4vh,2.5rem)] font-black text-slate-700 hover:bg-slate-100 active:scale-95 transition-all shadow-sm border border-slate-100">{num}</button>
                        ))}
                        <button onClick={() => setStatus('SCANNING')} className="h-[clamp(3.5rem,10vh,6rem)] bg-indigo-50 text-indigo-500 rounded-2xl flex flex-col items-center justify-center gap-1 hover:bg-indigo-100 active:scale-95 transition-all border border-indigo-100">
                            <Scan size={20} className="w-[clamp(1.25rem,4vh,1.5rem)] h-[clamp(1.25rem,4vh,1.5rem)]" />
                            <span className="text-[clamp(8px,1vh,10px)] font-black tracking-widest uppercase">QR SCAN</span>
                        </button>
                        <button onClick={() => handleNumberClick('0')} className="h-[clamp(3.5rem,10vh,6rem)] bg-slate-50 rounded-2xl text-[clamp(1.5rem,4vh,2.5rem)] font-black text-slate-700 hover:bg-slate-100 active:scale-95 transition-all shadow-sm border border-slate-100">0</button>
                        <button onClick={() => setPincode(prev => prev.slice(0, -1))} className="h-[clamp(3.5rem,10vh,6rem)] bg-slate-50 text-slate-300 rounded-2xl flex items-center justify-center hover:bg-slate-100 active:scale-95 transition-all border border-slate-100"><Delete size={24} className="w-[clamp(1.5rem,4vh,2rem)] h-[clamp(1.5rem,4vh,2rem)]" /></button>
                    </div>
                </motion.div>
            )}

            {status === 'SCANNING' && (
                <motion.div key="scanning" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }} className="w-full max-w-lg bg-slate-900 rounded-[2.5rem] sm:rounded-[4rem] overflow-hidden shadow-2xl relative border-4 sm:border-8 border-white">
                    <div className="aspect-square relative">
                        <Scanner onScan={handleQrScan} onError={(err) => console.error(err)} constraints={{ facingMode }} styles={{ container: { width: '100%', height: '100%' } }} />
                        <div className="absolute inset-0 z-10 flex flex-col justify-between p-10">
                            <div className="flex justify-between items-start">
                                <div className="bg-white/10 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/20"><p className="text-white text-xs font-black tracking-widest uppercase">Continuous Scan</p></div>
                                <button onClick={() => setFacingMode(prev => prev === 'environment' ? 'user' : 'environment')} className="p-4 bg-white/10 backdrop-blur-md rounded-2xl text-white border border-white/20 hover:bg-white/20 transition"><SwitchCamera size={24} /></button>
                            </div>
                            <div className="text-center">
                                <div className="w-64 h-64 border-2 border-dashed border-white/40 rounded-[3rem] mx-auto relative overflow-hidden"></div>
                                <p className="text-white font-black mt-8 text-lg">QR 코드를 가이드박스에 비춰주세요</p>
                            </div>
                            <button onClick={resetState} className="w-full py-5 bg-white text-slate-900 rounded-[2rem] font-black shadow-xl active:scale-95 transition">키패드 입력으로 전환</button>
                        </div>
                    </div>
                </motion.div>
            )}

            {status === 'SELECTING' && (
                <motion.div key="selecting" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-xl bg-white rounded-[2rem] sm:rounded-[4rem] shadow-2xl p-6 sm:p-12 flex flex-col items-center">
                    <h2 className="text-xl sm:text-3xl font-black text-slate-800 mb-2">학교를 선택해 주세요</h2>
                    <p className="text-xs sm:text-base text-slate-400 font-bold mb-6 sm:mb-10">동일한 번호의 학생이 여러 명 있습니다.</p>
                    <div className="w-full space-y-3 sm:space-y-4 mb-6 sm:mb-10 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar">
                        {matchingUsers.map(u => (
                            <button key={u.id} onClick={() => processKioskAction(u)} className="w-full p-6 sm:p-8 bg-slate-50 rounded-2xl sm:rounded-3xl flex items-center justify-between hover:bg-blue-600 hover:text-white transition-all group active:scale-95 shadow-sm border border-slate-100">
                                <div>
                                    <p className="text-xl sm:text-2xl font-black flex items-center gap-2">
                                        {u.name}
                                        {u.is_leader && <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="#FACC15" stroke="#FACC15" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-star"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>}
                                    </p>
                                    <p className="text-xs sm:text-sm opacity-60 font-bold">{u.school} | {u.phone_back4}</p>
                                </div>
                                <ChevronRight size={24} className="sm:w-8 sm:h-8 opacity-20 group-hover:opacity-100 transition" />
                            </button>
                        ))}
                    </div>
                    <button onClick={resetState} className="p-4 text-slate-400 font-black tracking-widest uppercase text-[10px] sm:text-xs hover:text-slate-800 transition">처음으로 돌아가기</button>
                </motion.div>
            )}

            {status === 'LOADING' && (
                <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-6">
                    <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }} className="w-20 h-20 border-8 border-slate-200 border-t-blue-600 rounded-full" />
                    <p className="text-slate-400 font-black tracking-widest uppercase">Processing...</p>
                </motion.div>
            )}

            {status === 'REQUIRE_TERMS_AGREEMENT' && (
                <motion.div key="terms" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center gap-6">
                    <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center text-blue-600">
                        <CheckCircle size={40} />
                    </div>
                    <p className="text-slate-800 font-black text-2xl text-center">약관 동의가 필요합니다</p>
                    <p className="text-slate-400 font-bold text-center">서비스 이용을 위해 새로운 약관에 동의해 주세요.</p>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default KioskInputSection;
