export const CONTENT_POST_TYPE = 'content_post';
export const parseContentPost = item => { try { const meta=JSON.parse(item?.description||'{}'); if(meta?.type!==CONTENT_POST_TYPE)return null; return {...item,location:meta.location||'',short_description:meta.short_description||'',body:meta.body||'',sort_order:Number.isFinite(Number(meta.sort_order))?Number(meta.sort_order):null}; } catch{return null;} };
export const serializeContentPost = ({location,short_description,body,sort_order}) => JSON.stringify({type:CONTENT_POST_TYPE,version:1,location:location.trim(),short_description:short_description.trim(),body,sort_order:Number.isFinite(Number(sort_order))?Number(sort_order):null});
export const sortContentPosts = posts => [...posts].sort((a,b)=>{
 const orderA=Number.isFinite(Number(a.sort_order))?Number(a.sort_order):Number.MAX_SAFE_INTEGER;
 const orderB=Number.isFinite(Number(b.sort_order))?Number(b.sort_order):Number.MAX_SAFE_INTEGER;
 if(orderA!==orderB)return orderA-orderB;
 return new Date(b.created_at||0)-new Date(a.created_at||0);
});
export const centerLabel = region => region==='강서'?'이높플레이스':'하이픈';
