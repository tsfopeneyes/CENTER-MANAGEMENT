import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { MessageSquare, MessageCircle, Send, AlertTriangle, Shield, Info, Sparkles, Flag, CheckCircle2, Trash2, Eye, EyeOff, RotateCcw, Image as ImageIcon, X, Smile, ExternalLink } from 'lucide-react';
import { supabase } from '../../../supabaseClient';
import { useLiveCenterChat } from '../../../hooks/useLiveCenterChat';

// Safe Motion Fallback for Samsung Smart Signage / Tizen Browsers
const motion = {
    div: ({ children, className, style, onClick, ...props }) => (
        <div className={className} style={style} onClick={onClick}>{children}</div>
    ),
    button: ({ children, className, style, onClick, ...props }) => (
        <button className={className} style={style} onClick={onClick}>{children}</button>
    )
};
const AnimatePresence = ({ children }) => <>{children}</>;

const QUICK_EMOJIS = ['👍', '❤️', '🔥', '😂', '🎉', '👏', '😮', '😢', '🙏', '💯'];

const EMOJI_CATEGORIES = [
    {
        name: '인기 반응',
        emojis: ['👍', '❤️', '🔥', '😂', '🎉', '👏', '😮', '😢', '🙏', '💯', '👀', '✨', '🙌', '💪', '🚀']
    },
    {
        name: '표정 & 기분',
        emojis: ['😊', '🥰', '😍', '🤩', '😎', '🥳', '🤔', '🤗', '🤫', '😴', '😭', '😱', '🤯', '😈', '🤡']
    },
    {
        name: '손짓 & 응원',
        emojis: ['👍', '👎', '✌️', '🤞', '🤟', '🤘', '👌', '🤝', '🙏', '👏', '🙌', '👐', '👊', '💪', '👋']
    },
    {
        name: '하트 & 보석',
        emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🤎', '🖤', '🤍', '💖', '💝', '🔥', '✨', '⭐', '💎']
    },
    {
        name: '축하 & 오브젝트',
        emojis: ['🎉', '🎊', '🎁', '🎈', '🏆', '🥇', '👑', '🎯', '🚀', '🍕', '🍿', '☕', '🍀', '🌸', '🎵']
    }
];

