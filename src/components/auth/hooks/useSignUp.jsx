import { useState } from 'react';
import { supabase } from '../../../supabaseClient';
import { TERMS_VERSION } from '../../../constants/appConstants';
import { hashPassword } from '../../../utils/hashUtils';
import { normalizeSchoolName } from '../../../utils/userUtils';
import { isVisitorOrTemporary } from '../../../utils/memberAccountType';
import { getAccountAuthClient, isAccountAuthEnabled } from '../../../auth/accountAuthRuntime';

export const useSignUp = (onSuccess, guestUserId = null) => {
    const [formData, setFormData] = useState({
        name: '', gender: '', school: '', church: '', birth: '', phone: '', user_group: '청소년',
        password: '', confirmPassword: '',
        guardianName: '', guardianPhone: '', guardianRelation: '',
        isSchoolChurch: true
    });
    const [agreements, setAgreements] = useState({ art1: false, art2: false, art3: false, art4: false });
    const [loading, setLoading] = useState(false);
    const [showConsentModal, setShowConsentModal] = useState(false);

    const isUnder14 = (birth) => {
        if (!birth || birth.length !== 6) return false;
        const yy = parseInt(birth.substring(0, 2));
        const mm = parseInt(birth.substring(2, 4)) - 1;
        const dd = parseInt(birth.substring(4, 6));
        const currentYear = new Date().getFullYear();
        const fullYear = yy <= (currentYear % 100) ? 2000 + yy : 1900 + yy;
        const birthDate = new Date(fullYear, mm, dd);
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
        return age < 14;
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const formatPhone = (val) => {
        let cleaned = val.replace(/[^0-9]/g, '');
        if (cleaned.length > 11) cleaned = cleaned.slice(0, 11);
        if (cleaned.length > 3 && cleaned.length <= 7) return `${cleaned.slice(0, 3)}-${cleaned.slice(3)}`;
        if (cleaned.length > 7) return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 7)}-${cleaned.slice(7)}`;
        return cleaned;
    };

    const handlePhoneChange = (e) => setFormData(prev => ({ ...prev, phone: formatPhone(e.target.value) }));
    const handleGuardianPhoneChange = (e) => setFormData(prev => ({ ...prev, guardianPhone: formatPhone(e.target.value) }));

    const handleSignUp = async (e) => {
        e.preventDefault();
        const under14 = isUnder14(formData.birth);

        if (!agreements.art1 || !agreements.art2 || !agreements.art3 || !agreements.art4) {
            alert('모든 이용 약관 및 개인정보 수집에 동의해 주세요.'); return;
        }
        if (!formData.gender) {
            alert('성별을 선택해 주세요.'); return;
        }
        if (formData.phone.replace(/[^0-9]/g, '').length < 11) {
            alert('핸드폰 번호 11자리를 올바르게 입력해주세요.'); return;
        }
        if (under14) {
            if (!formData.guardianName || !formData.guardianPhone || !formData.guardianRelation) {
                alert('만 14세 미만은 보호자 정보를 모두 입력해야 합니다.'); return;
            }
            if (formData.guardianPhone.replace(/[^0-9]/g, '').length < 11) {
                alert('보호자 핸드폰 번호 11자리를 올바르게 입력해주세요.'); return;
            }
        }

        setLoading(true);
        try {
            if (formData.phone.replace(/[^0-9]/g, '').length < 11) {
                alert('핸드폰 번호 형식이 올바르지 않습니다.');
                setLoading(false); return;
            }

            if (isAccountAuthEnabled()) {
                await getAccountAuthClient().registration.submit({
                    password: formData.password,
                    details: {
                        formData,
                        agreements,
                        termsVersion: TERMS_VERSION,
                        ...(guestUserId ? { guestUserId } : {})
                    }
                });

                if (under14) alert('만 14세 미만 회원은 임시 가입되었습니다. 관리자가 보호자 동의 확인 후 정식 회원으로 승인됩니다.');
                else alert('가입이 완료되었습니다! 로그인해 주세요.');
                if (onSuccess) onSuccess();
                return;
            }

            let targetUserId = guestUserId;
            let isAutoMerge = !!guestUserId;
            let existingMemo = null;

            if (guestUserId) {
                const { data: currentGuest, error: guestErr } = await supabase
                    .from('users')
                    .select('memo')
                    .eq('id', guestUserId)
                    .maybeSingle();
                if (!guestErr && currentGuest) {
                    existingMemo = currentGuest.memo;
                }

                // Check if the phone they entered is already registered by another non-guest user
                const { data: dupUser } = await supabase
                    .from('users')
                    .select('id, name, user_group')
                    .eq('phone', formData.phone)
                    .maybeSingle();
                if (dupUser && dupUser.id !== guestUserId && dupUser.user_group !== '게스트') {
                    alert(`이미 가입된 휴대폰 번호입니다.\n(${dupUser.name}님으로 가입되어 있습니다.)\n로그인 혹은 관리자에게 문의해주세요.`);
                    setLoading(false); return;
                }
            } else {
                const { data: existing, error: checkError } = await supabase
                    .from('users')
                    .select('id, name, school, user_group, preferences, memo')
                    .eq('phone', formData.phone)
                    .maybeSingle();

                if (checkError) throw checkError;

                if (existing) {
                    existingMemo = existing.memo;
                    const isTemporary = isVisitorOrTemporary(existing);

                    if (isTemporary) {
                        targetUserId = existing.id;
                        isAutoMerge = true;
                    } else {
                        alert(`이미 가입된 휴대폰 번호입니다.\n(${existing.name}님으로 가입되어 있습니다.)\n로그인 혹은 관리자에게 문의해주세요.`);
                        setLoading(false); return;
                    }
                }
            }

            const phoneParts = formData.phone.split('-');
            const back4 = phoneParts[2];
            const hashedPassword = await hashPassword(formData.password);

            const userData = {
                name: formData.name, gender: formData.gender, school: normalizeSchoolName(formData.school), church: formData.church,
                birth: formData.birth, phone: formData.phone, phone_back4: back4,
                user_group: formData.user_group, password: hashedPassword,
                role: 'user', status: under14 ? 'pending' : 'approved',
                guardian_name: under14 ? formData.guardianName : null,
                guardian_phone: under14 ? formData.guardianPhone : null,
                guardian_relation: under14 ? formData.guardianRelation : null,
                memo: isAutoMerge ? (existingMemo ? `${existingMemo}\n[자동병합: ${new Date().toLocaleDateString()}]` : `[자동병합: ${new Date().toLocaleDateString()}]`) : null,
                preferences: { terms_agreed: true, terms_version: TERMS_VERSION, is_school_church: formData.isSchoolChurch }
            };

            if (isAutoMerge) {
                // Keep the exact same UUID. Bypasses the need for foreign key migrations!
                userData.id = targetUserId;
                const { error: upgradeError } = await supabase.rpc('upgrade_guest_account', {
                    p_user_id: targetUserId,
                    p_user_data: userData,
                    p_hashed_password: hashedPassword
                });
                if (upgradeError) {
                    console.warn('upgrade_guest_account RPC failed, falling back to direct table update:', upgradeError);
                    const { error: updateError } = await supabase.from('users').update({
                        ...userData,
                        password: hashedPassword
                    }).eq('id', targetUserId);
                    if (updateError) throw updateError;
                }
            } else {
                const fakeEmail = `${formData.phone.replace(/[^0-9]/g, '')}@youth-access.app`;

                // 1. Natively register the user into Supabase Auth!
                const { data: authData, error: authError } = await supabase.auth.signUp({
                    email: fakeEmail,
                    password: hashedPassword
                });

                if (authError) throw authError;

                const newUserId = authData.user.id;
                userData.id = newUserId;

                const { error: insertError } = await supabase.from('users').insert([userData]);
                if (insertError) throw insertError;
            }

            if (under14) alert('만 14세 미만 회원은 임시 가입되었습니다. 관리자가 보호자 동의 확인 후 정식 회원으로 승인됩니다.');
            else alert('가입이 완료되었습니다! 로그인해 주세요.');

            if (onSuccess) onSuccess();

        } catch (err) {
            console.error('Sign Up Error Details:', err);
            alert(`가입 중 오류가 발생했습니다.\n내용: ${err.message || err.error_description || JSON.stringify(err)}`);
        } finally {
            setLoading(false);
        }
    };

    return {
        formData, setFormData,
        agreements, setAgreements,
        loading, showConsentModal, setShowConsentModal,
        isUnder14, handleChange, handlePhoneChange, handleGuardianPhoneChange, handleSignUp
    };
};
