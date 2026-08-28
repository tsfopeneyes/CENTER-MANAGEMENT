import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, Check, KeyRound, Loader2, RefreshCw, ShieldCheck, Smartphone } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { requestSupabaseFunction } from '../../utils/supabaseRest';
import { getQrSecondsRemaining } from '../../utils/kioskQr';

const getCredentialKey = (locationId) => `haifn_kiosk_device:${locationId}`;

const readCredentials = (locationId) => {
    try {
        const saved = localStorage.getItem(getCredentialKey(locationId));
        const parsed = saved ? JSON.parse(saved) : null;
        return parsed?.deviceId && parsed?.deviceSecret ? parsed : null;
    } catch {
        return null;
    }
};

const HaifnRotatingQr = ({ selectedLocation }) => {
    const [credentials, setCredentials] = useState(() => readCredentials(selectedLocation?.id));
    const [setupPin, setSetupPin] = useState('');
    const [qrState, setQrState] = useState(null);
    const [secondsLeft, setSecondsLeft] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const clearCredentials = useCallback(() => {
        if (selectedLocation?.id) localStorage.removeItem(getCredentialKey(selectedLocation.id));
        setCredentials(null);
        setQrState(null);
    }, [selectedLocation?.id]);

    useEffect(() => {
        setCredentials(readCredentials(selectedLocation?.id));
        setQrState(null);
        setError('');
    }, [selectedLocation?.id]);

    const issueQr = useCallback(async () => {
        if (!selectedLocation?.id || !credentials) return;
        setLoading(true);
        try {
            const issued = await requestSupabaseFunction('kiosk-qr', {
                action: 'issue-qr',
                locationId: selectedLocation.id,
                deviceId: credentials.deviceId,
                deviceSecret: credentials.deviceSecret,
            });
            setQrState(issued);
            setError('');
        } catch (requestError) {
            const message = requestError?.message || '';
            if (message.includes('KIOSK_DEVICE_')) clearCredentials();
            setError(message.includes('KIOSK_DEVICE_')
                ? '이 키오스크를 다시 활성화해 주세요.'
                : '새 QR을 불러오지 못했습니다. 네트워크를 확인해 주세요.');
        } finally {
            setLoading(false);
        }
    }, [clearCredentials, credentials, selectedLocation?.id]);

    useEffect(() => {
        if (!credentials) return undefined;
        issueQr();
        const refreshTimer = window.setInterval(issueQr, 60_000);
        return () => window.clearInterval(refreshTimer);
    }, [credentials, issueQr]);

    useEffect(() => {
        const updateCountdown = () => {
            setSecondsLeft(getQrSecondsRemaining(qrState?.expiresAt));
        };
        updateCountdown();
        const timer = window.setInterval(updateCountdown, 1000);
        return () => window.clearInterval(timer);
    }, [qrState?.expiresAt]);

    const qrUrl = useMemo(() => {
        if (!qrState?.token || !selectedLocation?.id || secondsLeft <= 0) return '';
        const url = new URL('/checkin', window.location.origin);
        url.searchParams.set('loc', selectedLocation.id);
        url.searchParams.set('qr', qrState.token);
        return url.toString();
    }, [qrState?.token, secondsLeft, selectedLocation?.id]);

    const handleActivate = async (event) => {
        event.preventDefault();
        if (setupPin.length !== 4 || !selectedLocation?.id) return;
        setLoading(true);
        setError('');
        try {
            const activated = await requestSupabaseFunction('kiosk-qr', {
                action: 'activate-device',
                locationId: selectedLocation.id,
                setupPin,
                displayName: `${selectedLocation.name} 키오스크`,
            }, 1);
            const nextCredentials = {
                deviceId: activated.deviceId,
                deviceSecret: activated.deviceSecret,
            };
            localStorage.setItem(getCredentialKey(selectedLocation.id), JSON.stringify(nextCredentials));
            setCredentials(nextCredentials);
            setSetupPin('');
        } catch (activationError) {
            const errorMessage = activationError?.message || '';
            setError(errorMessage.includes('KIOSK_SETUP_RATE_LIMITED')
                ? '입력 시도가 많습니다. 15분 후 다시 시도해 주세요.'
                : errorMessage.includes('KIOSK_SETUP_PIN_INVALID')
                    ? '관리 PIN이 올바르지 않습니다.'
                    : '키오스크 활성화에 실패했습니다. 설정을 확인해 주세요.');
        } finally {
            setLoading(false);
        }
    };

    if (!credentials) {
        return (
            <motion.form
                onSubmit={handleActivate}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-full max-w-xl bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 p-8 sm:p-12 text-center"
            >
                <div className="mx-auto w-20 h-20 rounded-3xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-6">
                    <KeyRound size={36} />
                </div>
                <h2 className="text-2xl font-black text-slate-800 mb-2">하이픈 키오스크 활성화</h2>
                <p className="text-sm text-slate-400 font-bold mb-8">최초 한 번만 관리자 PIN을 입력해 주세요.</p>
                <input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    value={setupPin}
                    onChange={(event) => setSetupPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
                    className="w-full h-20 rounded-2xl bg-slate-50 border-2 border-slate-100 text-center text-3xl tracking-[0.5em] font-black outline-none focus:border-indigo-400"
                    placeholder="••••"
                    autoFocus
                />
                {error && <p className="mt-4 text-sm font-bold text-rose-500">{error}</p>}
                <button
                    type="submit"
                    disabled={loading || setupPin.length !== 4}
                    className="mt-6 w-full h-16 rounded-2xl bg-slate-900 text-white font-black disabled:opacity-40 flex items-center justify-center gap-2"
                >
                    {loading ? <Loader2 className="animate-spin" size={20} /> : <Check size={20} />}
                    활성화하기
                </button>
            </motion.form>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-xl bg-white rounded-[2.5rem] sm:rounded-[3.5rem] shadow-2xl border border-slate-100 p-6 sm:p-10 flex flex-col items-center"
        >
            <div className="flex items-center gap-2 text-indigo-600 mb-3">
                <ShieldCheck size={20} />
                <span className="text-xs font-black tracking-[0.18em] uppercase">Secure Mobile Check-in</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-800 mb-2">QR을 스캔해 주세요</h2>
            <p className="text-sm text-slate-400 font-bold mb-6 text-center">체크인과 체크아웃 모두 같은 QR 화면을 사용합니다.</p>

            <div className="relative w-[min(72vw,340px)] aspect-square rounded-[2rem] bg-slate-50 border border-slate-100 p-5 flex items-center justify-center overflow-hidden">
                {qrUrl ? (
                    <QRCodeSVG value={qrUrl} size={300} level="H" includeMargin className="w-full h-full" />
                ) : (
                    <div className="flex flex-col items-center gap-3 text-slate-400 text-center">
                        {loading ? <Loader2 className="animate-spin" size={42} /> : <AlertCircle size={42} />}
                        <p className="font-black">{loading ? '안전한 QR을 만들고 있어요' : 'QR이 만료되었습니다'}</p>
                    </div>
                )}
            </div>

            <div className="mt-6 w-full flex items-center justify-between rounded-2xl bg-indigo-50 px-5 py-4 text-indigo-700">
                <div className="flex items-center gap-2 font-black text-sm">
                    <Smartphone size={18} />
                    카메라로 스캔
                </div>
                <div className="flex items-center gap-2 text-xs font-black tabular-nums">
                    <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                    {secondsLeft > 0 ? `${secondsLeft}초 후 변경` : '갱신 중'}
                </div>
            </div>

            {error && (
                <div className="mt-4 w-full rounded-2xl bg-rose-50 px-4 py-3 text-rose-600 text-xs font-bold text-center">
                    {error}
                    <button onClick={issueQr} className="ml-2 underline font-black">다시 시도</button>
                </div>
            )}
        </motion.div>
    );
};

export default HaifnRotatingQr;
