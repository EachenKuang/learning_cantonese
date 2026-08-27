#!/usr/bin/env node
import { initStore, mutate, normalizeUserId, hashPassword, DATA_FILE } from './sync-store.mjs';

await initStore();
const [command, rawId, ...rest] = process.argv.slice(2);
const id = normalizeUserId(rawId);

function usage(){
  console.log('Usage:');
  console.log('  node manage-user.mjs ensure <user-id> [display name]');
  console.log('  node manage-user.mjs set-password <user-id> [display name]');
  console.log('  node manage-user.mjs enable|disable <user-id>');
  console.log('  node manage-user.mjs list');
}

async function readHidden(prompt){
  if(!process.stdin.isTTY){
    const chunks=[]; for await (const chunk of process.stdin) chunks.push(chunk);
    return Buffer.concat(chunks).toString('utf8').replace(/[\r\n]+$/,'');
  }
  process.stdout.write(prompt);
  process.stdin.setRawMode(true); process.stdin.resume();
  return new Promise((resolve,reject)=>{
    let value='';
    const done=(error)=>{ process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write('\n'); error?reject(error):resolve(value); };
    process.stdin.on('data', function onData(chunk){
      const text=chunk.toString('utf8');
      if(text==='\u0003'){ process.stdin.off('data',onData); return done(new Error('cancelled')); }
      if(text==='\r'||text==='\n'){ process.stdin.off('data',onData); return done(); }
      if(text==='\u007f'){ value=value.slice(0,-1); return; }
      value += text;
    });
  });
}

if(command === 'list'){
  const {getState} = await import('./sync-store.mjs');
  const users = Object.values(getState().users).map(u=>({id:u.id,name:u.displayName,enabled:!u.disabled,passwordSet:!!u.password,profileVersion:u.profile?.version||0}));
  console.table(users); process.exit(0);
}
if(!id){ usage(); process.exit(2); }
const displayName = rest.join(' ').trim() || id;

if(command === 'ensure'){
  await mutate(store=>{ if(!store.users[id]) store.users[id] = {id,displayName,disabled:false,password:null,createdAt:new Date().toISOString(),profile:{version:0,updatedAt:null,data:null}}; });
  console.log(`Ensured user ${id} in ${DATA_FILE}`);
}else if(command === 'set-password'){
  const first = await readHidden('New password (12+ characters): ');
  const second = process.stdin.isTTY ? await readHidden('Confirm password: ') : first;
  if(first !== second) throw new Error('passwords_do_not_match');
  const password = await hashPassword(first);
  await mutate(store=>{
    const user = store.users[id] || (store.users[id] = {id,displayName,disabled:false,createdAt:new Date().toISOString(),profile:{version:0,updatedAt:null,data:null}});
    user.displayName = displayName || user.displayName; user.password=password; user.disabled=false; user.updatedAt=new Date().toISOString();
    for(const [key,session] of Object.entries(store.sessions)){ if(session.userId===id) delete store.sessions[key]; }
  });
  console.log(`Password updated for ${id}; existing sessions revoked.`);
}else if(command === 'enable' || command === 'disable'){
  await mutate(store=>{ const user=store.users[id]; if(!user) throw new Error('user_not_found'); user.disabled=command==='disable'; });
  console.log(`${id}: ${command}d`);
}else{ usage(); process.exit(2); }

if(command !== 'list') console.log('If the sync service is running, reload it now: sudo systemctl reload jyut-sync');
