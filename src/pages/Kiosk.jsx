import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { supabase } from '../supabaseClient';

import { useKioskManager } from '../hooks/useKioskManager';
import KioskLocationSelector from './kiosk_components/KioskLocationSelector';
import KioskHeader from './kiosk_components/KioskHeader';
import KioskInputSection from './kiosk_components/KioskInputSection';
import KioskWelcomeSection from './kiosk_components/KioskWelcomeSection';
import KioskFeedbackOverlay from './kiosk_components/KioskFeedbackOverlay';
import KioskModals from './kiosk_components/KioskModals';

const Kiosk = () => {
    const navigate = useNavigate();

    const {
        locations, selectedLocation, matchingUsers, currentTime, pincode, status, result,
        showMasterPin, showOptionsMenu, masterPinInput, showSignupForm, showGuestForm, facingMode,
        pendingKioskUser, pendingCheckoutUser, checkoutVisitDate,
        setSelectedLocation, setPincode, setStatus, setResult,
        setShowMasterPin, setShowOptionsMenu, setMasterPinInput, setShowSignupForm, setShowGuestForm, setFacingMode, setAfterPinAction,
        handleSetLocation, resetLocation, handleMasterPinSubmit, handleResetLocation,
        processKioskAction, handleIdentifyUser, handleVerifyNumeric, handleNumberClick, handleQrScan, resetState,
        handleKioskTermsAgree, handleCheckoutPurpose, handleSurveySubmit,
        checkinSurveyConfig, checkoutSurveyConfig, surveySelections
    } = useKioskManager(navigate);

    const [engName, setEngName] = useState('SCI CENTER');
    const [isHaifn, setIsHaifn] = useState(() => {
        const locationName = String(selectedLocation?.name || '');
        return locationName.includes('하이픈') || locationName.includes('HAIFN') || locationName.includes('강동');
    });

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
                            setEngName('HAIFN');
                            setIsHaifn(true);
                        } else if (name.includes('이높플레이스') || name.includes('ENOUGH_PLACE') || name.includes('이높') || name.includes('강서')) {
                            setEngName('ENOUGH PLACE');
                            setIsHaifn(false);
                        } else {
                            setEngName(name.toUpperCase());
                            setIsHaifn(false);
                        }
                    }
                } catch (err) {
                    console.error("Failed to fetch branch name:", err);
                }
            }
        };
        fetchBranchName();
    }, [selectedLocation]);

    if (!selectedLocation) {
        return (
            <KioskLocationSelector
                locations={locations}
                handleSetLocation={handleSetLocation}
                setAfterPinAction={setAfterPinAction}
                setShowMasterPin={setShowMasterPin}
                showMasterPin={showMasterPin}
                masterPinInput={masterPinInput}
                setMasterPinInput={setMasterPinInput}
                handleMasterPinSubmit={handleMasterPinSubmit}
                showOptionsMenu={showOptionsMenu}
                setShowOptionsMenu={setShowOptionsMenu}
                handleResetLocation={handleResetLocation}
                navigate={navigate}
                showGuestForm={showGuestForm}
                setShowGuestForm={setShowGuestForm}
                processKioskAction={processKioskAction}
                status={status}
                pendingKioskUser={pendingKioskUser}
                handleKioskTermsAgree={handleKioskTermsAgree}
                resetState={resetState}
            />
        );
    }

    return (
        <div className="fixed inset-0 bg-slate-50 flex flex-col font-sans overflow-hidden select-none h-[100dvh] bg-[radial-gradient(rgba(148,163,184,0.08)_1.5px,transparent_0)] bg-[size:32px_32px]">
            {/* Visual background layers */}
            <div className="absolute inset-0 overflow-hidden -z-10 pointer-events-none">
                <motion.div animate={{ scale: [1, 1.2, 1], x: [0, 50, 0], y: [0, 30, 0] }} transition={{ duration: 20, repeat: Infinity, ease: "linear" }} className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-blue-100/40 rounded-full blur-[40px] md:blur-[100px] gpu-accelerated" />
                <motion.div animate={{ scale: [1, 1.1, 1], x: [0, -30, 0], y: [0, 50, 0] }} transition={{ duration: 25, repeat: Infinity, ease: "linear" }} className="absolute -bottom-[10%] -right-[10%] w-[50%] h-[50%] bg-indigo-100/30 rounded-full blur-[40px] md:blur-[100px] gpu-accelerated" />
                <motion.div animate={{ scale: [1.2, 1.3, 1.2], x: [30, 0, 30] }} transition={{ duration: 15, repeat: Infinity, ease: "linear" }} className="absolute top-[40%] left-[20%] w-[20%] h-[20%] bg-blue-200/15 rounded-full blur-[30px] md:blur-[80px] gpu-accelerated" />
                <motion.div animate={{ scale: [1.2, 1, 1.2], rotate: 360 }} transition={{ duration: 30, repeat: Infinity, ease: "linear" }} className="absolute top-[20%] right-[10%] w-[30%] h-[30%] bg-pink-100/20 rounded-full blur-[40px] md:blur-[120px] gpu-accelerated" />
            </div>

            {/* Repeated Background Branding Typography Pattern */}
            <div className="absolute inset-0 overflow-hidden opacity-[0.04] z-0 select-none pointer-events-none flex flex-col justify-around rotate-[-12deg] scale-125 origin-center">
                {Array.from({ length: 7 }).map((_, rIdx) => (
                    <div 
                        key={rIdx} 
                        className={`text-[5vw] font-black uppercase tracking-[0.25em] whitespace-nowrap leading-none flex gap-12 ${rIdx % 2 === 0 ? 'justify-start' : 'justify-end'}`}
                        style={{ WebkitTextStroke: '2px #6366f1' }}
                    >
                        {Array.from({ length: 6 }).map((_, cIdx) => (
                            <span key={cIdx}>{engName}</span>
                        ))}
                    </div>
                ))}
            </div>

            <KioskHeader
                selectedLocation={selectedLocation}
                currentTime={currentTime}
                resetLocation={resetLocation}
            />

            <main className="flex-1 relative flex flex-col items-center lg:justify-center p-4 sm:p-6 lg:p-12 z-10 w-full max-w-[1600px] mx-auto overflow-y-auto overflow-x-hidden">
                <div className="flex flex-col lg:grid lg:grid-cols-2 gap-10 lg:gap-16 w-full items-center">
                    <div className="w-full flex justify-center order-first lg:order-last">
                        <KioskInputSection
                            status={status}
                            setStatus={setStatus}
                            pincode={pincode}
                            setPincode={setPincode}
                            handleNumberClick={handleNumberClick}
                            handleQrScan={handleQrScan}
                            facingMode={facingMode}
                            setFacingMode={setFacingMode}
                            resetState={resetState}
                            matchingUsers={matchingUsers}
                            processKioskAction={processKioskAction}
                            isHaifn={isHaifn}
                            selectedLocation={selectedLocation}
                        />
                    </div>

                    <KioskWelcomeSection
                        setShowSignupForm={setShowSignupForm}
                        setShowGuestForm={setShowGuestForm}
                        selectedLocation={selectedLocation}
                    />
                </div>

                <KioskFeedbackOverlay result={result} />
            </main>

            <KioskModals
                showMasterPin={showMasterPin}
                setShowMasterPin={setShowMasterPin}
                masterPinInput={masterPinInput}
                setMasterPinInput={setMasterPinInput}
                handleMasterPinSubmit={handleMasterPinSubmit}
                showOptionsMenu={showOptionsMenu}
                setShowOptionsMenu={setShowOptionsMenu}
                handleResetLocation={handleResetLocation}
                navigate={navigate}
                showSignupForm={showSignupForm}
                setShowSignupForm={setShowSignupForm}
                showGuestForm={showGuestForm}
                setShowGuestForm={setShowGuestForm}
                processKioskAction={processKioskAction}
                status={status}
                matchingUsers={matchingUsers}
                pendingKioskUser={pendingKioskUser}
                handleKioskTermsAgree={handleKioskTermsAgree}
                pendingCheckoutUser={pendingCheckoutUser}
                handleCheckoutPurpose={handleCheckoutPurpose}
                resetState={resetState}
                checkinSurveyConfig={checkinSurveyConfig}
                checkoutSurveyConfig={checkoutSurveyConfig}
                surveySelections={surveySelections}
                handleSurveySubmit={handleSurveySubmit}
                setStatus={setStatus}
            />

            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
            `}</style>
        </div>
    );
};

export default Kiosk;
