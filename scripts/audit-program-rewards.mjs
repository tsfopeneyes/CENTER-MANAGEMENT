import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY
);

const PAGE_SIZE = 1000;

const fetchAll = async (queryFactory) => {
    const rows = [];

    for (let start = 0; ; start += PAGE_SIZE) {
        const { data, error } = await queryFactory().range(start, start + PAGE_SIZE - 1);
        if (error) throw error;
        rows.push(...(data || []));
        if (!data || data.length < PAGE_SIZE) return rows;
    }
};

const programs = await fetchAll(() => supabase
    .from('notices')
    .select('id,title,program_status,guest_properties,haifn_reward,is_review_required,created_at,program_date')
    .eq('category', 'PROGRAM')
    .order('id'));

const attendedResponses = await fetchAll(() => supabase
    .from('notice_responses')
    .select('notice_id,user_id,status,is_attended')
    .eq('status', 'JOIN')
    .eq('is_attended', true)
    .order('notice_id'));

const rewardTransactions = await fetchAll(() => supabase
    .from('haifn_transactions')
    .select('user_id,amount,transaction_type,source_description')
    .eq('transaction_type', 'EARN')
    .like('source_description', '[프로그램 참여]%'));

const attendeesByProgram = new Map();
for (const response of attendedResponses) {
    const attendees = attendeesByProgram.get(response.notice_id) || [];
    attendees.push(response.user_id);
    attendeesByProgram.set(response.notice_id, attendees);
}

const rewardsByTitleAndUser = rewardTransactions.reduce((totals, transaction) => {
    const key = `${transaction.source_description}|${transaction.user_id}`;
    totals.set(key, (totals.get(key) || 0) + Number(transaction.amount || 0));
    return totals;
}, new Map());

const eligiblePrograms = programs.filter(program => (
    program.program_status !== 'CANCELLED'
    && Number(program.haifn_reward) > 0
    && !program.is_review_required
));

const titleCounts = eligiblePrograms.reduce((counts, program) => {
    counts.set(program.title, (counts.get(program.title) || 0) + 1);
    return counts;
}, new Map());

const missingPrograms = eligiblePrograms.map(program => {
    const attendees = attendeesByProgram.get(program.id) || [];
    const rewardDescription = `[프로그램 참여] ${program.title}`;
    const paymentAmounts = attendees.map(userId => (
        rewardsByTitleAndUser.get(`${rewardDescription}|${userId}`) || 0
    ));
    const missingCount = paymentAmounts.filter(amount => amount === 0).length;
    const underpaidCount = paymentAmounts.filter(amount => amount > 0 && amount < Number(program.haifn_reward)).length;
    const overpaidCount = paymentAmounts.filter(amount => amount > Number(program.haifn_reward)).length;

    return {
        id: program.id,
        title: program.title,
        programDate: program.program_date,
        programStatus: program.program_status || 'ACTIVE',
        reward: Number(program.haifn_reward),
        attendedCount: attendees.length,
        paidCount: attendees.length - missingCount - underpaidCount,
        missingCount,
        underpaidCount,
        overpaidCount,
        duplicateTitle: (titleCounts.get(program.title) || 0) > 1
    };
}).filter(program => program.attendedCount > 0 && (program.missingCount > 0 || program.underpaidCount > 0));

const summary = {
    auditedAt: new Date().toISOString(),
    eligibleProgramCount: eligiblePrograms.length,
    attendedParticipantCount: eligiblePrograms.reduce(
        (total, program) => total + (attendeesByProgram.get(program.id) || []).length,
        0
    ),
    definiteMissingPaymentCount: missingPrograms.reduce((total, program) => total + program.missingCount, 0),
    definiteMissingPointTotal: missingPrograms.reduce((total, program) => (
        total + (program.missingCount * program.reward)
    ), 0),
    underpaidParticipantCount: missingPrograms.reduce((total, program) => total + program.underpaidCount, 0),
    affectedPrograms: missingPrograms
};

console.log(JSON.stringify(summary, null, 2));
