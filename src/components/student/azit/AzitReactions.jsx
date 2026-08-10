import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import EmojiPicker from 'emoji-picker-react';

export default function AzitReactions({ reactions, currentUserId, onToggleReaction }) {
    const [showPicker, setShowPicker] = useState(false);

    // Safe fallback for reactions array
    const safelyTypedReactions = Array.isArray(reactions) ? reactions : [];

    // Group by emoji
    const grouped = safelyTypedReactions.reduce((acc, r) => {
        if (!acc[r.emoji]) acc[r.emoji] = { count: 0, hasMine: false };
        acc[r.emoji].count += 1;
        if (r.user_id === currentUserId) acc[r.emoji].hasMine = true;
        return acc;
    }, {});

    const handleEmojiClick = (emoji) => {
        onToggleReaction(emoji);
        setShowPicker(false);
    };

    return (
        <div className="flex flex-wrap items-center gap-2 relative mt-1" onClick={(e) => e.stopPropagation()}>
            {Object.entries(grouped).map(([emoji, data]) => (
                <button
                    key={emoji}
                    type="button"
                    onClick={() => handleEmojiClick(emoji)}
                    onDragStart={(e) => e.preventDefault()}
                    draggable={false}
                    style={{
                        WebkitUserSelect: 'none',
                        userSelect: 'none',
                        WebkitTouchCallout: 'none'
                    }}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-sm font-bold transition-all border select-none ${
                        data.hasMine 
                            ? 'bg-indigo-50 border-indigo-200 text-indigo-700' 
                            : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                    }`}
                >
                    <span className="text-sm leading-none select-none pointer-events-none">{emoji}</span>
                    <span className="text-xs leading-none mt-0.5 select-none pointer-events-none">{data.count}</span>
                </button>
            ))}

            <div className="relative">
                <button
                    onClick={() => setShowPicker(!showPicker)}
                    className="flex items-center justify-center h-8 px-2.5 rounded-full bg-gray-50 hover:bg-gray-100 text-gray-400 border border-gray-200 transition-colors"
                >
                    <Plus size={16} strokeWidth={3} />
                </button>

                {showPicker && (
                    <>
                        <div 
                            className="fixed inset-0 z-[100] bg-black/10 backdrop-blur-[2px]" 
                            onClick={() => setShowPicker(false)} 
                        />
                        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[101] shadow-2xl rounded-2xl overflow-hidden border border-gray-100 bg-white scale-100 origin-center animate-in fade-in zoom-in duration-200">
                            <EmojiPicker 
                                onEmojiClick={(e) => handleEmojiClick(e.emoji)}
                                width={320}
                                height={450}
                                searchDisabled={true}
                                skinTonesDisabled={true}
                                previewConfig={{ showPreview: false }}
                            />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
