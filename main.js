/* ═══════════════════════════════════════════════════════════
   STATE & CONFIG
═══════════════════════════════════════════════════════════ */
const STORAGE_KEY = 'studyCircus_v3';
const SYNC_CONFIG_KEY = 'studyCircus_syncConfig';

let state = {};
let currentView = 'weekly';
let currentDate = new Date();
let gistConfig = { accountId: null };

/* ═══════════════════════════════════════════════════════════
   DEFAULT DATA
═══════════════════════════════════════════════════════════ */
function buildDefaultState() {
  const subjects = [
    { id:'s1', name:'Calculus',     color:'#1D3557', examDate:'2026-03-30', examTime:'15:30', progress:72 },
    { id:'s2', name:'Fizik',        color:'#457B9D', examDate:'2026-03-31', examTime:'',      progress:55 },
    { id:'s3', name:'Ayrık Mat.',   color:'#9B72CF', examDate:'2026-04-01', examTime:'',      progress:35 },
    { id:'s4', name:'Lineer Cebir', color:'#52B788', examDate:'2026-04-02', examTime:'',      progress:40 },
    { id:'s5', name:'Prog 2',       color:'#E07A5F', examDate:'2026-04-03', examTime:'09:00', progress:60 },
  ];
  const categories = [
    { id:'c1', name:'Study',  color:'#1D3557', emoji:'📚' },
    { id:'c2', name:'Break',  color:'#F4A261', emoji:'☕' },
    { id:'c3', name:'Review', color:'#52B788', emoji:'🔁' },
    { id:'c4', name:'Exam',   color:'#E63946', emoji:'🔴' },
    { id:'c5', name:'Final',  color:'#E07A5F', emoji:'🏁' },
  ];
  const D = (y,m,d) => `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  const rawDays = [
    { date:D(2026,3,24),context:'Okul Sonrası (Yorgun)',examToday:null,blocks:[
      {catId:'c1',subjectId:'s1',title:'Calculus: Temel İntegral',timeSlot:'akşam',startTime:'18:00',endTime:'20:00',desc:'Temel integral tekniklerini gözden geçir.'},
      {catId:'c1',subjectId:'s2',title:'Fizik: Ch 23 — E-Alan',timeSlot:'akşam',startTime:'20:30',endTime:'21:30',desc:'Elektrik alanı formülleri ve nokta yük problemleri.'},
    ]},
    { date:D(2026,3,25),context:'Tam Gün Kütüphane',examToday:null,blocks:[
      {catId:'c1',subjectId:'s1',title:'Calculus: Teknikler',timeSlot:'sabah',startTime:'10:00',endTime:'13:00',desc:'Değişken değiştirme (u-sub) ve LAPTÜ.'},
    ]},
  ];
  const days = {};
  rawDays.forEach(raw => {
    days[raw.date]={
      date:raw.date,context:raw.context||'',examToday:raw.examToday||null,
      blocks:raw.blocks.map((b,i)=>({
        id:`b_${raw.date}_${i}_${Math.random().toString(36).slice(2,6)}`,
        catId:b.catId,subjectId:b.subjectId||null,
        title:b.title,timeSlot:b.timeSlot,
        startTime:b.startTime||'',endTime:b.endTime||'',
        desc:b.desc,completed:false,links:[],
      })),
      log:null,notes:[],
    };
  });

  const panelConfig = [
    { id: 'panel-countdown', title: '⏳ Countdown', visible: true, collapsed: false },
    { id: 'panel-subjects', title: '📚 Subjects', visible: true, collapsed: false },
    { id: 'panel-categories', title: '🏷 Categories', visible: true, collapsed: false },
    { id: 'panel-analytics', title: '📊 Analytics', visible: true, collapsed: false },
    { id: 'panel-progress', title: '📈 Progress', visible: true, collapsed: false },
    { id: 'panel-notes', title: '📝 General Notes', visible: true, collapsed: false }
  ];
  return { subjects, categories, days, generalNotes:['Keep your study materials handy.'], panelConfig };
}

/* ═══════════════════════════════════════════════════════════
   PERSISTENCE — localStorage
═══════════════════════════════════════════════════════════ */
function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) { 
      state = JSON.parse(saved); 
      // Eski kullanıcılara panelleri entegre et
      if (!state.panelConfig) {
         state.panelConfig = buildDefaultState().panelConfig;
         saveState();
      }
      return; 
    }
  } catch(e) {}
  state = buildDefaultState();
  saveState();
}

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch(e) {}
}

function loadGistConfig() {
  try {
    const saved = localStorage.getItem(SYNC_CONFIG_KEY);
    if (saved) gistConfig = { ...gistConfig, ...JSON.parse(saved) };
  } catch(e) {}
}

function saveGistConfig() {
  try { localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(gistConfig)); } catch(e) {}
}

/* ═══════════════════════════════════════════════════════════
   CLOUD SYNC (CLOUDFLARE WORKER PROXY)
═══════════════════════════════════════════════════════════ */
const WORKER_URL = 'https://database.ahmetbsarpkaya.workers.dev/';

function updateSyncBadge(status) {
  const badge = document.getElementById('syncBadge');
  const label = document.getElementById('syncLabel');
  badge.className = 'sync-badge';
  
  if (status === 'syncing') { badge.classList.add('syncing'); label.textContent = 'İşleniyor…'; }
  else if (status === 'synced') { badge.classList.add('synced'); label.textContent = 'Bağlı ✓'; }
  else if (status === 'error')  { badge.classList.add('error');  label.textContent = 'Hata'; }
  else { label.textContent = gistConfig.accountId ? 'Bağlı ✓' : 'Bağlı Değil'; }
}

function generateId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = '';
  for(let i=0; i<5; i++) id += chars.charAt(Math.floor(Math.random() * chars.length));
  return id;
}

// Direk senin Worker'ından veriyi çeker
async function fetchCentralData() {
  const res = await fetch(WORKER_URL + `?t=${Date.now()}`);
  if (!res.ok) throw new Error('Buluta erişilemedi.');
  const data = await res.json();
  return data || {};
}

// Saf JSON'ı senin Worker'ına postlar
async function updateCentralData(allData) {
  const res = await fetch(WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(allData)
  });
  if (!res.ok) throw new Error('Buluta kaydedilemedi.');
}

async function saveToCloud() {
  try {
    updateSyncBadge('syncing');
    
    if (!gistConfig.accountId) {
      gistConfig.accountId = generateId();
      saveGistConfig();
    }

    const allData = await fetchCentralData();
    allData[gistConfig.accountId] = { ...state, _savedAt: Date.now() };
    
    await updateCentralData(allData);
    
    updateSyncBadge('synced');
    showToast(`⬆️ Kaydedildi! ID: ${gistConfig.accountId}`);
    setTimeout(()=>updateSyncBadge('idle'), 3000);
  } catch(e) {
    updateSyncBadge('error');
    showToast(e.message);
  }
}

async function loadFromCloud(inputId) {
  const targetId = (inputId || gistConfig.accountId || '').toUpperCase().trim();
  if (!targetId || targetId.length !== 5) {
    showToast('Geçerli bir 5 haneli ID girin.');
    return;
  }

  try {
    updateSyncBadge('syncing');
    const allData = await fetchCentralData();

    if (!allData[targetId]) {
      throw new Error('Bu ID ile veri bulunamadı.');
    }

    state = allData[targetId];
    gistConfig.accountId = targetId;
    saveState();
    saveGistConfig();

    renderAll();
    updateSyncBadge('synced');
    showToast('⬇️ Veri yüklendi.');
    setTimeout(()=>updateSyncBadge('idle'), 3000);
  } catch(e) {
    updateSyncBadge('error');
    showToast(e.message);
  }
}

function unsyncAccount() {
  if(confirm('Cihazın bulut bağlantısını kesmek istediğine emin misin? (Verilerin silinmez, sadece bu cihazdan çıkış yapılır)')) {
    gistConfig.accountId = null;
    saveGistConfig();
    openGistPanel();
    updateSyncBadge('idle');
    showToast('Bağlantı kesildi.');
  }
}

async function removeCloudData() {
  if (!gistConfig.accountId) return;
  if(confirm('DİKKAT! Tüm bulut verisi silinecek ve uygulaman sıfırlanacak. Emin misin?')) {
    try {
      updateSyncBadge('syncing');
      const allData = await fetchCentralData();
      
      delete allData[gistConfig.accountId];
      await updateCentralData(allData);

      gistConfig.accountId = null;
      state = buildDefaultState(); 
      saveState();
      saveGistConfig();
      renderAll();

      updateSyncBadge('idle');
      openGistPanel();
      showToast('Veriler tamamen silindi.');
    } catch(e) {
      updateSyncBadge('error');
      showToast('Hata: ' + e.message);
    }
  }
}

let cloudAutoSaveTimer = null;
function scheduleCloudAutoSave() {
  if (!gistConfig.accountId) return;
  clearTimeout(cloudAutoSaveTimer);
  cloudAutoSaveTimer = setTimeout(() => saveToCloud(), 5000);
}

function saveStateAndSync() {
  saveState();
  scheduleCloudAutoSave();
}

/* ═══════════════════════════════════════════════════════════
   GIST PANEL UI
═══════════════════════════════════════════════════════════ */
function openGistPanel() {
  const activeState = document.getElementById('syncActiveState');
  const inactiveState = document.getElementById('syncInactiveState');
  const idDisplay = document.getElementById('currentAccountIdDisplay');
  const inputField = document.getElementById('accountIdInput');

  if (gistConfig.accountId) {
    activeState.style.display = 'block';
    inactiveState.style.display = 'none';
    idDisplay.textContent = gistConfig.accountId;
  } else {
    activeState.style.display = 'none';
    inactiveState.style.display = 'block';
    inputField.value = '';
  }
  document.getElementById('gistPanelOverlay').classList.add('open');
}

function closeGistPanel() {
  document.getElementById('gistPanelOverlay').classList.remove('open');
}

/* ═══════════════════════════════════════════════════════════
   PANEL YÖNETİMİ VE ACCORDION
═══════════════════════════════════════════════════════════ */
function ensurePanelConfig() {
  let updated = false;
  if (!state.panelConfig || !Array.isArray(state.panelConfig)) {
    state.panelConfig = buildDefaultState().panelConfig;
    updated = true;
  } else {
    const defaults = buildDefaultState().panelConfig;
    defaults.forEach(dp => {
      if (!state.panelConfig.find(p => p.id === dp.id)) {
        state.panelConfig.push(dp);
        updated = true;
      }
    });
  }
  if (updated) saveState();
}

function renderPanelsConfig() {
  ensurePanelConfig(); 
  state.panelConfig.forEach((p, index) => {
    const el = document.getElementById(p.id);
    if(!el) return;
    
    el.style.order = index; 
    el.style.display = p.visible ? 'block' : 'none'; 
    
    if(p.collapsed) el.classList.add('collapsed');
    else el.classList.remove('collapsed');
  });
}

function togglePanel(id) {
  ensurePanelConfig(); 
  const isMobile = window.innerWidth <= 900;
  const panel = state.panelConfig.find(p => p.id === id);
  if(!panel) return;
  
  const willBeCollapsed = !panel.collapsed;
  
  if (isMobile && !willBeCollapsed) {
    state.panelConfig.forEach(p => {
      if (p.id !== id) p.collapsed = true;
    });
  }
  
  panel.collapsed = willBeCollapsed;
  saveStateAndSync();
  renderPanelsConfig();
}

function openManagePanelsModal() {
  ensurePanelConfig(); 
  renderManagePanelsList();
  openModal('managePanelsModal');
}

function renderManagePanelsList() {
  ensurePanelConfig(); 
  const list = document.getElementById('panelManagerList');
  list.innerHTML = state.panelConfig.map((p, i) => `
    <div class="panel-mgr-item ${!p.visible ? 'hidden-panel' : ''}">
      <div style="font-size:0.85rem; font-weight:600; color:var(--navy);">${p.title}</div>
      <div class="panel-actions">
        <button class="panel-action-btn" onclick="togglePanelVisibility('${p.id}')" title="Gizle/Göster">${p.visible ? '👁️' : '🙈'}</button>
        <button class="panel-action-btn" onclick="movePanel(${i}, -1)" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button class="panel-action-btn" onclick="movePanel(${i}, 1)" ${i === state.panelConfig.length - 1 ? 'disabled' : ''}>↓</button>
      </div>
    </div>
  `).join('');
}

function togglePanelVisibility(id) {
  ensurePanelConfig(); 
  const panel = state.panelConfig.find(p => p.id === id);
  if(panel) panel.visible = !panel.visible;
  saveStateAndSync();
  renderManagePanelsList();
  renderPanelsConfig();
}

function movePanel(index, dir) {
  ensurePanelConfig(); 
  if(index + dir < 0 || index + dir >= state.panelConfig.length) return;
  const temp = state.panelConfig[index];
  state.panelConfig[index] = state.panelConfig[index + dir];
  state.panelConfig[index + dir] = temp;
  saveStateAndSync();
  renderManagePanelsList();
  renderPanelsConfig();
}

/* ═══════════════════════════════════════════════════════════
   HELPERS & VIEWS
═══════════════════════════════════════════════════════════ */
const MONTHS_TR  = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
const MONTHS_SH  = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
const DAYS_TR    = ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'];
const DAYS_SH    = ['Paz','Pzt','Sal','Çar','Per','Cum','Cmt'];

function toDateStr(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function fromDateStr(s) { const [y,m,d]=s.split('-').map(Number); return new Date(y,m-1,d); }
function todayStr() { return toDateStr(new Date()); }
function isToday(ds) { return ds===todayStr(); }
function daysUntil(ds) {
  const t=new Date();t.setHours(0,0,0,0);
  return Math.round((fromDateStr(ds)-t)/86400000);
}
function getCat(id)    { return state.categories.find(c=>c.id===id)||{name:'—',color:'#ccc',emoji:''}; }
function getSubject(id){ return state.subjects.find(s=>s.id===id); }

function sortBlocksByTime(blocks) {
  if(!blocks||!blocks.length) return blocks;
  return [...blocks].sort((a,b)=>{
    const as=a.startTime||'';const bs=b.startTime||'';
    if(as!==bs) return as.localeCompare(bs);
    return (a.endTime||'').localeCompare(b.endTime||'');
  });
}
function uid(){return '_'+Math.random().toString(36).slice(2,10);}
function fmt(ds){const d=fromDateStr(ds);return`${d.getDate()} ${MONTHS_SH[d.getMonth()]}`;}

/* ═══════════════════════════════════════════════════════════
   VIEW SWITCHING
═══════════════════════════════════════════════════════════ */
function switchView(v) {
  currentView=v;
  ['daily','weekly','monthly'].forEach(x=>{
    document.getElementById('view-'+x).classList.toggle('active',x===v);
    const tab=document.getElementById('tab-'+x);if(tab)tab.classList.toggle('active',x===v);
    const mn=document.getElementById('mnav-'+x);if(mn)mn.classList.toggle('active',x===v);
  });
  document.getElementById('sidebarCol').classList.remove('mobile-open');
  renderView();
  updateAnalyticsBar();
}

function navigate(dir) {
  const d=new Date(currentDate);
  if(currentView==='daily')   d.setDate(d.getDate()+dir);
  if(currentView==='weekly')  d.setDate(d.getDate()+dir*7);
  if(currentView==='monthly') d.setMonth(d.getMonth()+dir);
  currentDate=d;renderView();updateAnalyticsBar();
}
function goToday(){currentDate=new Date();renderView();updateAnalyticsBar();}

/* ═══════════════════════════════════════════════════════════
   RENDER DISPATCH
═══════════════════════════════════════════════════════════ */
function renderView(){
  if(currentView==='daily')   renderDaily();
  if(currentView==='weekly')  renderWeekly();
  if(currentView==='monthly') renderMonthly();
  updateDateNav();
}

function renderAll(){
  renderCountdown(); renderSubjects(); renderCategories();
  renderProgress(); renderGeneralNotes(); renderView(); updateAnalyticsBar();
  renderPanelsConfig(); 
}

function updateDateNav(){
  const el=document.getElementById('dateNavTitle');
  const sub=document.getElementById('dateNavSub');
  if(currentView==='daily'){
    const ds=toDateStr(currentDate);
    el.textContent=`${DAYS_TR[currentDate.getDay()]}, ${currentDate.getDate()} ${MONTHS_TR[currentDate.getMonth()]}`;
    sub.textContent=isToday(ds)?'— Bugün':`${daysUntil(ds)>0?daysUntil(ds)+' gün sonra':'geçmiş'}`;
  }
  if(currentView==='weekly'){
    const mon=getWeekStart(currentDate);const sun=new Date(mon);sun.setDate(mon.getDate()+6);
    el.textContent=`${mon.getDate()} ${MONTHS_SH[mon.getMonth()]} – ${sun.getDate()} ${MONTHS_SH[sun.getMonth()]} ${sun.getFullYear()}`;
    sub.textContent='Haftalık Plan';
  }
  if(currentView==='monthly'){
    el.textContent=`${MONTHS_TR[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    sub.textContent='Aylık Görünüm';
  }
}

/* ═══════════════════════════════════════════════════════════
   DAILY VIEW
═══════════════════════════════════════════════════════════ */
function renderDaily(){
  const ds=toDateStr(currentDate);
  const day=state.days[ds];
  const el=document.getElementById('dailyContent');
  
  const examsToday = state.subjects.filter(s => s.examDate === ds);

  if(!day && examsToday.length === 0){
    el.innerHTML=`
      <div class="empty-state"><div class="es-icon">📭</div>
        <div>Bu gün için plan bulunamadı.</div>
        <button class="add-block-btn" style="margin:12px auto;display:inline-flex;" onclick="openAddBlockForDate('${ds}')">+ Blok Ekle</button>
      </div>
      <button class="add-day-btn" onclick="prefillAddDay('${ds}')">
        <div class="plus">＋</div><div>Bu günü planlamaya ekle</div>
      </button>`;
    return;
  }

  const today=isToday(ds);
  const safeDay = day || { context: '', examToday: null, blocks: [], log: null, notes: [] };

  let html=`
    <div class="daily-header-card fade-up">
      <div class="daily-date-big">${currentDate.getDate()}</div>
      <div class="daily-date-info">
        <div>
          <div class="daily-day-name">${DAYS_TR[currentDate.getDay()]} · ${MONTHS_TR[currentDate.getMonth()]} ${currentDate.getFullYear()}</div>
          ${today?'<div style="font-size:.72rem;color:rgba(255,255,255,.5);margin-top:2px;">Bugün</div>':''}
        </div>
        ${safeDay.context?`<div class="daily-context-badge">${safeDay.context}</div>`:''}
      </div>
    </div>`;
    
  if(safeDay.examToday) html+=`<div class="exam-alert fade-up">🔴 ${safeDay.examToday}</div>`;
  examsToday.forEach(ex => {
    html+=`<div class="exam-alert fade-up" style="background:${ex.color}; box-shadow: 0 4px 12px ${ex.color}40;">📝 ${ex.name} Sınavı ${ex.examTime ? '· ' + ex.examTime : ''}</div>`;
  });

  if(!day) {
      html+=`<div class="fade-up"><div class="empty-state" style="padding:24px 0;"><div>Sınav günü için henüz çalışma bloğu planlamadın.</div><button class="add-block-btn" style="margin:12px auto;display:inline-flex;" onclick="openAddBlockForDate('${ds}')">+ Blok Ekle</button></div></div>`;
      el.innerHTML=html;
      return;
  }

  const log=safeDay.log||{};
  html+=`
    <div class="daily-log-card fade-up">
      <div class="card-header-row"><span class="card-title">📊 Günlük Veri</span></div>
      <div class="log-grid">
        <div class="log-field"><label class="log-label">Çalışma (dk)</label>
          <input class="log-input" id="log_study" type="number" min="0" inputmode="numeric" placeholder="120" value="${log.studyMin||''}"></div>
        <div class="log-field"><label class="log-label">Mola (dk)</label>
          <input class="log-input" id="log_break" type="number" min="0" inputmode="numeric" placeholder="30" value="${log.breakMin||''}"></div>
        <div class="log-field"><label class="log-label">Tamamlanan Görev</label>
          <input class="log-input" id="log_tasks" type="number" min="0" inputmode="numeric" placeholder="5" value="${log.tasksCompleted||''}"></div>
        <div class="log-field"><label class="log-label">Çözülen Soru</label>
          <input class="log-input" id="log_questions" type="number" min="0" inputmode="numeric" placeholder="20" value="${log.questionsSolved||''}"></div>
        <div class="log-field"><label class="log-label">Enerji (1–5)</label>
          <input class="log-input" id="log_energy" type="number" min="1" max="5" inputmode="numeric" placeholder="3" value="${log.energy||''}"></div>
        <div class="log-field"><label class="log-label">Odaklanma (1–5)</label>
          <input class="log-input" id="log_focus" type="number" min="1" max="5" inputmode="numeric" placeholder="3" value="${log.focus||''}"></div>
        <div class="log-field" style="grid-column:1/-1;"><label class="log-label">Ruh Hali</label>
          <div class="mood-row">
            ${['😴 Yorgun','😐 Normal','😊 İyi','🔥 Muhteşem','😤 Stresli','😰 Kaygılı'].map(m=>
              `<button class="mood-btn${log.mood===m?' active':''}" onclick="selectMood(this,'${m}')" data-mood="${m}">${m}</button>`
            ).join('')}
          </div>
        </div>
        <div class="log-field" style="grid-column:1/-1;"><label class="log-label">Refleksiyon</label>
          <textarea class="log-textarea" id="log_note" placeholder="Bugün ne öğrendim, ne zorlandım…">${log.note||''}</textarea>
        </div>
      </div>
      <button class="save-log-btn" id="saveLogBtn" onclick="saveLog('${ds}')">Günlük Veriyi Kaydet</button>
    </div>`;

  html+=`<div class="fade-up">
    <div class="blocks-section-title">Bloklar
      <button class="add-block-btn" onclick="openAddBlockForDate('${ds}')">＋ Blok Ekle</button>
    </div>`;
  if(!safeDay.blocks||!safeDay.blocks.length){
    html+=`<div class="empty-state" style="padding:24px 0;"><div>Henüz blok yok.</div></div>`;
  } else {
    sortBlocksByTime(safeDay.blocks).forEach(b=>{html+=renderBlockItem(b,ds);});
  }
  html+=`<div style="margin-top:16px;">
    <div class="blocks-section-title">Gün Notları</div>
    <div id="dayNotesList_${ds}">`;
  (safeDay.notes||[]).forEach((n,i)=>{
    html+=`<div class="note-item">${escHtml(n)}<button class="note-del" onclick="deleteDayNote('${ds}',${i})">✕</button></div>`;
  });
  html+=`</div>
    <div class="note-add">
      <input type="text" id="dayNoteInput_${ds}" placeholder="Gün notu ekle…" onkeydown="if(event.key==='Enter')addDayNote('${ds}')">
      <button onclick="addDayNote('${ds}')">Ekle</button>
    </div></div></div>`;
  el.innerHTML=html;
}

function renderBlockItem(b,ds){
  const cat=getCat(b.catId);
  const subj=b.subjectId?getSubject(b.subjectId):null;
  const timeStr=b.startTime?`${b.startTime}${b.endTime?'–'+b.endTime:''}`:(b.timeSlot||'');
  const linksHtml=(b.links&&b.links.length)?`
    <div class="block-links">
      ${b.links.map(lnk=>`<a class="block-link-pill" href="${escHtml(lnk.url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()"><span class="link-icon">🔗</span>${escHtml(lnk.label)}</a>`).join('')}
    </div>`:'';
  return `
    <div class="block-item${b.completed?' completed':''}" onclick="openBlockDetail('${b.id}','${ds}')">
      <div class="block-stripe" style="background:${cat.color}"></div>
      <div class="block-content">
        <div class="bi-label" style="color:${cat.color}">${cat.emoji} ${cat.name}</div>
        <div class="bi-title">${escHtml(b.title)}</div>
        ${b.desc?`<div class="bi-desc">${escHtml(b.desc.slice(0,100))}${b.desc.length>100?'…':''}</div>`:''}
        <div class="bi-meta">
          ${timeStr?`<span class="bi-tag">🕐 ${timeStr}</span>`:''}
          ${subj?`<span class="bi-tag" style="background:${subj.color}22;color:${subj.color};border-color:${subj.color}44">${subj.name}</span>`:''}
          ${b.completed?'<span class="bi-tag" style="background:#52B78820;color:#52B788;border-color:#52B78840">✓ Tamamlandı</span>':''}
          ${(b.links&&b.links.length)?`<span class="bi-tag">🔗 ${b.links.length}</span>`:''}
        </div>
        ${linksHtml}
      </div>
      <div class="block-actions">
        <button class="block-act-btn check" onclick="event.stopPropagation();toggleComplete('${b.id}','${ds}')" title="${b.completed?'Geri al':'Tamamla'}">✓</button>
        <button class="block-act-btn edit"  onclick="event.stopPropagation();openEditBlock('${b.id}','${ds}')" title="Düzenle">✏</button>
        <button class="block-act-btn"       onclick="event.stopPropagation();deleteBlockConfirm('${b.id}','${ds}')" title="Sil">✕</button>
      </div>
    </div>`;
}

/* ═══════════════════════════════════════════════════════════
   WEEKLY VIEW
═══════════════════════════════════════════════════════════ */
function getWeekStart(d){
  const day=d.getDay();const diff=day===0?-6:1-day;
  const mon=new Date(d);mon.setDate(d.getDate()+diff);mon.setHours(0,0,0,0);return mon;
}

function renderWeekly(){
  const grid=document.getElementById('weekGrid');
  const mon=getWeekStart(currentDate);
  let html='';
  for(let i=0;i<7;i++){
    const d=new Date(mon);d.setDate(mon.getDate()+i);
    const ds=toDateStr(d);const day=state.days[ds];
    const today=isToday(ds);
    
    const examsToday = state.subjects.filter(s => s.examDate === ds);
    const isExamDay = (day && day.examToday) || examsToday.length > 0;
    
    const completed=day?day.blocks.filter(b=>b.completed).length:0;
    const total=day?day.blocks.length:0;
    const log=day&&day.log;
    
    html+=`<div class="wday-card${today?' today':''}${isExamDay?' exam-day':''}" onclick="goToDay('${ds}')">
      <div class="wday-head${today?' today-head':''}">
        <div><div class="wday-date">${d.getDate()}</div><div class="wday-name">${DAYS_SH[d.getDay()]} · ${MONTHS_SH[d.getMonth()]}</div></div>
        ${day&&day.context?`<div class="wday-ctx">${day.context.slice(0,20)}</div>`:''}
      </div>
      <div class="wday-body">
        ${today?'<div class="today-badge-sm">BUGÜN</div>':''}
        ${day&&day.examToday?`<div class="wday-exam-pill">🔴 ${day.examToday}</div>`:''}`;
        
    examsToday.forEach(ex => {
      html+=`<div class="wday-exam-pill" style="color:${ex.color}; background:${ex.color}15; border-color:${ex.color}30;">📝 ${ex.name}</div>`;
    });
        
    if(day&&day.blocks.length>0){
      sortBlocksByTime(day.blocks).slice(0,3).forEach(b=>{
        const cat=getCat(b.catId);
        html+=`<div class="wday-block${b.completed?' completed':''}" style="background:${cat.color}14;border-color:${cat.color}30">
          <div class="wb-label" style="color:${cat.color}">${cat.emoji} ${cat.name}</div>
          <div class="wb-title">${escHtml(b.title)}</div></div>`;
      });
      if(day.blocks.length>3) html+=`<div style="font-size:.65rem;color:var(--muted);padding:2px 0 4px">+${day.blocks.length-3} daha…</div>`;
    } else {
      html+=`<div style="font-size:.72rem;color:var(--muted);padding:8px 0">Plan yok</div>`;
    }
    html+=`<div class="wday-stats">
      ${total>0?`<div class="wday-stat">✓ ${completed}/${total}</div>`:''}
      ${log&&log.studyMin?`<div class="wday-stat">📚 ${log.studyMin}dk</div>`:''}
      ${log&&log.mood?`<div class="wday-stat">${log.mood.split(' ')[0]}</div>`:''}
    </div></div></div>`;
  }
  html+=`<button class="add-day-btn" onclick="openModal('addDayModal')"><div class="plus">＋</div><div>Gün Ekle</div></button>`;
  grid.innerHTML=html;
}
function goToDay(ds){currentDate=fromDateStr(ds);switchView('daily');}

/* ═══════════════════════════════════════════════════════════
   MONTHLY VIEW
═══════════════════════════════════════════════════════════ */
function renderMonthly(){
  const grid=document.getElementById('monthGrid');
  const y=currentDate.getFullYear(),m=currentDate.getMonth();
  const first=new Date(y,m,1),last=new Date(y,m+1,0);
  let html='';
  const LABELS=['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'];
  LABELS.forEach(l=>{html+=`<div class="month-head-cell">${l}</div>`;});
  let startPad=first.getDay()===0?6:first.getDay()-1;
  for(let i=0;i<startPad;i++) html+=`<div class="month-cell empty"></div>`;
  
  for(let day=1;day<=last.getDate();day++){
    const d=new Date(y,m,day);const ds=toDateStr(d);
    const dayData=state.days[ds];const today=isToday(ds);
    
    const examSubjs=state.subjects.filter(s=>s.examDate===ds);
    const isExamDay = examSubjs.length > 0 || (dayData && dayData.examToday);
    
    const dots=dayData?dayData.blocks.map(b=>{const cat=getCat(b.catId);return`<div class="mc-dot" style="background:${cat.color}"></div>`;}).slice(0,6).join(''):'';
    
    html+=`<div class="month-cell${today?' today':''}${isExamDay?' has-exam':''}" onclick="goToDay('${ds}')">`;
    if(today) html+=`<div class="mc-today-dot">${day}</div>`;
    else html+=`<div class="mc-date">${day}</div>`;
    if(dots) html+=`<div class="mc-dots">${dots}</div>`;
    
    if(dayData && dayData.examToday) html+=`<div class="mc-exam">🔴 Sınav</div>`;
    examSubjs.forEach(ex => {
      html+=`<div class="mc-exam" style="color:${ex.color}">📝 ${ex.name}</div>`;
    });
    
    html+=`</div>`;
  }
  grid.innerHTML=html;
}

/* ═══════════════════════════════════════════════════════════
   ANALYTICS BAR & DONUT
═══════════════════════════════════════════════════════════ */
function updateAnalyticsBar(){
  const bar=document.getElementById('analyticsBar');
  let dsList=[];
  if(currentView==='daily') dsList=[toDateStr(currentDate)];
  else if(currentView==='weekly'){
    const mon=getWeekStart(currentDate);
    for(let i=0;i<7;i++){const d=new Date(mon);d.setDate(mon.getDate()+i);dsList.push(toDateStr(d));}
  } else {
    const y=currentDate.getFullYear(),m=currentDate.getMonth();
    const last=new Date(y,m+1,0).getDate();
    for(let d=1;d<=last;d++) dsList.push(toDateStr(new Date(y,m,d)));
  }
  const days=dsList.map(ds=>state.days[ds]).filter(Boolean);
  let totalStudy=0,totalBreak=0,totalTasks=0,totalQ=0,blockCount=0,compCount=0;
  const catTime={};
  days.forEach(day=>{
    const log=day.log||{};
    totalStudy+=+(log.studyMin||0);totalBreak+=+(log.breakMin||0);
    totalTasks+=+(log.tasksCompleted||0);totalQ+=+(log.questionsSolved||0);
    day.blocks.forEach(b=>{
      blockCount++;if(b.completed)compCount++;
      const min=timeToMin(b.startTime,b.endTime);
      if(!catTime[b.catId])catTime[b.catId]=0;catTime[b.catId]+=min;
    });
  });
  const fmtH=m=>m>=60?`${(m/60).toFixed(1)}s`:`${m}dk`;
  const stats=[
    {label:'Çalışma',value:totalStudy>0?fmtH(totalStudy):'—'},
    {label:'Mola',value:totalBreak>0?fmtH(totalBreak):'—'},
    {label:'Görev',value:totalTasks>0?`${totalTasks}`:'—'},
    {label:'Soru',value:totalQ>0?`${totalQ}`:'—'},
    {label:'Blok',value:blockCount>0?`${compCount}/${blockCount}`:'—',cls:compCount===blockCount&&blockCount>0?'green':''},
  ];
  const topCat=Object.entries(catTime).sort((a,b)=>b[1]-a[1])[0];
  if(topCat){const cat=getCat(topCat[0]);stats.push({label:'Dominant',value:`${cat.emoji} ${cat.name}`});}
  bar.innerHTML=stats.map(s=>`<div class="astat"><div class="astat-label">${s.label}</div><div class="astat-value${s.cls?' '+s.cls:''}">${s.value}</div></div>`).join('');
  renderDonut(catTime);
}

function timeToMin(start,end){
  if(!start||!end)return 0;
  const[sh,sm]=(start||'0:0').split(':').map(Number);
  const[eh,em]=(end||'0:0').split(':').map(Number);
  const diff=(eh*60+em)-(sh*60+sm);return diff>0?diff:0;
}

function renderDonut(catTime){
  const canvas=document.getElementById('donutChart');
  const legend=document.getElementById('pieLegend');
  const ctx=canvas.getContext('2d');
  const W=140,cx=W/2,cy=W/2,r=52,ri=32;
  ctx.clearRect(0,0,W,W);
  const entries=Object.entries(catTime).filter(([,v])=>v>0);
  const total=entries.reduce((a,[,v])=>a+v,0);
  if(!total){
    ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fillStyle='#f0eff7';ctx.fill();
    ctx.beginPath();ctx.arc(cx,cy,ri,0,Math.PI*2);ctx.fillStyle='white';ctx.fill();
    legend.innerHTML='<div style="font-size:.72rem;color:var(--muted);text-align:center;">Henüz veri yok</div>';return;
  }
  let angle=-Math.PI/2;
  entries.forEach(([catId,val])=>{
    const cat=getCat(catId);const slice=(val/total)*Math.PI*2;
    ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,r,angle,angle+slice);ctx.closePath();
    ctx.fillStyle=cat.color;ctx.fill();angle+=slice;
  });
  ctx.beginPath();ctx.arc(cx,cy,ri,0,Math.PI*2);ctx.fillStyle='white';ctx.fill();
  legend.innerHTML=entries.map(([catId,val])=>{
    const cat=getCat(catId);const pct=Math.round(val/total*100);
    return`<div class="pie-leg-item"><div class="pie-leg-dot" style="background:${cat.color}"></div>
      <span class="pie-leg-name">${cat.emoji} ${cat.name}</span>
      <span class="pie-leg-val">${pct}%</span></div>`;
  }).join('');
}

