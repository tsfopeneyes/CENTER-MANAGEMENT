import React, { useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, MessageCircle, Search, Users } from 'lucide-react';
import { supabase } from '../../../supabaseClient';

export default function AdminCommunity() {
    const [channels, setChannels] = useState([]);
    const [posts, setPosts] = useState([]);
    const [selected, setSelected] = useState('ALL');
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(true);

    const load = async () => {
        setLoading(true);
        const [{ data: channelData, error: channelError }, { data: postData, error: postError }] = await Promise.all([
            supabase.from('community_channels').select('*').order('created_at', { ascending: false }),
            supabase.from('community_channel_posts').select('*, author:users!author_id(id,name,school), community_channels(id,name,channel_type), community_channel_comments(count), community_channel_reactions(count)').order('created_at', { ascending: false }).limit(200)
        ]);
        if (channelError || postError) console.error(channelError || postError);
        setChannels(channelData || []); setPosts(postData || []); setLoading(false);
    };
    useEffect(() => { load(); }, []);

    const filtered = useMemo(() => posts.filter(post => {
        if (selected !== 'ALL' && post.channel_id !== selected) return false;
        const needle = query.trim().toLowerCase();
        return !needle || `${post.content} ${post.author?.name || ''} ${post.community_channels?.name || ''}`.toLowerCase().includes(needle);
    }), [posts, selected, query]);

    const toggleHidden = async post => {
        const { error } = await supabase.from('community_channel_posts').update({ is_hidden: !post.is_hidden }).eq('id', post.id);
        if (error) return alert('게시글 상태를 변경하지 못했습니다.');
        setPosts(current => current.map(item => item.id === post.id ? { ...item, is_hidden: !item.is_hidden } : item));
    };

    return <div className="p-5 md:p-8 space-y-6 animate-fade-in-up">
        <div><h1 className="text-2xl font-black text-slate-900">커뮤니티 관리</h1><p className="mt-1 text-sm font-semibold text-slate-400">챌린지부터 향후 프로그램·기수 커뮤니티까지 한곳에서 관리합니다.</p></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-2xl border bg-white p-4"><p className="text-xs font-bold text-slate-400">운영 커뮤니티</p><p className="mt-2 text-2xl font-black">{channels.filter(c=>c.status==='ACTIVE').length}</p></div>
            <div className="rounded-2xl border bg-white p-4"><p className="text-xs font-bold text-slate-400">전체 게시글</p><p className="mt-2 text-2xl font-black">{posts.length}</p></div>
            <div className="rounded-2xl border bg-white p-4"><p className="text-xs font-bold text-slate-400">숨김 게시글</p><p className="mt-2 text-2xl font-black">{posts.filter(p=>p.is_hidden).length}</p></div>
        </div>
        <div className="rounded-3xl border bg-white overflow-hidden">
            <div className="p-4 border-b flex flex-col md:flex-row gap-3">
                <select value={selected} onChange={e=>setSelected(e.target.value)} className="h-11 rounded-xl border px-3 text-sm font-bold"><option value="ALL">전체 커뮤니티</option>{channels.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
                <div className="relative flex-1"><Search size={17} className="absolute left-3 top-3 text-slate-400"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="커뮤니티·작성자·내용 검색" className="w-full h-11 rounded-xl border pl-10 pr-3 text-sm outline-none"/></div>
            </div>
            {loading ? <p className="p-12 text-center text-slate-400">불러오는 중...</p> : filtered.length === 0 ? <p className="p-12 text-center text-slate-400">게시글이 없습니다.</p> : <div className="divide-y">{filtered.map(post=><div key={post.id} className={`p-4 ${post.is_hidden ? 'bg-slate-50 opacity-60' : ''}`}>
                <div className="flex items-start gap-3"><div className="flex-1 min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-black text-blue-600">{post.community_channels?.name}</span><span className="text-xs font-black">{post.author?.name}</span><span className="text-[10px] text-slate-400">{new Date(post.created_at).toLocaleString('ko-KR')}</span></div><p className="mt-2 text-sm text-slate-700 whitespace-pre-wrap">{post.content || '(사진 게시글)'}</p><div className="mt-2 flex gap-3 text-[11px] font-bold text-slate-400"><span className="flex items-center gap-1"><MessageCircle size={13}/>{post.community_channel_comments?.[0]?.count || 0}</span><span className="flex items-center gap-1"><Users size={13}/>{post.community_channel_reactions?.[0]?.count || 0} 반응</span></div></div><button onClick={()=>toggleHidden(post)} className="p-2 rounded-xl border text-slate-500" title={post.is_hidden?'숨김 해제':'게시글 숨기기'}>{post.is_hidden?<Eye size={17}/>:<EyeOff size={17}/>}</button></div>
            </div>)}</div>}
        </div>
    </div>;
}
