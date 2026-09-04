import React,{useEffect,useMemo,useState} from 'react';
import {ArrowDown,ArrowLeft,ArrowUp,ImagePlus,MapPin,Pencil,Plus,Store,Trash2} from 'lucide-react';
import {supabase} from '../../../supabaseClient';
import AdminPageHeader from '../common/AdminPageHeader';
import ModernEditor from '../../common/ModernEditor';
import {centerLabel,parseContentPost,serializeContentPost,sortContentPosts} from '../../../utils/contentPosts';
import {compressImage} from '../../../utils/imageUtils';
import {cachedAccountProfileId,uploadAccountImage} from '../../../auth/accountMedia';
import {isAccountAuthEnabled} from '../../../auth/accountAuthRuntime';
import ContentPostModal from '../../student/modals/ContentPostModal';
import ContentImage from '../../common/ContentImage';

const blank={school_id:'',name:'',location:'',short_description:'',body:'',image_url:'',is_active:true,sort_order:null};

const uploadContentImage=async imageFile=>{
 const file=await compressImage(imageFile);
 const profileId=cachedAccountProfileId();
 if(!isAccountAuthEnabled()||!profileId)throw new Error('관리자 계정 인증 상태를 확인하지 못했습니다. 다시 로그인해주세요.');
 return uploadAccountImage({profileId,kind:'notice',file});
};