/* ═══════════════════════════════════════════════════════════
   SIDEBAR RENDERS
═══════════════════════════════════════════════════════════ */
function renderCountdown(){
  const grid=document.getElementById('countdownGrid');
  grid.innerHTML=state.subjects.map(s=>{
    if(!s.examDate)return'';
    const d=daysUntil(s.examDate);
    const cls=d<0?'done':d<=1?'urgent':d<=3?'soon':'';
    return`<div class="cd-item ${cls}">
      <div class="cd-name">${s.name}</div>
      <div class="cd-days ${cls}">${d<0?'✓':d===0?'🔴':d}<span class="cd-unit">${d<0?'bitti':d===0?'bugün':'gün'}</span></div>
      <div class="cd-date">${fmt(s.examDate)}${s.examTime?' · '+s.examTime:''}</div>
    </div>`;
  }).join('');
}

function renderSubjects(){
  const list=document.getElementById('subjectList');
  if(!state.subjects.length){list.innerHTML='<div class="empty-state" style="padding:10px 0">Ders yok</div>';return;}
  list.innerHTML=state.subjects.map(s=>`
    <div class="subject-row" onclick="openEditSubject('${s.id}')">
      <div class="subj-dot" style="background:${s.color}"></div>
      <div class="subj-name">${escHtml(s.name)}</div>
      <div class="subj-exam">${s.examDate?fmt(s.examDate):'—'}</div>
      <span class="subj-edit-icon">✏</span>
    </div>`).join('');
}

