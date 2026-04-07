/* ═══════════════════════════════════════════════════════════
   1. CORE STATE & CONFIG
═══════════════════════════════════════════════════════════ */
const STORAGE_KEY = 'studyCircus_v3';
let state = {};
let currentView = 'weekly';
let currentDate = new Date();

/* ═══════════════════════════════════════════════════════════
   2. SESSION & ROLE (PHASE 1)
═══════════════════════════════════════════════════════════ */
const SESSION_KEY = 'studyCircus_currentSession';
let currentSession = null;
let activeAccountId = null;

function bootSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) { redirectToLogin(); return; }
    currentSession = JSON.parse(raw);
    if (!currentSession?.accountId || !currentSession?.role) { redirectToLogin(); return; }
  } catch { redirectToLogin(); return; }

  activeAccountId = currentSession.role === 'COACH' ? currentSession.accountId : currentSession.linkedId;
  applyRoleUI();
  renderTickets();
}

function redirectToLogin() {
  localStorage.removeItem(SESSION_KEY);
  window.location.href = './login.html';
}

function logout() {
  if (!confirm('Çıkış yapmak istediğine emin misin?')) return;
  localStorage.removeItem(SESSION_KEY);
  window.location.href = './login.html';
}

function requiresRole(neededRole) {
  if (!currentSession) { showToast('Oturum bulunamadı.'); return false; }
  if (currentSession.role !== neededRole) { showToast('🔒 Bu işlem için Koç yetkisi gerekli.'); return false; }
  return true;
}

function isCoach()   { return currentSession?.role === 'COACH'; }
function isStudent() { return currentSession?.role === 'STUDENT'; }

function applyRoleUI() {
  const role = currentSession?.role || 'STUDENT';
  document.body.dataset.role = role;
  const badge = document.getElementById('roleBadge');
  if (badge) {
    badge.textContent = role === 'COACH' ? '🎓 Koç' : '🎒 Öğrenci';
    badge.style.background = role === 'COACH' ? 'rgba(244,162,97,0.2)' : 'rgba(69,123,157,0.2)';
    badge.style.color = role === 'COACH' ? '#F4A261' : '#457B9D';
  }
  if (role === 'STUDENT') document.documentElement.classList.add('student-mode');
  else document.documentElement.classList.remove('student-mode');
}

/* ═══════════════════════════════════════════════════════════
   3. DATA MANAGER & DEFAULTS
═══════════════════════════════════════════════════════════ */
function buildDefaultState() {
  return {
    subjects: [],
    categories: [
      { id: 'c1', name: 'Konu Çalışması', color: '#1D3557', emoji: '📚' },
      { id: 'c2', name: 'Soru Çözümü', color: '#F4A261', emoji: '📝' },
      { id: 'c3', name: 'Deneme', color: '#E63946', emoji: '🔴' }
    ],
    days: {}, 
    weeks: {}, 
    generalNotes: '', // YENİ: Tek string olarak genel notlar
    panelConfig: [
      { id: 'panel-countdown', title: '⏳ Geri Sayım', visible: true, collapsed: false },
      { id: 'panel-analytics', title: '📊 Analiz & İlerleme', visible: true, collapsed: false },
      { id: 'panel-notes', title: '📝 Genel Notlar', visible: true, collapsed: false },
      { id: 'panel-subjects', title: '📚 Dersler', visible: true, collapsed: false },
      { id: 'panel-categories', title: '🏷 Kategoriler', visible: true, collapsed: false },
      { id: 'panel-history', title: '📜 Bilet Geçmişi', visible: true, collapsed: false }, // Sadece koç görecek
      { id: 'panel-approvals', title: '✅ Onay Bekleyenler', visible: true, collapsed: false }
    ],
    economy: { tickets: 0, history: [] } // YENİ: History eklendi
  };
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) { 
      state = JSON.parse(saved);
      if (!state.panelConfig) { state.panelConfig = buildDefaultState().panelConfig; }
      if (!state.economy) state.economy = { tickets: 0, history: [] };
      if (!state.economy.history) state.economy.history = [];
      if (!state.weeks) state.weeks = {};
      if (typeof state.generalNotes !== 'string') state.generalNotes = '';
      saveState();
      return; 
    }
  } catch(e) {}
  state = buildDefaultState();
  saveState();
}

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch(e) {}
}

let cloudAutoSaveTimer = null;
function scheduleCloudAutoSave() {
  if (!activeAccountId) return;
  clearTimeout(cloudAutoSaveTimer);
  cloudAutoSaveTimer = setTimeout(() => saveToCloud(), 3000); 
}

function saveStateAndSync() {
  saveState();
  scheduleCloudAutoSave();
}

/* ═══════════════════════════════════════════════════════════
   4. CLOUD SYNC WORKER
═══════════════════════════════════════════════════════════ */
const WORKER_URL = 'https://database.ahmetbsarpkaya.workers.dev/';

function updateSyncBadge(status) {
  const badge = document.getElementById('syncBadge');
  if(!badge) return;
  badge.className = 'icon-btn sync-badge';
  if (status === 'syncing') { badge.classList.add('syncing'); badge.title = 'İşleniyor…'; }
  else if (status === 'synced') { badge.classList.add('synced'); badge.title = 'Bağlı ✓'; }
  else if (status === 'error')  { badge.classList.add('error');  badge.title = 'Hata'; }
  else { badge.title = activeAccountId ? 'Bağlı ✓' : 'Bağlı Değil'; }
}