export default function AdminContents(){
 const [rows,setRows]=useState([]),[schools,setSchools]=useState([]),[filter,setFilter]=useState('ALL');
 const [form,setForm]=useState(blank),[editing,setEditing]=useState(null),[writing,setWriting]=useState(false),[selected,setSelected]=useState(null),[saving,setSaving]=useState(false),[reordering,setReordering]=useState(false);
 const [imageFile,setImageFile]=useState(null);
 const load=async()=>{const [a,b]=await Promise.all([supabase.from('contents').select('*,schools(name,region)').order('created_at',{ascending:false}),supabase.from('schools').select('id,name,region').in('region',['강동','강서']).order('region')]);if(a.error)throw a.error;setRows(sortContentPosts((a.data||[]).map(parseContentPost).filter(Boolean)));setSchools(b.data||[])};
 useEffect(()=>{load().catch(()=>alert('콘텐츠를 불러오지 못했습니다.'));},[]);
 const visible=useMemo(()=>rows.filter(r=>filter==='ALL'||r.schools?.region===filter),[rows,filter]);
 const centerSchools=useMemo(()=>['강동','강서'].map(region=>schools.find(s=>s.region===region&&s.name===region)||schools.find(s=>s.region===region)).filter(Boolean),[schools]);
 const start=(row=null)=>{const sid=row?.school_id||centerSchools[0]?.id||'';setEditing(row?.id||null);setImageFile(null);setForm(row?{school_id:row.school_id,name:row.name,location:row.location,short_description:row.short_description,body:row.body,image_url:row.image_url||'',is_active:row.is_active!==false,sort_order:row.sort_order}:{...blank,school_id:sid,location:centerSchools.find(s=>s.id===sid)?.region==='강서'?'이높플레이스':'2F SQUARE'});setWriting(true)};
 const save=async e=>{e.preventDefault();if(!form.name.trim()||!form.location.trim()||!form.body.replace(/<[^>]*>/g,'').trim())return alert('제목, 위치, 상세 내용을 입력해주세요.');setSaving(true);try{let imageUrl=form.image_url.trim()||null;if(imageFile)imageUrl=await uploadContentImage(imageFile);const sortOrder=form.sort_order??(rows.filter(row=>row.school_id===form.school_id).length+1);const payload={school_id:form.school_id,name:form.name.trim(),category:'보드게임',image_url:imageUrl,is_active:true,description:serializeContentPost({...form,sort_order:sortOrder})};const r=editing?await supabase.from('contents').update(payload).eq('id',editing):await supabase.from('contents').insert(payload);if(r.error)throw r.error;setWriting(false);setImageFile(null);await load()}catch(error){console.error('Failed to save content post:',error);const detail=error?.message?`\n${error.message}`:'';alert(`콘텐츠를 저장하지 못했습니다.${detail}`)}finally{setSaving(false)}};
 const remove=async row=>{if(!confirm(`'${row.name}' 게시글을 삭제할까요?`))return;const r=await supabase.from('contents').delete().eq('id',row.id);if(r.error)return alert('삭제하지 못했습니다.');setSelected(null);load()};
 const move=async(row,direction)=>{const index=visible.findIndex(item=>item.id===row.id),target=index+direction;if(index<0||target<0||target>=visible.length||reordering)return;const reordered=[...visible];[reordered[index],reordered[target]]=[reordered[target],reordered[index]];setReordering(true);try{const results=await Promise.all(reordered.map((item,order)=>supabase.from('contents').update({description:serializeContentPost({...item,sort_order:order+1})}).eq('id',item.id)));const failed=results.find(result=>result.error);if(failed)throw failed.error;await load()}catch(error){console.error('Failed to reorder contents:',error);alert('콘텐츠 순서를 저장하지 못했습니다.')}finally{setReordering(false)}};

 if(writing)return <div className="space-y-6 animate-fade-in-up">
   <AdminPageHeader title={editing?'콘텐츠 수정':'새 콘텐츠 작성'} subtitle="소개와 보유 중인 콘텐츠를 하나의 게시글로 작성합니다." icon={<Store/>} actions={<button type="button" onClick={()=>setWriting(false)} className="flex items-center gap-2 rounded-xl bg-gray-100 px-5 py-3 text-sm font-bold text-gray-600"><ArrowLeft size={17}/>목록으로</button>}/>
   <form onSubmit={save} className="space-y-6 rounded-3xl border border-gray-100 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] md:space-y-8 md:p-8">
    <section className="space-y-4">
     <input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="제목을 입력하세요" required className="w-full rounded-xl border border-gray-100 bg-gray-50 p-3 text-base font-bold outline-none transition focus:border-blue-500 focus:bg-white md:p-4 md:text-lg"/>
     <input value={form.short_description} onChange={e=>setForm({...form,short_description:e.target.value})} placeholder="리스트에 보여질 한 줄 소개 멘트를 입력하세요 (선택 사항)" maxLength={100} className="w-full rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm outline-none transition focus:border-blue-500 focus:bg-white md:text-base"/>
     <div className="min-h-[300px]"><ModernEditor content={form.body} onChange={body=>setForm(f=>({...f,body}))} placeholder="내용을 입력하세요..."/></div>
    </section>

    <section className="border-t border-gray-50 pt-4">
     <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
       <Field label="공간"><select value={form.school_id} onChange={e=>{const s=centerSchools.find(x=>x.id===e.target.value);setForm({...form,school_id:e.target.value,location:s?.region==='강서'?'이높플레이스':'2F SQUARE'})}}>{centerSchools.map(s=><option key={s.id} value={s.id}>{centerLabel(s.region)}</option>)}</select></Field>
       <Field label="세부 위치"><select value={form.location} onChange={e=>setForm({...form,location:e.target.value})}>{centerSchools.find(s=>s.id===form.school_id)?.region==='강서'?<option value="이높플레이스">이높플레이스</option>:<><option value="B1F STAGE">B1F STAGE</option><option value="2F SQUARE">2F SQUARE</option><option value="3F ROUND">3F ROUND</option><option value="4F CONNECT 1">4F CONNECT 1</option><option value="4F CONNECT 2">4F CONNECT 2</option><option value="4F CONNECT 3">4F CONNECT 3</option><option value="4F CONNECT ROOM">4F CONNECT ROOM</option><option value="6F LOUNGE">6F LOUNGE</option></>}</select></Field>
      </div>
     </div>
    </section>
    <section className="space-y-4 border-t border-gray-50 pt-4"><p className="ml-1 text-xs font-bold text-gray-400">대표 이미지</p><div className="grid gap-3 md:grid-cols-2"><Field label="이미지 URL"><input value={form.image_url} onChange={e=>{setForm({...form,image_url:e.target.value});if(e.target.value)setImageFile(null)}} placeholder="https://"/></Field><label className="block"><span className="ml-1 text-xs font-bold text-gray-400">파일 업로드</span><span className="mt-2 flex min-h-[46px] cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-blue-200 bg-blue-50 px-4 text-sm font-bold text-blue-600 hover:bg-blue-100"><ImagePlus size={17}/>{imageFile?imageFile.name:'이미지 선택'}<input type="file" accept="image/*" className="hidden" onChange={e=>{const file=e.target.files?.[0]||null;setImageFile(file);if(file)setForm(f=>({...f,image_url:''}))}}/></span></label></div>{form.image_url&&<ContentImage src={form.image_url} alt="대표 이미지 미리보기" className="max-h-64 w-full rounded-2xl" imageClassName="max-h-64"/>}</section>
    <div className="mt-8 flex justify-end gap-3 border-t border-gray-100 pt-6"><button type="button" onClick={()=>setWriting(false)} className="rounded-xl bg-gray-100 px-7 py-3.5 font-bold text-gray-600">취소</button><button disabled={saving} className="rounded-xl bg-blue-600 px-9 py-3.5 font-bold text-white disabled:opacity-50">{saving?'저장 중…':editing?'수정 완료':'등록하기'}</button></div>
   </form>
  </div>;

 return <div className="space-y-6 animate-fade-in-up">
  <AdminPageHeader title="콘텐츠 관리" subtitle="센터의 콘텐츠를 게시글로 작성하고 관리합니다." icon={<Store/>} actions={<button onClick={()=>start()} className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white"><Plus size={17}/>새 콘텐츠 작성</button>}/>
  <section className="rounded-3xl bg-white p-6 shadow-sm"><header className="mb-6 flex items-center justify-between"><h3 className="text-lg font-black">콘텐츠 게시글</h3><div className="flex rounded-xl bg-gray-100 p-1">{[['ALL','전체'],['강동','하이픈'],['강서','이높플레이스']].map(([v,l])=><button key={v} onClick={()=>setFilter(v)} className={`rounded-lg px-3 py-2 text-xs font-bold ${filter===v?'bg-white text-blue-600 shadow-sm':'text-gray-500'}`}>{l}</button>)}</div></header>
   {visible.length?<div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{visible.map((row,index)=><article key={row.id} onClick={()=>setSelected(row)} className="group cursor-pointer overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm transition hover:shadow-lg">{row.image_url?<img src={row.image_url} alt="" className="aspect-[16/9] w-full object-cover"/>:<div className="flex aspect-[16/9] items-center justify-center bg-blue-50 text-blue-500"><Store size={36}/></div>}<div className="p-5"><div className="mb-3 flex gap-2"><b className="rounded-md bg-blue-50 px-2 py-1 text-[10px] text-blue-600">{centerLabel(row.schools?.region)}</b><b className="rounded-md bg-gray-100 px-2 py-1 text-[10px] text-gray-600">CONTENT</b></div><h4 className="text-lg font-extrabold transition group-hover:text-blue-600">{row.name}</h4><p className="mt-2 line-clamp-2 min-h-10 text-sm text-gray-500">{row.short_description}</p><div className="mt-4 flex items-center gap-1 border-t pt-4 text-sm font-semibold text-gray-600"><MapPin size={15}/><span className="mr-auto">{row.location}</span><button type="button" disabled={index===0||reordering} aria-label={`${row.name} 위로 이동`} onClick={e=>{e.stopPropagation();move(row,-1)}} className="rounded-lg p-2 text-gray-400 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-20"><ArrowUp size={15}/></button><button type="button" disabled={index===visible.length-1||reordering} aria-label={`${row.name} 아래로 이동`} onClick={e=>{e.stopPropagation();move(row,1)}} className="rounded-lg p-2 text-gray-400 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-20"><ArrowDown size={15}/></button><button type="button" aria-label={`${row.name} 수정`} onClick={e=>{e.stopPropagation();start(row)}} className="p-2 text-gray-300 hover:text-blue-600"><Pencil size={15}/></button><button type="button" aria-label={`${row.name} 삭제`} onClick={e=>{e.stopPropagation();remove(row)}} className="p-2 text-gray-300 hover:text-red-500"><Trash2 size={15}/></button></div></div></article>)}</div>:<div className="py-24 text-center font-semibold text-gray-400">작성된 콘텐츠 게시글이 없습니다.</div>}
  </section>
  {selected&&<ContentPostModal post={selected} onClose={()=>setSelected(null)} onEdit={()=>start(selected)} onDelete={()=>remove(selected)}/>}
 </div>;
}

function Field({label,children}){return <label className="block"><span className="ml-1 text-xs font-bold text-gray-400">{label}</span>{React.cloneElement(children,{className:`mt-2 w-full rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm font-semibold text-gray-800 outline-none transition focus:border-blue-500 focus:bg-white ${children.props.className||''}`})}</label>}