function renderCategories(){
  const list=document.getElementById('categoryList');
  list.innerHTML=state.categories.map(c=>`
    <div class="cat-tag" style="color:${c.color};border-color:${c.color}60;background:${c.color}14">
      <span>${c.emoji} ${c.name}</span>
      <button onclick="deleteCategory('${c.id}')" title="Sil" style="font-size:.8rem;opacity:.6;background:none;border:none;cursor:pointer;padding:0;margin-left:2px;color:inherit;line-height:1;touch-action:manipulation;">✕</button>
    </div>`).join('');
}

function renderProgress(){
  const sec=document.getElementById('progressSection');
  sec.innerHTML=state.subjects.map(s=>`
    <div class="prog-item">
      <div class="prog-row"><span class="prog-name">${s.name}</span><span class="prog-pct">${s.progress||0}%</span></div>
      <div class="prog-bar"><div class="prog-fill" style="width:${s.progress||0}%;background:${s.color}"></div></div>
    </div>`).join('');
}

function renderGeneralNotes(){
  const list=document.getElementById('generalNotesList');
  if(!state.generalNotes||!state.generalNotes.length){list.innerHTML='';return;}
  list.innerHTML=state.generalNotes.map((n,i)=>`
    <div class="note-item">${escHtml(n)}
      <button class="note-del" onclick="deleteGeneralNote(${i})">✕</button>
    </div>`).join('');
}

