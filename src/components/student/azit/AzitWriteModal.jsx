import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Image as ImageIcon, Music, Youtube, CheckCircle2, Plus } from 'lucide-react';

const AzitWriteModal = ({ category, onClose, onSubmit, uploading, isEdit = false, initialData = null, weeklyQuestion = null }) => {
    // For QT
    const [content, setContent] = useState('');
    const [images, setImages] = useState([]);
    const [previews, setPreviews] = useState([]);
    const [existingImages, setExistingImages] = useState([]);

    // For Playlist V2
    const [playlistTitle, setPlaylistTitle] = useState('');
    const [tracks, setTracks] = useState([{ title: '', artist: '', youtubeUrl: '' }]);
    
    React.useEffect(() => {
        if (isEdit && initialData) {
            if (category === 'QT나눔' || category === '위클리 퀘스천') {
                setContent(initialData.content || '');
                const initImages = initialData.images?.length > 0 
                  ? initialData.images 
                  : (initialData.image_url ? [initialData.image_url] : []);
                setExistingImages(initImages);
            } else if (category === '플레이리스트') {
                if (initialData.metadata && initialData.metadata.type === 'PLAYLIST_V2') {
                    setPlaylistTitle(initialData.metadata.playlistTitle || '');
                    setTracks(initialData.metadata.tracks && initialData.metadata.tracks.length > 0 ? initialData.metadata.tracks : [{ title: '', artist: '', youtubeUrl: '' }]);
                    setContent(initialData.metadata.reason || '');
                } else if (initialData.metadata) {
                    setPlaylistTitle('');
                    setTracks([{ 
                        title: initialData.metadata.title || '', 
                        artist: initialData.metadata.artist || '', 
                        youtubeUrl: initialData.metadata.youtubeUrl || '' 
                    }]);
                    setContent(initialData.metadata.reason || '');
                } else {
                    // Fallback if no metadata
                    const lines = initialData.content?.split('\n\n') || [];
                    setContent(lines.length > 1 ? lines[1] : (initialData.content || ''));
                }
            }
        }
    }, [isEdit, initialData, category]);
    
    // For Playlist `reason` we use `content`

    const handleSubmit = async () => {
        if (category === 'QT나눔' || category === '위클리 퀘스천') {
            if (!content.trim() && images.length === 0 && existingImages.length === 0) return;
            await onSubmit(content, images, existingImages, {});
        } else if (category === '플레이리스트') {
            if (!playlistTitle.trim() || tracks.length === 0 || !content.trim()) {
                alert('플레이리스트 제목, 곡 정보, 추천 이유를 모두 입력해주세요!');
                return;
            }
            // validate all tracks
            const isValidTracks = tracks.every(t => t.title.trim() && t.artist.trim());
            if (!isValidTracks) {
                alert('모든 곡의 제목과 아티스트를 입력해주세요!');
                return;
            }
            
            // Format content to look nice if someone looks at it directly
            let formattedContent = `🎧 플레이리스트: ${playlistTitle}\n\n`;
            tracks.forEach((t, i) => {
                formattedContent += `${i + 1}. ${t.title} - ${t.artist} ${t.youtubeUrl ? `🔗` : ''}\n`;
            });
            formattedContent += `\n${content}`;
            
            // Pass the separated fields as metadata
            const metadata = {
                type: 'PLAYLIST_V2',
                playlistTitle,
                tracks,
                reason: content
            };
            
            await onSubmit(formattedContent, [], [], metadata);
        }
    };

    const handleAddTrack = () => {
        if (tracks.length >= 10) return;
        setTracks(prev => [...prev, { title: '', artist: '', youtubeUrl: '' }]);
    };

    const handleRemoveTrack = (index) => {
        if (tracks.length <= 1) return;
        setTracks(prev => prev.filter((_, i) => i !== index));
    };

    const handleTrackChange = (index, field, value) => {
        const newTracks = [...tracks];
        newTracks[index] = { ...newTracks[index], [field]: value };
        setTracks(newTracks);
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
        <AnimatePresence>
            <motion.div
                initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="fixed inset-0 z-[200] bg-white flex flex-col sm:rounded-t-[2.5rem] sm:top-20 shadow-2xl pb-20"
            >
                <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-white sticky top-0 z-10">
                    <button onClick={onClose} className="text-gray-500 font-bold px-3 py-2 rounded-xl hover:bg-gray-50 transition-colors">취소</button>
                    <h3 className="font-black text-lg text-gray-800 tracking-tight">
                        {category === 'QT나눔' ? (isEdit ? 'QT 수정' : '새 QT 작성') 
                         : category === '위클리 퀘스천' ? (isEdit ? '답변 수정' : '질문 답변 작성')
                         : (isEdit ? '플레이리스트 수정' : '내 플레이리스트 공유')}
                    </h3>
                    <button 
                        onClick={handleSubmit} 
                        disabled={uploading} 
                        className="text-blue-600 font-black px-3 py-2 rounded-xl hover:bg-blue-50 transition-colors disabled:text-gray-300 disabled:bg-transparent"
                    >
                        {uploading ? (isEdit ? '수정중' : '업로드중') : (isEdit ? '수정' : '등록')}
                    </button>
                </div>
                
                <div className="p-5 flex-1 overflow-y-auto space-y-6 max-w-xl mx-auto w-full">
                    
                    {category === 'QT나눔' && (
                        <>
                            <div>
                                <label className="block text-sm font-black text-gray-800 mb-2">오늘 은혜받은 말씀을 나눠주세요</label>
                                <textarea 
                                    value={content} 
                                    onChange={e => setContent(e.target.value)} 
                                    placeholder="어떤 구절에서 마음이 울렸나요?" 
                                    className="w-full h-40 p-5 text-base bg-gray-50 border border-gray-100 rounded-[2rem] outline-none resize-none focus:border-pink-300 focus:bg-white transition-all placeholder:text-gray-400 font-medium leading-relaxed" 
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-black text-gray-800 mb-2 flex items-center gap-1.5">
                                    <ImageIcon size={16} className="text-pink-500" /> 사진 첨부
                                </label>
                                <div className="flex flex-wrap gap-3 mt-2">
                                    {existingImages.map((url, idx) => (
                                        <div key={`existing-${idx}`} className="relative w-24 h-24 rounded-2xl overflow-hidden shadow-sm border border-gray-100 group">
                                            <img src={url} alt="existing" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                            <button
                                                onClick={() => setExistingImages(prev => prev.filter((_, i) => i !== idx))}
                                                className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1.5 backdrop-blur-sm shadow-sm"
                                            >
                                                <X size={12} strokeWidth={3} />
                                            </button>
                                        </div>
                                    ))}

                                    {previews.map((preview, idx) => (
                                        <div key={idx} className="relative w-24 h-24 rounded-2xl overflow-hidden shadow-sm border border-gray-100 group">
                                            <img src={preview} alt="preview" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                            <button
                                                onClick={() => {
                                                    const newImages = [...images];
                                                    const newPreviews = [...previews];
                                                    newImages.splice(idx, 1);
                                                    newPreviews.splice(idx, 1);
                                                    setImages(newImages);
                                                    setPreviews(newPreviews);
                                                }}
                                                className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1.5 backdrop-blur-sm shadow-sm"
                                            >
                                                <X size={12} strokeWidth={3} />
                                            </button>
                                        </div>
                                    ))}

                                    {(images.length + existingImages.length) < 5 && (
                                        <label className="flex flex-col items-center justify-center w-24 h-24 bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl cursor-pointer hover:bg-gray-100 hover:border-pink-200 transition-all text-gray-400 hover:text-pink-500">
                                            <Plus size={24} strokeWidth={2.5} />
                                            <span className="text-[10px] font-black mt-1">추가</span>
                                            <input type="file" accept="image/*" className="hidden" multiple onChange={handleFileSelect} />
                                        </label>
                                    )}
                                </div>
                            </div>
                        </>
                    )}

                    {category === '플레이리스트' && (
                        <div className="space-y-6">
                            <div>
                                <label className="block text-sm font-black text-gray-800 mb-2">플레이리스트 제목</label>
                                <input 
                                    type="text" 
                                    value={playlistTitle} 
                                    onChange={e => setPlaylistTitle(e.target.value)} 
                                    placeholder="예) 등교할 때 듣기 좋은 신나는 찬양"
                                    className="w-full p-4 text-base bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:border-indigo-400 focus:bg-white transition-colors placeholder:text-gray-400 font-bold" 
                                />
                            </div>

                            <div className="space-y-3">
                                <div className="flex items-center justify-between mb-2">
                                    <label className="block text-sm font-black text-gray-800 flex items-center gap-1.5">
                                        <Music size={16} className="text-indigo-500" /> 수록곡 목록 ({tracks.length}/10)
                                    </label>
                                    {tracks.length < 10 && (
                                        <button 
                                            onClick={handleAddTrack}
                                            className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1.5 rounded-lg hover:bg-indigo-100 transition-colors flex items-center gap-1"
                                        >
                                            <Plus size={14} /> 곡 추가
                                        </button>
                                    )}
                                </div>
                                
                                {tracks.map((track, i) => (
                                    <div key={i} className="flex flex-col gap-2 p-4 bg-gray-50 border border-gray-100 rounded-2xl relative group">
                                        <div className="flex justify-between items-center">
                                            <span className="text-xs font-bold text-indigo-400">Track {i + 1}</span>
                                            {tracks.length > 1 && (
                                                <button 
                                                    onClick={() => handleRemoveTrack(i)}
                                                    className="text-gray-400 hover:text-red-500 transition-colors p-1"
                                                >
                                                    <X size={14} strokeWidth={3} />
                                                </button>
                                            )}
                                        </div>
                                        <div className="flex gap-2 sm:gap-4 flex-col sm:flex-row">
                                            <input 
                                                type="text" 
                                                value={track.title} 
                                                onChange={e => handleTrackChange(i, 'title', e.target.value)} 
                                                placeholder="제목"
                                                className="flex-1 p-3 text-sm bg-white border border-gray-200 rounded-xl outline-none focus:border-indigo-400 transition-colors font-bold" 
                                            />
                                            <input 
                                                type="text" 
                                                value={track.artist} 
                                                onChange={e => handleTrackChange(i, 'artist', e.target.value)} 
                                                placeholder="아티스트"
                                                className="flex-1 p-3 text-sm bg-white border border-gray-200 rounded-xl outline-none focus:border-indigo-400 transition-colors font-bold" 
                                            />
                                        </div>
                                        <input 
                                            type="url" 
                                            value={track.youtubeUrl} 
                                            onChange={e => handleTrackChange(i, 'youtubeUrl', e.target.value)} 
                                            placeholder="YouTube 링크 (선택)"
                                            className="w-full p-3 text-sm bg-white border border-gray-200 rounded-xl outline-none focus:border-red-400 transition-colors" 
                                        />
                                    </div>
                                ))}
                            </div>

                            <div>
                                <label className="block text-sm font-black text-gray-800 mb-2 flex items-center gap-1.5">
                                    추천 이유
                                </label>
                                <textarea 
                                    value={content} 
                                    onChange={e => setContent(e.target.value)} 
                                    placeholder="이 플레이리스트를 언제 들으면 좋은가요? (필수)" 
                                    className="w-full h-32 p-4 text-base bg-gray-50 border border-gray-100 rounded-[2rem] outline-none resize-none focus:border-indigo-300 focus:bg-white transition-all placeholder:text-gray-400 font-medium" 
                                />
                            </div>
                        </div>
                    )}
                    {category === '위클리 퀘스천' && (
                        <div className="space-y-4">
                            {weeklyQuestion && (
                                <div className="bg-blue-50 border border-blue-100 rounded-[2rem] p-5">
                                    <h4 className="text-sm font-bold text-blue-800 mb-1">이번 주 질문</h4>
                                    <p className="text-lg font-black text-gray-900 leading-tight mb-2">{weeklyQuestion.main_question}</p>
                                    {weeklyQuestion.sub_question && (
                                        <p className="text-sm text-blue-700 font-medium">{weeklyQuestion.sub_question}</p>
                                    )}
                                </div>
                            )}
                            <div>
                                <label className="block text-sm font-black text-gray-800 mb-2">나의 답변</label>
                                <textarea 
                                    value={content} 
                                    onChange={e => setContent(e.target.value)} 
                                    placeholder="질문에 대한 자유로운 생각을 남겨주세요." 
                                    className="w-full h-40 p-5 text-base bg-gray-50 border border-gray-100 rounded-[2rem] outline-none resize-none focus:border-blue-300 focus:bg-white transition-all placeholder:text-gray-400 font-medium leading-relaxed" 
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-black text-gray-800 mb-2 flex items-center gap-1.5">
                                    <ImageIcon size={16} className="text-blue-500" /> 사진 첨부 (선택)
                                </label>
                                <div className="flex flex-wrap gap-3 mt-2">
                                    {existingImages.map((url, idx) => (
                                        <div key={`existing-${idx}`} className="relative w-24 h-24 rounded-2xl overflow-hidden shadow-sm border border-gray-100 group">
                                            <img src={url} alt="existing" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                            <button
                                                onClick={() => setExistingImages(prev => prev.filter((_, i) => i !== idx))}
                                                className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1.5 backdrop-blur-sm shadow-sm"
                                            >
                                                <X size={12} strokeWidth={3} />
                                            </button>
                                        </div>
                                    ))}

                                    {previews.map((preview, idx) => (
                                        <div key={idx} className="relative w-24 h-24 rounded-2xl overflow-hidden shadow-sm border border-gray-100 group">
                                            <img src={preview} alt="preview" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                            <button
                                                onClick={() => {
                                                    const newImages = [...images];
                                                    const newPreviews = [...previews];
                                                    newImages.splice(idx, 1);
                                                    newPreviews.splice(idx, 1);
                                                    setImages(newImages);
                                                    setPreviews(newPreviews);
                                                }}
                                                className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1.5 backdrop-blur-sm shadow-sm"
                                            >
                                                <X size={12} strokeWidth={3} />
                                            </button>
                                        </div>
                                    ))}

                                    {(images.length + existingImages.length) < 5 && (
                                        <label className="flex flex-col items-center justify-center w-24 h-24 bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl cursor-pointer hover:bg-gray-100 hover:border-blue-200 transition-all text-gray-400 hover:text-blue-500">
                                            <Plus size={24} strokeWidth={2.5} />
                                            <span className="text-[10px] font-black mt-1">추가</span>
                                            <input type="file" accept="image/*" className="hidden" multiple onChange={handleFileSelect} />
                                        </label>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                    
                    {!isEdit && (
                        <div className={`mt-8 rounded-[2rem] p-5 flex items-start gap-4 shadow-sm border ${
                            category === 'QT나눔' ? 'bg-pink-50 border-pink-100 text-pink-800' 
                            : category === '위클리 퀘스천' ? 'bg-blue-50 border-blue-100 text-blue-800'
                            : 'bg-indigo-50 border-indigo-100 text-indigo-800'
                        }`}>
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                                category === 'QT나눔' ? 'bg-pink-200 text-pink-700' 
                                : category === '위클리 퀘스천' ? 'bg-blue-200 text-blue-700'
                                : 'bg-indigo-200 text-indigo-700'
                            }`}>
                                <CheckCircle2 size={18} strokeWidth={2.5} />
                            </div>
                            <div>
                                <p className="font-black text-sm mb-1">{category} 등록 리워드</p>
                                <p className="font-medium text-[13px] opacity-80 leading-snug">첫 작성 시 즉시 <strong>1 하이픈</strong>이 적립됩니다. ({category === '위클리 퀘스천' ? '주 1회' : '하루 1회'} 제한)</p>
                            </div>
                        </div>
                    )}
                </div>

                {uploading && (
                    <div className="absolute inset-0 z-50 bg-white/80 backdrop-blur-md flex flex-col items-center justify-center sm:rounded-t-[2.5rem]">
                        <div className="w-16 h-16 border-[5px] border-blue-600 border-t-transparent rounded-full animate-spin mb-5" />
                        <p className="font-black text-blue-900 text-xl tracking-tight">게시글 업로드 중</p>
                        <p className="font-bold text-blue-600/70 mt-2">잠시만 기다려주세요</p>
                    </div>
                )}
            </motion.div>
        </AnimatePresence>
    );
};

export default AzitWriteModal;
