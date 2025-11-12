// Copied runtime JS for public folder
// Artale Boss Timer — MVP (public copy)

const STORAGE_KEY = 'abt_records_v1';
const MAX_PER_BOSS = 3000;

const BOSS_LIST = [ 'BossA', 'BossB', 'BossC' ];
const RESP_RULES = {
  'BossA': { type: 'fixedMinutes', minutes: 60 },
  'BossB': { type: 'rangeMinutes', min: 45, max: 60 },
  'BossC': { type: 'hourlyOffset', minute: 15 }
};

function keyFor(bossId, dateStr){ return `abt:${bossId}:${dateStr}`; }
function dateFromISO(iso){ const d = new Date(iso); const yyyy = d.getFullYear(); const mm = String(d.getMonth()+1).padStart(2,'0'); const dd = String(d.getDate()).padStart(2,'0'); return `${yyyy}-${mm}-${dd}`; }

function readRecordsForKey(key){ try{ const raw = localStorage.getItem(key); if(!raw) return { records: [], meta: { schemaVersion: 'v1' } }; return JSON.parse(raw); }catch(e){ console.error('readRecordsForKey error', e); return { records: [], meta: { schemaVersion: 'v1' } }; } }
function writeRecordsForKey(key, payload){ try{ localStorage.setItem(key, JSON.stringify(payload)); }catch(e){ console.error('writeRecordsForKey error', e); } }

function listAbtKeys(){ const keys = []; for(let i=0;i<localStorage.length;i++){ const k = localStorage.key(i); if(!k) continue; if(k.startsWith('abt:')) keys.push(k); } return keys; }

function findRecordKeyById(id){ const keys = listAbtKeys(); for(const k of keys){ const store = readRecordsForKey(k); const idx = store.records.findIndex(r => r.id === id); if(idx !== -1) return { key: k, index: idx, record: store.records[idx] }; } return null; }

function addRecord(rec){ const dateStr = dateFromISO(rec.timestamp); const key = keyFor(rec.bossId, dateStr); const store = readRecordsForKey(key); store.records.push(rec); writeRecordsForKey(key, store); purgeIfNeeded(rec.bossId); }

function updateRecord(id, changes){ const found = findRecordKeyById(id); if(!found) return false; const { key: oldKey } = found; const storeOld = readRecordsForKey(oldKey); const oldRec = storeOld.records[found.index]; const updated = Object.assign({}, oldRec, changes, { updatedAt: new Date().toISOString() }); const newDateStr = dateFromISO(updated.timestamp); const newKey = keyFor(updated.bossId, newDateStr); if(newKey === oldKey){ storeOld.records[found.index] = updated; writeRecordsForKey(oldKey, storeOld); }else{ storeOld.records.splice(found.index,1); writeRecordsForKey(oldKey, storeOld); const storeNew = readRecordsForKey(newKey); storeNew.records.push(updated); writeRecordsForKey(newKey, storeNew); } return true; }

function deleteRecord(id){ const found = findRecordKeyById(id); if(!found) return; const store = readRecordsForKey(found.key); store.records.splice(found.index,1); writeRecordsForKey(found.key, store); }

function purgeIfNeeded(bossId){ const keys = listAbtKeys().filter(k => k.startsWith(`abt:${bossId}:`)); const all = []; for(const k of keys){ const s = readRecordsForKey(k); for(const r of s.records) all.push({ id: r.id, createdAt: r.createdAt }); } if(all.length <= MAX_PER_BOSS) return; all.sort((a,b)=> new Date(a.createdAt) - new Date(b.createdAt)); const toRemove = all.slice(0, all.length - MAX_PER_BOSS).map(x=>x.id); for(const k of keys){ const s = readRecordsForKey(k); const before = s.records.length; s.records = s.records.filter(r => !toRemove.includes(r.id)); if(s.records.length !== before) writeRecordsForKey(k, s); } }

function getTodayRecordsForBoss(bossId){ const today = new Date(); const yyyy = today.getFullYear(); const mm = String(today.getMonth()+1).padStart(2,'0'); const dd = String(today.getDate()).padStart(2,'0'); const key = keyFor(bossId, `${yyyy}-${mm}-${dd}`); const store = readRecordsForKey(key); return (store.records || []).slice().sort((a,b)=> new Date(b.timestamp) - new Date(a.timestamp)); }

function migrateFromSingleKey(){ try{ const raw = localStorage.getItem(STORAGE_KEY); if(!raw) return; const old = JSON.parse(raw); if(!old || !Array.isArray(old.records)) return; for(const r of old.records){ const dateStr = dateFromISO(r.timestamp); const k = keyFor(r.bossId, dateStr); const s = readRecordsForKey(k); s.records.push(r); writeRecordsForKey(k, s); } localStorage.removeItem(STORAGE_KEY); console.info('migrated old storage to per-day-per-boss keys'); }catch(e){ console.error('migration failed', e); } }

