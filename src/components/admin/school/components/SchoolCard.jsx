import React from 'react';
import { motion } from 'framer-motion';
import { Star, Trash2, School, Users } from 'lucide-react';

const SchoolCard = ({ group, onClick, viewMode, isFavorite, onToggleFavorite, onDeleteSchool }) => {
    const meta = group.metadata;
    const isList = viewMode === 'list';
    const isSeucheoConnected = Array.isArray(meta?.manager_ids) && meta.manager_ids.length > 0;

    const connectionBadge = isSeucheoConnected ? (
        <span className="shrink-0 rounded-full bg-[#e9f2ee] px-2 py-0.5 text-[9px] font-black text-[#3f6f5b] md:px-3 md:py-1 md:text-[10px]">
            스처팀 연결
        </span>
    ) : null;
    const regionBadge = (
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black md:px-3 md:py-1 md:text-[10px] ${meta?.region === '강동' ? 'bg-blue-100 text-blue-700' : meta?.region === '강서' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-500'}`}>
            {meta?.region || '미지정'}
        </span>
    );

    // Card Style Logic
    const cardBaseClass = `bg-white border rounded-[1.5rem] md:rounded-[2rem] shadow-sm cursor-pointer transition-all flex h-full relative group
            ${isFavorite ? 'border-yellow-200 bg-yellow-50/10' : 'border-gray-100 hover:border-indigo-200'}
            ${isFavorite ? 'shadow-md shadow-yellow-100' : ''}
            `;

    // View Mode Specific Styles
    // grid-lg: Current (Large)
    // grid-md: Compact
    // grid-sm: Minimal
    const isSmall = viewMode === 'grid-sm';

    if (isList) {
        return (
            <motion.div
                whileHover={{ x: 4 }}
                whileTap={{ scale: 0.99 }}
                onClick={onClick}
                className={`w-full p-4 flex items-center gap-4 bg-white border border-gray-100 rounded-xl hover:border-indigo-300 transition-all cursor-pointer relative group ${isFavorite ? 'bg-yellow-50/30 border-yellow-200' : ''}`}
            >
                <button
                    onClick={onToggleFavorite}
                    className={`shrink-0 p-2 rounded-full hover:bg-black/5 transition-colors ${isFavorite ? 'text-yellow-400' : 'text-gray-300 group-hover:text-gray-400'}`}
                >
                    <Star size={16} fill={isFavorite ? "currentColor" : "none"} />
                </button>

                <div className="flex-1 min-w-0 flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className="font-black text-gray-800 text-sm truncate">{group.name}</div>
                        <div className="text-gray-300 font-bold text-xs">/</div>
                        <div className="text-xs text-gray-500 font-bold truncate max-w-[200px]">{meta?.club_name || '동아리 정보 없음'}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        {connectionBadge}
                        {regionBadge}
                        {group.students.length === 0 && (
                            <button
                                onClick={(e) => { e.stopPropagation(); onDeleteSchool(group.name); }}
                                className="p-1.5 text-red-300 hover:text-red-500 hover:bg-red-50 rounded-md transition-all opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                                title="학생이 없는 학교 삭제"
                                aria-label={`${group.name} 학교 삭제`}
                            >
                                <Trash2 size={14} />
                            </button>
                        )}
                        <div className="shrink-0 text-right text-xs font-bold text-gray-400 bg-gray-50 px-2 py-1 rounded-lg border border-gray-100">{group.students.length}명</div>
                    </div>
                </div>
            </motion.div>
        );
    }

    return (
        <motion.div
            whileHover={{ y: -5, shadow: "0 20px 25px -5px rgb(0 0 0 / 0.1)" }}
            whileTap={{ scale: 0.98 }}
            onClick={onClick}
            className={`${cardBaseClass} ${isSmall ? 'p-3 md:p-4' : 'p-4 md:p-6'} flex-col justify-between`}
        >
            <button
                onClick={onToggleFavorite}
                className={`absolute top-3 right-3 p-1.5 rounded-full z-10 hover:bg-black/5 transition-colors ${isFavorite ? 'text-yellow-400' : 'text-gray-300 opacity-0 group-hover:opacity-100'}`}
            >
                <Star size={isSmall ? 14 : 18} fill={isFavorite ? "currentColor" : "none"} />
            </button>

            <div>
                <div className="flex justify-between items-start mb-3 md:mb-4 pr-6">
                    <div className={`${isSmall ? 'w-8 h-8' : 'w-10 h-10 md:w-12 md:h-12'} bg-indigo-50 rounded-xl md:rounded-2xl flex items-center justify-center text-indigo-600 shrink-0`}>
                        <School size={isSmall ? 16 : 20} className={isSmall ? '' : 'md:w-6 md:h-6'} />
                    </div>
                    <div className="flex items-center gap-1.5">
                        {group.students.length === 0 && (
                            <button
                                onClick={(e) => { e.stopPropagation(); onDeleteSchool(group.name); }}
                                className="p-1 text-red-300 hover:text-red-500 hover:bg-red-50 rounded transition-all opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                                title="학생이 없는 학교 삭제"
                                aria-label={`${group.name} 학교 삭제`}
                            >
                                <Trash2 size={12} />
                            </button>
                        )}
                        {connectionBadge}
                        {regionBadge}
                    </div>
                </div>

                <div className="mb-0.5 md:mb-1 flex min-w-0 items-center gap-1.5">
                    <h3 className={`${isSmall ? 'text-sm' : 'text-sm md:text-lg'} min-w-0 truncate font-black tracking-tight text-gray-800`}>{group.name}</h3>
                </div>
                <p className={`${isSmall ? 'text-[9px]' : 'text-[10px] md:text-xs'} mb-3 truncate font-bold text-gray-400 md:mb-4`}>{meta?.club_name || '동아리 정보 없음'}</p>
            </div>

            <div className={`flex items-center justify-between ${isSmall ? 'pt-2' : 'pt-3 md:pt-4'} border-t border-gray-50 mt-auto`}>
                <div className="flex items-center gap-1 md:gap-1.5 text-gray-500 shrink-0">
                    <Users size={isSmall ? 10 : 12} className={isSmall ? '' : 'md:w-[14px] md:h-[14px]'} />
                    <span className={`${isSmall ? 'text-[9px]' : 'text-[10px] md:text-xs'} font-bold`}>{group.students.length}명</span>
                </div>
                {!isSmall && (
                    <div className="flex -space-x-1.5 md:-space-x-2">
                        {group.students.slice(0, 3).map((s, i) => (
                            <div key={i} className="w-5 h-5 md:w-6 md:h-6 rounded-full border-[1.5px] md:border-2 border-white bg-gray-200 flex items-center justify-center text-[7px] md:text-[8px] font-bold text-gray-500 overflow-hidden shrink-0">
                                {s.profile_image_url ? <img src={s.profile_image_url} className="w-full h-full object-cover" /> : s.name?.charAt(0)}
                            </div>
                        ))}
                        {group.students.length > 3 && (
                            <div className="w-5 h-5 md:w-6 md:h-6 rounded-full border-[1.5px] md:border-2 border-white bg-gray-100 flex items-center justify-center text-[7px] md:text-[8px] font-bold text-gray-400 shrink-0">
                                +{group.students.length - 3}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </motion.div>
    );
};

export default SchoolCard;
