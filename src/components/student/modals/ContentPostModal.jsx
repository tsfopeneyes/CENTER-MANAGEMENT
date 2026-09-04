import React, { useEffect } from "react";
import { MapPin, Pencil, Trash2, X } from "lucide-react";
import ContentImage from "../../common/ContentImage";

export default function ContentPostModal({ post, onClose, onEdit, onDelete }) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[500] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-5" onClick={onClose}>
      <article className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-[28px] bg-white shadow-2xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:rounded-[28px]" onClick={(event) => event.stopPropagation()}>
        {post.image_url && (
          <ContentImage src={post.image_url} alt={`${post.name} 대표 이미지`} className="w-full" imageClassName="block h-auto" />
        )}
        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black tracking-tight text-tossGrey900">{post.name}</h2>
              {post.short_description && <p className="mt-2 text-sm font-medium leading-6 text-tossGrey600">{post.short_description}</p>}
            </div>
            <button type="button" onClick={onClose} aria-label="콘텐츠 상세 닫기" className="shrink-0 rounded-full bg-tossGrey100 p-2.5 text-tossGrey500"><X size={20} /></button>
          </div>
          <div className="my-6 flex items-center gap-3 rounded-2xl bg-tossGrey50 p-4">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-blue-600"><MapPin size={17} /></span>
            <div><p className="text-[11px] font-bold text-tossGrey500">위치</p><p className="text-sm font-extrabold text-tossGrey900">{post.location}</p></div>
          </div>
          <div className="prose prose-sm max-w-none text-tossGrey800" dangerouslySetInnerHTML={{ __html: post.body }} />
          {(onEdit || onDelete) && (
            <div className="mt-7 flex gap-2 border-t border-tossGrey100 pt-5">
              {onEdit && <button type="button" onClick={onEdit} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 text-sm font-bold text-white"><Pencil size={16} />수정</button>}
              {onDelete && <button type="button" onClick={onDelete} className="flex items-center justify-center gap-2 rounded-xl bg-red-50 px-5 py-3.5 text-sm font-bold text-red-500"><Trash2 size={16} />삭제</button>}
            </div>
          )}
        </div>
      </article>
    </div>
  );
}