/* ═══════════════════════════════════════════════════════════
   NOTES
═══════════════════════════════════════════════════════════ */
function addGeneralNote(){
  const inp=document.getElementById('generalNoteInput');const val=inp.value.trim();
  if(!val)return;
  if(!state.generalNotes)state.generalNotes=[];
  state.generalNotes.push(val);inp.value='';
  saveStateAndSync();renderGeneralNotes();
}
function deleteGeneralNote(i){state.generalNotes.splice(i,1);saveStateAndSync();renderGeneralNotes();}
function focusNoteInput(){document.getElementById('generalNoteInput').focus();}

function addDayNote(ds){
  const inp=document.getElementById(`dayNoteInput_${ds}`);if(!inp)return;
  const val=inp.value.trim();if(!val||!state.days[ds])return;
  if(!state.days[ds].notes)state.days[ds].notes=[];
  state.days[ds].notes.push(val);inp.value='';
  saveStateAndSync();renderView();
}
function deleteDayNote(ds,i){state.days[ds].notes.splice(i,1);saveStateAndSync();renderView();}

/* ═══════════════════════════════════════════════════════════
   LOG
═══════════════════════════════════════════════════════════ */
let selectedMood='';
function selectMood(btn,mood){
  document.querySelectorAll('.mood-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');selectedMood=mood;
}
function saveLog(ds){
  if(!state.days[ds])return;
  state.days[ds].log={
    studyMin:+document.getElementById('log_study').value||0,
    breakMin:+document.getElementById('log_break').value||0,
    tasksCompleted:+document.getElementById('log_tasks').value||0,
    questionsSolved:+document.getElementById('log_questions').value||0,
    energy:+document.getElementById('log_energy').value||0,
    focus:+document.getElementById('log_focus').value||0,
    mood:selectedMood||document.querySelector('.mood-btn.active')?.dataset.mood||'',
    note:document.getElementById('log_note').value||'',
  };
  saveStateAndSync();
  const btn=document.getElementById('saveLogBtn');
  btn.textContent='Kaydedildi ✓';btn.classList.add('saved');
  setTimeout(()=>{btn.textContent='Günlük Veriyi Kaydet';btn.classList.remove('saved');},1800);
  updateAnalyticsBar();showToast('Günlük veri kaydedildi ✓');
}

