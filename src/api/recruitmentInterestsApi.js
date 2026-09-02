import { supabase } from '../supabaseClient';
import { requestRecruitmentPushToken } from '../firebase';
import { saveInterestConfirmation } from '../utils/recruitmentInterestConfirmation';
import { getInterestSessionUser } from '../utils/interestSession';

const check = result => {
    if (result.error) {
        if (['42P01','PGRST205'].includes(result.error.code)) throw new Error('모집 알림 기능을 준비 중입니다. 잠시 후 다시 시도해주세요.');
        if (result.error.code === '23514') throw new Error('모집 일정이 변경되었거나 이미 발송된 알림입니다. 새로고침 후 확인해주세요.');
        throw new Error('알림 신청을 저장하지 못했습니다. 로그인 상태를 확인하고 다시 시도해주세요.');
    }
    return result.data;
};
const sessionUser = () => getInterestSessionUser(supabase.auth);
const requireSameUser = async expected => {
    const id = await sessionUser();
    if (!id || id !== expected) throw new Error('로그인 계정이 변경되었습니다. 다시 시도해주세요.');
    return id;
};

export const recruitmentInterestsApi = {
    requestToken: requestRecruitmentPushToken,
    async status(noticeId) {
        const userId = await sessionUser();
        if (!userId) return {userId:null,enabled:false};
        const row = check(await supabase.from('program_recruitment_interests').select('enabled')
            .eq('notice_id',noticeId).eq('auth_user_id',userId).maybeSingle());
        return {userId,enabled:row?.enabled===true};
    },
    async subscribe(noticeId, token, expectedUserId) {
        const id = await requireSameUser(expectedUserId);
        if (typeof token!=='string' || token.length<20 || token.length>4096) throw new Error('이 기기의 알림 설정을 확인해주세요.');
        const confirmed = async saved => {
            if (!saved?.enabled) return saved;
            try {
                await saveInterestConfirmation(supabase,noticeId,id,requireSameUser);
                return {...saved,bellSaved:true};
            } catch {
                // Interest storage already succeeded; don't misrepresent it as
                // a failed registration or roll back the user's choice.
                return {...saved,bellSaved:false};
            }
        };
        // RLS enforces the signed-in Auth identity, independently of browser
        // profile/localStorage roles. No legacy RPC or public users token write.
        const update = () => supabase.from('program_recruitment_interests')
            .update({enabled:true,fcm_token:token}).eq('notice_id',noticeId).eq('auth_user_id',id)
            .select('enabled').maybeSingle();
        const existing = check(await update());
        if (existing) return confirmed(existing);
        const inserted = await supabase.from('program_recruitment_interests')
            .insert({notice_id:noticeId,auth_user_id:id,enabled:true,fcm_token:token}).select('enabled').single();
        if (inserted.error?.code==='23505') return confirmed(check(await update()));
        return confirmed(check(inserted));
    },
    async cancel(noticeId, expectedUserId) {
        const id = await requireSameUser(expectedUserId);
        return check(await supabase.from('program_recruitment_interests').update({enabled:false})
            .eq('notice_id',noticeId).eq('auth_user_id',id).select('enabled').single());
    },
};