function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,8); }
function formatTimeISOToLocalHHMMSS(iso){ const d = new Date(iso); return d.toLocaleTimeString(); }

function showToast(message, type = 'info', timeout = 3000){ try{ const container = document.getElementById('toastContainer'); if(!container) return; const el = document.createElement('div'); el.className = `toast ${type}`; el.textContent = message; container.appendChild(el); setTimeout(()=>{ el.style.animation = 'toastOut .22s forwards'; setTimeout(()=> container.removeChild(el), 240); }, timeout); }catch(e){ console.error('toast error', e); } }

function showConfirm(message){ return new Promise(resolve => { const modal = document.getElementById('confirmModal'); const msg = document.getElementById('confirmMessage'); const ok = document.getElementById('confirmOk'); const cancel = document.getElementById('confirmCancel'); if(!modal || !msg || !ok || !cancel){ resolve(window.confirm(message)); return; } msg.textContent = message; modal.classList.remove('hidden'); const cleanup = () => { modal.classList.add('hidden'); ok.removeEventListener('click', onOk); cancel.removeEventListener('click', onCancel); }; const onOk = () => { cleanup(); resolve(true); }; const onCancel = () => { cleanup(); resolve(false); }; ok.addEventListener('click', onOk); cancel.addEventListener('click', onCancel); }); }

function getRuleDescription(bossId){ const r = RESP_RULES[bossId]; if(!r) return '無規則資料'; if(r.type === 'fixedMinutes') return `固定 ${r.minutes} 分鐘後復活（擊殺時間 + ${r.minutes} 分鐘）。`; if(r.type === 'rangeMinutes') return `復活時間範圍 ${r.min} ~ ${r.max} 分鐘（擊殺時間後的區間）。`; if(r.type === 'hourlyOffset') return `每小時的 :${String(r.minute).padStart(2,'0')} 復活（例如 10:${String(r.minute).padStart(2,'0')}）。`; return '無法描述該規則'; }

function computeRespawnForRecord(rec){ const rule = RESP_RULES[rec.bossId]; if(!rule) return '無規則'; const t = new Date(rec.timestamp); if(rule.type === 'fixedMinutes'){ const r = new Date(t.getTime() + rule.minutes * 60 * 1000); return r.toLocaleTimeString(); } if(rule.type === 'rangeMinutes'){ const r1 = new Date(t.getTime() + rule.min * 60 * 1000); const r2 = new Date(t.getTime() + rule.max * 60 * 1000); return `${r1.toLocaleTimeString()} ~ ${r2.toLocaleTimeString()}`; } if(rule.type === 'hourlyOffset'){ const offset = rule.minute; const candidate = new Date(t); candidate.setSeconds(0,0); let next = new Date(candidate); next.setMinutes(offset); if(next <= t) next.setHours(next.getHours()+1); return next.toLocaleTimeString(); } return '無法計算'; }

const bossSelect = document.getElementById('bossSelect');
const formSection = document.getElementById('formSection');
const killForm = document.getElementById('killForm');
const formBoss = document.getElementById('formBoss');
const killTimeInput = document.getElementById('killTime');
const channelInput = document.getElementById('channel');
const noteInput = document.getElementById('note');
const recordsTableBody = document.querySelector('#recordsTable tbody');
const statsDiv = document.getElementById('stats');
const cancelBtn = document.getElementById('cancelBtn');

let currentBoss = BOSS_LIST[0];

function populateBossSelect(){ BOSS_LIST.forEach(b => { const opt = document.createElement('option'); opt.value = b; opt.textContent = b; bossSelect.appendChild(opt); }); bossSelect.value = BOSS_LIST[0]; currentBoss = BOSS_LIST[0]; if(formBoss) formBoss.textContent = currentBoss; }

function openForm(){ formSection.classList.remove('hidden'); formBoss.textContent = currentBoss; const now = new Date(); killTimeInput.value = now.toTimeString().split(' ')[0]; document.getElementById('editingId').value = ''; }
function closeForm(){ formSection.classList.add('hidden'); killForm.reset(); }

