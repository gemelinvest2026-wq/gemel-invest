/* GEMEL INVEST CRM — CLEAN CORE (Sheets + Admin Settings/Users)
   P260228-0800
   - Keeps: Login, user pill, Google Sheets connection, Admin: System Settings + Users
   - Removes: Customers / New Customer flow / Policies UI
*/
(() => {
  "use strict";

  const BUILD = "20260315-2210";
  const ADMIN_CONTACT_EMAIL = "oriasomech@gmail.com";
  const ARCHIVE_CUSTOMER_PIN = "1990";

  // ---------- Helpers ----------
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const on = (el, evt, fn, opts) => el && el.addEventListener && el.addEventListener(evt, fn, opts);
  const safeTrim = (v) => String(v ?? "").trim();
  const nowISO = () => new Date().toISOString();

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
  const DEFAULT_GS_URL = "https://script.google.com/macros/s/AKfycbzIfQh5_eUCScWtQxbf8qS978mNB1VXj0WW6wAY3XCVlEDE_JV9gm-FL1T5UKZw5wDURA/exec";
  const LS_GS_URL_KEY = "GEMEL_GS_URL";
  const LS_SESSION_KEY = "GEMEL_SESSION_V1";
  const LS_BACKUP_KEY  = "GEMEL_STATE_BACKUP_V1";

  // ---------- State ----------
  const defaultState = () => ({
    meta: {
      updatedAt: null,
      adminAuth: { username: "מנהל מערכת", pin: "1234", active: true }
    },
    agents: [
      { id:"a_0", name:"יובל מנדלסון", username:"יובל מנדלסון", pin:"0000", active:true }
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
        name, username, pin, role, active
      };
    }).filter(a => a.name);

    if (!out.agents.length) out.agents = base.agents;
    out.customers = (out.customers || []).map((c, idx) => normalizeCustomerRecord(c, idx)).filter(Boolean);
    out.proposals = (out.proposals || []).map((p, idx) => normalizeProposalRecord(p, idx)).filter(Boolean);
    out.meta.updatedAt = safeTrim(out.meta.updatedAt) || nowISO();
    return out;
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

  // ---------- Storage (Sheets) ----------
  const Storage = {
    gsUrl: DEFAULT_GS_URL,


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

    setUrl(v){
      const url = safeTrim(v);
      if(!url) return;
      this.gsUrl = url;
      try { localStorage.setItem(LS_GS_URL_KEY, url); } catch(_) {}
    },
    restoreUrl(){
      try {
        const u = safeTrim(localStorage.getItem(LS_GS_URL_KEY));
        if (u) this.gsUrl = u;
      } catch(_) {}
    },

    async ping(){
      if(!this.gsUrl) return { ok:false, error:"אין כתובת Web App" };
      const url = new URL(this.gsUrl);
      url.searchParams.set("action","ping");
      try {
        const res = await fetch(url.toString(), { method:"GET" });
        const json = await res.json();
        return json && json.ok ? { ok:true, at: json.ts || nowISO() } : { ok:false, error: json?.error || "ping failed" };
      } catch(e) {
        return { ok:false, error: String(e?.message || e) };
      }
    },

    async loadSheets(){
      if(!this.gsUrl) return { ok:false, error:"אין כתובת Web App" };
      const url = new URL(this.gsUrl);
      url.searchParams.set("action","get");
      const s = this.session();
      if (s.name) url.searchParams.set("user", s.name);
      if (s.role) url.searchParams.set("role", s.role);
      try {
        const res = await fetch(url.toString(), { method:"GET" });
        const json = await res.json();
        if(!json || json.ok !== true) return { ok:false, error: json?.error || "get failed" };
        return { ok:true, payload: normalizeState(json.payload || {}), at: json.at || nowISO() };
      } catch(e) {
        return { ok:false, error: String(e?.message || e) };
      }
    },

    async saveSheets(state){
      if(!this.gsUrl) return { ok:false, error:"אין כתובת Web App" };
      const url = new URL(this.gsUrl);
      url.searchParams.set("action","put");
      try {
        const res = await fetch(url.toString(), {
          method:"POST",
          headers: { "Content-Type":"text/plain;charset=utf-8" },
          body: JSON.stringify({ payload: state, user: (this.session().name || ""), role: (this.session().role || "") })
        });
        const json = await res.json();
        if(!json || json.ok !== true) return { ok:false, error: json?.error || "put failed" };
        return { ok:true, at: json.at || nowISO() };
      } catch(e) {
        return { ok:false, error: String(e?.message || e) };
      }
    },

    async sendAdminContact(payload){
      if(!this.gsUrl) return { ok:false, error:"אין כתובת Web App" };
      const url = new URL(this.gsUrl);
      url.searchParams.set("action","sendAdminContact");
      try {
        const res = await fetch(url.toString(), {
          method:"POST",
          headers: { "Content-Type":"text/plain;charset=utf-8" },
          body: JSON.stringify({
            email: ADMIN_CONTACT_EMAIL,
            payload: {
              username: safeTrim(payload?.username),
              message: safeTrim(payload?.message),
              source: "login",
              build: BUILD,
              sentAt: nowISO()
            }
          })
        });
        const json = await res.json();
        if(!json || json.ok !== true) return { ok:false, error: json?.error || "sendAdminContact failed" };
        return { ok:true, at: json.at || nowISO() };
      } catch(e) {
        return { ok:false, error: String(e?.message || e) };
      }
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

    logout(){
      this.current = null;
      try { localStorage.removeItem(LS_SESSION_KEY); } catch(_) {}
      this.lock();
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
        UI.applyRoleUI();
        UI.renderAuthPill();
        await WelcomeLoader.play(this.current.name, 4000);
        UI.goView("settings");
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
      UI.applyRoleUI();
      UI.renderAuthPill();
      await WelcomeLoader.play(this.current.name, 4000);
      UI.goView("dashboard");
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
          <div class="lcWelcomeLoader__logoWrap" aria-hidden="true">
            <img class="lcWelcomeLoader__logo" src="./logo-login-clean.png" alt="GEMEL INVEST" />
          </div>
          <div class="lcWelcomeLoader__greeting" id="lcWelcomeGreeting"></div>
          <div class="lcWelcomeLoader__name" id="lcWelcomeName"></div>
          <div class="lcWelcomeLoader__sub">טוען מערכת, אנא המתן</div>
          <div class="lcWelcomeLoader__dots" aria-hidden="true">
            <span></span>
            <span></span>
            <span></span>
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
        this.setError("לא הצלחתי לשלוח אוטומטית. ודא שמוגדר Web App תומך בשליחת מייל.");
      } finally {
        if(btn){
          btn.disabled = false;
          btn.textContent = prevText;
        }
      }
    }
  };

  // ---------- UI ----------
  const UI = {
    els: {},

    init(){
      this.els.pageTitle = $("#pageTitle");
      this.els.userPill = $("#lcUserPill");
      this.els.userPillText = $("#lcUserPillText");
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
          this.goView(v);
        });
      });

      // settings
      if(this.els.gsUrl) {
        this.els.gsUrl.value = Storage.gsUrl || "";
        on(this.els.gsUrl, "change", () => {
          Storage.setUrl(this.els.gsUrl.value);
          this.renderSyncStatus("URL עודכן", "warn");
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
this.applyRoleUI();
      this.renderAuthPill();
    },

    applyRoleUI(){
      const isAdmin = Auth.isAdmin();
      const canUsers = Auth.canManageUsers();
      const settingsBtn = document.querySelector('.nav__item[data-view="settings"]');
      if (settingsBtn) settingsBtn.style.display = isAdmin ? "" : "none";
      if (this.els.navUsers) this.els.navUsers.style.display = canUsers ? "" : "none";
      if (this.els.navCustomers) this.els.navCustomers.style.display = Auth.current ? "" : "none";
      if (this.els.navProposals) this.els.navProposals.style.display = Auth.current ? "" : "none";
      if (this.els.navMirrors) this.els.navMirrors.style.display = Auth.isOps() ? "" : "none";
    },

    setActiveNav(view){
      $$(".nav__item").forEach(b => b.classList.toggle("is-active", b.getAttribute("data-view") === view));
    },

    goView(view){
      let safe = String(view || "dashboard");
      if(safe === "settings" && !Auth.isAdmin()) safe = "dashboard";
      if(safe === "users" && !Auth.canManageUsers()) safe = "dashboard";
      if(safe === "mirrors" && !Auth.isOps()) safe = "dashboard";
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
          mirrors: "שיקופים",
          discountSpec: "מפרט הנחות ביטוח",
          settings: "הגדרות מערכת",
          users: "ניהול משתמשים"
        };
        this.els.pageTitle.textContent = map[safe] || "דשבורד";
      }

      this.setActiveNav(safe);
      document.body.classList.remove("view-users-active","view-dashboard-active","view-settings-active","view-discountSpec-active","view-customers-active","view-proposals-active","view-mirrors-active");
      document.body.classList.add("view-" + safe + "-active");

      // render view data
      if (safe === "users") UsersUI.render();
      if (safe === "customers") CustomersUI.render();
      if (safe === "proposals") ProposalsUI.render();
      if (safe === "mirrors") MirrorsUI.render();
    },

    renderAuthPill(){
      const pill = this.els.userPill;
      const txt = this.els.userPillText;
      if(!pill || !txt) return;

      if(Auth.current) {
        pill.style.display = "";
txt.textContent = Auth.current.name + (Auth.isAdmin() ? " (מנהל מערכת)" : Auth.isManager() ? " (מנהל)" : Auth.isOps() ? " (תפעול)" : "");
      } else {
        pill.style.display = "none";
txt.textContent = "";
      }
    },

    renderSyncStatus(label, level="warn", at=null, err=null){
      const dot = this.els.syncDot;
      const t = this.els.syncText;
      const last = this.els.lastSyncText;

      if (t) t.textContent = "מצב: Google Sheets" + (label ? " · " + label : "");
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
        role: $("#lcUserRole"),
        active: $("#lcUserActive"),
        err: $("#lcUserModalErr"),
        nameErr: $("#lcUserNameErr"),
        userErr: $("#lcUserUsernameErr"),
        pinErr: $("#lcUserPinErr"),
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
      hide(E.err); hide(E.nameErr); hide(E.userErr); hide(E.pinErr);

      if(E.title) E.title.textContent = (this._modalMode === "edit") ? "עריכת משתמש" : "הוסף נציג/סוכן";

      if(E.id) E.id.value = user ? (user.id || "") : "";
      if(E.name) E.name.value = user ? (user.name || "") : "";
      if(E.username) E.username.value = user ? (user.username || "") : "";
      if(E.pin) E.pin.value = user ? (user.pin || "") : "0000";
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
      const role = safeTrim(E.role?.value) || "agent";
      const active = !!E.active?.checked;

      // validate
      let ok = true;
      this._showErr(E.nameErr, name ? "" : "נא להזין שם");
      this._showErr(E.userErr, username ? "" : "נא להזין שם משתמש");
      this._showErr(E.pinErr, pin ? "" : "נא להזין PIN");
      if(!name || !username || !pin) ok = false;

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


    getActiveStep(rec){
      const verify = rec ? this.getVerifyState(rec) : null;
      return !rec ? 1 : (this.consent !== 'yes' ? 2 : (verify?.reflectionOpened ? 4 : 3));
    },

    showFlowStep(activeStep){
      const cardMap = {
        2: this.els.scriptCard,
        3: this.els.verifyCard,
        4: this.els.reflectCard
      };
      Object.entries(cardMap).forEach(([stepNo, el]) => {
        if(!el) return;
        const isActive = Number(stepNo) === Number(activeStep);
        el.style.display = isActive ? 'block' : 'none';
      });
      if(activeStep >= 2){
        try{
          requestAnimationFrame(() => {
            this.els.flow?.scrollIntoView?.({ behavior:'smooth', block:'start' });
          });
        }catch(_e){}
      }
    },

    render(){
      if(this.els.resultsBadge && !this.lastResults.length && !safeTrim(this.els.input?.value)){
        this.els.resultsBadge.textContent = '0 תוצאות';
      }
      const rec = this.current();
      const activeStep = this.getActiveStep(rec);
      this.updateSteps(activeStep);
      if(this.els.heroMeta){
        this.els.heroMeta.textContent = rec ? `לקוח נבחר: ${rec.fullName || 'לקוח'} · נציג מטפל: ${rec.agentName || '—'}` : 'מחפש לקוח לשיקוף';
      }
      if(!rec){
        if(this.els.empty) this.els.empty.style.display = '';
        if(this.els.flow) this.els.flow.style.display = 'none';
        if(this.els.scriptCard){ this.els.scriptCard.style.display = 'none'; this.els.scriptCard.innerHTML = ''; }
        if(this.els.verifyCard){ this.els.verifyCard.style.display = 'none'; this.els.verifyCard.innerHTML = ''; }
        if(this.els.reflectCard){ this.els.reflectCard.style.display = 'none'; this.els.reflectCard.innerHTML = ''; }
        return;
      }
      if(this.els.empty) this.els.empty.style.display = 'none';
      if(this.els.flow) this.els.flow.style.display = 'grid';
      this.renderCustomerHero(rec);
      this.renderScript(rec);
      this.renderVerification(rec);
      this.renderReflection(rec);
      this.showFlowStep(activeStep);
    },

    updateSteps(activeStep){
      (this.els.steps || []).forEach(el => {
        const stepNo = Number(el.getAttribute('data-step') || 0);
        el.classList.toggle('is-active', stepNo === activeStep);
        el.classList.toggle('is-done', stepNo < activeStep);
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
      return store;
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

    renderCustomerHero(rec){
      if(!this.els.customerHero) return;
      const primary = this.getPrimary(rec);
      const companies = this.getCompanyNames(rec);
      const companyChips = companies.length ? companies.map(company => {
        const src = this.getCompanyLogo(company);
        const logo = src ? `<img class="mirrorsChip__logoImg" src="${escapeHtml(src)}" alt="${escapeHtml(company)}" />` : `<span class="mirrorsChip__logoFallback">${escapeHtml((company || '•').slice(0,1))}</span>`;
        return `<span class="mirrorsChip">${logo}<span>${escapeHtml(company)}</span></span>`;
      }).join('') : `<span class="mirrorsChip mirrorsChip--muted">לא הוגדרו חברות בפוליסות חדשות</span>`;
      this.els.customerHero.innerHTML = `<div class="mirrorsCustomerHero__main">
        <div>
          <div class="mirrorsCustomerHero__kicker">לקוח שנבחר לשיקוף</div>
          <div class="mirrorsCustomerHero__name">${escapeHtml(rec.fullName || 'לקוח')}</div>
          <div class="mirrorsCustomerHero__meta">ת״ז ${escapeHtml(rec.idNumber || primary.idNumber || '—')} · טלפון ${escapeHtml(rec.phone || primary.phone || '—')} · נציג מטפל ${escapeHtml(rec.agentName || '—')}</div>
        </div>
        <div class="mirrorsCustomerHero__status">${escapeHtml(rec.status || 'חדש')}</div>
      </div>
      <div class="mirrorsCustomerHero__chips">${companyChips}</div>`;
    },

    renderScript(rec){
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
        this.els.verifyCard.innerHTML = '';
        return;
      }
      const primary = this.getPrimary(rec);
      const store = this.getVerifyState(rec);
      const smokingAnswer = safeTrim(store.smokingAnswer);
      const deliveryMethod = safeTrim(store.deliveryMethod);
      const addressText = this.getAddressText(primary);
      const emailValue = this.getEmailValue(rec, primary, store);
      const smokingOptions = ['סיגריות','טבק','אלקטרוניות','נרגילה','קנאביס','מוצרי טבק אחרים'];
      const infoCards = [
        ['שם מלא', this.getFullName(rec, primary)],
        ['תעודת זהות', rec.idNumber || primary.idNumber],
        ['תאריך לידה', primary.birthDate],
        ['מצב משפחתי', primary.maritalStatus || primary.familyStatus],
        ['האם יש ילדים', this.getChildrenText(rec, primary)],
        ['עיסוק נוכחי', primary.occupation],
        ['קופת חולים ושב״ן', this.getClinicText(primary)],
        ['כתובת למשלוח הפוליסה', addressText || '—']
      ];
      this.els.verifyCard.innerHTML = `<div class="mirrorsCard__head">
          <div>
            <div class="mirrorsCard__title">אימות נתוני לקוח</div>
            <div class="mirrorsCard__hint">ברשותך אשאל אותך מספר שאלות. אמת מול הלקוח את הנתונים הבאים, השלם תשובות חסרות ושמור את שלב האימות.</div>
          </div>
          <span class="mirrorsVerifyBadge">שלב המשך שיחה</span>
        </div>

        <div class="mirrorsPromptBar">ברשותך אשאל אותך מספר שאלות:</div>

        <div class="mirrorsVerifyGrid mirrorsVerifyGrid--wide">${infoCards.map(([label, value]) => `<div class="mirrorsInfoCard"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || '—')}</strong></div>`).join('')}</div>

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

        <div class="mirrorsVerifyFooter">
          <button class="btn btn--primary" data-mirror-save-verify type="button">שמור את שלב האימות</button>
        </div>`;
    },

    async saveVerification(){
      const rec = this.current();
      if(!rec) return;
      const primary = this.getPrimary(rec);
      const store = this.getVerifyState(rec);
      const smokingAnswer = safeTrim(store.smokingAnswer);
      const deliveryMethod = safeTrim(store.deliveryMethod);
      if(!smokingAnswer) {
        alert('יש לסמן האם הלקוח מעשן או עישן בשנתיים האחרונות.');
        return;
      }
      if(smokingAnswer === 'yes'){
        if(!Array.isArray(store.smokingProducts) || !store.smokingProducts.length){
          alert('יש לסמן לפחות מוצר עישון אחד.');
          return;
        }
        if(!safeTrim(store.smokingQuantity)){
          alert('יש למלא כמות עישון.');
          return;
        }
      }
      if(!deliveryMethod){
        alert('יש לבחור איך הלקוח רוצה לקבל את הדיוורים.');
        return;
      }
      if(deliveryMethod === 'email'){
        const email = this.getEmailValue(rec, primary, store);
        if(!email){
          alert('יש להזין כתובת מייל עבור הלקוח.');
          return;
        }
        if(!/^\S+@\S+\.\S+$/.test(email)){
          alert('כתובת המייל אינה תקינה.');
          return;
        }
        store.deliveryEmail = email;
        this.setCustomerEmail(rec, email);
      }
      if(deliveryMethod === 'home'){
        store.deliveryEmail = this.getEmailValue(rec, primary, store);
      }
      store.savedAt = nowISO();
      store.savedBy = safeTrim(Auth?.current?.name);
      State.data.meta.updatedAt = nowISO();
      rec.updatedAt = State.data.meta.updatedAt;
      await App.persist('שיקוף נשמר');
      this.render();
      alert('שלב אימות הנתונים נשמר בהצלחה.');
    },

    formatDate(v){
      if(!v) return '—';
      const d = new Date(v);
      if(Number.isNaN(+d)) return String(v);
      try{ return d.toLocaleString('he-IL'); }catch(_e){ return String(v); }
    }
  };

