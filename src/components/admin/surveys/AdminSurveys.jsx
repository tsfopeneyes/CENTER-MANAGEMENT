import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ClipboardList, Copy, Link2, Plus, Search, Users } from 'lucide-react';
import { supabase } from '../../../supabaseClient';
import { isAdminOrStaff } from '../../../utils/userUtils';
import useModalClose from '../../../hooks/useModalClose';
import AdminPageHeader from '../common/AdminPageHeader';
import SurveyEditor from './SurveyEditor';
import { resolveSurveyCenterCode, SURVEY_CENTERS } from '../../../utils/surveyAssignments';

const DEFAULTS = {
    CHECKIN: {
        mode: 'SURVEY', question: '오늘 하이픈에서 무엇을 하고 싶나요?',
        options: [
            { id: '1', emoji: '🍽️', label: '밥 먹고 쉬고 싶어요.', recommendTitle: '식사 & 휴게 공간', recommendText: '푸드존과 휴게 공간을 이용해 보세요.' },
            { id: '2', emoji: '🎲', label: '친구들과 놀고 싶어요.', recommendTitle: '놀이 공간', recommendText: '보드게임과 멀티미디어존을 이용해 보세요.' }
        ]
    },
    CHECKOUT: {
        mode: 'SURVEY', question: '오늘 센터에서의 시간은 어떠셨나요?',
        options: [
            { id: '1', emoji: '😊', label: '교제 및 휴식', recommendTitle: '휴식 세션 완료', recommendText: '편안한 휴식이 되었기를 바랍니다!' },
            { id: '2', emoji: '📚', label: '개인 할 일', recommendTitle: '집중 공부 완료', recommendText: '오늘도 수고 많으셨습니다!' }
        ]
    }
};

const TYPE_LABEL = { CHECKIN: '입실', CHECKOUT: '퇴실' };

const getSurveyTitle = survey => {
    const config = survey?.config || {};
    const textMode = config.mode === 'QUESTION_QA' || config.mode === 'FEEDBACK_QA';
    return (textMode ? config.qaQuestion : config.question)
        || config.question
        || config.qaQuestion
        || survey?.title
        || '질문 없음';
};

// Legacy rows stored option ids instead of labels. This mapping is the frozen
// meaning of those ids and must not follow later edits to the active survey.
const LEGACY_CHECKIN_OPTION_LABELS = {
    '1': '당 충전하며 쉬고 싶어요',
    '2': '아무 생각 없이 놀고 싶어요',
    '3': '누군가와 이야기하고 싶어요',
    '4': '기도하거나 예배하고 싶어요',
    '5': '조용히 집중하고 싶어요',
    '6': '아직 잘 모르겠어요'
};

const parseConfig = (notice, type) => {
    try { return notice?.content ? JSON.parse(notice.content) : DEFAULTS[type]; }
    catch { return DEFAULTS[type]; }
};

