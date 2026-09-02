import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Trash2, Trash, Send, Edit2 } from 'lucide-react';
import UserAvatar from '../../common/UserAvatar';
import useModalClose from '../../../hooks/useModalClose';

const GuestbookDetailModal = ({ 
    selectedGuestPost, 
    guestComments, 
    user, 
    onDeleteGuestPost, 
    onDeleteGuestComment, 
    handleGuestCommentSubmit,
    fetchGuestCommentsData,
    setGuestComments,
    setSelectedGuestPost,
    onEditPost
}) => {
    useModalClose(!!selectedGuestPost, () => setSelectedGuestPost(null));
    const [newGuestComment, setNewGuestComment] = useState('');

    const handlePostGuestCommentData = async (e) => {
        e.preventDefault();
        const success = await handleGuestCommentSubmit(selectedGuestPost.id, newGuestComment);
        if (success) {
            setNewGuestComment('');
            const data = await fetchGuestCommentsData(selectedGuestPost.id);
            setGuestComments(data);
        }
    };

    const handleDeletePost = async (id) => {
        await onDeleteGuestPost(id);
    };

    return (
        <>
            <div className="fixed inset-0 z-[105] bg-black/20 backdrop-blur-sm" onClick={() => setSelectedGuestPost(null)}></div>
                    <motion.div
                        key="guest-detail"
                        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        className="fixed inset-0 z-[110] bg-white flex flex-col sm:rounded-t-3xl sm:top-10 shadow-2xl pb-20"
                    >
                        <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                            <div className="flex items-center gap-2">
                                <UserAvatar user={selectedGuestPost.users} size="w-8 h-8" />
                                <span className="font-bold text-gray-700">{selectedGuestPost.users?.name}</span>
                            </div>
                            {selectedGuestPost.user_id === user?.id && (
                                <div className="flex items-center gap-1">
                                    <button onClick={() => onEditPost(selectedGuestPost)} className="p-2 text-blue-500 hover:bg-blue-50 rounded-full transition"><Edit2 size={18} /></button>
                                    <button onClick={() => onDeleteGuestPost(selectedGuestPost.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-full transition"><Trash2 size={18} /></button>
                                </div>
                            )}
                        </div>
                        <div className="flex-1 overflow-y-auto pb-20">
                            <div className="p-4">
                                <div className="flex items-center gap-3 mb-4">
                                    <UserAvatar user={selectedGuestPost.users} size="w-10 h-10" />
                                    <div>
                                        <div className="font-bold text-gray-800 text-sm flex items-center gap-1">
                                            {selectedGuestPost.users?.name}
                                            {selectedGuestPost.users?.is_leader && <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="#FACC15" stroke="#FACC15" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-star"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>}
                                        </div>
                                        <div className="text-xs text-gray-400">{new Date(selectedGuestPost.created_at).toLocaleString()}</div>
                                    </div>
                                </div>
                                <p className="text-gray-800 text-base mb-4 whitespace-pre-wrap leading-relaxed">{selectedGuestPost.content}</p>
                                {/* Image Display in Detail */}
                                {(selectedGuestPost.images?.length > 0 || selectedGuestPost.image_url) && (
                                    <div className={`mb-4 rounded-xl overflow-hidden border border-gray-50 shadow-sm ${(selectedGuestPost.images?.length > 1) ? 'grid grid-cols-2 gap-1' : 'bg-gray-50'
                                        }`}>
                                        {selectedGuestPost.images?.length > 1 ? (
                                            selectedGuestPost.images.map((img, idx) => (
                                                <div key={idx} className="relative aspect-square">
                                                    <img src={img} alt="post" className="w-full h-full object-cover" />
                                                </div>
                                            ))
                                        ) : (
                                            <img
                                                src={selectedGuestPost.images?.[0] || selectedGuestPost.image_url}
                                                alt="post"
                                                className="w-full h-auto max-h-[500px] object-contain mx-auto"
                                            />
                                        )}
                                    </div>
                                )}
                            </div>
                            <div className="border-t border-gray-100 p-4">
                                <h4 className="font-bold text-sm text-gray-600 mb-3">댓글</h4>
                                <div className="space-y-3">
                                    {guestComments.map(c => (
                                        <div key={c.id} className="bg-gray-50 p-3 rounded-2xl">
                                            <div className="flex justify-between items-baseline mb-1">
                                                <div className="flex items-center gap-2">
                                                    <UserAvatar user={c.users} size="w-4 h-4" textSize="text-[8px]" />
                                                    <span className="font-bold text-sm text-gray-800 flex items-center gap-1">
                                                        {c.users?.name}
                                                        {c.users?.is_leader && <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="#FACC15" stroke="#FACC15" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-star"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between items-start mb-2">
                                                    <span className="font-bold text-gray-900">{c.users?.name}</span>
                                                    {c.user_id === user?.id && (
                                                        <button onClick={() => onDeleteGuestComment(c.id)} className="text-red-400 p-1"><Trash size={12} /></button>
                                                    )}
                                                </div>
                                            </div>
                                            <p className="text-sm text-gray-600 ml-6">{c.content}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="p-4 border-t border-gray-100 bg-white sticky bottom-0">
                            <form onSubmit={handlePostGuestCommentData} className="flex gap-2">
                                <input type="text" value={newGuestComment} onChange={(e) => setNewGuestComment(e.target.value)} placeholder="댓글을 남겨주세요..." className="flex-1 bg-gray-100 rounded-full px-5 py-3 text-base outline-none focus:ring-2 focus:ring-green-500 transition" />
                                <button type="submit" disabled={!newGuestComment.trim()} className="bg-green-600 text-white p-3 rounded-full hover:bg-green-700 disabled:bg-gray-300 transition active:scale-90">
                                    <Send size={18} />
                                </button>
                            </form>
                        </div>
                    </motion.div>
        </>
    );
};
export default GuestbookDetailModal;
