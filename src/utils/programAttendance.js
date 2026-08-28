import { supabase } from '../supabaseClient';
import { getKSTDateString } from './dateUtils';
import {
    normalizeGuestIdentityName,
    normalizeGuestIdentitySchool,
} from './userUtils';

export const getProgramsScheduledForDate = (programs, dateString) => (programs || []).filter(program => {
    if (!program?.program_date || !dateString) return false;
    return String(program.program_date).slice(0, 10) === dateString;
});

/**
 * Marks every JOIN response for a program scheduled today as attended.
 * The operation is idempotent, so it is safe to call again when a QR scan
 * reconciles an existing check-in instead of creating a second visit log.
 */
export const markTodayProgramAttendance = async (userId, now = new Date()) => {
    if (!userId) return { matchedNoticeIds: [], programs: [] };

    const kstToday = getKSTDateString(now);
    const { data: programs, error: programsError } = await supabase
        .from('notices')
        .select('id, title, program_date')
        .eq('category', 'PROGRAM');
    if (programsError) throw programsError;

    const todayPrograms = getProgramsScheduledForDate(programs, kstToday);
    if (todayPrograms.length === 0) return { matchedNoticeIds: [], programs: [] };

    const programIds = todayPrograms.map(program => program.id);
    let attendanceUserIds = [userId];

    // A legacy/program guest and a QR check-in guest can have different IDs.
    // Expand only to profiles with the exact same normalized name and school.
    // Ambiguous attendance is rejected below unless a single applicant can be
    // identified for each program.
    const { data: checkedInProfiles, error: checkedInProfileError } = await supabase
        .from('users')
        .select('id, name, school, user_group')
        .eq('id', userId)
        .limit(1);
    if (checkedInProfileError) throw checkedInProfileError;
    const checkedInProfile = checkedInProfiles?.[0];

    if (checkedInProfile) {
        const cleanName = normalizeGuestIdentityName(checkedInProfile.name);
        const { data: identityCandidates, error: identityError } = await supabase
            .from('users')
            .select('id, name, school, user_group')
            .in('name', [cleanName, `${cleanName}(guest)`]);
        if (identityError) throw identityError;

        const cleanSchool = normalizeGuestIdentitySchool(checkedInProfile.school);
        attendanceUserIds = [...new Set((identityCandidates || [])
            .filter(candidate =>
                normalizeGuestIdentityName(candidate.name) === cleanName &&
                normalizeGuestIdentitySchool(candidate.school) === cleanSchool
            )
            .map(candidate => candidate.id))];
        if (!attendanceUserIds.includes(userId)) attendanceUserIds.push(userId);
    }

    const { data: responses, error: responsesError } = await supabase
        .from('notice_responses')
        .select('id, notice_id, user_id')
        .in('user_id', attendanceUserIds)
        .in('notice_id', programIds)
        .eq('status', 'JOIN');
    if (responsesError) throw responsesError;

    // If two same-name/same-school profiles both applied to the same program,
    // do not guess which response is genuine. An administrator can reconcile
    // that exceptional duplicate explicitly.
    const unambiguousResponses = (responses || []).filter(response =>
        responses.filter(candidate => candidate.notice_id === response.notice_id).length === 1
    );
    const matchedNoticeIds = [...new Set(unambiguousResponses.map(response => response.notice_id))];
    if (matchedNoticeIds.length === 0) return { matchedNoticeIds: [], programs: [] };

    const responseIds = unambiguousResponses.map(response => response.id);
    const { error: attendanceError } = await supabase
        .from('notice_responses')
        .update({ is_attended: true })
        .in('id', responseIds)
        .eq('status', 'JOIN');
    if (attendanceError) throw attendanceError;

    return {
        matchedNoticeIds,
        programs: todayPrograms.filter(program => matchedNoticeIds.includes(program.id)),
    };
};
