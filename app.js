/* GEMEL INVEST CRM — CLEAN CORE (Supabase + Admin Settings/Users)
   P260318-1238
   - Keeps: Login, user pill, Admin: System Settings + Users
   - Data layer migrated from Google Sheets to Supabase
*/
(() => {
  "use strict";

  const BUILD = "20260331-mirrors-premium-stage1-v18";
  const ADMIN_CONTACT_EMAIL = "oriasomech@gmail.com";
  const AUTO_LOGOUT_IDLE_MS = 40 * 60 * 1000;
  const ARCHIVE_CUSTOMER_PIN = "1990";
  const SUPABASE_URL = "https://vhvlkerectggovfihjgm.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_JixJJelGPWcP0BPKGq96Lw_nIiMyIBb";
  const SUPABASE_TABLES = {
    meta: "app_meta",
    agents: "agents",
    customers: "customers",
    proposals: "proposals"
  };

  const SUPABASE_CHAT = {
    enabled: true,
    retentionMode: "midnight",
    cleanupIntervalMs: 60000,
    typingWindowMs: 2200,
    messagesTable: "gi_chat_messages",
    cleanupRpc: "gi_chat_cleanup",
    presenceTopic: "invest-chat-presence-room"
  };

  const CHAT_FAB_STORAGE_KEY = "GI_CHAT_FAB_POS_V1";
  const CHAT_FAB_DRAG_THRESHOLD = 6;

  // ---------- Helpers ----------
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const on = (el, evt, fn, opts) => el && el.addEventListener && el.addEventListener(evt, fn, opts);
  const safeTrim = (v) => String(v ?? "").trim();
  const normalizeTotpCode = (v) => safeTrim(v).replace(/[^0-9]/g, "").slice(0, 6);
  const nowISO = () => new Date().toISOString();
  const nextMidnightISO = () => {
    const d = new Date();
    d.setHours(24, 0, 0, 0);
    return d.toISOString();
  };

  function normalizeHarWorkbookCell(value){
    return safeTrim(value)
      .replace(/[\u00A0\u2007\u202F]/g, ' ')
      .replace(/[\u200E\u200F]/g, '')
      .replace(/[״“”]/g, '"')
      .replace(/[׳‘’]/g, "'")
      .replace(/["'׳״`´]/g, '')
      .replace(/[()\[\]{}]/g, ' ')
      .replace(/[‐‑‒–—−]/g, '-')
      .replace(/\s+/g, ' ')
      .replace(/[:;,]+$/g, '')
      .trim();
  }

  function findHarWorkbookHeaderRow(rows, headerMatchers, options = {}){
    if(!Array.isArray(rows) || !rows.length) return { index:-1, score:0, requiredHits:0 };
    const normalize = typeof options.normalize === "function" ? options.normalize : ((value) => normalizeHarWorkbookCell(value));
    const requiredKeys = Array.isArray(options.requiredKeys) && options.requiredKeys.length ? options.requiredKeys : ["idNumber", "main", "company", "policyNumber"];
    let best = { index:-1, score:0, requiredHits:0, populated:0 };
    rows.forEach((row, idx) => {
      if(!Array.isArray(row) || !row.length) return;
      const normalizedRow = row.map((value) => normalize(value)).filter(Boolean);
      if(!normalizedRow.length) return;
      const hitsByKey = Object.fromEntries(Object.entries(headerMatchers || {}).map(([key, patterns]) => [key, normalizedRow.some((cell) => patterns.some((pattern) => pattern.test(cell)))]));
      const score = Object.values(hitsByKey).reduce((sum, hit) => sum + (hit ? 1 : 0), 0);
      const requiredHits = requiredKeys.reduce((sum, key) => sum + (hitsByKey[key] ? 1 : 0), 0);
      const populated = normalizedRow.length;
      if(requiredHits > best.requiredHits || (requiredHits === best.requiredHits && score > best.score) || (requiredHits === best.requiredHits && score === best.score && populated > best.populated)) {
        best = { index:idx, score, requiredHits, populated };
      }
    });
    return { index: best.index, score: best.score, requiredHits: best.requiredHits };
  }

  const OPS_RESULT_OPTIONS = {
    pendingSignatures: "בוצע שיקוף · ממתין לחתימות",
    notInterested: "נעצרה שיחת שיקוף · לא מעוניין",
    waitingAgentInfo: "ממתין להשלמת מידע מהנציג"
  };

  function ensureOpsProcess(rec){
    if(!rec || typeof rec !== "object") return {};
    const payload = rec.payload && typeof rec.payload === "object" ? rec.payload : (rec.payload = {});
    const store = payload.opsProcess && typeof payload.opsProcess === "object" ? payload.opsProcess : (payload.opsProcess = {});
    return store;
  }

  function setOpsTouch(rec, patch = {}){
    if(!rec) return {};
    const store = ensureOpsProcess(rec);
    Object.assign(store, patch || {});
    const stamp = safeTrim((patch || {}).updatedAt) || nowISO();
    store.updatedAt = stamp;
    if(!store.updatedBy) store.updatedBy = safeTrim(Auth?.current?.name);
    rec.updatedAt = stamp;
    if(State?.data?.meta) State.data.meta.updatedAt = stamp;
    return store;
  }

  function getOpsResultLabel(key){
    const k = safeTrim(key);
    return OPS_RESULT_OPTIONS[k] || "";
  }

  function getOpsStatePresentation(rec){
    const ops = ensureOpsProcess(rec);
    const payload = rec?.payload && typeof rec.payload === "object" ? rec.payload : {};
    const mirrorFlow = payload?.mirrorFlow && typeof payload.mirrorFlow === 'object' ? payload.mirrorFlow : {};
    const call = (mirrorFlow.callSession && typeof mirrorFlow.callSession === 'object')
      ? mirrorFlow.callSession
      : ((mirrorFlow.call && typeof mirrorFlow.call === 'object') ? mirrorFlow.call : {});
    const finalLabel = getOpsResultLabel(ops.resultStatus);
    let liveKey = safeTrim(ops.liveState);
    let liveLabel = "ממתין לשיקוף";
    let tone = "info";

    if(call?.active){
      liveKey = "in_call";
      liveLabel = "הלקוח בשיחת שיקוף כעת";
      tone = "warn";
    } else if(finalLabel){
      liveLabel = "הלקוח סיים שיחת שיקוף";
      tone = ops.resultStatus === 'notInterested' ? 'danger' : 'success';
    } else if(liveKey === "call_finished"){
      liveLabel = "הלקוח סיים שיחת שיקוף";
      tone = "success";
    } else if(liveKey === "handling"){
      liveLabel = "הלקוח בטיפול מחלקת תפעול";
      tone = "info";
    }

    let timerText = "00:00";
    let timerMeta = "הטיימר יתחיל ברגע שתופעל שיחת שיקוף";
    let timerLive = false;
    if(call?.active && call?.startedAt){
      const sec = Math.max(0, Math.floor((Date.now() - new Date(call.startedAt).getTime()) / 1000));
      timerText = MirrorsUI?.formatDuration?.(sec) || "00:00";
      timerMeta = `בשיחה החל מ־${MirrorsUI?.formatClock?.(call.startedAt) || '—'}`;
      timerLive = true;
    } else if(call?.durationText){
      timerText = safeTrim(call.durationText) || "00:00";
      timerMeta = `שיחה אחרונה · התחלה ${safeTrim(call.startTime) || '—'} · סיום ${safeTrim(call.endTime) || '—'}`;
    } else if(safeTrim(call?.startedAt)){
      timerMeta = `שיחה אחרונה בתאריך ${MirrorsUI?.formatFullDate?.(call.startedAt) || '—'}`;
    }

    return {
      store: ops,
      liveKey: liveKey || 'waiting',
      liveLabel,
      finalLabel,
      tone,
      resultKey: safeTrim(ops.resultStatus),
      timerText,
      timerMeta,
      timerLive,
      waitingInfo: liveKey && liveKey !== 'waiting' ? 'יש טיפול פעיל/קודם בתהליך זה' : 'טרם התחיל טיפול תפעולי בלקוח זה',
      ownerText: safeTrim(ops.ownerName || call?.startedBy || ops.updatedBy || ''),
      updatedText: safeTrim(ops.updatedAt || rec?.updatedAt || '')
    };
  }


  function releaseGlobalUiLocks(){
    try { document.body.style.overflow = ""; } catch(_e) {}
    try { document.body.style.pointerEvents = ""; } catch(_e) {}
    try { document.documentElement.style.overflow = ""; } catch(_e) {}
    try { document.documentElement.style.pointerEvents = ""; } catch(_e) {}
    try { document.body.removeAttribute("inert"); } catch(_e) {}
    try { document.documentElement.removeAttribute("inert"); } catch(_e) {}
    try { document.body.classList.remove("is-loading", "is-busy", "modal-open", "lcBusy", "appBusy", "lcLeadShellOpen"); } catch(_e) {}
    try { document.activeElement?.blur?.(); } catch(_e) {}
    $$('[aria-busy="true"]').forEach((el) => el.setAttribute("aria-busy", "false"));
  }

  function forceCloseUiLayers(options = {}){
    const keepIds = new Set(Array.isArray(options.keepIds) ? options.keepIds.filter(Boolean) : []);

    const closeById = (id, cfg = {}) => {
      if(!id || keepIds.has(id)) return;
      const el = document.getElementById(id);
      if(!el) return;
      try { el.classList.remove("is-open", "is-active", "is-visible"); } catch(_e) {}
      if(cfg.hidden) {
        try { el.hidden = true; } catch(_e) {}
      }
      if(cfg.ariaHidden !== false) {
        try { el.setAttribute("aria-hidden", "true"); } catch(_e) {}
      }
      if(cfg.hideStyle) {
        try { el.style.display = "none"; } catch(_e) {}
      }
    };

    try { ForgotPasswordUI?.close?.(); } catch(_e) {}
    try { UsersUI?.closeModal?.(); } catch(_e) {}
    try { ArchiveCustomerUI?.close?.(); } catch(_e) {}
    try { CustomersUI?.closePolicyModal?.(); } catch(_e) {}
    try { CustomersUI?.close?.(); } catch(_e) {}
    try { MirrorsUI?.closeSearch?.(); } catch(_e) {}
    try { MirrorsUI?.closeStartModal?.(); } catch(_e) {}
    try { MirrorsUI?.stopTimerLoop?.(); } catch(_e) {}
    try { LeadShellUI?.close?.(); } catch(_e) {}
    try { Wizard?.closeHealthFindingsModal?.(); } catch(_e) {}
    try { Wizard?.closePicker?.(); } catch(_e) {}
    try { Wizard?.closeCoversDrawer?.(); } catch(_e) {}
    try { Wizard?.closePolicyAddedModal?.(); } catch(_e) {}
    try { Wizard?.closePolicyDiscountModal?.(); } catch(_e) {}
    try { Wizard?.closeOperationalReport?.(); } catch(_e) {}
    try { Wizard?.hideFinishFlow?.(); } catch(_e) {}

    [
      ["lcForgotModal", {}],
      ["lcUserModal", {}],
      ["customerFull", {}],
      ["customerPolicyModal", {}],
      ["lcArchiveCustomerModal", {}],
      ["lcInsPicker", {}],
      ["lcCoversDrawer", {}],
      ["lcPolicyAddedModal", {}],
      ["lcPolicyDiscountModal", {}],
      ["lcLeadShell", {}],
      ["lcReport", {}],
      ["lcFlow", { hideStyle:true }],
      ["mirrorsSearchModal", { hidden:true }],
      ["mirrorsStartModal", { hidden:true }],
      ["systemRepairModal", { ariaHidden:false }]
    ].forEach(([id, cfg]) => closeById(id, cfg));

    try {
      document.querySelectorAll('.modal.is-open, .drawer.is-open, .lcWizard.is-open').forEach((el) => {
        const id = safeTrim(el.id);
        if(id && keepIds.has(id)) return;
        el.classList.remove('is-open', 'is-active', 'is-visible');
        if(el.classList.contains('lcFlow')) el.style.display = 'none';
        if(el.id === 'mirrorsSearchModal' || el.id === 'mirrorsStartModal') el.hidden = true;
        el.setAttribute('aria-hidden', 'true');
      });
    } catch(_e) {}

    releaseGlobalUiLocks();
  }

  function prepareInteractiveWizardOpen(){
    forceCloseUiLayers({ keepIds:["lcWizard"] });
    try {
      const wizard = document.getElementById("lcWizard");
      if(wizard){
        wizard.style.pointerEvents = "";
        wizard.removeAttribute("inert");
      }
      wizard?.querySelectorAll?.('input,select,textarea,button').forEach((el) => {
        el.disabled = false;
        el.readOnly = false;
      });
    } catch(_e) {}
  }

  // Visible error box (login)
  function showLoginError(msg){
    const box = $("#lcLoginError");
    if (box) box.textContent = msg ? String(msg) : "";
  }

  window.addEventListener("error", (ev) => {
    try {
      console.error("GLOBAL_ERROR:", ev?.error || ev?.message || ev);
      if ($("#lcLogin") && document.body.classList.contains("lcAuthLock")) {
        if (!$("#lcLoginError")?.textContent) showLoginError("שגיאה במערכת. פתח קונסול (F12) לפרטים.");
      }
    } catch(_e) {}
  });
  window.addEventListener("unhandledrejection", (ev) => {
    try {
      console.error("UNHANDLED_REJECTION:", ev?.reason || ev);
      if ($("#lcLogin") && document.body.classList.contains("lcAuthLock")) {
        if (!$("#lcLoginError")?.textContent) showLoginError("שגיאה במערכת. פתח קונסול (F12) לפרטים.");
      }
    } catch(_e) {}
  });

  // ---------- Config / Local keys ----------
  const LS_SESSION_KEY = "GEMEL_SESSION_V1";
  const LS_BACKUP_KEY  = "GEMEL_STATE_BACKUP_V1";
  const BIRTHDAY_OVERLAY_MS = 9000;

  // ---------- State ----------
  const defaultState = () => ({
    meta: {
      updatedAt: null,
      adminAuth: { username: "מנהל מערכת", pin: "1234", active: true },
      opsEvents: [],
      chatAvatars: {}
    },
    agents: [
      { id:"a_0", name:"יובל מנדלסון", username:"יובל מנדלסון", pin:"0000", birthDate:"", active:true }
    ],
    customers: [],
    proposals: []
  });

  const State = {
    data: defaultState()
  };

  function normalizeState(s){
    const base = defaultState();
    const out = {
      meta: { ...(s?.meta || {}) },
      agents: Array.isArray(s?.agents) ? s.agents : base.agents,
      customers: Array.isArray(s?.customers) ? s.customers : [],
      proposals: Array.isArray(s?.proposals) ? s.proposals : []
    };

    const defAdmin = base.meta.adminAuth;
    const rawAdmin = out.meta.adminAuth || {};
    out.meta.adminAuth = {
      username: safeTrim(rawAdmin.username) || defAdmin.username,
      pin: safeTrim(rawAdmin.pin) || defAdmin.pin,
      active: (rawAdmin.active === false) ? false : true
    };

    out.agents = (out.agents || []).map((a, idx) => {
      const name = safeTrim(a?.name) || "נציג";
      const username = safeTrim(a?.username) || safeTrim(a?.user) || name;
      const pin = safeTrim(a?.pin) || safeTrim(a?.pass) || "0000";
      const roleRaw = safeTrim(a?.role) || safeTrim(a?.type) || "";
      const active = (a?.active === false) ? false : true;
      const role = (roleRaw === "manager" || roleRaw === "adminLite" || roleRaw === "admin") ? "manager" : (roleRaw === "ops" || roleRaw === "operations" || roleRaw === "תפעול") ? "ops" : "agent";
      return {
        id: safeTrim(a?.id) || ("a_" + idx),
        name,
        username,
        pin,
        birthDate: safeTrim(a?.birthDate || a?.birth_date),
        role,
        active
      };
    }).filter(a => a.name);

    if (!out.agents.length) out.agents = base.agents;
    out.customers = (out.customers || []).map((c, idx) => normalizeCustomerRecord(c, idx)).filter(Boolean);
    out.proposals = (out.proposals || []).map((p, idx) => normalizeProposalRecord(p, idx)).filter(Boolean);
    out.meta.opsEvents = Array.isArray(out.meta.opsEvents) ? out.meta.opsEvents.map((ev, idx) => normalizeOpsEvent(ev, idx)).filter(Boolean) : [];
    out.meta.chatAvatars = normalizeChatAvatarMap(out.meta.chatAvatars);
    out.meta.updatedAt = safeTrim(out.meta.updatedAt) || nowISO();
    return out;
  }

  function normalizeChatAvatarMap(raw){
    const input = raw && typeof raw === "object" ? raw : {};
    const out = {};
    Object.entries(input).forEach(([key, value]) => {
      const entry = value && typeof value === "object" ? value : {};
      const image = safeTrim(entry.image || entry.url || entry.dataUrl);
      if(!key || !image) return;
      out[String(key)] = {
        image,
        updatedAt: safeTrim(entry.updatedAt) || nowISO()
      };
    });
    return out;
  }

  function getChatAvatarMap(){
    return normalizeChatAvatarMap(State?.data?.meta?.chatAvatars);
  }

  function getChatAvatarEntry(userId){
    const key = safeTrim(userId);
    if(!key) return null;
    const map = getChatAvatarMap();
    return map[key] || null;
  }

  function setChatAvatarEntry(userId, image){
    const key = safeTrim(userId);
    if(!key) return null;
    State.data.meta = State.data.meta && typeof State.data.meta === "object" ? State.data.meta : {};
    const map = getChatAvatarMap();
    const cleanImage = safeTrim(image);
    if(cleanImage){
      map[key] = { image: cleanImage, updatedAt: nowISO() };
    } else {
      delete map[key];
    }
    State.data.meta.chatAvatars = map;
    State.data.meta.updatedAt = nowISO();
    return map[key] || null;
  }



  function parseFlexibleBirthDate(value){
    const raw = safeTrim(value);
    if(!raw) return null;
    let m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(m) return { year:Number(m[1]), month:Number(m[2]), day:Number(m[3]) };
    m = raw.match(/^(\d{2})[\/.\-](\d{2})[\/.\-](\d{4})$/);
    if(m) return { day:Number(m[1]), month:Number(m[2]), year:Number(m[3]) };
    m = raw.match(/^(\d{2})[\/.\-](\d{2})[\/.\-](\d{2})$/);
    if(m) return { day:Number(m[1]), month:Number(m[2]), year:2000 + Number(m[3]) };
    return null;
  }

  function isBirthdayToday(value){
    const p = parseFlexibleBirthDate(value);
    if(!p) return false;
    const now = new Date();
    return Number(p.day) === now.getDate() && Number(p.month) === (now.getMonth() + 1);
  }

  function formatBirthDateDisplay(value){
    const p = parseFlexibleBirthDate(value);
    if(!p) return '—';
    return `${String(p.day).padStart(2,'0')}/${String(p.month).padStart(2,'0')}/${String(p.year).padStart(4,'0')}`;
  }

  function normalizeOpsEvent(ev, idx=0){
    if(!ev || typeof ev !== "object") return null;
    const range = ev.range && typeof ev.range === "object" ? ev.range : {};
    const reminder = ev.reminder && typeof ev.reminder === "object" ? ev.reminder : {};
    const title = safeTrim(ev.title) || "שיחת שיקוף ללקוח";
    const date = safeTrim(ev.date);
    const rangeStart = safeTrim(ev.rangeStart) || safeTrim(range.start);
    const rangeEnd = safeTrim(ev.rangeEnd) || safeTrim(range.end);
    const scheduledAt = safeTrim(ev.scheduledAt) || buildOpsEventDateTime(date, rangeStart);
    const reminderAt = safeTrim(ev.reminderAt) || shiftIsoMinutes(scheduledAt, -2);
    return {
      id: safeTrim(ev.id) || ("ops_event_" + idx + "_" + Math.random().toString(16).slice(2,8)),
      customerId: safeTrim(ev.customerId),
      customerName: safeTrim(ev.customerName) || "לקוח",
      customerPhone: safeTrim(ev.customerPhone),
      customerIdNumber: safeTrim(ev.customerIdNumber),
      title,
      notes: safeTrim(ev.notes),
      date,
      rangeStart,
      rangeEnd,
      range: { start: rangeStart, end: rangeEnd },
      scheduledAt,
      reminderAt,
      status: safeTrim(ev.status) || "scheduled",
      createdAt: safeTrim(ev.createdAt) || nowISO(),
      updatedAt: safeTrim(ev.updatedAt) || safeTrim(ev.createdAt) || nowISO(),
      createdByKey: safeTrim(ev.createdByKey),
      createdByName: safeTrim(ev.createdByName) || "נציג",
      acknowledgedAt: safeTrim(ev.acknowledgedAt),
      reminder: {
        offsetMinutes: Number(reminder.offsetMinutes || ev.reminderOffsetMinutes || 2) || 2,
        toastShownAt: safeTrim(reminder.toastShownAt) || safeTrim(ev.toastShownAt),
        acknowledgedAt: safeTrim(reminder.acknowledgedAt) || safeTrim(ev.acknowledgedAt)
      }
    };
  }

  function buildOpsEventDateTime(dateStr, timeStr){
    const d = safeTrim(dateStr);
    const t = safeTrim(timeStr);
    if(!d || !t) return "";
    return `${d}T${t}:00`;
  }

  function shiftIsoMinutes(isoStr, diffMinutes){
    const ms = Date.parse(isoStr || "");
    if(!Number.isFinite(ms)) return "";
    return new Date(ms + (Number(diffMinutes || 0) * 60000)).toISOString();
  }

  function formatOpsTime(timeStr){
    const value = safeTrim(timeStr);
    return value ? value.slice(0,5) : "—";
  }

  function formatOpsDateTime(isoStr){
    const ms = Date.parse(isoStr || "");
    if(!Number.isFinite(ms)) return "—";
    try {
      return new Intl.DateTimeFormat('he-IL', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }).format(new Date(ms));
    } catch(_e) {
      return new Date(ms).toLocaleString('he-IL');
    }
  }

  function showHarBituachImportModal(options = {}){
    const policies = Array.isArray(options.policies) ? options.policies : [];
    const title = safeTrim(options.title) || `זוהו ${policies.length} פוליסות רלוונטיות לייבוא`;
    const note = safeTrim(options.note) || "ניתן להוסיף גם פוליסות ידנית.";
    const confirmText = safeTrim(options.confirmText) || "אישור";
    const cancelText = safeTrim(options.cancelText) || "ביטול";

    return new Promise((resolve) => {
      let settled = false;
      const existing = document.getElementById('lcHarImportModal');
      if(existing) existing.remove();

      const root = document.createElement('div');
      root.id = 'lcHarImportModal';
      root.className = 'lcHarImportModal';
      root.setAttribute('dir', 'rtl');
      root.innerHTML = `
        <div class="lcHarImportModal__backdrop"></div>
        <div class="lcHarImportModal__panel" role="dialog" aria-modal="true" aria-label="ייבוא מהר הביטוח">
          <button class="lcHarImportModal__close" type="button" aria-label="סגור">×</button>
          <div class="lcHarImportModal__hero">
            <div class="lcHarImportModal__iconWrap" aria-hidden="true">
              <div class="lcHarImportModal__scan"></div>
              <div class="lcHarImportModal__mountain"></div>
              <div class="lcHarImportModal__shield">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6l7-3z"></path>
                  <path d="M8.75 12.1l2.1 2.15 4.4-4.55"></path>
                </svg>
              </div>
            </div>
            <div class="lcHarImportModal__title">${escapeHtml(title)}</div>
            <div class="lcHarImportModal__note">${escapeHtml(note)}</div>
          </div>
          <div class="lcHarImportModal__listWrap">
            <div class="lcHarImportModal__listTitle">פוליסות שזוהו בקובץ</div>
            <ul class="lcHarImportModal__list">
              ${policies.slice(0, 12).map((p) => `<li><b>${escapeHtml(p.company || 'חברה')}</b> · ${escapeHtml(p.policyNumber || 'ללא מספר')} · ${escapeHtml(p.type || 'פוליסה')}</li>`).join('')}
              ${policies.length > 12 ? `<li>ועוד ${policies.length - 12} פוליסות נוספות…</li>` : ''}
            </ul>
          </div>
          <div class="lcHarImportModal__actions">
            <button class="btn" data-har-cancel type="button">${escapeHtml(cancelText)}</button>
            <button class="btn btn--primary" data-har-confirm type="button">${escapeHtml(confirmText)}</button>
          </div>
        </div>
      `;

      const close = (approved) => {
        if(settled) return;
        settled = true;
        root.classList.remove('is-open');
        root.classList.add('is-closing');
        window.setTimeout(() => {
          root.remove();
          resolve(!!approved);
        }, 220);
      };

      root.addEventListener('click', (ev) => {
        if(ev.target === root || ev.target.classList.contains('lcHarImportModal__backdrop')) close(false);
      });
      root.querySelector('[data-har-cancel]')?.addEventListener('click', () => close(false));
      root.querySelector('[data-har-confirm]')?.addEventListener('click', () => close(true));
      root.querySelector('.lcHarImportModal__close')?.addEventListener('click', () => close(false));
      document.addEventListener('keydown', function onKey(ev){
        if(!document.body.contains(root)) {
          document.removeEventListener('keydown', onKey);
          return;
        }
        if(ev.key === 'Escape'){
          document.removeEventListener('keydown', onKey);
          close(false);
        }
      });

      document.body.appendChild(root);
      window.requestAnimationFrame(() => root.classList.add('is-open'));
      window.setTimeout(() => root.classList.add('is-revealed'), 950);
    });
  }

  function showHarBituachProcessingModal(options = {}){
    const title = safeTrim(options.title) || 'מוריד נתוני הר הביטוח למערכת';
    const subtitle = safeTrim(options.subtitle) || 'מנתח את הקובץ ומכין את הפוליסות להצגה';
    const successTitle = safeTrim(options.successTitle) || 'בוצע בהצלחה';
    const successSubtitle = safeTrim(options.successSubtitle) || 'הנתונים הוכנו ומוצגים במערכת';
    const loadingMs = Math.max(500, Number(options.loadingMs) || 1200);
    const successMs = Math.max(450, Number(options.successMs) || 900);

    return new Promise((resolve) => {
      const existing = document.getElementById('lcHarProcessingModal');
      if(existing) existing.remove();
      const root = document.createElement('div');
      root.id = 'lcHarProcessingModal';
      root.className = 'lcHarProcessingModal';
      root.setAttribute('dir', 'rtl');
      root.innerHTML = `
        <div class="lcHarProcessingModal__backdrop"></div>
        <div class="lcHarProcessingModal__panel" role="status" aria-live="polite" aria-label="טעינת נתוני הר הביטוח">
          <div class="lcHarProcessingModal__glow" aria-hidden="true"></div>
          <div class="lcHarProcessingModal__badge">הר הביטוח</div>
          <div class="lcHarProcessingModal__orb" aria-hidden="true">
            <div class="lcHarProcessingModal__scanLine"></div>
            <div class="lcHarProcessingModal__mountain"></div>
            <div class="lcHarProcessingModal__shield">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6l7-3z"></path>
                <path class="lcHarProcessingModal__checkPath" d="M8.75 12.1l2.1 2.15 4.4-4.55"></path>
              </svg>
            </div>
          </div>
          <div class="lcHarProcessingModal__title" data-stage-title>${escapeHtml(title)}</div>
          <div class="lcHarProcessingModal__subtitle" data-stage-subtitle>${escapeHtml(subtitle)}</div>
          <div class="lcHarProcessingModal__loader" data-stage-loader aria-hidden="true">
            <span></span><span></span><span></span>
          </div>
        </div>
      `;
      document.body.appendChild(root);
      const titleEl = root.querySelector('[data-stage-title]');
      const subtitleEl = root.querySelector('[data-stage-subtitle]');
      const loaderEl = root.querySelector('[data-stage-loader]');
      window.requestAnimationFrame(() => root.classList.add('is-open'));
      window.setTimeout(() => root.classList.add('is-loading'), 30);
      window.setTimeout(() => {
        root.classList.remove('is-loading');
        root.classList.add('is-success');
        if(titleEl) titleEl.textContent = successTitle;
        if(subtitleEl) subtitleEl.textContent = successSubtitle;
        if(loaderEl) loaderEl.style.display = 'none';
      }, loadingMs);
      window.setTimeout(() => {
        root.classList.remove('is-open', 'is-loading', 'is-success');
        root.classList.add('is-closing');
        window.setTimeout(() => {
          root.remove();
          resolve(true);
        }, 240);
      }, loadingMs + successMs);
    });
  }


  function premiumCustomerIcon(name){
    const icons = {
      medical: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-6.5-4.35-8.6-8.02C1.42 9.56 3.15 5.5 6.7 5.5c2.03 0 3.14 1.06 4.05 2.24.56.73 1.93.73 2.5 0 .9-1.18 2.01-2.24 4.04-2.24 3.56 0 5.3 4.06 3.3 7.48C18.5 16.65 12 21 12 21Z"></path><path d="M12 9v6"></path><path d="M9 12h6"></path></svg>',
      briefcase: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M8 7V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1"></path><path d="M4.5 9.5h15a1.5 1.5 0 0 1 1.5 1.5v6a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-6A1.5 1.5 0 0 1 4.5 9.5Z"></path><path d="M3 13h18"></path></svg>',
      building: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16"></path><path d="M7 20V6.5A1.5 1.5 0 0 1 8.5 5h7A1.5 1.5 0 0 1 17 6.5V20"></path><path d="M10 9h1"></path><path d="M13 9h1"></path><path d="M10 12h1"></path><path d="M13 12h1"></path><path d="M11 20v-3h2v3"></path></svg>',
      folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3.75 8.75a2 2 0 0 1 2-2h4.15l1.5 1.7h6.85a2 2 0 0 1 2 2v6.8a2 2 0 0 1-2 2H5.75a2 2 0 0 1-2-2v-8.5Z"></path><path d="M3.75 10.25h16.5"></path></svg>',
      activity: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l2.1-4.5L13 16l2.2-4H21"></path></svg>',
      document: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4.75h6.5l4 4V18a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2V6.75a2 2 0 0 1 2-2Z"></path><path d="M14.5 4.75v4h4"></path><path d="M9 12h6"></path><path d="M9 15.5h6"></path></svg>'
    };
    return `<span class="premiumMonoIcon premiumMonoIcon--${String(name || 'folder')}" aria-hidden="true">${icons[name] || icons.folder}</span>`;
  }

  function currentAgentIdentity(){
    const currentName = safeTrim(Auth?.current?.name);
    const currentRole = safeTrim(Auth?.current?.role) || 'agent';
    const agents = Array.isArray(State.data?.agents) ? State.data.agents : [];
    const found = agents.find((a) => safeTrim(a?.name) === currentName || safeTrim(a?.username) === currentName) || null;
    const idPart = safeTrim(found?.id) || currentName || 'agent';
    const userPart = safeTrim(found?.username) || safeTrim(found?.name) || currentName || 'agent';
    return {
      key: `${idPart}__${userPart}`.toLowerCase().replace(/\s+/g, '_'),
      name: safeTrim(found?.name) || currentName || 'נציג',
      role: safeTrim(found?.role) || currentRole
    };
  }

  function generateOpsEventSlots(){
    const slots = [];
    for(let h=8; h<=20; h += 1){
      for(let m=0; m<60; m += 15){
        const hh = String(h).padStart(2,'0');
        const mm = String(m).padStart(2,'0');
        slots.push(`${hh}:${mm}`);
      }
    }
    return slots;
  }

  function normalizeCustomerRecord(c, idx=0){
    const payload = c?.payload && typeof c.payload === "object" ? c.payload : {};
    if((!Array.isArray(payload.insureds) || !payload.insureds.length) && Array.isArray(payload?.operational?.insureds)){
      payload.insureds = JSON.parse(JSON.stringify(payload.operational.insureds));
    }
    if((!Array.isArray(payload.newPolicies) || !payload.newPolicies.length) && Array.isArray(payload?.operational?.newPolicies)){
      payload.newPolicies = JSON.parse(JSON.stringify(payload.operational.newPolicies));
    }
    const primary = payload?.primary || payload?.insureds?.[0]?.data || {};
    const fullName = safeTrim(c?.fullName) || safeTrim(((primary.firstName || "") + " " + (primary.lastName || "")).trim()) || "לקוח ללא שם";
    const idNumber = safeTrim(c?.idNumber) || safeTrim(primary.idNumber);
    const phone = safeTrim(c?.phone) || safeTrim(primary.phone);
    const email = safeTrim(c?.email) || safeTrim(primary.email);
    const city = safeTrim(c?.city) || safeTrim(primary.city);
    const agentName = safeTrim(c?.agentName) || safeTrim(c?.createdBy) || "";
    const createdAt = safeTrim(c?.createdAt) || nowISO();
    const updatedAt = safeTrim(c?.updatedAt) || createdAt;
    const insuredCount = Number(c?.insuredCount || payload?.insureds?.length || 0) || 0;
    const existingPoliciesCount = Number(c?.existingPoliciesCount || ((payload?.insureds || []).reduce((acc, ins) => acc + ((ins?.data?.existingPolicies || []).length), 0))) || 0;
    const newPoliciesCount = Number(c?.newPoliciesCount || (payload?.newPolicies || []).length) || 0;
    return {
      id: safeTrim(c?.id) || ("cust_" + idx + "_" + Math.random().toString(16).slice(2)),
      status: safeTrim(c?.status) || "חדש",
      fullName,
      idNumber,
      phone,
      email,
      city,
      agentName,
      agentRole: safeTrim(c?.agentRole) || "",
      createdAt,
      updatedAt,
      insuredCount,
      existingPoliciesCount,
      newPoliciesCount,
      payload
    };
  }

  function inferProposalFlowType(payload = {}){
    const raw = safeTrim(payload?.flowType).toLowerCase();
    if(raw === "elementary" || raw === "health") return raw;
    const insureds = Array.isArray(payload?.insureds) ? payload.insureds : [];
    const hasElementaryVehicleData = insureds.some((ins) => {
      const d = ins && typeof ins === "object" ? (ins.data || {}) : {};
      return (Array.isArray(d.elementaryVehiclePolicies) && d.elementaryVehiclePolicies.length)
        || safeTrim(d?.elementaryHarImport?.fileName)
        || Number(d?.elementaryHarImport?.count || 0) > 0;
    });
    return hasElementaryVehicleData ? "elementary" : "health";
  }

  function inferProposalElementaryProduct(payload = {}){
    const explicit = safeTrim(payload?.elementaryProduct);
    if(explicit) return explicit;
    const insureds = Array.isArray(payload?.insureds) ? payload.insureds : [];
    const hasVehicleData = insureds.some((ins) => {
      const d = ins && typeof ins === "object" ? (ins.data || {}) : {};
      return (Array.isArray(d.elementaryVehiclePolicies) && d.elementaryVehiclePolicies.length)
        || safeTrim(d?.elementaryHarImport?.fileName)
        || Number(d?.elementaryHarImport?.count || 0) > 0;
    });
    return hasVehicleData ? "vehicle" : "";
  }

  function normalizeProposalRecord(p, idx=0){
    const payload = p?.payload && typeof p.payload === "object" ? p.payload : {};
    const operational = payload?.operational && typeof payload.operational === "object" ? payload.operational : {};
    const primary = operational?.primary || payload?.insureds?.[0]?.data || {};
    const fullName = safeTrim(p?.fullName) || safeTrim(((primary.firstName || "") + " " + (primary.lastName || "")).trim()) || "הצעה ללא שם";
    const idNumber = safeTrim(p?.idNumber) || safeTrim(primary.idNumber);
    const phone = safeTrim(p?.phone) || safeTrim(primary.phone);
    const email = safeTrim(p?.email) || safeTrim(primary.email);
    const city = safeTrim(p?.city) || safeTrim(primary.city);
    const agentName = safeTrim(p?.agentName) || safeTrim(p?.createdBy) || "";
    const createdAt = safeTrim(p?.createdAt) || nowISO();
    const updatedAt = safeTrim(p?.updatedAt) || createdAt;
    const currentStep = Math.max(1, Math.min(9, Number(p?.currentStep || payload?.currentStep || 1) || 1));
    const insuredCount = Number(p?.insuredCount || payload?.insureds?.length || 0) || 0;
    payload.flowType = inferProposalFlowType(payload);
    payload.elementaryProduct = payload.flowType === "elementary" ? inferProposalElementaryProduct(payload) : "";
    return {
      id: safeTrim(p?.id) || ("prop_" + idx + "_" + Math.random().toString(16).slice(2)),
      status: safeTrim(p?.status) || "פתוחה",
      fullName,
      idNumber,
      phone,
      email,
      city,
      agentName,
      agentRole: safeTrim(p?.agentRole) || "",
      createdAt,
      updatedAt,
      currentStep,
      insuredCount,
      payload
    };
  }

  // ---------- Storage (Supabase) ----------
  const Storage = {
    supabaseUrl: SUPABASE_URL,
    publishableKey: SUPABASE_PUBLISHABLE_KEY,
    client: null,

    session(){
      try{
        const name = safeTrim(Auth?.current?.name);
        const role = safeTrim(Auth?.current?.role);
        return { name, role };
      }catch(_e){
        return { name:"", role:"" };
      }
    },

    loadBackup(){
      try {
        const raw = localStorage.getItem(LS_BACKUP_KEY);
        if(!raw) return null;
        return normalizeState(JSON.parse(raw));
      } catch(_) { return null; }
    },
    saveBackup(st){
      try { localStorage.setItem(LS_BACKUP_KEY, JSON.stringify(st)); } catch(_) {}
    },

    restoreUrl(){ return this.supabaseUrl; },
    setUrl(){ return this.supabaseUrl; },

    getClient(){
      if(this.client) return this.client;
      if(!window.supabase || typeof window.supabase.createClient !== "function") {
        throw new Error("SUPABASE_CLIENT_NOT_LOADED");
      }
      this.client = window.supabase.createClient(this.supabaseUrl, this.publishableKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false
        }
      });
      return this.client;
    },

    async ping(){
      if(!this.supabaseUrl || !this.publishableKey) return { ok:false, error:"חסרים פרטי חיבור ל-Supabase" };
      try {
        const res = await fetch(this.supabaseUrl + "/auth/v1/settings", {
          method:"GET",
          headers: {
            apikey: this.publishableKey,
            Authorization: "Bearer " + this.publishableKey
          }
        });
        if(!res.ok) return { ok:false, error:"PING_FAILED_" + res.status };
        return { ok:true, at: nowISO() };
      } catch(e) {
        return { ok:false, error: String(e?.message || e) };
      }
    },

    buildMetaRow(state){
      return {
        key: "global",
        payload: {
          adminAuth: state?.meta?.adminAuth || defaultState().meta.adminAuth,
          opsEvents: Array.isArray(state?.meta?.opsEvents) ? state.meta.opsEvents.map((ev, idx) => normalizeOpsEvent(ev, idx)).filter(Boolean) : [],
          chatAvatars: normalizeChatAvatarMap(state?.meta?.chatAvatars),
          updatedAt: nowISO()
        },
        updated_at: nowISO()
      };
    },

    buildAgentRows(state){
      return (state?.agents || []).map((a, idx) => ({
        id: safeTrim(a?.id) || ("a_" + idx),
        name: safeTrim(a?.name) || "נציג",
        username: safeTrim(a?.username) || safeTrim(a?.name) || "נציג",
        pin: safeTrim(a?.pin) || "0000",
        role: safeTrim(a?.role) || "agent",
        active: a?.active === false ? false : true,
        birth_date: safeTrim(a?.birthDate) || null,
        created_at: safeTrim(a?.created_at) || nowISO(),
        updated_at: nowISO()
      }));
    },

    buildCustomerRows(state){
      return (state?.customers || []).map((c, idx) => ({
        id: safeTrim(c?.id) || ("cust_" + idx),
        status: safeTrim(c?.status) || "חדש",
        full_name: safeTrim(c?.fullName) || "לקוח ללא שם",
        id_number: safeTrim(c?.idNumber),
        phone: safeTrim(c?.phone),
        email: safeTrim(c?.email),
        city: safeTrim(c?.city),
        agent_name: safeTrim(c?.agentName),
        agent_role: safeTrim(c?.agentRole),
        insured_count: Number(c?.insuredCount || 0) || 0,
        existing_policies_count: Number(c?.existingPoliciesCount || 0) || 0,
        new_policies_count: Number(c?.newPoliciesCount || 0) || 0,
        created_at: safeTrim(c?.createdAt) || nowISO(),
        updated_at: nowISO(),
        payload: c?.payload && typeof c.payload === "object" ? c.payload : {}
      }));
    },

    buildProposalRows(state){
      return (state?.proposals || []).map((p, idx) => ({
        id: safeTrim(p?.id) || ("prop_" + idx),
        status: safeTrim(p?.status) || "פתוחה",
        full_name: safeTrim(p?.fullName) || "הצעה ללא שם",
        id_number: safeTrim(p?.idNumber),
        phone: safeTrim(p?.phone),
        email: safeTrim(p?.email),
        city: safeTrim(p?.city),
        agent_name: safeTrim(p?.agentName),
        agent_role: safeTrim(p?.agentRole),
        current_step: Math.max(1, Math.min(9, Number(p?.currentStep || 1) || 1)),
        insured_count: Number(p?.insuredCount || 0) || 0,
        created_at: safeTrim(p?.createdAt) || nowISO(),
        updated_at: nowISO(),
        payload: p?.payload && typeof p.payload === "object" ? p.payload : {}
      }));
    },

    restHeaders(extra = {}){
      return {
        apikey: this.publishableKey,
        Authorization: "Bearer " + this.publishableKey,
        "Content-Type": "application/json",
        Prefer: "return=representation",
        ...extra
      };
    },

    async restRequest(path, options = {}){
      const res = await fetch(this.supabaseUrl + "/rest/v1/" + String(path || ""), {
        method: options.method || "GET",
        headers: this.restHeaders(options.headers || {}),
        body: options.body == null ? undefined : JSON.stringify(options.body)
      });
      let payload = null;
      try { payload = await res.json(); } catch(_e) {}
      if(!res.ok){
        const msg = payload?.message || payload?.error_description || payload?.hint || ("HTTP_" + res.status);
        throw new Error(msg);
      }
      return payload;
    },

    async upsertMeta(state){
      const row = this.buildMetaRow(state);
      try {
        const client = this.getClient();
        const { error } = await client
          .from(SUPABASE_TABLES.meta)
          .upsert([row], { onConflict: "key" });
        if(error) throw error;
        return;
      } catch(primaryErr) {
        try {
          const existing = await this.restRequest(SUPABASE_TABLES.meta + "?key=eq.global&select=key", {
            method: "GET"
          });
          if(Array.isArray(existing) && existing.length){
            await this.restRequest(SUPABASE_TABLES.meta + "?key=eq.global", {
              method: "PATCH",
              body: row,
              headers: { Prefer: "return=minimal" }
            });
          } else {
            await this.restRequest(SUPABASE_TABLES.meta, {
              method: "POST",
              body: row,
              headers: { Prefer: "return=minimal" }
            });
          }
        } catch(secondaryErr) {
          console.warn("META_SAVE_SKIPPED:", secondaryErr?.message || secondaryErr, "PRIMARY:", primaryErr?.message || primaryErr);
        }
      }
    },

    async syncTable(tableName, rows){
      const safeRows = Array.isArray(rows) ? rows.filter(Boolean) : [];
      let existing = [];
      let canDelete = false;

      try {
        const client = this.getClient();
        const { data, error } = await client.from(tableName).select("id");
        if(error) throw error;
        existing = Array.isArray(data) ? data : [];
        canDelete = true;
      } catch(readErr) {
        try {
          const data = await this.restRequest(tableName + "?select=id", { method: "GET" });
          existing = Array.isArray(data) ? data : [];
          canDelete = true;
        } catch(restReadErr) {
          console.warn("SYNC_READ_IDS_FAILED:", tableName, restReadErr?.message || restReadErr, "PRIMARY:", readErr?.message || readErr);
        }
      }

      if(canDelete){
        const existingIds = new Set((existing || []).map(r => safeTrim(r?.id)).filter(Boolean));
        const nextIds = new Set(safeRows.map(r => safeTrim(r?.id)).filter(Boolean));
        const idsToDelete = Array.from(existingIds).filter(id => !nextIds.has(id));
        if(idsToDelete.length){
          try {
            const client = this.getClient();
            const { error: delError } = await client.from(tableName).delete().in("id", idsToDelete);
            if(delError) throw delError;
          } catch(delErr) {
            try {
              const ids = idsToDelete.map(id => '"' + String(id).replace(/"/g, '\"') + '"').join(",");
              await this.restRequest(tableName + "?id=in.(" + ids + ")", {
                method: "DELETE",
                headers: { Prefer: "return=minimal" }
              });
            } catch(restDelErr) {
              console.warn("SYNC_DELETE_FAILED:", tableName, restDelErr?.message || restDelErr, "PRIMARY:", delErr?.message || delErr);
            }
          }
        }
      }

      if(!safeRows.length) return;

      try {
        const client = this.getClient();
        const { error: upsertError } = await client.from(tableName).upsert(safeRows, { onConflict: "id" });
        if(upsertError) throw upsertError;
        return;
      } catch(primaryErr) {
        console.warn("SYNC_BULK_UPSERT_FAILED:", tableName, primaryErr?.message || primaryErr);
      }

      for (const row of safeRows){
        const id = safeTrim(row?.id);
        if(!id) continue;
        try {
          const updated = await this.restRequest(tableName + "?id=eq." + encodeURIComponent(id) + "&select=id", {
            method: "PATCH",
            body: row
          });
          if(Array.isArray(updated) && updated.length) continue;
          await this.restRequest(tableName, {
            method: "POST",
            body: row
          });
        } catch(rowErr) {
          throw rowErr;
        }
      }
    },

    mapMeta(metaRow){
      const payload = metaRow?.payload && typeof metaRow.payload === "object" ? metaRow.payload : {};
      return {
        updatedAt: safeTrim(payload?.updatedAt) || safeTrim(metaRow?.updated_at) || nowISO(),
        adminAuth: payload?.adminAuth || defaultState().meta.adminAuth,
        opsEvents: Array.isArray(payload?.opsEvents) ? payload.opsEvents.map((ev, idx) => normalizeOpsEvent(ev, idx)).filter(Boolean) : [],
        chatAvatars: normalizeChatAvatarMap(payload?.chatAvatars)
      };
    },

    mapAgentRow(row, idx){
      return {
        id: safeTrim(row?.id) || ("a_" + idx),
        name: safeTrim(row?.name),
        username: safeTrim(row?.username),
        pin: safeTrim(row?.pin),
        birthDate: safeTrim(row?.birthDate || row?.birth_date),
        role: safeTrim(row?.role) || "agent",
        active: row?.active === false ? false : true,
        created_at: safeTrim(row?.created_at),
        updated_at: safeTrim(row?.updated_at)
      };
    },

    mapCustomerRow(row, idx){
      return normalizeCustomerRecord({
        id: row?.id,
        status: row?.status,
        fullName: row?.full_name,
        idNumber: row?.id_number,
        phone: row?.phone,
        email: row?.email,
        city: row?.city,
        agentName: row?.agent_name,
        agentRole: row?.agent_role,
        insuredCount: row?.insured_count,
        existingPoliciesCount: row?.existing_policies_count,
        newPoliciesCount: row?.new_policies_count,
        createdAt: row?.created_at,
        updatedAt: row?.updated_at,
        payload: row?.payload || {}
      }, idx);
    },

    mapProposalRow(row, idx){
      return normalizeProposalRecord({
        id: row?.id,
        status: row?.status,
        fullName: row?.full_name,
        idNumber: row?.id_number,
        phone: row?.phone,
        email: row?.email,
        city: row?.city,
        agentName: row?.agent_name,
        agentRole: row?.agent_role,
        currentStep: row?.current_step,
        insuredCount: row?.insured_count,
        createdAt: row?.created_at,
        updatedAt: row?.updated_at,
        payload: row?.payload || {}
      }, idx);
    },

    async loadTableRows(tableName, selectExpr = "*"){
      try {
        const client = this.getClient();
        const { data, error } = await client.from(tableName).select(selectExpr);
        if(error) throw error;
        return { ok:true, data: data || [] };
      } catch(primaryErr) {
        try {
          const data = await this.restRequest(tableName + "?select=" + encodeURIComponent(selectExpr), { method: "GET" });
          return { ok:true, data: data || [] };
        } catch(restErr) {
          return { ok:false, error: String(restErr?.message || primaryErr?.message || restErr || primaryErr) };
        }
      }
    },

    async loadMetaRow(){
      try {
        const client = this.getClient();
        const { data, error } = await client.from(SUPABASE_TABLES.meta).select("key,payload,updated_at").eq("key", "global").maybeSingle();
        if(error) throw error;
        return { ok:true, data: data || {} };
      } catch(primaryErr) {
        try {
          const data = await this.restRequest(SUPABASE_TABLES.meta + "?key=eq.global&select=key,payload,updated_at", { method: "GET" });
          return { ok:true, data: Array.isArray(data) ? (data[0] || {}) : (data || {}) };
        } catch(restErr) {
          return { ok:false, error: String(restErr?.message || primaryErr?.message || restErr || primaryErr) };
        }
      }
    },

    async loadSheets(){
      try {
        const [metaRes, agentsRes, customersRes, proposalsRes] = await Promise.all([
          this.loadMetaRow(),
          this.loadTableRows(SUPABASE_TABLES.agents),
          this.loadTableRows(SUPABASE_TABLES.customers),
          this.loadTableRows(SUPABASE_TABLES.proposals)
        ]);

        const criticalErr = agentsRes.ok ? (customersRes.ok ? (proposalsRes.ok ? null : proposalsRes.error) : customersRes.error) : agentsRes.error;
        if(criticalErr) return { ok:false, error: String(criticalErr) };

        const payload = normalizeState({
          meta: this.mapMeta(metaRes.ok ? (metaRes.data || {}) : {}),
          agents: (agentsRes.data || []).map((row, idx) => this.mapAgentRow(row, idx)),
          customers: (customersRes.data || []).map((row, idx) => this.mapCustomerRow(row, idx)),
          proposals: (proposalsRes.data || []).map((row, idx) => this.mapProposalRow(row, idx))
        });
        return { ok:true, payload, at: payload?.meta?.updatedAt || nowISO() };
      } catch(e) {
        return { ok:false, error: String(e?.message || e) };
      }
    },

    async saveSheets(state){
      try {
        await this.upsertMeta(state);
        await this.syncTable(SUPABASE_TABLES.agents, this.buildAgentRows(state));
        await this.syncTable(SUPABASE_TABLES.customers, this.buildCustomerRows(state));
        await this.syncTable(SUPABASE_TABLES.proposals, this.buildProposalRows(state));
        return { ok:true, at: nowISO() };
      } catch(e) {
        return { ok:false, error: String(e?.message || e) };
      }
    },

    async sendAdminContact(){
      return { ok:false, error:"SUPABASE_NO_MAIL_ENDPOINT" };
    }
  };

  // ---------- Auth ----------
  const Auth = {
    current: null, // {name, role}
    els: null,

    init(){
      this.els = {
        wrap: $("#lcLogin"),
        form: $("#lcLoginForm"),
        user: $("#lcLoginUser"),
        pin: $("#lcLoginPin"),
        err: $("#lcLoginError"),
      };

      // show login immediately
      try {
        document.body.classList.add("lcAuthLock");
        this.els.wrap?.setAttribute?.("aria-hidden","false");
      } catch(_) {}

      try { localStorage.removeItem(LS_SESSION_KEY); } catch(_) {}
      this.lock();

      on(this.els.form, "submit", async (e) => {
        e.preventDefault();
        await this._submit();
      });
    },

    lock(){
      try {
        document.body.classList.add("lcAuthLock");
        this.els.wrap?.setAttribute?.("aria-hidden","false");
        setTimeout(() => this.els.user?.focus?.(), 50);
      } catch(_) {}
      UI.renderAuthPill();
    },

    unlock(){
      try {
        document.body.classList.remove("lcAuthLock");
        this.els.wrap?.setAttribute?.("aria-hidden","true");
      } catch(_) {}
    },

    isAdmin(){
      return !!(this.current && this.current.role === "admin");
    },

    isManager(){
      return !!(this.current && this.current.role === "manager");
    },

    isOps(){
      return !!(this.current && this.current.role === "ops");
    },

    canViewAllCustomers(){
      return this.isAdmin() || this.isManager() || this.isOps();
    },

    canManageUsers(){
      return this.isAdmin() || this.isManager();
    },

    logout(reason = "manual"){
      this.current = null;
      BirthdaysUI.stop();
      try { localStorage.removeItem(LS_SESSION_KEY); } catch(_) {}
      try { InactivityGuard.stop(); } catch(_e) {}
      this.lock();
      if(reason === "idle"){
        this._setError("בוצעה התנתקות אוטומטית לאחר 40 דקות של אי פעילות במערכת");
      } else {
        this._setError("");
      }
      try {
        if(this.els?.pin) this.els.pin.value = "";
      } catch(_e) {}
      UI.applyRoleUI();
      UI.goView("dashboard");
    },

    _setError(msg){
      showLoginError(msg);
    },

    _restoreSession(){
      try {
        const raw = localStorage.getItem(LS_SESSION_KEY);
        if(!raw) return null;
        const s = JSON.parse(raw);
        const name = safeTrim(s?.name);
        const role = safeTrim(s?.role) || "agent";
        if(!name) return null;
        return { name, role };
      } catch(_) { return null; }
    },

    _saveSession(cur){
      try {
        localStorage.setItem(LS_SESSION_KEY, JSON.stringify({ name: cur.name, role: cur.role }));
      } catch(_) {}
    },

    async _submit(){
      const username = safeTrim(this.els.user?.value);
      const pin = safeTrim(this.els.pin?.value);

      this._setError("");
      if(!username) return this._setError("נא להזין שם משתמש");
      if(!pin) return this._setError("נא להזין קוד כניסה");

      // ensure boot done
      try { await App._bootPromise; } catch(_) {}

      const defAdmin = { username:"מנהל מערכת", pin:"1234" };
      const adminAuth = State.data?.meta?.adminAuth || { ...defAdmin, active:true };

      if (adminAuth.active !== false && username === safeTrim(adminAuth.username) && pin === safeTrim(adminAuth.pin)) {
        this.current = { name: safeTrim(adminAuth.username) || defAdmin.username, role:"admin" };
        try { localStorage.removeItem(LS_SESSION_KEY); } catch(_) {}
        await App.reloadSessionState();
        this.unlock();
        try { InactivityGuard.start(); } catch(_e) {}
        UI.applyRoleUI();
        UI.renderAuthPill();
        await WelcomeLoader.play(this.current.name, 4800);
        BirthdaysUI.maybeCelebrateLogin();
        UI.goView("settings");
        try { ChatUI.onLogin(); } catch(_e) {}
        try { SupportNoticeUI.showAfterLogin(); } catch(_e) {}
        return;
      }

      const agents = Array.isArray(State.data?.agents) ? State.data.agents : [];
      const matched = agents.find(a => safeTrim(a?.username) === username) || agents.find(a => safeTrim(a?.name) === username);
      if(!matched) return this._setError("שם משתמש לא נמצא");
      if(matched.active === false) return this._setError("המשתמש מושבת");
      const expected = safeTrim(matched.pin) || "0000";
      if(pin !== expected) return this._setError("קוד כניסה שגוי");

      this.current = { name: matched.name, role: (matched.role === "manager" ? "manager" : matched.role === "ops" ? "ops" : "agent") };
      try { localStorage.removeItem(LS_SESSION_KEY); } catch(_) {}
      await App.reloadSessionState();
      this.unlock();
      try { InactivityGuard.start(); } catch(_e) {}
      UI.applyRoleUI();
      UI.renderAuthPill();
      await WelcomeLoader.play(this.current.name, 4800);
      BirthdaysUI.maybeCelebrateLogin();
      UI.goView("dashboard");
      try { ChatUI.onLogin(); } catch(_e) {}
      try { SupportNoticeUI.showAfterLogin(); } catch(_e) {}
    }
  };

  const InactivityGuard = {
    idleMs: AUTO_LOGOUT_IDLE_MS,
    warnText: "בוצעה התנתקות אוטומטית לאחר 40 דקות של אי פעילות במערכת",
    timerId: null,
    started: false,
    boundActivityHandler: null,
    boundVisibilityHandler: null,
    events: ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "pointerdown", "wheel"],

    init(){
      this.boundActivityHandler = this.boundActivityHandler || (() => this.bump());
      this.boundVisibilityHandler = this.boundVisibilityHandler || (() => {
        if(document.visibilityState === 'visible') this.bump();
      });
    },

    start(){
      this.init();
      this.stop();
      if(!Auth.current) return;
      this.events.forEach((evt) => window.addEventListener(evt, this.boundActivityHandler, true));
      document.addEventListener('visibilitychange', this.boundVisibilityHandler, true);
      this.started = true;
      this.bump();
    },

    stop(){
      if(this.timerId){
        clearTimeout(this.timerId);
        this.timerId = null;
      }
      if(this.boundActivityHandler){
        this.events.forEach((evt) => window.removeEventListener(evt, this.boundActivityHandler, true));
      }
      if(this.boundVisibilityHandler){
        document.removeEventListener('visibilitychange', this.boundVisibilityHandler, true);
      }
      this.started = false;
    },

    bump(){
      if(!Auth.current) return;
      if(this.timerId) clearTimeout(this.timerId);
      this.timerId = window.setTimeout(() => this.trigger(), this.idleMs);
    },

    trigger(){
      this.timerId = null;
      if(!Auth.current) return;
      this.stop();
      try { ChatUI.close?.(); } catch(_e) {}
      Auth.logout('idle');
    }
  };

  function getTimeGreeting(){
    const hour = new Date().getHours();
    if(hour < 12) return "בוקר טוב";
    if(hour < 17) return "צהריים טובים";
    return "ערב טוב";
  }

  const WelcomeLoader = {
    el: null,
    ensure(){
      if(this.el) return this.el;
      const root = document.createElement("div");
      root.id = "lcWelcomeLoader";
      root.className = "lcWelcomeLoader";
      root.setAttribute("aria-hidden", "true");
      root.innerHTML = `
        <div class="lcWelcomeLoader__backdrop"></div>
        <div class="lcWelcomeLoader__panel" role="status" aria-live="polite" aria-atomic="true">
          <div class="lcWelcomeLoader__scene" aria-hidden="true">
            <span class="lcWelcomeLoader__curve lcWelcomeLoader__curve--1"></span>
            <span class="lcWelcomeLoader__curve lcWelcomeLoader__curve--2"></span>
            <span class="lcWelcomeLoader__curve lcWelcomeLoader__curve--3"></span>
            <span class="lcWelcomeLoader__curve lcWelcomeLoader__curve--4"></span>
            <span class="lcWelcomeLoader__spark lcWelcomeLoader__spark--1"></span>
            <span class="lcWelcomeLoader__spark lcWelcomeLoader__spark--2"></span>
            <span class="lcWelcomeLoader__spark lcWelcomeLoader__spark--3"></span>
            <span class="lcWelcomeLoader__spark lcWelcomeLoader__spark--4"></span>
          </div>
          <div class="lcWelcomeLoader__content">
            <img class="lcWelcomeLoader__logo" src="./logo-login-clean.png" alt="GEMEL INVEST" />
            <div class="lcWelcomeLoader__greeting" id="lcWelcomeGreeting"></div>
            <div class="lcWelcomeLoader__name" id="lcWelcomeName"></div>
            <div class="lcWelcomeLoader__sub">טוען מערכת, אנא המתן</div>
            <div class="lcWelcomeLoader__line" aria-hidden="true">
              <span class="lcWelcomeLoader__lineGlow"></span>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(root);
      this.el = root;
      return root;
    },
    open(name){
      const root = this.ensure();
      const greetingEl = root.querySelector('#lcWelcomeGreeting');
      const nameEl = root.querySelector('#lcWelcomeName');
      if(greetingEl) greetingEl.textContent = getTimeGreeting();
      if(nameEl) nameEl.textContent = safeTrim(name);
      root.classList.add('is-open');
      root.setAttribute('aria-hidden', 'false');
    },
    close(){
      const root = this.ensure();
      root.classList.remove('is-open');
      root.setAttribute('aria-hidden', 'true');
    },
    async play(name, ms=4000){
      this.open(name);
      await new Promise(resolve => setTimeout(resolve, ms));
      this.close();
    }
  };

  // ---------- Forgot Password / Contact Admin ----------
  const ForgotPasswordUI = {
    els: null,

    init(){
      this.els = {
        trigger: $("#lcForgotPasswordBtn"),
        wrap: $("#lcForgotModal"),
        backdrop: $("#lcForgotModalBackdrop"),
        close: $("#lcForgotModalClose"),
        cancel: $("#lcForgotModalCancel"),
        send: $("#lcForgotModalSend"),
        username: $("#lcForgotUsername"),
        message: $("#lcForgotMessage"),
        err: $("#lcForgotModalError"),
        success: $("#lcForgotModalSuccess")
      };

      on(this.els.trigger, "click", () => this.open());
      on(this.els.close, "click", () => this.close());
      on(this.els.cancel, "click", () => this.close());
      on(this.els.backdrop, "click", () => this.close());
      on(this.els.send, "click", () => this.submit());
      on(this.els.wrap, "keydown", (ev) => {
        if(ev.key === "Escape"){
          ev.preventDefault();
          this.close();
        }
      });
    },

    open(){
      if(!this.els?.wrap) return;
      this.setError("");
      this.setSuccess("");
      const loginUser = safeTrim($("#lcLoginUser")?.value);
      this.els.username.value = loginUser || this.els.username.value || "";
      this.els.wrap.classList.add("is-open");
      this.els.wrap.setAttribute("aria-hidden","false");
      setTimeout(() => {
        if(this.els.username.value) this.els.message?.focus?.();
        else this.els.username?.focus?.();
      }, 50);
    },

    close(){
      if(!this.els?.wrap) return;
      this.els.wrap.classList.remove("is-open");
      this.els.wrap.setAttribute("aria-hidden","true");
      this.setError("");
      this.setSuccess("");
    },

    setError(msg){
      if(this.els?.err) this.els.err.textContent = msg ? String(msg) : "";
    },

    setSuccess(msg){
      if(!this.els?.success) return;
      const hasMsg = !!msg;
      const textEl = this.els.success.querySelector('.lcForgotModal__successText');
      if(textEl) textEl.textContent = msg ? String(msg) : '';
      else this.els.success.textContent = msg ? String(msg) : '';
      this.els.success.classList.toggle('is-visible', hasMsg);
    },

    buildMailto(username, message){
      const subject = "פנייה ממסך כניסה – GEMEL INVEST";
      const body = [
        "שם משתמש: " + safeTrim(username),
        "",
        "הודעה:",
        safeTrim(message),
        "",
        "Build: " + BUILD,
        "Sent: " + nowISO()
      ].join("\n");
      return `mailto:${encodeURIComponent(ADMIN_CONTACT_EMAIL)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    },

    async submit(){
      const username = safeTrim(this.els?.username?.value);
      const message = safeTrim(this.els?.message?.value);
      this.setError("");
      this.setSuccess("");

      if(!username) return this.setError("נא להזין שם משתמש");
      if(!message) return this.setError("נא לכתוב את תוכן הפנייה");

      const btn = this.els?.send;
      const prevText = btn?.textContent || "שלח פנייה";
      if(btn){
        btn.disabled = true;
        btn.textContent = "שולח...";
      }

      const result = await Storage.sendAdminContact({ username, message });
      if(result.ok){
        this.setSuccess("הפנייה נשלחה בהצלחה למנהל המערכת.");
        if(this.els?.message) this.els.message.value = "";
        if(btn){
          btn.disabled = false;
          btn.textContent = prevText;
        }
        setTimeout(() => this.close(), 1800);
        return;
      }

      try {
        window.location.href = this.buildMailto(username, message);
        this.setSuccess("נפתח חלון מייל לשליחת הפנייה למנהל המערכת.");
      } catch(_e) {
        this.setError("לא הצלחתי לשלוח אוטומטית. בשלב זה הפנייה תיפתח כמייל רגיל למנהל המערכת.");
      } finally {
        if(btn){
          btn.disabled = false;
          btn.textContent = prevText;
        }
      }
    }
  };



  const BirthdaysUI = {
    overlayEl: null,
    hideTimer: null,
    pillInterval: null,

    stop(){
      if(this.hideTimer){ clearTimeout(this.hideTimer); this.hideTimer = null; }
      if(this.pillInterval){ clearInterval(this.pillInterval); this.pillInterval = null; }
      try { this.overlayEl?.remove(); } catch(_e) {}
      this.overlayEl = null;
      const pill = document.getElementById('lcUserPill');
      if(pill) pill.classList.remove('is-birthday');
      const celebration = document.getElementById('lcUserPillCelebration');
      if(celebration) celebration.innerHTML = '';
    },

    getCurrentAgentRecord(){
      if(!Auth.current || Auth.isAdmin()) return null;
      const agents = Array.isArray(State.data?.agents) ? State.data.agents : [];
      return agents.find((a) => safeTrim(a?.name) === safeTrim(Auth.current?.name) || safeTrim(a?.username) === safeTrim(Auth.current?.name)) || null;
    },

    maybeCelebrateLogin(){
      const agent = this.getCurrentAgentRecord();
      this.decorateUserPill(agent);
      if(agent && isBirthdayToday(agent.birthDate)){
        this.showOverlay(agent);
      }
    },

    decorateUserPill(agent){
      const pill = document.getElementById('lcUserPill');
      const celebration = document.getElementById('lcUserPillCelebration');
      if(!pill || !celebration) return;
      celebration.innerHTML = '';
      pill.classList.remove('is-birthday');
      if(this.pillInterval){ clearInterval(this.pillInterval); this.pillInterval = null; }
      if(!(agent && isBirthdayToday(agent.birthDate))) return;

      pill.classList.add('is-birthday');
      celebration.innerHTML = '<span class="lcUserPill__balloon lcUserPill__balloon--1"></span><span class="lcUserPill__balloon lcUserPill__balloon--2"></span><span class="lcUserPill__balloon lcUserPill__balloon--3"></span>';
      const burst = () => {
        if(!document.body.contains(celebration)) return;
        for(let i=0;i<16;i+=1){
          const piece = document.createElement('span');
          piece.className = 'lcUserPill__confetti';
          piece.style.setProperty('--x', ((Math.random() * 120) - 60).toFixed(1) + 'px');
          piece.style.setProperty('--y', (26 + Math.random() * 26).toFixed(1) + 'px');
          piece.style.setProperty('--r', (Math.random() * 300 - 150).toFixed(1) + 'deg');
          piece.style.setProperty('--d', (0.95 + Math.random() * 0.7).toFixed(2) + 's');
          piece.style.insetInlineStart = (18 + Math.random() * 64).toFixed(1) + '%';
          piece.style.top = (18 + Math.random() * 26).toFixed(1) + '%';
          celebration.appendChild(piece);
          window.setTimeout(() => piece.remove(), 2200);
        }
      };
      burst();
      this.pillInterval = window.setInterval(burst, 5200);
    },

    showOverlay(agent){
      if(!agent) return;
      try { this.overlayEl?.remove(); } catch(_e) {}
      const root = document.createElement('div');
      root.className = 'lcBirthdayOverlay is-open';
      root.setAttribute('dir', 'rtl');
      root.innerHTML = `
        <div class="lcBirthdayOverlay__backdrop"></div>
        <div class="lcBirthdayOverlay__panel" role="dialog" aria-modal="true" aria-label="ברכת יום הולדת">
          <div class="lcBirthdayOverlay__balloons" aria-hidden="true">
            <span class="lcBirthdayOverlay__balloon lcBirthdayOverlay__balloon--a"></span>
            <span class="lcBirthdayOverlay__balloon lcBirthdayOverlay__balloon--b"></span>
            <span class="lcBirthdayOverlay__balloon lcBirthdayOverlay__balloon--c"></span>
            <span class="lcBirthdayOverlay__balloon lcBirthdayOverlay__balloon--d"></span>
          </div>
          <div class="lcBirthdayOverlay__confetti" aria-hidden="true">${Array.from({length: 34}).map((_,i)=>`<span style="--dx:${(Math.random()*360-180).toFixed(1)}px;--dy:${(80+Math.random()*140).toFixed(1)}px;--dr:${(Math.random()*280-140).toFixed(1)}deg;--delay:${(Math.random()*0.45).toFixed(2)}s"></span>`).join('')}</div>
          <div class="lcBirthdayOverlay__glow" aria-hidden="true"></div>
          <div class="lcBirthdayOverlay__content">
            <div class="lcBirthdayOverlay__kicker">GEMEL INVEST</div>
            <div class="lcBirthdayOverlay__title">מזל טוב</div>
            <div class="lcBirthdayOverlay__name">${escapeHtml(agent.name || 'לנציג שלנו')}</div>
            <div class="lcBirthdayOverlay__text">ליום ההולדת! הנהלת גמל אינווסט מאחלת לך שפע, בריאות, הגשמת חלומות ושכל משאלות ליבך יתגשמו לטובה.</div>
            <div class="lcBirthdayOverlay__wish">אהה וגם המון פרמיות</div>
          </div>
        </div>`;
      document.body.appendChild(root);
      this.overlayEl = root;
      this.hideTimer = window.setTimeout(() => {
        root.classList.add('is-closing');
        window.setTimeout(() => {
          if(this.overlayEl === root) this.overlayEl = null;
          root.remove();
        }, 520);
      }, BIRTHDAY_OVERLAY_MS);
    }
  };


  // ---------- UI ----------
  const UI = {
    els: {},

    init(){
      this.els.pageTitle = $("#pageTitle");
      this.els.userPill = $("#lcUserPill");
      this.els.userPillText = $("#lcUserPillText");
      this.els.userPillCelebration = $("#lcUserPillCelebration");
      this.els.btnLogout = $("#btnLogout");
this.els.syncDot = $("#syncDot");
      this.els.syncText = $("#syncText");
      this.els.lastSyncText = $("#lastSyncText");

      this.els.gsUrl = $("#gsUrl");
      this.els.btnTestConn = $("#btnTestConn");
      this.els.btnSyncNow = $("#btnSyncNow");

      this.els.usersTbody = $("#usersTbody");
      this.els.btnAddUser = $("#btnAddUser");
      this.els.usersSearch = $("#usersSearch");
      this.els.usersFilter = $("#usersFilter");
      this.els.navUsers = $("#navUsers");
      this.els.navCustomers = $("#navCustomers");
      this.els.navProposals = $("#navProposals");
      this.els.navMirrors = $("#navMirrors");
      this.els.navMyProcesses = $("#navMyProcesses");
      this.els.myProcessesTbody = $("#myProcessesTbody");
      this.els.myProcessesSearch = $("#myProcessesSearch");
      this.els.myProcessesCountBadge = $("#myProcessesCountBadge");
      this.els.btnMyProcessesRefresh = $("#btnMyProcessesRefresh");
      this.els.myProcessesSummary = $("#myProcessesSummary");
      this.els.myProcessesScope = $("#myProcessesScope");
      this.els.btnMyProcessesExitFullscreen = $("#btnMyProcessesExitFullscreen");
      this.els.customersTbody = $("#customersTbody");
      this.els.customersSearch = $("#customersSearch");
      this.els.customersCountBadge = $("#customersCountBadge");
      this.els.btnCustomersRefresh = $("#btnCustomersRefresh");
      this.els.proposalsTbody = $("#proposalsTbody");
      this.els.proposalsSearch = $("#proposalsSearch");
      this.els.proposalsCountBadge = $("#proposalsCountBadge");
      this.els.btnProposalsRefresh = $("#btnProposalsRefresh");

      on(this.els.btnLogout, "click", () => Auth.logout());
// nav
      $$(".nav__item").forEach(btn => {
        on(btn, "click", () => {
          const v = btn.getAttribute("data-view");
          if(!v) return;
          if(v === "settings" && !Auth.isAdmin()) return;
          if(v === "users" && !Auth.canManageUsers()) return;
          if(v === "mirrors" && !Auth.isOps()) return;
          if(v === "myProcesses" && !Auth.isOps()) return;
          this.goView(v);
        });
      });

      // settings
      if(this.els.gsUrl) {
        this.els.gsUrl.value = Storage.supabaseUrl || "";
        this.els.gsUrl.readOnly = true;
        on(this.els.gsUrl, "change", () => {
          this.renderSyncStatus("כתובת Supabase קבועה", "ok");
        });
      }
      on(this.els.btnTestConn, "click", async () => {
        this.renderSyncStatus("בודק חיבור…", "warn");
        const r = await Storage.ping();
        if(r.ok) this.renderSyncStatus("מחובר", "ok", r.at);
        else this.renderSyncStatus("שגיאה בחיבור", "err", null, r.error);
      });
      on(this.els.btnSyncNow, "click", async () => {
        await App.syncNow();
      });

      // users
      on(this.els.btnAddUser, "click", async () => {
        if(!Auth.canManageUsers()) return;
        await UsersUI.addUser();
      });
      on(this.els.usersSearch, "input", () => UsersUI.render());
      on(this.els.usersFilter, "change", () => UsersUI.render());
      on(this.els.customersSearch, "input", () => CustomersUI.render());
      on(this.els.btnCustomersRefresh, "click", () => CustomersUI.render());
      on(this.els.proposalsSearch, "input", () => ProposalsUI.render());
      on(this.els.btnProposalsRefresh, "click", () => ProposalsUI.render());
      on(this.els.myProcessesSearch, "input", () => ProcessesUI.render());
      on(this.els.btnMyProcessesRefresh, "click", () => ProcessesUI.render());
      on(this.els.btnMyProcessesExitFullscreen, "click", () => this.goView("dashboard"));
      on(this.els.myProcessesScope, "click", (ev) => {
        const btn = ev.target?.closest?.("[data-process-scope]");
        if(!btn) return;
        $$(".segmented__btn", this.els.myProcessesScope).forEach(el => el.classList.toggle("is-active", el === btn));
        ProcessesUI.render();
      });
this.applyRoleUI();
      this.renderAuthPill();
    },

    applyRoleUI(){
      const isAdmin = Auth.isAdmin();
      const isOps = Auth.isOps();
      const canUsers = Auth.canManageUsers();
      const settingsBtn = document.querySelector('.nav__item[data-view="settings"]');
      const newCustomerBtn = document.getElementById("btnNewCustomerWizard");
      if (settingsBtn) settingsBtn.style.display = isAdmin ? "" : "none";
      if (this.els.navUsers) this.els.navUsers.style.display = canUsers ? "" : "none";
      if (this.els.navCustomers) this.els.navCustomers.style.display = Auth.current ? "" : "none";
      if (this.els.navProposals) this.els.navProposals.style.display = (Auth.current && !isOps) ? "" : "none";
      if (this.els.navMirrors) this.els.navMirrors.style.display = isOps ? "" : "none";
      if (this.els.navMyProcesses) this.els.navMyProcesses.style.display = isOps ? "" : "none";
      if (newCustomerBtn) newCustomerBtn.style.display = isOps ? "none" : "";
    },

    setActiveNav(view){
      $$(".nav__item").forEach(b => b.classList.toggle("is-active", b.getAttribute("data-view") === view));
    },

    goView(view){
      let safe = String(view || "dashboard");
      if(safe === "settings" && !Auth.isAdmin()) safe = "dashboard";
      if(safe === "users" && !Auth.canManageUsers()) safe = "dashboard";
      if(safe === "mirrors" && !Auth.isOps()) safe = "dashboard";
      if(safe === "myProcesses" && !Auth.isOps()) safe = "dashboard";
      if(safe === "customers" && !Auth.current) safe = "dashboard";
      if(safe === "proposals" && !Auth.current) safe = "dashboard";
      // hide all views
      $$(".view").forEach(v => v.classList.remove("is-visible"));
      const el = $("#view-" + safe);
      if (el) el.classList.add("is-visible");

      // title
      if (this.els.pageTitle) {
        const map = {
          dashboard: "דשבורד",
          customers: "לקוחות",
          proposals: "הצעות",
          myProcesses: "התהליכים שלי",
          mirrors: "שיקופים",
          discountSpec: "מפרט הנחות ביטוח",
          settings: "הגדרות מערכת",
          users: "ניהול משתמשים"
        };
        this.els.pageTitle.textContent = map[safe] || "דשבורד";
      }

      this.setActiveNav(safe);
      document.body.classList.remove("view-users-active","view-dashboard-active","view-settings-active","view-discountSpec-active","view-customers-active","view-proposals-active","view-myProcesses-active","view-mirrors-active");
      document.body.classList.add("view-" + safe + "-active");

      // render view data
      if (safe === "users") UsersUI.render();
      if (safe === "customers") CustomersUI.render();
      if (safe === "proposals") ProposalsUI.render();
      if (safe === "myProcesses") ProcessesUI.render();
      if (safe === "mirrors") MirrorsUI.render();
    },

    renderAuthPill(){
      const pill = this.els.userPill;
      const txt = this.els.userPillText;
      if(!pill || !txt) return;

      if(Auth.current) {
        pill.style.display = "";
        txt.textContent = Auth.current.name + (Auth.isAdmin() ? " (מנהל מערכת)" : Auth.isManager() ? " (מנהל)" : Auth.isOps() ? " (תפעול)" : "");
        BirthdaysUI.decorateUserPill(BirthdaysUI.getCurrentAgentRecord());
      } else {
        pill.style.display = "none";
        txt.textContent = "";
        BirthdaysUI.stop();
      }
    },

    renderSyncStatus(label, level="warn", at=null, err=null){
      const dot = this.els.syncDot;
      const t = this.els.syncText;
      const last = this.els.lastSyncText;

      if (t) t.textContent = "מצב: Supabase" + (label ? " · " + label : "");
      if (dot) {
        dot.classList.remove("ok","warn","err");
        dot.classList.add(level === "ok" ? "ok" : level === "err" ? "err" : "warn");
      }
      if (last) {
        if (err) last.textContent = "שגיאה: " + String(err);
        else if (at) last.textContent = "עודכן: " + String(at);
      }
    }
  };

  // ---------- Users UI (Admin) ----------
  const UsersUI = {
    _modalEls: null,
    _modalMode: "add",
    _ensureModal(){
      if(this._modalEls) return this._modalEls;
      this._modalEls = {
        wrap: $("#lcUserModal"),
        title: $("#lcUserModalTitle"),
        close: $("#lcUserModalClose"),
        cancel: $("#lcUserModalCancel"),
        save: $("#lcUserModalSave"),
        id: $("#lcUserId"),
        name: $("#lcUserName"),
        username: $("#lcUserUsername"),
        pin: $("#lcUserPin"),
        birthDate: $("#lcUserBirthDate"),
        role: $("#lcUserRole"),
        active: $("#lcUserActive"),
        err: $("#lcUserModalErr"),
        nameErr: $("#lcUserNameErr"),
        userErr: $("#lcUserUsernameErr"),
        pinErr: $("#lcUserPinErr"),
        birthDateErr: $("#lcUserBirthDateErr"),
      };

      const E = this._modalEls;
      const closeFn = () => this.closeModal();

      on(E.close, "click", closeFn);
      on(E.cancel, "click", closeFn);
      on(E.wrap, "click", (ev) => {
        const t = ev.target;
        if(t && t.getAttribute && t.getAttribute("data-close") === "1") closeFn();
      });
      on(E.save, "click", async () => {
        await this._saveFromModal();
      });

      on(E.wrap, "keydown", (ev) => {
        if(ev.key === "Escape"){ ev.preventDefault(); closeFn(); }
        if(ev.key === "Enter"){
          const tag = (ev.target && ev.target.tagName) ? ev.target.tagName.toLowerCase() : "";
          if(tag === "input" || tag === "select"){
            ev.preventDefault();
            this._saveFromModal();
          }
        }
      });

      return this._modalEls;
    },

    openModal(mode, user){
      const E = this._ensureModal();
      this._modalMode = (mode === "edit") ? "edit" : "add";

      // clear errors
      const hide = (el) => { if(el){ el.style.display="none"; } };
      hide(E.err); hide(E.nameErr); hide(E.userErr); hide(E.pinErr); hide(E.birthDateErr);

      if(E.title) E.title.textContent = (this._modalMode === "edit") ? "עריכת משתמש" : "הוסף נציג/סוכן";

      if(E.id) E.id.value = user ? (user.id || "") : "";
      if(E.name) E.name.value = user ? (user.name || "") : "";
      if(E.username) E.username.value = user ? (user.username || "") : "";
      if(E.pin) E.pin.value = user ? (user.pin || "") : "0000";
      if(E.birthDate) E.birthDate.value = user ? (user.birthDate || "") : "";
      if(E.role) E.role.value = user ? (user.role || "agent") : "agent";
      if(E.active) E.active.checked = user ? (user.active !== false) : true;

      if(E.wrap){
        E.wrap.classList.add("is-open");
        E.wrap.setAttribute("aria-hidden","false");
      }
      setTimeout(() => E.name?.focus?.(), 50);
    },

    closeModal(){
      const E = this._ensureModal();
      if(E.wrap){
        E.wrap.classList.remove("is-open");
        E.wrap.setAttribute("aria-hidden","true");
      }
    },

    _showErr(el, msg){
      if(!el) return;
      el.textContent = String(msg || "");
      el.style.display = msg ? "block" : "none";
    },

    async _saveFromModal(){
      const E = this._ensureModal();
      const name = safeTrim(E.name?.value);
      const username = safeTrim(E.username?.value) || name;
      const pin = safeTrim(E.pin?.value);
      const birthDate = safeTrim(E.birthDate?.value);
      const role = safeTrim(E.role?.value) || "agent";
      const active = !!E.active?.checked;

      // validate
      let ok = true;
      this._showErr(E.nameErr, name ? "" : "נא להזין שם");
      this._showErr(E.userErr, username ? "" : "נא להזין שם משתמש");
      this._showErr(E.pinErr, pin ? "" : "נא להזין PIN");
      this._showErr(E.birthDateErr, birthDate ? "" : "נא להזין תאריך לידה");
      if(!name || !username || !pin || !birthDate) ok = false;

      if(!ok){
        this._showErr(E.err, "חסרים שדות חובה");
        return;
      }
      this._showErr(E.err, "");

      State.data.agents = Array.isArray(State.data.agents) ? State.data.agents : [];

      const id = safeTrim(E.id?.value);
      const isEdit = (this._modalMode === "edit") && id;
      if(isEdit){
        const a = State.data.agents.find(x => String(x.id) === String(id));
        if(!a){
          this._showErr(E.err, "המשתמש לא נמצא");
          return;
        }
        a.name = name;
        a.username = username;
        a.pin = pin;
        a.birthDate = birthDate;
        a.role = (role === "manager" ? "manager" : role === "ops" ? "ops" : "agent");
        a.active = active;
        State.data.meta.updatedAt = nowISO();
        await App.persist("עודכן משתמש");
      } else {
        const newId = "a_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);
        State.data.agents.push({
          id: newId,
          name,
          username,
          pin,
          birthDate,
          role: (role === "manager" ? "manager" : role === "ops" ? "ops" : "agent"),
          active: true
        });
        State.data.meta.updatedAt = nowISO();
        await App.persist("נשמר משתמש חדש");
      }

      this.closeModal();
      this.render();
    },

    _filtered(){
      const q = safeTrim(UI.els.usersSearch?.value).toLowerCase();
      const f = safeTrim(UI.els.usersFilter?.value) || "all";
      let arr = Array.isArray(State.data?.agents) ? State.data.agents.slice() : [];
      if (f === "active") arr = arr.filter(a => a.active !== false);
      if (f === "disabled") arr = arr.filter(a => a.active === false);
      if (q) {
        arr = arr.filter(a =>
          safeTrim(a.name).toLowerCase().includes(q) ||
          safeTrim(a.username).toLowerCase().includes(q)
        );
      }
      return arr;
    },

    render(){
      if(this.els.resultsBadge && !this.lastResults.length && !safeTrim(this.els.input?.value)){
        this.els.resultsBadge.textContent = '0 תוצאות';
      }
      const rec = this.current();
      this.updateSteps(rec);
      if(this.els.heroMeta){
        this.els.heroMeta.textContent = rec ? `שיקוף פעיל · ${rec.fullName || 'לקוח'} · ${rec.phone || rec.idNumber || '—'}` : 'טרם נבחר לקוח לשיקוף';
      }
      if(this.els.openBtn){
        this.els.openBtn.textContent = rec ? '🔍 איתור לקוח חדש' : '🔍 איתור לקוח לשיקוף';
      }
      if(!rec){
        this.closeStartModal();
        this.stopTimerLoop();
        if(this.els.empty) this.els.empty.style.display = '';
        if(this.els.flow) this.els.flow.style.display = 'none';
        if(this.els.reflectCard){ this.els.reflectCard.style.display = 'none'; this.els.reflectCard.innerHTML = ''; }
        if(this.els.cancelCard){ this.els.cancelCard.style.display = 'none'; this.els.cancelCard.innerHTML = ''; }
        if(this.els.disclosureCard){ this.els.disclosureCard.style.display = 'none'; this.els.disclosureCard.innerHTML = ''; }
        if(this.els.healthCard){ this.els.healthCard.style.display = 'none'; this.els.healthCard.innerHTML = ''; }
        if(this.els.paymentCard){ this.els.paymentCard.style.display = 'none'; this.els.paymentCard.innerHTML = ''; }
        if(this.els.issuanceCard){ this.els.issuanceCard.style.display = 'none'; this.els.issuanceCard.innerHTML = ''; }
        if(this.els.verifyCard){ this.els.verifyCard.style.display = 'none'; this.els.verifyCard.innerHTML = ''; }
        if(this.els.scriptCard) this.els.scriptCard.innerHTML = '';
        if(this.els.customerHero) this.els.customerHero.innerHTML = '';
        if(this.els.wizardNav){ this.els.wizardNav.style.display = 'none'; this.els.wizardNav.innerHTML = ''; }
        this.applyWizardVisibility(null);
        return;
      }
      if(this.els.empty) this.els.empty.style.display = 'none';
      if(this.els.flow) this.els.flow.style.display = 'grid';
      this.renderCallBar();
      const call = this.getCallState(rec);
      const isLiveCall = !!(call.active && call.startedAt && call.runtimeSessionId === this.runtimeSessionId);
      if(isLiveCall) this.startTimerLoop(); else this.stopTimerLoop();
      this.renderCustomerHero(rec);
      this.renderScript(rec);
      if(this.els.reflectCard){ this.els.reflectCard.style.display = 'none'; this.els.reflectCard.innerHTML = ''; }
      if(this.els.cancelCard){ this.els.cancelCard.style.display = 'none'; this.els.cancelCard.innerHTML = ''; }
      if(this.els.disclosureCard){ this.els.disclosureCard.style.display = 'none'; this.els.disclosureCard.innerHTML = ''; }
      if(this.els.healthCard){ this.els.healthCard.style.display = 'none'; this.els.healthCard.innerHTML = ''; }
      if(this.els.paymentCard){ this.els.paymentCard.style.display = 'none'; this.els.paymentCard.innerHTML = ''; }
      if(this.els.issuanceCard){ this.els.issuanceCard.style.display = 'none'; this.els.issuanceCard.innerHTML = ''; }
      if(this.els.verifyCard){ this.els.verifyCard.style.display = 'none'; this.els.verifyCard.innerHTML = ''; }
      if(this.els.wizardNav){ this.els.wizardNav.style.display = 'none'; this.els.wizardNav.innerHTML = ''; }
      this.applyWizardVisibility(null);
    },

    updateSteps(_rec){
      (this.els.steps || []).forEach(el => {
        el.classList.remove('is-active', 'is-done', 'is-available');
      });
    },

    getPrimary(rec){
      const payload = rec?.payload || {};
      const insureds = Array.isArray(payload.insureds) ? payload.insureds : (Array.isArray(payload?.operational?.insureds) ? payload.operational.insureds : []);
      return payload.primary || insureds?.[0]?.data || {};
    },

    getInsureds(rec){
      const payload = rec?.payload || {};
      return Array.isArray(payload.insureds) ? payload.insureds : (Array.isArray(payload?.operational?.insureds) ? payload.operational.insureds : []);
    },

    getNewPolicies(rec){
      const payload = rec?.payload || {};
      return Array.isArray(payload.newPolicies) && payload.newPolicies.length
        ? payload.newPolicies
        : (Array.isArray(payload?.operational?.newPolicies) ? payload.operational.newPolicies : []);
    },

    getCompanyNames(rec){
      const names = this.getNewPolicies(rec).map(p => safeTrim(p?.company)).filter(Boolean);
      return [...new Set(names)];
    },

    getCompanyLogo(company){
      try{
        if(typeof Wizard?.getCompanyLogoSrc === 'function') return Wizard.getCompanyLogoSrc(company) || '';
      }catch(_e){}
      return '';
    },

    getVerifyState(rec){
      if(!rec.payload || typeof rec.payload !== 'object') rec.payload = {};
      if(!rec.payload.mirrorFlow || typeof rec.payload.mirrorFlow !== 'object') rec.payload.mirrorFlow = {};
      if(!rec.payload.mirrorFlow.verify || typeof rec.payload.mirrorFlow.verify !== 'object') rec.payload.mirrorFlow.verify = {};
      const store = rec.payload.mirrorFlow.verify;
      if(!Array.isArray(store.smokingProducts)) store.smokingProducts = [];
      if(!safeTrim(store.deliveryEmail)) store.deliveryEmail = safeTrim(rec.email) || safeTrim(this.getPrimary(rec)?.email);
      if(!safeTrim(store.cancelMode)) store.cancelMode = '';
      if(typeof store.cancelStageOpened !== 'boolean') store.cancelStageOpened = false;
      if(typeof store.editMode !== 'boolean') store.editMode = false;
      if(!store.editedData || typeof store.editedData !== 'object') store.editedData = {};
      return store;
    },

    getVerifyEditableData(rec){
      const primary = this.getPrimary(rec);
      return {
        fullName: this.getFullName(rec, primary),
        idNumber: safeTrim(rec?.idNumber) || safeTrim(primary?.idNumber),
        birthDate: safeTrim(primary?.birthDate),
        maritalStatus: safeTrim(primary?.maritalStatus || primary?.familyStatus),
        childrenText: this.getChildrenText(rec, primary),
        occupation: safeTrim(primary?.occupation),
        clinic: safeTrim(primary?.clinic || primary?.hmo || primary?.kupatHolim),
        shaban: safeTrim(primary?.shaban || primary?.shabanLevel),
        street: safeTrim(primary?.street),
        houseNumber: safeTrim(primary?.houseNumber),
        city: safeTrim(primary?.city || rec?.city),
        zip: safeTrim(primary?.zip)
      };
    },

    syncVerifyEditedData(rec){
      const store = this.getVerifyState(rec);
      const base = this.getVerifyEditableData(rec);
      store.editedData = { ...base, ...(store.editedData || {}) };
      return store.editedData;
    },

    setVerifyEditMode(rec, isEdit){
      const store = this.getVerifyState(rec);
      if(isEdit) this.syncVerifyEditedData(rec);
      store.editMode = !!isEdit;
      this.render();
    },

    updateVerifyEditedField(rec, field, value){
      const store = this.getVerifyState(rec);
      this.syncVerifyEditedData(rec);
      store.editedData[field] = safeTrim(value);
    },

    getVerifyInfoCards(rec){
      const store = this.getVerifyState(rec);
      const data = this.syncVerifyEditedData(rec);
      const addressText = this.getAddressText(data);
      return [
        ['שם מלא', data.fullName],
        ['תעודת זהות', data.idNumber],
        ['תאריך לידה', data.birthDate],
        ['מצב משפחתי', data.maritalStatus],
        ['האם יש ילדים', data.childrenText],
        ['עיסוק נוכחי', data.occupation],
        ['קופת חולים ושב״ן', [safeTrim(data.clinic), safeTrim(data.shaban)].filter(Boolean).join(' · ')],
        ['כתובת למשלוח הפוליסה', addressText || '—']
      ];
    },

    applyVerificationEdits(rec){
      const primary = this.getPrimary(rec);
      const insureds = this.getInsureds(rec);
      const firstInsured = insureds[0]?.data && typeof insureds[0].data === 'object' ? insureds[0].data : null;
      const store = this.getVerifyState(rec);
      const data = this.syncVerifyEditedData(rec);
      const assign = (obj, key, value) => { if(obj && typeof obj === 'object') obj[key] = value; };
      const fullName = safeTrim(data.fullName);
      const nameParts = fullName.split(/\s+/).filter(Boolean);
      const firstName = nameParts.shift() || '';
      const lastName = nameParts.join(' ');
      rec.fullName = fullName || rec.fullName;
      rec.idNumber = safeTrim(data.idNumber) || rec.idNumber;
      rec.city = safeTrim(data.city) || rec.city;
      assign(primary, 'firstName', firstName);
      assign(primary, 'lastName', lastName);
      assign(primary, 'idNumber', safeTrim(data.idNumber));
      assign(primary, 'birthDate', safeTrim(data.birthDate));
      assign(primary, 'maritalStatus', safeTrim(data.maritalStatus));
      assign(primary, 'familyStatus', safeTrim(data.maritalStatus));
      assign(primary, 'occupation', safeTrim(data.occupation));
      assign(primary, 'clinic', safeTrim(data.clinic));
      assign(primary, 'hmo', safeTrim(data.clinic));
      assign(primary, 'kupatHolim', safeTrim(data.clinic));
      assign(primary, 'shaban', safeTrim(data.shaban));
      assign(primary, 'shabanLevel', safeTrim(data.shaban));
      assign(primary, 'street', safeTrim(data.street));
      assign(primary, 'houseNumber', safeTrim(data.houseNumber));
      assign(primary, 'city', safeTrim(data.city));
      assign(primary, 'zip', safeTrim(data.zip));
      assign(primary, 'childrenCount', safeTrim(data.childrenText));
      assign(primary, 'children', safeTrim(data.childrenText));
      assign(primary, 'hasChildren', safeTrim(data.childrenText));
      if(firstInsured){
        Object.assign(firstInsured, {
          firstName,
          lastName,
          idNumber: safeTrim(data.idNumber),
          birthDate: safeTrim(data.birthDate),
          maritalStatus: safeTrim(data.maritalStatus),
          familyStatus: safeTrim(data.maritalStatus),
          occupation: safeTrim(data.occupation),
          clinic: safeTrim(data.clinic),
          hmo: safeTrim(data.clinic),
          kupatHolim: safeTrim(data.clinic),
          shaban: safeTrim(data.shaban),
          shabanLevel: safeTrim(data.shaban),
          street: safeTrim(data.street),
          houseNumber: safeTrim(data.houseNumber),
          city: safeTrim(data.city),
          zip: safeTrim(data.zip),
          childrenCount: safeTrim(data.childrenText),
          children: safeTrim(data.childrenText),
          hasChildren: safeTrim(data.childrenText)
        });
      }
      if(rec.payload && typeof rec.payload === 'object'){
        if(!rec.payload.primary || typeof rec.payload.primary !== 'object') rec.payload.primary = primary;
        if(!rec.payload.operational || typeof rec.payload.operational !== 'object') rec.payload.operational = {};
        if(firstInsured){
          if(!Array.isArray(rec.payload.operational.insureds)) rec.payload.operational.insureds = insureds;
        }
      }
      store.editsSavedAt = nowISO();
      store.editsSavedBy = safeTrim(Auth?.current?.name);
      store.editMode = false;
    },

    renderVerifyInfoSection(rec){
      const store = this.getVerifyState(rec);
      const data = this.syncVerifyEditedData(rec);
      const savedNote = safeTrim(store.editsSavedAt)
        ? `<div class="mirrorsVerifySaved">השינויים נשמרו בתאריך ${escapeHtml(this.formatDate(store.editsSavedAt))}${safeTrim(store.editsSavedBy) ? ` · על ידי ${escapeHtml(store.editsSavedBy)}` : ''}</div>`
        : '';
      if(!store.editMode){
        const cards = this.getVerifyInfoCards(rec);
        return `<div class="mirrorsVerifyTop">
          <div class="mirrorsPromptBar">ברשותך אשאל אותך מספר שאלות:</div>
          <div class="mirrorsVerifyActions">
            <button class="btn" data-mirror-verify-edit type="button">ערוך נתונים</button>
          </div>
        </div>
        <div class="mirrorsVerifyGrid mirrorsVerifyGrid--wide">${cards.map(([label, value]) => `<div class="mirrorsInfoCard"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || '—')}</strong></div>`).join('')}</div>${savedNote}`;
      }
      const maritalOptions = ['', 'רווק/ה', 'נשוי/אה', 'גרוש/ה', 'אלמן/ה', 'ידוע/ה בציבור'];
      return `<div class="mirrorsVerifyTop">
        <div class="mirrorsPromptBar">ברשותך אשאל אותך מספר שאלות:</div>
        <div class="mirrorsVerifyActions">
          <button class="btn" data-mirror-verify-cancel type="button">ביטול</button>
        </div>
      </div>
      <div class="mirrorsEditGrid">
        <label class="field"><span class="label">שם מלא</span><input class="input" data-mirror-edit-field="fullName" type="text" value="${escapeHtml(data.fullName || '')}" /></label>
        <label class="field"><span class="label">תעודת זהות</span><input class="input" data-mirror-edit-field="idNumber" type="text" inputmode="numeric" value="${escapeHtml(data.idNumber || '')}" /></label>
        <label class="field"><span class="label">תאריך לידה</span><input class="input" data-mirror-edit-field="birthDate" type="text" value="${escapeHtml(data.birthDate || '')}" placeholder="dd/mm/yyyy" /></label>
        <label class="field"><span class="label">מצב משפחתי</span><select class="input" data-mirror-edit-field="maritalStatus">${maritalOptions.map(option => `<option value="${escapeHtml(option)}" ${data.maritalStatus === option ? 'selected' : ''}>${escapeHtml(option || 'בחר מצב')}</option>`).join('')}</select></label>
        <label class="field"><span class="label">האם יש ילדים</span><input class="input" data-mirror-edit-field="childrenText" type="text" value="${escapeHtml(data.childrenText || '')}" placeholder="כן / לא / מספר ילדים" /></label>
        <label class="field"><span class="label">עיסוק נוכחי</span><input class="input" data-mirror-edit-field="occupation" type="text" value="${escapeHtml(data.occupation || '')}" /></label>
        <label class="field"><span class="label">קופת חולים</span><input class="input" data-mirror-edit-field="clinic" type="text" value="${escapeHtml(data.clinic || '')}" /></label>
        <label class="field"><span class="label">שב״ן</span><input class="input" data-mirror-edit-field="shaban" type="text" value="${escapeHtml(data.shaban || '')}" /></label>
        <label class="field"><span class="label">רחוב</span><input class="input" data-mirror-edit-field="street" type="text" value="${escapeHtml(data.street || '')}" /></label>
        <label class="field"><span class="label">מספר בית</span><input class="input" data-mirror-edit-field="houseNumber" type="text" value="${escapeHtml(data.houseNumber || '')}" /></label>
        <label class="field"><span class="label">עיר</span><input class="input" data-mirror-edit-field="city" type="text" value="${escapeHtml(data.city || '')}" /></label>
        <label class="field"><span class="label">מיקוד</span><input class="input" data-mirror-edit-field="zip" type="text" inputmode="numeric" value="${escapeHtml(data.zip || '')}" /></label>
      </div>
      <div class="mirrorsContinueBar mirrorsContinueBar--edit">
        <button class="btn btn--primary" data-mirror-save-edits type="button">שמור שינויים</button>
      </div>${savedNote}`;
    },

    getFullName(rec, primary){
      return safeTrim(rec?.fullName) || `${safeTrim(primary?.firstName)} ${safeTrim(primary?.lastName)}`.trim() || '—';
    },

    getAddressText(primary){
      const street = safeTrim(primary?.street);
      const house = safeTrim(primary?.houseNumber);
      const city = safeTrim(primary?.city);
      const zip = safeTrim(primary?.zip);
      const parts = [];
      const streetPart = [street, house].filter(Boolean).join(' ');
      if(streetPart) parts.push(streetPart);
      if(city) parts.push(city);
      if(zip) parts.push(`מיקוד ${zip}`);
      return parts.join(' · ');
    },

    getChildrenText(rec, primary){
      const insureds = this.getInsureds(rec);
      const childCount = insureds.filter(ins => safeTrim(ins?.type) === 'child').length;
      if(childCount > 0) return `כן, ${childCount} ילדים`;
      const raw = primary?.childrenCount ?? primary?.children ?? primary?.hasChildren;
      if(raw === true) return 'כן';
      if(raw === false) return 'לא';
      const txt = safeTrim(raw);
      if(!txt) return 'לא';
      if(txt === '0') return 'לא';
      return txt;
    },

    getClinicText(primary){
      const clinic = safeTrim(primary?.clinic || primary?.hmo || primary?.kupatHolim);
      const shaban = safeTrim(primary?.shaban || primary?.shabanLevel);
      return [clinic, shaban].filter(Boolean).join(' · ') || '—';
    },

    getEmailValue(rec, primary, store){
      return safeTrim(store?.deliveryEmail) || safeTrim(rec?.email) || safeTrim(primary?.email);
    },

    setCustomerEmail(rec, email){
      const clean = safeTrim(email);
      rec.email = clean;
      if(rec.payload && typeof rec.payload === 'object'){
        if(rec.payload.primary && typeof rec.payload.primary === 'object') rec.payload.primary.email = clean;
        const insureds = this.getInsureds(rec);
        if(insureds[0]?.data && typeof insureds[0].data === 'object') insureds[0].data.email = clean;
      }
    },

    getInsuredLabel(ins, index){
      const type = safeTrim(ins?.type);
      if(type === 'primary') return 'מבוטח ראשי';
      if(type === 'spouse' || type === 'secondary') return 'מבוטח משני';
      if(type === 'adult') return 'בגיר';
      if(type === 'child') return 'קטין';
      return index === 0 ? 'מבוטח ראשי' : 'מבוטח נוסף';
    },

    getInsuredDisplayName(ins, index){
      const data = ins?.data || {};
      const fullName = `${safeTrim(data.firstName)} ${safeTrim(data.lastName)}`.trim();
      return fullName || this.getInsuredLabel(ins, index);
    },

    getExistingPolicies(rec){
      const insureds = this.getInsureds(rec);
      const out = [];
      insureds.forEach((ins, insuredIndex) => {
        const data = ins?.data || {};
        const rows = Array.isArray(data.existingPolicies) ? data.existingPolicies : [];
        const cancellations = data?.cancellations || {};
        rows.forEach((policy, policyIndex) => {
          const policyId = safeTrim(policy?.id);
          if(policyId && !cancellations[policyId]) cancellations[policyId] = {};
          out.push({
            policy,
            cancellation: policyId ? cancellations[policyId] : {},
            insuredIndex,
            policyIndex,
            insuredLabel: this.getInsuredLabel(ins, insuredIndex),
            insuredName: this.getInsuredDisplayName(ins, insuredIndex)
          });
        });
      });
      return out;
    },

    getPolicyAmountLabel(policy){
      const type = safeTrim(policy?.type);
      if(type === 'בריאות') return 'כיסויים';
      if(type === 'מחלות קשות' || type === 'סרטן') return 'סכום פיצוי';
      return 'סכום ביטוח';
    },

    getPolicyAmountValue(policy){
      const type = safeTrim(policy?.type);
      if(type === 'בריאות'){
        const covers = Array.isArray(policy?.covers) ? policy.covers.filter(Boolean) : [];
        return covers.length ? covers.join(' • ') : '—';
      }
      return safeTrim(policy?.sumInsured || policy?.compensation || policy?.coverageAmount || policy?.coverage || policy?.sum || '');
    },

    getCancellationStatusOptions(){
      return [
        { value: '', label: 'בחר סטטוס' },
        { value: 'full', label: 'ביטול מלא' },
        { value: 'partial_health', label: 'ביטול חלקי' },
        { value: 'agent_appoint', label: 'מינוי סוכן' },
        { value: 'nochange_client', label: 'ללא שינוי – לבקשת הלקוח' },
        { value: 'nochange_collective', label: 'ללא שינוי – קולקטיב' }
      ];
    },

    getPolicyStatusValue(policy, cancellation){
      const raw = safeTrim(cancellation?.status || policy?.status || policy?.policyStatus || policy?.state || '');
      const map = {
        full: 'ביטול מלא',
        partial_health: 'ביטול חלקי',
        agent_appoint: 'מינוי סוכן',
        nochange_client: 'ללא שינוי – לבקשת הלקוח',
        nochange_collective: 'ללא שינוי – קולקטיב'
      };
      return map[raw] || raw || 'טרם הוזן';
    },

    async openReflection(){
      const ok = await this.saveVerification({ silent: true, openReflection: true });
      if(!ok) return;
      const rec = this.current();
      if(!rec) return;
      const store = this.getVerifyState(rec);
      store.reflectionOpened = true;
      this.setFocusStep(rec, 4);
      this.render();
    },

    renderCustomerHero(rec){
      if(!this.els.customerHero) return;
      const primary = this.getPrimary(rec);
      const insureds = this.getInsureds(rec);
      const call = this.getCallState(rec);
      const inCall = !!(call?.active && call?.startedAt && call?.runtimeSessionId === this.runtimeSessionId);
      const insuredChips = insureds.length
        ? insureds.map((ins, idx) => `<span class="mirrorsInsuredChip">
            <span class="mirrorsInsuredChip__label">${escapeHtml(this.getInsuredLabel(ins, idx))}</span>
            <strong>${escapeHtml(this.getInsuredDisplayName(ins, idx))}</strong>
          </span>`).join('')
        : `<span class="mirrorsInsuredChip mirrorsInsuredChip--muted">לא נמצאו מבוטחים משויכים</span>`;
      this.els.customerHero.innerHTML = `<div class="mirrorsPremiumHero">
        <div class="mirrorsPremiumHero__glow mirrorsPremiumHero__glow--a"></div>
        <div class="mirrorsPremiumHero__glow mirrorsPremiumHero__glow--b"></div>
        <div class="mirrorsPremiumHero__main">
          <div class="mirrorsPremiumHero__eyebrow">מסך פתיחה לשיקוף</div>
          <div class="mirrorsPremiumHero__name">${escapeHtml(rec.fullName || 'לקוח')}</div>
          <div class="mirrorsPremiumHero__meta">
            <span>ת״ז ${escapeHtml(rec.idNumber || primary.idNumber || '—')}</span>
            <span>טלפון ${escapeHtml(rec.phone || primary.phone || '—')}</span>
            <span>נציג מטפל ${escapeHtml(rec.agentName || '—')}</span>
          </div>
          <div class="mirrorsPremiumHero__insuredsTitle">מי המבוטחים</div>
          <div class="mirrorsPremiumHero__insureds">${insuredChips}</div>
        </div>
        <div class="mirrorsPremiumHero__side">
          <div class="mirrorsPremiumStatusCard">
            <div class="mirrorsPremiumStatusCard__label">סטטוס שיחה</div>
            <div class="mirrorsPremiumStatusCard__value">${inCall ? 'בשיחה פעילה' : 'ממתין למענה'}</div>
            <div class="mirrorsPremiumStatusCard__sub">${inCall ? `הטיימר החל ב־${escapeHtml(call.startTime || this.formatClock(call.startedAt))}` : 'לחץ על הכפתור כשהלקוח ענה לשיחה'}</div>
          </div>
        </div>
      </div>`;
    },

    renderScript(rec){
      if(!this.els.scriptCard) return;
      const call = this.getCallState(rec);
      const inCall = !!(call?.active && call?.startedAt && call?.runtimeSessionId === this.runtimeSessionId);
      const opsName = safeTrim(Auth?.current?.name) || 'נציג תפעול';
      const companies = this.getCompanyNames(rec);
      const companyText = companies.length ? companies.join(' , ') : 'החברות שסומנו בהקמת הלקוח';
      const companyChips = companies.length
        ? companies.map(company => `<span class="mirrorsMiniCompanyChip">${escapeHtml(company)}</span>`).join('')
        : `<span class="mirrorsMiniCompanyChip mirrorsMiniCompanyChip--muted">אין עדיין חברות בפוליסות חדשות</span>`;
      const introHtml = !inCall ? '' : `<div class="mirrorsIntroScript">
            <div class="mirrorsIntroScript__line">שלום, אני מדבר/ת עם: <strong>${escapeHtml(rec.fullName || 'לקוח')}</strong></div>
            <div class="mirrorsIntroScript__line">מדבר/ת: <strong>${escapeHtml(opsName)}</strong></div>
            <div class="mirrorsIntroScript__line">המשך השיחה, ואני נציג מטעם סוכן גרגורי, משווקת הביטוחים של חברת <strong>${escapeHtml(companyText)}</strong>.</div>
            <div class="mirrorsIntroScript__line">מה שלומך?</div>
            <div class="mirrorsIntroScript__alert">אני מציין/נת בפנייך שזוהי שיחת מכירה מוקלטת עבור חברת הביטוח האם אפשר להמשיך בשיחה ?</div>
          </div>`;
      this.els.scriptCard.innerHTML = `<div class="mirrorsPhoneStage${inCall ? ' is-inCall' : ' is-waiting'}">
          <div class="mirrorsPhoneStage__top">
            <div>
              <div class="mirrorsPhoneStage__kicker">פתיח שיחת שיקוף</div>
              <div class="mirrorsPhoneStage__title">${inCall ? 'השיחה התחילה — אפשר להתחיל להקריא' : 'ממתינים למענה מהלקוח'}</div>
              <div class="mirrorsPhoneStage__sub">${inCall ? 'האייקון עבר למצב האזנה פעילה והטיימר רץ גם בתיק הלקוח.' : 'ברגע שהלקוח ענה לחץ על הכפתור כדי להתחיל את השיחה והטיימר.'}</div>
            </div>
            <div class="mirrorsPhoneStage__companies">${companyChips}</div>
          </div>
          <div class="mirrorsPhoneStage__body">
            <div class="mirrorsPhoneGlass ${inCall ? 'is-inCall' : 'is-ringing'}" aria-hidden="true">
              <div class="mirrorsPhoneGlass__halo"></div>
              <div class="mirrorsPhoneGlass__halo mirrorsPhoneGlass__halo--inner"></div>
              <div class="mirrorsPhoneGlass__shell">
                <svg class="mirrorsPhoneGlass__icon" viewBox="0 0 80 80" fill="none">
                  <defs>
                    <linearGradient id="mirrorPhoneFill" x1="14" y1="10" x2="68" y2="72" gradientUnits="userSpaceOnUse">
                      <stop stop-color="#ffffff"/>
                      <stop offset="0.45" stop-color="#dcecff"/>
                      <stop offset="1" stop-color="#7cb0ff"/>
                    </linearGradient>
                    <linearGradient id="mirrorPhoneStroke" x1="18" y1="14" x2="60" y2="68" gradientUnits="userSpaceOnUse">
                      <stop stop-color="#f8fbff"/>
                      <stop offset="1" stop-color="#2f63c9"/>
                    </linearGradient>
                  </defs>
                  <path class="mirrorsPhoneGlass__receiver" d="M25.12 18.75c2.1-1.65 5.15-1.46 7.06.45l5.53 5.53c1.61 1.61 1.98 4.07.9 6.08l-2.53 4.71c-.48.89-.39 1.99.25 2.78 3.53 4.39 7.54 8.39 11.92 11.92.79.64 1.89.73 2.78.25l4.71-2.53c2.01-1.08 4.47-.71 6.08.9l5.53 5.53c1.91 1.91 2.1 4.96.45 7.06l-2.03 2.58c-1.78 2.27-4.7 3.25-7.49 2.53-8.27-2.14-16.15-7-23.09-13.95C29.07 46.56 24.22 38.68 22.08 30.41c-.72-2.79.26-5.71 2.53-7.49l2.58-2.03Z" fill="url(#mirrorPhoneFill)" stroke="url(#mirrorPhoneStroke)" stroke-width="2.5" />
                  <path class="mirrorsPhoneGlass__shine" d="M29 24.5c2.48 5.37 6.17 10.34 11.08 15.25 4.79 4.79 9.68 8.43 14.93 10.88" stroke="rgba(255,255,255,0.78)" stroke-width="3.1" stroke-linecap="round"/>
                </svg>
              </div>
              <div class="mirrorsPhoneGlass__caption">${inCall ? 'הלקוח על הקו' : 'הטלפון מחייג'}</div>
            </div>
            <div class="mirrorsPhoneStage__content">
              <div class="mirrorsPhoneStage__ctaWrap">
                <button class="btn btn--primary mirrorsPhoneStage__cta" data-mirror-start-call type="button" ${inCall ? 'disabled' : ''}>הלקוח ענה התחל שיחת שיקוף</button>
                <div class="mirrorsPhoneStage__timerBox">
                  <span class="mirrorsPhoneStage__timerLabel">טיימר שיחה</span>
                  <strong class="mirrorsPhoneStage__timerValue">${inCall ? this.formatDuration(Math.max(0, Math.floor((Date.now() - new Date(call.startedAt).getTime()) / 1000))) : '00:00'}</strong>
                </div>
              </div>
              ${introHtml || `<div class="mirrorsIntroPlaceholder">
                  <div class="mirrorsIntroPlaceholder__title">הפתיח יופיע כאן מיד אחרי תחילת השיחה</div>
                  <div class="mirrorsIntroPlaceholder__text">שם הלקוח, שם הנציג, וסיכום החברות מהפוליסות החדשות בלבד יוצגו כאן אוטומטית.</div>
                </div>`}
            </div>
          </div>
        </div>`;
    },

    getFullName(rec, primary){
      if(!this.els.scriptCard) return;
      const opsName = safeTrim(Auth?.current?.name) || 'נציג תפעול';
      const companies = this.getCompanyNames(rec);
      const companyText = companies.length ? companies.join(', ') : 'החברות שסומנו בהקמת הלקוח';
      const sellingAgent = safeTrim(rec.agentName) || 'הנציג המטפל';
      const yesSelected = this.consent === 'yes';
      const noSelected = this.consent === 'no';
      this.els.scriptCard.innerHTML = `<div class="mirrorsCard__head">
          <div>
            <div class="mirrorsCard__title">נוסח חובה להקראה</div>
            <div class="mirrorsCard__hint">הקרא את הנוסח במלואו ושמור על השדות הדינמיים כפי שהמערכת מציגה אותם.</div>
          </div>
          <span class="mirrorsScriptTag">שיחת מכירה מוקלטת</span>
        </div>
        <div class="mirrorsScriptBody">
          <p>שלום מדבר <strong>${escapeHtml(opsName)}</strong>.</p>
          <p>ואני נציג מכירות מטעם סוכן גרגורי משווק הביטוחים של חברת <strong>${escapeHtml(companyText)}</strong>.</p>
          <p>אני יוצר איתך קשר בהמשך לפנייתך ולשיחתך עם הנציג <strong>${escapeHtml(sellingAgent)}</strong>.</p>
          <p>במטרה להציע לך לרכוש ביטוח. חשוב לי להדגיש בפניך שזוהי שיחת מכירה מוקלטת. האם אתה מאשר להמשיך בשיחה?</p>
        </div>
        <div class="mirrorsAnswerBox">
          <div class="mirrorsAnswerBox__title">מה הלקוח השיב?</div>
          <div class="mirrorsAnswerGrid">
            <button class="mirrorsAnswerCard mirrorsAnswerCard--yes${yesSelected ? ' is-selected' : ''}" data-mirror-answer="yes" type="button">
              <span class="mirrorsAnswerCard__icon">✓</span>
              <strong>כן, הלקוח אישר</strong>
              <small>המשך ישיר לשלב אימות נתונים</small>
            </button>
            <button class="mirrorsAnswerCard mirrorsAnswerCard--no${noSelected ? ' is-selected' : ''}" data-mirror-answer="no" type="button">
              <span class="mirrorsAnswerCard__icon">✕</span>
              <strong>לא, הלקוח לא אישר</strong>
              <small>ניתן לסיים כאן ולהמשיך ללקוח הבא</small>
            </button>
          </div>
          ${noSelected ? `<div class="mirrorsDeclinedNote">הלקוח לא אישר המשך שיחה. לא נפתח שלב אימות הנתונים.</div>` : ``}
        </div>`;
    },

    renderVerification(rec){
      if(!this.els.verifyCard) return;
      if(this.consent !== 'yes'){
        this.els.verifyCard.style.display = 'none';
        this.els.verifyCard.innerHTML = '';
        return;
      }
      this.els.verifyCard.style.display = 'block';
      const primary = this.getPrimary(rec);
      const store = this.getVerifyState(rec);
      const smokingAnswer = safeTrim(store.smokingAnswer);
      const deliveryMethod = safeTrim(store.deliveryMethod);
      const addressText = this.getAddressText(primary);
      const emailValue = this.getEmailValue(rec, primary, store);
      const smokingOptions = ['סיגריות','טבק','אלקטרוניות','נרגילה','קנאביס','מוצרי טבק אחרים'];
      this.els.verifyCard.innerHTML = `<div class="mirrorsCard__head">
          <div>
            <div class="mirrorsCard__title">אימות נתוני לקוח</div>
            <div class="mirrorsCard__hint">ברשותך אשאל אותך מספר שאלות. אמת מול הלקוח את הנתונים הבאים, השלם תשובות חסרות ושמור את שלב האימות.</div>
          </div>
          <span class="mirrorsVerifyBadge">שלב המשך שיחה</span>
        </div>

        ${this.renderVerifyInfoSection(rec)}

        <div class="mirrorsFormBlock">
          <div class="mirrorsFormBlock__title">שאלת עישון</div>
          <div class="mirrorsFormBlock__hint">האם אתה מעשן או עישנת בשנתיים האחרונות? סיגריות, טבק, אלקטרוניות, נרגילה, קנאביס או מוצרי טבק אחרים.</div>
          <div class="mirrorsChoiceGrid mirrorsChoiceGrid--smoke">
            <button class="mirrorsMiniChoice${smokingAnswer === 'yes' ? ' is-selected' : ''}" data-mirror-smoking="yes" type="button">כן</button>
            <button class="mirrorsMiniChoice${smokingAnswer === 'no' ? ' is-selected' : ''}" data-mirror-smoking="no" type="button">לא</button>
          </div>
          ${smokingAnswer === 'yes' ? `
            <div class="mirrorsSmokeBox">
              <div class="mirrorsSmokeBox__title">סמן איזה מוצר הלקוח מעשן</div>
              <div class="mirrorsSmokeProducts">${smokingOptions.map(option => {
                const checked = (store.smokingProducts || []).includes(option);
                return `<label class="mirrorsCheckTag${checked ? ' is-selected' : ''}"><input data-mirror-smoke-product type="checkbox" value="${escapeHtml(option)}" ${checked ? 'checked' : ''} /><span>${escapeHtml(option)}</span></label>`;
              }).join('')}</div>
              <div class="field mirrorsInlineField">
                <label class="label">כמות</label>
                <input class="input" data-mirror-smoke-qty type="text" value="${escapeHtml(store.smokingQuantity || '')}" placeholder="לדוגמה: 10 סיגריות ביום" />
              </div>
            </div>
          ` : ''}
        </div>

        <div class="mirrorsFormBlock">
          <div class="mirrorsFormBlock__title">אופן קבלת דיוורים</div>
          <div class="mirrorsFormBlock__hint">שאל את הלקוח איך ירצה לקבל את הדיוורים: לבית או למייל.</div>
          <div class="mirrorsChoiceGrid">
            <button class="mirrorsMiniChoice${deliveryMethod === 'home' ? ' is-selected' : ''}" data-mirror-delivery="home" type="button">לבית</button>
            <button class="mirrorsMiniChoice${deliveryMethod === 'email' ? ' is-selected' : ''}" data-mirror-delivery="email" type="button">למייל</button>
          </div>
          ${deliveryMethod === 'home' ? `<div class="mirrorsDeliveryNote">הפוליסה תישלח לכתובת: <strong>${escapeHtml(addressText || 'לא הוזנה כתובת במערכת')}</strong></div>` : ''}
          ${deliveryMethod === 'email' ? `<div class="mirrorsEmailBox">
            <div class="mirrorsDeliveryNote">כתובת המייל לשילוח</div>
            <input class="input mirrorsMailInput" data-mirror-email type="email" dir="ltr" value="${escapeHtml(emailValue || '')}" placeholder="name@example.com" />
            <div class="help">אם אין מייל במערכת, הזן כאן את כתובת המייל שהלקוח מסר בשיחה. השמירה תעדכן גם את פרטי הלקוח.</div>
          </div>` : ''}
        </div>

        <div class="mirrorsContinueBar">
          <button class="btn btn--primary" data-mirror-open-reflection type="button">המשך</button>
        </div>`;
    },

    async saveVerification(options = {}){
      const rec = this.current();
      if(!rec) return false;
      const primary = this.getPrimary(rec);
      const store = this.getVerifyState(rec);
      const smokingAnswer = safeTrim(store.smokingAnswer);
      const deliveryMethod = safeTrim(store.deliveryMethod);
      if(!smokingAnswer) {
        alert('יש לסמן האם הלקוח מעשן או עישן בשנתיים האחרונות.');
        return false;
      }
      if(smokingAnswer === 'yes'){
        if(!Array.isArray(store.smokingProducts) || !store.smokingProducts.length){
          alert('יש לסמן לפחות מוצר עישון אחד.');
          return false;
        }
        if(!safeTrim(store.smokingQuantity)){
          alert('יש למלא כמות עישון.');
          return false;
        }
      }
      if(!deliveryMethod){
        alert('יש לבחור איך הלקוח רוצה לקבל את הדיוורים.');
        return false;
      }
      if(deliveryMethod === 'email'){
        const email = this.getEmailValue(rec, primary, store);
        if(!email){
          alert('יש להזין כתובת מייל עבור הלקוח.');
          return false;
        }
        if(!/^\S+@\S+\.\S+$/.test(email)){
          alert('כתובת המייל אינה תקינה.');
          return false;
        }
        store.deliveryEmail = email;
        this.setCustomerEmail(rec, email);
      }
      if(deliveryMethod === 'home'){
        store.deliveryEmail = this.getEmailValue(rec, primary, store);
      }
      store.savedAt = nowISO();
      store.savedBy = safeTrim(Auth?.current?.name);
      if(options.openReflection) store.reflectionOpened = true;
      State.data.meta.updatedAt = nowISO();
      rec.updatedAt = State.data.meta.updatedAt;
      const result = await App.persist('שיקוף נשמר');
      this.render();
      if(!options.silent){
        alert(options.openReflection ? 'שלב האימות נשמר ונפתח מסך שיקוף הר הביטוח.' : 'שלב אימות הנתונים נשמר בהצלחה.');
      }
      return !!result?.ok;
    },

    renderReflection(rec){
      if(!this.els.reflectCard) return;
      const store = this.getVerifyState(rec);
      if(this.consent !== 'yes' || !store.reflectionOpened){
        this.els.reflectCard.style.display = 'none';
        this.els.reflectCard.innerHTML = '';
        return;
      }
      this.els.reflectCard.style.display = 'block';
      const harConsent = safeTrim(store.harConsent);
      const policies = this.getExistingPolicies(rec);
      const newPolicies = this.getNewPolicies(rec);
      const summaryText = policies.length ? `נמצאו ${policies.length} פוליסות קיימות לשיקוף` : 'לא נמצאו פוליסות קיימות במערכת עבור הלקוח';
      this.els.reflectCard.innerHTML = `<div class="mirrorsCard__head">
          <div>
            <div class="mirrorsCard__title">שיקוף הר הביטוח</div>
            <div class="mirrorsCard__hint">מסך ההקראה הבא לנציג לאחר בחירת אופן קבלת הדיוורים. הפוליסות הקיימות מוצגות כאן כשורות מידע לקריאה בלבד, אחד־אחד, ולאחר מכן מוצגות הפוליסות החדשות שהמערכת מציעה למכירה.</div>
          </div>
          <span class="mirrorsSummaryBadge">${escapeHtml(summaryText)}</span>
        </div>
        <div class="mirrorsReflectScript">
          חשוב לי לעדכן אותך כי בשוק ישנן 8 חברות בבריאות ו־9 חברות בחיים המשווקות את המוצר. חברות הביטוח העיקריות שאנו עובדים איתם בתחום ביטוחי הבריאות הם <strong>כלל</strong> ו<strong>איילון</strong>, ובתחום ביטוח החיים הינם <strong>מגדל</strong> ו<strong>כלל</strong>.<br><br>
          אז לאחר שקבלנו את פנייתך האם אתה מאשר שאתה זה שאישרת לנו להיכנס עבורך לממשק הר הביטוח ולבצע עבורך בדיקה על מנת להתאים עבורך ביטוח העונה על צריכך?
        </div>
        <div class="mirrorsReflectQuestion">סמן את תשובת הלקוח:</div>
        <div class="mirrorsChoiceGrid">
          <button class="mirrorsMiniChoice${harConsent === 'yes' ? ' is-selected' : ''}" data-reflect-har-consent="yes" type="button">כן</button>
          <button class="mirrorsMiniChoice${harConsent === 'no' ? ' is-selected' : ''}" data-reflect-har-consent="no" type="button">לא</button>
        </div>
        ${harConsent === 'no' ? `<div class="mirrorsDeclinedNote">הלקוח לא אישר שימוש בבדיקת הר הביטוח. מסך הפוליסות לא יוצג עד שתסומן תשובה "כן".</div>` : ``}
        ${harConsent === 'yes' ? `
          <div class="mirrorsReflectScript mirrorsReflectScript--followup mirrorsIssuanceNote">לאחר ביצוע בדיקה בהר הביטוח, שתקף לחמישה ימי עבודה, להלן הביטוחים הקיימים לך כיום:</div>
          <div class="mirrorsReflectionList">${policies.length ? this.renderReflectionPoliciesTable(policies) : `<div class="mirrorsReflectNote">לא נמצאו פוליסות קיימות שמורות בתיק הלקוח.</div>`}</div>
          <div class="mirrorsReflectScript mirrorsReflectScript--followup mirrorsIssuanceNote">
            בהתאם לביטוחים הקיימים לך כיום, הפוליסה שאנחנו מציעים לך לרכוש היא פוליסת:
          </div>
          <div class="mirrorsReflectQuestion">להלן רשימת הפוליסות החדשות ללקוח:</div>
          <div class="mirrorsReflectionList">${newPolicies.length ? this.renderMirrorNewPoliciesRows(newPolicies) : `<div class="mirrorsReflectNote">לא הוזנו עדיין פוליסות חדשות בתיק הלקוח.</div>`}</div>
          <div class="mirrorsReflectScript mirrorsReflectScript--terms">
            הפרמיה צמודה למדד ובמידה ולא תהיה תוספת חיתומית או מקצועית, ייתכן והגבייה הראשונה תהיה גבייה יחסית או כפולה בהתאם למועד החיוב. הגבייה תתבצע במועד התשלום הקבוע של אמצעי התשלום שלך.
          </div>
          <div class="mirrorsReflectScript mirrorsReflectScript--terms mirrorsReflectScript--termsAlt">
            במידה ובעתיד תרצה לעשות שינוי או ביטול תוכל לבצע זאת בכל אחד מהאמצעים שמעמידה לרשותך חברת הביטוח: פקס, מייל, מוקד שירות, אזור אישי באתר החברה. חשוב לי שתדע שתוכל לבטל את כל אחד מהנספחים הכלולים בחבילה בכל עת בתנאי שנותר מוצר בסיס.
          </div>
        ` : ''}`;
    },

    renderReflectionPoliciesTable(policies){
      return `<div class="mirrorsReflectTableWrap"><table class="mirrorsReflectTable"><thead><tr>
        <th>מבוטח</th>
        <th>חברה</th>
        <th>מוצר</th>
        <th>סטטוס</th>
        <th>פרמיה</th>
        <th>סכום / כיסויים</th>
        <th>תאריך תחילה</th>
      </tr></thead><tbody>${policies.map((row, idx) => this.renderReflectionPolicyRow(row, idx)).join('')}</tbody></table></div>`;
    },

    renderReflectionPolicyRow(row, idx){
      const p = row.policy || {};
      const company = safeTrim(p.company) || '—';
      const type = safeTrim(p.type) || '—';
      const statusValue = this.getPolicyStatusValue(p, row.cancellation);
      const premiumRaw = safeTrim(p.monthlyPremium || p.premiumMonthly || p.premium || '');
      const premium = premiumRaw ? `${premiumRaw} ₪` : '—';
      const amountValue = this.getPolicyAmountValue(p);
      const amountLabel = this.getPolicyAmountLabel(p);
      const startDate = safeTrim(p.startDate || p.policyStartDate || p.beginDate || '');
      const insuredText = [safeTrim(row.insuredLabel), safeTrim(row.insuredName)].filter(Boolean).join(' · ');
      const logoSrc = this.getCompanyLogo(company);
      const companyCell = logoSrc
        ? `<div class="mirrorsReflectCompany"><span class="mirrorsReflectCompany__logo"><img src="${escapeHtml(logoSrc)}" alt="${escapeHtml(company)}" /></span><span>${escapeHtml(company)}</span></div>`
        : `<div class="mirrorsReflectCompany"><span class="mirrorsReflectCompany__fallback">${escapeHtml((company || '•').slice(0,1))}</span><span>${escapeHtml(company)}</span></div>`;
      return `<tr>
        <td><div class="mirrorsReflectInsured">${escapeHtml(insuredText || '—')}</div></td>
        <td>${companyCell}</td>
        <td><div class="mirrorsReflectValue">${escapeHtml(type)}</div></td>
        <td><div class="mirrorsReflectValue">${escapeHtml(statusValue || '—')}</div></td>
        <td><div class="mirrorsReflectValue">${escapeHtml(premium)}</div></td>
        <td><div class="mirrorsReflectValue"><span class="mirrorsReflectValue__label">${escapeHtml(amountLabel)}:</span> ${escapeHtml(amountValue || '—')}</div></td>
        <td><div class="mirrorsReflectValue">${escapeHtml(startDate || '—')}</div></td>
      </tr>`;
    },


    renderMirrorNewPoliciesRows(policies){
      return `<div class="mirrorsNewPoliciesStack">${policies.map((policy, idx) => this.renderMirrorNewPolicyRow(policy, idx)).join('')}</div>`;
    },


    renderCancellation(rec){
      if(!this.els.cancelCard) return;
      const store = this.getVerifyState(rec);
      if(this.consent !== 'yes' || !store.reflectionOpened || safeTrim(store.harConsent) !== 'yes'){
        this.els.cancelCard.style.display = 'none';
        this.els.cancelCard.innerHTML = '';
        return;
      }
      this.els.cancelCard.style.display = 'block';
      store.cancelStageOpened = true;
      const cancelMode = safeTrim(store.cancelMode);
      const agentName = safeTrim(rec?.agentName) || safeTrim(Auth?.current?.name) || 'הנציג המטפל';
      this.els.cancelCard.innerHTML = `<div class="mirrorsCard__head">
          <div>
            <div class="mirrorsCard__title">ביטול בחברה נגדית</div>
            <div class="mirrorsCard__hint">שאל את המבוטח איך הוא מעדיף לבצע את ביטול הפוליסות הישנות ועדכן את הבחירה המתאימה.</div>
          </div>
          <span class="mirrorsSummaryBadge">שלב 5 · המשך שיחה</span>
        </div>
        <div class="mirrorsCancelPrompt">איך תרצה שנבצע את הביטול לפוליסות הישנות?</div>
        <div class="mirrorsCancelOptions">
          <button class="mirrorsCancelOption${cancelMode === 'agent' ? ' is-selected' : ''}" data-mirror-cancel-mode="agent" type="button">
            <span class="mirrorsCancelOption__kicker">אפשרות 1</span>
            <strong>על ידי הנציג</strong>
            <small>המערכת תשייך את הטיפול ל־${escapeHtml(agentName)}</small>
          </button>
          <button class="mirrorsCancelOption${cancelMode === 'client' ? ' is-selected' : ''}" data-mirror-cancel-mode="client" type="button">
            <span class="mirrorsCancelOption__kicker">אפשרות 2</span>
            <strong>הלקוח באופן עצמאי</strong>
            <small>המבוטח יבטל ישירות מול חברת הביטוח</small>
          </button>
        </div>
        ${cancelMode === 'agent' ? `<div class="mirrorsCancelAgentBox">
          <div class="mirrorsCancelAgentBox__label">הנציג המטפל בביטול</div>
          <div class="mirrorsCancelAgentBox__name">${escapeHtml(agentName)}</div>
          <div class="mirrorsCancelAgentBox__script">בהמשך ישלח אליך טופס ביטול לחברה הנגדית עליו תידרש לחתום.</div>
        </div>` : ''}
        ${cancelMode === 'client' ? `<div class="mirrorsReflectNote">הלקוח בחר לבצע את הביטול באופן עצמאי מול חברת הביטוח.</div>` : ''}
        <div class="mirrorsReflectActions">
          <button class="btn btn--primary" data-mirror-cancel-save type="button">שמור שלב ביטול</button>
        </div>`;
    },

    async saveCancellationChoice(){
      const rec = this.current();
      if(!rec) return;
      const store = this.getVerifyState(rec);
      const mode = safeTrim(store.cancelMode);
      if(!mode){
        alert('יש לבחור כיצד הלקוח מעדיף לבצע את הביטול לפוליסות הישנות.');
        return;
      }
      store.cancelSavedAt = nowISO();
      store.cancelSavedBy = safeTrim(Auth?.current?.name);
      State.data.meta.updatedAt = nowISO();
      rec.updatedAt = State.data.meta.updatedAt;
      await App.persist('שלב ביטול בחברה נגדית נשמר');
      this.setFocusStep(rec, 6);
      this.render();
      alert('שלב ביטול בחברה נגדית נשמר בהצלחה.');
    },


    getDisclosureState(rec){
      if(!rec.payload || typeof rec.payload !== 'object') rec.payload = {};
      if(!rec.payload.mirrorFlow || typeof rec.payload.mirrorFlow !== 'object') rec.payload.mirrorFlow = {};
      if(!rec.payload.mirrorFlow.disclosure || typeof rec.payload.mirrorFlow.disclosure !== 'object') rec.payload.mirrorFlow.disclosure = {};
      return rec.payload.mirrorFlow.disclosure;
    },

    normalizeDisclosureKey(value){
      return safeTrim(value)
        .toLowerCase()
        .replace(/"/g, '')
        .replace(/[׳']/g, '')
        .replace(/[״]/g, '')
        .replace(/[()]/g, ' ')
        .replace(/-/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    },

    mapHealthCoverToDisclosureKeys(cover){
      const v = this.normalizeDisclosureKey(cover);
      if(!v) return [];
      if(v.includes('תרופות')) return ['meds'];
      if(v.includes('השתלות')) return ['transplants'];
      if(v.includes('חו') && v.includes('ניתוח')) return ['surgeries_abroad'];
      if(v.includes('בארץ') && v.includes('ניתוח')) return ['surgeries_israel'];
      if(v.includes('אמבולטורי')) return ['ambulatory'];
      if(v.includes('ייעוץ מומחים') || v.includes('ייעוץ') || v.includes('מומחים')) return ['ambulatory'];
      if(v.includes('רפואה משלימה')) return ['alt_medicine'];
      if(v.includes('בדיקות מתקדמות') || v.includes('אבחון')) return ['service'];
      if(v.includes('כתב שירות')) return ['service'];
      return [];
    },

    getDisclosureKeysForPolicy(policy){
      const type = safeTrim(policy?.type || policy?.product);
      const raw = this.normalizeDisclosureKey([policy?.type, policy?.product, policy?.name, policy?.plan, policy?.planName, policy?.title].filter(Boolean).join(' '));
      if(type === 'בריאות' || raw.includes('בריאות')){
        const keys = [];
        this.getHealthCoverList(policy).forEach(cover => keys.push(...this.mapHealthCoverToDisclosureKeys(cover)));
        return [...new Set(keys)];
      }
      if(type === 'מחלות קשות' || raw.includes('מחלות קשות')) return ['critical_illness'];
      if(type === 'סרטן' || raw.includes('סרטן')) return ['cancer'];
      if(type === 'ריסק משכנתא' || raw.includes('משכנתא')) return ['mortgage'];
      if(type === 'תאונות אישיות' || raw.includes('תאונות אישיות')) return ['accident_death','accident_disability'];
      if(raw.includes('מטריה')) return ['umbrella'];
      if(raw.includes('אובדן כושר')) return ['disability_income'];
      if(raw.includes('הכנסה למשפחה')) return ['family_income'];
      if(raw.includes('מוות מתאונה')) return ['accident_death'];
      if(raw.includes('נכות מתאונה')) return ['accident_disability'];
      if(type === 'ריסק' || type === 'חיים' || raw.includes('ריסק') || raw.includes('מגן') || raw.includes('חיים')) return ['risk'];
      return [];
    },

    getDisclosureEntries(rec){
      const policies = this.getNewPolicies(rec);
      const entries = [];
      policies.forEach((policy, idx) => {
        const company = safeTrim(policy?.company);
        const disclosureCompany = company === 'הכשרה' ? 'איילון' : company;
        const companyLib = MIRROR_DISCLOSURE_LIBRARY[disclosureCompany];
        if(!companyLib) return;
        const insuredText = this.getMirrorNewPolicyInsured(policy);
        const keys = this.getDisclosureKeysForPolicy(policy);
        keys.forEach((key, keyIdx) => {
          const block = companyLib[key];
          if(!block || !safeTrim(block.text)) return;
          entries.push({
            id: `${safeTrim(policy?.id) || idx}_${key}_${keyIdx}`,
            company,
            policyType: safeTrim(policy?.type || policy?.product || 'פוליסה'),
            insuredText,
            title: safeTrim(block.label) || safeTrim(policy?.type || policy?.product || 'גילוי נאות'),
            text: safeTrim(block.text)
          });
        });
      });
      return entries;
    },

    renderDisclosure(rec){
      if(!this.els.disclosureCard) return;
      const verify = this.getVerifyState(rec);
      if(this.consent !== 'yes' || !verify?.reflectionOpened || safeTrim(verify?.harConsent) !== 'yes' || !safeTrim(verify?.cancelSavedAt)){
        this.els.disclosureCard.style.display = 'none';
        this.els.disclosureCard.innerHTML = '';
        return;
      }
      this.els.disclosureCard.style.display = 'block';
      const disclosure = this.getDisclosureState(rec);
      const entries = this.getDisclosureEntries(rec);
      const cards = entries.length ? entries.map((entry, idx) => {
        const logoSrc = this.getCompanyLogo(entry.company);
        const logo = logoSrc ? `<span class="mirrorsDisclosureItem__logo"><img src="${escapeHtml(logoSrc)}" alt="${escapeHtml(entry.company)}" /></span>` : `<span class="mirrorsDisclosureItem__logo mirrorsDisclosureItem__logo--fallback">${escapeHtml((entry.company || '•').slice(0,1))}</span>`;
        return `<article class="mirrorsDisclosureItem" style="animation-delay:${idx * 40}ms">
          <div class="mirrorsDisclosureItem__head">
            <div class="mirrorsDisclosureItem__brand">${logo}<div><div class="mirrorsDisclosureItem__company">${escapeHtml(entry.company)}</div><div class="mirrorsDisclosureItem__meta">${escapeHtml(entry.policyType)} · ${escapeHtml(entry.insuredText || 'מבוטח')}</div></div></div>
            <span class="mirrorsDisclosureItem__badge">${escapeHtml(entry.title)}</span>
          </div>
          <div class="mirrorsDisclosureText">${escapeHtml(entry.text).replace(/\n/g,'<br>')}</div>
        </article>`;
      }).join('') : `<div class="mirrorsReflectNote">לא נמצא גילוי נאות תואם לחברה ולמוצר שסומנו בפוליסות החדשות.</div>`;
      const savedNote = safeTrim(disclosure.savedAt) ? `<div class="mirrorsDisclosureSaved">השלב נשמר בתאריך ${escapeHtml(this.formatDate(disclosure.savedAt))}${safeTrim(disclosure.savedBy) ? ` · על ידי ${escapeHtml(disclosure.savedBy)}` : ''}</div>` : '';
      this.els.disclosureCard.innerHTML = `<div class="mirrorsCard__head">
          <div>
            <div class="mirrorsCard__title">גילוי נאות</div>
            <div class="mirrorsCard__hint">המערכת שולפת את נוסח הגילוי הנאות המלא לפי החברה והמוצר שנבחרו בתיק הלקוח.</div>
          </div>
          <span class="mirrorsSummaryBadge">שלב 6 · הקראה מלאה</span>
        </div>
        <div class="mirrorsDisclosureIntro">הקרא את הטקסטים הבאים במלואם, אחד לאחד, בהתאם לחברה ולמוצר שמופיעים בכל פוליסה חדשה.</div>
        <div class="mirrorsDisclosureList">${cards}</div>
        ${savedNote}
        <div class="mirrorsReflectActions"><button class="btn btn--primary" data-mirror-disclosure-save type="button">שמור שלב גילוי נאות</button></div>`;
    },

    async saveDisclosure(){
      const rec = this.current();
      if(!rec) return;
      const entries = this.getDisclosureEntries(rec);
      if(!entries.length){
        alert('לא נמצא גילוי נאות תואם לשמירה עבור הפוליסות החדשות.');
        return;
      }
      const disclosure = this.getDisclosureState(rec);
      disclosure.savedAt = nowISO();
      disclosure.savedBy = safeTrim(Auth?.current?.name);
      disclosure.items = entries.map(item => ({ company: item.company, policyType: item.policyType, title: item.title, text: item.text }));
      State.data.meta.updatedAt = nowISO();
      rec.updatedAt = State.data.meta.updatedAt;
      await App.persist('שלב גילוי נאות נשמר');
      this.setFocusStep(rec, 7);
      this.render();
      alert('שלב גילוי נאות נשמר בהצלחה.');
    },

    getHealthDeclarationSource(rec){
      const primary = this.getPrimary(rec) || {};
      const insureds = this.getInsureds(rec);
      const primaryInsData = insureds?.[0]?.data && typeof insureds[0].data === 'object' ? insureds[0].data : null;
      const host = (primary && typeof primary === 'object' && primary.healthDeclaration) ? primary : (primaryInsData || primary);
      if(!host || typeof host !== 'object') return null;
      if(!host.healthDeclaration || typeof host.healthDeclaration !== 'object') host.healthDeclaration = {};
      if(!host.healthDeclaration.responses || typeof host.healthDeclaration.responses !== 'object') host.healthDeclaration.responses = {};
      if(!host.healthDeclaration.ui || typeof host.healthDeclaration.ui !== 'object') host.healthDeclaration.ui = {};
      if(primaryInsData && primaryInsData !== host) primaryInsData.healthDeclaration = host.healthDeclaration;
      if(primary && primary !== host) primary.healthDeclaration = host.healthDeclaration;
      return host.healthDeclaration;
    },

    getMirrorHealthState(rec){
      if(!rec.payload || typeof rec.payload !== 'object') rec.payload = {};
      if(!rec.payload.mirrorFlow || typeof rec.payload.mirrorFlow !== 'object') rec.payload.mirrorFlow = {};
      if(!rec.payload.mirrorFlow.healthStep || typeof rec.payload.mirrorFlow.healthStep !== 'object') rec.payload.mirrorFlow.healthStep = {};
      return rec.payload.mirrorFlow.healthStep;
    },

    buildMirrorHealthMeta(rec){
      const insureds = this.getInsureds(rec).map((ins, idx) => ({ ...ins, label: this.getInsuredDisplayName(ins, idx) }));
      const newPolicies = this.getNewPolicies(rec).slice();
      const ctx = {
        insureds,
        newPolicies,
        parseMoneyNumber: Wizard.parseMoneyNumber,
        getPolicyLabel: Wizard.getPolicyLabel,
        calcAge: Wizard.calcAge,
        buildPhoenixQuestionnaireCatalog: Wizard.buildPhoenixQuestionnaireCatalog,
        buildPhoenixFollowupFields: Wizard.buildPhoenixFollowupFields,
        getPhoenixFollowupSchemas: Wizard.getPhoenixFollowupSchemas,
        getHealthSchema: Wizard.getHealthSchema,
        getPhoenixHealthSchema: Wizard.getPhoenixHealthSchema
      };
      ctx.getHealthPoliciesForInsured = function(ins){ return Wizard.getHealthPoliciesForInsured.call(ctx, ins); };
      const categories = []
        .concat(Wizard.getHealthSchema.call(ctx) || [])
        .concat(Wizard.getPhoenixHealthSchema.call(ctx) || []);
      const map = {};
      categories.forEach(cat => {
        (cat.questions || []).forEach(q => {
          map[q.key] = {
            key: q.key,
            text: safeTrim(q.text) || safeTrim(q.label) || q.key,
            title: safeTrim(cat.title) || 'הצהרת בריאות',
            summary: safeTrim(cat.summary),
            fields: Array.isArray(q.fields) ? q.fields.slice() : []
          };
          if(q.originalKey && !map[q.originalKey]) map[q.originalKey] = map[q.key];
        });
      });
      return { insureds, categories, map };
    },

    getMirrorHealthEntries(rec){
      const source = this.getHealthDeclarationSource(rec);
      const responses = source?.responses || {};
      const meta = this.buildMirrorHealthMeta(rec);
      const insuredsById = {};
      (meta.insureds || []).forEach((ins, idx) => {
        insuredsById[String(ins.id)] = { ...ins, label: this.getInsuredDisplayName(ins, idx) };
      });
      const groups = {};
      Object.keys(responses || {}).forEach(qKey => {
        const qMeta = meta.map[qKey] || { key:qKey, text:qKey, title:'הצהרת בריאות', summary:'', fields:[] };
        const perIns = responses[qKey] || {};
        Object.keys(perIns || {}).forEach(insId => {
          const ins = insuredsById[String(insId)] || { id:insId, label:'מבוטח' };
          if(!groups[insId]) groups[insId] = { insured: ins, items: [] };
          const resp = perIns[insId] || { answer:'', fields:{}, saved:false };
          groups[insId].items.push({ qKey, insId, meta:qMeta, response:resp });
        });
      });
      return Object.values(groups).map(group => ({
        insured: group.insured,
        items: group.items.sort((a,b) => {
          const ta = safeTrim(a.meta?.title);
          const tb = safeTrim(b.meta?.title);
          if(ta !== tb) return ta.localeCompare(tb, 'he');
          return safeTrim(a.meta?.text).localeCompare(safeTrim(b.meta?.text), 'he');
        })
      }));
    },

    setMirrorHealthAnswer(rec, qKey, insId, answer){
      const source = this.getHealthDeclarationSource(rec);
      source.responses[qKey] = source.responses[qKey] || {};
      const prev = source.responses[qKey][insId] || { answer:'', fields:{}, saved:false };
      source.responses[qKey][insId] = {
        ...prev,
        answer,
        saved: answer === 'yes' ? false : false,
        fields: answer === 'yes' ? (prev.fields || {}) : {}
      };
    },

    setMirrorHealthField(rec, qKey, insId, fieldKey, value){
      const source = this.getHealthDeclarationSource(rec);
      source.responses[qKey] = source.responses[qKey] || {};
      const prev = source.responses[qKey][insId] || { answer:'yes', fields:{}, saved:false };
      source.responses[qKey][insId] = {
        ...prev,
        answer: 'yes',
        saved: false,
        fields: { ...(prev.fields || {}), [fieldKey]: safeTrim(value) }
      };
    },

    validateMirrorHealthItem(item){
      const resp = item?.response || {};
      if(resp.answer !== 'yes') return true;
      const fields = Array.isArray(item?.meta?.fields) ? item.meta.fields.filter(field => field.type !== 'section') : [];
      if(!fields.length) return true;
      return fields.every(field => safeTrim(resp.fields?.[field.key]));
    },

    renderMirrorHealthField(item, field){
      if(field.type === 'section'){
        return `<div class="mirrorsHealthFieldSection">${escapeHtml(field.label || '')}</div>`;
      }
      const val = safeTrim(item?.response?.fields?.[field.key] || '');
      const token = `${item.qKey}|${item.insId}|${field.key}`;
      if(field.type === 'textarea'){
        return `<label class="mirrorsHealthField mirrorsHealthField--full"><span>${escapeHtml(field.label || field.key)}</span><textarea class="input mirrorsHealthTextarea" rows="3" data-mirror-health-field="${escapeHtml(token)}">${escapeHtml(val)}</textarea></label>`;
      }
      return `<label class="mirrorsHealthField"><span>${escapeHtml(field.label || field.key)}</span><input class="input" type="text" data-mirror-health-field="${escapeHtml(token)}" value="${escapeHtml(val)}" /></label>`;
    },

    renderHealthDeclaration(rec){
      if(!this.els.healthCard) return;
      const verify = this.getVerifyState(rec);
      const disclosure = this.getDisclosureState(rec);
      if(this.consent !== 'yes' || !verify?.reflectionOpened || safeTrim(verify?.harConsent) !== 'yes' || !safeTrim(verify?.cancelSavedAt) || !safeTrim(disclosure?.savedAt)){
        this.els.healthCard.style.display = 'none';
        this.els.healthCard.innerHTML = '';
        return;
      }
      this.els.healthCard.style.display = 'block';
      const source = this.getHealthDeclarationSource(rec);
      const groups = this.getMirrorHealthEntries(rec);
      const stepState = this.getMirrorHealthState(rec);
      const savedNote = safeTrim(stepState.savedAt) ? `<div class="mirrorsDisclosureSaved">השלב נשמר בתאריך ${escapeHtml(this.formatDate(stepState.savedAt))}${safeTrim(stepState.savedBy) ? ` · על ידי ${escapeHtml(stepState.savedBy)}` : ''}</div>` : '';
      const body = groups.length ? groups.map(group => {
        const cards = (group.items || []).map(item => {
          const answer = safeTrim(item.response?.answer);
          const yesSelected = answer === 'yes';
          const noSelected = answer === 'no';
          const fields = Array.isArray(item.meta?.fields) ? item.meta.fields : [];
          const detailWarn = yesSelected && !this.validateMirrorHealthItem(item);
          return `<article class="mirrorsHealthItem${yesSelected ? ' is-positive' : noSelected ? ' is-negative' : ''}">
            <div class="mirrorsHealthItem__head">
              <div>
                <div class="mirrorsHealthItem__title">${escapeHtml(item.meta?.text || item.qKey)}</div>
                <div class="mirrorsHealthItem__meta">${escapeHtml(item.meta?.title || 'הצהרת בריאות')}</div>
              </div>
              <span class="mirrorsHealthItem__badge">${answer === 'yes' ? 'כן' : answer === 'no' ? 'לא' : 'טרם סומן'}</span>
            </div>
            <div class="mirrorsChoiceGrid mirrorsChoiceGrid--health">
              <button class="mirrorsMiniChoice${yesSelected ? ' is-selected' : ''}" data-mirror-health-answer="${escapeHtml(`${item.qKey}|${item.insId}|yes`)}" type="button">כן</button>
              <button class="mirrorsMiniChoice${noSelected ? ' is-selected' : ''}" data-mirror-health-answer="${escapeHtml(`${item.qKey}|${item.insId}|no`)}" type="button">לא</button>
            </div>
            ${yesSelected ? `<div class="mirrorsHealthFields">${fields.length ? fields.map(field => this.renderMirrorHealthField(item, field)).join('') : `<div class="mirrorsHealthNoFields">אין לשאלה זו שאלון המשך מובנה, אבל הסימון נשמר כ־כן.</div>`}</div>` : ''}
            ${detailWarn ? `<div class="mirrorsHealthWarn">חסר פירוט בשאלון ההמשך. יש להשלים את כל השדות לפני שמירת השלב.</div>` : ''}
          </article>`;
        }).join('');
        return `<section class="mirrorsHealthGroup">
          <div class="mirrorsHealthGroup__head">
            <div class="mirrorsHealthGroup__name">${escapeHtml(group.insured?.label || 'מבוטח')}</div>
            <div class="mirrorsHealthGroup__sub">כך נשמרו סימוני כן / לא והשאלונים מהטופס המקורי של החברה</div>
          </div>
          <div class="mirrorsHealthGroup__list">${cards}</div>
        </section>`;
      }).join('') : `<div class="mirrorsReflectNote">לא נמצאה הצהרת בריאות שמורה בתיק הלקוח. יש לוודא שהצהרת הבריאות מולאה ונשמרה בטופס המקורי.</div>`;
      this.els.healthCard.innerHTML = `<div class="mirrorsCard__head">
          <div>
            <div class="mirrorsCard__title">הצהרת בריאות</div>
            <div class="mirrorsCard__hint">המערכת שולפת את הסימונים המקוריים של כן / לא ואת שאלוני ההמשך כפי שמולאו בטופס החברה, ומאפשרת לערוך אותם מתוך השיקוף.</div>
          </div>
          <span class="mirrorsSummaryBadge">שלב 7 · הצהרת בריאות</span>
        </div>
        <div class="mirrorsHealthIntro">
          <div class="mirrorsHealthIntro__title">נוסח חובה לפני מעבר על ההצהרה</div>
          <div class="mirrorsHealthIntro__text">
            בעת נעבור להצהרת הבריאות. אני יעבור איתך על מספר שאלות. חשוב לתת בעניינים אלו תשובה מלאה וכנה. אחרת תהיה לכך השפעה על תגמולי הביטוח.
            <br><br>
            במילים אחרות: התשובות שלך לשאלות הצהרת הבריאות שיוקראו לך כעת הן הבסיס לפוליסה, וחשוב מאוד שתענה עליהן בצורה מלאה, נכונה וכנה.
            <br><br>
            לתשומת ליבך מענה שאינו מלא, נכון וכנה עלול לפגוע בך במעמד התביעה ואף עלול להוביל לביטול הפוליסה.
          </div>
        </div>
        ${body}
        ${savedNote}
        <div class="mirrorsReflectActions"><button class="btn btn--primary" data-mirror-health-save type="button">שמור שלב הצהרת בריאות</button></div>`;
    },

    async saveHealthDeclaration(){
      const rec = this.current();
      if(!rec) return;
      const groups = this.getMirrorHealthEntries(rec);
      if(!groups.length){
        alert('לא נמצאה הצהרת בריאות שמורה עבור הלקוח הזה.');
        return;
      }
      for(const group of groups){
        for(const item of (group.items || [])){
          const answer = safeTrim(item.response?.answer);
          if(answer !== 'yes' && answer !== 'no'){
            alert(`יש להשלים סימון כן/לא עבור ${group.insured?.label || 'מבוטח'} בשאלה: ${item.meta?.text || item.qKey}`);
            return;
          }
          if(answer === 'yes' && !this.validateMirrorHealthItem(item)){
            alert(`יש להשלים את שאלון ההמשך עבור ${group.insured?.label || 'מבוטח'} בשאלה: ${item.meta?.text || item.qKey}`);
            return;
          }
        }
      }
      const source = this.getHealthDeclarationSource(rec);
      Object.keys(source.responses || {}).forEach(qKey => {
        const perIns = source.responses[qKey] || {};
        Object.keys(perIns).forEach(insId => {
          const answer = safeTrim(perIns[insId]?.answer);
          perIns[insId].saved = (answer === 'yes');
          if(answer === 'no') perIns[insId].saved = false;
        });
      });
      const stepState = this.getMirrorHealthState(rec);
      stepState.savedAt = nowISO();
      stepState.savedBy = safeTrim(Auth?.current?.name);
      stepState.itemsCount = groups.reduce((sum, group) => sum + ((group.items || []).length), 0);
      State.data.meta.updatedAt = nowISO();
      rec.updatedAt = State.data.meta.updatedAt;
      await App.persist('שלב הצהרת בריאות נשמר');
      this.setFocusStep(rec, 8);
      this.render();
      alert('שלב הצהרת בריאות נשמר בהצלחה.');
    },

    getPaymentHost(rec){
      const primary = this.getPrimary(rec) || {};
      const insureds = this.getInsureds(rec);
      const primaryInsData = insureds?.[0]?.data && typeof insureds[0].data === 'object' ? insureds[0].data : null;
      const host = primaryInsData || primary;
      const defaults = {
        payerChoice: 'insured',
        selectedPayerId: '',
        externalPayer: { relation:'', firstName:'', lastName:'', idNumber:'', birthDate:'', phone:'' },
        paymentMethod: 'cc',
        cc: { holderName:'', holderId:'', cardNumber:'', exp:'' },
        ho: { account:'', branch:'', bankName:'', bankNo:'' }
      };
      host.payerChoice = safeTrim(host.payerChoice) || defaults.payerChoice;
      host.selectedPayerId = safeTrim(host.selectedPayerId);
      host.externalPayer = Object.assign({}, defaults.externalPayer, host.externalPayer || {});
      host.paymentMethod = safeTrim(host.paymentMethod) || defaults.paymentMethod;
      host.cc = Object.assign({}, defaults.cc, host.cc || {});
      host.ho = Object.assign({}, defaults.ho, host.ho || {});
      if(primary && primary !== host){
        primary.payerChoice = host.payerChoice;
        primary.selectedPayerId = host.selectedPayerId;
        primary.externalPayer = host.externalPayer;
        primary.paymentMethod = host.paymentMethod;
        primary.cc = host.cc;
        primary.ho = host.ho;
      }
      return host;
    },

    getMirrorPaymentState(rec){
      if(!rec.payload || typeof rec.payload !== 'object') rec.payload = {};
      if(!rec.payload.mirrorFlow || typeof rec.payload.mirrorFlow !== 'object') rec.payload.mirrorFlow = {};
      if(!rec.payload.mirrorFlow.paymentStep || typeof rec.payload.mirrorFlow.paymentStep !== 'object') rec.payload.mirrorFlow.paymentStep = {};
      const store = rec.payload.mirrorFlow.paymentStep;
      if(typeof store.clientVerified !== 'boolean') store.clientVerified = false;
      return store;
    },

    getPaymentSummary(rec){
      const host = this.getPaymentHost(rec);
      const method = safeTrim(host.paymentMethod) === 'ho' ? 'ho' : 'cc';
      const payerChoice = safeTrim(host.payerChoice) === 'external' ? 'external' : 'insured';
      const insureds = this.getInsureds(rec);
      const payer = payerChoice === 'insured'
        ? insureds.find(ins => String(ins.id) === String(host.selectedPayerId)) || insureds[0] || null
        : null;
      return {
        host,
        method,
        payerChoice,
        payerName: payerChoice === 'external'
          ? `${safeTrim(host.externalPayer?.firstName)} ${safeTrim(host.externalPayer?.lastName)}`.trim()
          : this.getInsuredDisplayName(payer, 0),
        payerMeta: payerChoice === 'external'
          ? [safeTrim(host.externalPayer?.relation), safeTrim(host.externalPayer?.idNumber)].filter(Boolean).join(' · ')
          : safeTrim(payer?.data?.idNumber || ''),
      };
    },

    maskTrailingDigits(value, keep=4){
      const raw = String(value || '').replace(/\D+/g,'');
      if(!raw) return '—';
      if(raw.length <= keep) return raw;
      return `${'*'.repeat(Math.max(0, raw.length - keep))}${raw.slice(-keep)}`;
    },

    setMirrorPaymentMethod(rec, method){
      const host = this.getPaymentHost(rec);
      host.paymentMethod = method === 'ho' ? 'ho' : 'cc';
      const primary = this.getPrimary(rec) || {};
      if(primary && primary !== host) primary.paymentMethod = host.paymentMethod;
      const step = this.getMirrorPaymentState(rec);
      step.clientVerified = false;
      delete step.savedAt;
      delete step.savedBy;
    },

    setMirrorPaymentField(rec, field, value){
      const host = this.getPaymentHost(rec);
      const parts = field.split('.');
      if(parts[0] === 'paymentMethod'){
        this.setMirrorPaymentMethod(rec, value);
        return;
      }
      if(parts[0] === 'cc'){
        host.cc = host.cc || {};
        host.cc[parts[1]] = safeTrim(value);
      }else if(parts[0] === 'ho'){
        host.ho = host.ho || {};
        host.ho[parts[1]] = safeTrim(value);
      }else if(parts[0] === 'externalPayer'){
        host.externalPayer = host.externalPayer || {};
        host.externalPayer[parts[1]] = safeTrim(value);
      }else{
        host[parts[0]] = safeTrim(value);
      }
      const primary = this.getPrimary(rec) || {};
      if(primary && primary !== host){
        primary.payerChoice = host.payerChoice;
        primary.selectedPayerId = host.selectedPayerId;
        primary.externalPayer = host.externalPayer;
        primary.paymentMethod = host.paymentMethod;
        primary.cc = host.cc;
        primary.ho = host.ho;
      }
      const step = this.getMirrorPaymentState(rec);
      step.clientVerified = false;
      delete step.savedAt;
      delete step.savedBy;
    },

    getMirrorIssuanceState(rec){
      if(!rec.payload || typeof rec.payload !== 'object') rec.payload = {};
      if(!rec.payload.mirrorFlow || typeof rec.payload.mirrorFlow !== 'object') rec.payload.mirrorFlow = {};
      if(!rec.payload.mirrorFlow.issuanceStep || typeof rec.payload.mirrorFlow.issuanceStep !== 'object') rec.payload.mirrorFlow.issuanceStep = {};
      const store = rec.payload.mirrorFlow.issuanceStep;
      if(!safeTrim(store.clientAnswer)) store.clientAnswer = '';
      if(typeof store.agentRead !== 'boolean') store.agentRead = false;
      return store;
    },

    getMirrorEffectiveDateText(rec){
      const dates = this.getNewPolicies(rec)
        .map(policy => safeTrim(policy?.startDate || policy?.policyStartDate || policy?.beginDate || ''))
        .filter(Boolean);
      const unique = [...new Set(dates)];
      if(!unique.length) return 'טרם הוזן';
      if(unique.length === 1) return unique[0];
      return unique.join(' / ');
    },

    renderMirrorPaymentField(label, field, value, opts = {}){
      const type = opts.type || 'text';
      const dir = opts.dir ? ` dir="${escapeHtml(opts.dir)}"` : '';
      const inputmode = opts.inputmode ? ` inputmode="${escapeHtml(opts.inputmode)}"` : '';
      const placeholder = opts.placeholder ? ` placeholder="${escapeHtml(opts.placeholder)}"` : '';
      return `<label class="mirrorsHealthField"><span>${escapeHtml(label)}</span><input class="input" type="${escapeHtml(type)}" data-mirror-payment-field="${escapeHtml(field)}" value="${escapeHtml(value || '')}"${dir}${inputmode}${placeholder} /></label>`;
    },

    renderPaymentDetails(rec){
      if(!this.els.paymentCard) return;
      const verify = this.getVerifyState(rec);
      const disclosure = this.getDisclosureState(rec);
      const health = this.getMirrorHealthState(rec);
      if(this.consent !== 'yes' || !verify?.reflectionOpened || safeTrim(verify?.harConsent) !== 'yes' || !safeTrim(verify?.cancelSavedAt) || !safeTrim(disclosure?.savedAt) || !safeTrim(health?.savedAt)){
        this.els.paymentCard.style.display = 'none';
        this.els.paymentCard.innerHTML = '';
        return;
      }
      this.els.paymentCard.style.display = 'block';
      const summary = this.getPaymentSummary(rec);
      const host = summary.host;
      const method = summary.method;
      const step = this.getMirrorPaymentState(rec);
      const methodLabel = method === 'cc' ? 'כרטיס אשראי' : 'הוראת קבע';
      const paymentFields = method === 'cc'
        ? [
            ['שם בעל הכרטיס','cc.holderName',host.cc?.holderName || ''],
            ['ת״ז בעל הכרטיס','cc.holderId',host.cc?.holderId || '', {'inputmode':'numeric','dir':'ltr'}],
            ['מספר כרטיס','cc.cardNumber',host.cc?.cardNumber || '', {'inputmode':'numeric','dir':'ltr'}],
            ['תוקף','cc.exp',host.cc?.exp || '', {'inputmode':'numeric','dir':'ltr','placeholder':'MM/YY'}]
          ]
        : [
            ['שם בנק','ho.bankName',host.ho?.bankName || ''],
            ['מספר בנק','ho.bankNo',host.ho?.bankNo || '', {'inputmode':'numeric','dir':'ltr'}],
            ['סניף','ho.branch',host.ho?.branch || '', {'inputmode':'numeric','dir':'ltr'}],
            ['מספר חשבון','ho.account',host.ho?.account || '', {'inputmode':'numeric','dir':'ltr'}]
          ];
      const preview = method === 'cc'
        ? `<div class="mirrorsPaymentPreview__value">${escapeHtml(this.maskTrailingDigits(host.cc?.cardNumber || ''))}</div><div class="mirrorsPaymentPreview__sub">כרטיס · ${escapeHtml(host.cc?.exp || 'ללא תוקף')}</div>`
        : `<div class="mirrorsPaymentPreview__value">${escapeHtml(this.maskTrailingDigits(host.ho?.account || ''))}</div><div class="mirrorsPaymentPreview__sub">חשבון · בנק ${escapeHtml(host.ho?.bankNo || host.ho?.bankName || '—')}</div>`;
      const savedNote = safeTrim(step.savedAt) ? `<div class="mirrorsDisclosureSaved">השלב נשמר בתאריך ${escapeHtml(this.formatDate(step.savedAt))}${safeTrim(step.savedBy) ? ` · על ידי ${escapeHtml(step.savedBy)}` : ''}</div>` : '';
      this.els.paymentCard.innerHTML = `<div class="mirrorsCard__head">
          <div>
            <div class="mirrorsCard__title">פרטי אמצעי תשלום</div>
            <div class="mirrorsCard__hint">המערכת שולפת את פרטי התשלום שנשמרו בפרטי משלם, ומאפשרת לערוך אותם לפני המשך השיקוף.</div>
          </div>
          <span class="mirrorsSummaryBadge">שלב 8 · אמצעי תשלום</span>
        </div>
        <div class="mirrorsHealthIntro mirrorsHealthIntro--payment">
          <div class="mirrorsHealthIntro__title">נוסח חובה לפני אימות אמצעי תשלום</div>
          <div class="mirrorsHealthIntro__text">קיימות 2 אפשרויות לתשלום. כרטיס אשראי או הוראת קבע.<br><br>אני צריך שתעבור איתי על אמצעי התשלום שלך לצורך אימות.</div>
        </div>
        <div class="mirrorsPaymentShell">
          <div class="mirrorsPaymentPreview mirrorsPaymentPreview--${method === 'cc' ? 'card' : 'bank'}">
            <div class="mirrorsPaymentPreview__kicker">אמצעי תשלום שנשמר</div>
            <div class="mirrorsPaymentPreview__title">${escapeHtml(methodLabel)}</div>
            ${preview}
            <div class="mirrorsPaymentPreview__payer">משלם: <strong>${escapeHtml(summary.payerName || '—')}</strong>${summary.payerMeta ? ` · ${escapeHtml(summary.payerMeta)}` : ''}</div>
          </div>
          <div class="mirrorsPaymentBody">
            <div class="mirrorsPaymentMethods">
              <button class="mirrorsCancelOption${method === 'cc' ? ' is-selected' : ''}" data-mirror-payment-method="cc" type="button"><span class="mirrorsCancelOption__kicker">אפשרות 1</span><strong>כרטיס אשראי</strong><small>מעבר על בעל הכרטיס, מספר הכרטיס והתוקף</small></button>
              <button class="mirrorsCancelOption${method === 'ho' ? ' is-selected' : ''}" data-mirror-payment-method="ho" type="button"><span class="mirrorsCancelOption__kicker">אפשרות 2</span><strong>הוראת קבע</strong><small>מעבר על שם הבנק, סניף ומספר חשבון</small></button>
            </div>
            <div class="mirrorsPaymentGrid"></div>
            <div class="mirrorsVerifyGrid mirrorsVerifyGrid--wide mirrorsVerifyGrid--paymentMeta">
              <div class="mirrorsInfoCard"><span>סוג משלם</span><strong>${escapeHtml(summary.payerChoice === 'external' ? 'משלם חריג' : 'מבוטח קיים')}</strong></div>
              <div class="mirrorsInfoCard"><span>שם משלם</span><strong>${escapeHtml(summary.payerName || '—')}</strong></div>
              <div class="mirrorsInfoCard"><span>אמצעי תשלום</span><strong>${escapeHtml(methodLabel)}</strong></div>
            </div>
            <div class="mirrorsPaymentFields">${paymentFields.map(args => this.renderMirrorPaymentField(args[0], args[1], args[2], args[3] || {})).join('')}</div>
            <div class="mirrorsAnswerBox mirrorsAnswerBox--payment">
              <div class="mirrorsAnswerBox__title">האם הלקוח אישר שאמצעי התשלום נכון?</div>
              <div class="mirrorsAnswerGrid">
                <button class="mirrorsAnswerCard mirrorsAnswerCard--yes${step.clientVerified ? ' is-selected' : ''}" data-mirror-payment-verified="yes" type="button"><span class="mirrorsAnswerCard__icon">✓</span><strong>כן, הלקוח אישר</strong><small>הפרטים אומתו מול הלקוח</small></button>
                <button class="mirrorsAnswerCard mirrorsAnswerCard--no${!step.clientVerified ? ' is-selected' : ''}" data-mirror-payment-verified="no" type="button"><span class="mirrorsAnswerCard__icon">✎</span><strong>נדרש תיקון / עריכה</strong><small>עדכן את הפרטים ואז שמור מחדש</small></button>
              </div>
            </div>
          </div>
        </div>
        ${savedNote}
        <div class="mirrorsReflectActions"><button class="btn btn--primary" data-mirror-payment-save type="button">שמור שלב אמצעי תשלום</button></div>`;
    },

    async savePaymentDetails(){
      const rec = this.current();
      if(!rec) return;
      const summary = this.getPaymentSummary(rec);
      const host = summary.host;
      if(summary.method === 'cc'){
        const req = [['שם בעל הכרטיס', host.cc?.holderName], ['ת"ז בעל הכרטיס', host.cc?.holderId], ['מספר כרטיס', host.cc?.cardNumber], ['תוקף', host.cc?.exp]];
        const miss = req.find(item => !safeTrim(item[1]));
        if(miss){ alert(`יש להשלים ${miss[0]} לפני שמירת אמצעי התשלום.`); return; }
      }else{
        const req = [['שם בנק', host.ho?.bankName], ['מספר בנק', host.ho?.bankNo], ['סניף', host.ho?.branch], ['מספר חשבון', host.ho?.account]];
        const miss = req.find(item => !safeTrim(item[1]));
        if(miss){ alert(`יש להשלים ${miss[0]} לפני שמירת אמצעי התשלום.`); return; }
      }
      const step = this.getMirrorPaymentState(rec);
      if(!step.clientVerified){
        alert('יש לסמן שהלקוח אישר את אמצעי התשלום לפני השמירה.');
        return;
      }
      step.savedAt = nowISO();
      step.savedBy = safeTrim(Auth?.current?.name);
      step.method = summary.method;
      step.methodLabel = summary.method === 'cc' ? 'כרטיס אשראי' : 'הוראת קבע';
      State.data.meta.updatedAt = nowISO();
      rec.updatedAt = State.data.meta.updatedAt;
      await App.persist('שלב אמצעי תשלום נשמר');
      this.setFocusStep(rec, 9);
      this.render();
      alert('שלב אמצעי תשלום נשמר בהצלחה.');
    },

    renderIssuanceStep(rec){
      if(!this.els.issuanceCard) return;
      const verify = this.getVerifyState(rec);
      const disclosure = this.getDisclosureState(rec);
      const health = this.getMirrorHealthState(rec);
      const payment = this.getMirrorPaymentState(rec);
      if(this.consent !== 'yes' || !verify?.reflectionOpened || safeTrim(verify?.harConsent) !== 'yes' || !safeTrim(verify?.cancelSavedAt) || !safeTrim(disclosure?.savedAt) || !safeTrim(health?.savedAt) || !safeTrim(payment?.savedAt)){
        this.els.issuanceCard.style.display = 'none';
        this.els.issuanceCard.innerHTML = '';
        return;
      }
      this.els.issuanceCard.style.display = 'block';
      const step = this.getMirrorIssuanceState(rec);
      const effectiveDateText = this.getMirrorEffectiveDateText(rec);
      const savedNote = safeTrim(step.savedAt) ? `<div class="mirrorsDisclosureSaved">השלב נשמר בתאריך ${escapeHtml(this.formatDate(step.savedAt))}${safeTrim(step.savedBy) ? ` · על ידי ${escapeHtml(step.savedBy)}` : ''}</div>` : '';
      this.els.issuanceCard.innerHTML = `<div class="mirrorsCard__head">
          <div>
            <div class="mirrorsCard__title">כניסה לתוקף, SMS ומסמכי פוליסה</div>
            <div class="mirrorsCard__hint">שלב קריאה מסכם לאחר אימות אמצעי התשלום. ניתן לסמן את תשובת הלקוח, אך אין חובה לבחור כן/לא כדי להמשיך.</div>
          </div>
          <span class="mirrorsSummaryBadge">שלב 9 · כניסה לתוקף</span>
        </div>
        <div class="mirrorsIssuanceIntro">
          <div class="mirrorsIssuanceIntro__kicker">נוסח קריאה מחייב</div>
          <div class="mirrorsIssuanceIntro__text">הפוליסה תיכנס לתוקף החל מהתאריך <span class="mirrorsIssuanceDate">${escapeHtml(effectiveDateText)}</span> או מועד הפקת הפוליסה על ידי החברה לפי המאוחר מביניהם ובכפוף לאמצעי תשלום תקין. בעת הפקת הפוליסה וכניסתה לתוקף תישלח אליך הודעת SMS מחברת הביטוח, יש לעקוב אחרי קבלת הודעה זו.</div>
          <div class="mirrorsIssuanceIntro__text">חשוב לציין כי המידע שמסרת בשיחה מרצונך החופשי וישמר במאגרי החברה ומטעמה לצורך מתן שירות, תפעול הביטוח, עיבוד מידע, פניות ועדכונים.</div>
        </div>
        <div class="mirrorsAnswerBox mirrorsAnswerBox--issuance">
          <div class="mirrorsAnswerBox__title">מה ענה הלקוח?</div>
          <div class="mirrorsAnswerGrid">
            <button class="mirrorsAnswerCard mirrorsAnswerCard--yes${step.clientAnswer === 'yes' ? ' is-selected' : ''}" data-mirror-issuance-answer="yes" type="button"><span class="mirrorsAnswerCard__icon">✓</span><strong>כן</strong><small>הלקוח אישר את הנאמר</small></button>
            <button class="mirrorsAnswerCard mirrorsAnswerCard--no${step.clientAnswer === 'no' ? ' is-selected' : ''}" data-mirror-issuance-answer="no" type="button"><span class="mirrorsAnswerCard__icon">!</span><strong>לא</strong><small>הלקוח לא אישר / ביקש הבהרה</small></button>
          </div>
          <div class="mirrorsAnswerBox__hint">אין חובה לבחור תשובה כדי לשמור את השלב.</div>
        </div>
        <div class="mirrorsIssuanceOutro">
          <div class="mirrorsIssuanceOutro__title">המשך הקריאה של הנציג</div>
          <div class="mirrorsIssuanceOutro__text">כל הנאמר בשיחה הינו בכפוף לפוליסה אשר תישלח אליך לאחר קבלתך לביטוח. מסמכי הפוליסה והדיווחים יישלחו אליך לנייד/מייל. תוכל לעדכן בכל שלב את החברה איך תעדיף לקבל אותם.</div>
          <button class="mirrorsReadToggle${step.agentRead ? ' is-read' : ''}" data-mirror-issuance-read type="button">${step.agentRead ? '✓ הנציג סימן שהקריא את ההמשך' : 'סמן שהנציג הקריא את ההמשך'}</button>
        </div>
        ${savedNote}
        <div class="mirrorsReflectActions"><button class="btn btn--primary" data-mirror-issuance-save type="button">שמור שלב כניסה לתוקף</button></div>`;
    },

    async saveIssuanceStep(){
      const rec = this.current();
      if(!rec) return;
      const step = this.getMirrorIssuanceState(rec);
      step.savedAt = nowISO();
      step.savedBy = safeTrim(Auth?.current?.name);
      step.effectiveDateText = this.getMirrorEffectiveDateText(rec);
      State.data.meta.updatedAt = nowISO();
      rec.updatedAt = State.data.meta.updatedAt;
      await App.persist('שלב כניסה לתוקף נשמר');
      this.setFocusStep(rec, 9);
      this.render();
      alert('שלב כניסה לתוקף נשמר בהצלחה.');
    },

    renderMirrorNewPolicyRow(policy, idx){
      const company = safeTrim(policy?.company) || 'חברה לא מוגדרת';
      const type = safeTrim(policy?.type) || 'פוליסה לא מוגדרת';
      const insuredText = this.getMirrorNewPolicyInsured(policy);
      const premiumBeforeRaw = safeTrim(policy?.premiumMonthly || policy?.monthlyPremium || policy?.premium || '');
      const premiumBefore = premiumBeforeRaw ? `${premiumBeforeRaw} ₪` : '—';
      const premiumAfter = this.getMirrorPolicyAfterDiscount(policy);
      const startDate = safeTrim(policy?.startDate || policy?.policyStartDate || policy?.beginDate || '');
      const amountLabel = this.getPolicyAmountLabel(policy);
      const amountValue = this.getPolicyAmountValue(policy);
      const discountText = this.getMirrorNewPolicyDiscountText(policy);
      const logoSrc = this.getCompanyLogo(company);
      const logo = logoSrc
        ? `<span class="mirrorsReflectCompany__logo"><img src="${escapeHtml(logoSrc)}" alt="${escapeHtml(company)}" /></span>`
        : `<span class="mirrorsReflectCompany__fallback">${escapeHtml((company || '•').slice(0,1))}</span>`;
      return `<div class="mirrorsNewPolicyRow" style="animation-delay:${idx * 60}ms">
        <div class="mirrorsNewPolicyRow__head">
          <div class="mirrorsNewPolicyRow__titleWrap">
            ${logo}
            <div>
              <div class="mirrorsNewPolicyRow__title">${escapeHtml(type)}</div>
              <div class="mirrorsNewPolicyRow__sub">${escapeHtml(company)} · ${escapeHtml(insuredText)}</div>
            </div>
          </div>
          <span class="mirrorsNewPolicyRow__badge">פוליסה מוצעת</span>
        </div>
        <div class="mirrorsNewPolicyRow__grid">
          <div class="mirrorsNewPolicyRow__cell"><span>פרמיה חודשית</span><strong>${escapeHtml(premiumBefore)}</strong></div>
          <div class="mirrorsNewPolicyRow__cell"><span>פרמיה אחרי הנחה</span><strong>${escapeHtml(premiumAfter)}</strong></div>
          <div class="mirrorsNewPolicyRow__cell"><span>${escapeHtml(amountLabel)}</span><strong>${escapeHtml(amountValue || '—')}</strong></div>
          <div class="mirrorsNewPolicyRow__cell"><span>הנחה</span><strong>${escapeHtml(discountText)}</strong></div>
          <div class="mirrorsNewPolicyRow__cell"><span>תאריך תחילה</span><strong>${escapeHtml(startDate || '—')}</strong></div>
        </div>
      </div>`;
    },

    getMirrorNewPolicyInsured(policy){
      if(safeTrim(policy?.insuredMode) === 'couple') return 'מבוטח ראשי + מבוטח משני';
      const insuredId = safeTrim(policy?.insuredId);
      const insureds = this.getInsureds(this.current());
      const ins = insureds.find(item => safeTrim(item?.id) === insuredId);
      if(ins) return `${this.getInsuredLabel(ins)} · ${this.getInsuredDisplayName(ins)}`;
      return safeTrim(policy?.insuredLabel || policy?.insuredName || 'מבוטח');
    },

    getMirrorPolicyAfterDiscount(policy){
      const raw = Number(String(policy?.premiumAfterDiscount ?? '').replace(/[^\d.-]/g, ''));
      if(Number.isFinite(raw) && raw > 0) return `${raw.toLocaleString('he-IL')} ₪`;
      const premium = Number(String(policy?.premiumMonthly || policy?.monthlyPremium || policy?.premium || '0').replace(/[^\d.-]/g, '')) || 0;
      const discountPct = Number(String(policy?.discountPct || '0').replace(/[^\d.-]/g, '')) || 0;
      const after = premium > 0 ? Math.max(0, premium - (premium * discountPct / 100)) : 0;
      return after > 0 ? `${after.toLocaleString('he-IL')} ₪` : '—';
    },

    getMirrorNewPolicyDiscountText(policy){
      return this.getPolicyDiscountDisplayText(policy);
    },


    renderReflectionPolicyCard(row, idx){
      const p = row.policy || {};
      const company = safeTrim(p.company) || 'חברה לא מוגדרת';
      const type = safeTrim(p.type) || 'מוצר לא מוגדר';
      const status = this.getPolicyStatusValue(p);
      const premium = safeTrim(p.monthlyPremium || p.premiumMonthly || p.premium || '');
      const amountLabel = this.getPolicyAmountLabel(p);
      const amountValue = this.getPolicyAmountValue(p);
      const startDate = safeTrim(p.startDate || p.policyStartDate || p.beginDate || '');
      const logoSrc = this.getCompanyLogo(company);
      const logo = logoSrc ? `<img src="${escapeHtml(logoSrc)}" alt="${escapeHtml(company)}" />` : `<span class="mirrorsChip__logoFallback">${escapeHtml(company.slice(0,1))}</span>`;
      return `<div class="mirrorsPolicyReflectCard">
        <div class="mirrorsPolicyReflectCard__top">
          <div class="mirrorsPolicyReflectCard__title">
            <div class="mirrorsPolicyReflectCard__logo">${logo}</div>
            <div>
              <div class="mirrorsPolicyReflectCard__company">${escapeHtml(company)}</div>
              <div class="mirrorsPolicyReflectCard__insured">${escapeHtml(row.insuredLabel)} · ${escapeHtml(row.insuredName)}</div>
            </div>
          </div>
          <div class="mirrorsPolicyReflectCard__status">${escapeHtml(status)}</div>
        </div>
        <div class="mirrorsPolicyGrid">
          <label class="mirrorsField"><span>חברה</span><input class="input" data-reflect-index="${idx}" data-reflect-field="company" value="${escapeHtml(company)}" /></label>
          <label class="mirrorsField"><span>מוצר</span><input class="input" data-reflect-index="${idx}" data-reflect-field="type" value="${escapeHtml(type)}" /></label>
          <label class="mirrorsField"><span>סטטוס</span><input class="input" data-reflect-index="${idx}" data-reflect-field="status" value="${escapeHtml(status)}" /></label>
          <label class="mirrorsField"><span>פרמיה חודשית</span><input class="input" data-reflect-index="${idx}" data-reflect-field="monthlyPremium" value="${escapeHtml(premium)}" /></label>
          <label class="mirrorsField"><span>${escapeHtml(amountLabel)}</span>${amountLabel === 'כיסויים' ? `<textarea class="textarea" data-reflect-index="${idx}" data-reflect-field="covers">${escapeHtml(Array.isArray(p.covers) ? p.covers.join(', ') : amountValue)}</textarea>` : `<input class="input" data-reflect-index="${idx}" data-reflect-field="${amountLabel === 'סכום פיצוי' ? 'compensation' : 'sumInsured'}" value="${escapeHtml(amountValue)}" />`}</label>
          <label class="mirrorsField"><span>תאריך תחילה</span><input class="input" data-reflect-index="${idx}" data-reflect-field="startDate" value="${escapeHtml(startDate)}" /></label>
        </div>
      </div>`;
    },

    async saveReflection(){
      const rec = this.current();
      if(!rec) return;
      const store = this.getVerifyState(rec);
      if(safeTrim(store.harConsent) !== 'yes'){
        alert('יש לסמן שהלקוח אישר את בדיקת הר הביטוח כדי לשמור את שלב השיקוף.');
        return;
      }
      const policies = this.getExistingPolicies(rec);
      policies.forEach(({ policy }) => {
        if(typeof policy.covers === 'string'){
          policy.covers = policy.covers.split(',').map(x => safeTrim(x)).filter(Boolean);
        }
      });
      store.reflectionSavedAt = nowISO();
      store.reflectionSavedBy = safeTrim(Auth?.current?.name);
      State.data.meta.updatedAt = nowISO();
      rec.updatedAt = State.data.meta.updatedAt;
      await App.persist('שיקוף הר הביטוח נשמר');
      this.render();
      alert('מסך שיקוף הר הביטוח נשמר בהצלחה.');
    },

    formatDate(v){
      if(!v) return '—';
      const d = new Date(v);
      if(Number.isNaN(+d)) return String(v);
      try{ return d.toLocaleString('he-IL'); }catch(_e){ return String(v); }
    }
  };

const SystemRepairUI = {
    els: {},
    busy: false,

    init(){
      this.els.wrap = $("#systemRepairModal");
      this.els.backdrop = $("#systemRepairBackdrop");
      this.els.close = $("#systemRepairClose");
      this.els.cancel = $("#systemRepairCancel");
      this.els.confirm = $("#systemRepairConfirm");
      this.els.status = $("#systemRepairStatus");
      this.els.progress = $("#systemRepairProgress");
      this.els.progressBar = $("#systemRepairProgressBar");
      this.els.progressSteps = Array.from(document.querySelectorAll("#systemRepairProgressSteps .systemRepairProgress__step"));
      this.els.btn = $("#btnSystemRepair");

      on(this.els.btn, "click", () => this.open());
      on(this.els.close, "click", () => this.close());
      on(this.els.cancel, "click", () => this.close());
      on(this.els.backdrop, "click", () => this.close());
      on(this.els.wrap, "click", (ev) => {
        if(ev.target?.getAttribute?.("data-close") === "1") this.close();
      });
      on(document, "keydown", (ev) => {
        if(ev.key === "Escape" && this.isOpen() && !this.busy) this.close();
      });
      on(this.els.confirm, "click", async () => {
        if(this.els.confirm?.dataset.mode === "close" && !this.busy){
          this.close();
          return;
        }
        await this.run();
      });
    },

    isOpen(){
      return !!this.els.wrap && this.els.wrap.getAttribute("aria-hidden") === "false";
    },

    open(){
      if(!this.els.wrap) return;
      this.resetActionButtons();
      this.showProgress(false);
      this.setStatus("המערכת מוכנה לבצע טיפול.", "");
      this.els.wrap.classList.add("is-open");
      this.els.wrap.setAttribute("aria-hidden", "false");
    },

    close(){
      if(!this.els.wrap || this.busy) return;
      this.els.wrap.classList.remove("is-open");
      this.els.wrap.setAttribute("aria-hidden", "true");
      this.resetActionButtons();
      this.showProgress(false);
      this.setStatus("המערכת מוכנה לבצע טיפול.", "");
    },

    setStatus(msg, tone=""){
      const el = this.els.status;
      if(!el) return;
      el.textContent = String(msg || "");
      el.classList.remove("is-working", "is-ok", "is-err");
      if(tone) el.classList.add(tone);
    },

    setBusy(flag){
      this.busy = !!flag;
      if(this.els.confirm) this.els.confirm.disabled = !!flag;
      if(this.els.cancel) this.els.cancel.disabled = !!flag;
      if(this.els.close) this.els.close.disabled = !!flag;
      if(this.els.confirm) this.els.confirm.textContent = flag ? "מבצע טיפול..." : ((this.els.confirm.dataset.mode === "close") ? "אישור" : "אישור והפעל טיפול");
    },

    resetActionButtons(){
      if(this.els.confirm){
        this.els.confirm.dataset.mode = "run";
        this.els.confirm.textContent = "אישור והפעל טיפול";
      }
      if(this.els.cancel){
        this.els.cancel.textContent = "ביטול";
        this.els.cancel.disabled = false;
      }
      if(this.els.close) this.els.close.disabled = false;
    },

    setCompletedState(message, tone="is-ok"){
      this.completeProgress();
      this.setStatus(message, tone);
      if(this.els.progress) this.els.progress.classList.add("is-complete");
      if(this.els.confirm){
        this.els.confirm.dataset.mode = "close";
        this.els.confirm.disabled = false;
        this.els.confirm.textContent = "אישור";
      }
      if(this.els.cancel){
        this.els.cancel.textContent = "סגור";
        this.els.cancel.disabled = false;
      }
      if(this.els.close) this.els.close.disabled = false;
    },

    showProgress(flag){
      if(this.els.progress){
        this.els.progress.classList.toggle("is-active", !!flag);
        this.els.progress.classList.remove("is-complete");
        this.els.progress.setAttribute("aria-hidden", flag ? "false" : "true");
      }
      if(!flag) this.updateProgress(0, 0);
    },

    updateProgress(stepIndex, percent){
      if(this.els.progressBar){
        this.els.progressBar.style.width = `${Math.max(0, Math.min(100, Number(percent) || 0))}%`;
      }
      (this.els.progressSteps || []).forEach((el, idx) => {
        el.classList.remove("is-active", "is-done");
        if(idx + 1 < stepIndex) el.classList.add("is-done");
        else if(idx + 1 === stepIndex) el.classList.add("is-active");
      });
      if(!stepIndex){
        (this.els.progressSteps || []).forEach((el) => el.classList.remove("is-active", "is-done"));
      }
    },

    completeProgress(){
      if(this.els.progressBar) this.els.progressBar.style.width = "100%";
      (this.els.progressSteps || []).forEach((el) => {
        el.classList.remove("is-active");
        el.classList.add("is-done");
      });
    },

    async wait(ms){
      await new Promise((resolve) => setTimeout(resolve, ms));
    },

    getCurrentView(){
      return document.querySelector(".view.is-visible")?.id?.replace("view-", "") || "dashboard";
    },

    safeCloseKnownLayers(){
      forceCloseUiLayers({ keepIds:["systemRepairModal"] });
    },

    releaseUiLocks(){
      releaseGlobalUiLocks();
    },

    repairLocalState(){
      try { State.data = normalizeState(State.data || {}); } catch(_e) {}
      try { Storage.saveBackup(State.data); } catch(_e) {}
      try { prepareInteractiveWizardOpen(); } catch(_e) {}
      try {
        if(MirrorsUI){
          MirrorsUI.stopTimerLoop?.();
          MirrorsUI.renderCallBar?.();
        }
      } catch(_e) {}
    },

    rerenderCurrentView(viewName){
      try { UI.renderAuthPill?.(); } catch(_e) {}
      try { UI.applyRoleUI?.(); } catch(_e) {}
      try { UI.goView?.(viewName || this.getCurrentView()); } catch(_e) {}
    },

    async tryReloadSession(){
      if(!Auth.current) return { ok:true, skipped:true };
      try {
        const r = await App.reloadSessionState();
        return r || { ok:false, error:"UNKNOWN_RELOAD_ERROR" };
      } catch(e) {
        return { ok:false, error:String(e?.message || e) };
      }
    },

    async run(){
      if(this.busy) return;
      const currentView = this.getCurrentView();
      this.setBusy(true);
      this.showProgress(true);
      try {
        this.updateProgress(1, 12);
        this.setStatus("שלב 1/3 · משחרר חלונות, שכבות חסימה ומצבי טעינה תקועים...", "is-working");
        await this.wait(220);
        this.safeCloseKnownLayers();
        this.releaseUiLocks();
        this.updateProgress(1, 34);
        await this.wait(320);

        this.updateProgress(2, 46);
        this.setStatus("שלב 2/3 · מאפס טיימרים, דגלי תקיעה ומצב מקומי של המסך הפעיל...", "is-working");
        await this.wait(180);
        this.repairLocalState();
        this.rerenderCurrentView(currentView);
        this.updateProgress(2, 69);
        await this.wait(340);

        this.updateProgress(3, 78);
        this.setStatus("שלב 3/3 · מבצע בדיקה אחרונה, רענון מסך פעיל וסנכרון נתונים...", "is-working");
        await this.wait(180);
        const syncResult = await this.tryReloadSession();
        this.rerenderCurrentView(currentView);
        this.updateProgress(3, 100);
        await this.wait(260);

        if(syncResult.ok || syncResult.skipped){
          this.setCompletedState("בוצע בהצלחה. כל 3 פעולות התיקון הושלמו והמערכת שוחררה, נבדקה ורועננה.", "is-ok");
        } else {
          this.setCompletedState("הטיפול המקומי הושלם וכל 3 פעולות התיקון בוצעו, אך סנכרון הנתונים לא הצליח כעת. אפשר לסגור ולהמשיך לעבוד.", "is-ok");
          console.error("SYSTEM_REPAIR_SYNC_FAILED:", syncResult?.error || syncResult);
        }
      } catch(e) {
        console.error("SYSTEM_REPAIR_FAILED:", e);
        this.releaseUiLocks();
        this.repairLocalState();
        this.rerenderCurrentView(currentView);
        this.setCompletedState("בוצע טיפול חירום מקומי. שלבי הבדיקה הסתיימו, ואם התקלה חוזרת מומלץ לבצע רענון מלא למערכת.", "is-err");
      } finally {
        this.setBusy(false);
      }
    }
  };



  const NewCustomerEntryUI = {
    els: {},
    statusTimer: null,
    init(){
      this.els.btnOpen = document.getElementById("btnNewCustomerWizard");
      this.els.modal = document.getElementById("lcNewCustomerTypeModal");
      this.els.btnClose = document.getElementById("lcNewCustomerTypeModalClose");
      this.els.status = document.getElementById("lcNewCustomerTypeStatus");
      if(!this.els.btnOpen || !this.els.modal) return;

      on(this.els.btnOpen, "click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if(!Auth.current) return;
        this.open();
      });

      on(this.els.btnClose, "click", (ev) => {
        ev.preventDefault();
        this.close();
      });

      on(this.els.modal, "click", (ev) => {
        const t = ev.target;
        if(t && t.getAttribute && t.getAttribute("data-close") === "1"){
          this.close();
          return;
        }
        const card = t && t.closest ? t.closest("[data-new-customer-type]") : null;
        if(!card) return;
        const type = safeTrim(card.getAttribute("data-new-customer-type"));
        this.handleType(type);
      });

      document.addEventListener("keydown", (ev) => {
        if(ev.key === "Escape" && this.isOpen()) this.close();
      });
    },
    isOpen(){
      return !!this.els.modal && this.els.modal.classList.contains("is-open");
    },
    open(){
      try{ LeadShellUI?.close?.(); }catch(_e){}
      try{ Wizard?.close?.(); }catch(_e){}
      try{
        document.querySelectorAll('.modal.is-open, .drawer.is-open').forEach((el) => {
          if(el !== this.els.modal) el.classList.remove('is-open');
        });
      }catch(_e){}
      this.clearStatus();
      this.els.modal.classList.add("is-open");
      this.els.modal.setAttribute("aria-hidden", "false");
      document.body.classList.add("modal-open");
    },
    close(){
      if(!this.els.modal) return;
      this.clearStatus();
      this.els.modal.classList.remove("is-open");
      this.els.modal.setAttribute("aria-hidden", "true");
      const hasOtherOpenModal = !!document.querySelector('.modal.is-open, .drawer.is-open, .lcWizard.is-open');
      if(!hasOtherOpenModal) document.body.classList.remove("modal-open");
    },
    clearStatus(){
      if(this.statusTimer){
        window.clearTimeout(this.statusTimer);
        this.statusTimer = null;
      }
      if(this.els.status){
        this.els.status.classList.remove("is-visible", "is-dev", "is-ready");
        this.els.status.textContent = "";
      }
    },
    showStatus(message, tone = "dev"){
      if(!this.els.status) return;
      this.els.status.textContent = message || "";
      this.els.status.classList.add("is-visible");
      this.els.status.classList.toggle("is-dev", tone === "dev");
      this.els.status.classList.toggle("is-ready", tone === "ready");
      if(tone === "dev"){
        this.statusTimer = window.setTimeout(() => this.clearStatus(), 2400);
      }
    },
    handleType(type){
      if(type === "health"){
        this.showStatus("פותח את וויזארד בריאות וסיכונים…", "ready");
        window.setTimeout(() => {
          this.close();
          try{
            prepareInteractiveWizardOpen();
            Wizard.reset();
            Wizard.open();
          }catch(err){
            console.error("NEW_CUSTOMER_HEALTH_OPEN_FAILED:", err);
            this.showStatus("אירעה תקלה בפתיחת הוויזארד", "dev");
          }
        }, 140);
        return;
      }
      if(type === "elementary"){
        this.showStatus("פותח את וויזארד אלמנטרי…", "ready");
        window.setTimeout(() => {
          this.close();
          try{
            prepareInteractiveWizardOpen();
            Wizard.resetElementary();
            Wizard.open();
          }catch(err){
            console.error("NEW_CUSTOMER_ELEMENTARY_OPEN_FAILED:", err);
            this.showStatus("אירעה תקלה בפתיחת וויזארד אלמנטרי", "dev");
          }
        }, 140);
        return;
      }
      if(type === "pension"){
        this.showStatus("פנסיה — תהליך בפיתוח", "dev");
      }
    }
  };

  const LeadShellUI = {
    AUTO_CLOSE_MS: 3200,
    els: {},
    autoCloseHandle: null,
    init(){
      this.els.btnOpen = document.getElementById("btnOpenLeadShell");
      this.els.modal = document.getElementById("lcLeadShell");
      this.els.btnClose = document.getElementById("btnCloseLeadShell");
      if(!this.els.btnOpen || !this.els.modal) return;
      on(this.els.btnOpen, "click", (ev) => { ev.preventDefault(); ev.stopPropagation(); this.open(); });
      on(this.els.btnClose, "click", (ev) => { ev.preventDefault(); this.close(); });
      on(this.els.modal, "click", (ev) => {
        const closeHit = ev.target && (ev.target.dataset?.close === "1" || ev.target.classList?.contains("lcLeadShell__backdrop"));
        if(closeHit) this.close();
      });
      document.addEventListener("keydown", (ev) => {
        if(ev.key === "Escape" && this.isOpen()) this.close();
      });
    },
    isOpen(){
      return !!this.els.modal && this.els.modal.classList.contains("is-open");
    },
    startAutoClose(){
      this.stopAutoClose();
      this.autoCloseHandle = window.setTimeout(() => this.close(), this.AUTO_CLOSE_MS);
    },
    stopAutoClose(){
      if(this.autoCloseHandle){
        window.clearTimeout(this.autoCloseHandle);
        this.autoCloseHandle = null;
      }
    },
    open(){
      try{ if(window.Wizard && typeof Wizard.close === "function") Wizard.close(); }catch(_e){}
      try{ document.querySelectorAll('.modal.is-open, .drawer.is-open').forEach((el) => { if(el !== this.els.modal) el.classList.remove('is-open'); }); }catch(_e){}
      if(!this.els.modal) return;
      this.stopAutoClose();
      this.els.modal.classList.add("is-open");
      this.els.modal.setAttribute("aria-hidden", "false");
      document.body.classList.add("modal-open", "lcLeadShellOpen");
      this.startAutoClose();
    },
    close(){
      if(!this.els.modal) return;
      this.stopAutoClose();
      this.els.modal.classList.remove("is-open");
      this.els.modal.setAttribute("aria-hidden", "true");
      document.body.classList.remove("lcLeadShellOpen");
      const hasOtherOpenModal = !!document.querySelector('.modal.is-open, .drawer.is-open');
      if(!hasOtherOpenModal) document.body.classList.remove("modal-open");
    }
  };


  const ChatUI = {
    els: {},
    client: null,
    ready: false,
    enabled: false,
    initStarted: false,
    userKey: "",
    currentUser: null,
    selectedUser: null,
    currentConversationId: "",
    usersMap: new Map(),
    currentMessages: [],
    lastMessageByConversation: new Map(),
    unreadByConversation: new Map(),
    userSearchTerm: "",
    dragState: null,
    presenceChannel: null,
    messagesChannel: null,
    typingTimer: null,
    notifyAudioCtx: null,
    cleanupTimer: null,
    retentionMs: Math.max(60000, Number(SUPABASE_CHAT.retentionMinutes || 5) * 60000),
    typingWindowMs: Math.max(1200, Number(SUPABASE_CHAT.typingWindowMs || 2200)),
    fabDrag: null,
    fabWasDragged: false,

    init(){
      this.els = {
        fab: $("#giChatFab"),
        fabBadge: $("#giChatFabBadge"),
        window: $("#giChatWindow"),
        close: $("#giChatClose"),
        minimize: $("#giChatMinimize"),
        dragHandle: $("#giChatDragHandle"),
        meAvatar: $("#giChatMeAvatar"),
        meName: $("#giChatMeName"),
        meRole: $("#giChatMeRole"),
        connectionStatus: $("#giChatConnectionStatus"),
        userSearch: $("#giChatUserSearch"),
        usersList: $("#giChatUsersList"),
        setupHint: $("#giChatSetupHint"),
        empty: $("#giChatEmptyState"),
        conversation: $("#giChatConversation"),
        peerAvatar: $("#giChatPeerAvatar"),
        peerName: $("#giChatPeerName"),
        peerStatus: $("#giChatPeerStatus"),
        messages: $("#giChatMessages"),
        typing: $("#giChatTypingIndicator"),
        typingText: $("#giChatTypingText"),
        settingsBtn: $("#giChatSettingsBtn"),
        settingsModal: $("#giChatSettingsModal"),
        settingsClose: $("#giChatSettingsClose"),
        settingsBackdrop: $("#giChatSettingsBackdrop"),
        settingsFile: $("#giChatAvatarFile"),
        settingsSave: $("#giChatAvatarSave"),
        settingsRemove: $("#giChatAvatarRemove"),
        settingsPreview: $("#giChatAvatarPreview"),
        settingsHint: $("#giChatAvatarHint"),
        settingsName: $("#giChatSettingsName"),
        inputWrap: $("#giChatComposerWrap"),
        emojiToggle: $("#giChatEmojiToggle"),
        emojiPanel: $("#giChatEmojiPanel"),
        input: $("#giChatInput"),
        send: $("#giChatSend"),
        toasts: $("#giChatToasts")
      };
      if(!this.els.fab || !this.els.window) return;

      on(this.els.fab, "click", (ev) => {
        if(this.fabWasDragged){
          this.fabWasDragged = false;
          ev.preventDefault();
          ev.stopPropagation();
          return;
        }
        this.toggleWindow();
      });
      on(this.els.fab, "keydown", (ev) => {
        if(ev.key === "Enter" || ev.key === " "){
          ev.preventDefault();
          this.toggleWindow();
        }
      });
      on(this.els.close, "click", () => this.closeWindow());
      on(this.els.minimize, "click", () => this.closeWindow());
      on(this.els.settingsBtn, "click", (ev) => { ev.preventDefault(); ev.stopPropagation(); this.openSettingsModal(); });
      on(this.els.settingsClose, "click", () => this.closeSettingsModal());
      on(this.els.settingsBackdrop, "click", () => this.closeSettingsModal());
      on(this.els.settingsFile, "change", () => this.handleAvatarFileChange());
      on(this.els.settingsSave, "click", () => this.saveAvatarSettings());
      on(this.els.settingsRemove, "click", () => this.removeAvatarSettings());
      on(this.els.userSearch, "input", () => {
        this.userSearchTerm = safeTrim(this.els.userSearch?.value).toLowerCase();
        this.renderUsers();
      });
      on(this.els.send, "click", () => this.sendMessage());
      on(this.els.emojiToggle, "click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        this.toggleEmojiPanel();
      });
      $$('[data-chat-emoji]', this.els.emojiPanel).forEach((btn) => on(btn, 'click', () => this.insertEmoji(btn.dataset.chatEmoji || '')));
      on(document, 'click', (ev) => {
        if(!this.els.emojiPanel || !this.els.emojiToggle || !this.els.inputWrap) return;
        const target = ev.target;
        if(this.els.inputWrap.contains(target)) return;
        this.closeEmojiPanel();
      });
      on(this.els.input, "keydown", (ev) => {
        if(ev.key === "Escape"){
          this.closeEmojiPanel();
          return;
        }
        if(ev.key === "Enter" && !ev.shiftKey){
          ev.preventDefault();
          this.sendMessage();
          return;
        }
        this.handleTypingPulse();
      });
      on(this.els.input, "input", () => {
        this.autoGrowInput();
        this.handleTypingPulse();
        this.refreshSendButtonState();
      });
      on(window, 'beforeunload', () => this.teardownRealtime(true));
      on(window, 'resize', () => this.clampFabToViewport());
      this.initDrag();
      this.initFabDrag();
      this.syncVisibility('global');
    },

    async ensureStarted(){
      if(this.initStarted) return;
      this.initStarted = true;
      this.refreshCurrentUser();
      this.renderMe();
      this.refreshSendButtonState();
      this.enabled = !!(SUPABASE_CHAT.enabled && this.currentUser && Storage?.getClient);
      if(!this.enabled){
        this.setConnectionStatus("צ׳אט Supabase כבוי כרגע", "warn");
        this.els.setupHint?.classList.remove("is-hidden");
        this.renderUsers();
        return;
      }
      try {
        this.client = Storage.getClient();
        await this.connectPresence();
        this.listenMessages();
        this.startCleanupLoop();
        this.ready = true;
        this.els.setupHint?.classList.add("is-hidden");
        this.setConnectionStatus("צ׳אט לייב מחובר", "ok");
        this.renderUsers();
      } catch(err){
        console.error("CHAT_SUPABASE_INIT_FAILED", err);
        this.enabled = false;
        this.ready = false;
        this.setConnectionStatus("שגיאה בחיבור צ׳אט Supabase", "err");
        this.els.setupHint?.classList.remove("is-hidden");
      }
    },

    refreshCurrentUser(){
      if(!Auth.current) return;
      const roleMap = { admin:"מנהל מערכת", manager:"מנהל", ops:"נציג תפעול", agent:"נציג" };
      const sourceAgent = (Array.isArray(State.data?.agents) ? State.data.agents : []).find((a) => safeTrim(a?.name) === safeTrim(Auth.current?.name) || safeTrim(a?.username) === safeTrim(Auth.current?.name));
      const currentUserId = this.userIdFromAgent(sourceAgent || { id: Auth.current?.name, username: Auth.current?.name, name: Auth.current?.name });
      const avatarEntry = getChatAvatarEntry(currentUserId) || {};
      this.currentUser = {
        id: currentUserId,
        name: safeTrim(Auth.current?.name) || "משתמש",
        role: roleMap[Auth.current?.role] || "נציג",
        rawRole: Auth.current?.role || "agent",
        avatar: safeTrim(avatarEntry.image || ""),
        avatarUpdatedAt: safeTrim(avatarEntry.updatedAt || "")
      };
      this.userKey = this.currentUser.id;
    },

    userIdFromAgent(agent){
      if(!agent) return "";
      return this.normalizeKey((safeTrim(agent.id) || safeTrim(agent.name) || 'agent') + '__' + (safeTrim(agent.username) || safeTrim(agent.name) || ''));
    },

    renderMe(){
      this.refreshCurrentUser();
      if(!this.currentUser) return;
      this.renderAvatarNode(this.els.meAvatar, this.currentUser, "giChatSidebar__meAvatar");
      if(this.els.meName) this.els.meName.textContent = this.currentUser.name;
      if(this.els.meRole) this.els.meRole.textContent = this.currentUser.role;
      if(this.els.settingsName) this.els.settingsName.textContent = this.currentUser.name;
      this.renderSettingsPreview();
    },

    avatarUrlForUser(user){
      const entry = getChatAvatarEntry(user?.id || "") || null;
      const fromPresence = safeTrim(user?.avatar || user?.avatarUrl || "");
      return fromPresence || safeTrim(entry?.image || "");
    },

    avatarMarkup(user, className, extraClass=""){
      const url = this.avatarUrlForUser(user);
      const label = this.escapeHtml(this.initials(user?.name || "נציג"));
      const classes = [className, extraClass].filter(Boolean).join(" ");
      if(url){
        return `<div class="${classes}"><img src="${this.escapeAttr(url)}" alt="${this.escapeAttr(user?.name || "avatar")}" class="giChatAvatarImg"></div>`;
      }
      return `<div class="${classes}">${label}</div>`;
    },

    renderAvatarNode(el, user, className){
      if(!el) return;
      el.className = className;
      const url = this.avatarUrlForUser(user);
      if(url){
        el.innerHTML = `<img src="${this.escapeAttr(url)}" alt="${this.escapeAttr(user?.name || "avatar")}" class="giChatAvatarImg">`;
      } else {
        el.textContent = this.initials(user?.name || "נציג");
      }
    },

    normalizeKey(v){
      return String(v || "")
        .normalize("NFKD")
        .replace(/[^\w֐-׿-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .toLowerCase() || "user";
    },

    initials(name){
      const parts = safeTrim(name).split(/\s+/).filter(Boolean);
      return (parts.slice(0,2).map((p) => p.charAt(0)).join("") || "GI").slice(0,2).toUpperCase();
    },

    syncVisibility(view){
      const canShowChat = !!Auth.current && !document.body.classList.contains('lcAuthLock');
      if(!canShowChat){
        this.hideFab();
        this.closeWindow(false, true);
        return;
      }
      if(this.els.window?.classList.contains("is-hidden")) this.showFab();
    },

    showFab(){
      const fab = this.els.fab;
      if(!fab) return;
      const hadInlinePosition = this.hasInlineFabPosition();
      const hasSavedPosition = this.hasSavedFabPosition();
      fab.classList.remove('is-hidden');
      if(hasSavedPosition){
        this.restoreFabPosition();
        return;
      }
      if(hadInlinePosition){
        this.clampFabToViewport();
        return;
      }
      requestAnimationFrame(() => {
        this.captureFabPosition(true);
      });
    },

    hideFab(){
      this.els.fab?.classList.add('is-hidden');
    },

    chatFabStorageKey(){
      return `${CHAT_FAB_STORAGE_KEY}__${this.userKey || 'guest'}`;
    },
    hasInlineFabPosition(){
      const fab = this.els.fab;
      if(!fab) return false;
      return !!(fab.style.left && fab.style.left !== 'auto' && fab.style.top && fab.style.top !== 'auto');
    },

    hasSavedFabPosition(){
      try {
        const payload = JSON.parse(localStorage.getItem(this.chatFabStorageKey()) || 'null');
        return !!(payload && Number.isFinite(Number(payload.left)) && Number.isFinite(Number(payload.top)));
      } catch(_e) {
        return false;
      }
    },

    captureFabPosition(shouldPersist=false){
      const fab = this.els.fab;
      if(!fab || fab.classList.contains('is-hidden')) return;
      const rect = fab.getBoundingClientRect();
      if(!(rect.width > 0 && rect.height > 0)) return;
      fab.style.left = Math.round(rect.left) + 'px';
      fab.style.top = Math.round(rect.top) + 'px';
      fab.style.bottom = 'auto';
      fab.style.right = 'auto';
      this.clampFabToViewport();
      if(shouldPersist) this.saveFabPosition();
    },

    applyDefaultFabPosition(){
      const fab = this.els.fab;
      if(!fab) return;
      const computed = window.getComputedStyle(fab);
      const width = fab.offsetWidth || parseFloat(computed.width) || 64;
      const height = fab.offsetHeight || parseFloat(computed.height) || 64;
      const left = Number.parseFloat(computed.left);
      const bottom = Number.parseFloat(computed.bottom);
      const fallbackLeft = Number.isFinite(left) ? left : 22;
      const fallbackBottom = Number.isFinite(bottom) ? bottom : 22;
      const fallbackTop = Math.max(12, window.innerHeight - height - fallbackBottom);
      fab.style.left = Math.round(fallbackLeft) + 'px';
      fab.style.top = Math.round(fallbackTop) + 'px';
      fab.style.bottom = 'auto';
      fab.style.right = 'auto';
    },

    restoreFabPosition(){
      const fab = this.els.fab;
      if(!fab) return;
      let payload = null;
      try {
        payload = JSON.parse(localStorage.getItem(this.chatFabStorageKey()) || 'null');
      } catch(_e) {}
      fab.style.right = 'auto';
      if(payload && Number.isFinite(Number(payload.left)) && Number.isFinite(Number(payload.top))){
        fab.style.left = Number(payload.left) + 'px';
        fab.style.top = Number(payload.top) + 'px';
        fab.style.bottom = 'auto';
      } else if(!this.hasInlineFabPosition()) {
        this.applyDefaultFabPosition();
      }
      this.clampFabToViewport();
    },

    saveFabPosition(){
      const fab = this.els.fab;
      if(!fab || !this.userKey) return;
      const rect = fab.getBoundingClientRect();
      try {
        localStorage.setItem(this.chatFabStorageKey(), JSON.stringify({ left: Math.round(rect.left), top: Math.round(rect.top) }));
      } catch(_e) {}
    },

    clampFabToViewport(){
      const fab = this.els.fab;
      if(!fab) return;
      const rect = fab.getBoundingClientRect();
      const maxX = Math.max(12, window.innerWidth - rect.width - 12);
      const maxY = Math.max(12, window.innerHeight - rect.height - 12);
      const hasCustomTop = fab.style.top && fab.style.top !== 'auto';
      const hasCustomLeft = fab.style.left && fab.style.left !== 'auto';
      if(!hasCustomTop && !hasCustomLeft) return;
      const nextLeft = Math.min(maxX, Math.max(12, rect.left));
      const nextTop = Math.min(maxY, Math.max(12, rect.top));
      fab.style.left = nextLeft + 'px';
      fab.style.top = nextTop + 'px';
      fab.style.bottom = 'auto';
      fab.style.right = 'auto';
      this.saveFabPosition();
    },

    initFabDrag(){
      const fab = this.els.fab;
      if(!fab) return;
      const stopDrag = () => {
        if(!this.fabDrag) return;
        const moved = !!this.fabDrag.moved;
        this.fabDrag = null;
        fab.classList.remove('is-dragging');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', stopDrag);
        if(moved){
          this.fabWasDragged = true;
          this.saveFabPosition();
          setTimeout(() => { this.fabWasDragged = false; }, 80);
        }
      };
      const onMove = (ev) => {
        if(!this.fabDrag) return;
        ev.preventDefault();
        const nextLeft = ev.clientX - this.fabDrag.offsetX;
        const nextTop = ev.clientY - this.fabDrag.offsetY;
        const maxX = Math.max(12, window.innerWidth - fab.offsetWidth - 12);
        const maxY = Math.max(12, window.innerHeight - fab.offsetHeight - 12);
        const clampedLeft = Math.min(maxX, Math.max(12, nextLeft));
        const clampedTop = Math.min(maxY, Math.max(12, nextTop));
        if(Math.abs(clampedLeft - this.fabDrag.startLeft) > CHAT_FAB_DRAG_THRESHOLD || Math.abs(clampedTop - this.fabDrag.startTop) > CHAT_FAB_DRAG_THRESHOLD){
          this.fabDrag.moved = true;
        }
        fab.style.left = clampedLeft + 'px';
        fab.style.top = clampedTop + 'px';
        fab.style.bottom = 'auto';
        fab.style.right = 'auto';
      };
      on(fab, 'mousedown', (ev) => {
        if(ev.button !== 0) return;
        if(!Auth.current) return;
        const rect = fab.getBoundingClientRect();
        this.fabDrag = {
          offsetX: ev.clientX - rect.left,
          offsetY: ev.clientY - rect.top,
          startLeft: rect.left,
          startTop: rect.top,
          moved: false
        };
        fab.classList.add('is-dragging');
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', stopDrag);
      });
    },

    toggleWindow(){
      const hidden = this.els.window?.classList.contains("is-hidden");
      if(hidden) this.openWindow();
      else this.closeWindow();
    },

    openWindow(){
      this.captureFabPosition(true);
      this.els.window?.classList.remove("is-hidden");
      this.hideFab();
      this.ensureStarted();
      this.resetUnreadForSelected();
      this.els.input?.focus?.();
    },

    closeWindow(forceKeepFab=false, skipSync=false){
      this.els.window?.classList.add("is-hidden");
      const shouldShowFab = !!Auth.current && !document.body.classList.contains('lcAuthLock');
      if(shouldShowFab && !skipSync) this.showFab();
      else if(!shouldShowFab) this.hideFab();
      this.closeEmojiPanel();
      this.setTyping(false);
    },

    initDrag(){
      const win = this.els.window;
      const handle = this.els.dragHandle;
      if(!win || !handle) return;
      const onMove = (ev) => {
        if(!this.dragState) return;
        ev.preventDefault();
        const x = ev.clientX - this.dragState.offsetX;
        const y = ev.clientY - this.dragState.offsetY;
        const maxX = Math.max(8, window.innerWidth - win.offsetWidth - 8);
        const maxY = Math.max(8, window.innerHeight - win.offsetHeight - 8);
        win.style.left = Math.min(maxX, Math.max(8, x)) + 'px';
        win.style.top = Math.min(maxY, Math.max(8, y)) + 'px';
        win.style.bottom = 'auto';
      };
      const stop = () => {
        if(!this.dragState) return;
        this.dragState = null;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', stop);
      };
      on(handle, 'mousedown', (ev) => {
        const rect = win.getBoundingClientRect();
        this.dragState = { offsetX: ev.clientX - rect.left, offsetY: ev.clientY - rect.top };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', stop);
      });
    },

    autoGrowInput(){
      if(!this.els.input) return;
      this.els.input.style.height = 'auto';
      this.els.input.style.height = Math.min(132, Math.max(46, this.els.input.scrollHeight)) + 'px';
    },

    toggleEmojiPanel(){
      if(!this.els.emojiPanel || !this.els.emojiToggle) return;
      const willOpen = this.els.emojiPanel.classList.contains('is-hidden');
      if(willOpen) this.openEmojiPanel();
      else this.closeEmojiPanel();
    },

    openEmojiPanel(){
      if(!this.els.emojiPanel || !this.els.emojiToggle) return;
      this.els.emojiPanel.classList.remove('is-hidden');
      this.els.emojiPanel.setAttribute('aria-hidden', 'false');
      this.els.emojiToggle.setAttribute('aria-expanded', 'true');
    },

    closeEmojiPanel(){
      if(!this.els.emojiPanel || !this.els.emojiToggle) return;
      this.els.emojiPanel.classList.add('is-hidden');
      this.els.emojiPanel.setAttribute('aria-hidden', 'true');
      this.els.emojiToggle.setAttribute('aria-expanded', 'false');
    },

    insertEmoji(emoji){
      if(!this.els.input || !emoji) return;
      const input = this.els.input;
      const start = Number(input.selectionStart || 0);
      const end = Number(input.selectionEnd || start);
      const value = String(input.value || '');
      input.value = value.slice(0, start) + emoji + value.slice(end);
      const nextPos = start + emoji.length;
      try { input.setSelectionRange(nextPos, nextPos); } catch(_e) {}
      this.autoGrowInput();
      this.refreshSendButtonState();
      this.handleTypingPulse();
      input.focus();
    },

    async connectPresence(){
      if(!this.client || !this.userKey) throw new Error('CHAT_NO_CLIENT');
      this.presenceChannel = this.client.channel(SUPABASE_CHAT.presenceTopic || 'invest-chat-presence-room', {
        config: { presence: { key: this.userKey } }
      });
      this.presenceChannel
        .on('presence', { event: 'sync' }, () => {
          this.renderUsers();
          this.renderPeerMeta();
          this.renderTypingIndicator();
        })
        .on('presence', { event: 'join' }, () => {
          this.renderUsers();
          this.renderPeerMeta();
          this.renderTypingIndicator();
        })
        .on('presence', { event: 'leave' }, () => {
          this.renderUsers();
          this.renderPeerMeta();
          this.renderTypingIndicator();
        });
      await new Promise((resolve, reject) => {
        this.presenceChannel.subscribe(async (status) => {
          if(status === 'SUBSCRIBED'){
            try {
              await this.presenceChannel.track(this.buildPresencePayload());
              resolve();
            } catch(err){ reject(err); }
          } else if(status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED'){
            reject(new Error('PRESENCE_' + status));
          }
        });
      });
    },

    buildPresencePayload(extra={}){
      return {
        userId: this.userKey,
        name: this.currentUser?.name || 'נציג',
        role: this.currentUser?.role || 'נציג',
        rawRole: this.currentUser?.rawRole || 'agent',
        avatar: this.avatarUrlForUser(this.currentUser || {}),
        avatarUpdatedAt: this.currentUser?.avatarUpdatedAt || safeTrim(getChatAvatarEntry(this.userKey)?.updatedAt || ''),
        onlineAt: nowISO(),
        updatedAt: Date.now(),
        typingTo: '',
        typingUntil: 0,
        ...extra
      };
    },

    getPresenceState(){
      if(!this.presenceChannel) return {};
      try { return this.presenceChannel.presenceState() || {}; } catch(_e){ return {}; }
    },

    getPresenceMap(){
      const raw = this.getPresenceState();
      const map = new Map();
      Object.entries(raw).forEach(([key, arr]) => {
        const latest = Array.isArray(arr) && arr.length ? arr[arr.length - 1] : null;
        if(latest) map.set(key, latest);
      });
      return map;
    },

    availableUsers(){
      const agents = Array.isArray(State.data?.agents) ? State.data.agents.filter((a) => a?.active !== false) : [];
      const presence = this.getPresenceMap();
      return agents
        .map((agent) => {
          const id = this.userIdFromAgent(agent);
          const pres = presence.get(id) || null;
          return {
            id,
            name: safeTrim(agent?.name) || 'נציג',
            role: this.roleLabel(safeTrim(agent?.role) || 'agent'),
            rawRole: safeTrim(agent?.role) || 'agent',
            avatar: safeTrim(pres?.avatar || '') || safeTrim(getChatAvatarEntry(id)?.image || ''),
            avatarUpdatedAt: safeTrim(pres?.avatarUpdatedAt || '') || safeTrim(getChatAvatarEntry(id)?.updatedAt || ''),
            online: !!pres,
            updatedAt: Number(pres?.updatedAt || 0) || 0,
            typingTo: safeTrim(pres?.typingTo),
            typingUntil: Number(pres?.typingUntil || 0) || 0
          };
        })
        .filter((user) => user.id && user.id !== this.userKey)
        .sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name, 'he'));
    },

    roleLabel(raw){
      return ({ admin:'מנהל מערכת', manager:'מנהל', ops:'נציג תפעול', agent:'נציג' })[raw] || 'נציג';
    },

    renderUsers(){
      const wrap = this.els.usersList;
      if(!wrap) return;
      const term = this.userSearchTerm;
      const users = this.availableUsers().filter((user) => !term || user.name.toLowerCase().includes(term) || user.role.toLowerCase().includes(term));
      this.usersMap = new Map(users.map((user) => [user.id, user]));
      if(!users.length){
        wrap.innerHTML = '<div class="giChatSidebar__setupHint" style="display:block;margin:0 6px 8px;">אין כרגע נציגים זמינים להצגה.</div>';
        return;
      }
      wrap.innerHTML = users.map((user) => {
        const active = this.selectedUser?.id === user.id;
        const preview = this.lastMessageByConversation.get(this.conversationId(user.id));
        const unread = this.unreadByConversation.get(this.conversationId(user.id)) || 0;
        const status = user.online ? (this.isUserTyping(user.id) ? 'מקליד עכשיו…' : 'מחובר עכשיו') : 'לא מחובר';
        return `
          <button class="giChatUser ${active ? "is-active" : ""}" type="button" data-chat-user="${this.escapeAttr(user.id)}">
            <div class="giChatUser__avatarWrap">
              ${this.avatarMarkup(user, "giChatUser__avatar")}
              ${user.online ? '<span class="giChatUser__onlineDot"></span>' : ''}
            </div>
            <div class="giChatUser__meta">
              <div class="giChatUser__name">${this.escapeHtml(user.name)}</div>
              <div class="giChatUser__status">${this.escapeHtml(preview?.text || status)}</div>
            </div>
            ${unread ? `<span class="giChatUser__unread">${Math.min(unread,99)}</span>` : ''}
          </button>`;
      }).join('');
      $$('[data-chat-user]', wrap).forEach((btn) => on(btn, 'click', () => this.selectUser(btn.dataset.chatUser || '')));
    },

    async selectUser(userId){
      const user = this.usersMap.get(userId) || this.availableUsers().find((item) => item.id === userId);
      if(!user) return;
      this.selectedUser = user;
      this.currentConversationId = this.conversationId(user.id);
      this.currentMessages = [];
      this.renderConversationShell();
      this.closeEmojiPanel();
      this.resetUnreadForSelected();
      await this.loadConversationHistory();
      this.renderPeerMeta();
      this.renderTypingIndicator();
      this.els.input?.focus?.();
    },

    renderConversationShell(){
      this.els.empty?.classList.add('is-hidden');
      this.els.conversation?.classList.remove('is-hidden');
      this.renderAvatarNode(this.els.peerAvatar, this.selectedUser || {}, "giChatConversation__avatar");
      if(this.els.peerName) this.els.peerName.textContent = this.selectedUser?.name || '--';
      this.renderMessages();
    },

    renderPeerMeta(){
      if(!this.selectedUser) return;
      const latest = this.availableUsers().find((u) => u.id === this.selectedUser.id) || this.selectedUser;
      this.selectedUser = latest;
      this.renderAvatarNode(this.els.peerAvatar, latest || {}, "giChatConversation__avatar");
      if(this.els.peerName) this.els.peerName.textContent = latest.name || '--';
      if(this.els.peerStatus){
        this.els.peerStatus.textContent = this.isUserTyping(latest.id)
          ? 'מקליד עכשיו…'
          : (latest.online ? 'מחובר עכשיו' : 'לא מחובר כרגע');
      }
      this.renderUsers();
    },

    async loadConversationHistory(){
      if(!this.client || !this.currentConversationId) return;
      try {
        const { data, error } = await this.client
          .from(SUPABASE_CHAT.messagesTable)
          .select('id,conversation_id,sender_id,sender_name,recipient_id,recipient_name,body,created_at,expires_at')
          .eq('conversation_id', this.currentConversationId)
          .gt('expires_at', nowISO())
          .order('created_at', { ascending: true })
          .limit(120);
        if(error) throw error;
        this.currentMessages = (Array.isArray(data) ? data : []).map((row) => this.normalizeMessage(row));
        const last = this.currentMessages[this.currentMessages.length - 1];
        if(last) this.lastMessageByConversation.set(this.currentConversationId, { text: last.text, at: last.createdAt, fromId: last.fromId });
        this.renderMessages();
      } catch(err){
        console.error('CHAT_LOAD_HISTORY_FAILED', err);
        this.setConnectionStatus('יש להריץ SQL של צ׳אט ב-Supabase', 'err');
        this.els.setupHint?.classList.remove('is-hidden');
      }
    },

    listenMessages(){
      if(!this.client || !this.userKey) return;
      this.messagesChannel = this.client
        .channel('invest-chat-db-' + this.userKey)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: SUPABASE_CHAT.messagesTable
        }, (payload) => this.handleIncomingDbInsert(payload?.new))
        .subscribe((status) => {
          if(status === 'SUBSCRIBED') this.setConnectionStatus('צ׳אט לייב מחובר', 'ok');
          else if(status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') this.setConnectionStatus('Realtime של הצ׳אט לא זמין', 'err');
        });
    },

    handleIncomingDbInsert(row){
      const msg = this.normalizeMessage(row);
      if(!msg || msg.expiresAt <= Date.now()) return;
      if(msg.fromId !== this.userKey && msg.toId !== this.userKey) return;
      const convoId = msg.conversationId;
      this.lastMessageByConversation.set(convoId, { text: msg.text, at: msg.createdAt, fromId: msg.fromId });
      if(this.currentConversationId === convoId){
        if(!this.currentMessages.some((item) => String(item.id) === String(msg.id))){
          this.currentMessages.push(msg);
          this.currentMessages.sort((a, b) => a.createdAt - b.createdAt);
          this.renderMessages();
        }
        if(msg.fromId !== this.userKey && !this.els.window?.classList.contains('is-hidden')) this.resetUnreadForSelected();
      }
      if(msg.fromId !== this.userKey) this.notifyIncoming(msg);
      this.renderUsers();
    },

    normalizeMessage(row){
      if(!row) return null;
      return {
        id: row.id,
        conversationId: safeTrim(row.conversation_id),
        fromId: safeTrim(row.sender_id),
        fromName: safeTrim(row.sender_name),
        toId: safeTrim(row.recipient_id),
        toName: safeTrim(row.recipient_name),
        text: safeTrim(row.body),
        createdAt: Date.parse(row.created_at || nowISO()) || Date.now(),
        expiresAt: Date.parse(row.expires_at || nowISO()) || (Date.now() + this.retentionMs)
      };
    },

    renderMessages(){
      const host = this.els.messages;
      if(!host) return;
      const fresh = this.currentMessages.filter((msg) => Number(msg.expiresAt || 0) > Date.now());
      this.currentMessages = fresh;
      host.innerHTML = fresh.length ? fresh.map((msg) => {
        const mine = msg.fromId === this.userKey;
        const user = mine ? this.currentUser : (this.usersMap.get(msg.fromId) || { id: msg.fromId, name: msg.fromName || 'נציג' });
        return `
          <div class="giChatMsg ${mine ? 'giChatMsg--mine' : 'giChatMsg--peer'}">
            <div class="giChatMsg__row">
              ${this.avatarMarkup(user, "giChatMsg__avatar")}
              <div class="giChatMsg__body">
                <div class="giChatMsg__bubble">${this.escapeHtml(msg.text || '')}</div>
                <div class="giChatMsg__meta">
                  <span>${this.escapeHtml(mine ? 'אתה' : (msg.fromName || 'נציג'))}</span>
                  <span>${this.formatClock(msg.createdAt)}</span>
                </div>
              </div>
            </div>
          </div>`;
      }).join('') : '<div class="giChatPanel__emptyText" style="padding:18px 10px;">אין עדיין הודעות בשיחה הזו.</div>';
      host.scrollTop = host.scrollHeight + 120;
      this.renderTypingIndicator();
    },

    isUserTyping(userId){
      const user = this.availableUsers().find((item) => item.id === userId);
      return !!(user && user.typingTo === this.currentConversationId && Number(user.typingUntil || 0) > Date.now());
    },

    renderTypingIndicator(){
      if(!this.els.typing || !this.els.typingText) return;
      if(this.selectedUser && this.isUserTyping(this.selectedUser.id)){
        this.els.typing.classList.remove('is-hidden');
        this.els.typingText.textContent = `${this.selectedUser.name} מקליד עכשיו…`;
      } else {
        this.els.typing.classList.add('is-hidden');
      }
      this.renderPeerMetaSilent();
    },

    renderPeerMetaSilent(){
      if(!this.selectedUser || !this.els.peerStatus) return;
      const user = this.availableUsers().find((item) => item.id === this.selectedUser.id) || this.selectedUser;
      this.els.peerStatus.textContent = this.isUserTyping(user.id) ? 'מקליד עכשיו…' : (user.online ? 'מחובר עכשיו' : 'לא מחובר כרגע');
    },

    openSettingsModal(){
      this.renderMe();
      if(this.els.settingsModal){
        this.els.settingsModal.classList.add('is-open');
        this.els.settingsModal.setAttribute('aria-hidden', 'false');
      }
    },

    closeSettingsModal(){
      if(this.els.settingsModal){
        this.els.settingsModal.classList.remove('is-open');
        this.els.settingsModal.setAttribute('aria-hidden', 'true');
      }
      if(this.els.settingsFile) this.els.settingsFile.value = '';
      this.pendingAvatarDataUrl = '';
      this.renderSettingsPreview();
      this.setSettingsHint('');
    },

    setSettingsHint(msg, tone=''){
      const el = this.els.settingsHint;
      if(!el) return;
      el.textContent = safeTrim(msg);
      el.classList.remove('is-success', 'is-error');
      if(tone === 'success') el.classList.add('is-success');
      if(tone === 'error') el.classList.add('is-error');
    },

    renderSettingsPreview(){
      const host = this.els.settingsPreview;
      if(!host) return;
      const previewUrl = safeTrim(this.pendingAvatarDataUrl) || this.avatarUrlForUser(this.currentUser || {});
      const initials = this.escapeHtml(this.initials(this.currentUser?.name || 'נציג'));
      host.innerHTML = previewUrl
        ? `<img src="${this.escapeAttr(previewUrl)}" alt="avatar" class="giChatAvatarPreview__img">`
        : `<span class="giChatAvatarPreview__initials">${initials}</span>`;
    },

    async handleAvatarFileChange(){
      const file = this.els.settingsFile?.files?.[0];
      if(!file) return;
      const isImage = /^image\//i.test(file.type || '');
      if(!isImage){
        this.setSettingsHint('יש לבחור קובץ תמונה בלבד.', 'error');
        return;
      }
      try {
        this.setSettingsHint('מכין תצוגה מקדימה…');
        this.pendingAvatarDataUrl = await this.compressAvatarFile(file);
        this.renderSettingsPreview();
        this.setSettingsHint('התמונה מוכנה. לחץ שמור כדי לעדכן את הצ׳אט.', 'success');
      } catch(err){
        console.error('CHAT_AVATAR_PREVIEW_FAILED', err);
        this.setSettingsHint('לא הצלחתי לעבד את התמונה. נסה קובץ אחר.', 'error');
      }
    },

    compressAvatarFile(file){
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('FILE_READ_FAILED'));
        reader.onload = () => {
          const img = new Image();
          img.onload = () => {
            try {
              const maxSide = 320;
              const side = Math.min(img.width || maxSide, img.height || maxSide) || maxSide;
              const sx = Math.max(0, ((img.width || side) - side) / 2);
              const sy = Math.max(0, ((img.height || side) - side) / 2);
              const canvas = document.createElement('canvas');
              canvas.width = maxSide;
              canvas.height = maxSide;
              const ctx = canvas.getContext('2d');
              if(!ctx) throw new Error('NO_CANVAS_CONTEXT');
              ctx.drawImage(img, sx, sy, side, side, 0, 0, maxSide, maxSide);
              resolve(canvas.toDataURL('image/jpeg', 0.86));
            } catch(err){
              reject(err);
            }
          };
          img.onerror = () => reject(new Error('IMAGE_DECODE_FAILED'));
          img.src = String(reader.result || '');
        };
        reader.readAsDataURL(file);
      });
    },

    async saveAvatarSettings(){
      const nextImage = safeTrim(this.pendingAvatarDataUrl);
      if(!nextImage){
        this.setSettingsHint('בחר תמונה לפני השמירה.', 'error');
        return;
      }
      try {
        this.setSettingsHint('שומר תמונת פרופיל…');
        setChatAvatarEntry(this.userKey, nextImage);
        this.refreshCurrentUser();
        this.pendingAvatarDataUrl = '';
        const res = await App.persist('תמונת הפרופיל נשמרה');
        if(!res?.ok) throw new Error(res?.error || 'CHAT_AVATAR_SAVE_FAILED');
        if(this.presenceChannel){
          try { await this.presenceChannel.track(this.buildPresencePayload()); } catch(_e) {}
        }
        this.renderMe();
        this.renderUsers();
        this.renderPeerMeta();
        this.renderMessages();
        this.setSettingsHint('תמונת הפרופיל נשמרה בהצלחה.', 'success');
        setTimeout(() => this.closeSettingsModal(), 520);
      } catch(err){
        console.error('CHAT_AVATAR_SAVE_FAILED', err);
        this.setSettingsHint('השמירה נכשלה. נסה שוב.', 'error');
      }
    },

    async removeAvatarSettings(){
      try {
        this.setSettingsHint('מסיר תמונת פרופיל…');
        this.pendingAvatarDataUrl = '';
        setChatAvatarEntry(this.userKey, '');
        this.refreshCurrentUser();
        const res = await App.persist('תמונת הפרופיל הוסרה');
        if(!res?.ok) throw new Error(res?.error || 'CHAT_AVATAR_REMOVE_FAILED');
        if(this.presenceChannel){
          try { await this.presenceChannel.track(this.buildPresencePayload()); } catch(_e) {}
        }
        this.renderMe();
        this.renderUsers();
        this.renderPeerMeta();
        this.renderMessages();
        this.renderSettingsPreview();
        this.setSettingsHint('תמונת הפרופיל הוסרה.', 'success');
      } catch(err){
        console.error('CHAT_AVATAR_REMOVE_FAILED', err);
        this.setSettingsHint('לא הצלחתי להסיר את התמונה.', 'error');
      }
    },

    refreshSendButtonState(){
      const btn = this.els?.send;
      const input = this.els?.input;
      if(!btn || !input) return;
      const hasText = !!safeTrim(input.value);
      btn.classList.toggle('is-active', hasText);
      btn.setAttribute('aria-disabled', btn.disabled ? 'true' : 'false');
    },

    triggerSendButtonFx(){
      const btn = this.els?.send;
      if(!btn) return;
      btn.classList.remove('is-sending');
      void btn.offsetWidth;
      btn.classList.add('is-sending');
      clearTimeout(this.sendFxTimer);
      this.sendFxTimer = setTimeout(() => btn.classList.remove('is-sending'), 360);
    },

    async sendMessage(){
      if(!this.client || !this.selectedUser || !this.currentConversationId){
        alert('בחר נציג כדי להתחיל שיחה.');
        return;
      }
      const text = safeTrim(this.els.input?.value);
      if(!text) return;
      const sendBtn = this.els.send;
      if(sendBtn) {
        sendBtn.disabled = true;
        this.triggerSendButtonFx();
      }
      this.refreshSendButtonState();
      try {
        const expiresAt = SUPABASE_CHAT.retentionMode === 'midnight'
          ? nextMidnightISO()
          : new Date(Date.now() + this.retentionMs).toISOString();
        const payload = {
          conversation_id: this.currentConversationId,
          sender_id: this.userKey,
          sender_name: this.currentUser?.name || 'נציג',
          recipient_id: this.selectedUser.id,
          recipient_name: this.selectedUser.name,
          body: text,
          expires_at: expiresAt
        };
        const { data, error } = await this.client
          .from(SUPABASE_CHAT.messagesTable)
          .insert([payload])
          .select('*')
          .single();
        if(error) throw error;
        const insertedMsg = this.normalizeMessage(data) || {
          id: null,
          conversationId: this.currentConversationId,
          fromId: this.userKey,
          fromName: this.currentUser?.name || 'נציג',
          toId: this.selectedUser.id,
          toName: this.selectedUser.name,
          text,
          createdAt: Date.now(),
          expiresAt: Date.parse(expiresAt) || (Date.now() + this.retentionMs)
        };
        this.upsertIncomingMessage(insertedMsg, true);
        if(this.els.input){
          this.els.input.value = '';
        }
        this.closeEmojiPanel();
        this.autoGrowInput();
        this.refreshSendButtonState();
        await this.setTyping(false);
        this.renderUsers();
      } catch(err){
        console.error('CHAT_SEND_FAILED', err);
        const errMsg = safeTrim(err?.message || err?.details || err?.hint || err?.code || '');
        alert(`לא הצלחתי לשלוח את ההודעה כרגע. ${errMsg || 'בדוק שהרצת את קובץ ה-SQL המעודכן של הצ׳אט ב-Supabase.'}`);
      } finally {
        if(sendBtn) sendBtn.disabled = false;
        this.refreshSendButtonState();
        this.els.input?.focus?.();
      }
    },

    upsertIncomingMessage(msg, markReadForCurrentConversation=false){
      if(!msg || !msg.conversationId) return;
      const convoId = msg.conversationId;
      this.lastMessageByConversation.set(convoId, {
        text: msg.text,
        at: msg.createdAt,
        fromId: msg.fromId
      });
      const exists = this.currentMessages.some((item) => {
        if(msg.id != null && item.id != null) return String(item.id) === String(msg.id);
        return item.conversationId === msg.conversationId
          && item.fromId === msg.fromId
          && item.toId === msg.toId
          && item.text === msg.text
          && Math.abs(Number(item.createdAt || 0) - Number(msg.createdAt || 0)) < 1500;
      });
      if(this.currentConversationId === convoId && !exists){
        this.currentMessages.push(msg);
        this.currentMessages.sort((a, b) => a.createdAt - b.createdAt);
        this.renderMessages();
      } else if(this.currentConversationId === convoId){
        this.renderMessages();
      }
      if(markReadForCurrentConversation && this.currentConversationId === convoId){
        this.resetUnreadForSelected();
      }
    },

    handleTypingPulse(){
      if(!this.enabled || !this.currentConversationId || !this.presenceChannel) return;
      this.setTyping(true);
      clearTimeout(this.typingTimer);
      this.typingTimer = setTimeout(() => this.setTyping(false), this.typingWindowMs);
    },

    async setTyping(flag){
      if(!this.presenceChannel || !this.currentUser) return;
      try {
        await this.presenceChannel.track(this.buildPresencePayload(flag ? {
          typingTo: this.currentConversationId,
          typingUntil: Date.now() + this.typingWindowMs
        } : {
          typingTo: '',
          typingUntil: 0
        }));
      } catch(_e) {}
    },

    conversationId(otherUserId){
      return [this.userKey, otherUserId].sort().join('__');
    },

    resetUnreadForSelected(){
      if(!this.currentConversationId) return;
      this.unreadByConversation.set(this.currentConversationId, 0);
      this.renderFabBadge();
      this.renderUsers();
    },

    renderFabBadge(){
      const total = Array.from(this.unreadByConversation.values()).reduce((sum, n) => sum + Number(n || 0), 0);
      if(this.els.fabBadge){
        this.els.fabBadge.textContent = String(Math.min(total, 99));
        this.els.fabBadge.classList.toggle('is-hidden', !total);
      }
    },

    setConnectionStatus(text, level='warn'){
      if(!this.els.connectionStatus) return;
      this.els.connectionStatus.textContent = text;
      this.els.connectionStatus.dataset.level = level;
    },

    notifyIncoming(message){
      const convoId = this.conversationId(message.fromId);
      const isChatWindowOpen = !this.els.window?.classList.contains('is-hidden');
      const isActiveConversationOpen = this.selectedUser?.id === message.fromId && isChatWindowOpen;
      if(!isActiveConversationOpen){
        this.unreadByConversation.set(convoId, (this.unreadByConversation.get(convoId) || 0) + 1);
        this.renderFabBadge();
        this.renderUsers();
      }
      const from = this.usersMap.get(message.fromId)?.name || message.fromName || 'נציג';
      if(!isChatWindowOpen){
        this.pushToast(from, message.text || 'הודעה חדשה');
        this.playNotifySound();
      }
    },

    pushToast(title, text){
      const host = this.els.toasts;
      if(!host) return;
      const toast = document.createElement('div');
      toast.className = 'giChatToast';
      toast.innerHTML = `<div class="giChatToast__title">${this.escapeHtml(title)}</div><div class="giChatToast__text">${this.escapeHtml(text)}</div>`;
      host.appendChild(toast);
      setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateY(-8px)'; }, 3600);
      setTimeout(() => toast.remove(), 4100);
    },

    playNotifySound(){
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if(!Ctx) return;
        this.notifyAudioCtx = this.notifyAudioCtx || new Ctx();
        const ctx = this.notifyAudioCtx;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 740;
        gain.gain.value = 0.0001;
        osc.connect(gain);
        gain.connect(ctx.destination);
        const now = ctx.currentTime;
        gain.gain.exponentialRampToValueAtTime(0.02, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
        osc.start(now);
        osc.stop(now + 0.2);
      } catch(_e) {}
    },

    formatClock(ts){
      const value = typeof ts === 'number' ? ts : Date.now();
      return new Date(value).toLocaleTimeString('he-IL', { hour:'2-digit', minute:'2-digit' });
    },

    escapeHtml(v){
      return String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
    },

    escapeAttr(v){
      return this.escapeHtml(v).replace(/`/g, '&#96;');
    },

    async cleanupExpiredData(){
      if(!this.client || !SUPABASE_CHAT.enabled) return;
      const now = nowISO();
      try {
        const { error } = await this.client.rpc(SUPABASE_CHAT.cleanupRpc);
        if(error){
          const fallback = await this.client.from(SUPABASE_CHAT.messagesTable).delete().lt('expires_at', now);
          if(fallback.error) throw fallback.error;
        }
      } catch(_e) {}
      const beforeLen = this.currentMessages.length;
      this.currentMessages = this.currentMessages.filter((msg) => Number(msg.expiresAt || 0) > Date.now());
      if(this.currentMessages.length !== beforeLen) this.renderMessages();
      if(!this.currentMessages.length && this.currentConversationId){
        this.lastMessageByConversation.delete(this.currentConversationId);
        this.renderUsers();
      }
    },

    startCleanupLoop(){
      clearInterval(this.cleanupTimer);
      const run = () => this.cleanupExpiredData();
      this.cleanupTimer = setInterval(run, Math.max(15000, Number(SUPABASE_CHAT.cleanupIntervalMs || 60000)));
      run();
    },

    teardownRealtime(isSilent=false){
      clearTimeout(this.typingTimer);
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
      this.ready = false;
      if(this.presenceChannel){
        try { this.presenceChannel.untrack(); } catch(_e) {}
        try { this.client?.removeChannel(this.presenceChannel); } catch(_e) {}
      }
      if(this.messagesChannel){
        try { this.client?.removeChannel(this.messagesChannel); } catch(_e) {}
      }
      this.presenceChannel = null;
      this.messagesChannel = null;
      if(!isSilent) this.setConnectionStatus('צ׳אט מנותק', 'warn');
    },

    onLogin(){
      this.refreshCurrentUser();
      this.renderMe();
      this.restoreFabPosition();
      this.syncVisibility('global');
      this.ensureStarted();
    },

    onLogout(){
      this.teardownRealtime(true);
      this.hideFab();
      this.closeWindow(false, true);
      this.selectedUser = null;
      this.currentConversationId = '';
      this.usersMap = new Map();
      this.currentMessages = [];
      this.unreadByConversation = new Map();
      this.lastMessageByConversation = new Map();
      this.initStarted = false;
      this.enabled = false;
      this.currentUser = null;
      this.userKey = '';
      this.renderFabBadge();
      if(this.els.usersList) this.els.usersList.innerHTML = '';
      if(this.els.messages) this.els.messages.innerHTML = '';
    },
  };

  const __chatOriginalGoView = UI.goView.bind(UI);
  UI.goView = function(view){
    const result = __chatOriginalGoView(view);
    try { ChatUI.syncVisibility(view); } catch(_e) {}
    return result;
  };

  const __chatOriginalLogout = Auth.logout.bind(Auth);
  Auth.logout = function(){
    try { ChatUI.onLogout(); } catch(_e) {}
    return __chatOriginalLogout();
  };



  const SupportNoticeUI = {
    els: {},
    storagePrefix: "support_notice_seen_",

    init(){
      this.els.modal = $("#supportNoticeModal");
      this.els.confirm = $("#supportNoticeConfirm");
      this.els.openBtn = $("#btnSupportNoticeOpen");
      this.els.backdrop = this.els.modal?.querySelector?.('[data-close="supportNotice"]') || null;

      on(this.els.confirm, "click", () => {
        this.markSeen();
        this.close();
      });
      on(this.els.openBtn, "click", () => this.open({ force:true }));
      on(this.els.backdrop, "click", () => this.close());
    },

    currentKey(){
      const name = safeTrim(Auth?.current?.name);
      if(!name) return "";
      return this.storagePrefix + name.toLowerCase().replace(/\s+/g, "_");
    },

    hasSeen(){
      const key = this.currentKey();
      if(!key) return true;
      try { return localStorage.getItem(key) === "1"; } catch(_e) { return false; }
    },

    markSeen(){
      const key = this.currentKey();
      if(!key) return;
      try { localStorage.setItem(key, "1"); } catch(_e) {}
    },

    open(options = {}){
      if(!this.els.modal || !Auth.current) return;
      const force = !!options.force;
      if(!force && this.hasSeen()) return;
      this.els.modal.classList.add("is-open");
      this.els.modal.setAttribute("aria-hidden", "false");
      try { this.els.confirm?.focus?.(); } catch(_e) {}
    },

    close(){
      if(!this.els.modal) return;
      this.els.modal.classList.remove("is-open");
      this.els.modal.setAttribute("aria-hidden", "true");
    },

    showAfterLogin(){
      this.open({ force:false });
    }
  };

  const App = {
    _bootPromise: null,

    async boot(){
      Storage.restoreUrl();
      UI.renderSyncStatus("טוען…", "warn");

      // load from Supabase
      const r = await Storage.loadSheets();
      if (r.ok) {
        State.data = r.payload;
        Storage.saveBackup(State.data);
        UI.renderSyncStatus("מחובר", "ok", r.at);
      } else {
        const backup = Storage.loadBackup();
        if (backup) {
          State.data = backup;
        } else {
          State.data = defaultState();
        }
        UI.renderSyncStatus("לא מחובר", "err", null, r.error);
      }

      // sync Supabase URL field
      if (UI.els.gsUrl) { UI.els.gsUrl.value = Storage.supabaseUrl || ""; UI.els.gsUrl.readOnly = true; }

      // after state is ready: apply role UI
      UI.applyRoleUI();
      if (Auth.current) {
        try { ChatUI.onLogin(); } catch(_e) {}
        // keep current view (admin -> settings)
        UI.goView(Auth.isAdmin() ? "settings" : "dashboard");
      } else {
        UI.goView("dashboard");
      }
    },

    async persist(label){
      // backup always
      try { Storage.saveBackup(State.data); } catch(_) {}

      // save to Supabase
      UI.renderSyncStatus("שומר…", "warn");
      const r = await Storage.saveSheets(State.data);
      if (r.ok) {
        UI.renderSyncStatus(label || "נשמר", "ok", r.at);
      } else {
        UI.renderSyncStatus("שגיאה בשמירה", "err", null, r.error);
        console.error("SAVE_TO_SUPABASE_FAILED:", r?.error || r);
      }
      return r;
    },

    async reloadSessionState(){
      if(!Auth.current) return { ok:false, error:"NO_SESSION" };
      UI.renderSyncStatus("טוען נתוני משתמש…", "warn");
      const r = await Storage.loadSheets();
      if (r.ok) {
        State.data = r.payload;
        Storage.saveBackup(State.data);
        UI.renderSyncStatus("נתוני משתמש נטענו", "ok", r.at);
        if (Auth.isAdmin()) UsersUI.render();
        if (Auth.current) {
          UI.renderAuthPill();
          CustomersUI.render();
          ProposalsUI.render();
          if (Auth.isOps()) { ProcessesUI.render(); try { OpsEventsUI.renderToolbarState(); OpsEventsUI.checkReminders(); } catch(_e) {} }
        }
      } else {
        UI.renderSyncStatus("שגיאה בטעינת נתוני משתמש", "err", null, r.error);
        console.error("LOAD_SUPABASE_SESSION_STATE_FAILED:", r?.error || r);
      }
      return r;
    },

    async syncNow(){
      UI.renderSyncStatus("מסנכרן…", "warn");
      const r = await Storage.loadSheets();
      if (r.ok) {
        State.data = r.payload;
        Storage.saveBackup(State.data);
        UI.renderSyncStatus("סונכרן", "ok", r.at);
        if (Auth.isAdmin()) UsersUI.render();
        if (Auth.current) {
          UI.renderAuthPill();
          CustomersUI.render();
          ProposalsUI.render();
          if (Auth.isOps()) ProcessesUI.render();
        }
      } else {
        UI.renderSyncStatus("שגיאה בסנכרון", "err", null, r.error);
      }
    }
  };


  const normalizeAgentSecurityEntry = (raw) => {
    const input = raw && typeof raw === "object" ? raw : {};
    return {
      authEmail: safeTrim(input.authEmail || input.auth_email || input.email),
      authUserId: safeTrim(input.authUserId || input.auth_user_id || input.userId),
      mfaRequired: input.mfaRequired === true || input.mfa_required === true,
      mfaEnabled: input.mfaEnabled === true || input.mfa_enabled === true,
      mfaEnrolledAt: safeTrim(input.mfaEnrolledAt || input.mfa_enrolled_at),
      factorId: safeTrim(input.factorId || input.factor_id),
      lastVerifiedAt: safeTrim(input.lastVerifiedAt || input.last_verified_at),
      updatedAt: safeTrim(input.updatedAt || input.updated_at) || nowISO()
    };
  };
  const normalizeAgentSecurityMap = (raw) => {
    const input = raw && typeof raw === 'object' ? raw : {};
    const out = {};
    Object.entries(input).forEach(([key, value]) => { if(key) out[String(key)] = normalizeAgentSecurityEntry(value); });
    return out;
  };
  const getAgentSecurityStore = () => {
    State.data.meta = State.data.meta && typeof State.data.meta === 'object' ? State.data.meta : {};
    State.data.meta.agentSecurity = normalizeAgentSecurityMap(State.data.meta.agentSecurity);
    return State.data.meta.agentSecurity;
  };
  const getAgentSecurity = (agentId) => {
    const key = safeTrim(agentId);
    if(!key) return normalizeAgentSecurityEntry({});
    return normalizeAgentSecurityEntry(getAgentSecurityStore()[key] || {});
  };
  const setAgentSecurity = (agentId, patch = {}) => {
    const key = safeTrim(agentId);
    if(!key) return normalizeAgentSecurityEntry({});
    const store = getAgentSecurityStore();
    const merged = normalizeAgentSecurityEntry({ ...(store[key] || {}), ...(patch || {}), updatedAt: nowISO() });
    store[key] = merged;
    State.data.meta.updatedAt = nowISO();
    return merged;
  };

  const SupabaseMFA = {
    getClient(){ return Storage.getClient(); },
    async signOutSilently(){ try { await this.getClient().auth.signOut(); } catch(_e) {} },
    async getUser(){
      try {
        const { data, error } = await this.getClient().auth.getUser();
        if(error) return { ok:false, error:String(error.message || error) };
        return { ok:true, user:data?.user || null };
      } catch(e){ return { ok:false, error:String(e?.message || e) }; }
    },
    async signInWithPassword(email, password){
      try {
        await this.signOutSilently();
        const { data, error } = await this.getClient().auth.signInWithPassword({ email, password });
        if(error) return { ok:false, error:String(error.message || error) };
        return { ok:true, data:data || {} };
      } catch(e){ return { ok:false, error:String(e?.message || e) }; }
    },
    async listFactors(){
      const api = this.getClient()?.auth?.mfa;
      if(!api || typeof api.listFactors !== 'function') return { ok:false, error:'MFA_NOT_AVAILABLE' };
      const { data, error } = await api.listFactors();
      if(error) return { ok:false, error:String(error.message || error) };
      return { ok:true, data:data || {} };
    },
    extractTotpFactors(payload){
      const list=[]; const addMany=(arr)=>(Array.isArray(arr)?arr:[]).forEach(item=>{ if(item&&typeof item==='object') list.push(item); });
      if(payload&&typeof payload==='object'){
        addMany(payload.all); addMany(payload.totp); addMany(payload.verified); addMany(payload.unverified); addMany(payload.factors);
        if(payload.data&&typeof payload.data==='object'){ addMany(payload.data.all); addMany(payload.data.totp); addMany(payload.data.verified); addMany(payload.data.unverified); addMany(payload.data.factors); }
      }
      const seen=new Set();
      return list.filter((factor)=>{
        const fid=safeTrim(factor?.id); const type=safeTrim(factor?.factor_type || factor?.factorType || factor?.type).toLowerCase();
        if(type && !type.includes('totp')) return false;
        if(fid && seen.has(fid)) return false; if(fid) seen.add(fid); return true;
      });
    },
    getVerifiedTotpFactorFromData(payload){
      return this.extractTotpFactors(payload).find((factor)=>{
        const status=safeTrim(factor?.status).toLowerCase();
        return status==='verified' || status==='enabled';
      }) || null;
    },
    async getVerifiedTotpFactor(){ const listed = await this.listFactors(); return listed.ok ? { ok:true, factor:this.getVerifiedTotpFactorFromData(listed.data), data:listed.data } : { ok:false, error:listed.error }; },
    getPrimaryTotpFactorFromData(payload){
      const all = this.extractTotpFactors(payload);
      if(!all.length) return null;
      const verified = all.find((factor)=>{
        const status=safeTrim(factor?.status).toLowerCase();
        return status==='verified' || status==='enabled';
      });
      return verified || all[0] || null;
    },
    async getPrimaryTotpFactor(){ const listed = await this.listFactors(); return listed.ok ? { ok:true, factor:this.getPrimaryTotpFactorFromData(listed.data), data:listed.data } : { ok:false, error:listed.error }; },
    async enroll(){
      const api = this.getClient()?.auth?.mfa;
      if(!api || typeof api.enroll !== 'function') return { ok:false, error:'MFA_ENROLL_NOT_AVAILABLE' };
      const { data, error } = await api.enroll({ factorType:'totp', friendlyName:`gemel-invest-${Date.now()}` });
      if(error) return { ok:false, error:String(error.message || error) };
      return { ok:true, data:data || {} };
    },
    async unenroll(factorId){
      const api=this.getClient()?.auth?.mfa; if(!api || typeof api.unenroll !== 'function') return { ok:false, error:'MFA_UNENROLL_NOT_AVAILABLE' };
      const { data, error } = await api.unenroll({ factorId });
      if(error) return { ok:false, error:String(error.message || error) };
      return { ok:true, data:data || {} };
    },
    async verifyCode(factorId, code){
      const api=this.getClient()?.auth?.mfa; if(!api) return { ok:false, error:'MFA_VERIFY_NOT_AVAILABLE' };
      const cleanCode = normalizeTotpCode(code);
      if(cleanCode.length !== 6) return { ok:false, error:'יש להזין קוד בן 6 ספרות בדיוק' };
      const challenge = await api.challenge({ factorId });
      if(challenge?.error) return { ok:false, error:String(challenge.error.message || challenge.error) };
      const challengeId = challenge?.data?.id || challenge?.data?.challengeId;
      const { data, error } = await api.verify({ factorId, challengeId, code: cleanCode });
      if(error) return { ok:false, error:String(error.message || error) };
      return { ok:true, data:data || {} };
    },
    extractQrMarkup(data){
      const qr = data?.totp?.qr_code || data?.qr_code || data?.totp?.qrCode || '';
      const secret = data?.totp?.secret || data?.secret || '';
      const uri = data?.totp?.uri || data?.uri || '';
      let html='';
      if(qr) html += `<img alt="QR" src="${qr.startsWith('data:') ? qr : 'data:image/svg+xml;utf8,' + encodeURIComponent(qr)}"/>`;
      if(uri) html += `<div class="help" style="margin-top:10px">אם לא ניתן לסרוק, הזן ידנית את הקישור הבא באפליקציה:</div><code>${escapeHtml(uri)}</code>`;
      else if(secret) html += `<div class="help" style="margin-top:10px">אם לא ניתן לסרוק, הזן ידנית את ה-secret:</div><code>${escapeHtml(secret)}</code>`;
      return html || '<div class="muted">לא התקבל QR מהרישום.</div>';
    }
  };

  // persist agentSecurity in meta
  const _origBuildMetaRow = Storage.buildMetaRow.bind(Storage);
  Storage.buildMetaRow = function(state){
    const row = _origBuildMetaRow(state);
    row.payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
    row.payload.agentSecurity = normalizeAgentSecurityMap(state?.meta?.agentSecurity);
    return row;
  };
  const _origMapMeta = Storage.mapMeta.bind(Storage);
  Storage.mapMeta = function(metaRow){
    const out = _origMapMeta(metaRow);
    out.agentSecurity = normalizeAgentSecurityMap(metaRow?.payload?.agentSecurity || out.agentSecurity);
    return out;
  };

  const getCurrentAgentRecord = () => (Array.isArray(State.data?.agents) ? State.data.agents : []).find((a) => safeTrim(a?.name) === safeTrim(Auth.current?.name) || safeTrim(a?.username) === safeTrim(Auth.current?.name)) || null;
  const completeAgentLogin = async (matched) => {
    Auth.current = { name: matched.name, role: (matched.role === 'manager' ? 'manager' : matched.role === 'ops' ? 'ops' : 'agent') };
    try { localStorage.removeItem(LS_SESSION_KEY); } catch(_) {}
    await App.reloadSessionState();
    Auth.unlock();
    try { InactivityGuard.start(); } catch(_e) {}
    UI.applyRoleUI();
    UI.renderAuthPill();
    await WelcomeLoader.play(Auth.current.name, 1200);
    BirthdaysUI.maybeCelebrateLogin();
    UI.goView('dashboard');
    try { ChatUI.onLogin(); } catch(_e) {}
    try { SupportNoticeUI.showAfterLogin(); } catch(_e) {}
  };

  // Enhance UI init/pill
  const _uiInit = UI.init.bind(UI);
  UI.init = function(){
    _uiInit();
    this.els.btnOpenSecurity = $('#btnOpenSecurity');
    on(this.els.btnOpenSecurity, 'click', () => SecurityUI.open());
  };
  const _renderAuthPill = UI.renderAuthPill.bind(UI);
  UI.renderAuthPill = function(){
    _renderAuthPill();
    if(this.els.btnOpenSecurity) this.els.btnOpenSecurity.style.display = (Auth.current && !Auth.isAdmin()) ? '' : 'none';
  };

  // Enhance users modal with auth email
  const _ensureModal = UsersUI._ensureModal.bind(UsersUI);
  UsersUI._ensureModal = function(){
    const els = _ensureModal();
    els.authEmail = $('#lcUserAuthEmail');
    return els;
  };
  const _openModal = UsersUI.openModal.bind(UsersUI);
  UsersUI.openModal = function(mode, user){
    _openModal(mode, user);
    const E = this._ensureModal();
    if(E.authEmail){
      const sec = user ? getAgentSecurity(user.id) : normalizeAgentSecurityEntry({});
      E.authEmail.value = sec.authEmail || '';
    }
  };
  const _saveFromModal = UsersUI._saveFromModal.bind(UsersUI);
  UsersUI._saveFromModal = async function(){
    const E = this._ensureModal();
    const authEmail = safeTrim(E.authEmail?.value);
    if(this._modalMode === 'edit' && safeTrim(E.id?.value)) setAgentSecurity(safeTrim(E.id.value), { authEmail, mfaRequired: !!authEmail });
    await _saveFromModal();
    if(this._modalMode !== 'edit'){
      const arr = Array.isArray(State.data.agents) ? State.data.agents : [];
      const last = arr[arr.length-1];
      if(last?.id) { setAgentSecurity(last.id, { authEmail, mfaRequired: !!authEmail }); await App.persist('עודכן auth email'); }
    } else { await App.persist('עודכן auth email'); }
  };
  const _usersRender = UsersUI.render.bind(UsersUI);
  UsersUI.render = function(){ _usersRender(); };

  // Auth MFA support
  Auth._pendingMfa = null;
  Auth._setMfaModeUi = function(mode, qrHtml=''){
    const normalizedMode = mode === 'enroll' ? 'enroll' : 'verify';
    const titleEl = $('#lcLoginMfaTitle');
    const hintEl = $('#lcLoginMfaHint');
    const setupBox = $('#lcLoginMfaSetupBox');
    const qrBox = $('#lcLoginMfaQrBox');
    const verifyBtn = $('#btnVerifyLoginMfa');
    if(titleEl) titleEl.textContent = normalizedMode === 'enroll' ? 'חיבור Google Authenticator' : 'אימות דו־שלבי';
    if(hintEl) hintEl.textContent = normalizedMode === 'enroll'
      ? 'בכניסה הראשונה יש לסרוק את הברקוד, להזין את הקוד הראשון מהטלפון ורק אז להמשיך למערכת.'
      : 'פתח את Google Authenticator והזן את הקוד העדכני.';
    if(setupBox) setupBox.hidden = normalizedMode !== 'enroll';
    if(qrBox) qrBox.innerHTML = normalizedMode === 'enroll'
      ? (qrHtml || '<div class="muted">לא התקבל ברקוד לסריקה.</div>')
      : '<div class="muted">האימות הדו־שלבי כבר הוגדר למשתמש הזה.</div>';
    if(verifyBtn) verifyBtn.textContent = normalizedMode === 'enroll' ? 'אמת וסיים הגדרה' : 'אמת והיכנס';
  };
  Auth._showMfaStep = function(agent, factorId, options = {}){
    const mode = options?.mode === 'enroll' ? 'enroll' : 'verify';
    this._pendingMfa = { agent, factorId, mode, qrHtml: options?.qrHtml || '' };
    $('#lcLoginCredentialsStep')?.setAttribute('hidden','hidden');
    const step = $('#lcLoginMfaStep'); if(step) step.hidden = false;
    $('#lcLogin')?.classList.add('lcLogin--mfa');
    const nameEl = $('#lcLoginMfaUserName'); if(nameEl) nameEl.textContent = safeTrim(agent?.name) || 'נציג';
    const codeEl = $('#lcLoginMfaCode'); if(codeEl) codeEl.value = '';
    this._setMfaModeUi(mode, options?.qrHtml || '');
    this._setError('');
  };
  Auth._hideMfaStep = function(){
    this._pendingMfa = null;
    $('#lcLoginCredentialsStep')?.removeAttribute('hidden');
    const step = $('#lcLoginMfaStep'); if(step) step.hidden = true;
    $('#lcLogin')?.classList.remove('lcLogin--mfa');
    const codeEl = $('#lcLoginMfaCode'); if(codeEl) codeEl.value = '';
    this._setMfaModeUi('verify', '');
  };
  Auth._verifyPendingMfa = async function(){
    const pending = this._pendingMfa; if(!pending?.factorId || !pending?.agent) return;
    const code = normalizeTotpCode($('#lcLoginMfaCode')?.value);
    if(!code) return this._setError('נא להזין קוד Google Authenticator');
    const vr = await SupabaseMFA.verifyCode(pending.factorId, code);
    if(!vr.ok) return this._setError(vr.error || 'קוד האימות לא תקין');
    setAgentSecurity(pending.agent.id, { mfaRequired:true, mfaEnabled:true, factorId:pending.factorId, lastVerifiedAt:nowISO(), mfaEnrolledAt:getAgentSecurity(pending.agent.id).mfaEnrolledAt || nowISO() });
    await App.persist(pending.mode === 'enroll' ? 'הושלמה הגדרת MFA בכניסה ראשונה' : 'אומת MFA');
    this._hideMfaStep();
    await completeAgentLogin(pending.agent);
  };
  Auth._prepareEnrollmentForLogin = async function(agent, security){
    const listed = await SupabaseMFA.listFactors();
    if(!listed.ok) return { ok:false, error:listed.error || 'לא הצלחתי לקרוא את מצב ה-2FA' };
    const verified = SupabaseMFA.getVerifiedTotpFactorFromData(listed.data);
    if(verified){
      const factorId = safeTrim(verified?.id);
      setAgentSecurity(agent.id, { authEmail:security.authEmail, mfaRequired:true, mfaEnabled:true, factorId, mfaEnrolledAt:getAgentSecurity(agent.id).mfaEnrolledAt || nowISO() });
      await App.persist('MFA login pending');
      return { ok:true, mode:'verify', factorId };
    }
    const allTotp = SupabaseMFA.extractTotpFactors(listed.data);
    for(const factor of allTotp){
      const factorId = safeTrim(factor?.id);
      if(!factorId) continue;
      const removed = await SupabaseMFA.unenroll(factorId);
      if(!removed.ok) return { ok:false, error:'נמצא רישום 2FA תקוע, אבל לא הצלחתי לנקות אותו. מחק את ה-MFA factors של המשתמש ב-Supabase ונסה שוב.' };
    }
    const enrolled = await SupabaseMFA.enroll();
    if(!enrolled.ok) return { ok:false, error:enrolled.error || 'לא הצלחתי להתחיל רישום ל-Google Authenticator' };
    const factorId = safeTrim(enrolled.data?.id || enrolled.data?.factorId || enrolled.data?.totp?.id);
    if(!factorId) return { ok:false, error:'לא התקבל factorId חדש עבור ההרשמה ל-Google Authenticator' };
    const qrHtml = SupabaseMFA.extractQrMarkup(enrolled.data);
    setAgentSecurity(agent.id, { authEmail:security.authEmail, mfaRequired:true, mfaEnabled:false, factorId, mfaEnrolledAt:'', lastVerifiedAt:'' });
    await App.persist('MFA first login enrollment started');
    return { ok:true, mode:'enroll', factorId, qrHtml };
  };
  const _authInit = Auth.init.bind(Auth);
  Auth.init = function(){
    _authInit();
    on($('#btnBackLoginMfa'),'click',()=> this._hideMfaStep());
    on($('#btnVerifyLoginMfa'),'click',()=> this._verifyPendingMfa());
  };
  Auth.logout = (function(orig){ return async function(reason='manual'){ try{ await SupabaseMFA.signOutSilently(); }catch(_e){} return orig.call(this, reason); }; })(Auth.logout);
  Auth._submit = async function(){
    const username = safeTrim(this.els.user?.value);
    const pin = safeTrim(this.els.pin?.value);
    this._setError('');
    if(!username) return this._setError('נא להזין שם משתמש');
    if(!pin) return this._setError('נא להזין קוד כניסה');
    try { await App._bootPromise; } catch(_) {}
    const defAdmin = { username:'מנהל מערכת', pin:'1234' };
    const adminAuth = State.data?.meta?.adminAuth || { ...defAdmin, active:true };
    if (adminAuth.active !== false && username === safeTrim(adminAuth.username) && pin === safeTrim(adminAuth.pin)) {
      this.current = { name: safeTrim(adminAuth.username) || defAdmin.username, role:'admin' };
      await App.reloadSessionState(); this.unlock(); InactivityGuard.start(); UI.applyRoleUI(); UI.renderAuthPill(); await WelcomeLoader.play(this.current.name, 1200); UI.goView('settings'); return;
    }
    const agents = Array.isArray(State.data?.agents) ? State.data.agents : [];
    const matched = agents.find(a => safeTrim(a?.username) === username) || agents.find(a => safeTrim(a?.name) === username);
    if(!matched) return this._setError('שם משתמש לא נמצא');
    if(matched.active === false) return this._setError('המשתמש מושבת');
    const expected = safeTrim(matched.pin) || '0000';
    const sec = getAgentSecurity(matched.id);
    const requiresAuthMfa = !!safeTrim(sec.authEmail) || sec.mfaRequired === true;
    let authSigned = false;
    if(requiresAuthMfa){
      if(!safeTrim(sec.authEmail)) return this._setError('לא הוגדר auth email למשתמש ולכן לא ניתן להשלים חיבור Google Authenticator.');
      const sr = await SupabaseMFA.signInWithPassword(sec.authEmail, pin);
      if(!sr.ok) return this._setError('סיסמת Auth שגויה או שהמשתמש לא קיים ב-Supabase Auth');
      authSigned = true;
    } else if(pin !== expected) {
      return this._setError('קוד כניסה שגוי');
    }
    if(authSigned){
      const flow = await this._prepareEnrollmentForLogin(matched, sec);
      if(!flow.ok) return this._setError(flow.error || 'לא הצלחתי להכין את האימות הדו־שלבי לכניסה');
      return this._showMfaStep(matched, flow.factorId, { mode: flow.mode, qrHtml: flow.qrHtml || '' });
    }
    await completeAgentLogin(matched);
  };

  const SecurityUI = {
    currentFactorId:'', forceEnroll:false,
    els:null,
    init(){
      this.els={ wrap:$('#lcSecurityModal'), close:$('#lcSecurityClose'), authEmail:$('#lcSecurityAuthEmail'), authNote:$('#lcSecurityAuthNote'), status:$('#lcSecurityStatus'), password:$('#lcSecurityPassword'), passwordWrap:$('#lcSecurityPasswordWrap'), qr:$('#lcSecurityQrBox'), code:$('#lcSecurityCode'), error:$('#lcSecurityError'), enable:$('#btnEnableGoogleAuth'), verify:$('#btnVerifyGoogleAuth'), refresh:$('#btnRefreshSecurity'), disable:$('#btnDisableGoogleAuth') };
      if(!this.els.wrap) return;
      on(this.els.close,'click',()=>this.close()); on(this.els.wrap,'click',(ev)=>{ if(ev.target?.getAttribute?.('data-close')==='1') this.close(); });
      on(this.els.enable,'click',()=>this.startEnrollment()); on(this.els.verify,'click',()=>this.verifyEnrollment()); on(this.els.refresh,'click',()=>this.render()); on(this.els.disable,'click',()=>this.disableCurrentFactor());
    },
    getCurrentAgent(){ return !Auth.current || Auth.isAdmin() ? null : getCurrentAgentRecord(); },
    open(){ this.currentFactorId=''; this.render(); this.els.wrap?.classList.add('is-open'); this.els.wrap?.setAttribute('aria-hidden','false'); },
    close(){ this.els.wrap?.classList.remove('is-open'); this.els.wrap?.setAttribute('aria-hidden','true'); this.setError(''); },
    setError(msg){ if(this.els?.error) this.els.error.textContent = msg ? String(msg) : ''; },
    async ensureAuthSession(authEmail){
      const current = await SupabaseMFA.getUser();
      if(current.ok && safeTrim(current.user?.email).toLowerCase() === safeTrim(authEmail).toLowerCase()) return { ok:true, user:current.user };
      const pwd = safeTrim(this.els.password?.value);
      if(!pwd) return { ok:false, error:'כדי להפעיל 2FA יש להזין כאן את סיסמת ה-Auth של המשתמש.' };
      const sr = await SupabaseMFA.signInWithPassword(authEmail, pwd);
      if(!sr.ok) return { ok:false, error:sr.error || 'סיסמת Auth שגויה' };
      return SupabaseMFA.getUser();
    },
    async render(){
      const agent = this.getCurrentAgent();
      const security = agent ? getAgentSecurity(agent.id) : normalizeAgentSecurityEntry({});
      if(this.els.authEmail) this.els.authEmail.textContent = security.authEmail || 'לא הוגדר auth email למשתמש';
      const authUser = await SupabaseMFA.getUser();
      const hasAuthSession = !!safeTrim(authUser?.user?.email);
      if(this.els.authNote) this.els.authNote.textContent = !security.authEmail ? 'לפני הפעלת 2FA יש להגדיר למשתמש auth email במסך ניהול משתמשים.' : (hasAuthSession ? 'המשתמש מחובר דרך Supabase Auth עם המייל הזה.' : 'המשתמש עדיין לא מחובר דרך Supabase Auth עם המייל הזה.');
      let factor = { ok:false, factor:null, data:null };
      if(hasAuthSession) factor = await SupabaseMFA.getPrimaryTotpFactor();
      const factorStatus = safeTrim(factor?.factor?.status).toLowerCase();
      const active = !!factor.factor && (factorStatus === 'verified' || factorStatus === 'enabled');
      const pending = !!factor.factor && !active;
      if(agent && active) setAgentSecurity(agent.id, { mfaRequired:true, mfaEnabled:true, factorId:safeTrim(factor.factor?.id), mfaEnrolledAt:getAgentSecurity(agent.id).mfaEnrolledAt || nowISO() });
      this.currentFactorId = factor.factor ? safeTrim(factor.factor?.id) : '';
      if(this.els.status) this.els.status.textContent = active ? 'האימות הדו־שלבי פעיל ומאומת.' : (pending ? 'זוהה רישום קודם שלא הושלם. בלחיצה על הפעל Google Authenticator הוא ינוקה וייווצר QR חדש.' : 'האימות הדו־שלבי עדיין לא הופעל.');
      if(this.els.qr) this.els.qr.innerHTML = active ? '<div class="muted">למשתמש כבר יש Google Authenticator פעיל.</div>' : '<div class="muted">כאן יוצג QR לאחר התחלת ההרשמה.</div>';
      this.setError('');
    },
    async startEnrollment(){
      const agent = this.getCurrentAgent(); if(!agent) return;
      const security = getAgentSecurity(agent.id);
      if(!security.authEmail) return this.setError('לא הוגדר auth email למשתמש');
      const session = await this.ensureAuthSession(security.authEmail); if(!session.ok) return this.setError(session.error || 'לא הצלחתי להתחבר ל-Auth');
      const listed = await SupabaseMFA.listFactors();
      if(!listed.ok) return this.setError(listed.error || 'לא הצלחתי לקרוא את מצב ה-2FA');
      const allTotp = SupabaseMFA.extractTotpFactors(listed.data);
      const verified = SupabaseMFA.getVerifiedTotpFactorFromData(listed.data);
      if(verified){
        this.currentFactorId = safeTrim(verified?.id);
        setAgentSecurity(agent.id,{ mfaRequired:true, mfaEnabled:true, factorId:this.currentFactorId, mfaEnrolledAt:getAgentSecurity(agent.id).mfaEnrolledAt || nowISO() });
        await App.persist('MFA already enabled');
        return this.render();
      }
      for(const factor of allTotp){
        const factorId = safeTrim(factor?.id);
        if(!factorId) continue;
        const removed = await SupabaseMFA.unenroll(factorId);
        if(!removed.ok){
          return this.setError('נמצא רישום 2FA תקוע, אבל לא הצלחתי לנקות אותו. מחק ב-Supabase את ה-MFA factors ונסה שוב.');
        }
      }
      const enrolled = await SupabaseMFA.enroll();
      if(!enrolled.ok) return this.setError(enrolled.error || 'לא הצלחתי להתחיל רישום ל-Google Authenticator');
      const factorId = safeTrim(enrolled.data?.id || enrolled.data?.factorId || enrolled.data?.totp?.id);
      this.currentFactorId = factorId;
      if(this.els.qr) this.els.qr.innerHTML = SupabaseMFA.extractQrMarkup(enrolled.data);
      this.setError('סרוק את ה-QR, ואז הזן את קוד ה-6 ספרות ולחץ "אמת חיבור".');
    },
    async verifyEnrollment(){
      const agent=this.getCurrentAgent(); if(!agent) return;
      const security=getAgentSecurity(agent.id);
      const session = await this.ensureAuthSession(security.authEmail); if(!session.ok) return this.setError(session.error || 'לא הצלחתי להתחבר ל-Auth');
      const code=normalizeTotpCode(this.els.code?.value); if(code.length !== 6) return this.setError('נא להזין קוד אימות בן 6 ספרות');
      if(!this.currentFactorId) return this.setError('יש ללחוץ קודם על הפעל Google Authenticator');
      const vr = await SupabaseMFA.verifyCode(this.currentFactorId, code);
      if(!vr.ok) return this.setError(vr.error || 'קוד האימות לא תקין');
      setAgentSecurity(agent.id,{ mfaRequired:true, mfaEnabled:true, factorId:this.currentFactorId, mfaEnrolledAt:getAgentSecurity(agent.id).mfaEnrolledAt || nowISO(), lastVerifiedAt:nowISO() });
      await App.persist('MFA enabled');
      this.els.code && (this.els.code.value='');
      await this.render();
    },
    async disableCurrentFactor(){
      const agent=this.getCurrentAgent(); if(!agent) return;
      const security=getAgentSecurity(agent.id); const factorId = this.currentFactorId || security.factorId;
      if(!factorId) return this.setError('לא נמצא פקטור פעיל להסרה');
      const rr = await SupabaseMFA.unenroll(factorId); if(!rr.ok) return this.setError(rr.error || 'לא הצלחתי להסיר 2FA');
      setAgentSecurity(agent.id,{ mfaRequired:!!security.authEmail, mfaEnabled:false, factorId:'', mfaEnrolledAt:'', lastVerifiedAt:'' }); await App.persist('MFA removed');
      this.currentFactorId=''; if(this.els.code) this.els.code.value=''; await this.render();
    }
  };

  // ---------- Start ----------
  UI.init();
  Auth.init();
  ForgotPasswordUI.init();
  CustomersUI.init();
  CustomerEditUI.init();
  ArchiveCustomerUI.init();
  MirrorsUI.init();
  ProcessesUI.init();
  OpsEventsUI.init();
  Wizard.init();
  SystemRepairUI.init();
  SupportNoticeUI.init();
  SecurityUI.init();
  NewCustomerEntryUI.init();
  LeadShellUI.init();
  ChatUI.init();
  InactivityGuard.init();
  LiveRefresh.start();
  App._bootPromise = App.boot();

})();


// ===== CHAT TOAST FIX =====
(function(){
  const isChatOpen = () => {
    const el = document.querySelector('#chatWindow, .chatWindow, #chatModal');
    return el && (el.classList.contains('is-open') || el.classList.contains('active') || el.style.display === 'block');
  };

  const origToast = window.showToast;
  if(typeof origToast === "function"){
    window.showToast = function(...args){
      if(isChatOpen()) return;
      return origToast.apply(this, args);
    };
  }
})();
