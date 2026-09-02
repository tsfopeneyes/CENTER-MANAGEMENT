import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');
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

const [programs, attendedResponses, rewardTransactions] = await Promise.all([
    fetchAll(() => supabase
        .from('notices')
        .select('id,title,program_status,haifn_reward,is_review_required')
        .eq('category', 'PROGRAM')
        .order('id')),
    fetchAll(() => supabase
        .from('notice_responses')
        .select('notice_id,user_id,status,is_attended')
        .eq('status', 'JOIN')
        .eq('is_attended', true)
        .order('notice_id')),
    fetchAll(() => supabase
        .from('haifn_transactions')
        .select('user_id,amount,transaction_type,source_description')
        .eq('transaction_type', 'EARN')
        .like('source_description', '[프로그램 참여]%'))
]);

const eligiblePrograms = programs.filter(program => (
    program.program_status !== 'CANCELLED'
    && Number(program.haifn_reward) > 0
    && !program.is_review_required
));

const attendedProgramIds = new Set(attendedResponses.map(response => response.notice_id));
const titleCounts = eligiblePrograms
    .filter(program => attendedProgramIds.has(program.id))
    .reduce((counts, program) => {
    counts.set(program.title, (counts.get(program.title) || 0) + 1);
    return counts;
}, new Map());

const duplicateTitles = [...titleCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([title]) => title);
const ambiguousTitles = new Set(duplicateTitles);

const paymentAmounts = rewardTransactions.reduce((totals, transaction) => {
    const key = `${transaction.source_description}|${transaction.user_id}`;
    totals.set(key, (totals.get(key) || 0) + Number(transaction.amount || 0));
    return totals;
}, new Map());

const programsById = new Map(eligiblePrograms.map(program => [program.id, program]));
const historicalAmountsByProgram = new Map();

for (const response of attendedResponses) {
    const program = programsById.get(response.notice_id);
    if (!program || ambiguousTitles.has(program.title)) continue;

    const sourceDescription = `[프로그램 참여] ${program.title}`;
    const existingAmount = paymentAmounts.get(`${sourceDescription}|${response.user_id}`) || 0;
    if (existingAmount <= 0) continue;

    const amounts = historicalAmountsByProgram.get(program.id) || new Set();
    amounts.add(existingAmount);
    historicalAmountsByProgram.set(program.id, amounts);
}

for (const [programId, amounts] of historicalAmountsByProgram) {
    if (amounts.size > 1) {
        throw new Error(`Safety stop: inconsistent historical reward amounts for program ${programId}.`);
    }
}

const transactionsToInsert = [];
const historicalRateOverrides = [];

for (const response of attendedResponses) {
    const program = programsById.get(response.notice_id);
    if (!program) continue;
    if (ambiguousTitles.has(program.title)) continue;

    const sourceDescription = `[프로그램 참여] ${program.title}`;
    const existingAmount = paymentAmounts.get(`${sourceDescription}|${response.user_id}`) || 0;
    const historicalAmounts = historicalAmountsByProgram.get(program.id);
    const rewardAmount = historicalAmounts ? [...historicalAmounts][0] : Number(program.haifn_reward);

    if (existingAmount > 0 && existingAmount !== rewardAmount) {
        throw new Error(`Safety stop: unexpected existing reward amount for program ${program.id}.`);
    }

    if (existingAmount === 0) {
        transactionsToInsert.push({
            user_id: response.user_id,
            amount: rewardAmount,
            transaction_type: 'EARN',
            source_description: sourceDescription,
            admin_id: null
        });
    }

    if (historicalAmounts && rewardAmount !== Number(program.haifn_reward)) {
        historicalRateOverrides.push({ programId: program.id, amount: rewardAmount });
    }
}

const totalPoints = transactionsToInsert.reduce((total, transaction) => total + transaction.amount, 0);
const summary = {
    mode: APPLY ? 'apply' : 'dry-run',
    transactionCount: transactionsToInsert.length,
    totalPoints,
    programCount: new Set(transactionsToInsert.map(transaction => transaction.source_description)).size,
    skippedAmbiguousTitles: duplicateTitles,
    historicalRateOverrides: [...new Map(historicalRateOverrides.map(item => [item.programId, item])).values()]
};

if (!APPLY) {
    console.log(JSON.stringify(summary, null, 2));
    process.exit(0);
}

if (transactionsToInsert.length === 0) {
    console.log(JSON.stringify(summary, null, 2));
    process.exit(0);
}

const { data, error } = await supabase
    .from('haifn_transactions')
    .insert(transactionsToInsert)
    .select('id');

if (error) throw error;
if (data.length !== transactionsToInsert.length) {
    throw new Error('Safety stop: inserted transaction count does not match the planned count.');
}

console.log(JSON.stringify({ ...summary, insertedTransactionCount: data.length }, null, 2));
