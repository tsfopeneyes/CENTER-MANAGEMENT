import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { filterProfanity } from '../utils/profanityFilter';
import { compressImage } from '../utils/imageUtils';
import { isAccountAuthEnabled } from '../auth/accountAuthRuntime';
import { uploadAccountImage } from '../auth/accountMedia';

export const useLiveCenterChat = (centerCode, currentUser) => {
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [profanityDetected, setProfanityDetected] = useState(false);

    // Calculate today's start in KST (00:00:00 KST)
    const getTodayKSTISO = () => {
        const now = new Date();
        // Convert to KST (UTC+9)
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        const kstOffset = 9 * 60 * 60000;
        const kstDate = new Date(utc + kstOffset);
        kstDate.setHours(0, 0, 0, 0);
        return kstDate.toISOString();
    };

    // Image Upload helper
    const uploadImage = async (file) => {
        if (!file || !file.type.startsWith('image/')) return null;

        try {
            const compressedFile = await compressImage(file, 1200, 0.8);
            const fileExt = compressedFile.name?.split('.').pop() || 'jpg';
            const fileName = `chat/${centerCode}/${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${fileExt}`;

            if(isAccountAuthEnabled())return await uploadAccountImage({profileId:currentUser.id,kind:'chat',file:compressedFile});
            const { error: uploadErr } = await supabase.storage.from('avatars').upload(fileName, compressedFile, {
                cacheControl: '3600',
                upsert: true
            });

            if (uploadErr) {
                console.warn('Storage upload warning, using base64 fallback:', uploadErr);
                return new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.readAsDataURL(compressedFile);
                });
            }

            const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName);
            return publicUrl;
        } catch (e) {
            console.error('Image upload failed:', e);
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(file);
            });
        }
    };

    // Fetch today's messages for this center
    const fetchDailyMessages = useCallback(async () => {
        if (!centerCode) return;
        setLoading(true);
        setError(null);
        try {
            const todayKST = getTodayKSTISO();
            const { data, error: fetchErr } = await supabase
                .from('center_daily_chats')
                .select('*')
                .eq('center_code', centerCode)
                .gte('created_at', todayKST)
                .order('created_at', { ascending: true });

            if (fetchErr) throw fetchErr;
            setMessages(data || []);
        } catch (err) {
            console.error('Error fetching center daily chats:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [centerCode]);

    const [typingUsers, setTypingUsers] = useState([]);
    const channelRef = useRef(null);

    // Initial Fetch & Realtime Subscription
    useEffect(() => {
        if (!centerCode) return;

        fetchDailyMessages();

        // Subscribe to Postgres changes & Broadcasts for center_daily_chats
        const channelName = `center_daily_chat:${centerCode}`;
        const channel = supabase.channel(channelName, {
            config: { broadcast: { ack: false } }
        });
        channelRef.current = channel;

        channel
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'center_daily_chats'
            }, (payload) => {
                if (payload.eventType === 'DELETE') {
                    const deletedId = payload.old?.id;
                    if (deletedId) {
                        setMessages(prev => prev.filter(m => m.id !== deletedId));
                    } else {
                        fetchDailyMessages();
                    }
                    return;
                }

                if (!payload.new) {
                    fetchDailyMessages();
                    return;
                }

                // Match center code
                if (payload.new.center_code !== centerCode) return;

                if (payload.eventType === 'INSERT') {
                    setMessages(prev => {
                        if (prev.some(m => m.id === payload.new.id)) return prev;
                        return [...prev, payload.new];
                    });
                    // Remove sender from typing list
                    setTypingUsers(prev => prev.filter(u => u.id !== payload.new.user_id && u.name !== payload.new.user_name));
                } else if (payload.eventType === 'UPDATE') {
                    setMessages(prev => prev.map(m => m.id === payload.new.id ? payload.new : m));
                }
            })
            .on('broadcast', { event: 'typing' }, ({ payload }) => {
                if (!payload || !payload.id) return;
                // Exclude self
                if (currentUser?.id && payload.id === currentUser.id) return;
                if (currentUser?.name && payload.name === currentUser.name) return;

                setTypingUsers(prev => {
                    const filtered = prev.filter(u => u.id !== payload.id);
                    return [...filtered, { ...payload, timestamp: Date.now() }];
                });
            })
            .on('broadcast', { event: 'stop_typing' }, ({ payload }) => {
                if (!payload || !payload.id) return;
                setTypingUsers(prev => prev.filter(u => u.id !== payload.id));
            })
            .subscribe();

        // Clean up stale typing indicators (> 3.5s)
        const cleanupInterval = setInterval(() => {
            const now = Date.now();
            setTypingUsers(prev => prev.filter(u => now - u.timestamp < 3500));
        }, 1000);

        return () => {
            clearInterval(cleanupInterval);
            supabase.removeChannel(channel);
            channelRef.current = null;
        };
    }, [centerCode, fetchDailyMessages, currentUser?.id, currentUser?.name]);

    const sendTypingSignal = useCallback(() => {
        if (!channelRef.current || !currentUser) return;
        channelRef.current.send({
            type: 'broadcast',
            event: 'typing',
            payload: {
                id: currentUser.id || `guest_${currentUser.name}`,
                name: currentUser.name || '익명',
                avatar: currentUser.profile_image_url || null
            }
        });
    }, [currentUser]);

    const sendStopTypingSignal = useCallback(() => {
        if (!channelRef.current || !currentUser) return;
        channelRef.current.send({
            type: 'broadcast',
            event: 'stop_typing',
            payload: {
                id: currentUser.id || `guest_${currentUser.name}`
            }
        });
    }, [currentUser]);

    // Send Message Function
    const sendMessage = async (rawMessage, imageInput = null, taggedUserIds = []) => {
        const messageText = rawMessage?.trim() || '';
        if (!messageText && !imageInput) return;
        if (!currentUser || !centerCode) return;

        let finalImageUrl = null;
        if (imageInput) {
            if (typeof imageInput === 'string') {
                finalImageUrl = imageInput;
            } else if (imageInput instanceof File) {
                finalImageUrl = await uploadImage(imageInput);
            }
        }

        const { maskedText, hasProfanity } = filterProfanity(messageText);
        if (hasProfanity) {
            setProfanityDetected(true);
            setTimeout(() => setProfanityDetected(false), 3000);
        }

        // Determine user role badge
        let roleBadge = '학생';
        if (currentUser.is_master || currentUser.role === 'admin' || currentUser.user_group === '관리자' || currentUser.user_group === 'STAFF' || currentUser.role === 'staff' || currentUser.role === 'Rok') {
            roleBadge = '스처쌤';
        } else if (currentUser.user_group === '게스트' || currentUser.name?.includes('(guest)')) {
            roleBadge = '게스트';
        }

        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const validUserId = (currentUser.id && uuidRegex.test(currentUser.id)) ? currentUser.id : null;

        const payload = {
            center_code: centerCode,
            user_id: validUserId,
            user_name: currentUser.name || '익명',
            user_avatar: currentUser.profile_image_url || null,
            user_role: roleBadge,
            message: maskedText,
            image_url: finalImageUrl,
            is_hidden: false,
            report_count: 0
        };

        try {
            const { data, error: insertErr } = await supabase
                .from('center_daily_chats')
                .insert([payload])
                .select();

            if (insertErr) throw insertErr;

            // Send mention notifications to app_notifications table (resolves both UUIDs and User Names)
            if (Array.isArray(taggedUserIds) && taggedUserIds.length > 0) {
                try {
                    let resolvedTargetUserIds = [];
                    for (const rawIdOrName of [...new Set(taggedUserIds)]) {
                        if (!rawIdOrName || rawIdOrName === currentUser.id) continue;
                        if (uuidRegex.test(rawIdOrName)) {
                            resolvedTargetUserIds.push(rawIdOrName);
                        } else {
                            const cleanName = rawIdOrName.replace('(guest)', '').replace(/@/g, '').trim();
                            if (cleanName) {
                                const { data: matchedUsers } = await supabase
                                    .from('users')
                                    .select('id, name')
                                    .or(`name.eq.${cleanName},name.eq.${cleanName}(guest)`)
                                    .limit(5);

                                if (matchedUsers && matchedUsers.length > 0) {
                                    matchedUsers.forEach(u => {
                                        if (u.id && u.id !== currentUser.id) {
                                            resolvedTargetUserIds.push(u.id);
                                        }
                                    });
                                }
                            }
                        }
                    }

                    resolvedTargetUserIds = [...new Set(resolvedTargetUserIds)];

                    if (resolvedTargetUserIds.length > 0) {
                        const notifInserts = resolvedTargetUserIds.map(uid => ({
                            sender_id: validUserId || null,
                            target_group: `USER_${uid}`,
                            content: `[${centerCode} 라이브] ${currentUser.name || '익명'} 님이 회원님을 태그했습니다: "${maskedText.substring(0, 30)}"`,
                            notification_type: 'PERSONAL'
                        }));
                        const { error: notifErr } = await supabase.from('app_notifications').insert(notifInserts);
                        if (notifErr) {
                            console.error('Failed to insert mention notifications:', notifErr);
                        }
                    }
                } catch (mentionNotifErr) {
                    console.error('Error processing mention notification targets:', mentionNotifErr);
                }
            }

            // Optimistic Update
            if (data && data[0]) {
                const insertedMsg = data[0];
                setMessages(prev => {
                    if (prev.some(m => m.id === insertedMsg.id)) return prev;
                    return [...prev, insertedMsg];
                });
            }
        } catch (err) {
            console.error('Failed to send center daily message:', err);
            alert('메시지 전송에 실패했습니다: ' + err.message);
        }
    };

    // Report Message Function
    const reportMessage = async (messageId) => {
        const target = messages.find(m => m.id === messageId);
        if (!target) return;

        const newReportCount = (target.report_count || 0) + 1;
        const isHidden = newReportCount >= 3;

        // Optimistic UI Update
        setMessages(prev => prev.map(m => {
            if (m.id === messageId) {
                return { ...m, report_count: newReportCount, is_hidden: isHidden || m.is_hidden };
            }
            return m;
        }));

        try {
            const { error: updateErr } = await supabase
                .from('center_daily_chats')
                .update({
                    report_count: newReportCount,
                    is_hidden: isHidden ? true : target.is_hidden
                })
                .eq('id', messageId);

            if (updateErr) throw updateErr;
        } catch (err) {
            console.error('Failed to report message:', err);
        }
    };

    // Admin: Toggle Hide/Unhide Message
    const toggleHideMessageAdmin = async (messageId, currentHidden) => {
        const nextHiddenState = !currentHidden;
        // Optimistic UI Update
        setMessages(prev => prev.map(m => m.id === messageId ? { ...m, is_hidden: nextHiddenState } : m));

        try {
            const { error: err } = await supabase
                .from('center_daily_chats')
                .update({ is_hidden: nextHiddenState })
                .eq('id', messageId);

            if (err) throw err;
        } catch (err) {
            console.error('Failed to toggle hide message:', err);
            alert('메시지 숨김 처리 실패');
        }
    };

    // Admin: Delete Single Message
    const deleteMessageAdmin = async (messageId) => {
        // Optimistic UI Update
        setMessages(prev => prev.filter(m => m.id !== messageId));

        try {
            const { error: err } = await supabase
                .from('center_daily_chats')
                .delete()
                .eq('id', messageId);

            if (err) throw err;
        } catch (err) {
            console.error('Failed to delete message:', err);
            alert('메시지 삭제 실패');
        }
    };

    // Admin: Clear Today's Chat for current center
    const clearDailyChatAdmin = async () => {
        const todayKST = getTodayKSTISO();
        // Optimistic UI Update
        setMessages([]);

        try {
            const { error: err } = await supabase
                .from('center_daily_chats')
                .delete()
                .eq('center_code', centerCode)
                .gte('created_at', todayKST);

            if (err) throw err;
        } catch (err) {
            console.error('Failed to clear daily chat:', err);
            alert('채팅 초기화 실패');
        }
    };

    // Toggle Emoji Reaction on a message
    const toggleReaction = async (messageId, emoji) => {
        if (!currentUser || !messageId || !emoji) return;

        const targetMsg = messages.find(m => m.id === messageId);
        if (!targetMsg) return;

        const currentReactions = targetMsg.reactions || {};
        const rawList = Array.isArray(currentReactions[emoji]) ? currentReactions[emoji] : [];

        const myName = currentUser.name || currentUser.user_name || '이용자';
        const mySchool = currentUser.school || currentUser.user_group || currentUser.school_name || '';

        // Normalize items to { id, name, school } objects
        const userList = rawList.map(item => {
            if (typeof item === 'string') {
                if (item === currentUser.id) return { id: item, name: myName, school: mySchool };
                if (item === targetMsg.user_id) return { id: item, name: targetMsg.user_name, school: targetMsg.user_school || '' };
                return { id: item, name: '이용자', school: '' };
            }
            return item;
        });

        const hasReacted = userList.some(item => item.id === currentUser.id);

        let updatedUserList;
        if (hasReacted) {
            updatedUserList = userList.filter(item => item.id !== currentUser.id);
        } else {
            updatedUserList = [...userList, { id: currentUser.id, name: myName, school: mySchool }];
        }

        const newReactions = { ...currentReactions };
        if (updatedUserList.length > 0) {
            newReactions[emoji] = updatedUserList;
        } else {
            delete newReactions[emoji];
        }

        // Optimistic UI update
        setMessages(prev => prev.map(m => m.id === messageId ? { ...m, reactions: newReactions } : m));

        try {
            const { error: updateErr } = await supabase
                .from('center_daily_chats')
                .update({ reactions: newReactions })
                .eq('id', messageId);

            if (updateErr) throw updateErr;
        } catch (err) {
            console.error('Failed to toggle reaction:', err);
        }
    };

    return {
        messages,
        loading,
        error,
        profanityDetected,
        typingUsers,
        sendTypingSignal,
        sendStopTypingSignal,
        sendMessage,
        reportMessage,
        toggleReaction,
        toggleHideMessageAdmin,
        deleteMessageAdmin,
        clearDailyChatAdmin,
        refetch: fetchDailyMessages
    };
};

export default useLiveCenterChat;