async function fetchCentralData() {
  const res = await fetch(WORKER_URL + `?t=${Date.now()}`);
  if (!res.ok) throw new Error('Buluta erişilemedi.');
  return await res.json() || {};
}

async function updateCentralData(allData) {
  const res = await fetch(WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(allData)
  });
  if (!res.ok) throw new Error('Buluta kaydedilemedi.');
}

async function saveToCloud() {
  if (!activeAccountId) return;
  try {
    updateSyncBadge('syncing');
    
    const ind = document.getElementById('autoSaveIndicator');
    if (ind) { ind.textContent = 'Kaydediliyor...'; ind.style.opacity = '1'; }

    const allData = await fetchCentralData();
    allData[activeAccountId] = { ...state, _savedAt: Date.now() };
    await updateCentralData(allData);
    
    updateSyncBadge('synced');
    
    if (ind) { 
      ind.textContent = 'Kaydedildi ✓'; 
      setTimeout(() => { ind.style.opacity = '0'; }, 3000); 
    }
    setTimeout(()=>updateSyncBadge('idle'), 3000);
  } catch(e) {
    updateSyncBadge('error'); console.error(e);
    const ind = document.getElementById('autoSaveIndicator');
    if (ind) { ind.textContent = 'Kayıt Hatası ✕'; ind.style.opacity = '1'; }
  }
}

async function loadFromCloud() {
  if (!activeAccountId) return;
  try {
    updateSyncBadge('syncing');
    const allData = await fetchCentralData();
    if (!allData[activeAccountId]) { updateSyncBadge('idle'); return; }
    
    state = allData[activeAccountId];
    saveState();
    renderAll();
    updateSyncBadge('synced');
    setTimeout(()=>updateSyncBadge('idle'), 3000);
  } catch(e) {
    updateSyncBadge('error'); console.error(e); showToast('Buluttan veri çekilemedi!');
  }
}

/* ═══════════════════════════════════════════════════════════
   5. ECONOMY, APPROVALS & HISTORY
═══════════════════════════════════════════════════════════ */
function getTickets() { return state.economy?.tickets ?? 0; }
function renderTickets() {
  const el = document.getElementById('ticketDisplay');
  if (el) el.textContent = `🎟️ ${getTickets()}`;
}

function adjustTickets(amount, reason) {
  if (!requiresRole('COACH')) return;
  if (!state.economy) state.economy = { tickets: 0, history: [] };
  if (!state.economy.history) state.economy.history = [];
  
  state.economy.tickets = Math.max(0, (state.economy.tickets || 0) + amount);
  state.economy.history.push({ date: Date.now(), amount, reason: reason || 'Manuel Düzenleme' });
  
  saveStateAndSync(); renderAll(); renderTickets();
  showToast(`${amount >= 0 ? '+' : ''}${amount} 🎟️ ${reason || ''}`);
}

let taskToComplete = null;
function openCompleteModal(blockId, ds) {
  taskToComplete = { blockId, ds };
  document.getElementById('taskCompleteNote').value = '';
  openModal('completeTaskModal');
}

function confirmCompleteTask() {
  if(!taskToComplete) return;
  const note = document.getElementById('taskCompleteNote').value.trim();
  const {blockId, ds} = taskToComplete;
  
  const block = state.days[ds]?.blocks.find(b => b.id === blockId);
  if(block) {
    block.studentNote = note;
    block.status = 'pending';
    block.completed = false;
    saveStateAndSync(); renderAll(); showToast('Onay için gönderildi ⏳');
  }
  closeModal('completeTaskModal');
}

function markBlockPending(blockId, ds) {
  const block = state.days[ds]?.blocks.find(b => b.id === blockId);
  if (!block) return;
  
  if (isCoach()) { approveBlock(blockId, ds); return; }
  
  if (block.status === 'pending') {
    block.status = 'active'; block.completed = false; block.studentNote = '';
    saveStateAndSync(); renderAll(); showToast('Görev onaydan çıkarıldı.'); return;
  }
  if (block.status === 'approved') { showToast('🔒 Bu görev zaten onaylandı.'); return; }
  
  // Eğer active ise not alma modalını aç
  openCompleteModal(blockId, ds);
}

function approveBlock(blockId, ds) {
  if (!requiresRole('COACH')) return;
  const block = state.days[ds]?.blocks.find(b => b.id === blockId);
  if (!block) return;
  
  block.status = 'approved'; block.completed = true;
  const reward = block.reward || 0;
  if (reward > 0) {
    if (!state.economy) state.economy = { tickets: 0, history: [] };
    if (!state.economy.history) state.economy.history = [];
    
    state.economy.tickets += reward;
    state.economy.history.push({ date: Date.now(), amount: reward, reason: `${block.title} Onayı` });
    showToast(`Onaylandı! +${reward} 🎟️`);
  } else showToast('Görev onaylandı ✓');
  
  saveStateAndSync(); renderAll(); renderTickets();
}

function rejectBlock(blockId, ds) {
  if (!requiresRole('COACH')) return;
  const block = state.days[ds]?.blocks.find(b => b.id === blockId);
  if (!block) return;
  block.status = 'active'; block.completed = false; block.studentNote = '';
  saveStateAndSync(); renderAll(); showToast('Görev geri alındı.');
}

