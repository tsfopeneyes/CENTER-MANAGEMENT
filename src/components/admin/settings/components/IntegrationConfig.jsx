import React from 'react';
import { Share2, Database, ShieldAlert } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

const STUDENT_APP_URL = 'https://app.schoolchurchimpact.org';

const IntegrationConfig = ({
    gsWebhookUrl,
    setGsWebhookUrl,
    lineChannelAccessToken,
    setLineChannelAccessToken,
    lineGroupId,
    setLineGroupId,
    lineVisitNotificationsEnabled,
    setLineVisitNotificationsEnabled,
    lineCoffeeChatNotificationsEnabled,
    setLineCoffeeChatNotificationsEnabled,
    lineProgramNotificationsEnabled,
    setLineProgramNotificationsEnabled,
    slackVisitNotificationsEnabled,
    setSlackVisitNotificationsEnabled,
    slackCoffeeChatNotificationsEnabled,
    setSlackCoffeeChatNotificationsEnabled,
    slackProgramNotificationsEnabled,
    setSlackProgramNotificationsEnabled,
    slackRentalNotificationsEnabled,
    setSlackRentalNotificationsEnabled,
    discordWebhookUrl,
    setDiscordWebhookUrl,
    kioskMasterPin,
    setKioskMasterPin,
    isBackingUp,
    syncProgress,
    handleSaveIntegrations,
    handleGoogleSheetsBackup
}) => {
    const downloadStudentAppQr = () => {
        const svg = document.getElementById('student-app-qr');
        if (!svg) return;

        const source = new XMLSerializer().serializeToString(svg);
        const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = 'student-webapp-qr.svg';
        link.click();
        URL.revokeObjectURL(objectUrl);
    };

    const downloadStudentAppQrPng = () => {
        const svg = document.getElementById('student-app-qr');
        if (!svg) return;

        const source = new XMLSerializer().serializeToString(svg);
        const svgBlob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
        const objectUrl = URL.createObjectURL(svgBlob);
        const image = new Image();
        image.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 1200;
            canvas.height = 1200;
            const context = canvas.getContext('2d');
            if (!context) {
                URL.revokeObjectURL(objectUrl);
                return;
            }
            context.fillStyle = '#ffffff';
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.imageSmoothingEnabled = false;
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(objectUrl);

            canvas.toBlob((pngBlob) => {
                if (!pngBlob) return;
                const pngUrl = URL.createObjectURL(pngBlob);
                const link = document.createElement('a');
                link.href = pngUrl;
                link.download = 'student-webapp-qr.png';
                link.click();
                URL.revokeObjectURL(pngUrl);
            }, 'image/png');
        };
        image.src = objectUrl;
    };
    const Toggle = ({ enabled, onChange, label }) => (
        <button
            type="button"
            role="switch"
            aria-label={label}
            aria-checked={enabled}
            onClick={() => onChange(!enabled)}
            className={`relative h-8 w-14 min-w-14 max-w-14 shrink-0 overflow-hidden rounded-full transition-colors ${enabled ? 'bg-[#3182F6]' : 'bg-[#D1D6DB]'}`}
        >
            <span
                className="absolute top-1 h-6 w-6 rounded-full bg-white shadow-sm transition-[left] duration-200"
                style={{ left: enabled ? '28px' : '4px' }}
            />
        </button>
    );

    const notificationRows = [
        {
            label: '입·출입',
            description: '체크인과 체크아웃 알림',
            line: [lineVisitNotificationsEnabled, setLineVisitNotificationsEnabled],
            slack: [slackVisitNotificationsEnabled, setSlackVisitNotificationsEnabled]
        },
        {
            label: '커피챗',
            description: '학생의 커피챗 신청 알림',
            line: [lineCoffeeChatNotificationsEnabled, setLineCoffeeChatNotificationsEnabled],
            slack: [slackCoffeeChatNotificationsEnabled, setSlackCoffeeChatNotificationsEnabled]
        },
        {
            label: '프로그램 신청',
            description: '회원·비회원의 프로그램 신청 알림',
            line: [lineProgramNotificationsEnabled, setLineProgramNotificationsEnabled],
            slack: [slackProgramNotificationsEnabled, setSlackProgramNotificationsEnabled]
        },
        {
            label: '대관 신청',
            description: '학생의 공간 대관 신청 알림',
            line: null,
            slack: [slackRentalNotificationsEnabled, setSlackRentalNotificationsEnabled]
        }
    ];

    return (
        <div className="space-y-6">
            {/* Header with Save Button */}
            <div className="bg-white rounded-[24px] border border-[#f2f4f6] p-6 shadow-sm flex justify-between items-center">
                <div className="flex items-center gap-2">
                    <Share2 size={22} className="text-[#3182f6]" />
                    <div className="min-w-0">
                        <h3 className="text-lg font-bold text-[#191f28] tracking-tight">외부 서비스 연동</h3>
                        <p className="text-xs text-gray-400 mt-0.5">외부 API 및 보안 마스터 핀을 연동하고 설정합니다.</p>
                    </div>
                </div>
                <button onClick={handleSaveIntegrations} className="px-6 py-2.5 bg-[#3182f6] hover:bg-[#1b64da] text-white rounded-xl font-bold text-sm transition shadow-sm active:scale-95">설정 저장</button>
            </div>

            {/* Google Sheets */}
            <div className="bg-white rounded-[24px] border border-[#f2f4f6] p-6 shadow-sm space-y-4">
                <div className="flex items-center gap-2 text-green-600 font-bold">
                    <Database size={20} />
                    <span className="text-base">Google Sheets 백업</span>
                </div>
                <p className="text-xs text-gray-400 leading-relaxed -mt-2">구글 앱스 스크립트 웹앱과 통신하여 공간 로그 및 설문 내역을 시트에 동기화합니다.</p>
                
                <div className="space-y-4 pt-2">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1.5 ml-1">Apps Script Webhook URL</label>
                        <input
                            type="text"
                            value={gsWebhookUrl}
                            onChange={e => setGsWebhookUrl(e.target.value)}
                            placeholder="https://script.google.com/macros/s/.../exec"
                            className="w-full px-4 py-3 bg-[#f2f4f6] border border-transparent rounded-xl outline-none focus:bg-white focus:border-[#3182f6] focus:ring-4 focus:ring-[#3182f6]/10 transition-all font-semibold text-[#191f28] text-sm"
                        />
                    </div>
                    <div className="flex flex-col md:flex-row items-center gap-4">
                        <button
                            onClick={handleGoogleSheetsBackup}
                            disabled={isBackingUp}
                            className="w-full md:w-auto px-6 py-3.5 bg-[#2b8a3e] hover:bg-[#216a2f] text-white rounded-xl font-bold transition shadow-sm disabled:bg-gray-300 flex items-center justify-center gap-2 text-sm whitespace-nowrap active:scale-95"
                        >
                            {isBackingUp ? '동기화 중...' : <><Database size={16} /> 모든 데이터 시트 동기화</>}
                        </button>
                        {syncProgress && (
                            <p className="text-xs text-blue-600 font-bold animate-pulse text-center md:text-left">{syncProgress}</p>
                        )}
                    </div>
                </div>
            </div>

            {/* Messenger Notifications */}
            <div className="bg-white rounded-[24px] border border-[#f2f4f6] p-6 shadow-sm space-y-4">
                <div className="flex items-center gap-2 text-[#3182f6] font-bold">
                    <Share2 size={20} />
                    <span className="text-base">실시간 메신저 알림</span>
                </div>
                <p className="text-xs text-gray-400 leading-relaxed -mt-2">입·출입과 주요 신청 내역을 설정한 메신저로 관리자 및 선생님에게 전달합니다.</p>

                <div className="overflow-hidden rounded-2xl border border-[#E5E8EB] bg-[#F8F9FA]">
                    <div className="grid grid-cols-[minmax(0,1fr)_72px_72px] items-center gap-2 border-b border-[#E5E8EB] bg-white px-4 py-2.5 text-xs font-extrabold text-[#6B7684]">
                        <span>알림 항목</span>
                        <span className="text-center">LINE</span>
                        <span className="text-center">Slack</span>
                    </div>
                    {notificationRows.map((row, index) => (
                        <div key={row.label} className={`grid grid-cols-[minmax(0,1fr)_72px_72px] items-center gap-2 px-4 py-3 ${index < notificationRows.length - 1 ? 'border-b border-[#E5E8EB]' : ''}`}>
                            <div className="min-w-0">
                                <p className="text-sm font-bold text-[#191F28]">{row.label}</p>
                                <p className="mt-0.5 text-xs text-[#6B7684]">{row.description}</p>
                            </div>
                            <div className="flex justify-center">
                                {row.line ? <Toggle enabled={row.line[0]} onChange={row.line[1]} label={`LINE ${row.label} 알림`} /> : <span className="text-xs font-bold text-[#B0B8C1]">—</span>}
                            </div>
                            <div className="flex justify-center">
                                <Toggle enabled={row.slack[0]} onChange={row.slack[1]} label={`Slack ${row.label} 알림`} />
                            </div>
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                    <div className="md:col-span-2">
                        <label className="block text-xs font-bold text-gray-500 mb-1.5 ml-1">LINE 채널 액세스 토큰 (Channel Access Token)</label>
                        <input
                            type="password"
                            value={lineChannelAccessToken}
                            onChange={e => setLineChannelAccessToken(e.target.value)}
                            placeholder="LINE 채널 액세스 토큰을 입력하세요"
                            className="w-full px-4 py-3 bg-[#f2f4f6] border border-transparent rounded-xl outline-none focus:bg-white focus:border-[#3182f6] focus:ring-4 focus:ring-[#3182f6]/10 transition-all font-semibold text-[#191f28] text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1.5 ml-1">LINE 대상 그룹 ID (Group ID)</label>
                        <input
                            type="text"
                            value={lineGroupId}
                            onChange={e => setLineGroupId(e.target.value)}
                            placeholder="Cxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                            className="w-full px-4 py-3 bg-[#f2f4f6] border border-transparent rounded-xl outline-none focus:bg-white focus:border-[#3182f6] focus:ring-4 focus:ring-[#3182f6]/10 transition-all font-semibold text-[#191f28] text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1.5 ml-1">Discord 웹훅 URL (선택사항)</label>
                        <input
                            type="text"
                            value={discordWebhookUrl}
                            onChange={e => setDiscordWebhookUrl(e.target.value)}
                            placeholder="https://discord.com/api/webhooks/..."
                            className="w-full px-4 py-3 bg-[#f2f4f6] border border-transparent rounded-xl outline-none focus:bg-white focus:border-[#3182f6] focus:ring-4 focus:ring-[#3182f6]/10 transition-all font-semibold text-[#191f28] text-sm"
                        />
                    </div>
                </div>
            </div>

            {/* Kiosk Master Pin */}
            <div className="bg-white rounded-[24px] border border-[#f2f4f6] p-6 shadow-sm space-y-4">
                <div className="flex items-center gap-2 text-red-500 font-bold">
                    <ShieldAlert size={20} />
                    <span className="text-base">키오스크 보안 설정</span>
                </div>
                <p className="text-xs text-gray-400 leading-relaxed -mt-2">키오스크 프로그램 설정 진입 및 관리자 잠금 해제에 사용되는 고유 보안 마스터 PIN을 지정합니다.</p>

                <div className="flex flex-col md:flex-row items-end gap-4 pt-2">
                    <div className="flex-1 w-full">
                        <label className="block text-xs font-bold text-gray-500 mb-1.5 ml-1">키오스크 마스터 핀 (4자리 숫자)</label>
                        <input
                            type="password"
                            maxLength="4"
                            value={kioskMasterPin}
                            onChange={e => setKioskMasterPin(e.target.value.replace(/[^0-9]/g, ''))}
                            placeholder="1801"
                            className="w-full px-4 py-3 bg-[#f2f4f6] border border-transparent rounded-xl outline-none focus:bg-white focus:border-[#3182f6] focus:ring-4 focus:ring-[#3182f6]/10 transition-all font-semibold text-[#191f28] text-sm font-mono tracking-widest"
                        />
                    </div>
                    <button
                        onClick={handleSaveIntegrations}
                        className="w-full md:w-auto px-6 py-3.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition shadow-sm text-sm active:scale-95 whitespace-nowrap"
                    >
                        마스터 핀 저장
                    </button>
                </div>
            </div>

            {/* Student web app QR for printed materials */}
            <div className="bg-white rounded-[24px] border border-[#f2f4f6] p-6 shadow-sm space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-gray-100 pb-4">
                    <div>
                        <h4 className="text-base font-bold text-[#191f28] flex items-center gap-2">
                            <span>📱</span> 학생용 웹앱 QR 코드
                        </h4>
                        <p className="text-xs text-gray-400 mt-1">
                            명함이나 안내물에 넣어 학생용 페이지로 바로 연결할 수 있습니다.
                        </p>
                    </div>
                </div>

                <div className="p-5 bg-[#f8f9fa] rounded-2xl border border-gray-100">
                    <div className="flex flex-col sm:flex-row items-center gap-6 bg-white p-5 rounded-2xl border border-gray-200/80 shadow-xs">
                        <div className="bg-white p-2 rounded-xl border border-gray-100 shrink-0">
                            <QRCodeSVG
                                id="student-app-qr"
                                value={STUDENT_APP_URL}
                                size={180}
                                level="H"
                                marginSize={2}
                                title="학생용 웹앱 QR 코드"
                            />
                        </div>
                        <div className="space-y-3 text-center sm:text-left flex-1 min-w-0">
                            <div>
                                <div className="text-sm font-extrabold text-gray-800">학생용 페이지 바로가기</div>
                                <p className="text-xs text-gray-500 font-medium mt-1">센터 체크인이 아닌 일반 웹앱 로그인 화면으로 연결됩니다.</p>
                            </div>
                            <div className="text-xs font-extrabold text-blue-600 font-mono break-all bg-blue-50/50 p-3 rounded-lg border border-blue-100/60">
                                {STUDENT_APP_URL}
                            </div>
                            <div className="flex flex-col sm:flex-row gap-2">
                                <button
                                    type="button"
                                    onClick={downloadStudentAppQrPng}
                                    className="w-full sm:w-auto px-4 py-2.5 bg-[#191f28] text-white text-xs font-bold rounded-xl hover:bg-black transition shadow-sm inline-flex items-center justify-center"
                                >
                                    📥 PNG 다운로드
                                </button>
                                <button
                                    type="button"
                                    onClick={downloadStudentAppQr}
                                    className="w-full sm:w-auto px-4 py-2.5 bg-white text-[#191f28] border border-gray-200 text-xs font-bold rounded-xl hover:bg-gray-50 transition shadow-sm inline-flex items-center justify-center"
                                >
                                    SVG 다운로드
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default IntegrationConfig;
