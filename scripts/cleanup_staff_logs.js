import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for this admin script.');
}
const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanUpStaffLogs() {
    console.log('Fetching STAFF users...');
    const { data: staffUsers, error: userErr } = await (supabase
        .from('users')
        .select('id')
        .or('user_group.eq.STAFF,role.eq.STAFF'));

    if (userErr) { console.error('Error fetching users:', userErr); process.exit(1); }

    if (!staffUsers || staffUsers.length === 0) {
        console.log('No STAFF users found.');
        process.exit(0);
    }

    const staffIds = staffUsers.map(u => u.id);
    console.log(`Found ${staffIds.length} STAFF user(s). Deleting their logs...`);

    const { count: logsCount, error: logsErr } = await (supabase
        .from('logs')
        .delete({ count: 'exact' })
        .in('user_id', staffIds));

    if (logsErr) { console.error('Error deleting logs:', logsErr); }
    else { console.log(`Deleted ${logsCount} regular logs for STAFF.`); }

    console.log('Attempting to delete school_logs...');
    const { count: schoolLogsCount, error: schoolLogsErr } = await (supabase
        .from('school_logs')
        .delete({ count: 'exact' })
        .in('user_id', staffIds));

    if (schoolLogsErr) { console.error('Error deleting school_logs:', schoolLogsErr); }
    else { console.log(`Deleted ${schoolLogsCount} school logs for STAFF.`); }

    console.log('Cleanup complete.');
}

cleanUpStaffLogs();