function toggleComplete(blockId, ds) {
  const block = state.days[ds]?.blocks.find(b => b.id === blockId);
  if (!block) return;
  
  if (isCoach()) {
    if (block.status === 'approved' || block.completed) {
      block.status = 'active'; block.completed = false; block.studentNote = '';
    } else { approveBlock(blockId, ds); return; }
    saveStateAndSync(); renderAll();
  } else {
    markBlockPending(blockId, ds);
  }
}

/* ═══════════════════════════════════════════════════════════
   6. UTILS & HELPERS
═══════════════════════════════════════════════════════════ */
function uid() { return '_' + Math.random().toString(36).slice(2, 10); }
function toDateStr(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function escHtml(str) { return (str||'').replace(/[&<>'"]/g, tag => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[tag])); }
function getCat(id) { return state.categories.find(c => c.id === id) || { name: '—', color: '#ccc', emoji: '' }; }
function getSubject(id) { return state.subjects.find(s => s.id === id); }

function getStartOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay(), diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

function populateSelects() {
  const cSel = document.getElementById('blockCat');
  const sSel = document.getElementById('blockSubj');
  if(cSel) cSel.innerHTML = state.categories.map(c => `<option value="${c.id}">${c.emoji} ${c.name}</option>`).join('');
  if(sSel) sSel.innerHTML = '<option value="">-- Ders Seçin (Opsiyonel) --</option>' + state.subjects.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
}

/* ═══════════════════════════════════════════════════════════
   7. COLOR PICKER
═══════════════════════════════════════════════════════════ */
const PALETTE = ['#1D3557', '#457B9D', '#E63946', '#E07A5F', '#F4A261', '#52B788', '#2A9D8F', '#9B72CF'];
let tempSelectedColor = PALETTE[0];

function renderColorPicker(containerId, initialColor) {
  const container = document.getElementById(containerId);
  if(!container) return;
  tempSelectedColor = initialColor || PALETTE[0];
  
  container.innerHTML = PALETTE.map(color => `
    <div class="color-swatch" 
         style="background:${color}; width:28px; height:28px; border-radius:50%; cursor:pointer; 
                border: 3px solid ${color === tempSelectedColor ? '#0f1923' : 'transparent'};
                box-shadow: 0 2px 4px rgba(0,0,0,0.1); transition: transform 0.1s;"
         onclick="selectColor('${containerId}', '${color}')"
         onmouseover="this.style.transform='scale(1.1)'"
         onmouseout="this.style.transform='scale(1)'">
    </div>
  `).join('');
  container.style.display = 'flex';
  container.style.gap = '10px';
  container.style.flexWrap = 'wrap';
}

function selectColor(containerId, color) {
  tempSelectedColor = color;
  renderColorPicker(containerId, color);
}

/* ═══════════════════════════════════════════════════════════
   8. RENDER VIEWS (Haftalık / Günlük / Aylık)
═══════════════════════════════════════════════════════════ */
function renderAll() {
  renderView();
  renderPanels();
}

function switchView(view) {
  currentView = view;
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  document.getElementById('nav-' + view)?.classList.add('active');
  renderView();
}

function renderView() {
  const container = document.getElementById('view-container');
  if (!container) return;
  container.innerHTML = '';

  const controls = document.createElement('div');
  controls.style.display = 'flex'; controls.style.justifyContent = 'space-between'; controls.style.marginBottom = '15px';
  controls.innerHTML = `
    <button class="icon-btn" onclick="changeDate(-1)">◀</button>
    <div style="font-weight:700; font-size:1.1rem; color:var(--navy); display:flex; align-items:center;">
      ${currentDate.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}
    </div>
    <button class="icon-btn" onclick="changeDate(1)">▶</button>
  `;
  container.appendChild(controls);

  const viewWrapper = document.createElement('div');
  if (currentView === 'weekly') viewWrapper.innerHTML = buildWeeklyGrid();
  else if (currentView === 'daily') viewWrapper.innerHTML = buildDailyGrid();
  else if (currentView === 'monthly') viewWrapper.innerHTML = buildMonthlyGrid();
  
  container.appendChild(viewWrapper);
}

function changeDate(dir) {
  if (currentView === 'weekly') currentDate.setDate(currentDate.getDate() + (dir * 7));
  else if (currentView === 'daily') currentDate.setDate(currentDate.getDate() + dir);
  else if (currentView === 'monthly') currentDate.setMonth(currentDate.getMonth() + dir);
  renderView();
}

function buildBlockHtml(b, ds) {
  const cat = getCat(b.catId);
  const sub = getSubject(b.subjectId);
  const statusClass = b.completed ? 'completed status-approved' : `status-${b.status||'active'}`;
  
  return `
    <div class="block-item ${statusClass}" style="border-color:${cat.color}40;">
      <div class="block-stripe" style="background:${cat.color}"></div>
      <div style="display:flex; justify-content:space-between; align-items:flex-start;">
        <div style="flex:1;" onclick="toggleComplete('${b.id}', '${ds}')">
          <div style="font-size:0.65rem; color:${cat.color}; font-weight:700; margin-bottom:2px;">${cat.emoji} ${cat.name}</div>
          <div class="block-title">${escHtml(b.title)}</div>
          ${sub ? `<div class="block-subj" style="color:${sub.color}">${sub.name}</div>` : ''}
          ${b.reward ? `<div style="font-size:0.65rem; color:var(--gold); margin-top:4px;">🎟️ Ödül: ${b.reward}</div>` : ''}
        </div>
        <button class="icon-btn coach-only" style="width:24px; height:24px; font-size:0.7rem; border:none; background:transparent;" onclick="openEditBlock('${b.id}','${ds}'); event.stopPropagation();">✏️</button>
      </div>
    </div>
  `;
}

function saveDayNote(ds, text) {
  if (!requiresRole('COACH')) return;
  if (!state.days[ds]) state.days[ds] = { blocks: [], context: '' };
  state.days[ds].context = text;
  saveStateAndSync();
}

function saveWeekNote(ws, text) {
  if (!requiresRole('COACH')) return;
  if (!state.weeks) state.weeks = {};
  state.weeks[ws] = text;
  saveStateAndSync();
}

function buildWeeklyGrid() {
  const start = getStartOfWeek(currentDate);
  const ws = toDateStr(start);
  if (!state.weeks) state.weeks = {};
  const weekNote = state.weeks[ws] || '';

  let html = `
    <div style="background:var(--white); border-radius:16px; padding:15px; border:1px solid var(--border); margin-bottom:15px;">
      <label style="font-size:0.7rem; font-weight:700; color:var(--muted); text-transform:uppercase;">📅 Haftanın Genel Notu / Hedefi</label>
      <textarea class="form-input" style="margin-top:5px; resize:vertical; min-height:50px; font-family:'Outfit',sans-serif; text-transform:none; letter-spacing:0;" 
        placeholder="${isStudent() ? 'Koç henüz not eklememiş.' : 'Bu haftaya özel notlar, hedefler ekleyin...'}" 
        ${isStudent() ? 'readonly' : ''} 
        onchange="saveWeekNote('${ws}', this.value)">${weekNote}</textarea>
    </div>
    <div class="weekly-grid">
  `;
  
  for(let i=0; i<7; i++) {
    const d = new Date(start); d.setDate(d.getDate() + i);
    const ds = toDateStr(d);
    const dayData = state.days[ds] || { blocks: [] };
    const isToday = ds === toDateStr(new Date()) ? 'today' : '';

    html += `
      <div class="day-card ${isToday}">
        <div class="day-head">
          <div class="day-name">${d.toLocaleDateString('tr-TR', {weekday:'short'})}</div>
          <div class="day-date">${d.getDate()} ${d.toLocaleDateString('tr-TR', {month:'short'})}</div>
        </div>
        <div class="day-body">
          ${dayData.blocks.map(b => buildBlockHtml(b, ds)).join('')}
          <button class="sb-add-btn coach-only add-block-btn" onclick="openAddBlock('${ds}')" style="margin-top:auto;">+ Görev Ekle</button>
        </div>
      </div>
    `;
  }
  html += '</div>'; return html;
}

function buildDailyGrid() {
  const ds = toDateStr(currentDate);
  const dayData = state.days[ds] || { blocks: [], context: '' };
  
  let html = `
    <div style="background:var(--white); border-radius:16px; padding:20px; border:1px solid var(--border);">
      <h2 style="margin-bottom:15px; display:flex; align-items:center; gap:10px;">
        ${currentDate.toLocaleDateString('tr-TR', {weekday:'long', day:'numeric', month:'long'})}
        <button class="btn-primary coach-only" style="width:auto; padding:6px 12px; font-size:0.8rem;" onclick="openAddBlock('${ds}')">+ Yeni Görev</button>
      </h2>
      
      <div style="margin-bottom: 20px;">
        <label style="font-size:0.7rem; font-weight:700; color:var(--muted); text-transform:uppercase;">📝 Günün Notu / Hedefi</label>
        <textarea class="form-input" style="margin-top:5px; resize:vertical; min-height:60px; font-family:'Outfit',sans-serif; text-transform:none; letter-spacing:0;" 
          placeholder="${isStudent() ? 'Koç henüz not eklememiş.' : 'Bu gün için not veya hedef ekleyin...'}" 
          ${isStudent() ? 'readonly' : ''} 
          onchange="saveDayNote('${ds}', this.value)">${dayData.context || ''}</textarea>
      </div>

      <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(250px, 1fr)); gap:15px;">
        ${(!dayData.blocks || dayData.blocks.length === 0) ? '<div style="color:var(--muted); font-size:0.9rem;">Bu gün için plan yok.</div>' : dayData.blocks.map(b => buildBlockHtml(b, ds)).join('')}
      </div>
    </div>
  `;
  return html;
}

function buildMonthlyGrid() {
  const year = currentDate.getFullYear(), month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  
  let html = '<div style="display:grid; grid-template-columns:repeat(7,1fr); gap:8px;">';
  const days = ['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'];
  days.forEach(d => html += `<div style="text-align:center; font-weight:700; font-size:0.8rem; color:var(--muted); padding:5px;">${d}</div>`);
  
  const offset = firstDay === 0 ? 6 : firstDay - 1;
  for(let i=0; i<offset; i++) html += '<div></div>';
  
  for(let i=1; i<=daysInMonth; i++) {
    const d = new Date(year, month, i);
    const ds = toDateStr(d);
    const count = (state.days[ds]?.blocks || []).length;
    const isToday = ds === toDateStr(new Date()) ? 'border:2px solid var(--navy);' : 'border:1px solid var(--border);';
    
    html += `
      <div style="background:var(--white); border-radius:10px; padding:10px; min-height:80px; cursor:pointer; ${isToday} transition:all .2s;" 
           onclick="currentDate=new Date('${ds}'); switchView('daily');"
           onmouseover="this.style.background='#f8f9fa'" onmouseout="this.style.background='var(--white)'">
        <div style="font-weight:700; font-size:0.9rem;">${i}</div>
        ${count > 0 ? `<div style="font-size:0.7rem; color:var(--white); background:var(--navy); border-radius:4px; padding:2px 5px; margin-top:5px; display:inline-block;">${count} Görev</div>` : ''}
      </div>
    `;
  }
  html += '</div>'; return html;
}

/* ═══════════════════════════════════════════════════════════
   9. TASK (BLOCK) MANAGEMENT
═══════════════════════════════════════════════════════════ */
function openAddBlock(ds) {
  if (!requiresRole('COACH')) return;
  populateSelects();
  document.getElementById('blockId').value = '';
  document.getElementById('blockDay').value = ds;
  document.getElementById('blockTitle').value = '';
  document.getElementById('blockDesc').value = '';
  document.getElementById('blockReward').value = '';
  document.getElementById('blockLinksContainer').innerHTML = '';
  
  document.getElementById('blockModalTitle').textContent = 'Yeni Görev Ekle';
  openModal('addBlockModal');
}

function openEditBlock(blockId, ds) {
  if (!requiresRole('COACH')) return;
  populateSelects();
  const day = state.days[ds]; if (!day) return;
  const b = day.blocks.find(x => x.id === blockId); if (!b) return;
  
  document.getElementById('blockId').value = blockId;
  document.getElementById('blockDay').value = ds;
  document.getElementById('blockCat').value = b.catId;
  document.getElementById('blockSubj').value = b.subjectId || '';
  document.getElementById('blockTitle').value = b.title;
  document.getElementById('blockDesc').value = b.desc || '';
  document.getElementById('blockReward').value = b.reward || '';
  
  const linksContainer = document.getElementById('blockLinksContainer');
  linksContainer.innerHTML = '';
  if (b.links) b.links.forEach(l => addLinkRow(l));
  
  document.getElementById('blockModalTitle').textContent = 'Görevi Düzenle';
  openModal('addBlockModal');
}

function saveBlock() {
  if (!requiresRole('COACH')) return;
  const ds = document.getElementById('blockDay').value;
  const bId = document.getElementById('blockId').value;
  const catId = document.getElementById('blockCat').value;
  const subId = document.getElementById('blockSubj').value || null;
  const title = document.getElementById('blockTitle').value.trim();
  const desc = document.getElementById('blockDesc').value.trim();
  const rewardVal = parseInt(document.getElementById('blockReward').value) || 0;
  
  const linkInputs = document.querySelectorAll('.link-url');
  const links = Array.from(linkInputs).map(i => i.value.trim()).filter(v => v);
  
  if (!ds || !catId || !title) return showToast('Lütfen Kategori ve Başlık girin.');
  if (!state.days[ds]) state.days[ds] = { blocks: [] };
  
  if (bId) {
    const b = state.days[ds].blocks.find(x => x.id === bId);
    if (b) {
      b.catId=catId; b.subjectId=subId; b.title=title; b.desc=desc; 
      b.reward=rewardVal; b.links=links;
    }
  } else {
    state.days[ds].blocks.push({
      id: `b_${ds}_${uid()}`, catId, subjectId:subId, title, desc, 
      reward:rewardVal, links, completed:false, status: 'active'
    });
  }
  
  saveStateAndSync(); closeModal('addBlockModal'); renderAll();
}

function deleteBlock(bId, ds) {
  if (!requiresRole('COACH')) return;
  if(!confirm('Bu görevi silmek istediğinize emin misiniz?')) return;
  state.days[ds].blocks = state.days[ds].blocks.filter(b => b.id !== bId);
  saveStateAndSync(); closeModal('blockDetailModal'); renderAll();
}

function addLinkRow(val = '') {
  const container = document.getElementById('blockLinksContainer');
  if (!container) return;
  const row = document.createElement('div');
  row.style.display = 'flex'; row.style.gap = '5px'; row.style.marginBottom = '5px';
  row.innerHTML = `<input class="form-input link-url" placeholder="https://..." value="${val}" style="flex:1;">
                   <button class="btn-secondary" style="width:auto; padding:0 10px;" onclick="this.parentElement.remove()">✕</button>`;
  container.appendChild(row);
}
/* ═══════════════════════════════════════════════════════════
   10. SUBJECT & CATEGORY MANAGEMENT (+ Silme İşlemleri)
═══════════════════════════════════════════════════════════ */
function openAddSubject(id = null) {
  if (!requiresRole('COACH')) return;
  document.getElementById('subjectId').value = id || '';
  const s = id ? getSubject(id) : null;
  document.getElementById('subjectName').value = s ? s.name : '';
  document.getElementById('subjectExamDate').value = s ? s.examDate : '';
  
  // YENİ: Sil butonunu düzenleme modundaysa göster, yeni eklerken gizle
  const delBtn = document.getElementById('btnDeleteSubject');
  if(delBtn) delBtn.style.display = id ? 'block' : 'none';

  renderColorPicker('subjectColorPicker', s ? s.color : PALETTE[0]);
  openModal('addSubjectModal');
}

function saveSubject() {
  if (!requiresRole('COACH')) return;
  const name = document.getElementById('subjectName').value.trim();
  if(!name) return;
  const id = document.getElementById('subjectId').value || uid();
  const existing = getSubject(id);
  
  const data = { id, name, examDate: document.getElementById('subjectExamDate').value, color: tempSelectedColor };
  
  if(existing) Object.assign(existing, data);
  else state.subjects.push(data);
  
  saveStateAndSync(); closeModal('addSubjectModal'); renderAll();
}

// YENİ: Dersi Silme Fonksiyonu
function deleteSubject() {
  if (!requiresRole('COACH')) return;
  const id = document.getElementById('subjectId').value;
  if(!id) return;
  if(!confirm('Bu dersi silmek istediğine emin misin?')) return;
  
  state.subjects = state.subjects.filter(s => s.id !== id);
  saveStateAndSync(); closeModal('addSubjectModal'); renderAll();
}

function openAddCategory(id = null) {
  if (!requiresRole('COACH')) return;
  document.getElementById('categoryId').value = id || '';
  const c = id ? getCat(id) : null;
  document.getElementById('catName').value = c ? c.name : '';
  document.getElementById('catEmoji').value = c ? c.emoji : '';
  
  // Sil butonunu duruma göre göster/gizle
  const delBtn = document.getElementById('btnDeleteCategory');
  if(delBtn) delBtn.style.display = id ? 'block' : 'none';

  renderColorPicker('catColorPicker', c ? c.color : PALETTE[4]);
  openModal('addCategoryModal');
}

function saveCategory() {
  if (!requiresRole('COACH')) return;
  const name = document.getElementById('catName').value.trim();
  if(!name) return;
  const id = document.getElementById('categoryId').value || uid();
  const existing = state.categories.find(c => c.id === id);
  const data = { id, name, emoji: document.getElementById('catEmoji').value.trim(), color: tempSelectedColor };
  if(existing) Object.assign(existing, data); else state.categories.push(data);
  saveStateAndSync(); closeModal('addCategoryModal'); renderAll();
}

function deleteCategory() {
  if (!requiresRole('COACH')) return;
  const id = document.getElementById('categoryId').value;
  if(!id) return;
  if(!confirm('Bu kategoriyi silmek istediğine emin misin?')) return;
  
  state.categories = state.categories.filter(c => c.id !== id);
  saveStateAndSync(); closeModal('addCategoryModal'); renderAll();
}
/* ═══════════════════════════════════════════════════════════
   11. SIDEBAR PANELS & MANAGE PANELS
═══════════════════════════════════════════════════════════ */
function toggleSidebar() {
  document.getElementById('sidebar')?.classList.toggle('open');
  document.getElementById('sidebarOverlay')?.classList.toggle('open');
}

function togglePanel(id) {
  const b = document.getElementById(id)?.querySelector('.sb-body');
  if(b) b.classList.toggle('collapsed');
}

function renderPanels() {
  renderCountdownPanel();
  renderAnalyticsPanel();
  renderGeneralNotesPanel();
  renderSubjectsPanel();
  renderCategoriesPanel();
  
  if(isCoach()) {
    renderTicketHistoryPanel();
    renderPendingApprovalsPanel();
  }
  
  applyPanelVisibility();
  renderManagePanelsModal();
}

function applyPanelVisibility() {
  state.panelConfig.forEach(p => {
    const el = document.getElementById(p.id);
    if(el) el.style.display = p.visible ? 'block' : 'none';
  });
}

function renderManagePanelsModal() {
  const body = document.getElementById('panelManageBody');
  if(!body) return;
  body.innerHTML = state.panelConfig.map(p => `
    <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 0; border-bottom:1px solid var(--border);">
      <div style="font-size:0.95rem; font-weight:600;">${p.title}</div>
      <label style="position:relative; display:inline-block; width:44px; height:24px;">
        <input type="checkbox" ${p.visible ? 'checked' : ''} onchange="togglePanelConfig('${p.id}', this.checked)" style="opacity:0; width:0; height:0;">
        <span style="position:absolute; cursor:pointer; top:0; left:0; right:0; bottom:0; background-color:${p.visible ? 'var(--green)' : '#ccc'}; border-radius:34px; transition:.4s; box-shadow: inset 0 1px 3px rgba(0,0,0,0.2);"></span>
        <span style="position:absolute; content:''; height:18px; width:18px; left:3px; bottom:3px; background-color:white; border-radius:50%; transition:.4s; transform:${p.visible ? 'translateX(20px)' : 'translateX(0)'};"></span>
      </label>
    </div>
  `).join('');
}

function togglePanelConfig(id, isVisible) {
  const p = state.panelConfig.find(x => x.id === id);
  if(p) p.visible = isVisible;
  saveStateAndSync();
  applyPanelVisibility();
  renderManagePanelsModal();
}

// ── YENİ PANELLER ──

function renderCountdownPanel() {
  const p = document.getElementById('panel-countdown'); if(!p) return;
  let html = `<div class="sb-head" onclick="togglePanel('panel-countdown')"><div class="sb-head-title">▼ ⏳ Geri Sayım</div></div><div class="sb-body">`;
  
  const today = new Date(); today.setHours(0,0,0,0);
  const exams = state.subjects.filter(s => s.examDate).map(s => ({...s, dateObj: new Date(s.examDate) })).filter(s => s.dateObj >= today).sort((a,b) => a.dateObj - b.dateObj);
  
  if(exams.length === 0) {
     html += `<div style="font-size:0.8rem; color:var(--muted); text-align:center;">Yaklaşan sınav/etkinlik bulunmuyor.</div>`;
  } else {
     const next = exams[0];
     const diffDays = Math.ceil((next.dateObj - today) / (1000 * 60 * 60 * 24));
     html += `<div style="text-align:center; padding: 5px 0;">
                <div style="font-size: 0.8rem; color:var(--muted); font-weight:700; text-transform:uppercase;">${next.name} Sınavı</div>
                <div style="font-size: 2.5rem; font-weight:700; color:${next.color}; font-family:'DM Mono',monospace; line-height:1;">${diffDays}</div>
                <div style="font-size: 0.8rem; font-weight:700; color:var(--muted);">GÜN KALDI</div>
              </div>`;
  }
  html += `</div>`; p.innerHTML = html;
}

function renderAnalyticsPanel() {
  const p = document.getElementById('panel-analytics'); if(!p) return;
  let html = `<div class="sb-head" onclick="togglePanel('panel-analytics')"><div class="sb-head-title">▼ 📊 Analiz & İlerleme</div></div><div class="sb-body">`;
  
  let earned = 0; let spent = 0;
  (state.economy.history || []).forEach(h => { if(h.amount > 0) earned += h.amount; else spent += Math.abs(h.amount); });
  
  let approvedTasks = 0; let pendingTasks = 0;
  Object.values(state.days).forEach(d => {
      d.blocks.forEach(b => {
          if(b.status === 'approved') approvedTasks++;
          if(b.status === 'pending') pendingTasks++;
      });
  });

  html += `
     <div style="display:flex; gap:10px; margin-bottom:12px;">
       <div style="flex:1; background:rgba(82,183,136,0.1); padding:10px; border-radius:10px; text-align:center;">
          <div style="font-size:1.4rem; font-weight:700; color:var(--green); font-family:'DM Mono',monospace;">${earned}</div>
          <div style="font-size:0.55rem; text-transform:uppercase; color:var(--muted); font-weight:700; letter-spacing:1px;">Kazanılan 🎟️</div>
       </div>
       <div style="flex:1; background:rgba(230,57,70,0.1); padding:10px; border-radius:10px; text-align:center;">
          <div style="font-size:1.4rem; font-weight:700; color:var(--red); font-family:'DM Mono',monospace;">${spent}</div>
          <div style="font-size:0.55rem; text-transform:uppercase; color:var(--muted); font-weight:700; letter-spacing:1px;">Harcanan 🎟️</div>
       </div>
     </div>
     <div style="background:var(--white); border:1px solid var(--border); padding:12px; border-radius:10px;">
       <div style="font-size:0.8rem; font-weight:600; margin-bottom:6px; display:flex; justify-content:space-between;"><span>Tamamlanan:</span> <span style="color:var(--navy);">${approvedTasks} Görev</span></div>
       <div style="font-size:0.8rem; font-weight:600; display:flex; justify-content:space-between;"><span>Bekleyen:</span> <span style="color:var(--gold);">${pendingTasks} Görev</span></div>
     </div>
  </div>`;
  p.innerHTML = html;
}

function renderGeneralNotesPanel() {
  const p = document.getElementById('panel-notes'); if(!p) return;
  let html = `<div class="sb-head" onclick="togglePanel('panel-notes')"><div class="sb-head-title">▼ 📝 Genel Notlar</div></div><div class="sb-body">`;
  html += `<textarea class="form-input" style="min-height:120px; resize:vertical; font-family:'Outfit',sans-serif;" 
            placeholder="${isStudent() ? 'Koç henüz not eklememiş.' : 'Öğrenci için her zaman görünecek genel notlar...'}" 
            ${isStudent() ? 'readonly' : ''} 
            onchange="saveGeneralNote(this.value)">${state.generalNotes || ''}</textarea>
           </div>`;
  p.innerHTML = html;
}

function saveGeneralNote(val) {
  if(isCoach()) { state.generalNotes = val; saveStateAndSync(); }
}

function renderTicketHistoryPanel() {
  const p = document.getElementById('panel-history'); if(!p) return;
  let html = `<div class="sb-head" onclick="togglePanel('panel-history')"><div class="sb-head-title">▼ 📜 Bilet Geçmişi</div></div><div class="sb-body">`;
  if(!state.economy.history || state.economy.history.length === 0) {
     html += `<div style="font-size:0.8rem; color:var(--muted); text-align:center;">Geçmiş bulunmuyor.</div>`;
  } else {
     const hist = [...state.economy.history].reverse().slice(0, 8); // Son 8 işlemi göster
     hist.forEach(h => {
        const color = h.amount >= 0 ? 'var(--green)' : 'var(--red)';
        const sign = h.amount >= 0 ? '+' : '';
        html += `<div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid var(--border); font-size:0.8rem;">
                   <div style="color:var(--muted); display:flex; flex-direction:column;">
                     <span style="font-weight:600; color:var(--ink); font-size:0.75rem;">${escHtml(h.reason)}</span>
                     <span style="font-size:0.6rem;">${new Date(h.date).toLocaleDateString('tr-TR', {day:'numeric',month:'short', hour:'2-digit', minute:'2-digit'})}</span>
                   </div>
                   <div style="font-weight:700; color:${color}; font-family:'DM Mono',monospace;">${sign}${h.amount}</div>
                 </div>`;
     });
  }
  html += `</div>`; p.innerHTML = html;
}

function renderSubjectsPanel() {
  const p = document.getElementById('panel-subjects'); if(!p) return;
  let html = `<div class="sb-head" onclick="togglePanel('panel-subjects')"><div class="sb-head-title">▼ 📚 Dersler</div></div><div class="sb-body">`;
  if (state.subjects.length === 0) html += `<div style="font-size:0.8rem; color:var(--muted);">Ders bulunmuyor.</div>`;
  state.subjects.forEach(s => {
    html += `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid var(--border);">
        <div style="font-size:0.85rem; font-weight:600;">
          <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${s.color}; margin-right:5px;"></span>
          ${s.name} ${s.examDate ? `<br><span style="font-size:0.65rem; color:var(--red); margin-left:15px;">Sınav: ${s.examDate}</span>` : ''}
        </div>
        <button class="icon-btn coach-only" style="width:24px; height:24px; font-size:0.7rem;" onclick="openAddSubject('${s.id}')">✏️</button>
      </div>`;
  });
  html += `<button class="sb-add-btn coach-only" onclick="openAddSubject()">+ Ders Ekle</button></div>`;
  p.innerHTML = html;
}

function renderCategoriesPanel() {
  const p = document.getElementById('panel-categories'); if(!p) return;
  let html = `<div class="sb-head" onclick="togglePanel('panel-categories')"><div class="sb-head-title">▼ 🏷 Kategoriler</div></div><div class="sb-body">`;
  state.categories.forEach(c => {
    html += `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid var(--border);">
        <div style="font-size:0.85rem; font-weight:600; color:${c.color};">${c.emoji} ${c.name}</div>
        <button class="icon-btn coach-only" style="width:24px; height:24px; font-size:0.7rem;" onclick="openAddCategory('${c.id}')">✏️</button>
      </div>`;
  });
  html += `<button class="sb-add-btn coach-only" onclick="openAddCategory()">+ Kategori Ekle</button></div>`;
  p.innerHTML = html;
}

function renderPendingApprovalsPanel() {
  const pending = [];
  Object.entries(state.days || {}).forEach(([ds, day]) => {
    (day.blocks || []).forEach(block => {
      if (block.status === 'pending') pending.push({ block, ds });
    });
  });

  ['pendingBadge','pendingBadgeSidebar', 'pendingBadgeModal'].forEach(id => {
    const el = document.getElementById(id);
    if(el) { el.textContent = pending.length; el.style.display = pending.length > 0 ? 'inline-flex' : 'none'; }
  });

  const html = pending.length === 0
    ? '<div style="font-size:.74rem;color:var(--muted);text-align:center;padding:12px 0;">Bekleyen onay yok ✓</div>'
    : pending.map(({ block, ds }) => {
        const cat = getCat(block.catId);
        return `
          <div class="pending-item">
            <div class="pending-stripe" style="background:${cat.color}"></div>
            <div class="pending-content">
              <div class="pending-label" style="color:${cat.color}">${cat.emoji} ${cat.name}</div>
              <div class="pending-title">${escHtml(block.title)}</div>
              ${block.studentNote ? `<div style="font-size:0.65rem; color:var(--muted); font-style:italic; margin-top:4px; background:rgba(0,0,0,0.04); padding:6px; border-radius:6px; border-left:2px solid var(--gold);">" ${escHtml(block.studentNote)} "</div>` : ''}
            </div>
            <div class="pending-actions" style="flex-direction:column;">
              <button class="pend-btn approve" onclick="approveBlock('${block.id}','${ds}')">✓</button>
              <button class="pend-btn reject"  onclick="rejectBlock('${block.id}','${ds}')">✕</button>
            </div>
          </div>`;
      }).join('');

  ['pendingApprovalsListSidebar', 'pendingApprovalsList'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  });
}

function openEconomyPanel() {
  if (!requiresRole('COACH')) return;
  renderPendingApprovalsPanel();
  document.getElementById('economyTicketBalance').textContent = getTickets();
  openModal('economyPanel');
}
function closeEconomyPanel() { closeModal('economyPanel'); }

/* ═══════════════════════════════════════════════════════════
   12. SYSTEM UTILS
═══════════════════════════════════════════════════════════ */
function openModal(id) { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

function openGistPanel() { 
  document.getElementById('syncAccountIdDisplay').textContent = activeAccountId || 'HATA: ID YOK';
  openModal('gistPanel'); 
}

function showToast(msg) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  document.getElementById('toastContainer')?.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

function updateClock() {
  const el = document.getElementById('liveClock');
  if(el) {
    const d = new Date();
    el.textContent = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }
}

/* ═══════════════════════════════════════════════════════════
   13. INIT
═══════════════════════════════════════════════════════════ */
loadState();
bootSession();

currentDate = new Date();
renderAll();
switchView('weekly');
updateClock();
setInterval(updateClock, 1000);

if (activeAccountId) {
  setTimeout(() => { loadFromCloud(); }, 1000); 
}

/* ═══════════════════════════════════════════════════════════
   14. DARK THEME CONTROLLER
═══════════════════════════════════════════════════════════ */
function toggleTheme() {
  const isDark = document.body.classList.toggle('dark-theme');
  const btn = document.getElementById('themeToggleBtn');
  if (btn) btn.textContent = isDark ? '☀️' : '🌙';
  
  // Tercihi tarayıcı hafızasına kaydet (Cloud'dan bağımsız, cihaza özel)
  localStorage.setItem('studyCircus_theme', isDark ? 'dark' : 'light');
}

function loadTheme() {
  const savedTheme = localStorage.getItem('studyCircus_theme');
  if (savedTheme === 'dark') {
    document.body.classList.add('dark-theme');
    const btn = document.getElementById('themeToggleBtn');
    if (btn) btn.textContent = '☀️';
  }
}

loadTheme(); // <-- Bunu INIT bloğuna ekle