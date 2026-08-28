import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { X, Heart, Smile, Users, HelpCircle, Sparkles } from 'lucide-react';
import { supabase } from '../../../supabaseClient';
import { dispatchSlackAlert } from '../../../utils/serverIntegration';
import { requestSupabaseFunction } from '../../../utils/supabaseRest';

const CoffeeChatModal = ({ staff, student, onClose, onSuccess, tutorialMode = false }) => {
    const [submitting, setSubmitting] = useState(false);
    const [selectedTopics, setSelectedTopics] = useState([]);
    const [message, setMessage] = useState('');
    const [tutorialComplete, setTutorialComplete] = useState(false);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    const topics = [
        { name: '신앙', icon: Heart },
        { name: '일상', icon: Smile },
        { name: '관계', icon: Users },
        { name: '고민', icon: HelpCircle },
        { name: '기타', icon: Sparkles }
    ];

    const handleTopicToggle = (topicName) => {
        if (selectedTopics.includes(topicName)) {
            setSelectedTopics(selectedTopics.filter(t => t !== topicName));
        } else {
            setSelectedTopics([...selectedTopics, topicName]);
        }
    };

    const handleSubmit = async () => {
        if (selectedTopics.length === 0) {
            alert('최소 하나의 주제를 선택해주세요.');
            return;
        }

        setSubmitting(true);
        try {
            if (tutorialMode) {
                await new Promise((resolve) => setTimeout(resolve, 450));
                setTutorialComplete(true);
                return;
            }
            // 1. Insert into Supabase
            const result = await requestSupabaseFunction('dispatch-notification', {
                action: 'create-coffee-chat',
                studentId: student.id,
                staffId: staff.id,
                topics: selectedTopics,
                coffeeChatMessage: message.trim() || null,
            });

            // 2. Send LINE and Discord notifications
            let lineToken = localStorage.getItem('line_channel_access_token');
            let lineGroupId = localStorage.getItem('line_group_id');
            let gsWebhookUrl = localStorage.getItem('gs_webhook_url');
            let discordWebhookUrl = localStorage.getItem('discord_webhook_url');
            let lineCoffeeChatEnabled = localStorage.getItem('line_coffee_chat_notifications_enabled') !== 'false';
            let slackCoffeeChatEnabled = localStorage.getItem('slack_coffee_chat_notifications_enabled') !== 'false';

            try {
                const { data: settings } = await supabase.from('global_settings').select('*');
                if (settings && settings.length > 0) {
                    settings.forEach(s => {
                        if (s.key === 'line_channel_access_token' && s.value) {
                            lineToken = s.value;
                            localStorage.setItem('line_channel_access_token', s.value);
                        }
                        if (s.key === 'line_group_id' && s.value) {
                            lineGroupId = s.value;
                            localStorage.setItem('line_group_id', s.value);
                        }
                        if (s.key === 'gs_webhook_url' && s.value) {
                            gsWebhookUrl = s.value;
                            localStorage.setItem('gs_webhook_url', s.value);
                        }
                        if (s.key === 'discord_webhook_url' && s.value) {
                            discordWebhookUrl = s.value;
                            localStorage.setItem('discord_webhook_url', s.value);
                        }
                        if (s.key === 'line_coffee_chat_notifications_enabled') {
                            lineCoffeeChatEnabled = s.value !== 'false';
                            localStorage.setItem('line_coffee_chat_notifications_enabled', String(lineCoffeeChatEnabled));
                        }
                        if (s.key === 'slack_coffee_chat_notifications_enabled') {
                            slackCoffeeChatEnabled = s.value !== 'false';
                            localStorage.setItem('slack_coffee_chat_notifications_enabled', String(slackCoffeeChatEnabled));
                        }
                    });
                }
            } catch (e) {
                console.error("Failed to fetch latest global_settings for coffee chat:", e);
            }

            const formattedTopics = selectedTopics.join(', ');
            const alertMsg = `[COFFEE CHAT]\n☕ ${student.name}님이 ${staff.name} 쌤에게 대화를 신청했어요!\n📌 주제: ${formattedTopics}${message.trim() ? `\n💬 스처쌤에게 하고 싶은 말:\n"${message.trim()}"` : ''}`;

            if (slackCoffeeChatEnabled) {
                dispatchSlackAlert(alertMsg, { notificationCategory: 'coffee_chat' }).catch(error => console.error('Slack coffee chat notification error:', error));
            }

            // Discord Webhook
            if (discordWebhookUrl) {
                try {
                    await fetch(discordWebhookUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ content: alertMsg })
                    });
                } catch (e) {
                    console.error("Failed to send Discord webhook:", e);
                }
            }

            // LINE Webhook (Only for Haifn branch students/staff)
            const studentSchool = student?.school || '';
            const staffGroup = staff?.user_group || '';
            const isEnoughPlace = studentSchool.includes('강서') || studentSchool.includes('이높') || staffGroup.includes('이높') || staffGroup.includes('강서');
            const isHaifnUser = !isEnoughPlace;

            if (lineCoffeeChatEnabled && isHaifnUser && lineToken && lineGroupId && gsWebhookUrl) {
                try {
                    await fetch(gsWebhookUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'text/plain' },
                        body: JSON.stringify({
                            action: 'LINE_NOTIFY',
                            token: lineToken,
                            to: lineGroupId,
                            message: alertMsg
                        })
                    });
                } catch (e) {
                    console.error("Failed to send LINE notification:", e);
                }
            }

            alert(`${staff.name} 쌤에게 커피챗 신청이 완료되었습니다! 💙`);
            // Pass the saved row back so the student home card can appear
            // immediately without waiting for a Realtime event or reload.
            onSuccess(result?.coffeeChat || null);
        } catch (err) {
            console.error('Coffee Chat Request Error:', err);
            alert('신청 처리 중 오류가 발생했습니다: ' + err.message);
        } finally {
            setSubmitting(false);
        }
    };

    return createPortal((
        <div 
            className="fixed inset-0 z-[999] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
            onClick={onClose}
        >
            {tutorialComplete && (
                <div className="fixed inset-0 z-[1001] flex items-center justify-center bg-black/40 p-4" onClick={(e) => e.stopPropagation()}>
                    <div className="w-full max-w-md rounded-[24px] border border-black/5 bg-white p-6 text-center shadow-[0_20px_60px_rgba(0,0,0,0.28)]">
                        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><span className="text-3xl">✓</span></div>
                        <h3 className="mt-5 text-xl font-black text-tossGrey900">커피챗 신청이 완료됐어요</h3>
                        <p className="mt-2 text-sm font-semibold leading-6 text-tossGrey600">튜토리얼 체험이라 실제 신청으로 저장되지는 않아요.</p>
                        <button type="button" onClick={onSuccess} className="mt-6 w-full rounded-2xl bg-tossBlue py-4 text-sm font-black text-white">다음으로</button>
                    </div>
                </div>
            )}
            <motion.div
                initial={{ opacity: 0, y: 28 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                style={{ willChange: 'transform, opacity' }}
                className="relative flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-[2.5rem] bg-white shadow-[0_-8px_30px_rgba(0,0,0,0.18)] sm:h-auto sm:max-h-[90vh] sm:max-w-md sm:rounded-3xl sm:shadow-[0_18px_50px_rgba(0,0,0,0.2)]"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Close Button Float */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-2 bg-tossGrey100 hover:bg-tossGrey200 rounded-full text-tossGrey500 transition-colors z-20"
                >
                    <X size={18} className="stroke-[3]" />
                </button>

                {/* Profile Card Header (No separate text boxes) */}
                <div className="flex flex-col items-center text-center px-6 pt-6 pb-4 border-b border-tossGrey100 bg-white shrink-0">
                    <div className="relative mb-2">
                        {staff.profile_image_url ? (
                            <img src={staff.profile_image_url} alt={staff.name} decoding="async" className="w-20 h-20 rounded-full object-cover border border-tossGrey200 shadow-sm" />
                        ) : (
                            <div className="w-20 h-20 rounded-full bg-tossBlue/10 flex items-center justify-center text-tossBlue font-bold text-2xl">
                                {staff.name?.substring(0, 1)}
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-1.5 justify-center">
                        <h2 className="text-lg font-bold text-tossGrey900 tracking-tight">{staff.name} 쌤</h2>
                    </div>
                    <p className="text-xs font-semibold text-tossGrey500 mt-1 max-w-[85%] leading-relaxed">
                        {staff.bio?.trim() ? `"${staff.bio}"` : '"지금 센터에 있으니 가볍게 함께 대화 나눠요!"'}
                    </p>
                </div>

                {/* Content Section (Scrollable only if contents overflow) */}
                <div className="flex-1 overflow-y-auto px-5 py-4 pb-3 touch-pan-y bg-tossGrey50 space-y-4">
                    {/* Topic Choice */}
                    <div className="space-y-2">
                        <div className="flex flex-col gap-0.5 ml-0.5">
                            <label className="text-sm font-bold text-tossGrey900">
                                어떤 대화를 나누고 싶나요?
                            </label>
                            <span className="text-[10px] font-semibold text-tossGrey400">주제 선택 (중복 선택 가능)</span>
                        </div>
                        
                        {/* Toss style 2-Column Grid */}
                        <div className="grid grid-cols-2 gap-2 w-full">
                            {topics.map((t, idx) => {
                                const isSelected = selectedTopics.includes(t.name);
                                const IconComponent = t.icon;
                                const isLast = idx === topics.length - 1;
                                
                                return (
                                    <button
                                        key={t.name}
                                        onClick={() => handleTopicToggle(t.name)}
                                        className={`px-3 py-2.5 rounded-xl text-xs font-bold border transition-all duration-150 active:scale-95 flex items-center justify-center gap-1.5 ${
                                            isLast ? 'col-span-2' : ''
                                        } ${
                                            isSelected
                                                ? 'bg-tossBlue border-tossBlue text-white shadow-sm'
                                                : 'bg-white border-tossGrey200 text-tossGrey600 hover:bg-tossGrey50'
                                        }`}
                                    >
                                        <IconComponent size={14} className={isSelected ? 'text-white' : 'text-tossGrey400'} />
                                        <span>{t.name}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Message for Staff */}
                    <div className="space-y-2">
                        <div className="flex flex-col gap-0.5 ml-0.5">
                            <label className="text-sm font-bold text-tossGrey900">
                                스처쌤에게 하고 싶은 말
                            </label>
                            <span className="text-[10px] font-semibold text-tossGrey400">하고 싶은 고민이나 나누고 싶은 말을 적어주세요 (선택)</span>
                        </div>
                        <textarea
                            rows={2}
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            placeholder="메시지를 적어보세요! (예: 요즘 진로 고민이 많아요, 쌤 근황 궁금해요 등)"
                            className="w-full p-3.5 bg-white border border-tossGrey200 rounded-xl text-xs font-semibold text-tossGrey950 placeholder-tossGrey300 focus:border-tossBlue focus:ring-4 focus:ring-tossBlue/10 outline-none resize-none transition-all duration-200 h-20"
                        />
                    </div>
                </div>

                {/* Footer Action */}
                <div className="shrink-0 p-4 pb-4 bg-white border-t border-tossGrey100">
                    <button
                        onClick={handleSubmit}
                        disabled={submitting}
                        className="w-full py-3.5 bg-tossBlue disabled:bg-tossGrey300 text-white rounded-xl font-bold text-sm transition-all active:scale-[0.98] flex items-center justify-center shadow-sm"
                    >
                        {submitting ? '신청 중...' : '커피챗 신청하기'}
                    </button>
                </div>
            </motion.div>
        </div>
    ), document.body);
};

export default CoffeeChatModal;