/* ═══════════════════════════════════════════════════════════
   BLOCK CRUD
═══════════════════════════════════════════════════════════ */
function openAddBlockForDate(ds){
  document.getElementById('blockDateTarget').value=ds;
  document.getElementById('blockEditId').value='';
  document.getElementById('blockTitle').value='';
  document.getElementById('blockDesc').value='';
  document.getElementById('blockStartTime').value='';
  document.getElementById('blockEndTime').value='';
  document.getElementById('addBlockModalTitle').textContent='Blok Ekle';
  document.getElementById('blockDeleteBtn').classList.add('hidden');
  document.getElementById('blockLinksContainer').innerHTML='';
  fillBlockCategorySelect();fillBlockSubjectSelect(null);
  openModal('addBlockModal');
}

function openEditBlock(blockId,ds){
  const day=state.days[ds];if(!day)return;
  const b=day.blocks.find(b=>b.id===blockId);if(!b)return;
  
  document.getElementById('blockDateTarget').value=ds;
  document.getElementById('blockOriginalDate').value=ds; 
  document.getElementById('blockEditId').value=blockId;
  document.getElementById('blockTitle').value=b.title;
  document.getElementById('blockDesc').value=b.desc||'';
  document.getElementById('blockStartTime').value=b.startTime||'';
  document.getElementById('blockEndTime').value=b.endTime||'';
  document.getElementById('addBlockModalTitle').textContent='Bloğu Düzenle';
  
  document.getElementById('blockDeleteBtn').classList.remove('hidden');
  document.getElementById('blockCopyBtn').classList.remove('hidden'); 
  
  fillBlockCategorySelect(b.catId);fillBlockSubjectSelect(b.subjectId);
  document.getElementById('blockTimeSlot').value=b.timeSlot||'sabah';
  const container=document.getElementById('blockLinksContainer');container.innerHTML='';
  (b.links||[]).forEach(lnk=>addLinkRow(lnk.label,lnk.url));
  openModal('addBlockModal');
}

