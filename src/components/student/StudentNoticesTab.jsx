import React from 'react';
import { motion } from 'framer-motion';
import { Pin, ChevronRight, Image as ImageIcon } from 'lucide-react';
import { stripHtml, getFirstParagraph } from '../../utils/textUtils';

const StudentNoticesTab = ({
    filteredNotices,
    openNoticeDetail
}) => {
    return (
        <div className="animate-fade-in pb-32">
            <div className="px-5 pt-5 pb-4 sticky top-0 bg-tossGrey50/95 backdrop-blur-xl z-20 border-b border-tossGrey200/50 mb-6">
                <h2 className="text-2xl font-bold text-tossGrey900 tracking-tight flex items-center gap-1.5">
                    공지사항
                </h2>
            </div>

            <div className="px-5 space-y-4">
                {filteredNotices.length === 0 ? (
                    <div className="text-center py-20 text-tossGrey400 font-bold">등록된 공지사항이 없습니다.</div>
                ) : (
                    filteredNotices.map(n => (
                        <motion.div
                            key={n.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            onClick={() => openNoticeDetail(n)}
                            className="bg-white p-6 rounded-toss-xl shadow-toss-standard border-none btn-tactile cursor-pointer hover:shadow-toss-elevated text-left"
                        >
                            <div className="flex justify-between items-start mb-3">
                                <div className="flex items-center gap-2">
                                    {n.is_sticky && (
                                        <span className="flex items-center gap-1.5 px-3 py-1.5 bg-tossWarning/10 text-tossWarning rounded-full text-[10px] font-bold whitespace-nowrap shrink-0">
                                            <Pin size={12} className="fill-tossWarning" /> 공지
                                        </span>
                                    )}
                                    <h3 className={`font-bold text-base leading-tight line-clamp-1 ${n.is_sticky ? 'text-tossWarning' : 'text-tossGrey800'}`}>{n.title}</h3>
                                </div>
                                {n.is_recruiting && <span className="px-2.5 py-1 bg-tossBlueLight text-tossBlue rounded-full text-[10px] font-bold">모집중</span>}
                            </div>
                            {/* Thumbnail */}
                            {(n.images?.length > 0 || n.image_url) && (
                                <div className="mb-4 rounded-toss-lg overflow-hidden h-36 bg-tossGrey50 border border-tossGrey100 relative shadow-inner">
                                    <img src={n.images?.length > 0 ? n.images[0] : n.image_url} alt="thumbnail" className="w-full h-full object-cover" />
                                    {n.images?.length > 1 && <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur-md text-white text-[10px] font-bold px-3 py-1 rounded-full border border-white/10">+{n.images.length - 1}</div>}
                                </div>
                            )}
                            <p className="text-sm text-tossGrey600 line-clamp-1 mb-4 leading-relaxed font-medium">{getFirstParagraph(n.content)}</p>
                            <div className="flex justify-between items-center text-[10px] text-tossGrey400 border-t border-tossGrey100 pt-4 font-bold uppercase tracking-wider">
                                <span>{new Date(n.created_at).toLocaleDateString()}</span>
                                <span className="flex items-center gap-1.5 text-tossBlue">상세보기 <ChevronRight size={12} /></span>
                            </div>
                        </motion.div>
                    ))
                )}
            </div>
        </div>
    );
};

export default StudentNoticesTab;