const LiveCenterChat = ({ currentUser, studentRegion, initialCenter, isStandalone = false }) => {
    // 1. Privileges
    const isMaster = Boolean(
        currentUser?.is_master ||
        currentUser?.user_group === '관리자' ||
        currentUser?.role === 'admin' ||
        currentUser?.role === 'Rok'
    );

    const isAdminOrStaff = Boolean(
        isMaster ||
        currentUser?.user_group === 'STAFF' ||
        currentUser?.role === 'staff'
    );

    // 2. Active Center Code state
    const getCenterFromRegion = (region, initCenter) => {
        if (initCenter) {
            if (initCenter === 'haifn' || initCenter === '강동' || initCenter === '하이픈') return '하이픈';
            if (initCenter === 'enough' || initCenter === '강서' || initCenter === '이높' || initCenter === '이높플레이스') return '이높플레이스';
        }
        if (!region) return '하이픈';
        if (region === '강서' || region.includes('이높') || region === '이높플레이스') {
            return '이높플레이스';
        }
        return '하이픈';
    };

    const [activeCenter, setActiveCenter] = useState(() => getCenterFromRegion(studentRegion, initialCenter));

    useEffect(() => {
        if (initialCenter) {
            setActiveCenter(getCenterFromRegion(studentRegion, initialCenter));
        } else if (studentRegion) {
            setActiveCenter(getCenterFromRegion(studentRegion));
        }
    }, [studentRegion, initialCenter]);

    const [inputMessage, setInputMessage] = useState('');
    const [selectedImage, setSelectedImage] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);
    const [uploadingImage, setUploadingImage] = useState(false);
    const [enlargedImageUrl, setEnlargedImageUrl] = useState(null);
    const [activeReactionPickerId, setActiveReactionPickerId] = useState(null);
    const [extendedReactionMsgId, setExtendedReactionMsgId] = useState(null);
    const [showExtendedPicker, setShowExtendedPicker] = useState(false);
    const [customEmojiInput, setCustomEmojiInput] = useState('');
    const [reactionDetailMsg, setReactionDetailMsg] = useState(null);
    const [activeReactionTab, setActiveReactionTab] = useState('ALL');

    // Long press for reactions
    const reactionTimerRef = useRef(null);
    const isReactionLongPressRef = useRef(false);
    const ignoreReactionBackdropClickRef = useRef(false);

    const handleReactionPressStart = (msg, emoji) => {
        isReactionLongPressRef.current = false;
        reactionTimerRef.current = setTimeout(() => {
            isReactionLongPressRef.current = true;
            ignoreReactionBackdropClickRef.current = true;
            setReactionDetailMsg(msg);
            setActiveReactionTab(emoji);
            setTimeout(() => {
                ignoreReactionBackdropClickRef.current = false;
            }, 500);
        }, 400);
    };

    const handleReactionPressEnd = (msgId, emoji) => {
        if (reactionTimerRef.current) {
            clearTimeout(reactionTimerRef.current);
            reactionTimerRef.current = null;
        }
        if (!isReactionLongPressRef.current) {
            toggleReaction(msgId, emoji);
        }
    };

    const handleReactionPressCancel = () => {
        if (reactionTimerRef.current) {
            clearTimeout(reactionTimerRef.current);
            reactionTimerRef.current = null;
        }
    };

    const [centerUsers, setCenterUsers] = useState([]);
    const [showMentionPopover, setShowMentionPopover] = useState(false);
    const [mentionSearchQuery, setMentionSearchQuery] = useState('');
    const [taggedUserIds, setTaggedUserIds] = useState([]);
    const fileInputRef = useRef(null);

    const [showInfoModal, setShowInfoModal] = useState(false);
    const [reportSuccessToast, setReportSuccessToast] = useState(false);
    const [reportingMsgId, setReportingMsgId] = useState(null);
    const [deletingMsgId, setDeletingMsgId] = useState(null);
    const [showClearConfirmModal, setShowClearConfirmModal] = useState(false);
    const [rpcCandidates, setRpcCandidates] = useState([]);
    const [schoolRegionMap, setSchoolRegionMap] = useState(new Map());

    const messagesContainerRef = useRef(null);

    // Fetch ALL registered center users from users and guest_posts tables
    useEffect(() => {
        const fetchCenterUsers = async () => {
            try {
                // 0. Fetch schools for school -> region lookup
                const { data: schoolsData } = await supabase.from('schools').select('name, region');
                const sMap = new Map();
                if (schoolsData && Array.isArray(schoolsData)) {
                    schoolsData.forEach(s => {
                        if (s.name && s.region) {
                            sMap.set(s.name.trim(), s.region.trim());
                        }
                    });
                }
                setSchoolRegionMap(sMap);

                // 1. Fetch from users table (without nonexistent region column)
                const { data: usersData, error: uErr } = await supabase
                    .from('users')
                    .select('id, name, role, user_group, school, profile_image_url')
                    .limit(1000);
                if (uErr) console.warn('users table fetch error:', uErr);

                // 2. Fetch from guest_posts table
                const { data: guestData, error: gErr } = await supabase
                    .from('guest_posts')
                    .select('user_id, user_name, user_avatar')
                    .limit(500);
                if (gErr) console.warn('guest_posts fetch error:', gErr);

                const list = [];
                const nameSet = new Set();

                if (usersData && Array.isArray(usersData)) {
                    usersData.forEach(u => {
                        const trimmedName = u?.name?.trim();
                        if (trimmedName && !nameSet.has(trimmedName)) {
                            nameSet.add(trimmedName);
                            list.push({
                                id: u.id,
                                name: trimmedName,
                                role: u.role || '학생',
                                user_group: u.user_group || '',
                                school: u.school || '',
                                region: u.region || '',
                                profile_image_url: u.profile_image_url || null
                            });
                        }
                    });
                }

                if (guestData && Array.isArray(guestData)) {
                    guestData.forEach(g => {
                        const trimmedName = g?.user_name?.trim();
                        if (trimmedName && !nameSet.has(trimmedName)) {
                            nameSet.add(trimmedName);
                            list.push({
                                id: g.user_id || trimmedName,
                                name: trimmedName,
                                role: '학생',
                                user_group: '',
                                school: '',
                                region: '',
                                profile_image_url: g.user_avatar || null
                            });
                        }
                    });
                }

                setCenterUsers(list);
            } catch (err) {
                console.error('Failed to fetch center users for mentions:', err);
            }
        };
        fetchCenterUsers();
    }, []);

    // Dynamically query Supabase RPC when user types a mention query
    useEffect(() => {
        if (!mentionSearchQuery || mentionSearchQuery.trim().length === 0) {
            setRpcCandidates([]);
            return;
        }

        const fetchRpcCandidates = async () => {
            try {
                let candidates = [];
                const { data: rpcData, error: rpcError } = await supabase.rpc('get_login_candidates', { p_name: mentionSearchQuery.trim() });
                if (!rpcError && rpcData && Array.isArray(rpcData) && rpcData.length > 0) {
                    candidates = rpcData;
                } else {
                    // Fallback to direct query on users table
                    const { data: fallbackData } = await supabase
                        .from('users')
                        .select('id, name, school, role')
                        .ilike('name', `%${mentionSearchQuery.trim()}%`)
                        .limit(10);
                    candidates = fallbackData || [];
                }

                if (candidates && Array.isArray(candidates)) {
                    setRpcCandidates(candidates.map(r => ({
                        id: r.id,
                        name: r.name,
                        school: r.school || '',
                        role: r.role || '학생',
                        user_group: '',
                        region: '',
                        profile_image_url: null
                    })));
                }
            } catch (e) {
                console.warn('RPC candidate fetch error, trying direct query:', e);
            }
        };

        const timer = setTimeout(fetchRpcCandidates, 150);
        return () => clearTimeout(timer);
    }, [mentionSearchQuery]);

    // Custom Hook for Realtime Center Chat
    const {
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
        clearDailyChatAdmin
    } = useLiveCenterChat(activeCenter, currentUser);

    // Combine users from DB, RPC, and active chat messages
    const allCandidateUsers = useMemo(() => {
        const userMap = new Map();

        // 1. From DB fetched users
        (centerUsers || []).forEach(u => {
            if (u && u.name) {
                userMap.set(u.name.trim(), u);
            }
        });

        // 2. From RPC candidates
        (rpcCandidates || []).forEach(r => {
            if (r && r.name && !userMap.has(r.name.trim())) {
                userMap.set(r.name.trim(), r);
            }
        });

        // 3. From active chat messages
        (messages || []).forEach(m => {
            if (m && m.user_name) {
                const nameKey = m.user_name.trim();
                if (!userMap.has(nameKey)) {
                    userMap.set(nameKey, {
                        id: m.user_id || nameKey,
                        name: nameKey,
                        role: m.user_role || '학생',
                        user_group: '',
                        school: '',
                        region: '',
                        profile_image_url: m.user_avatar || null
                    });
                }
            }
        });

        return Array.from(userMap.values());
    }, [centerUsers, rpcCandidates, messages]);

    const [userHasScrolledUp, setUserHasScrolledUp] = useState(false);

    const handleScroll = () => {
        if (!messagesContainerRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
        const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
        setUserHasScrolledUp(!isAtBottom);
    };

    // Auto-scroll ONLY when user is near bottom or on initial load
    useEffect(() => {
        if (messagesContainerRef.current && !userHasScrolledUp) {
            messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
        }
    }, [messages, activeCenter, typingUsers]);

    const handleImageSelect = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            alert('이미지 파일만 선택 가능합니다.');
            return;
        }

        setSelectedImage(file);
        const reader = new FileReader();
        reader.onloadend = () => setImagePreview(reader.result);
        reader.readAsDataURL(file);
    };

    const removeSelectedImage = () => {
        setSelectedImage(null);
        setImagePreview(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const justSelectedMention = useRef(false);
    const lastTypingSignalRef = useRef(0);

    const handleInputChange = (e) => {
        const val = e.target.value;
        setInputMessage(val);

        if (val.trim()) {
            const now = Date.now();
            if (now - lastTypingSignalRef.current > 1500) {
                lastTypingSignalRef.current = now;
                sendTypingSignal();
            }
        } else {
            sendStopTypingSignal();
        }

        if (justSelectedMention.current) {
            justSelectedMention.current = false;
            setShowMentionPopover(false);
            return;
        }

        const lastAtIndex = val.lastIndexOf('@');
        if (lastAtIndex !== -1) {
            const queryAfterAt = val.slice(lastAtIndex + 1);
            // Require at least 1 character typed after @ to show mention popover
            if (queryAfterAt.trim().length > 0 && !/\s/.test(queryAfterAt)) {
                setShowMentionPopover(true);
                setMentionSearchQuery(queryAfterAt);
                return;
            }
        }
        setShowMentionPopover(false);
    };

    const selectMentionUser = (e, u) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        justSelectedMention.current = true;

        const lastAtIndex = inputMessage.lastIndexOf('@');
        let newText = '';
        if (lastAtIndex !== -1) {
            newText = inputMessage.slice(0, lastAtIndex) + `@${u.name} `;
        } else {
            newText = inputMessage + `@${u.name} `;
        }

        setInputMessage(newText);
        setTaggedUserIds(prev => [...new Set([...prev, u.id])]);
        setShowMentionPopover(false);
        setMentionSearchQuery('');
    };

    const getCenterForCandidate = (u, sMap) => {
        if (!u) return 'BOTH';
        // Staff & Admins can be tagged in ANY center
        if (
            u.role === 'admin' ||
            u.role === 'staff' ||
            u.role === 'Rok' ||
            u.user_group === 'STAFF' ||
            u.user_group === '관리자'
        ) {
            return 'BOTH';
        }

        const schoolName = typeof u.school === 'string' ? u.school.trim() : '';
        const mappedRegion = sMap?.get(schoolName) || '';
        const region = typeof u.region === 'string' && u.region ? u.region : mappedRegion;

        if (
            region === '강서' ||
            region.includes('이높') ||
            region === '이높플레이스' ||
            schoolName.includes('강서') ||
            schoolName.includes('이높')
        ) {
            return '이높플레이스';
        }

        if (
            region === '강동' ||
            region.includes('하이픈') ||
            schoolName.includes('강동') ||
            schoolName.includes('하이픈')
        ) {
            return '하이픈';
        }

        // Fallback for unmapped students: allow in BOTH
        return 'BOTH';
    };

    const getChosung = (str) => {
        if (!str) return '';
        const CHO = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
        let result = '';
        for (let i = 0; i < str.length; i++) {
            const code = str.charCodeAt(i) - 44032;
            if (code >= 0 && code <= 11172) {
                result += CHO[Math.floor(code / 588)];
            } else {
                result += str[i];
            }
        }
        return result;
    };

    const isOnlyChosung = (str) => {
        if (!str) return false;
        return /^[ㄱ-ㅎ]+$/.test(str.trim());
    };

    const matchesKoreanSearch = (name, query) => {
        if (!name) return false;
        if (!query || !query.trim()) return true;

        const cleanName = name.toLowerCase().trim();
        const cleanQuery = query.toLowerCase().trim();

        // 1. Direct substring match (e.g. "강", "하", "민", "강하", "강하민")
        if (cleanName.includes(cleanQuery)) return true;

        // 2. Pure Chosung query match (e.g. query is "ㄱ", "ㄱㅎ", "ㄱㅎㅁ")
        if (isOnlyChosung(cleanQuery)) {
            const nameChosung = getChosung(cleanName);
            return nameChosung.includes(cleanQuery);
        }

        // 3. IME composition match during typing (e.g. query is "강ㅎ" for "강하민")
        if (cleanQuery.length > 1 && cleanQuery.length <= cleanName.length) {
            const queryPrefix = cleanQuery.slice(0, -1);
            const queryLastChar = cleanQuery.slice(-1);

            if (cleanName.includes(queryPrefix)) {
                const prefixIndex = cleanName.indexOf(queryPrefix);
                const nextCharInName = cleanName[prefixIndex + queryPrefix.length];
                if (nextCharInName) {
                    if (nextCharInName === queryLastChar) return true;
                    if (isOnlyChosung(queryLastChar) && getChosung(nextCharInName) === queryLastChar) return true;
                }
            }
        }

        return false;
    };

    const filteredMentionUsers = useMemo(() => {
        return allCandidateUsers.filter(u => {
            if (!u || !u.name) return false;

            // Exclude logged-in self account as requested
            if (currentUser?.name && (u.name === currentUser.name || u.id === currentUser.id)) {
                return false;
            }

            // Center Scoping Check: Hide candidates that belong to a DIFFERENT center
            const candCenter = getCenterForCandidate(u, schoolRegionMap);
            if (candCenter !== 'BOTH' && candCenter !== activeCenter) {
                return false;
            }

            if (!mentionSearchQuery) return true;
            return matchesKoreanSearch(u.name, mentionSearchQuery);
        });
    }, [allCandidateUsers, currentUser, activeCenter, mentionSearchQuery, schoolRegionMap]);

    const parseMentionsFromText = (text, candidates) => {
        if (!text || !text.includes('@')) return [];
        const matches = text.match(/@([^\s@]+)/g);
        if (!matches) return [];

        const foundIds = [];
        matches.forEach(m => {
            const rawName = m.substring(1).trim().toLowerCase();
            if (!rawName) return;

            const targetUser = candidates.find(u => {
                if (!u?.name) return false;
                const cleanName = u.name.replace('(guest)', '').replace(/\(guest\)/gi, '').trim().toLowerCase();
                return cleanName === rawName || u.name.toLowerCase() === rawName;
            });

            if (targetUser?.id) {
                foundIds.push(targetUser.id);
            }
        });

        return foundIds;
    };

    const handleSend = async (e) => {
        e.preventDefault();
        if (!inputMessage.trim() && !selectedImage) return;

        setUploadingImage(true);
        try {
            sendStopTypingSignal();
            const textMentionIds = parseMentionsFromText(inputMessage, allCandidateUsers);
            const finalTaggedUserIds = [...new Set([...taggedUserIds, ...textMentionIds])];

            await sendMessage(inputMessage, selectedImage, finalTaggedUserIds);
            setInputMessage('');
            removeSelectedImage();
            setTaggedUserIds([]);
            setShowMentionPopover(false);
        } finally {
            setUploadingImage(false);
        }
    };

    const handleReportConfirm = async () => {
        if (!reportingMsgId) return;
        await reportMessage(reportingMsgId);
        setReportingMsgId(null);
        setReportSuccessToast(true);
        setTimeout(() => setReportSuccessToast(false), 3000);
    };

    const handleDeleteConfirm = async () => {
        if (!deletingMsgId) return;
        await deleteMessageAdmin(deletingMsgId);
        setDeletingMsgId(null);
    };

    const handleClearConfirm = async () => {
        await clearDailyChatAdmin();
        setShowClearConfirmModal(false);
    };

    return (
        <div className={`bg-white relative flex flex-col overflow-hidden ${isStandalone ? 'h-screen w-full p-0' : 'p-5 rounded-toss-xl shadow-toss-standard'}`}>
            {/* Header - Fixed Top Flex Block */}
            <div className={`flex justify-between items-center bg-white opacity-100 shrink-0 ${isStandalone ? 'px-8 py-4 border-b-2 border-tossGrey100 shadow-xs' : 'mb-3 pb-3 border-b border-tossGrey100'}`}>
                <div className="flex items-center gap-3.5 min-w-0">
                    <div className={`${isStandalone ? 'w-12 h-12 rounded-2xl bg-tossBlue/10 text-tossBlue border border-tossBlue/20' : 'w-10 h-10 rounded-2xl bg-tossBlue/10 text-tossBlue'} flex items-center justify-center shrink-0`}>
                        <MessageSquare size={isStandalone ? 22 : 18} />
                    </div>
                    <div className="min-w-0 pr-3.5">
                        <div className="flex items-center gap-2">
                            <h3 className={`font-black text-tossGrey900 ${isStandalone ? 'text-2xl sm:text-3xl' : 'text-[15px]'} tracking-tight leading-tight`}>
                                {activeCenter === '이높플레이스' ? '이높플 라이브' : '하이픈 라이브'}
                            </h3>
                            {isStandalone && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-red-50 text-red-600 text-xs font-black border border-red-200/80 animate-pulse">
                                    <span className="w-2 h-2 rounded-full bg-red-500" />
                                    LIVE
                                </span>
                            )}
                            <button
                                onClick={() => setShowInfoModal(!showInfoModal)}
                                className="text-tossGrey400 hover:text-tossGrey600 transition p-0.5"
                                title="채팅 안내"
                            >
                                <Info size={15} />
                            </button>
                        </div>
                        <p className={`${isStandalone ? 'text-xs sm:text-sm font-semibold text-tossGrey500' : 'text-[11px] text-tossGrey500 font-semibold'} mt-0.5`}>
                            {activeCenter}에서 나누고 싶은 모든 이야기 (매일 밤 12시 초기화)
                        </p>
                    </div>
                </div>

                {/* Right Header Actions: Master Switcher or Admin Reset */}
                <div className="flex items-center gap-2 shrink-0 ml-3.5">
                    {isAdminOrStaff && (
                        <button
                            onClick={() => setShowClearConfirmModal(true)}
                            className="flex items-center gap-1 text-[11px] font-bold px-2 py-1 bg-red-50 text-red-600 border border-red-100 rounded-toss-md hover:bg-red-100 transition shadow-2xs"
                            title="오늘 대화 초기화"
                        >
                            <RotateCcw size={12} />
                            <span>초기화</span>
                        </button>
                    )}

                    {(isMaster && !isStandalone) && (
                        <div className="flex items-center bg-tossGrey100 p-1 rounded-toss-md border border-tossGrey200/50">
                            <button
                                onClick={() => setActiveCenter('하이픈')}
                                className={`px-2.5 py-1 text-[11px] font-extrabold rounded-md transition-all ${
                                    activeCenter === '하이픈'
                                        ? 'bg-white text-tossBlue shadow-toss-subtle'
                                        : 'text-tossGrey500 hover:text-tossGrey800'
                                }`}
                            >
                                하이픈
                            </button>
                            <button
                                onClick={() => setActiveCenter('이높플레이스')}
                                className={`px-2.5 py-1 text-[11px] font-extrabold rounded-md transition-all ${
                                    activeCenter === '이높플레이스'
                                        ? 'bg-white text-tossBlue shadow-toss-subtle'
                                        : 'text-tossGrey500 hover:text-tossGrey800'
                                }`}
                            >
                                이높플레이스
                            </button>
                        </div>
                    )}
                </div>
            </div>



            {/* Info Dropdown */}
            <AnimatePresence>
                {showInfoModal && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mb-3 p-3 bg-tossBlue/5 border border-tossBlue/10 rounded-toss-md text-[11.5px] text-tossGrey800 flex items-start gap-2"
                    >
                        <Info size={15} className="text-tossBlue shrink-0 mt-0.5" />
                        <div className="leading-relaxed">
                            <p className="font-bold text-tossGrey900 mb-0.5">매일 자정(00:00 KST) 자동 리셋</p>
                            <p className="text-tossGrey600">
                                오늘 주고받은 대화는 매일 자정에 새롭게 시작됩니다. 비속어는 자동 마스킹 처리되며 3회 이상 신고 수집 시 자동 숨김 처리됩니다.
                            </p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Profanity Warning Toast */}
            <AnimatePresence>
                {profanityDetected && (
                    <motion.div
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        className="mb-3 p-2 px-3 bg-amber-50 border border-amber-200 rounded-toss-md text-[11px] text-amber-800 flex items-center gap-1.5 font-medium"
                    >
                        <AlertTriangle size={14} className="text-amber-500 shrink-0" />
                        <span>부적절한 단어가 포함되어 <strong className="font-bold text-amber-900">***</strong> 로 자동 마스킹 되었습니다.</span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Report Success Toast */}
            <AnimatePresence>
                {reportSuccessToast && (
                    <motion.div
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        className="mb-3 p-2 px-3 bg-emerald-50 border border-emerald-200 rounded-toss-md text-[11px] text-emerald-800 flex items-center gap-1.5 font-medium"
                    >
                        <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                        <span>신고가 접수되었습니다. (3회 수집 시 자동 숨김)</span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Messages Area (Compact & Optimized Scrollable Box) */}
            <div
                ref={messagesContainerRef}
                onScroll={handleScroll}
                className={`${isStandalone ? 'flex-1 overflow-y-auto overflow-x-hidden px-8 py-4' : 'h-56 overflow-y-auto overflow-x-hidden px-1'} space-y-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden border-b-0`}
            >
                {loading ? (
                    <div className="h-full flex items-center justify-center text-xs text-tossGrey400">
                        채팅을 불러오는 중...
                    </div>
                ) : messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-4 text-tossGrey400">
                        <MessageCircle size={28} className="mb-1.5 text-tossGrey300" />
                        <p className="text-xs font-bold text-tossGrey600">오늘 첫 메시지를 남겨보세요! ✨</p>
                        <p className="text-[11px] text-tossGrey400 mt-0.5">친구들과 자유롭게 이야기를 공유할 수 있습니다.</p>
                    </div>
                ) : (
                    messages.map((msg, idx) => {
                        const isMe = currentUser?.id === msg.user_id;
                        const isStaffOrMaster = msg.user_role === '스처쌤' || msg.user_role === '마스터' || msg.user_role === '선생님';
                        const badgeText = isStaffOrMaster ? '스처쌤' : null;
                        const canManageMessage = isAdminOrStaff || isMe;

                        const formatMinute = (dateStr) => new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        const currentTime = formatMinute(msg.created_at);

                        const prevMsg = messages[idx - 1];
                        const nextMsg = messages[idx + 1];

                        const isSameUserPrev = prevMsg && prevMsg.user_id === msg.user_id;
                        const isSameTimePrev = prevMsg && formatMinute(prevMsg.created_at) === currentTime;
                        const isGroupedWithPrev = isSameUserPrev && isSameTimePrev;

                        const isSameUserNext = nextMsg && nextMsg.user_id === msg.user_id;
                        const isSameTimeNext = nextMsg && formatMinute(nextMsg.created_at) === currentTime;
                        const isGroupedWithNext = isSameUserNext && isSameTimeNext;

                        const renderBubble = (m) => {
                            if (m.is_hidden) {
                                if (canManageMessage) {
                                    return (
                                        <div className="py-1.5 px-3 rounded-xl text-[12px] leading-snug bg-red-50 text-red-900 border border-red-200 flex flex-col gap-0.5 shrink-0">
                                            <div className="flex items-center gap-1 text-[9.5px] font-bold text-red-600">
                                                <Shield size={11} />
                                                <span>[숨김 메시지]</span>
                                            </div>
                                            {m.message && <p className="line-through text-red-700/80">{m.message}</p>}
                                        </div>
                                    );
                                } else {
                                    return (
                                        <div className="py-1.5 px-3 rounded-xl bg-tossGrey100 border border-tossGrey200/60 text-tossGrey400 italic text-[11.5px] flex items-center gap-1 shrink-0">
                                            <Shield size={12} className="text-tossGrey400" />
                                            <span>숨겨진 메시지입니다.</span>
                                        </div>
                                    );
                                }
                            }

                        const renderFormattedMessageText = (msgText) => {
                            if (!msgText) return null;
                            const mentionRegex = /(@[가-힣a-zA-Z0-9_]+)/g;
                            const parts = msgText.split(mentionRegex);

                            return parts.map((part, index) => {
                                if (part.match(/^@[가-힣a-zA-Z0-9_]+$/)) {
                                    const isMentioningMe = currentUser?.name && part === `@${currentUser.name}`;
                                    return (
                                        <span
                                            key={index}
                                            className={`font-bold ${
                                                isMentioningMe
                                                    ? 'text-amber-400 font-extrabold underline'
                                                    : isMe
                                                        ? 'text-blue-100 font-extrabold'
                                                        : 'text-tossBlue font-extrabold'
                                            }`}
                                        >
                                            {part}
                                        </span>
                                    );
                                }
                                return part;
                            });
                        };

                        return (
                            <div
                                className={`p-1 rounded-2xl text-[12px] leading-relaxed break-words font-medium shrink-0 max-w-full flex flex-col gap-1 ${
                                    isStaffOrMaster
                                        ? isMe
                                            ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-br-2xs shadow-toss-subtle'
                                            : 'bg-indigo-50/90 text-indigo-950 rounded-bl-2xs border border-indigo-200/80 shadow-2xs'
                                        : isMe
                                            ? 'bg-tossBlue text-white rounded-br-2xs shadow-2xs'
                                            : 'bg-tossGrey100 text-tossGrey800 rounded-bl-2xs border border-tossGrey200/50 shadow-2xs'
                                }`}
                            >
                                {m.image_url && (
                                    <img
                                        src={m.image_url}
                                        alt="첨부 이미지"
                                        className={`${isStandalone ? 'max-w-[320px] sm:max-w-[440px] max-h-[380px] rounded-2xl' : 'max-w-[200px] sm:max-w-[240px] max-h-[200px] rounded-xl'} object-cover border border-black/10 cursor-pointer hover:opacity-95 transition shadow-sm my-1`}
                                        onClick={() => setEnlargedImageUrl(m.image_url)}
                                    />
                                )}
                                {m.message && (
                                    <div className={`px-3 py-1 whitespace-pre-wrap break-words ${isStandalone ? 'text-lg sm:text-xl font-medium leading-relaxed tracking-normal' : 'text-[13.5px] font-semibold leading-relaxed'}`}>
                                        {renderFormattedMessageText(m.message)}
                                    </div>
                                )}
                            </div>
                        );
                        };

                        const renderReactions = (m) => {
                            if (m.is_hidden) return null;
                            const reactionsObj = m.reactions || {};
                            const entries = Object.entries(reactionsObj).filter(([_, list]) => Array.isArray(list) && list.length > 0);
                            if (entries.length === 0) return null;

                            return (
                                <div className={`flex flex-wrap gap-1 mt-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
                                    {entries.map(([emoji, rawList]) => {
                                        const userList = rawList.map(item => {
                                            if (typeof item === 'string') {
                                                if (item === currentUser?.id) return { id: item, name: currentUser.name || '이용자' };
                                                if (item === m.user_id) return { id: item, name: m.user_name };
                                                return { id: item, name: '이용자' };
                                            }
                                            return item;
                                        });
                                        const hasReacted = currentUser?.id && userList.some(u => u.id === currentUser.id);
                                        const names = userList.map(u => u.name || '익명');

                                        return (
                                            <button
                                                key={emoji}
                                                type="button"
                                                onMouseDown={() => handleReactionPressStart(m, emoji)}
                                                onMouseUp={() => handleReactionPressEnd(m.id, emoji)}
                                                onMouseLeave={handleReactionPressCancel}
                                                onTouchStart={() => handleReactionPressStart(m, emoji)}
                                                onTouchEnd={() => handleReactionPressEnd(m.id, emoji)}
                                                onTouchCancel={handleReactionPressCancel}
                                                onContextMenu={(e) => {
                                                    e.preventDefault();
                                                    setReactionDetailMsg(m);
                                                    setActiveReactionTab(emoji);
                                                }}
                                                onDragStart={(e) => e.preventDefault()}
                                                draggable={false}
                                                style={{
                                                    WebkitUserSelect: 'none',
                                                    userSelect: 'none',
                                                    WebkitTouchCallout: 'none'
                                                }}
                                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold transition border relative group/reaction select-none active:scale-95 ${
                                                    hasReacted
                                                        ? 'bg-tossBlue/10 border-tossBlue/40 text-tossBlue font-bold shadow-2xs'
                                                        : 'bg-white border-tossGrey200 text-tossGrey700 hover:bg-tossGrey100 shadow-2xs'
                                                }`}
                                                title={`${names.join(', ')} 님이 ${emoji} 반응을 남겼습니다 (길게 눌러 전체 확인)`}
                                            >
                                                <span className="select-none pointer-events-none">{emoji}</span>
                                                <span className="text-[10px] text-tossGrey600 select-none pointer-events-none">{userList.length}</span>

                                                {/* Desktop Hover Tooltip & Click to Details */}
                                                <div
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setReactionDetailMsg(m);
                                                        setActiveReactionTab(emoji);
                                                    }}
                                                    className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 hidden group-hover/reaction:flex flex-col items-center z-30 whitespace-nowrap cursor-pointer"
                                                >
                                                    <div className="bg-gray-900/90 text-white text-[10px] px-2.5 py-1 rounded-lg font-medium shadow-md flex items-center gap-1">
                                                        <span>{names.join(', ')}</span>
                                                        <span className="text-gray-400 text-[9px]">(상세보기)</span>
                                                    </div>
                                                    <div className="w-1.5 h-1.5 bg-gray-900/90 rotate-45 -mt-0.5"></div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            );
                        };

                        const renderActionButtons = (m) => (
                            <div className="flex items-center gap-0.5 bg-white/95 backdrop-blur-2xs shadow-toss-subtle border border-tossGrey200 rounded-md p-0.5 relative">
                                {/* Reaction Picker Trigger Button */}
                                {!m.is_hidden && (
                                    <button
                                        type="button"
                                        onClick={() => setExtendedReactionMsgId(m.id)}
                                        className="p-0.5 rounded transition text-tossGrey400 hover:text-tossBlue hover:bg-tossGrey100"
                                        title="반응 남기기"
                                    >
                                        <Smile size={12} />
                                    </button>
                                )}

                                {canManageMessage && (
                                    <>
                                        <button
                                            onClick={() => toggleHideMessageAdmin(m.id, m.is_hidden)}
                                            className="p-0.5 text-tossGrey400 hover:text-amber-600 rounded hover:bg-tossGrey100 transition"
                                            title={m.is_hidden ? "숨김 해제" : "숨기기"}
                                        >
                                            {m.is_hidden ? <Eye size={12} /> : <EyeOff size={12} />}
                                        </button>
                                        <button
                                            onClick={() => setDeletingMsgId(m.id)}
                                            className="p-0.5 text-tossGrey400 hover:text-tossError rounded hover:bg-tossGrey100 transition"
                                            title="삭제"
                                        >
                                            <Trash2 size={12} />
                                        </button>
                                    </>
                                )}

                                {!canManageMessage && (
                                    <button
                                        onClick={() => setReportingMsgId(m.id)}
                                        className="p-0.5 text-tossGrey400 hover:text-amber-600 rounded hover:bg-tossGrey100 transition"
                                        title="신고하기"
                                    >
                                        <Flag size={12} />
                                    </button>
                                )}
                            </div>
                        );

                        return (
                            <div
                                key={msg.id}
                                className={`flex w-full ${isMe ? 'justify-end' : 'justify-start'} ${isGroupedWithPrev ? 'mt-1' : 'mt-2.5'}`}
                            >
                                {/* OTHERS MESSAGE (Left Aligned) */}
                                {!isMe && (
                                    <div className={`flex gap-2 items-start ${isStandalone ? 'max-w-[92%]' : 'max-w-[82%]'}`}>
                                        {/* Avatar (only on first of grouped block) */}
                                        {!isGroupedWithPrev ? (
                                            <div className={`${isStandalone ? 'w-9 h-9 text-xs' : 'w-7 h-7 text-[11px]'} rounded-full bg-tossGrey100 border border-tossGrey200/60 flex items-center justify-center font-bold text-tossGrey600 shrink-0 overflow-hidden shadow-2xs mt-0.5`}>
                                                {msg.user_avatar ? (
                                                    <img src={msg.user_avatar} alt={msg.user_name} className="w-full h-full object-cover" />
                                                ) : (
                                                    (msg.user_name?.[0] || '익')
                                                )}
                                            </div>
                                        ) : (
                                            <div className={isStandalone ? 'w-9 h-9 shrink-0' : 'w-7 h-7 shrink-0'} />
                                        )}

                                        <div className="flex flex-col items-start max-w-full">
                                            {/* Header: Name (only on first of grouped block) */}
                                            {!isGroupedWithPrev && (
                                                <div className="flex items-center gap-1 mb-1 px-0.5">
                                                    <span className={`${isStandalone ? 'text-xs sm:text-sm font-black' : 'text-[10.5px] font-bold'} text-tossGrey700`}>{msg.user_name}</span>
                                                </div>
                                            )}

                                            {/* Bubble & Timestamp Row */}
                                            <div className="relative group flex items-end gap-1.5 max-w-full">
                                                {renderBubble(msg)}
                                                {!isGroupedWithNext && (
                                                    <span className={`${isStandalone ? 'text-xs font-semibold' : 'text-[9.5px]'} text-tossGrey400 shrink-0 pb-0.5 whitespace-nowrap`}>
                                                        {currentTime}
                                                    </span>
                                                )}
                                                {/* Floating Action Buttons */}
                                                <div className={`absolute left-full top-1/2 -translate-y-1/2 pl-1.5 transition-opacity duration-150 z-20 ${
                                                    activeReactionPickerId === msg.id
                                                        ? 'opacity-100 pointer-events-auto'
                                                        : 'opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto'
                                                }`}>
                                                    {renderActionButtons(msg)}
                                                </div>
                                            </div>
                                            {/* Reactions below bubble */}
                                            {renderReactions(msg)}
                                        </div>
                                    </div>
                                )}

                                {/* MY MESSAGE (Right Aligned) */}
                                {isMe && (
                                    <div className={`flex flex-col items-end ${isStandalone ? 'max-w-[92%]' : 'max-w-[82%]'}`}>
                                        <div className="relative group flex items-end gap-1.5 max-w-full justify-end">
                                            {/* Floating Action Buttons */}
                                            <div className={`absolute right-full top-1/2 -translate-y-1/2 pr-1.5 transition-opacity duration-150 z-20 ${
                                                activeReactionPickerId === msg.id
                                                    ? 'opacity-100 pointer-events-auto'
                                                    : 'opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto'
                                            }`}>
                                                {renderActionButtons(msg)}
                                            </div>
                                            {/* Timestamp on LEFT of bubble (ONLY on last message of minute group) */}
                                            {!isGroupedWithNext && (
                                                <span className="text-[9.5px] text-tossGrey400 shrink-0 pb-0.5 whitespace-nowrap">
                                                    {currentTime}
                                                </span>
                                            )}
                                            {/* Bubble */}
                                            {renderBubble(msg)}
                                        </div>
                                        {/* Reactions below bubble */}
                                        {renderReactions(msg)}
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}

                {/* Typing Indicator Bubble */}
                {typingUsers && typingUsers.length > 0 && (
                    <div className="flex items-center gap-2 mt-2 mb-1 px-1 transition-all duration-300 animate-fade-in">
                        <div className="w-7 h-7 rounded-full bg-tossGrey100 border border-tossGrey200 flex items-center justify-center font-bold text-[11px] text-tossGrey600 shrink-0 overflow-hidden shadow-2xs">
                            {typingUsers[0].avatar ? (
                                <img src={typingUsers[0].avatar} alt={typingUsers[0].name} className="w-full h-full object-cover" />
                            ) : (
                                typingUsers[0].name?.[0] || '익'
                            )}
                        </div>

                        <div className="bg-tossGrey100 text-tossGrey700 border border-tossGrey200/80 rounded-2xl rounded-tl-xs px-3.5 py-2 flex items-center gap-2 shadow-2xs">
                            <span className="text-[11.5px] font-bold text-tossGrey700">
                                {typingUsers.length === 1
                                    ? `${typingUsers[0].name} 님이 입력 중`
                                    : `${typingUsers[0].name} 외 ${typingUsers.length - 1}명이 입력 중`}
                            </span>
                            <div className="flex items-center gap-1 pl-0.5">
                                <span className="w-1.5 h-1.5 bg-tossBlue rounded-full animate-bounce [animation-delay:-0.32s]" />
                                <span className="w-1.5 h-1.5 bg-tossBlue rounded-full animate-bounce [animation-delay:-0.16s]" />
                                <span className="w-1.5 h-1.5 bg-tossBlue rounded-full animate-bounce" />
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Standalone Bottom QR Banner - 3-Row Flex Block (Zero Overlap Guaranteed) */}
            {isStandalone && (
                <footer className="shrink-0 bg-[#F8F9FA] border-t-2 border-tossGrey200 px-8 py-5 flex items-center justify-between shadow-md z-20">
                    <div className="flex items-center gap-16 sm:gap-20">
                        {/* QR Code Container */}
                        <div className="w-24 h-24 sm:w-28 sm:h-28 bg-white p-2 rounded-2xl border-2 border-tossGrey200 shadow-md shrink-0 flex items-center justify-center overflow-hidden">
                            <img
                                src="https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=https://app.schoolchurchimpact.org"
                                alt="App QR Code"
                                className="w-full h-full object-contain"
                            />
                        </div>
                        {/* Text Content with Generous 20px+ Gap */}
                        <div className="flex flex-col justify-center space-y-1.5 ml-4 sm:ml-8">
                            <div className="flex items-center gap-4">
                                <span className="font-black text-2xl sm:text-3xl text-tossGrey900 tracking-tight">
                                    HAIFN APP에 접속해보세요!
                                </span>
                                <span className="px-3.5 py-1 rounded-full bg-tossBlue text-white text-xs sm:text-sm font-black shadow-2xs shrink-0">
                                    실시간 대화 참여
                                </span>
                            </div>
                            <p className="text-sm sm:text-base text-tossGrey600 font-bold leading-relaxed">
                                스마트폰 카메라로 QR 코드를 스캔하거나 <strong className="font-black text-tossBlue underline ml-1">app.schoolchurchimpact.org</strong> 로 접속하세요 ✨
                            </p>
                        </div>
                    </div>
                </footer>
            )}

            {/* Input Form with Image Upload & Mention Popover Support - Hidden on Standalone Viewer Mode */}
            {!isStandalone && (
                <>
                    {imagePreview && (
                        <div className="mt-2.5 relative inline-block">
                            <div className="w-16 h-16 rounded-xl overflow-hidden border-2 border-tossBlue shadow-sm relative group">
                                <img src={imagePreview} alt="선택 이미지" className="w-full h-full object-cover" />
                                <button
                                    type="button"
                                    onClick={removeSelectedImage}
                                    className="absolute top-0.5 right-0.5 bg-black/70 text-white p-1 rounded-full hover:bg-black transition"
                                    title="이미지 제거"
                                >
                                    <X size={10} />
                                </button>
                            </div>
                        </div>
                    )}
                    <form onSubmit={handleSend} className="mt-2.5 flex items-center gap-1.5 relative">
                        {/* Mention (@) User Autocomplete Popover (Floating above form with z-[999]) */}
                        {showMentionPopover && (
                            <div className="absolute bottom-full left-0 right-0 mb-2 bg-white border border-tossGrey300 rounded-2xl shadow-2xl p-2.5 z-[999] max-h-56 overflow-y-auto">
                                <div className="text-[11px] font-bold text-tossGrey600 px-2 py-1 flex items-center justify-between border-b border-tossGrey100 mb-1.5">
                                    <span>친구/스처쌤 언급하기 (@{mentionSearchQuery})</span>
                                    <button
                                        type="button"
                                        onClick={() => setShowMentionPopover(false)}
                                        className="text-tossGrey400 hover:text-tossGrey600 p-0.5"
                                    >
                                        <X size={13} />
                                    </button>
                                </div>
                                {filteredMentionUsers.length === 0 ? (
                                    <div className="py-3 text-center text-tossGrey400 text-xs font-medium">
                                        해당 이름의 이용자가 없습니다.
                                    </div>
                                ) : (
                                    filteredMentionUsers.map(u => (
                                        <button
                                            key={u.id}
                                            type="button"
                                            onMouseDown={(e) => e.preventDefault()}
                                            onClick={(e) => selectMentionUser(e, u)}
                                            className="w-full flex items-center gap-2.5 p-2 rounded-xl hover:bg-tossBlue/10 active:bg-tossBlue/20 transition text-left group"
                                        >
                                            <div className="w-7 h-7 rounded-full bg-tossBlue/10 border border-tossBlue/20 flex items-center justify-center font-bold text-xs text-tossBlue shrink-0 overflow-hidden">
                                                {u.profile_image_url ? (
                                                    <img src={u.profile_image_url} alt={u.name} className="w-full h-full object-cover" />
                                                ) : (
                                                    u.name?.[0] || '익'
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="font-bold text-xs text-tossGrey900 truncate group-hover:text-tossBlue">{u.name}</span>
                                                    {(u.role === 'admin' || u.user_group === 'STAFF' || u.role === 'staff') && (
                                                        <span className="px-1.5 py-0.2 bg-tossBlue/10 text-tossBlue text-[9px] font-bold rounded">스처쌤</span>
                                                    )}
                                                </div>
                                                {u.school && <div className="text-[10px] text-tossGrey500 truncate">{u.school}</div>}
                                            </div>
                                        </button>
                                    ))
                                )}
                            </div>
                        )}

                        <input
                            type="file"
                            ref={fileInputRef}
                            accept="image/*"
                            className="hidden"
                            onChange={handleImageSelect}
                        />
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploadingImage}
                            className="p-2 text-tossGrey500 hover:text-tossBlue bg-tossGrey100 hover:bg-tossBlue/10 rounded-xl transition shrink-0 disabled:opacity-40"
                            title="사진 첨부"
                        >
                            <ImageIcon size={18} />
                        </button>
                        <input
                            type="text"
                            value={inputMessage}
                            onChange={handleInputChange}
                            placeholder={`${activeCenter} 친구들에게 메시지 보내기 (@이름 언급 가능)`}
                            className="flex-1 bg-tossGrey100 border border-tossGrey200/60 rounded-xl px-3.5 py-2 text-[12px] text-tossGrey900 placeholder-tossGrey400 outline-none focus:bg-white focus:border-tossBlue focus:ring-1 focus:ring-tossBlue transition font-medium"
                        />
                        <button
                            type="submit"
                            disabled={(!inputMessage.trim() && !selectedImage) || uploadingImage}
                            className="bg-tossBlue text-white p-2 px-3 rounded-xl hover:bg-tossBlue/90 disabled:opacity-30 transition shadow-toss-subtle active:scale-95 flex items-center justify-center shrink-0"
                        >
                            {uploadingImage ? (
                                <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                            ) : (
                                <Send size={15} />
                            )}
                        </button>
                    </form>
                </>
            )}

            {/* Report Confirmation Modal */}
            {reportingMsgId && createPortal(
                <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/50 backdrop-blur-2xs">
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        className="bg-white rounded-toss-xl p-5 max-w-xs w-full shadow-toss-standard text-center border border-tossGrey100"
                    >
                        <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mx-auto mb-2">
                            <Flag size={20} />
                        </div>
                        <h4 className="font-bold text-tossGrey900 text-sm mb-1">메시지 신고</h4>
                        <p className="text-xs text-tossGrey500 mb-4 leading-relaxed">
                            유해 메시지로 신고하시겠습니까?<br />
                            (3회 수집 시 자동 숨김)
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setReportingMsgId(null)}
                                className="flex-1 py-2 bg-tossGrey100 hover:bg-tossGrey200 rounded-xl text-xs font-bold text-tossGrey600 transition"
                            >
                                취소
                            </button>
                            <button
                                onClick={handleReportConfirm}
                                className="flex-1 py-2 bg-amber-500 hover:bg-amber-600 rounded-xl text-xs font-bold text-white shadow-sm transition"
                            >
                                신고하기
                            </button>
                        </div>
                    </motion.div>
                </div>,
                document.body
            )}

            {/* Delete Single Message Confirmation Modal */}
            {deletingMsgId && createPortal(
                <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/50 backdrop-blur-2xs">
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        className="bg-white rounded-toss-xl p-5 max-w-xs w-full shadow-toss-standard text-center border border-tossGrey100"
                    >
                        <div className="w-10 h-10 rounded-full bg-tossError/10 text-tossError flex items-center justify-center mx-auto mb-2">
                            <Trash2 size={20} />
                        </div>
                        <h4 className="font-bold text-tossGrey900 text-sm mb-1">메시지 삭제</h4>
                        <p className="text-xs text-tossGrey500 mb-4 leading-relaxed">
                            해당 메시지를 완전히 삭제하시겠습니까?
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setDeletingMsgId(null)}
                                className="flex-1 py-2 bg-tossGrey100 hover:bg-tossGrey200 rounded-xl text-xs font-bold text-tossGrey600 transition"
                            >
                                취소
                            </button>
                            <button
                                onClick={handleDeleteConfirm}
                                className="flex-1 py-2 bg-tossError hover:bg-tossError/90 rounded-xl text-xs font-bold text-white shadow-sm transition"
                            >
                                삭제하기
                            </button>
                        </div>
                    </motion.div>
                </div>,
                document.body
            )}

            {/* Clear Entire Center Chat Confirmation Modal */}
            {showClearConfirmModal && createPortal(
                <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/50 backdrop-blur-2xs">
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        className="bg-white rounded-toss-xl p-5 max-w-xs w-full shadow-toss-standard text-center border border-tossGrey100"
                    >
                        <div className="w-10 h-10 rounded-full bg-tossError/10 text-tossError flex items-center justify-center mx-auto mb-2">
                            <RotateCcw size={20} />
                        </div>
                        <h4 className="font-bold text-tossGrey900 text-sm mb-1">센터 대화 전체 초기화</h4>
                        <p className="text-xs text-tossGrey500 mb-4 leading-relaxed">
                            정말로 <strong className="text-tossGrey900">[{activeCenter}]</strong>의 오늘 전체 대화를 초기화(삭제)하시겠습니까?
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setShowClearConfirmModal(false)}
                                className="flex-1 py-2 bg-tossGrey100 hover:bg-tossGrey200 rounded-xl text-xs font-bold text-tossGrey600 transition"
                            >
                                취소
                            </button>
                            <button
                                onClick={handleClearConfirm}
                                className="flex-1 py-2 bg-tossError hover:bg-tossError/90 rounded-xl text-xs font-bold text-white shadow-sm transition"
                            >
                                초기화하기
                            </button>
                        </div>
                    </motion.div>
                </div>,
                document.body
            )}

            {/* Enlarged Image Modal */}
            {enlargedImageUrl && createPortal(
                <div
                    className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs"
                    onClick={() => setEnlargedImageUrl(null)}
                >
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        className="relative max-w-2xl w-full max-h-[85vh] flex items-center justify-center"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <img
                            src={enlargedImageUrl}
                            alt="원본 이미지"
                            className="max-w-full max-h-[80vh] rounded-2xl object-contain shadow-2xl"
                        />
                        <button
                            onClick={() => setEnlargedImageUrl(null)}
                            className="absolute -top-3 -right-3 bg-black/60 hover:bg-black text-white p-2 rounded-full backdrop-blur-md transition shadow-md"
                        >
                            <X size={18} />
                        </button>
                    </motion.div>
                </div>,
                document.body
            )}

            {/* Unified Emoji Reaction Details Modal (Slack/Discord Style Tabbed Modal) */}
            {reactionDetailMsg && (() => {
                const reactionsObj = reactionDetailMsg.reactions || {};
                const entries = Object.entries(reactionsObj).filter(([_, list]) => Array.isArray(list) && list.length > 0);

                const allItems = [];
                entries.forEach(([emoji, rawList]) => {
                    rawList.forEach(item => {
                        let uObj = typeof item === 'object' ? item : { id: item, name: '이용자' };
                        if (uObj.id === currentUser?.id && currentUser?.name) {
                            uObj = { ...uObj, name: currentUser.name };
                        } else if (uObj.id === reactionDetailMsg.user_id && reactionDetailMsg.user_name) {
                            uObj = { ...uObj, name: reactionDetailMsg.user_name };
                        }
                        allItems.push({ emoji, user: uObj });
                    });
                });

                return createPortal(
                    <div
                        className="fixed inset-0 z-[300] bg-black/50 backdrop-blur-2xs flex items-end sm:items-center justify-center p-0 sm:p-4 select-none"
                        style={{
                            WebkitUserSelect: 'none',
                            userSelect: 'none',
                            WebkitTouchCallout: 'none'
                        }}
                        onDragStart={(e) => e.preventDefault()}
                        draggable={false}
                        onClick={() => {
                            if (ignoreReactionBackdropClickRef.current) return;
                            setReactionDetailMsg(null);
                        }}
                    >
                        <motion.div
                            initial={{ opacity: 0, y: 80 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 80 }}
                            transition={{ duration: 0.2 }}
                            className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl p-4 sm:p-5 w-full max-w-sm border border-tossGrey200 flex flex-col max-h-[80vh] select-none"
                            style={{
                                WebkitUserSelect: 'none',
                                userSelect: 'none',
                                WebkitTouchCallout: 'none'
                            }}
                            onDragStart={(e) => e.preventDefault()}
                            draggable={false}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Drag Handle */}
                            <div className="w-10 h-1 bg-tossGrey300 rounded-full mx-auto mb-3 shrink-0" />

                            {/* Header Filter Tabs */}
                            <div className="flex items-center gap-4 overflow-x-auto border-b border-tossGrey100 pb-2 mb-3 [scrollbar-width:none] shrink-0 text-xs font-bold text-left select-none">
                                <button
                                    type="button"
                                    onClick={() => setActiveReactionTab('ALL')}
                                    className={`pb-1.5 whitespace-nowrap transition-all border-b-2 select-none ${
                                        activeReactionTab === 'ALL'
                                            ? 'text-tossGrey900 font-extrabold border-emerald-600'
                                            : 'text-tossGrey400 hover:text-tossGrey700 border-transparent'
                                    }`}
                                >
                                    모두
                                </button>
                                {entries.map(([emoji, rawList]) => (
                                    <button
                                        key={emoji}
                                        type="button"
                                        onClick={() => setActiveReactionTab(emoji)}
                                        className={`pb-1.5 whitespace-nowrap flex items-center gap-1 transition-all border-b-2 select-none ${
                                            activeReactionTab === emoji
                                                ? 'text-tossGrey900 font-extrabold border-emerald-600'
                                                : 'text-tossGrey400 hover:text-tossGrey700 border-transparent'
                                        }`}
                                    >
                                        <span className="text-sm leading-none select-none pointer-events-none">{emoji}</span>
                                        <span className="select-none pointer-events-none">{rawList.length}</span>
                                    </button>
                                ))}
                            </div>

                            {/* Reacted User List Grouped by Emoji */}
                            <div className="flex-1 overflow-y-auto space-y-4 pr-1 text-left [scrollbar-width:thin] select-none">
                                {entries
                                    .filter(([emoji]) => activeReactionTab === 'ALL' || activeReactionTab === emoji)
                                    .map(([emoji, userList]) => {
                                        const formattedUsers = userList.map(item => {
                                            let uObj = typeof item === 'object' ? item : { id: item, name: '이용자', school: '' };
                                            if (uObj.id === currentUser?.id) {
                                                uObj = { 
                                                    ...uObj, 
                                                    name: currentUser.name || uObj.name, 
                                                    school: currentUser.school || currentUser.user_group || currentUser.school_name || uObj.school || '' 
                                                };
                                            } else if (uObj.id === reactionDetailMsg.user_id && reactionDetailMsg.user_name) {
                                                uObj = { 
                                                    ...uObj, 
                                                    name: reactionDetailMsg.user_name, 
                                                    school: reactionDetailMsg.user_school || uObj.school || '' 
                                                };
                                            }
                                            if (!uObj.school && allCandidateUsers) {
                                                const found = allCandidateUsers.find(c => c.id === uObj.id);
                                                if (found) {
                                                    uObj = { ...uObj, school: found.school || found.user_group || found.school_name || '' };
                                                }
                                            }
                                            const nameStr = uObj.name || '익명';
                                            const schoolStr = uObj.school ? ` (${uObj.school})` : '';
                                            return `${nameStr}${schoolStr}`;
                                        }).join(', ');

                                        return (
                                            <div key={emoji} className="flex items-start gap-3 py-1 select-none">
                                                <span className="text-2xl leading-none shrink-0 pt-0.5 select-none pointer-events-none">{emoji}</span>
                                                <div className="flex flex-col text-xs leading-relaxed text-tossGrey700 font-semibold break-words pt-1 select-none pointer-events-none">
                                                    <span className="select-none pointer-events-none">{formattedUsers || '사용자 정보 없음'}</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                            </div>

                            {/* Close Button */}
                            <button
                                type="button"
                                onClick={() => setReactionDetailMsg(null)}
                                className="mt-4 w-full py-2.5 rounded-2xl bg-tossGrey100 hover:bg-tossGrey200 text-tossGrey700 text-xs font-bold transition active:scale-98 shrink-0 select-none"
                            >
                                닫기
                            </button>
                        </motion.div>
                    </div>,
                    document.body
                );
            })()}

            {/* Extended Emoji Category Modal Overlay (Card-Level, 100% visible with zero clipping) */}
            <AnimatePresence>
                {extendedReactionMsgId && createPortal(
                    <div 
                        className="fixed inset-0 bg-black/50 backdrop-blur-2xs z-[300] flex items-center justify-center p-3"
                        onClick={() => setExtendedReactionMsgId(null)}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-white rounded-2xl shadow-2xl p-4 w-full max-w-xs border border-tossGrey200 flex flex-col max-h-[90%]"
                        >
                            <div className="flex items-center justify-between pb-2 border-b border-tossGrey100 mb-2">
                                <span className="font-bold text-xs text-tossGrey900">이모지 반응 전체 선택</span>
                                <button
                                    type="button"
                                    onClick={() => setExtendedReactionMsgId(null)}
                                    className="text-tossGrey400 hover:text-tossGrey600 p-1 rounded-full hover:bg-tossGrey100"
                                >
                                    <X size={14} />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-left [scrollbar-width:thin]">
                                {EMOJI_CATEGORIES.map(cat => (
                                    <div key={cat.name}>
                                        <div className="text-[10px] font-bold text-tossGrey500 mb-1 px-0.5">{cat.name}</div>
                                        <div className="grid grid-cols-5 gap-1.5">
                                            {cat.emojis.map(emoji => (
                                                <button
                                                    key={emoji}
                                                    type="button"
                                                    onClick={() => {
                                                        toggleReaction(extendedReactionMsgId, emoji);
                                                        setExtendedReactionMsgId(null);
                                                    }}
                                                    className="hover:scale-125 transition-transform text-lg p-1.5 hover:bg-tossBlue/10 rounded-xl flex items-center justify-center"
                                                >
                                                    {emoji}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <form
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    if (customEmojiInput.trim()) {
                                        toggleReaction(extendedReactionMsgId, customEmojiInput.trim());
                                        setCustomEmojiInput('');
                                        setExtendedReactionMsgId(null);
                                    }
                                }}
                                className="pt-2 border-t border-tossGrey100 flex items-center gap-1.5 mt-2 shrink-0"
                            >
                                <input
                                    type="text"
                                    placeholder="이모지 직접 입력 (예: 🐱)"
                                    value={customEmojiInput}
                                    onChange={(e) => setCustomEmojiInput(e.target.value)}
                                    className="flex-1 text-xs px-2.5 py-1.5 border border-tossGrey200 rounded-xl focus:outline-none focus:border-tossBlue font-normal"
                                />
                                <button
                                    type="submit"
                                    disabled={!customEmojiInput.trim()}
                                    className="text-xs font-bold px-3 py-1.5 bg-tossBlue text-white rounded-xl hover:bg-blue-600 disabled:opacity-40 transition shrink-0"
                                >
                                    추가
                                </button>
                            </form>
                        </motion.div>
                    </div>,
                    document.body
                )}
            </AnimatePresence>
        </div>
    );
};

export default LiveCenterChat;
