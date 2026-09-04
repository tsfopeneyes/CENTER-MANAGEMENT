import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Camera, MessageCircle, Send, Trash2, X } from 'lucide-react';
import NoticeReactions from '../NoticeReactions';
import UserAvatar from '../../common/UserAvatar';
import { challengeCommunityApi } from '../../../api/challengeCommunityApi';
import { compressImage } from '../../../utils/imageUtils';
import { supabase } from '../../../supabaseClient';
import { getKSTDateString } from '../../../utils/dateUtils';

export default function ChallengeCommunityModal({ notice, user, onClose, onMissionCompleted }) {
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [content, setContent] = useState('');
    const [imageFile, setImageFile] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [commentInputs, setCommentInputs] = useState({});
    const fileRef = useRef(null);
    const missions = notice.challenge_missions || [];
    const today = getKSTDateString(new Date());
    const myResponse = notice.__myResponse || {};
    const nextMission = useMemo(() => missions.find(m => !myResponse.challenge_mission_statuses?.[m.id]?.completed) || null, [missions, myResponse]);

    const refresh = async () => {
        try { setPosts(await challengeCommunityApi.fetchPosts(notice.id, user.id)); }
        catch (error) { console.error(error); }
        finally { setLoading(false); }
    };

    useEffect(() => { refresh(); }, [notice.id, user.id]);

    const uploadImage = async () => {
        if (!imageFile) return null;
        const compressed = await compressImage(imageFile);
        const extension = imageFile.name.split('.').pop() || 'jpg';
        const path = `challenge-community/${notice.id}/${user.id}/${Date.now()}.${extension}`;
        const { error } = await supabase.storage.from('notice-images').upload(path, compressed);
        if (error) throw error;
        return supabase.storage.from('notice-images').getPublicUrl(path).data.publicUrl;
    };

    const submitPost = async () => {
        if ((!content.trim() && !imageFile) || submitting) return;
        setSubmitting(true);
        try {
            const imageUrl = await uploadImage();
            await challengeCommunityApi.createPost({ challengeId: notice.id, authorId: user.id, content, imageUrl, missionId: nextMission?.id, missionDate: nextMission ? today : null });
            setContent(''); setImageFile(null);
            await refresh();
            if (nextMission) onMissionCompleted?.();
        } catch (error) {
            console.error(error);
            alert('챌린지 글을 등록하지 못했습니다. 잠시 후 다시 시도해주세요.');
        } finally { setSubmitting(false); }
    };

    const toggleReaction = async (postId, emoji) => {
        try { await challengeCommunityApi.toggleReaction(postId, user.id, emoji); await refresh(); }
        catch (error) { console.error(error); alert('이모지 반응을 저장하지 못했습니다.'); }
    };

    const submitComment = async postId => {
        const value = (commentInputs[postId] || '').trim();
        if (!value) return;
        try { await challengeCommunityApi.createComment(postId, user.id, value); setCommentInputs(v => ({ ...v, [postId]: '' })); await refresh(); }
        catch (error) { console.error(error); alert('댓글을 저장하지 못했습니다.'); }
    };

    return <div className="fixed inset-0 z-[260] bg-white flex flex-col">
        <header className="shrink-0 border-b border-tossGrey100 bg-white/95 backdrop-blur px-4 py-3 flex items-center gap-3">
            <button onClick={onClose} className="p-2 rounded-full hover:bg-tossGrey100"><ArrowLeft size={21}/></button>
            <div className="min-w-0"><h2 className="font-black text-tossGrey900 truncate">{notice.title}</h2><p className="text-[11px] font-bold text-tossGrey500">참여자 전용 챌린지 커뮤니티</p></div>
            <button onClick={onClose} className="ml-auto p-2 rounded-full hover:bg-tossGrey100"><X size={20}/></button>
        </header>
        <main className="flex-1 overflow-y-auto bg-tossGrey50/70">
            <div className="max-w-2xl mx-auto p-4 space-y-4">
                <section className="bg-white rounded-3xl border border-tossGrey200 p-4 shadow-sm">
                    {nextMission && <div className="mb-3 rounded-2xl bg-tossBlueLight px-3 py-2"><p className="text-[11px] font-black text-tossBlue">글을 올리면 다음 미션 자동 완료</p><p className="text-sm font-bold text-tossGrey900 mt-0.5">{nextMission.title}</p></div>}
                    <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="오늘의 이야기를 함께 나눠주세요" className="w-full min-h-24 resize-none outline-none text-sm leading-6" />
                    {imageFile && <div className="flex items-center justify-between rounded-xl bg-tossGrey50 px-3 py-2 text-xs font-bold"><span className="truncate">{imageFile.name}</span><button onClick={() => setImageFile(null)}><X size={15}/></button></div>}
                    <div className="mt-3 flex items-center gap-2 border-t border-tossGrey100 pt-3">
                        <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => setImageFile(e.target.files?.[0] || null)}/>
                        <button onClick={() => fileRef.current?.click()} className="p-2.5 rounded-xl bg-tossGrey50 text-tossGrey600"><Camera size={19}/></button>
                        <button onClick={submitPost} disabled={submitting || (!content.trim() && !imageFile)} className="ml-auto px-5 py-2.5 rounded-xl bg-tossBlue text-white text-xs font-black disabled:opacity-40">{submitting ? '등록 중...' : '게시하기'}</button>
                    </div>
                </section>
                {loading ? <p className="py-12 text-center text-sm text-tossGrey400">불러오는 중...</p> : posts.length === 0 ? <p className="py-12 text-center text-sm font-bold text-tossGrey400">첫 번째 기록을 남겨보세요.</p> : posts.map(post => <article key={post.id} className="bg-white rounded-3xl border border-tossGrey200 p-4 shadow-sm">
                    <div className="flex gap-3"><UserAvatar user={post.author} size="w-9 h-9"/><div><p className="text-sm font-black">{post.author?.name}</p><p className="text-[10px] text-tossGrey400">{new Date(post.created_at).toLocaleString('ko-KR')}</p></div>{post.author_id === user.id && <button onClick={async()=>{if(confirm('이 글을 삭제할까요?')){await challengeCommunityApi.deletePost(post.id); refresh();}}} className="ml-auto p-2 text-tossGrey400 hover:text-red-500"><Trash2 size={16}/></button>}</div>
                    {post.mission_id && <span className="inline-block mt-3 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black text-emerald-700">미션 인증 완료</span>}
                    {post.content && <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-tossGrey850">{post.content}</p>}
                    {post.image_url && <img src={post.image_url} alt="챌린지 인증" className="mt-3 max-h-[460px] w-full rounded-2xl object-cover"/>}
                    <div className="mt-3"><NoticeReactions reactions={post.challenge_community_reactions || []} currentUserId={user.id} onToggleReaction={emoji => toggleReaction(post.id, emoji)}/></div>
                    <div className="mt-3 border-t border-tossGrey100 pt-3 space-y-3">
                        {(post.challenge_community_comments || []).sort((a,b)=>new Date(a.created_at)-new Date(b.created_at)).map(comment => <div key={comment.id} className="flex gap-2"><UserAvatar user={comment.author} size="w-7 h-7"/><div className="rounded-2xl bg-tossGrey50 px-3 py-2"><p className="text-[11px] font-black">{comment.author?.name}</p><p className="text-xs mt-0.5">{comment.content}</p></div></div>)}
                        <div className="flex items-center gap-2"><MessageCircle size={16} className="text-tossGrey400"/><input value={commentInputs[post.id] || ''} onChange={e=>setCommentInputs(v=>({...v,[post.id]:e.target.value}))} onKeyDown={e=>{if(e.key==='Enter') submitComment(post.id)}} placeholder="댓글 남기기" className="flex-1 rounded-xl bg-tossGrey50 px-3 py-2 text-xs outline-none"/><button onClick={()=>submitComment(post.id)} className="p-2 text-tossBlue"><Send size={16}/></button></div>
                    </div>
                </article>)}
            </div>
        </main>
    </div>;
}
