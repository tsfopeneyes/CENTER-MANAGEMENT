import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

// 구조화된 .env 파일 읽기
const envFile = fs.readFileSync('.env', 'utf-8');
const envVars = {};
envFile.split('\n').forEach(line => {
    line = line.trim();
    if (line && !line.startsWith('#')) {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
            envVars[match[1].trim()] = match[2].trim();
        }
    }
});

const supabaseUrl = envVars['VITE_SUPABASE_URL'];
const serviceRoleKey = envVars['SUPABASE_SERVICE_ROLE_KEY'];

if (!serviceRoleKey) {
    console.error("\n❌ 오류: VITE_SUPABASE_SERVICE_ROLE_KEY 가 .env 파일에 없습니다!");
    process.exit(1);
}

console.log("Supabase Admin Client 연결 중...");
const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

async function migrateAllPasswords() {
    console.log("\npublic.users 데이터베이스에서 모든 계정 정보를 불러오는 중...");
    const { data: users, error } = await supabase.from('users').select('id, name, password');
    
    if (error) {
        console.error("유저 정보를 불러오는 데 실패했습니다:", error);
        return;
    }
    
    console.log(`총 ${users.length}명의 유저를 찾았습니다. 비밀번호 재동기화를 시작합니다...\n`);
    let successCount = 0;
    let failCount = 0;

    for (const user of users) {
        if (!user.password || user.password.length !== 64) {
            console.log(`[PASS] ${user.name}: 정상적인 해시 비밀번호가 아닙니다. 건너뜁니다.`);
            continue;
        }

        const userEmail = `${user.id}@youth-access.app`;
        
        // Supabase Auth Admin API를 사용하여 사용자를 완벽하게 생성합니다.
        let { error: authError } = await supabase.auth.admin.createUser({
            id: user.id,
            email: userEmail,
            email_confirm: true,
            password: user.password
        });

        if (authError && authError.message.includes('already exists')) {
             // 만약 이미 존재한다면 비밀번호만 강제로 업데이트합니다.
             const { error: updateError } = await supabase.auth.admin.updateUserById(
                 user.id,
                 { password: user.password }
             );
             authError = updateError;
        }

        if (authError) {
             console.error(`[FAIL] ${user.name} 님의 계정 생성/동기화 실패:`, authError.message);
             failCount++;
        } else {
             successCount++;
             console.log(`[OK]   ${user.name} 님의 계정이 완벽하게 Auth에 등록(동기화) 되었습니다.`);
        }
    }

    console.log(`\n🎉 모든 비밀번호 동기화 작업이 완료되었습니다!`);
    console.log(`✅ 성공: ${successCount}명`);
    console.log(`❌ 실패/보류: ${failCount}명\n`);
    console.log("이제 모든 사용자가 원래 사용하던 비밀번호로 정상적으로 로그인 하실 수 있습니다!");
}

migrateAllPasswords();
