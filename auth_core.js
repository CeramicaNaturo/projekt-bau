/* Projekt Bau 2.9.67 – lokale Mehrbenutzer-Anmeldung
   Passwörter werden niemals im Klartext gespeichert.
   PBKDF2-SHA-256 + zufälliger Salt, Speicherung ausschliesslich in IndexedDB.
*/
(()=>{
'use strict';

const DB_NAME='projekt-bau-auth';
const DB_VERSION=1;
const STORE='users';
const SESSION_KEY='projekt-bau-auth-session-v1';
const ITERATIONS=210000;
let db=null;
let currentUser=null;

const $=id=>document.getElementById(id);
const enc=new TextEncoder();
const b64=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes)));
const fromB64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));

function openDb(){
  if(db)return Promise.resolve(db);
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=()=>{
      const d=req.result;
      if(!d.objectStoreNames.contains(STORE)){
        const s=d.createObjectStore(STORE,{keyPath:'email'});
        s.createIndex('role','role',{unique:false});
      }
    };
    req.onsuccess=()=>{db=req.result;resolve(db)};
    req.onerror=()=>reject(req.error);
  });
}
async function allUsers(){
  const d=await openDb();
  return new Promise((resolve,reject)=>{
    const r=d.transaction(STORE,'readonly').objectStore(STORE).getAll();
    r.onsuccess=()=>resolve(r.result||[]);
    r.onerror=()=>reject(r.error);
  });
}
async function getUser(email){
  const d=await openDb();
  return new Promise((resolve,reject)=>{
    const r=d.transaction(STORE,'readonly').objectStore(STORE).get(String(email||'').trim().toLowerCase());
    r.onsuccess=()=>resolve(r.result||null);
    r.onerror=()=>reject(r.error);
  });
}
async function putUser(user){
  const d=await openDb();
  return new Promise((resolve,reject)=>{
    const tx=d.transaction(STORE,'readwrite');
    tx.objectStore(STORE).put(user);
    tx.oncomplete=()=>resolve(true);
    tx.onerror=()=>reject(tx.error);
  });
}
async function deleteUser(email){
  const d=await openDb();
  return new Promise((resolve,reject)=>{
    const tx=d.transaction(STORE,'readwrite');
    tx.objectStore(STORE).delete(email);
    tx.oncomplete=()=>resolve(true);
    tx.onerror=()=>reject(tx.error);
  });
}
async function derive(password,salt){
  const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);
  return crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:ITERATIONS,hash:'SHA-256'},key,256);
}
async function makePassword(password){
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const hash=await derive(password,salt);
  return {salt:b64(salt),hash:b64(hash)};
}
async function verifyPassword(password,user){
  const calc=new Uint8Array(await derive(password,fromB64(user.salt)));
  const saved=fromB64(user.hash);
  if(calc.length!==saved.length)return false;
  let diff=0;for(let i=0;i<calc.length;i++)diff|=calc[i]^saved[i];
  return diff===0;
}
function emailOk(v){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v||'').trim())}
function setMsg(text,type=''){
  const n=$('pbAuthMessage');if(!n)return;n.textContent=text||'';n.dataset.type=type;
}
function setLocked(locked){
  document.body.classList.toggle('pb-auth-locked',!!locked);
  const gate=$('pbAuthGate');if(gate)gate.classList.toggle('hidden',!locked);
  if(gate)gate.setAttribute('aria-hidden',locked?'false':'true');
}
function sessionLoad(){
  try{return JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null')}catch(_){return null}
}
function sessionSave(u){
  sessionStorage.setItem(SESSION_KEY,JSON.stringify({email:u.email,name:u.name||u.email,role:u.role||'Benutzer',at:Date.now()}));
}
function updateUserChip(){
  const chip=$('pbCurrentUser');
  if(!chip)return;
  if(currentUser){
    chip.classList.remove('hidden');
    chip.querySelector('strong').textContent=currentUser.name||currentUser.email;
    chip.querySelector('small').textContent=currentUser.role||'Benutzer';
  }else chip.classList.add('hidden');
}
async function unlock(user){
  currentUser={email:user.email,name:user.name||user.email,role:user.role||'Benutzer'};
  sessionSave(currentUser);setLocked(false);updateUserChip();setMsg('');
}
async function login(){
  const email=String($('pbLoginEmail')?.value||'').trim().toLowerCase();
  const password=String($('pbLoginPassword')?.value||'');
  if(!emailOk(email)){setMsg('Bitte eine gültige E-Mail-Adresse eingeben.','error');return}
  if(!password){setMsg('Bitte das Passwort eingeben.','error');return}
  setMsg('Anmeldung wird geprüft …');
  const user=await getUser(email);
  if(!user || !(await verifyPassword(password,user))){setMsg('E-Mail-Adresse oder Passwort ist nicht korrekt.','error');return}
  if(user.active===false){setMsg('Dieses Benutzerkonto ist deaktiviert.','error');return}
  await unlock(user);
}
async function firstSetup(){
  const name=String($('pbSetupName')?.value||'').trim();
  const email=String($('pbSetupEmail')?.value||'').trim().toLowerCase();
  const p1=String($('pbSetupPassword')?.value||'');
  const p2=String($('pbSetupPassword2')?.value||'');
  if(!name){setMsg('Bitte den Namen eingeben.','error');return}
  if(!emailOk(email)){setMsg('Bitte eine gültige E-Mail-Adresse eingeben.','error');return}
  if(p1.length<8){setMsg('Das Passwort muss mindestens 8 Zeichen enthalten.','error');return}
  if(p1!==p2){setMsg('Die Passwörter stimmen nicht überein.','error');return}
  const users=await allUsers();if(users.length){showLogin();return}
  const pw=await makePassword(p1);
  const user={email,name,role:'Administrator',active:true,createdAt:new Date().toISOString(),...pw};
  await putUser(user);await unlock(user);
}
function showSetup(){
  $('pbAuthLogin')?.classList.add('hidden');
  $('pbAuthSetup')?.classList.remove('hidden');
  setMsg('Erstes Benutzerkonto: Administrator anlegen.');
}
function showLogin(){
  $('pbAuthSetup')?.classList.add('hidden');
  $('pbAuthLogin')?.classList.remove('hidden');
  setMsg('');
  setTimeout(()=>$('pbLoginEmail')?.focus(),30);
}
async function logout(){
  sessionStorage.removeItem(SESSION_KEY);currentUser=null;updateUserChip();setLocked(true);showLogin();
}
function adminAllowed(){return currentUser?.role==='Administrator'}
function userRow(u){
  return `<div class="pb-user-row" data-user-email="${escapeHtml(u.email)}"><span><strong>${escapeHtml(u.name||'')}</strong><small>${escapeHtml(u.email)}</small></span><b>${escapeHtml(u.role||'Benutzer')}</b><em>${u.active===false?'Deaktiviert':'Aktiv'}</em><button type="button" data-user-delete="${escapeHtml(u.email)}" ${u.email===currentUser?.email?'disabled':''}>Löschen</button></div>`;
}
function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
async function renderUsers(){
  const list=$('pbUserList');if(!list)return;
  const users=await allUsers();list.innerHTML=users.map(userRow).join('');
}
async function openUsers(){
  if(!adminAllowed()){alert('Nur Administratoren können Benutzer verwalten.');return}
  $('pbUserModal')?.classList.remove('hidden');await renderUsers();
}
async function addUser(){
  if(!adminAllowed())return;
  const name=String($('pbNewUserName')?.value||'').trim();
  const email=String($('pbNewUserEmail')?.value||'').trim().toLowerCase();
  const password=String($('pbNewUserPassword')?.value||'');
  const role=String($('pbNewUserRole')?.value||'Benutzer');
  const msg=$('pbUserMessage');
  const fail=t=>{if(msg){msg.textContent=t;msg.dataset.type='error'}};
  if(!name)return fail('Bitte den Namen eingeben.');
  if(!emailOk(email))return fail('Bitte eine gültige E-Mail-Adresse eingeben.');
  if(password.length<8)return fail('Das Passwort muss mindestens 8 Zeichen enthalten.');
  if(await getUser(email))return fail('Diese E-Mail-Adresse ist bereits vorhanden.');
  const pw=await makePassword(password);
  await putUser({email,name,role,active:true,createdAt:new Date().toISOString(),...pw});
  $('pbNewUserName').value='';$('pbNewUserEmail').value='';$('pbNewUserPassword').value='';
  if(msg){msg.textContent='Benutzer wurde angelegt.';msg.dataset.type='ok'}
  await renderUsers();
}
async function removeUser(email){
  if(!adminAllowed()||email===currentUser?.email)return;
  if(!confirm(`Benutzer ${email} wirklich löschen?`))return;
  await deleteUser(email);await renderUsers();
}
async function boot(){
  setLocked(true);
  const users=await allUsers();
  const s=sessionLoad();
  if(s){
    const user=await getUser(s.email);
    if(user?.active!==false){currentUser={email:user.email,name:user.name||user.email,role:user.role||'Benutzer'};setLocked(false);updateUserChip()}
  }
  if(!currentUser){
    if(users.length===0)showSetup();else showLogin();
  }
  $('pbLoginButton')?.addEventListener('click',login);
  $('pbLoginPassword')?.addEventListener('keydown',e=>{if(e.key==='Enter')login()});
  $('pbSetupButton')?.addEventListener('click',firstSetup);
  $('pbLogout')?.addEventListener('click',logout);
  $('pbUserManagement')?.addEventListener('click',openUsers);
  $('pbUserClose')?.addEventListener('click',()=>$('pbUserModal')?.classList.add('hidden'));
  $('pbAddUser')?.addEventListener('click',addUser);
  $('pbUserList')?.addEventListener('click',e=>{const b=e.target.closest('[data-user-delete]');if(b)removeUser(b.dataset.userDelete)});
}
window.ProjectBauAuth={current:()=>currentUser,logout,openUsers,users:allUsers};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>boot().catch(e=>{console.error('Anmeldung',e);setMsg('Die Anmeldung konnte nicht initialisiert werden.','error')}),{once:true});
else boot().catch(console.error);
})();
