import React, { useState } from 'react';
import { supabase } from '../../supabaseClient';
import { User, Smartphone, School, Calendar, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { findMatchingGuestAccount, normalizeSchoolName } from '../../utils/userUtils';
import { buildGuestPrivacyPreferences, parseGuestBirthDate } from '../../utils/guestBirthUtils';
import DatePicker from '../common/DatePicker';

const GuestEntryForm = ({ onSuccess, onCancel }) => {
    const [formData, setFormData] = useState({
        name: '',
        school: '',
        birth: '',
        phone: ''
    });
    const [privacyConsent, setPrivacyConsent] = useState(false);
    const [guardianConsent, setGuardianConsent] = useState(false);
    const [guardian, setGuardian] = useState({ name: '', phone: '', relation: '' });
    const [loading, setLoading] = useState(false);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handlePhoneChange = (e) => {
        let val = e.target.value.replace(/[^0-9]/g, '');
        if (val.length > 11) val = val.slice(0, 11);
        let formatted = val;
        if (val.length > 3 && val.length <= 7) {
            formatted = `${val.slice(0, 3)}-${val.slice(3)}`;
        } else if (val.length > 7) {
            formatted = `${val.slice(0, 3)}-${val.slice(3, 7)}-${val.slice(7)}`;
        }
        setFormData(prev => ({ ...prev, phone: formatted }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        const birthInfo = parseGuestBirthDate(formData.birth);
        if (!birthInfo) {
            alert('생년월일을 정확히 입력해주세요.');
            return;
        }
        if (!privacyConsent) {
            alert('개인정보 수집·이용에 동의해주세요.');
            return;
        }
        if (birthInfo.isUnder14 && (!guardian.name.trim() || !guardian.phone.trim() || !guardian.relation.trim() || !guardianConsent)) {
            alert('만 14세 미만은 법정대리인 정보와 동의 확인이 필요합니다.');
            return;
        }
        if (birthInfo.isUnder14 && guardian.phone.replace(/[^0-9]/g, '').length < 10) {
            alert('법정대리인 연락처를 정확히 입력해주세요.');
            return;
        }

        setLoading(true);
        try {
            const cleanName = formData.name.trim();
            const cleanSchool = normalizeSchoolName(formData.school);
            const { data: guestCandidates, error: guestLookupError } = await supabase
                .from('users')
                .select('*')
                .in('name', [cleanName, `${cleanName}(guest)`])
                .eq('user_group', '게스트');
            if (guestLookupError) throw guestLookupError;

            const existingGuest = findMatchingGuestAccount(guestCandidates, cleanName, cleanSchool);
            if (existingGuest) {
                const updates = {
                    birth: birthInfo.yymmdd,
                    guardian_name: birthInfo.isUnder14 ? guardian.name.trim() : null,
                    guardian_phone: birthInfo.isUnder14 ? guardian.phone.trim() : null,
                    guardian_relation: birthInfo.isUnder14 ? guardian.relation.trim() : null,
                    preferences: buildGuestPrivacyPreferences(existingGuest.preferences, birthInfo.isUnder14),
                };
                const { data: updatedGuest, error: updateError } = await supabase
                    .from('users').update(updates).eq('id', existingGuest.id).select().single();
                if (updateError) throw updateError;
                if (onSuccess) onSuccess(updatedGuest);
                return;
            }

            const { data: memberCandidates, error: memberLookupError } = await supabase
                .from('users')
                .select('id, name, school, user_group')
                .eq('name', cleanName)
                .neq('user_group', '게스트');
            if (memberLookupError) throw memberLookupError;
            const matchingMember = (memberCandidates || []).find(candidate =>
                normalizeSchoolName(candidate.school).replace(/\s+/g, '') === cleanSchool.replace(/\s+/g, '')
            );
            if (matchingMember) {
                throw new Error('이미 가입된 정식 회원입니다. 게스트 입장이 아닌 기존 회원 체크인을 이용해주세요.');
            }

            // Generate a unique dummy phone number to satisfy constraints
            let uniquePhone = '';
            let isUnique = false;
            let retries = 0;
            
            while (!isUnique && retries < 10) {
                const random8Digits = Math.floor(10000000 + Math.random() * 90000000).toString();
                const testPhone = `010-${random8Digits.slice(0, 4)}-${random8Digits.slice(4)}`;
                const { data: existing } = await supabase
                    .from('users')
                    .select('id')
                    .eq('phone', testPhone)
                    .maybeSingle();
                if (!existing) {
                    uniquePhone = testPhone;
                    isUnique = true;
                }
                retries++;
            }

            if (!uniquePhone) {
                throw new Error("임시 전화번호 생성 실패. 다시 시도해 주세요.");
            }

            const phoneParts = uniquePhone.split('-');
            const back4 = phoneParts[2];
            const memoText = `[가입일: ${new Date().toLocaleDateString()}] [게스트 입장 완료]`;

            // 이름은 원문 그대로 저장하고 회원 유형으로 게스트를 구분한다.
            const { data: newUser, error } = await supabase.from('users').insert([{
                name: cleanName,
                gender: 'M', // default filler
                school: cleanSchool,
                birth: birthInfo.yymmdd,
                phone: uniquePhone,
                phone_back4: back4,
                guardian_name: birthInfo.isUnder14 ? guardian.name.trim() : null,
                guardian_phone: birthInfo.isUnder14 ? guardian.phone.trim() : null,
                guardian_relation: birthInfo.isUnder14 ? guardian.relation.trim() : null,
                preferences: buildGuestPrivacyPreferences(null, birthInfo.isUnder14),
                user_group: '게스트',
                password: null, // default filler
                role: 'student',
                status: 'approved',
                memo: memoText
            }]).select().single();

            if (error) throw error;

            // Trigger the kiosk action immediately with the new user object
            if (onSuccess) onSuccess(newUser);

        } catch (err) {
            console.error('Guest Entry Error:', err);
            alert(`입장 처리 중 오류가 발생했습니다.\n${err.message || '다시 시도해 주세요.'}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
            <div>
                <label className="block text-xs font-black text-slate-400 mb-1 ml-1 uppercase">이름</label>
                <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
                    <input
                        type="text"
                        name="name"
                        required
                        value={formData.name}
                        onChange={handleChange}
                        placeholder="이름을 입력하세요"
                        className="w-full pl-10 pr-4 py-3 sm:py-4 bg-slate-50 border border-slate-100 rounded-xl sm:rounded-2xl focus:ring-4 focus:ring-blue-500/10 focus:bg-white outline-none font-bold"
                    />
                </div>
            </div>

            <div>
                <label className="block text-xs font-black text-slate-400 mb-1 ml-1 uppercase">학교 / 소속</label>
                <div className="relative">
                    <School className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
                    <input
                        type="text"
                        name="school"
                        required
                        value={formData.school}
                        onChange={handleChange}
                        placeholder="소속 학교 입력 (예: OO고)"
                        className="w-full pl-10 pr-4 py-3 sm:py-4 bg-slate-50 border border-slate-100 rounded-xl sm:rounded-2xl focus:ring-4 focus:ring-blue-500/10 focus:bg-white outline-none font-bold"
                    />
                </div>
            </div>

            <div>
                <label className="block text-xs font-black text-slate-400 mb-1 ml-1 uppercase">생년월일</label>
                <DatePicker label="생년월일" required max={new Date().toLocaleDateString('en-CA')} value={formData.birth} onChange={(birth) => setFormData(prev => ({ ...prev, birth }))} />
            </div>

            {parseGuestBirthDate(formData.birth)?.isUnder14 && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-3">
                    <p className="text-xs font-black text-amber-800">만 14세 미만은 법정대리인 동의가 필요합니다.</p>
                    <div className="grid grid-cols-2 gap-2">
                        <input required value={guardian.name} onChange={(e) => setGuardian(prev => ({ ...prev, name: e.target.value }))} placeholder="보호자 이름" className="rounded-xl border border-amber-200 px-3 py-2 text-sm font-bold" />
                        <input required value={guardian.relation} onChange={(e) => setGuardian(prev => ({ ...prev, relation: e.target.value }))} placeholder="관계" className="rounded-xl border border-amber-200 px-3 py-2 text-sm font-bold" />
                    </div>
                    <input type="tel" required value={guardian.phone} onChange={(e) => setGuardian(prev => ({ ...prev, phone: e.target.value.replace(/[^0-9-]/g, '').slice(0, 13) }))} placeholder="보호자 연락처" className="w-full rounded-xl border border-amber-200 px-3 py-2 text-sm font-bold" />
                    <label className="flex gap-2 text-xs text-amber-900"><input type="checkbox" checked={guardianConsent} onChange={(e) => setGuardianConsent(e.target.checked)} />법정대리인이 수집·이용에 동의합니다.</label>
                </div>
            )}

            <label className="flex items-start gap-2 rounded-2xl bg-slate-50 p-4 text-xs leading-relaxed text-slate-600">
                <input type="checkbox" required checked={privacyConsent} onChange={(e) => setPrivacyConsent(e.target.checked)} className="mt-0.5" />
                <span><strong>필수 개인정보 수집·이용 동의</strong><br />이름·학교·생년월일을 게스트 확인, 방문 기록 및 연령대 분석에 사용하며 게스트 계정 삭제 또는 정식 회원 전환 시까지 보관합니다.</span>
            </label>

            <button
                type="submit"
                disabled={loading || !formData.name.trim() || !formData.school.trim() || !parseGuestBirthDate(formData.birth) || !privacyConsent}
                className="w-full mt-6 py-4 sm:py-5 bg-indigo-600 text-white rounded-2xl font-black transition-all shadow-lg active:scale-95 disabled:bg-slate-300 disabled:shadow-none hover:bg-indigo-700 text-lg sm:text-xl"
            >
                {loading ? '입장 처리 중...' : '게스트로 바로 입장하기'}
            </button>
        </form>
    );
};

export default GuestEntryForm;