function fillBlockCategorySelect(selectedId){
  const sel=document.getElementById('blockCategory');
  sel.innerHTML=state.categories.map(c=>`<option value="${c.id}"${c.id===selectedId?' selected':''}>${c.emoji} ${c.name}</option>`).join('');
}
function fillBlockSubjectSelect(selectedId){
  const sel=document.getElementById('blockSubject');
  sel.innerHTML='<option value="">— Ders seçiniz —</option>'+
    state.subjects.map(s=>`<option value="${s.id}"${s.id===selectedId?' selected':''}>${s.name}</option>`).join('');
}

function saveBlock(isCopy = false) {
  const newDs = document.getElementById('blockDateTarget').value;
  const oldDs = document.getElementById('blockOriginalDate').value;
  const editId = document.getElementById('blockEditId').value;
  const title = document.getElementById('blockTitle').value.trim();
  
  if(!title || !newDs) { showToast('Başlık ve Tarih gerekli'); return; }
  
  if(!state.days[newDs]) state.days[newDs]={date:newDs,context:'',examToday:null,blocks:[],log:null,notes:[]};
  const targetDay = state.days[newDs];
  
  const links=[];
  document.querySelectorAll('#blockLinksContainer .link-row').forEach(row=>{
    const label=row.querySelector('.link-label').value.trim();
    const url=row.querySelector('.link-url').value.trim();
    if(url) links.push({label:label||url,url});
  });
  
  const blockData = {
    catId:document.getElementById('blockCategory').value,
    subjectId:document.getElementById('blockSubject').value||null,
    title, timeSlot:document.getElementById('blockTimeSlot').value,
    startTime:document.getElementById('blockStartTime').value,
    endTime:document.getElementById('blockEndTime').value,
    desc:document.getElementById('blockDesc').value.trim(),links,
  };
  
  if(editId && !isCopy){
    if (newDs !== oldDs) {
      const oldBlock = state.days[oldDs].blocks.find(b => b.id === editId);
      state.days[oldDs].blocks = state.days[oldDs].blocks.filter(b => b.id !== editId);
      targetDay.blocks.push({ ...oldBlock, ...blockData });
    } else {
      const idx = targetDay.blocks.findIndex(b=>b.id===editId);
      if(idx>=0) targetDay.blocks[idx] = { ...targetDay.blocks[idx], ...blockData };
    }
  } else {
    targetDay.blocks.push({id:uid(), completed:false, ...blockData});
  }
  
  saveStateAndSync(); closeModal('addBlockModal'); renderView(); updateAnalyticsBar();
  
  if (isCopy) showToast('Blok kopyalandı');
  else if (editId && newDs !== oldDs) showToast('Blok taşındı');
  else if (editId) showToast('Blok güncellendi');
  else showToast('Blok eklendi');
}