function renderRecords(){
  const rows = getTodayRecordsForBoss(currentBoss);
  recordsTableBody.innerHTML = '';
  rows.forEach(r => {
    const tr = document.createElement('tr');
    const respawnText = computeRespawnForRecord(r);

    const tdTime = document.createElement('td');
    tdTime.className = 'p-2 border';
    tdTime.textContent = formatTimeISOToLocalHHMMSS(r.timestamp);
    tr.appendChild(tdTime);

    const tdChannel = document.createElement('td');
    tdChannel.className = 'p-2 border';
    tdChannel.textContent = String(r.channel);
    tr.appendChild(tdChannel);

    const tdLooted = document.createElement('td');
    tdLooted.className = 'p-2 border';
    tdLooted.textContent = r.looted ? '是' : '否';
    tr.appendChild(tdLooted);

    const tdNote = document.createElement('td');
    tdNote.className = 'p-2 border';
    tdNote.textContent = r.note || '';
    tr.appendChild(tdNote);

    const tdRespawn = document.createElement('td');
    tdRespawn.className = 'p-2 border';
    tdRespawn.textContent = respawnText;
    tr.appendChild(tdRespawn);

    const tdActions = document.createElement('td');
    tdActions.className = 'p-2 border';

  const editBtn = document.createElement('button');
  editBtn.setAttribute('data-id', r.id);
  editBtn.setAttribute('data-action', 'edit');
  editBtn.className = 'editBtn bg-yellow-200 px-2 py-1 rounded mr-2';
  editBtn.type = 'button';
  editBtn.textContent = '編輯';
  tdActions.appendChild(editBtn);

  const deleteBtn = document.createElement('button');
  deleteBtn.setAttribute('data-id', r.id);
  deleteBtn.setAttribute('data-action', 'delete');
  deleteBtn.className = 'deleteBtn bg-red-200 px-2 py-1 rounded';
  deleteBtn.type = 'button';
  deleteBtn.textContent = '刪除';
  tdActions.appendChild(deleteBtn);

    tr.appendChild(tdActions);
    recordsTableBody.appendChild(tr);
  });
  statsDiv.textContent = `共 ${rows.length} 筆紀錄`;
}

bossSelect.addEventListener('change', e=>{ currentBoss = e.target.value; if(formBoss) formBoss.textContent = currentBoss; renderRecords(); try{ killTimeInput && killTimeInput.focus(); }catch(e){} });

cancelBtn.addEventListener('click', ()=>{ killForm.reset(); });

killForm.addEventListener('submit', e =>{ e.preventDefault(); const ch = Number(channelInput.value); if(!Number.isInteger(ch) || ch < 1 || ch > 3000){ showToast('頻道必須為 1 到 3000 的整數', 'error'); return; } const looted = killForm.looted.value === 'true'; const note = noteInput.value.trim(); const timeStr = killTimeInput.value; const today = new Date(); const yyyy = today.getFullYear(); const mm = String(today.getMonth()+1).padStart(2,'0'); const dd = String(today.getDate()).padStart(2,'0'); const iso = `${yyyy}-${mm}-${dd}T${timeStr}`; const nowIso = new Date().toISOString(); const editingId = document.getElementById('editingId').value; if(editingId){ const ok = updateRecord(editingId, { bossId: currentBoss, timestamp: iso, channel: ch, looted, note }); if(!ok){ showToast('更新失敗，找不到該紀錄', 'error'); return; } closeForm(); renderRecords(); showToast('已更新紀錄', 'success'); }else{ const rec = { id: uid(), bossId: currentBoss, timestamp: iso, channel: ch, looted, note, createdAt: nowIso, updatedAt: nowIso, version: 'v1' }; addRecord(rec); closeForm(); renderRecords(); showToast('已新增紀錄', 'success'); } });

// Event delegation for edit/delete actions on the records table
recordsTableBody.addEventListener('click', e => {
  const btn = e.target.closest('button');
  if(!btn || !recordsTableBody.contains(btn)) return;
  const action = btn.getAttribute('data-action');
  const id = btn.getAttribute('data-id');
  if(action === 'delete'){
    showConfirm('確認刪除該筆紀錄？').then(ok => { if(ok) deleteRecordAndNotify(id); });
    return;
  }
  if(action === 'edit'){
    const found = findRecordKeyById(id);
    if(!found){ showToast('找不到該筆紀錄', 'error'); return; }
    const rec = found.record;
    document.getElementById('editingId').value = rec.id;
    formBoss.textContent = rec.bossId;
    bossSelect.value = rec.bossId;
    currentBoss = rec.bossId;
    const t = new Date(rec.timestamp);
    killTimeInput.value = t.toTimeString().split(' ')[0];
    channelInput.value = rec.channel;
    noteInput.value = rec.note || '';
    const lootedEl = Array.from(killForm.looted);
    lootedEl.forEach(r => { r.checked = (r.value === String(rec.looted)); });
    openForm();
    return;
  }
});

const originalDeleteRecord = deleteRecord;
function deleteRecordAndNotify(id){ originalDeleteRecord(id); renderRecords(); showToast('已刪除紀錄', 'info'); }

// init
migrateFromSingleKey();
populateBossSelect();
renderRecords();
