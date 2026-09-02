import 'dotenv/config';
import { v5 as uuidv5 } from 'uuid';
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');
const TARGET_REWARD = 5;
const ADJUSTMENT_NAMESPACE = 'b93e78cb-5e9b-4e78-8f58-04fb3d5b7a1e';
const PROGRAM_IDS = [98, 100, 103];

const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY
);

const { data: programs, error: programError } = await supabase
    .from('notices')
    .select('id,title,haifn_reward,category')
    .in('id', PROGRAM_IDS)
    .eq('category', 'PROGRAM');

if (programError) throw programError;
if (programs.length !== PROGRAM_IDS.length) {
    throw new Error('Safety stop: the expected DAY1·DAY2·DAY3 vacation-event programs could not all be found.');
}
if (programs.some(program => Number(program.haifn_reward) !== TARGET_REWARD)) {
    throw new Error('Safety stop: every target program must be configured to 5H before adjustment.');
}

const programByDescription = new Map(
    programs.map(program => [`[프로그램 참여] ${program.title}`, program])
);
const rewardDescriptions = [...programByDescription.keys()];

const { data: earnTransactions, error: earnError } = await supabase
    .from('haifn_transactions')
    .select('user_id,amount,source_description')
    .eq('transaction_type', 'EARN')
    .in('source_description', rewardDescriptions);

if (earnError) throw earnError;

const earnedByProgramAndUser = earnTransactions.reduce((totals, transaction) => {
    const key = `${transaction.source_description}|${transaction.user_id}`;
    totals.set(key, (totals.get(key) || 0) + Number(transaction.amount || 0));
    return totals;
}, new Map());

const plannedAdjustments = [];
for (const [key, earnedAmount] of earnedByProgramAndUser) {
    if (earnedAmount <= TARGET_REWARD) continue;

    const [sourceDescription, userId] = key.split('|');
    const program = programByDescription.get(sourceDescription);
    const amount = TARGET_REWARD - earnedAmount;
    const adjustmentDescription = `[프로그램 참여 조정] ${program.id} - ${program.title} (${TARGET_REWARD}H 기준)`;

    plannedAdjustments.push({
        id: uuidv5(`${program.id}|${userId}|${earnedAmount}|${TARGET_REWARD}`, ADJUSTMENT_NAMESPACE),
        user_id: userId,
        amount,
        transaction_type: 'SPEND',
        source_description: adjustmentDescription,
        admin_id: null
    });
}

const adjustmentIds = plannedAdjustments.map(adjustment => adjustment.id);
const { data: existingAdjustments, error: existingError } = adjustmentIds.length === 0
    ? { data: [], error: null }
    : await supabase.from('haifn_transactions').select('id').in('id', adjustmentIds);

if (existingError) throw existingError;

const existingIds = new Set((existingAdjustments || []).map(transaction => transaction.id));
const transactionsToInsert = plannedAdjustments.filter(adjustment => !existingIds.has(adjustment.id));
const summary = {
    mode: APPLY ? 'apply' : 'dry-run',
    targetReward: TARGET_REWARD,
    adjustmentCount: transactionsToInsert.length,
    deductedPoints: Math.abs(transactionsToInsert.reduce((total, transaction) => total + transaction.amount, 0)),
    alreadyAdjustedCount: plannedAdjustments.length - transactionsToInsert.length
};

if (!APPLY || transactionsToInsert.length === 0) {
    console.log(JSON.stringify(summary, null, 2));
    process.exit(0);
}

const { data: insertedRows, error: insertError } = await supabase
    .from('haifn_transactions')
    .insert(transactionsToInsert)
    .select('id');

if (insertError) throw insertError;
if (insertedRows.length !== transactionsToInsert.length) {
    throw new Error('Safety stop: inserted adjustment count does not match the plan.');
}

console.log(JSON.stringify({ ...summary, insertedAdjustmentCount: insertedRows.length }, null, 2));
