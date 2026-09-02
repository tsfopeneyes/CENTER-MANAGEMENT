import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Image as ImageIcon, CheckCircle2 } from 'lucide-react';
import useModalClose from '../../../hooks/useModalClose';

const CATEGORIES = ['QT', '리더유형 테스트', '백일장', '소감나눔', '기타'];

const VerificationWriteModal = ({ setShowVerificationWrite, handleCreatePost, handleUpdatePost, uploadingGuest, onSuccess, editPost }) => {
    useModalClose(true, () => setShowVerificationWrite(false));
    const [selectedCategory, setSelectedCategory] = useState(() => {
        if (editPost && editPost.content.startsWith('[')) {
            const match = editPost.content.match(/^\[(.*?)\]/);
            return match ? match[1] : CATEGORIES[0];
        }
        return CATEGORIES[0];
    });
    
    const [content, setContent] = useState(() => {
        if (editPost) {
            return editPost.content.replace(/^\[.*?\]\s*/, '');
        }
        return '';
    });
    
    const [images, setImages] = useState([]);
    const [previews, setPreviews] = useState([]);
    
    const [existingImages, setExistingImages] = useState(() => {
        if (editPost) {
            return editPost.images || (editPost.image_url ? [editPost.image_url] : []);
        }
        return [];
    });

    const handleCreateVerification = async () => {
        if (!content.trim() && images.length === 0 && existingImages.length === 0) return;
        
        const finalContent = `[${selectedCategory}] ` + content;
        
        let success = false;
        if (editPost) {
            success = await handleUpdatePost(editPost.id, finalContent, images, existingImages);
        } else {
            success = await handleCreatePost(finalContent, images, selectedCategory);
        }
        
        if (success) {
            setContent('');
            setImages([]);
            setPreviews([]);
            setExistingImages([]);
            setShowVerificationWrite(false);
            if (onSuccess) onSuccess();
        }
    };

    const handleFileSelect = (e) => {
        const files = Array.from(e.target.files);
        if (files.length > 0) {
            const newPreviews = files.map(file => URL.createObjectURL(file));
            setImages(prev => [...prev, ...files]);
            setPreviews(prev => [...prev, ...newPreviews]);
        }
    };

    return (
        <motion.div
            key="verification-write"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed inset-0 z-[200] bg-white flex flex-col sm:rounded-t-3xl sm:top-20 shadow-2xl pb-20"
        >
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-white sticky top-0 z-10">
                <button onClick={() => setShowVerificationWrite(false)} className="text-gray-500 font-bold px-2">취소</button>
                <h3 className="font-bold text-lg text-gray-800">{editPost ? '콘텐츠 인증 수정' : '콘텐츠 인증하기'}</h3>
                <button onClick={handleCreateVerification} disabled={uploadingGuest} className="text-blue-600 font-bold px-2 disabled:text-gray-300">
                    {uploadingGuest ? '처리중...' : (editPost ? '수정' : '완료')}
                </button>
            </div>
            
            <div className="p-5 flex-1 overflow-y-auto space-y-6">
                <div>
                    <label className="block text-sm font-black text-gray-800 mb-2">어떤 콘텐츠에 참여하셨나요?</label>
                    <div className="flex flex-wrap gap-2">
                        {CATEGORIES.map(cat => (
                            <button
                                key={cat}
                                onClick={() => setSelectedCategory(cat)}
                                className={`px-4 py-2 rounded-xl text-sm font-bold border transition-all ${
                                    selectedCategory === cat 
                                        ? 'bg-blue-600 border-blue-600 text-white shadow-md' 
                                        : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                                }`}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-black text-gray-800 mb-2">참여 소감이나 인증샷을 남겨주세요!</label>
                    <textarea 
                        value={content} 
                        onChange={e => setContent(e.target.value)} 
                        placeholder="느낀 점이나 사진을 올려 방명록에 남겨보세요." 
                        className="w-full h-32 p-4 text-base bg-gray-50 border border-gray-100 rounded-2xl outline-none resize-none focus:border-blue-400 focus:bg-white transition-colors placeholder:text-gray-400 font-medium" 
                    />

                    <div className="flex flex-wrap gap-3 mt-3">
                        {existingImages.map((imgUrl, idx) => (
                            <div key={`exist-${idx}`} className="relative w-20 h-20 rounded-xl overflow-hidden shadow-sm border border-gray-100">
                                <img src={imgUrl} alt="existing" className="w-full h-full object-cover" />
                                <button
                                    onClick={() => {
                                        setExistingImages(prev => prev.filter((_, i) => i !== idx));
                                    }}
                                    className="absolute top-1 right-1 bg-black/50 text-white rounded-full p-1 border border-white/20 backdrop-blur-sm"
                                >
                                    <X size={12} />
                                </button>
                            </div>
                        ))}

                        {previews.map((preview, idx) => (
                            <div key={`new-${idx}`} className="relative w-20 h-20 rounded-xl overflow-hidden shadow-sm border border-gray-100">
                                <img src={preview} alt="preview" className="w-full h-full object-cover" />
                                <button
                                    onClick={() => {
                                        const newImages = [...images];
                                        const newPreviews = [...previews];
                                        newImages.splice(idx, 1);
                                        newPreviews.splice(idx, 1);
                                        setImages(newImages);
                                        setPreviews(newPreviews);
                                    }}
                                    className="absolute top-1 right-1 bg-black/50 text-white rounded-full p-1 border border-white/20 backdrop-blur-sm"
                                >
                                    <X size={12} />
                                </button>
                            </div>
                        ))}

                        {(images.length + existingImages.length) < 5 && (
                            <label className="flex flex-col items-center justify-center w-20 h-20 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50 transition-colors">
                                <ImageIcon className="text-gray-400" size={20} />
                                <span className="text-[10px] text-gray-400 mt-1 font-bold">사진 추가</span>
                                <input type="file" accept="image/*" className="hidden" multiple onChange={handleFileSelect} />
                            </label>
                        )}
                    </div>
                </div>
                
                {!editPost && (
                    <div className="bg-blue-50/50 rounded-2xl p-4 flex gap-3 text-blue-800 text-sm font-medium">
                        <CheckCircle2 className="shrink-0 mt-0.5 text-blue-500" size={18} />
                        <p>인증이 완료되면 <strong>1 하이픈</strong>이 즉시 지급됩니다.</p>
                    </div>
                )}
            </div>

            {/* Upload Overlay */}
            {uploadingGuest && (
                <div className="absolute inset-0 z-50 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center rounded-t-3xl">
                    <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
                    <p className="font-black text-blue-800 text-lg">사진 압축 및 업로드 중...</p>
                    <p className="font-bold text-gray-500 mt-2">잠시만 기다려 주세요 (최대 10~20초 소요)</p>
                </div>
            )}
        </motion.div>
    );
};

export default VerificationWriteModal;