function deleteBlock(){
  const ds=document.getElementById('blockDateTarget').value;
  const editId=document.getElementById('blockEditId').value;
  if(!editId||!state.days[ds])return;
  state.days[ds].blocks=state.days[ds].blocks.filter(b=>b.id!==editId);
  saveStateAndSync();closeModal('addBlockModal');renderView();updateAnalyticsBar();showToast('Blok silindi');
}

function deleteBlockConfirm(blockId,ds){
  if(!confirm('Bu bloğu silmek istiyor musun?'))return;
  state.days[ds].blocks=state.days[ds].blocks.filter(b=>b.id!==blockId);
  saveStateAndSync();renderView();updateAnalyticsBar();
}

function toggleComplete(blockId,ds){
  const block=state.days[ds]?.blocks.find(b=>b.id===blockId);
  if(block){block.completed=!block.completed;saveStateAndSync();renderView();updateAnalyticsBar();}
}

function openBlockDetail(blockId,ds){
  const day=state.days[ds];if(!day)return;
  const b=day.blocks.find(b=>b.id===blockId);if(!b)return;
  const cat=getCat(b.catId);const subj=b.subjectId?getSubject(b.subjectId):null;
  const linksHtml=(b.links&&b.links.length)?`
    <div class="detail-links">
      ${b.links.map(lnk=>`<a class="detail-link-pill" href="${escHtml(lnk.url)}" target="_blank" rel="noopener">🔗 ${escHtml(lnk.label)}</a>`).join('')}
    </div>`:'';
  document.getElementById('detailTitle').textContent=b.title;
  document.getElementById('detailBody').innerHTML=`
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">
      <span style="padding:4px 12px;border-radius:20px;font-size:.72rem;font-weight:700;background:${cat.color}20;color:${cat.color};border:1.5px solid ${cat.color}44">${cat.emoji} ${cat.name}</span>
      ${subj?`<span style="padding:4px 12px;border-radius:20px;font-size:.72rem;font-weight:700;background:${subj.color}20;color:${subj.color};border:1.5px solid ${subj.color}44">${subj.name}</span>`:''}
      ${b.startTime?`<span style="padding:4px 12px;border-radius:20px;font-size:.72rem;background:#f0f0f0;color:#666">🕐 ${b.startTime}${b.endTime?'–'+b.endTime:''}</span>`:''}
    </div>
    ${b.desc?`<p style="font-size:.86rem;line-height:1.7;color:#444;margin-bottom:16px">${escHtml(b.desc)}</p>`:''}
    ${linksHtml}
    <div style="display:flex;gap:8px;justify-content:flex-end;padding-top:12px;border-top:1px solid var(--border)">
      <button class="btn-danger" onclick="closeModal('blockDetailModal');deleteBlockConfirm('${b.id}','${ds}')">Sil</button>
      <button class="btn-primary" style="width:auto;padding:10px 20px" onclick="closeModal('blockDetailModal');openEditBlock('${b.id}','${ds}')">Düzenle</button>
    </div>`;
  openModal('blockDetailModal');
}

/* ═══════════════════════════════════════════════════════════
   DAY CRUD
═══════════════════════════════════════════════════════════ */
function prefillAddDay(ds){
  document.getElementById('newDayDate').value=ds;openModal('addDayModal');
}
function saveDay(){
  const ds=document.getElementById('newDayDate').value;
  const ctx=document.getElementById('newDayContext').value.trim();
  const exam=document.getElementById('newDayExam').value.trim();
  if(!ds){showToast('Tarih seçiniz');return;}
  if(!state.days[ds]) state.days[ds]={date:ds,context:ctx,examToday:exam||null,blocks:[],log:null,notes:[]};
  else{if(ctx)state.days[ds].context=ctx;if(exam)state.days[ds].examToday=exam;}
  saveStateAndSync();closeModal('addDayModal');
  currentDate=fromDateStr(ds);switchView('daily');showToast('Gün eklendi');
}

/* ═══════════════════════════════════════════════════════════
   SUBJECT CRUD
═══════════════════════════════════════════════════════════ */
const PRESET_COLORS=['#1D3557','#E63946','#457B9D','#52B788','#E07A5F','#9B72CF','#F4A261','#2196F3','#FF6B6B','#4ECDC4','#45B7D1','#96CEB4'];

function buildColorPicker(containerId,selected){
  const wrap=document.getElementById(containerId);
  wrap.innerHTML=PRESET_COLORS.map(c=>
    `<div class="color-swatch${selected===c?' selected':''}" style="background:${c}" onclick="pickColor('${containerId}','${c}',this)"></div>`
  ).join('');
  wrap._selected=selected||PRESET_COLORS[0];
}
function pickColor(containerId,color,el){
  document.querySelectorAll(`#${containerId} .color-swatch`).forEach(s=>s.classList.remove('selected'));
  el.classList.add('selected');document.getElementById(containerId)._selected=color;
}
function getPickedColor(containerId){return document.getElementById(containerId)._selected||PRESET_COLORS[0];}

