import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { supabase } from '../../../../../supabaseClient';
import IntuitiveTimePicker from '../../../../common/IntuitiveTimePicker';
import DateTimeFields from './DateTimeFields';
import { CATEGORIES } from '../../utils/constants';
import { splitDateTime, joinDateTime } from '../../utils/noticeHelpers';
import { Calendar, CheckCircle2, Bell, Users, ChevronDown, ChevronUp, ToggleLeft, ToggleRight } from 'lucide-react';

const PUSH_TIMINGS = [
    ['AT_START', '모집 시작 시', '대상 지역 또는 전체 이용자'],
    ['BEFORE_PROGRAM_1D', '일정 하루 전', '신청 완료자에게 자동 발송'],
    ['BEFORE_PROGRAM_1H', '일정 1시간 전', '신청 완료자에게 자동 발송'],
    ['CUSTOM', '날짜·시간 지정', '원하는 시간과 대상 설정'],
    ['NOW', '지금 즉시', '저장 후 선택 대상에게 발송'],
];

const PUSH_AUDIENCES = [
    ['TARGET_REGIONS', '프로그램 대상 지역', '선택한 지역에 속한 이용자'],
    ['ALL', '전체 이용자', '푸시 수신이 가능한 모든 이용자'],
    ['APPLICANTS', '신청 완료자', '이 프로그램의 신청 완료 이용자'],
];