const AdminSurveys = ({ notices = [], responses = [], visitNotes = [], users = [], locations = [], logs = [], fetchData }) => {
    const [tab, setTab] = useState('list');
    const [surveys, setSurveys] = useState([]);
    const [selected, setSelected] = useState(null);
    const [saving, setSaving] = useState(false);
    const [query, setQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState('ALL');
    const [tableReady, setTableReady] = useState(true);
    const [assignments, setAssignments] = useState([]);
    const [assignmentsReady, setAssignmentsReady] = useState(true);
    const [resultCenterFilter, setResultCenterFilter] = useState('ALL');
    const [surveyLogs, setSurveyLogs] = useState([]);

    useModalClose(tab !== 'list', () => {
        setTab('list');
        setSelected(null);
    });

    const legacySurveys = useMemo(() => ['CHECKIN', 'CHECKOUT'].map(type => {
        const notice = notices.find(n => n.category === 'SYSTEM' && n.title === `${type}_SURVEY_CONFIG`);
        return {
            id: `legacy-${type}`,
            title: `기존 ${TYPE_LABEL[type]} 설문`,
            survey_type: type,
            config: parseConfig(notice, type),
            status: 'ACTIVE',
            is_legacy: true,
            synthetic: true
        };
    }), [notices]);

    const loadSurveys = async () => {
        const { data, error } = await supabase.from('surveys').select('*').order('created_at', { ascending: false });
        if (error) {
            setTableReady(false);
            setSurveys(legacySurveys);
            return;
        }
        setTableReady(true);
        const loaded = data || [];
        const withFallback = [...loaded];
        legacySurveys.forEach(legacy => {
            if (!loaded.some(item => item.survey_type === legacy.survey_type && item.is_legacy)) withFallback.push(legacy);
        });
        setSurveys(withFallback);

        const { data: assignmentRows, error: assignmentError } = await supabase
            .from('survey_assignments')
            .select('*');
        setAssignmentsReady(!assignmentError);
        setAssignments(assignmentError ? [] : (assignmentRows || []));
    };

    const setAssignment = async (centerCode, surveyType, surveyId) => {
        if (!assignmentsReady) return;
        setSaving(true);
        try {
            if (!surveyId) {
                const { error } = await supabase.from('survey_assignments').delete()
                    .eq('center_code', centerCode).eq('survey_type', surveyType);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('survey_assignments').upsert({
                    center_code: centerCode,
                    survey_type: surveyType,
                    survey_id: surveyId,
                    enabled: true,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'center_code,survey_type' });
                if (error) throw error;
                await supabase.from('surveys').update({ status: 'ACTIVE' }).eq('id', surveyId);
            }
            await loadSurveys();
        } catch (error) {
            alert(`설문 연결 실패: ${error.message}`);
        } finally {
            setSaving(false);
        }
    };

    const toggleAssignment = async (survey, centerCode) => {
        if (survey.synthetic || !survey.id || !assignmentsReady || saving) return;
        const current = assignments.find(item => item.center_code === centerCode && item.survey_type === survey.survey_type);
        if (current?.survey_id === survey.id) {
            await setAssignment(centerCode, survey.survey_type, '');
            return;
        }
        if (current?.survey_id) {
            const currentSurvey = surveys.find(item => item.id === current.survey_id);
            const centerLabel = SURVEY_CENTERS.find(center => center.code === centerCode)?.label || centerCode;
            const shouldReplace = window.confirm(`${centerLabel} ${TYPE_LABEL[survey.survey_type]} 설문을\n"${getSurveyTitle(currentSurvey)}"에서\n"${getSurveyTitle(survey)}"(으)로 변경할까요?`);
            if (!shouldReplace) return;
        }
        await setAssignment(centerCode, survey.survey_type, survey.id);
    };

    useEffect(() => { loadSurveys(); }, [legacySurveys]);

    useEffect(() => {
        if (tab !== 'results') return;
        let cancelled = false;
        const loadAllVisitLogs = async () => {
            const rows = [];
            for (let from = 0; ; from += 1000) {
                const { data, error } = await supabase
                    .from('logs')
                    .select('id,user_id,location_id,type,created_at')
                    .in('type', ['CHECKIN', 'CHECKOUT', 'MOVE'])
                    .order('created_at', { ascending: false })
                    .range(from, from + 999);
                if (error) {
                    console.error('Failed to load survey visit history:', error);
                    return;
                }
                rows.push(...(data || []));
                if (!data || data.length < 1000) break;
            }
            if (!cancelled) setSurveyLogs(rows);
        };
        loadAllVisitLogs();
        return () => { cancelled = true; };
    }, [tab]);

    const visibleSurveys = surveys.filter(s => {
        const matchesType = typeFilter === 'ALL' || s.survey_type === typeFilter;
        return matchesType && getSurveyTitle(s).toLowerCase().includes(query.trim().toLowerCase());
    });

    const userMap = new Map(users.map(user => [user.id, user]));
    const locationMap = new Map(locations.map(location => [String(location.id), location.name]));
    const effectiveLogs = surveyLogs.length > 0 ? surveyLogs : logs;
    const visitByUserDay = useMemo(() => {
        const index = new Map();
        effectiveLogs.forEach(log => {
            if (!log.user_id || !log.location_id || !['CHECKIN', 'CHECKOUT', 'MOVE'].includes(log.type)) return;
            const date = new Date(log.created_at || 0).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
            const key = `${log.user_id}:${date}`;
            const current = index.get(key) || [];
            current.push(log);
            index.set(key, current);
        });
        return index;
    }, [effectiveLogs]);
    const excludedTestNames = new Set(['김학생', 'admin', 'jin']);
    const isExcludedResponse = (response) => {
        const user = userMap.get(response.user_id);
        const normalizedName = String(user?.name || '').trim().toLowerCase();
        return isAdminOrStaff(user)
            || excludedTestNames.has(normalizedName)
            || normalizedName.includes('테스트');
    };

    // A check-in survey is requested once for a user's daily entry flow.
    // Keep the first response and ignore later test/retry submissions that day.
    const seenDailyCheckins = new Set();
    const eligibleResponses = [...responses]
        .filter(response => !isExcludedResponse(response))
        .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0))
        .filter(response => {
            const surveyType = response.survey_type || 'CHECKIN';
            if (surveyType !== 'CHECKIN' || !response.user_id) return true;
            const date = response.created_at
                ? new Date(response.created_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
                : 'unknown';
            const surveyKey = response.survey_id || 'legacy-checkin';
            const key = `${surveyKey}:${response.user_id}:${date}`;
            if (seenDailyCheckins.has(key)) return false;
            seenDailyCheckins.add(key);
            return true;
        });

    // The legacy number-entry kiosk stored its checkout survey in visit_notes.
    // Merge those rows into the legacy checkout survey without duplicating days
    // that already have a first-class checkout survey response.
    const responseDayKey = (userId, dateValue) => {
        const date = dateValue
            ? new Date(dateValue).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
            : '';
        return `${userId || ''}:${date}`;
    };
    const existingCheckoutDays = new Set(eligibleResponses
        .filter(response => (response.survey_type || 'CHECKIN') === 'CHECKOUT')
        .map(response => responseDayKey(response.user_id, response.created_at)));
    const legacyCheckoutResponses = visitNotes
        .filter(note => note.user_id && String(note.purpose || '').trim())
        .filter(note => !isExcludedResponse(note))
        .filter(note => !existingCheckoutDays.has(`${note.user_id}:${String(note.visit_date || '').slice(0, 10)}`))
        .map(note => {
            const visitDate = String(note.visit_date || '').slice(0, 10);
            const sameDayVisits = [...(visitByUserDay.get(`${note.user_id}:${visitDate}`) || [])]
                .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
            const visitedCenters = new Set(sameDayVisits
                .map(log => resolveSurveyCenterCode(locationMap.get(String(log.location_id)) || ''))
                .filter(Boolean));
            const matchingVisit = visitedCenters.size === 1
                ? (sameDayVisits.find(log => log.type === 'CHECKOUT') || sameDayVisits[0])
                : null;
            return {
                id: `visit-note-${note.id}`,
                user_id: note.user_id,
                location_id: matchingVisit?.location_id || null,
                survey_id: null,
                survey_type: 'CHECKOUT',
                mode: 'SURVEY',
                selections: String(note.purpose).split(',').map(value => value.trim()).filter(Boolean),
                text_answer: note.checkout_feedback || null,
                created_at: matchingVisit?.created_at || note.updated_at || `${visitDate}T00:00:00+09:00`,
                _legacyVisitNote: true
            };
        });
    const surveyResponses = [...eligibleResponses, ...legacyCheckoutResponses];

    const responseCount = (survey) => surveyResponses.filter(r => {
        if (survey.synthetic || survey.is_legacy) return !r.survey_id && (r.survey_type || 'CHECKIN') === survey.survey_type;
        return r.survey_id === survey.id;
    }).length;

    const openEditor = (survey) => {
        setSelected({ ...survey, config: survey.config || DEFAULTS[survey.survey_type] });
        setTab('edit');
    };

    const createSurvey = (type) => {
        setSelected({ id: null, title: `새 ${TYPE_LABEL[type]} 설문`, survey_type: type, config: DEFAULTS[type], status: 'DRAFT' });
        setTab('edit');
    };

    const saveLegacyNotice = async (survey, config) => {
        const title = `${survey.survey_type}_SURVEY_CONFIG`;
        const existing = notices.find(n => n.category === 'SYSTEM' && n.title === title);
        const payload = { title, category: 'SYSTEM', content: JSON.stringify(config), is_sticky: false, is_recruiting: false };
        const result = existing
            ? await supabase.from('notices').update(payload).eq('id', existing.id)
            : await supabase.from('notices').insert([payload]);
        if (result.error) throw result.error;
    };

    const saveSurvey = async (config) => {
        if (!selected) return;
        setSaving(true);
        try {
            if (selected.synthetic) {
                await saveLegacyNotice(selected, config);
            } else {
                const payload = { title: getSurveyTitle({ ...selected, config }), survey_type: selected.survey_type, config, status: selected.status || 'DRAFT', updated_at: new Date().toISOString() };
                const result = selected.id
                    ? await supabase.from('surveys').update(payload).eq('id', selected.id)
                    : await supabase.from('surveys').insert([payload]).select().single();
                if (result.error) throw result.error;
                if (payload.status === 'ACTIVE') await saveLegacyNotice(selected, { ...config, _surveyId: result.data?.id || selected.id });
            }
            await fetchData?.();
            await loadSurveys();
            setTab('list');
            alert('설문이 저장되었습니다.');
        } catch (error) {
            alert(`설문 저장 실패: ${error.message}`);
        } finally { setSaving(false); }
    };

    const activateSurvey = async (survey) => {
        if (survey.synthetic) return openEditor(survey);
        setSaving(true);
        try {
            const { error } = await supabase.from('surveys').update({ status: 'ACTIVE', updated_at: new Date().toISOString() }).eq('id', survey.id);
            if (error) throw error;
            await saveLegacyNotice(survey, { ...survey.config, _surveyId: survey.id });
            await fetchData?.();
            await loadSurveys();
        } catch (error) { alert(`설문 적용 실패: ${error.message}`); }
        finally { setSaving(false); }
    };

    const duplicateSurvey = (survey) => {
        setSelected({ ...survey, id: null, synthetic: false, is_legacy: false, title: `${survey.title} 복사본`, status: 'DRAFT' });
        setTab('edit');
    };

    const resultSurvey = selected || surveys[0];
    useEffect(() => { setResultCenterFilter('ALL'); }, [resultSurvey?.id]);

    const allResultRows = resultSurvey ? surveyResponses.filter(r => {
        if (resultSurvey.synthetic || resultSurvey.is_legacy) return !r.survey_id && (r.survey_type || 'CHECKIN') === resultSurvey.survey_type;
        return r.survey_id === resultSurvey.id;
    }).sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)) : [];
    const inferLocationId = (response) => {
        if (response.location_id) return String(response.location_id);
        const responseTime = new Date(response.created_at || 0).getTime();
        const responseDate = new Date(response.created_at || 0).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
        const expectedType = (response.survey_type || resultSurvey?.survey_type || 'CHECKIN') === 'CHECKOUT' ? 'CHECKOUT' : 'CHECKIN';
        const closest = effectiveLogs
            .filter(log => log.user_id === response.user_id && log.type === expectedType && log.location_id)
            .map(log => ({ log, delta: responseTime - new Date(log.created_at || 0).getTime() }))
            .filter(item => item.delta >= -60_000 && item.delta <= 2 * 60 * 60 * 1000)
            .sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta))[0]?.log;
        if (closest?.location_id) return String(closest.location_id);
        const sameDayVisits = visitByUserDay.get(`${response.user_id}:${responseDate}`) || [];
        const centers = new Set(sameDayVisits
            .map(log => resolveSurveyCenterCode(locationMap.get(String(log.location_id)) || ''))
            .filter(Boolean));
        return centers.size === 1 && sameDayVisits[0]?.location_id ? String(sameDayVisits[0].location_id) : null;
    };
    const responseCenterCache = new Map();
    const getResponseCenterCode = response => {
        if (responseCenterCache.has(response.id)) return responseCenterCache.get(response.id);
        const center = resolveSurveyCenterCode(locationMap.get(inferLocationId(response)) || '') || 'UNKNOWN';
        responseCenterCache.set(response.id, center);
        return center;
    };
    const resultRows = resultCenterFilter === 'ALL'
        ? allResultRows
        : allResultRows.filter(row => getResponseCenterCode(row) === resultCenterFilter);
    const resultOptions = resultSurvey?.config?.options || [];
    const resolveSelectionLabel = (value) => {
        const normalized = String(value ?? '').trim();
        const isLegacyCheckin = (resultSurvey?.synthetic || resultSurvey?.is_legacy)
            && resultSurvey?.survey_type === 'CHECKIN';
        if (isLegacyCheckin && LEGACY_CHECKIN_OPTION_LABELS[normalized]) {
            return LEGACY_CHECKIN_OPTION_LABELS[normalized];
        }
        const option = resultOptions.find(item => String(item.id) === normalized)
            || (!isLegacyCheckin && /^\d+$/.test(normalized) ? resultOptions[Number(normalized) - 1] : null);
        return option?.label || normalized;
    };
    const configuredLabels = new Set(resultOptions.map(option => String(option.label || '').trim()).filter(Boolean));
    const counts = resultRows.reduce((acc, row) => {
        (row.selections || []).forEach(value => {
            const label = resolveSelectionLabel(value);
            if (label && configuredLabels.has(label)) acc[label] = (acc[label] || 0) + 1;
        });
        return acc;
    }, {});
    const centerCounts = {
        ALL: allResultRows.length,
        HAIFN: allResultRows.filter(row => getResponseCenterCode(row) === 'HAIFN').length,
        ENOUGH_PLACE: allResultRows.filter(row => getResponseCenterCode(row) === 'ENOUGH_PLACE').length,
        UNKNOWN: allResultRows.filter(row => getResponseCenterCode(row) === 'UNKNOWN').length
    };

    return (
        <div className="space-y-6 pb-12 animate-fade-in-up">
            <AdminPageHeader title="설문조사" subtitle="입실·퇴실 설문을 만들고 적용하며 응답을 확인합니다" icon={<ClipboardList />} />
            {!tableReady && <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">새 설문 데이터베이스가 아직 적용되지 않아 기존 설문만 표시됩니다.</div>}
            {tab === 'list' && <>
                <section className="rounded-[24px] border border-[#f2f4f6] bg-white p-5 shadow-sm">
                    <div className="flex items-start gap-3 mb-5"><div className="p-2 rounded-xl bg-blue-50 text-blue-600"><Link2 size={19} /></div><div><h2 className="font-bold text-gray-900">현재 적용 현황</h2><p className="text-xs text-gray-500 mt-1">공간별로 현재 노출되는 설문입니다. 연결 변경은 아래 설문 목록에서 할 수 있습니다.</p></div></div>
                    {!assignmentsReady ? <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">연결 설정 데이터베이스를 적용한 후 사용할 수 있습니다.</p> : <div className="grid lg:grid-cols-2 gap-4">
                        {SURVEY_CENTERS.map(center => <div key={center.code} className="rounded-2xl border border-gray-100 bg-gray-50 p-4"><p className="font-bold text-gray-900 mb-3">{center.label}</p><div className="grid sm:grid-cols-2 gap-3">{['CHECKIN', 'CHECKOUT'].map(type => {
                            const surveyId = assignments.find(item => item.center_code === center.code && item.survey_type === type)?.survey_id;
                            const assignedSurvey = surveys.find(survey => survey.id === surveyId);
                            return <div key={type} className="min-w-0 min-h-[104px] rounded-xl border border-gray-100 bg-white px-4 py-3"><span className={`block text-[11px] font-bold ${type === 'CHECKIN' ? 'text-blue-600' : 'text-emerald-600'}`}>{TYPE_LABEL[type]} 설문</span><strong className={`mt-2 block whitespace-normal break-words text-sm leading-6 ${assignedSurvey ? 'text-gray-900' : 'text-gray-400'}`}>{assignedSurvey ? getSurveyTitle(assignedSurvey) : '사용 안 함'}</strong></div>;
                        })}</div></div>)}
                    </div>}
                </section>
                <div className="flex flex-col md:flex-row gap-3 justify-between">
                    <div className="flex gap-2 flex-1">
                        <label className="relative flex-1 max-w-md"><Search className="absolute left-3 top-3 text-gray-400" size={18} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="설문 검색" className="w-full rounded-xl border border-gray-200 bg-white pl-10 pr-3 py-2.5 text-sm outline-none focus:border-blue-500" /></label>
                        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="rounded-xl border border-gray-200 bg-white px-3 text-sm font-bold"><option value="ALL">전체</option><option value="CHECKIN">입실</option><option value="CHECKOUT">퇴실</option></select>
                    </div>
                    <div className="flex gap-2"><button onClick={() => createSurvey('CHECKIN')} disabled={!tableReady} className="px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold flex items-center gap-2 shadow-sm hover:bg-blue-700 disabled:opacity-40"><Plus size={16} />입실 설문</button><button onClick={() => createSurvey('CHECKOUT')} disabled={!tableReady} className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold flex items-center gap-2 shadow-sm hover:bg-emerald-700 disabled:opacity-40"><Plus size={16} />퇴실 설문</button></div>
                </div>
                <div className="rounded-[24px] border border-[#f2f4f6] bg-white overflow-hidden shadow-sm">
                    <div className="hidden md:grid grid-cols-[minmax(260px,1fr)_80px_80px_260px_170px] gap-3 px-5 py-3 bg-gray-50 text-xs font-bold text-gray-500"><span>설문</span><span>구분</span><span>응답</span><span>적용 공간</span><span>관리</span></div>
                    {visibleSurveys.map(survey => <div key={survey.id} role="button" tabIndex={0} onClick={() => { setSelected(survey); setTab('results'); }} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(survey); setTab('results'); } }} className="grid md:grid-cols-[minmax(260px,1fr)_80px_80px_260px_170px] gap-3 items-center px-5 py-4 border-t border-gray-100 cursor-pointer hover:bg-blue-50/40 transition-colors focus:outline-none focus:bg-blue-50">
                        <div><p className="font-bold text-gray-900">{getSurveyTitle(survey)}</p><p className="text-xs text-gray-400 mt-1">{survey.config?.mode === 'QUESTION_QA' || survey.config?.mode === 'FEEDBACK_QA' ? '주관식 설문' : '객관식 설문'}{assignments.filter(item => item.survey_id === survey.id && item.enabled).map(item => ` · ${SURVEY_CENTERS.find(center => center.code === item.center_code)?.label || item.center_code}`).join('')}</p></div>
                        <span className={`w-fit px-2 py-1 text-xs font-bold ${survey.survey_type === 'CHECKIN' ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'}`}>{TYPE_LABEL[survey.survey_type]}</span>
                        <span className="text-left text-sm font-bold text-blue-600">{responseCount(survey)}건</span>
                        <div className="flex flex-wrap gap-2">{SURVEY_CENTERS.map(center => {
                            const connected = assignments.some(item => item.survey_id === survey.id && item.center_code === center.code && item.survey_type === survey.survey_type && item.enabled);
                            return <button key={center.code} type="button" disabled={survey.synthetic || saving || !assignmentsReady} onClick={event => { event.stopPropagation(); toggleAssignment(survey, center.code); }} className={`px-3 py-2 rounded-xl border text-xs font-bold transition-colors disabled:opacity-40 ${connected ? (survey.survey_type === 'CHECKIN' ? 'border-blue-600 bg-blue-600 text-white' : 'border-emerald-600 bg-emerald-600 text-white') : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}>{center.label} {TYPE_LABEL[survey.survey_type]}</button>;
                        })}</div>
                        <div className="flex gap-2"><button onClick={event => { event.stopPropagation(); openEditor(survey); }} className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-xs font-bold hover:bg-gray-50">편집</button><button onClick={event => { event.stopPropagation(); duplicateSurvey(survey); }} disabled={!tableReady} title="복제" className="p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40"><Copy size={15} /></button>{survey.status !== 'ACTIVE' && !survey.synthetic && <button onClick={event => { event.stopPropagation(); activateSurvey(survey); }} disabled={saving} className="px-3 py-2 rounded-xl bg-gray-900 text-white text-xs font-bold">사용 가능</button>}</div>
                    </div>)}
                </div>
            </>}

            {tab === 'edit' && selected && <SurveyEditor type={selected.survey_type} initialConfig={selected.config} onSave={saveSurvey} onCancel={() => setTab('list')} isSaving={saving} />}

            {tab === 'results' && <div className="space-y-5">
                <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm flex flex-col md:flex-row gap-3 justify-between md:items-center"><div className="flex items-center gap-3"><button onClick={() => { setTab('list'); setSelected(null); }} className="p-2 rounded-xl border border-gray-200 bg-white text-gray-600 hover:bg-gray-50" title="설문 목록으로"><ArrowLeft size={18} /></button><div><p className="text-xs font-bold text-blue-600">{TYPE_LABEL[resultSurvey?.survey_type]} 설문 결과</p><h2 className="text-xl font-bold text-gray-900 mt-0.5">{getSurveyTitle(resultSurvey)}</h2></div></div><div className="flex items-center gap-2 text-sm font-bold text-gray-600"><Users size={17} />총 {resultRows.length}건</div></div>
                <div className="flex flex-wrap gap-2 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm" role="group" aria-label="응답 센터 필터">{[
                    { code: 'ALL', label: '전체' },
                    ...SURVEY_CENTERS,
                    { code: 'UNKNOWN', label: '미확인' }
                ].map(center => <button key={center.code} type="button" onClick={() => setResultCenterFilter(center.code)} className={`min-w-[110px] rounded-xl px-4 py-2.5 text-sm font-bold transition-colors ${resultCenterFilter === center.code ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}>{center.label} <span className={resultCenterFilter === center.code ? 'text-white/70' : 'text-gray-400'}>{centerCounts[center.code]}건</span></button>)}</div>
                <div className="grid md:grid-cols-2 gap-4">{Object.entries(counts).sort((a,b) => b[1]-a[1]).map(([label, count]) => <div key={label} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"><div className="flex justify-between gap-3 text-sm font-bold"><span>{label}</span><span>{count}명 · {resultRows.length ? Math.round(count / resultRows.length * 100) : 0}%</span></div><div className="h-2 rounded-full bg-gray-100 mt-3 overflow-hidden"><div className="h-full rounded-full bg-blue-600" style={{ width: `${resultRows.length ? count / resultRows.length * 100 : 0}%` }} /></div></div>)}</div>
                {Object.keys(counts).length === 0 && <div className="rounded-2xl border border-gray-100 bg-white p-10 text-center text-sm text-gray-500 shadow-sm">집계할 객관식 응답이 없습니다.</div>}
                <div className="rounded-[24px] border border-[#f2f4f6] bg-white overflow-x-auto shadow-sm"><table className="w-full text-sm"><thead className="bg-gray-50 text-gray-500"><tr><th className="text-left px-4 py-3">응답자</th><th className="text-left px-4 py-3">선택 응답</th><th className="text-left px-4 py-3">주관식 답변</th><th className="text-left px-4 py-3">센터</th><th className="text-left px-4 py-3">응답 일시</th></tr></thead><tbody>{resultRows.map(row => { const inferredLocationId = inferLocationId(row); return <tr key={row.id} className="border-t border-gray-100"><td className="px-4 py-3 font-bold">{userMap.get(row.user_id)?.name || '알 수 없음'}</td><td className="px-4 py-3">{(row.selections || []).map(resolveSelectionLabel).filter(Boolean).join(', ') || '-'}</td><td className="px-4 py-3 max-w-sm">{row.text_answer || '-'}</td><td className="px-4 py-3">{locationMap.get(inferredLocationId) || '미확인'}</td><td className="px-4 py-3 whitespace-nowrap">{row.created_at ? new Date(row.created_at).toLocaleString('ko-KR') : '-'}</td></tr>; })}</tbody></table>{resultRows.length === 0 && <p className="p-8 text-center text-gray-400">해당 센터의 응답이 없습니다.</p>}</div>
            </div>}
        </div>
    );
};

export default AdminSurveys;
