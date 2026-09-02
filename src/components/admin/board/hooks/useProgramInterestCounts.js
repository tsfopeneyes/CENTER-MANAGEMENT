import {useEffect,useState} from 'react';
import {supabase} from '../../../../supabaseClient';
import {fetchProgramInterestCounts} from '../../../../api/programInterestCountsApi';

export const useProgramInterestCounts = notices => {
    const idsKey = JSON.stringify([...new Set((notices || []).filter(n=>n.category==='PROGRAM').map(n=>String(n.id)))].sort());
    const [result,setResult] = useState({key:null,counts:{},error:null,loading:true});
    useEffect(()=>{
        const ids=JSON.parse(idsKey);
        let active=true, version=0;
        const refresh=async()=>{
            const request=++version;
            if(!ids.length){setResult({key:idsKey,counts:{},error:null,loading:false});return;}
            setResult({key:idsKey,counts:{},error:null,loading:true});
            try {
                const counts=await fetchProgramInterestCounts(supabase,ids);
                if(active && request===version)setResult({key:idsKey,counts,error:null,loading:false});
            } catch(error){if(active && request===version)setResult({key:idsKey,counts:{},error:error.message,loading:false});}
        };
        const visible=()=>{if(document.visibilityState==='visible')refresh();};
        refresh();
        window.addEventListener('focus',visible);
        window.addEventListener('recruitment-interest-changed',visible);
        document.addEventListener('visibilitychange',visible);
        const timer=window.setInterval(visible,30000);
        const {data}=supabase.auth.onAuthStateChange(()=>queueMicrotask(()=>{if(active)refresh();}));
        return ()=>{
            active=false;version++;
            window.clearInterval(timer);
            window.removeEventListener('focus',visible);
            window.removeEventListener('recruitment-interest-changed',visible);
            document.removeEventListener('visibilitychange',visible);
            data.subscription.unsubscribe();
        };
    },[idsKey]);
    return result.key===idsKey ? result : {counts:{},error:null,loading:true};
};
