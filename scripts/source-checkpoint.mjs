import {createHash} from 'node:crypto';
import {lstat,mkdir,readdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const within=(root,relative)=>{
    if(typeof relative!=='string'||!relative||path.isAbsolute(relative))throw Error('Invalid relative path');
    const target=path.resolve(root,relative),rel=path.relative(root,target);
    if(!rel||rel.startsWith('..')||path.isAbsolute(rel))throw Error('Path outside checkpoint');
    return target;
};
async function regular(root,relative){
    const target=within(root,relative);
    let at=root;
    for(const part of path.relative(root,target).split(path.sep)){
        at=path.join(at,part);if((await lstat(at)).isSymbolicLink())throw Error('Links are not supported');
    }
    if(!(await lstat(target)).isFile())throw Error('Expected regular file');
    return target;
}
export async function verifyCheckpoint(directory){
    const root=path.resolve(directory),manifest=JSON.parse(await readFile(path.join(root,'manifest.json'),'utf8'));
    const files=Array.isArray(manifest)?manifest:manifest.files;
    if(!Array.isArray(files)||!files.length)throw Error('Empty checkpoint');
    const seen=new Set();
    for(const item of files){
        const key=item.path.toLowerCase();if(seen.has(key))throw Error('Duplicate checkpoint path');seen.add(key);
        const bytes=await readFile(await regular(root,item.path));
        if(bytes.length!==item.bytes||sha(bytes)!==item.sha256.toLowerCase())throw Error('Checkpoint integrity failure: '+item.path);
    }
    return {root,files};
}
export async function createCheckpoint(workspace,directory){
    const root=path.resolve(workspace),destination=path.resolve(directory);
    if(!path.relative(root,destination).startsWith('backups'+path.sep))throw Error('Checkpoint must be inside workspace backups');
    await mkdir(destination); // Never overwrite/reuse a prior checkpoint.
    const selected=[];
    async function walk(relative){
        const absolute=within(root,relative),info=await lstat(absolute);
        if(info.isSymbolicLink())throw Error('Source links require manual review');
        if(info.isDirectory())for(const item of await readdir(absolute))await walk(path.join(relative,item));
        else if(info.isFile())selected.push(relative);
    }
    for(const directory of ['src','public','supabase','scripts','docs'])await walk(directory);
    for(const entry of await readdir(root,{withFileTypes:true})){
        if(entry.isFile()&&(/\.(?:json|js|mjs|cjs|ts|html|css|md|toml|yaml|yml|sql)$/.test(entry.name)||['.firebaserc','.gitignore','.npmrc'].includes(entry.name))&&entry.name!=='.npmrc')selected.push(entry.name);
    }
    const files=[];
    for(const relative of selected.sort()){
        // Env and key material are intentionally outside this source checkpoint.
        if(relative.split(path.sep).some(p=>p.startsWith('.env')||p==='node_modules'||p==='.temp')||/\.(?:pem|key|age|dump)$/i.test(relative))continue;
        const source=await regular(root,relative),bytes=await readFile(source),target=within(destination,relative);
        await mkdir(path.dirname(target),{recursive:true});await writeFile(target,bytes,{flag:'wx'});
        files.push({path:relative.split(path.sep).join('/'),bytes:bytes.length,sha256:sha(bytes)});
    }
    await writeFile(path.join(destination,'manifest.json'),JSON.stringify({version:1,createdAt:new Date().toISOString(),
        scope:'Source, dependencies lock, configuration and public assets; no env, DB, cloud settings, git objects, build output or uploaded storage files',files},null,2),{flag:'wx'});
    await verifyCheckpoint(destination);
    return {directory:destination,files:files.length};
}
export async function rehearseCheckpoint(directory,destination){
    const checkpoint=await verifyCheckpoint(directory);
    await mkdir(destination); // Fresh isolated destination only; never restore over workspace.
    for(const item of checkpoint.files){
        const target=within(destination,item.path);await mkdir(path.dirname(target),{recursive:true});
        await copyFile(await regular(checkpoint.root,item.path),target,1);
    }
    for(const item of checkpoint.files){
        const data=await readFile(await regular(destination,item.path));
        if(data.length!==item.bytes||sha(data)!==item.sha256.toLowerCase())throw Error('Restore rehearsal mismatch');
    }
    return {files:checkpoint.files.length,destination};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
    const [command,directory,target]=process.argv.slice(2);
    if(command==='create')console.log(JSON.stringify(await createCheckpoint(process.cwd(),directory)));
    else if(command==='verify'){const result=await verifyCheckpoint(directory);console.log(JSON.stringify({directory:result.root,verifiedFiles:result.files.length}));}
    else if(command==='rehearse'){
        const destination=path.resolve(target);
        if(!path.relative(process.cwd(),destination).startsWith('scratch'+path.sep))throw Error('Rehearsal must be within workspace scratch');
        console.log(JSON.stringify(await rehearseCheckpoint(directory,destination)));
    }else throw Error('Use create/verify/rehearse with explicit paths');
}