const PostSettings = ({ formData, updateField, mode, noticeId }) => {
    const [audiencePreview, setAudiencePreview] = useState({});
    const pushPlans = Array.isArray(formData.recruitment_push_plans) ? formData.recruitment_push_plans : [];
    const isPushActive = pushPlans.length > 0;
    const setPushPlans = plans => {
        updateField('recruitment_push_plans', plans);
        updateField('recruitment_push_enabled', plans.length > 0);
        updateField('recruitment_push_timing', plans[0]?.timing || 'OFF');
        updateField('recruitment_push_audience', plans[0]?.audience || 'TARGET_REGIONS');
    };
    const togglePushPlan = timing => {
        if (pushPlans.some(plan => plan.timing === timing)) {
            setPushPlans(pushPlans.filter(plan => plan.timing !== timing));
            return;
        }
        const applicantTiming = timing === 'BEFORE_PROGRAM_1D' || timing === 'BEFORE_PROGRAM_1H';
        setPushPlans([...pushPlans, {
            id: timing.toLowerCase(), timing,
            audience: applicantTiming ? 'APPLICANTS' : 'TARGET_REGIONS',
            scheduled_at: ''
        }]);
    };
    const updatePushPlan = (timing, patch) => setPushPlans(pushPlans.map(plan => plan.timing === timing ? {...plan, ...patch} : plan));
    useEffect(() => {
        if (mode !== CATEGORIES.PROGRAM || !pushPlans.length) {
            setAudiencePreview({});
            return undefined;
        }
        let active = true;
        const timer = setTimeout(async () => {
            const entries = await Promise.all(pushPlans.map(async plan => {
                const { data, error } = await supabase.functions.invoke('send-push', { body: {
                    action: 'preview-program-push', noticeId: noticeId || null,
                    programAudience: plan.audience,
                    programTiming: plan.timing,
                    targetRegions: formData.target_regions || []
                }});
                return [plan.timing, error ? { error: true } : data];
            }));
            if (active) setAudiencePreview(Object.fromEntries(entries));
        }, 300);
        return () => { active = false; clearTimeout(timer); };
    }, [mode, noticeId, formData.recruitment_push_plans, formData.target_regions]);
    // Only show these settings for NOTICE or PROGRAM mode
    if (mode !== CATEGORIES.NOTICE && mode !== CATEGORIES.PROGRAM) {
        return null;
    }

    return (
        <div className="space-y-4">
            <p className="text-xs font-bold text-gray-400 ml-1">게시글 설정</p>
            {mode === CATEGORIES.PROGRAM && (
                <div className={`bg-white border rounded-2xl overflow-hidden shadow-sm transition-all duration-200 ${isPushActive ? 'border-blue-300 shadow-md' : 'border-slate-200/80 hover:border-slate-300'}`}>
                    <button type="button" onClick={() => {
                        setPushPlans(isPushActive ? [] : [{id:'at_start',timing:'AT_START',audience:'TARGET_REGIONS',scheduled_at:''}]);
                    }} className="w-full p-4 sm:p-5 flex items-center justify-between bg-white hover:bg-slate-50/60 transition-colors cursor-pointer select-none">
                        <div className="flex items-center gap-3">
                            <div className={`p-2.5 rounded-xl transition-colors ${isPushActive ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-400'}`}>
                                <Bell size={18} />
                            </div>
                            <div className="flex flex-col items-start text-left">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-bold text-slate-800">푸시 발송 설정</span>
                                    <span className={`text-[11px] font-extrabold px-2.5 py-0.5 rounded-md border ${isPushActive ? 'bg-blue-50 text-blue-600 border-blue-200/60' : 'bg-slate-100 text-slate-500 border-slate-200/60'}`}>
                                        {isPushActive ? '푸시 발송 (활성화)' : '미사용 (비활성화)'}
                                    </span>
                                </div>
                                <span className="text-[11px] text-slate-400 font-medium mt-0.5">발송 시점과 이용자 대상을 설정합니다. 프로그램 저장만으로는 발송되지 않습니다.</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            {isPushActive ? <ToggleRight size={28} className="text-blue-600" /> : <ToggleLeft size={28} className="text-slate-300" />}
                            {isPushActive ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
                        </div>
                    </button>
                    {isPushActive && <div className="p-4 sm:p-5 border-t border-slate-100 space-y-5 animate-fade-in">
                        <div className="space-y-2">
                            <p className="text-xs font-black text-gray-700">발송 계획 <span className="ml-1 font-semibold text-blue-600">여러 개 선택 가능</span></p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                {PUSH_TIMINGS.map(([value, label, description]) => {
                                    const selected = pushPlans.some(plan => plan.timing === value);
                                    return <button key={value} type="button" onClick={() => togglePushPlan(value)} className={`relative min-h-[76px] rounded-xl border p-3 pr-9 text-left transition ${selected ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-gray-200 bg-gray-50 hover:bg-gray-100'}`}>
                                        <span className={`block text-sm font-black ${selected ? 'text-blue-700' : 'text-gray-700'}`}>{label}</span>
                                        <span className="mt-1 block text-[11px] font-semibold leading-4 text-gray-500">{description}</span>
                                        {selected && <CheckCircle2 size={18} className="absolute right-3 top-3 text-blue-600"/>}
                                    </button>;
                                })}
                            </div>
                        </div>
                        {pushPlans.map(plan => {
                            const fixedApplicants = plan.timing === 'BEFORE_PROGRAM_1D' || plan.timing === 'BEFORE_PROGRAM_1H';
                            const preview = audiencePreview[plan.timing];
                            const timingLabel = PUSH_TIMINGS.find(item => item[0] === plan.timing)?.[1] || '푸시';
                            const audiences = plan.timing === 'AT_START' ? PUSH_AUDIENCES.filter(item => item[0] !== 'APPLICANTS') : PUSH_AUDIENCES;
                            return <div key={plan.timing} className="rounded-xl border border-blue-100 bg-blue-50/40 p-3 space-y-3">
                                <div className="flex items-center gap-1.5"><Bell size={14} className="text-blue-600"/><p className="text-xs font-black text-gray-700">{timingLabel} 설정</p></div>
                                {plan.timing === 'CUSTOM' && <DateTimeFields label="푸시 예약" value={plan.scheduled_at || ''} onChange={value => updatePushPlan(plan.timing,{scheduled_at:value})} required/>}
                                {fixedApplicants ? <div className="rounded-xl border border-blue-300 bg-white px-3 py-3">
                                    <span className="block text-sm font-black text-blue-700">신청 완료자</span><span className="mt-0.5 block text-[11px] font-semibold text-gray-500">프로그램 일정 기준으로 신청을 완료한 이용자</span>
                                </div> : <div className="space-y-2">
                                    <div className="flex items-center gap-1.5"><Users size={14} className="text-gray-500"/><p className="text-xs font-black text-gray-700">발송 대상</p></div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{audiences.map(([value,label,description]) => {
                                        const selected=plan.audience===value;
                                        return <button key={value} type="button" onClick={()=>updatePushPlan(plan.timing,{audience:value})} className={`flex items-center justify-between rounded-xl border px-3 py-3 text-left transition ${selected?'border-blue-500 bg-white ring-1 ring-blue-500':'border-gray-200 bg-white/70 hover:bg-white'}`}>
                                            <span><span className={`block text-sm font-black ${selected?'text-blue-700':'text-gray-700'}`}>{label}</span><span className="mt-0.5 block text-[11px] font-semibold text-gray-500">{description}</span></span>{selected&&<CheckCircle2 size={18} className="shrink-0 text-blue-600"/>}
                                        </button>;
                                    })}</div>
                                </div>}
                                <div className="rounded-lg bg-white px-3 py-2 text-[11px] font-bold text-slate-600">{preview?.error?'수신 가능 인원은 서버 기능 적용 후 표시됩니다.':preview?`대상 ${preview.userCount||0}명 · 푸시 수신 가능 ${preview.pushUserCount||0}명`:'수신 가능 인원을 확인하고 있어요.'}</div>
                                {plan.timing==='NOW'&&<div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-bold text-red-600">저장하면 선택한 대상에게 즉시 발송되며 되돌릴 수 없습니다.</div>}
                            </div>;
                        })}
                        <p className="text-[11px] font-semibold text-gray-500">관심 알림 신청자의 모집 시작 알림은 이 설정과 별개로 항상 한 번 발송됩니다. 같은 발송 계획 안에서는 이용자별 중복을 제거합니다.</p>
                        {formData.guest_properties?.recruitment_push_result && (
                            <div className="flex flex-col gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                                <span className="text-xs font-bold text-emerald-700">발송 결과: 대상 {formData.guest_properties.recruitment_push_result.target_count || 0}명 · 성공 {formData.guest_properties.recruitment_push_result.success_count || 0}기기 · 실패 {formData.guest_properties.recruitment_push_result.failure_count || 0}기기</span>
                                <button type="button" className="shrink-0 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-[11px] font-black text-emerald-700"
                                    onClick={() => {
                                        if (!window.confirm('이미 발송한 푸시를 다시 발송하도록 설정할까요? 저장하면 선택한 대상에게 다시 발송됩니다.')) return;
                                        updateField('guest_properties', {...formData.guest_properties, recruitment_push_dispatched_at: null, recruitment_push_immediate_dispatched_at: null, recruitment_push_result: null});
                                        setPushPlans([{id:'now',timing:'NOW',audience:'TARGET_REGIONS',scheduled_at:''}]);
                                    }}>다시 발송 설정</button>
                            </div>
                        )}
                        <div className="rounded-xl bg-slate-50 px-3 py-2.5 text-xs font-bold text-slate-600">
                            상태: 푸시 계획 {pushPlans.length}개 설정 · 프로그램 저장과 각 푸시 발송은 분리됩니다.
                        </div>
                    </div>}
                </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <label className="flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-1 sm:gap-2 px-2 py-3 sm:py-2.5 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition border border-gray-100 text-center sm:text-left">
                    <input 
                        type="checkbox" 
                        checked={formData.is_sticky} 
                        onChange={e => updateField('is_sticky', e.target.checked)} 
                        className="w-4 h-4 text-orange-600 rounded" 
                    />
                    <span className="text-[12px] sm:text-sm font-bold text-gray-700 tracking-tight leading-tight">고정 공지</span>
                </label>

                {mode !== CATEGORIES.PROGRAM && (
                    <label className="flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-1 sm:gap-2 px-2 py-3 sm:py-2.5 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition border border-gray-100 text-center sm:text-left">
                        <input 
                            type="checkbox" 
                            checked={formData.is_recruiting} 
                            onChange={e => updateField('is_recruiting', e.target.checked)} 
                            className="w-4 h-4 text-blue-600 rounded" 
                        />
                        <span className="text-[12px] sm:text-sm font-bold text-gray-700 tracking-tight leading-tight">참석여부 모집</span>
                    </label>
                )}

                {mode !== CATEGORIES.PROGRAM && (
                    <label className="flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-1 sm:gap-2 px-2 py-3 sm:py-2.5 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition border border-gray-100 text-center sm:text-left">
                        <input
                            type="checkbox"
                            checked={formData.send_push}
                            onChange={e => updateField('send_push', e.target.checked)}
                            className="w-4 h-4 text-red-600 rounded"
                        />
                        <span className="text-[12px] sm:text-sm font-bold text-gray-700 tracking-tight leading-tight shrink-0">🔔 저장 즉시 푸시</span>
                    </label>
                )}

                <label className="flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-1 sm:gap-2 px-2 py-3 sm:py-2.5 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition border border-gray-100 text-center sm:text-left">
                    <input 
                        type="checkbox" 
                        checked={formData.is_poll} 
                        onChange={e => updateField('is_poll', e.target.checked)} 
                        className="w-4 h-4 text-purple-600 rounded" 
                    />
                    <span className="text-[12px] sm:text-sm font-bold text-gray-700 tracking-tight leading-tight shrink-0">📊 투표 열기</span>
                </label>
            </div>
            {mode !== CATEGORIES.PROGRAM && formData.send_push && (
                <p className="px-1 text-[11px] font-bold text-amber-600">
                    저장 버튼을 누르면 즉시 한 번 발송됩니다. 예약 발송이 아닙니다.
                </p>
            )}

            {/* Poll Deadline Settings (Visible if is_poll is checked) */}
            {formData.is_poll && (
                <div className="mt-4 border border-purple-200 rounded-2xl bg-white overflow-hidden shadow-sm animate-fade-in">
                    <div className="bg-purple-50/50 px-4 py-3 border-b border-purple-100 flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-purple-500 rounded-full" />
                        <span className="text-xs font-bold text-purple-700 tracking-wide uppercase">투표 세부 설정</span>
                    </div>
                    
                    {/* Deadline Row */}
                    <div className="flex flex-col sm:flex-row border-b border-purple-100">
                        <div className="relative flex-1 border-b sm:border-b-0 sm:border-r border-purple-100 flex items-center">
                            <Calendar className="absolute left-4 text-purple-400 shrink-0" size={20} />
                            <input
                                type="date"
                                value={splitDateTime(formData.poll_deadline).date}
                                onChange={e => {
                                    const newDate = joinDateTime(e.target.value, splitDateTime(formData.poll_deadline).time);
                                    updateField('poll_deadline', newDate);
                                }}
                                className="w-full pl-12 pr-4 py-4 bg-transparent outline-none font-bold text-gray-700 text-sm"
                            />
                        </div>
                        <div className="flex-1">
                            <IntuitiveTimePicker
                                value={splitDateTime(formData.poll_deadline).time}
                                onChange={time => {
                                    const newDate = joinDateTime(splitDateTime(formData.poll_deadline).date, time);
                                    updateField('poll_deadline', newDate);
                                }}
                            />
                        </div>
                    </div>

                    {/* Option Count Row */}
                    <div className="flex flex-col sm:flex-row">
                        <button
                            type="button"
                            onClick={() => updateField('allow_multiple_votes', false)}
                            className={`flex flex-1 items-center justify-center gap-2 py-4 text-sm font-bold transition-colors border-b sm:border-b-0 sm:border-r border-purple-100 ${
                                !formData.allow_multiple_votes 
                                ? 'bg-purple-600 text-white' 
                                : 'bg-transparent text-gray-500 hover:bg-purple-50'
                            }`}
                        >
                            {!formData.allow_multiple_votes && <CheckCircle2 size={16} />} 
                            단일투표 (1개만)
                        </button>
                        <button
                            type="button"
                            onClick={() => updateField('allow_multiple_votes', true)}
                            className={`flex flex-1 items-center justify-center gap-2 py-4 text-sm font-bold transition-colors ${
                                formData.allow_multiple_votes 
                                ? 'bg-purple-600 text-white' 
                                : 'bg-transparent text-gray-500 hover:bg-purple-50'
                            }`}
                        >
                            {formData.allow_multiple_votes && <CheckCircle2 size={16} />}
                            중복투표 (다중선택)
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

PostSettings.propTypes = {
    formData: PropTypes.object.isRequired,
    updateField: PropTypes.func.isRequired,
    mode: PropTypes.string.isRequired,
    noticeId: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
};

export default React.memo(PostSettings);
