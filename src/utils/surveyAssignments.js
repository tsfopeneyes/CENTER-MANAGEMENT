import { supabase } from '../supabaseClient';

export const SURVEY_CENTERS = [
    { code: 'HAIFN', label: '하이픈' },
    { code: 'ENOUGH_PLACE', label: '이높플레이스' }
];

export const resolveSurveyCenterCode = (value = '') => {
    const normalized = String(value || '').toLowerCase();
    if (normalized.includes('이높') || normalized.includes('enough') || normalized.includes('강서')) return 'ENOUGH_PLACE';
    if (normalized.includes('하이픈') || normalized.includes('haifn') || normalized.includes('강동')) return 'HAIFN';
    return null;
};

const loadLegacyConfig = async (surveyType) => {
    const { data } = await supabase
        .from('notices')
        .select('content')
        .eq('category', 'SYSTEM')
        .eq('title', `${surveyType}_SURVEY_CONFIG`)
        .maybeSingle();
    if (!data?.content) return null;
    try {
        const config = JSON.parse(data.content);
        return { id: config._surveyId || null, config, legacy: true };
    } catch {
        return null;
    }
};

const canUserAnswerSurvey = async (survey, userId) => {
    if (survey?.config?.exposure?.frequency !== 'ONCE' || !userId) return true;
    const { data, error } = await supabase
        .from('checkin_surveys')
        .select('id')
        .eq('survey_id', survey.id)
        .eq('user_id', userId)
        .limit(1);
    if (error) return true;
    return !data?.length;
};

export const loadAssignedSurvey = async ({ surveyType, centerCode, locationName, userId }) => {
    const resolvedCenter = centerCode || resolveSurveyCenterCode(locationName);
    if (!resolvedCenter) return loadLegacyConfig(surveyType);

    // New surveys keep their display policy inside config so existing tables and
    // historical responses remain untouched. One-time surveys are tried first;
    // a default survey is only used when no other eligible survey remains.
    const { data: activeSurveys, error: activeError } = await supabase
        .from('surveys')
        .select('id, survey_type, config, status, created_at')
        .eq('survey_type', surveyType)
        .eq('status', 'ACTIVE');
    if (!activeError) {
        const configured = (activeSurveys || [])
            .filter(survey => survey.config?.exposure?.enabled !== false)
            .filter(survey => survey.config?.exposure?.centers?.includes(resolvedCenter))
            .sort((a, b) => (a.config.exposure.priority ?? 999) - (b.config.exposure.priority ?? 999));
        const ordered = [
            ...configured.filter(survey => !survey.config.exposure.isDefault),
            ...configured.filter(survey => survey.config.exposure.isDefault)
        ];
        for (const survey of ordered) {
            if (await canUserAnswerSurvey(survey, userId)) {
                return { id: survey.id, config: survey.config || {}, legacy: false };
            }
        }
    }

    const { data: assignment, error: assignmentError } = await supabase
        .from('survey_assignments')
        .select('survey_id')
        .eq('center_code', resolvedCenter)
        .eq('survey_type', surveyType)
        .eq('enabled', true)
        .maybeSingle();

    // Older deployments do not have the assignment table yet.
    if (assignmentError) return loadLegacyConfig(surveyType);
    if (!assignment?.survey_id) return null;

    const { data: survey, error: surveyError } = await supabase
        .from('surveys')
        .select('id, survey_type, config, status')
        .eq('id', assignment.survey_id)
        .maybeSingle();
    if (surveyError || !survey) return null;
    return { id: survey.id, config: survey.config || {}, legacy: false };
};
