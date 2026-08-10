import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { SmilePlus, X, Search, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const EMOJI_CATEGORIES = [
    {
        id: 'popular',
        name: '주요 반응',
        icon: '👍',
        emojis: ['👍', '❤️', '🔥', '😂', '🎉', '👏', '😮', '😢', '🙏', '💯', '👀', '✨', '🙌', '💪', '🚀', '⭐', '💕', '💖', '🥰', '😍']
    },
    {
        id: 'smileys',
        name: '표정 & 사람',
        icon: '😊',
        emojis: [
            '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚',
            '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '😣', '😖', '😫',
            '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔', '🤭',
            '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯', '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐', '🥴', '🤢',
            '🤮', '🤧', '😷', '🤒', '🤕', '🤑', '🤠', '😈', '👿', '👹', '👺', '🤡', '💩', '👻', '💀', '👽', '👾', '🤖', '🎃'
        ]
    },
    {
        id: 'hands',
        name: '손짓 & 신체',
        icon: '🖐️',
        emojis: [
            '👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍',
            '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💅', '🤳', '💪', '🦾', '👂', '🦻', '👃', '🧠',
            '🦷', '🦴', '👀', '👁️', '👅', '👄'
        ]
    },
    {
        id: 'animals',
        name: '동물 & 자연',
        icon: '🐱',
        emojis: [
            '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐽', '🐸', '🐵', '🙈', '🙉', '🙊', '🐒',
            '🐔', '🐧', '🐦', '🐤', '🐣', '🐥', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞', '🐜',
            '🕷️', '🦂', '🐢', '🐍', '🦎', '🐙', '🦑', '🦐', '🦀', '🐡', '🐠', '🐟', '🐬', '🐳', '🐋', '🦈', '🐊', '🐅', '🐆', '🎄',
            '🌲', '🌳', '🌴', '🌱', '🌿', '☘️', '🍀', '🎍', '🪴', '🍃', '🍂', '🍁', '🍄', '🐚', '🌾', '💐', '🌷', '🌹', '🥀', '🌺',
            '🌸', '🌼', '🌻', '🌞', '🌝', '🌜', '🌙', '🌎', '🌍', '🌏', '🪐', '💫', '⭐️', '🌟', '✨', '⚡️', '☄️', '💥', '🔥', '🌪️',
            '🌈', '☀️', '🌤️', '⛅️', '🌥️', '☁️', '🌦️', '🌧️', '⛈️', '🌩️', '🌨️', '❄️', '☃️', '⛄️', '🌬️', '💨', '💧', '💦', '☔️', '🌊'
        ]
    },
    {
        id: 'food',
        name: '음식 & 음료',
        icon: '🍔',
        emojis: [
            '🍏', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🥑', '🥦',
            '🥒', '🌶️', '🌽', '🥕', '🧄', '🧅', '🥔', '🍠', '🥐', '🥯', '🍞', '🥖', '🥨', '🧀', '🍳', '🧈', '🥞', '🧇', '🥓', '🥩',
            '🍗', '🍖', '🌭', '🍔', '🍟', '🍕', '🥪', '🥙', '🧆', '🌮', '🌯', '🥗', '🥘', '🥫', '🍝', '🍜', '🍲', '🍛', '🍣', '🍱',
            '🥟', '🦪', '🍤', '🍙', '🍚', '🍘', '🍥', '🍡', '🍧', '🍨', '🍦', '🥧', '🧁', '🍰', '🎂', '🍮', '🍭', '🍬', '🍫', '🍿',
            '🍩', '🍪', '🌰', '🥜', '🍯', '🥛', '☕️', '🍵', '🧃', '🥤', '🍶', '🍺', '🍻', '🥂', '🍷', '🥃', '🍸', '🍹', '🍾', '🧊'
        ]
    },
    {
        id: 'activities',
        name: '활동 & 스포츠',
        icon: '⚽',
        emojis: [
            '⚽️', '🏀', '🏈', '⚾️', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱', '🪀', '🏓', '🏸', '🏒', '🏹', '🎣', '🤿', '🥊', '🥋', '🛹',
            '🛼', '🛷', '⛸️', '🥌', '🎿', '⛷️', '🏂', '🏆', '🥇', '🥈', '🥉', '🏅', '🎖️', '🎗️', '🎫', '🎟️', '🎪', '🎭', '🎨', '🎬',
            '🎤', '🎧', '🎼', '🎵', '🎶', '🥁', '🎷', '🎺', '🎸', '🪕', '🎻', '🎲', '♟️', '🎯', '🎳', '🎮', '🎰', '🧩'
        ]
    },
    {
        id: 'travel',
        name: '여행 & 오락',
        icon: '✈️',
        emojis: [
            '🚗', '🚕', '🚙', '🚌', '🏎️', '🚓', '🚑', '🚒', '🚐', '🛻', '🚚', '🚛', '🚜', '🛵', '🏍️', '🚨', '🚔', '🚘', '🚖',
            '🚡', '🚠', '🚟', '🚃', '🚋', '🚝', '🚅', '🚆', '🚇', '🚉', '🛩️', '✈️', '🛫', '🛬', '🪂', '💺', '🚁', '🚀',
            '🛸', '🛶', '⛵️', '🚤', '🛥️', '🛳️', '⚓️', '⛽️', '🚧', '🚦', '🚥', '🚏', '🗺️', '🗿', '🗽', '🗼', '🏰', '🏯', '🏟️', '🎡',
            '🎢', '🎠', '⛲️', '⛱️', '🏖️', '🏝️', '🏜️', '🌋', '⛰️', '🏔️', '🏕️', '⛺️', '🏠', '🏡', '🏢', '🏣', '🏥', '🏦', '🏨', '🏪',
            '🏫', '🏬', '🏭', '💒', '🏛️', '⛪️', '🕌', '🕍', '🛕'
        ]
    },
    {
        id: 'objects',
        name: '물건 & 기호',
        icon: '💡',
        emojis: [
            '⌚️', '📱', '📲', '💻', '⌨️', '🖥️', '🖨️', '🖱️', '🕹️', '📷', '📸', '📹', '🎥', '📽️', '🎞️', '📞', '☎️', '📟', '📠', '📺',
            '📻', '🎙️', '🎚️', '🎛️', '🧭', '⏱️', '⏲️', '⏰', '🕰️', '⏳', '⌛️', '📡', '🔋', '🔌', '💡', '🔦', '🕯️', '🧯', '🗑️', '🛒',
            '💸', '💵', '💴', '💶', '💷', '🪙', '💰', '💳', '💎', '⚖️', '🧰', '🔧', '🔨', '⚒️', '🛠️', '⛏️', '⚙️', '🧱', '⛓️', '🧲',
            '💣', '🧨', '🔪', '🗡️', '⚔️', '🛡️', '🚬', '⚰️', '⚱️', '🏺', '🔮', '📿', '🧿', '🔬', '🔭', '💉', '🩸', '💊', '🩹', '🩺',
            '🚪', '🛏️', '🛋️', '🚽', '🚿', '🛁', '🪒', '🧴', '🧷', '🧹', '🧺', '🧻', '🧼', '🪣', '🧽', '🔑', '🗝️', '🔒', '🔓', '🔏',
            '🔐', '❤️', '🧡', '💛', '💚', '💙', '💜', '🤎', '🖤', '🤍', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟',
            '☮️', '✝️', '☪️', '🕉️', '☸️', '✡️', '🔯', '🕎', '☯️', '☦️', '🛐', '⛎', '♈️', '♉️', '♊️', '♋️', '♌️', '♎️', '♏️',
            '🏹', '♑️', '♒️', '♓️', '🆔', '⚛️', '☣️', '☢️', '❌', '⭕️', '🛑', '⛔️', '🚫', '💯', '💢', '♨️', '⚠️', '🚸', '🔰',
            '♻️', '✅', '❇️', '✳️', '❎', '🌐', '💠', '💤', '🏧', '🚾', '♿️', '🅿️', '🈳', '🚹', '🚺', '🚼', '🚻'
        ]
    }
];

export default function NoticeReactions({ reactions = [], currentUserId, onToggleReaction }) {
    const [showModal, setShowModal] = useState(false);
    const [detailEmoji, setDetailEmoji] = useState(null); // For "Who Reacted" Modal
    const [searchQuery, setSearchQuery] = useState('');
    const [activeCategory, setActiveCategory] = useState('popular');
    const scrollContainerRef = useRef(null);
    const categoryRefs = useRef({});

    // Long press refs
    const timerRef = useRef(null);
    const isLongPressRef = useRef(false);
    const ignoreBackdropClickRef = useRef(false);

    const safelyTypedReactions = Array.isArray(reactions) ? reactions : [];

    // Group by emoji and keep track of users
    const grouped = safelyTypedReactions.reduce((acc, r) => {
        if (!r.emoji) return acc;
        if (!acc[r.emoji]) acc[r.emoji] = { count: 0, hasMine: false, users: [] };
        acc[r.emoji].count += 1;
        if (r.user_id === currentUserId) acc[r.emoji].hasMine = true;
        if (r.users) acc[r.emoji].users.push(r.users);
        return acc;
    }, {});

    const handleEmojiClick = (emoji) => {
        if (onToggleReaction) {
            onToggleReaction(emoji);
        }
        setShowModal(false);
        setSearchQuery('');
    };

    // Long press handlers
    const handlePressStart = (emoji) => {
        isLongPressRef.current = false;
        timerRef.current = setTimeout(() => {
            isLongPressRef.current = true;
            ignoreBackdropClickRef.current = true;
            setDetailEmoji(emoji);
            setTimeout(() => {
                ignoreBackdropClickRef.current = false;
            }, 500);
        }, 400);
    };

    const handlePressEnd = (emoji) => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        if (!isLongPressRef.current) {
            handleEmojiClick(emoji);
        }
    };

    const handlePressCancel = () => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    };

    // Scrollspy handlers
    const isManualScrollingRef = useRef(false);

    const scrollToCategory = (catId) => {
        setActiveCategory(catId);
        isManualScrollingRef.current = true;
        const target = categoryRefs.current[catId];
        if (target && scrollContainerRef.current) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            setTimeout(() => {
                isManualScrollingRef.current = false;
            }, 500);
        }
    };

    const handleScroll = () => {
        if (isManualScrollingRef.current || !scrollContainerRef.current) return;
        const containerTop = scrollContainerRef.current.getBoundingClientRect().top;
        
        let currentCat = EMOJI_CATEGORIES[0].id;
        for (const cat of EMOJI_CATEGORIES) {
            const el = categoryRefs.current[cat.id];
            if (el) {
                const elTop = el.getBoundingClientRect().top - containerTop;
                if (elTop <= 80) {
                    currentCat = cat.id;
                }
            }
        }
        if (currentCat !== activeCategory) {
            setActiveCategory(currentCat);
        }
    };

    return (
        <div className="py-1 my-1" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-wrap items-center gap-1.5">
                {/* Existing Reactions */}
                {Object.entries(grouped).map(([emoji, data]) => {
                    const userNames = data.users.map(u => u.name || '익명').filter(Boolean);
                    const tooltipText = userNames.length > 0 
                        ? `${userNames.join(', ')} 님이 ${emoji} 반응을 남겼습니다 (길게 눌러 전체 확인)`
                        : `${emoji} 반응 ${data.count}개 (길게 눌러 전체 확인)`;

                    return (
                        <button
                            key={emoji}
                            type="button"
                            onMouseDown={() => handlePressStart(emoji)}
                            onMouseUp={() => handlePressEnd(emoji)}
                            onMouseLeave={handlePressCancel}
                            onTouchStart={() => handlePressStart(emoji)}
                            onTouchEnd={() => handlePressEnd(emoji)}
                            onTouchCancel={handlePressCancel}
                            onContextMenu={(e) => {
                                e.preventDefault();
                                setDetailEmoji(emoji);
                            }}
                            onDragStart={(e) => e.preventDefault()}
                            draggable={false}
                            style={{
                                WebkitUserSelect: 'none',
                                userSelect: 'none',
                                WebkitTouchCallout: 'none'
                            }}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all duration-150 border select-none active:scale-95 ${
                                data.hasMine
                                    ? 'bg-tossBlueLight border-tossBlue/30 text-tossBlue shadow-xs'
                                    : 'bg-tossGrey50 border-tossGrey200 text-tossGrey700 hover:bg-tossGrey100'
                            }`}
                            title={tooltipText}
                        >
                            <span className="text-sm leading-none select-none pointer-events-none">{emoji}</span>
                            <span className="leading-none select-none pointer-events-none">{data.count}</span>
                        </button>
                    );
                })}

                {/* Slack-style Face Line Add Button */}
                <button
                    type="button"
                    onClick={() => setShowModal(true)}
                    className="flex items-center justify-center w-8 h-8 rounded-full bg-tossGrey50 hover:bg-tossGrey100 text-tossGrey500 border border-tossGrey200 hover:border-tossGrey300 transition-all active:scale-95 shrink-0"
                    title="이모지 반응 추가"
                >
                    <SmilePlus size={16} strokeWidth={2} />
                </button>
            </div>

            {/* Slack-Style Who Reacted Bottom Sheet Modal */}
            {detailEmoji && createPortal(
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
                        if (ignoreBackdropClickRef.current) return;
                        setDetailEmoji(null);
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
                        {/* Top Drag Handle */}
                        <div className="w-10 h-1 bg-tossGrey300 rounded-full mx-auto mb-3 shrink-0" />

                        {/* Header Filter Tabs */}
                        <div className="flex items-center gap-4 overflow-x-auto border-b border-tossGrey100 pb-2 mb-3 [scrollbar-width:none] shrink-0 text-xs font-bold text-left select-none">
                            <button
                                type="button"
                                onClick={() => setDetailEmoji('ALL')}
                                className={`pb-1.5 whitespace-nowrap transition-all border-b-2 select-none ${
                                    detailEmoji === 'ALL'
                                        ? 'text-tossGrey900 font-extrabold border-emerald-600'
                                        : 'text-tossGrey400 hover:text-tossGrey700 border-transparent'
                                }`}
                            >
                                모두
                            </button>
                            {Object.entries(grouped).map(([emoji, data]) => (
                                <button
                                    key={emoji}
                                    type="button"
                                    onClick={() => setDetailEmoji(emoji)}
                                    className={`pb-1.5 whitespace-nowrap flex items-center gap-1 transition-all border-b-2 select-none ${
                                        detailEmoji === emoji
                                            ? 'text-tossGrey900 font-extrabold border-emerald-600'
                                            : 'text-tossGrey400 hover:text-tossGrey700 border-transparent'
                                    }`}
                                >
                                    <span className="text-sm leading-none select-none pointer-events-none">{emoji}</span>
                                    <span className="select-none pointer-events-none">{data.count}</span>
                                </button>
                            ))}
                        </div>

                        {/* Reacted User List Grouped by Emoji */}
                        <div className="flex-1 overflow-y-auto space-y-4 pr-1 text-left [scrollbar-width:thin] select-none">
                            {Object.entries(grouped)
                                .filter(([emoji]) => detailEmoji === 'ALL' || detailEmoji === emoji)
                                .map(([emoji, data]) => {
                                    const formattedUsers = data.users.map(u => {
                                        const nameStr = u?.name || '익명';
                                        const schoolStr = u?.school ? ` (${u.school})` : '';
                                        return `${nameStr}${schoolStr}`;
                                    }).join(', ');

                                    return (
                                        <div key={emoji} className="flex items-center gap-3 py-1.5 select-none border-b border-tossGrey50 last:border-0">
                                            <div className="w-8 h-8 flex items-center justify-center text-xl shrink-0 select-none pointer-events-none rounded-xl bg-tossGrey50 border border-tossGrey100/50">
                                                {emoji}
                                            </div>
                                            <div className="flex-1 text-xs font-bold text-tossGrey800 leading-normal break-words select-none pointer-events-none">
                                                <span className="select-none pointer-events-none">{formattedUsers || '사용자 정보 없음'}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                        </div>

                        {/* Close Button */}
                        <button
                            type="button"
                            onClick={() => setDetailEmoji(null)}
                            className="mt-4 w-full py-2.5 rounded-2xl bg-tossGrey100 hover:bg-tossGrey200 text-tossGrey700 text-xs font-bold transition active:scale-98 shrink-0 select-none"
                        >
                            닫기
                        </button>
                    </motion.div>
                </div>,
                document.body
            )}

            {/* Slack-Style Comprehensive Emoji Picker Modal */}
            <AnimatePresence>
                {showModal && (
                    <div className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-xs flex items-center justify-center p-3 md:p-4">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 15 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 15 }}
                            transition={{ duration: 0.15 }}
                            className="bg-white rounded-3xl shadow-2xl w-full max-w-sm md:max-w-md border border-tossGrey200 flex flex-col h-[80vh] max-h-[600px] overflow-hidden"
                        >
                            {/* Modal Header */}
                            <div className="p-3.5 border-b border-tossGrey100 flex flex-col gap-2.5 bg-white z-10 shrink-0">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <SmilePlus size={20} className="text-tossBlue" />
                                        <span className="font-extrabold text-sm text-tossGrey900">이모지 반응 선택</span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setShowModal(false)}
                                        className="text-tossGrey400 hover:text-tossGrey700 p-1.5 rounded-full hover:bg-tossGrey100 transition-colors"
                                    >
                                        <X size={18} />
                                    </button>
                                </div>

                                {/* Search Bar */}
                                <div className="relative flex items-center">
                                    <Search size={14} className="absolute left-3 text-tossGrey400" />
                                    <input
                                        type="text"
                                        placeholder="이모지 직접 입력 또는 검색..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full text-xs bg-tossGrey50 border border-tossGrey200 rounded-xl pl-8 pr-3 py-2 outline-none focus:border-tossBlue focus:bg-white transition"
                                    />
                                    {searchQuery && (
                                        <button
                                            type="button"
                                            onClick={() => setSearchQuery('')}
                                            className="absolute right-2.5 text-tossGrey400 hover:text-tossGrey600 text-xs"
                                        >
                                            취소
                                        </button>
                                    )}
                                </div>

                                {/* Category Navigation Bar (Slack-style icons) */}
                                {!searchQuery && (
                                    <div className="flex items-center justify-between gap-1 overflow-x-auto pt-1 pb-0.5 [scrollbar-width:none]">
                                        {EMOJI_CATEGORIES.map(cat => (
                                            <button
                                                key={cat.id}
                                                type="button"
                                                onClick={() => scrollToCategory(cat.id)}
                                                className={`p-1.5 rounded-xl text-base transition-all ${
                                                    activeCategory === cat.id
                                                        ? 'bg-tossBlueLight scale-110 shadow-xs'
                                                        : 'hover:bg-tossGrey100 opacity-70 hover:opacity-100'
                                                }`}
                                                title={cat.name}
                                            >
                                                {cat.icon}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Continuous Scrollable Emoji List (Slack Style) */}
                            <div
                                ref={scrollContainerRef}
                                onScroll={handleScroll}
                                className="flex-1 overflow-y-auto p-4 space-y-5 text-left [scrollbar-width:thin]"
                            >
                                {searchQuery ? (
                                    /* Search Results / Custom Emoji direct click */
                                    <div>
                                        <div className="text-xs font-bold text-tossGrey500 mb-2">검색 결과 / 입력값</div>
                                        <div className="grid grid-cols-7 sm:grid-cols-8 gap-2">
                                            {/* Direct typed character button */}
                                            <button
                                                type="button"
                                                onClick={() => handleEmojiClick(searchQuery.trim())}
                                                className="hover:scale-125 transition-transform text-2xl p-2 hover:bg-tossBlueLight rounded-xl flex items-center justify-center border border-tossBlue/30 bg-tossBlueLight/20"
                                                title={`입력한 이모지 사용: ${searchQuery}`}
                                            >
                                                {searchQuery.trim()}
                                            </button>

                                            {/* Filtered Emojis */}
                                            {EMOJI_CATEGORIES.flatMap(c => c.emojis)
                                                .filter((emoji, idx, self) => self.indexOf(emoji) === idx)
                                                .filter(emoji => emoji.includes(searchQuery.trim()))
                                                .map(emoji => (
                                                    <button
                                                        key={emoji}
                                                        type="button"
                                                        onClick={() => handleEmojiClick(emoji)}
                                                        className="hover:scale-125 transition-transform text-2xl p-2 hover:bg-tossBlueLight rounded-xl flex items-center justify-center"
                                                    >
                                                        {emoji}
                                                    </button>
                                                ))}
                                        </div>
                                    </div>
                                ) : (
                                    /* Full Slack-style Categorized Scroll List */
                                    EMOJI_CATEGORIES.map(cat => (
                                        <div
                                            key={cat.id}
                                            ref={el => categoryRefs.current[cat.id] = el}
                                            className="scroll-mt-3"
                                        >
                                            <div className="text-xs font-extrabold text-tossGrey600 mb-2.5 px-0.5">
                                                {cat.name}
                                            </div>
                                            <div className="grid grid-cols-7 sm:grid-cols-8 gap-1.5">
                                                {cat.emojis.map((emoji, idx) => (
                                                    <button
                                                        key={`${cat.id}-${emoji}-${idx}`}
                                                        type="button"
                                                        onClick={() => handleEmojiClick(emoji)}
                                                        className="hover:scale-125 transition-transform text-2xl p-1.5 hover:bg-tossBlueLight rounded-xl flex items-center justify-center active:scale-95"
                                                    >
                                                        {emoji}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
