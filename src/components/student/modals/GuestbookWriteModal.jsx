import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Image as ImageIcon } from 'lucide-react';
import useModalClose from '../../../hooks/useModalClose';

const GuestbookWriteModal = ({ setShowGuestWrite, handleCreatePost, uploadingGuest }) => {
    useModalClose(true, () => setShowGuestWrite(false));
    const [newGuestPost, setNewGuestPost] = useState({ content: '', images: [], previews: [] });

    const handleCreateGuestPost = async () => {
        if (!newGuestPost.content.trim() && newGuestPost.images.length === 0) return;
        const success = await handleCreatePost(newGuestPost.content, newGuestPost.images);
        if (success) {
            setNewGuestPost({ content: '', images: [], previews: [] });
            setShowGuestWrite(false);
        }
    };

    const handleGuestFileSelect = (e) => {
        const files = Array.from(e.target.files);
        if (files.length > 0) {
            const newPreviews = files.map(file => URL.createObjectURL(file));
            setNewGuestPost(prev => ({
                ...prev,
                images: [...prev.images, ...files],
                previews: [...prev.previews, ...newPreviews]
            }));
        }
    };

    return (
                    <motion.div
                        key="guest-write"
                        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        className="fixed inset-0 z-[110] bg-white flex flex-col sm:rounded-t-3xl sm:top-20 shadow-2xl pb-20"
                    >
                        <div className="p-4 border-b border-gray-100 flex justify-between items-center">
                            <button onClick={() => setShowGuestWrite(false)} className="text-gray-500 font-bold px-2">취소</button>
                            <h3 className="font-bold text-lg">새 글 쓰기</h3>
                            <button onClick={handleCreateGuestPost} disabled={uploadingGuest} className="text-blue-600 font-bold px-2 disabled:text-gray-300">
                                {uploadingGuest ? '...' : '완료'}
                            </button>
                        </div>
                        <div className="p-4 flex-1 overflow-y-auto">
                            <textarea value={newGuestPost.content} onChange={e => setNewGuestPost({ ...newGuestPost, content: e.target.value })} placeholder="무슨 생각을 하고 계신가요?" className="w-full h-40 text-lg outline-none resize-none placeholder:text-gray-300" />

                            <div className="flex flex-wrap gap-2 mt-2">
                                {newGuestPost.previews.map((preview, idx) => (
                                    <div key={idx} className="relative w-24 h-24 rounded-xl overflow-hidden shadow-sm border border-gray-100">
                                        <img src={preview} alt="preview" className="w-full h-full object-cover" />
                                        <button
                                            onClick={() => {
                                                const newImages = [...newGuestPost.images];
                                                const newPreviews = [...newGuestPost.previews];
                                                newImages.splice(idx, 1);
                                                newPreviews.splice(idx, 1);
                                                setNewGuestPost({ ...newGuestPost, images: newImages, previews: newPreviews });
                                            }}
                                            className="absolute top-1 right-1 bg-black/50 text-white rounded-full p-1 border border-white/20 backdrop-blur-sm"
                                        >
                                            <X size={12} />
                                        </button>
                                    </div>
                                ))}

                                {newGuestPost.images.length < 8 && (
                                    <label className="inline-flex flex-col items-center justify-center w-24 h-24 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50 transition">
                                        <ImageIcon className="text-gray-400" />
                                        <span className="text-[10px] text-gray-400 mt-1">추가</span>
                                        <input type="file" accept="image/*" className="hidden" multiple onChange={handleGuestFileSelect} />
                                    </label>
                                )}
                            </div>
                        </div>
                    </motion.div>
    );
};
export default GuestbookWriteModal;