function openEditSubject(id){
  const s=state.subjects.find(s=>s.id===id);if(!s)return;
  document.getElementById('subjectModalTitle').textContent='Dersi Düzenle';
  document.getElementById('editSubjectId').value=id;
  document.getElementById('subjectName').value=s.name;
  document.getElementById('subjectExamDate').value=s.examDate||'';
  document.getElementById('subjectExamTime').value=s.examTime||'';
  document.getElementById('subjectProgress').value=s.progress||0;
  document.getElementById('subjectDeleteBtn').classList.remove('hidden');
  buildColorPicker('subjectColorPicker',s.color);
  openModal('addSubjectModal');
}

function saveSubject(){
  const editId=document.getElementById('editSubjectId').value;
  const name=document.getElementById('subjectName').value.trim();
  if(!name){showToast('İsim gerekli');return;}
  const data={name,examDate:document.getElementById('subjectExamDate').value,
    examTime:document.getElementById('subjectExamTime').value,
    progress:+document.getElementById('subjectProgress').value||0,
    color:getPickedColor('subjectColorPicker')};
  if(editId){const idx=state.subjects.findIndex(s=>s.id===editId);if(idx>=0)state.subjects[idx]={...state.subjects[idx],...data};}
  else state.subjects.push({id:uid(),...data});
  saveStateAndSync();closeModal('addSubjectModal');
  renderSubjects();renderCountdown();renderProgress();showToast(editId?'Ders güncellendi':'Ders eklendi');
}

function deleteSubject(){
  const id=document.getElementById('editSubjectId').value;
  if(!id||!confirm('Bu dersi silmek istiyor musun?'))return;
  state.subjects=state.subjects.filter(s=>s.id!==id);
  saveStateAndSync();closeModal('addSubjectModal');
  renderSubjects();renderCountdown();renderProgress();showToast('Ders silindi');
}

/* ═══════════════════════════════════════════════════════════
   CATEGORY CRUD
═══════════════════════════════════════════════════════════ */
function saveCategory(){
  const name=document.getElementById('catName').value.trim();
  const emoji=document.getElementById('catEmoji').value.trim()||'📌';
  if(!name){showToast('İsim gerekli');return;}
  state.categories.push({id:uid(),name,color:getPickedColor('catColorPicker'),emoji});
  saveStateAndSync();closeModal('addCategoryModal');renderCategories();showToast('Kategori eklendi');
  document.getElementById('catName').value='';document.getElementById('catEmoji').value='';
}
function deleteCategory(id){
  const cat=state.categories.find(c=>c.id===id);if(!cat)return;
  let isUsed=false;
  for(const day of Object.values(state.days)){
    if(day.blocks&&day.blocks.some(b=>b.catId===id)){isUsed=true;break;}
  }
  if(isUsed){showToast('Bu kategoride blok var, silemezsiniz');return;}
  if(confirm(`"${cat.name}" silinsin mi?`)){
    state.categories=state.categories.filter(c=>c.id!==id);
    saveStateAndSync();renderCategories();showToast('Kategori silindi');
  }
}

/* ═══════════════════════════════════════════════════════════
   MODAL SYSTEM
═══════════════════════════════════════════════════════════ */
function openModal(id){
  if(id==='addSubjectModal'){
    document.getElementById('subjectModalTitle').textContent='Ders Ekle';
    document.getElementById('editSubjectId').value='';
    document.getElementById('subjectName').value='';
    document.getElementById('subjectExamDate').value='';
    document.getElementById('subjectExamTime').value='';
    document.getElementById('subjectProgress').value='';
    document.getElementById('subjectDeleteBtn').classList.add('hidden');
    buildColorPicker('subjectColorPicker',PRESET_COLORS[0]);
  }
  if(id==='addCategoryModal'){
    document.getElementById('catName').value='';
    document.getElementById('catEmoji').value='';
    buildColorPicker('catColorPicker',PRESET_COLORS[3]);
  }
  document.getElementById(id).classList.add('open');
  document.body.style.overflow='hidden';
}
function closeModal(id){
  document.getElementById(id).classList.remove('open');
  document.body.style.overflow='';
}

document.addEventListener('DOMContentLoaded',()=>{
  document.querySelectorAll('.overlay').forEach(ov=>{
    ov.addEventListener('click',e=>{if(e.target===ov){ov.classList.remove('open');document.body.style.overflow='';}});
  });
});

/* ═══════════════════════════════════════════════════════════
   SIDEBAR TOGGLE
═══════════════════════════════════════════════════════════ */
function toggleSidebar(){
  const sb=document.getElementById('sidebarCol');
  sb.classList.toggle('mobile-open');
  if(sb.classList.contains('mobile-open')) document.body.style.overflow='hidden';
  else document.body.style.overflow='';
}

/* ═══════════════════════════════════════════════════════════
   TOAST
═══════════════════════════════════════════════════════════ */
let toastTimer;
function showToast(msg){
  const t=document.getElementById('toast');
  t.textContent=msg;t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>t.classList.remove('show'),2400);
}

/* ═══════════════════════════════════════════════════════════
   CLOCK
═══════════════════════════════════════════════════════════ */
function updateClock(){
  const now=new Date();const pad=n=>String(n).padStart(2,'0');
  const el=document.getElementById('liveClock');
  el.textContent=`${DAYS_SH[now.getDay()]} ${now.getDate()} ${MONTHS_SH[now.getMonth()]} · ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

/* ═══════════════════════════════════════════════════════════
   HTML ESCAPE
═══════════════════════════════════════════════════════════ */
function escHtml(s){
  if(!s)return'';
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ═══════════════════════════════════════════════════════════
   LINK ROWS
═══════════════════════════════════════════════════════════ */
function addLinkRow(label='',url=''){
  const container=document.getElementById('blockLinksContainer');
  const row=document.createElement('div');row.className='link-row';
  row.innerHTML=`
    <input class="link-label" type="text" placeholder="İsim" value="${escHtml(label)}" style="flex:1;">
    <input class="link-url url-input" type="url" placeholder="https://…" value="${escHtml(url)}" style="flex:2;">
    <button class="link-row-del" onclick="this.parentElement.remove()" title="Sil">✕</button>`;
  container.appendChild(row);
  row.querySelector('.link-url').focus();
}

/* ═══════════════════════════════════════════════════════════
   PWA INSTALL PROMPT
═══════════════════════════════════════════════════════════ */
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
  if (!window.matchMedia('(display-mode: standalone)').matches) {
    setTimeout(() => showToast('📱 Uygulamayı ana ekrana ekleyebilirsin!'), 3000);
  }
});
window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  showToast('✅ Uygulama yüklendi!');
});

/* ═══════════════════════════════════════════════════════════
   SERVICE WORKER
═══════════════════════════════════════════════════════════ */
if('serviceWorker' in navigator){
  window.addEventListener('load',()=>{
    navigator.serviceWorker.register('./service-worker.js',{scope:'./'})
      .catch(e=>console.log('[PWA] SW registration failed:',e));
  });
}

/* ═══════════════════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════════════════ */
loadState();
loadGistConfig();

if (gistConfig.accountId) updateSyncBadge('idle');

currentDate=new Date();
renderAll();
switchView('weekly');
updateClock();
setInterval(updateClock,1000);
setInterval(renderCountdown,60000);

if (gistConfig.accountId) {
  setTimeout(() => loadFromCloud(gistConfig.accountId), 1500);
}