const App = {
    _bootPromise: null,

    async boot(){
      Storage.restoreUrl();
      UI.renderSyncStatus("טוען…", "warn");

      // load from sheets
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

      // sync gsUrl field
      if (UI.els.gsUrl) UI.els.gsUrl.value = Storage.gsUrl || "";

      // after state is ready: apply role UI
      UI.applyRoleUI();
      if (Auth.current) {
        // keep current view (admin -> settings)
        UI.goView(Auth.isAdmin() ? "settings" : "dashboard");
      } else {
        UI.goView("dashboard");
      }
    },

    async persist(label){
      // backup always
      try { Storage.saveBackup(State.data); } catch(_) {}

      // save to sheets
      UI.renderSyncStatus("שומר…", "warn");
      const r = await Storage.saveSheets(State.data);
      if (r.ok) {
        UI.renderSyncStatus(label || "נשמר", "ok", r.at);
      } else {
        UI.renderSyncStatus("שגיאה בשמירה", "err", null, r.error);
        console.error("SAVE_TO_SHEETS_FAILED:", r?.error || r);
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
          CustomersUI.render();
          ProposalsUI.render();
        }
      } else {
        UI.renderSyncStatus("שגיאה בטעינת נתוני משתמש", "err", null, r.error);
        console.error("LOAD_SESSION_STATE_FAILED:", r?.error || r);
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
        if (Auth.current) { CustomersUI.render(); ProposalsUI.render(); }
      } else {
        UI.renderSyncStatus("שגיאה בסנכרון", "err", null, r.error);
      }
    }
  };

  // ---------- Start ----------
  UI.init();
  Auth.init();
  ForgotPasswordUI.init();
  CustomersUI.init();
  ArchiveCustomerUI.init();
  MirrorsUI.init();
  Wizard.init();
  App._bootPromise = App.boot();

})();
