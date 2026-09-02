// One-time, explicit separation. No .env credentials, DB access, or deployment.
import {readFile,writeFile,mkdir,cp,rename} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
const root=process.cwd();
const archive=path.join(root,'backups','deferred-auth-'+new Date().toISOString().replace(/[:.]/g,'-'));
await mkdir(archive,{recursive:true});
const restore=[
 'src/App.jsx','src/main.jsx','src/hooks/useProfile.js',
 'src/components/auth/hooks/useSignUp.jsx','src/pages/GuestMobileWelcome.jsx',
 'src/components/admin/users/hooks/useAdminUsers.jsx',
 'src/components/admin/settings/hooks/useAdminSettings.jsx',
 'src/components/student/modals/ProfileSettingsModal.jsx',
 'supabase/functions/dispatch-notification/index.ts',
];
const mixed=['src/hooks/useStudentDashboard.jsx','firebase.json','supabase/config.toml','.env.example'];
for(const file of [...restore,...mixed]) {
 await mkdir(path.dirname(path.join(archive,file)),{recursive:true});
 await cp(path.join(root,file),path.join(archive,file),{errorOnExist:true,force:false});
}
const diff=execFileSync('git',['-c','core.safecrlf=false','diff','--',...restore,...mixed],{cwd:root});
await writeFile(path.join(archive,'tracked-changes.patch'),diff,{flag:'wx'});
// All reviewed diffs in these files were from the deferred auth transition.
for(const file of restore) await writeFile(path.join(root,file),execFileSync('git',['show','HEAD:'+file],{cwd:root}));
// Retain null guest credentials; do not reintroduce a shared guest password.
const guestFile=path.join(root,'src/pages/GuestMobileWelcome.jsx');
await writeFile(guestFile,(await readFile(guestFile,'utf8')).replace("password: '0000',","password: null,"));
// Keep recruitment updates in the same hook; restore only the password contract.
const student=path.join(root,'src/hooks/useStudentDashboard.jsx');
let source=await readFile(student,'utf8');
source=source.replace("import getCroppedImg from '../utils/imageUtils';","import getCroppedImg from '../utils/imageUtils';\nimport { hashPassword } from '../utils/hashUtils';");
source=source.replace('updates.newPassword = newPassword;','const hashedPassword = await hashPassword(newPassword);\n            updates.password = hashedPassword;');
await writeFile(student,source);
const firebase=JSON.parse(await readFile('firebase.json','utf8'));
firebase.hosting.predeploy=['npm run build','node scripts/check-legacy-auth-bundle.mjs'];
await writeFile('firebase.json',JSON.stringify(firebase,null,2)+'\n');
const config=await readFile('supabase/config.toml','utf8');
await writeFile('supabase/config.toml',config.replace(/\[functions\.account-auth\][\s\S]*?(?=\[functions\.)/,''));
const example=await readFile('.env.example','utf8');
await writeFile('.env.example',example.replace(/# Local UI previews remain available[\s\S]*?VITE_ACCOUNT_AUTH_LOCAL_ENABLED=false\r?\n?/,''));
const deferred=[
 'src/api/accountApi.js','src/components/auth/VerifiedAccount.jsx',
 'src/components/auth/PasswordHelpModal.jsx','src/components/auth/hooks/useAccountLogin.js',
 'src/utils/accountCache.js','supabase/functions/account-auth','supabase/functions/_shared/accountSession.ts',
 'supabase/manual/account-auth-cutover.sql',
 'scripts/check-account-auth-bundle.mjs','scripts/check-account-auth-readiness.mjs',
 'scripts/rotate-legacy-account-auth.mjs','scripts/test-account-auth.mjs',
 'scripts/test-account-auth-cutover.mjs','scripts/test-account-auth-database.mjs','scripts/test-account-auth-readiness.mjs',
];
for(const file of deferred) {
 const from=path.resolve(root,file),to=path.resolve(archive,file);
 if(!from.startsWith(root+path.sep)||!to.startsWith(archive+path.sep))throw Error('Path escaped workspace');
 await mkdir(path.dirname(to),{recursive:true});
 await rename(from,to);
}
await writeFile(path.join(archive,'README.md'),'Deferred auth implementation; not deployed. Original edited files and patch retained. Restore selectively after fixing registration recovery and temporary-profile classification. Do not apply cutover SQL automatically.\n');
console.log('Deferred auth preserved at '+archive);
