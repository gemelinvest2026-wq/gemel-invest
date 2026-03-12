/* GEMEL INVEST CRM — CLEAN CORE (Sheets + Admin Settings/Users)
   P260228-0800
   - Keeps: Login, user pill, Google Sheets connection, Admin: System Settings + Users
   - Removes: Customers / New Customer flow / Policies UI
*/
(() => {
  "use strict";

  const BUILD = "20260310-0045";
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
    const currentStep = Math.max(1, Math.min(8, Number(p?.currentStep || payload?.currentStep || 1) || 1));
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
        remember: $("#lcLoginRemember"),
        err: $("#lcLoginError"),
      };

      // show login immediately
      try {
        document.body.classList.add("lcAuthLock");
        this.els.wrap?.setAttribute?.("aria-hidden","false");
      } catch(_) {}

      const restored = this._restoreSession();
      if (restored) {
        this.current = restored;
        this.unlock();
      } else {
        this.lock();
      }

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
      const remember = !!this.els.remember?.checked;

      this._setError("");
      if(!username) return this._setError("נא להזין שם משתמש");
      if(!pin) return this._setError("נא להזין קוד כניסה");

      // ensure boot done
      try { await App._bootPromise; } catch(_) {}

      const defAdmin = { username:"מנהל מערכת", pin:"1234" };
      const adminAuth = State.data?.meta?.adminAuth || { ...defAdmin, active:true };

      if (adminAuth.active !== false && username === safeTrim(adminAuth.username) && pin === safeTrim(adminAuth.pin)) {
        this.current = { name: safeTrim(adminAuth.username) || defAdmin.username, role:"admin" };
        if(remember) this._saveSession(this.current); else localStorage.removeItem(LS_SESSION_KEY);
        this.unlock();
        UI.applyRoleUI();
        UI.renderAuthPill();
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
      if(remember) this._saveSession(this.current); else localStorage.removeItem(LS_SESSION_KEY);
      this.unlock();
      UI.applyRoleUI();
      UI.renderAuthPill();
      UI.goView("dashboard");
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
    },

    setActiveNav(view){
      $$(".nav__item").forEach(b => b.classList.toggle("is-active", b.getAttribute("data-view") === view));
    },

    goView(view){
      let safe = String(view || "dashboard");
      if(safe === "settings" && !Auth.isAdmin()) safe = "dashboard";
      if(safe === "users" && !Auth.canManageUsers()) safe = "dashboard";
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
          discountSpec: "מפרט הנחות ביטוח",
          settings: "הגדרות מערכת",
          users: "ניהול משתמשים"
        };
        this.els.pageTitle.textContent = map[safe] || "דשבורד";
      }

      this.setActiveNav(safe);
      document.body.classList.remove("view-users-active","view-dashboard-active","view-settings-active","view-discountSpec-active","view-customers-active");
      document.body.classList.add("view-" + safe + "-active");

      // render view data
      if (safe === "users") UsersUI.render();
      if (safe === "customers") CustomersUI.render();
      if (safe === "proposals") ProposalsUI.render();
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

    render(){
      if(!UI.els.usersTbody) return;
      const rows = this._filtered();
      UI.els.usersTbody.innerHTML = rows.map(a => {
        const status = (a.active === false) ? "מושבת" : "פעיל";
        const role = (a.role === "manager") ? "מנהל" : (a.role === "ops") ? "תפעול" : "נציג";
        return `
          <tr>
            <td>${escapeHtml(a.name)}</td>
            <td>${role}</td>
            <td><span class="badge">${status}</span></td>
            <td>
              <button class="btn" data-act="edit" data-id="${escapeHtml(a.id)}">ערוך</button>
              <button class="btn btn--danger" data-act="toggle" data-id="${escapeHtml(a.id)}">${a.active===false ? "הפעל" : "השבת"}</button>
            </td>
          </tr>`;
      }).join("");

      // bind actions
      UI.els.usersTbody.querySelectorAll("button[data-act]").forEach(b => {
        on(b, "click", async () => {
          const id = b.getAttribute("data-id");
          const act = b.getAttribute("data-act");
          if(act === "edit") await this.editUser(id);
          if(act === "toggle") await this.toggleUser(id);
        });
      });
    },

    async addUser(){
      this.openModal("add", null);
    },

    async editUser(id){
      const a = (State.data.agents || []).find(x => String(x.id) === String(id));
      if(!a) return;
      this.openModal("edit", a);
    },

    async toggleUser(id){
      const a = (State.data.agents || []).find(x => String(x.id) === String(id));
      if(!a) return;
      a.active = (a.active === false) ? true : false;
      State.data.meta.updatedAt = nowISO();

      await App.persist(a.active ? "המשתמש הופעל" : "המשתמש הושבת");
      this.render();
    }
  };

  function escapeHtml(s){
    return String(s ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  // ---------- Customers UI ----------
  const CustomersUI = {
    currentId: null,
    els: {},
    policyModal: {},
    init(){
      this.els.wrap = $("#customerFull");
      this.els.backdrop = $("#customerFullBackdrop");
      this.els.close = $("#customerFullClose");
      this.els.opsBtn = $("#customerFullOpsBtn");
      this.els.proposalBtn = $("#customerFullProposalBtn");
      this.els.addPolicyBtn = $("#customerFullAddPolicyBtn");
      this.els.name = $("#customerFullName");
      this.els.meta = $("#customerFullMeta");
      this.els.avatar = $("#customerFullAvatar");
      this.els.dash = $("#customerFullDash");
      this.els.body = $("#customerFullBody");

      this.policyModal.wrap = $("#customerPolicyModal");
      this.policyModal.backdrop = $("#customerPolicyModalBackdrop");
      this.policyModal.close = $("#customerPolicyModalClose");
      this.policyModal.title = $("#customerPolicyModalTitle");
      this.policyModal.body = $("#customerPolicyModalBody");
      this.els.loader = $("#customerLoader");

      on(this.els.close, "click", () => this.close());
      on(this.els.backdrop, "click", () => this.close());
      on(this.els.opsBtn, "click", () => {
        const rec = this.current();
        if(!rec) return;
        const prevPayload = Wizard.getOperationalPayload;
        try{
          Wizard.getOperationalPayload = () => JSON.parse(JSON.stringify(rec.payload || {}));
          Wizard.openOperationalReport();
        } finally {
          Wizard.getOperationalPayload = prevPayload;
        }
      });
      on(this.els.proposalBtn, "click", () => {
        const rec = this.current();
        if(!rec) return;
        alert(`הצעה עבור ${rec.fullName || "הלקוח"} תהיה זמינה בשלב הבא.`);
      });
      on(this.els.addPolicyBtn, "click", () => {
        alert("שלב הבא: חיבור הוספת פוליסה מתוך תיק הלקוח.");
      });

      on(this.policyModal.close, "click", () => this.closePolicyModal());
      on(this.policyModal.backdrop, "click", () => this.closePolicyModal());
      on(this.policyModal.wrap, "click", (ev) => {
        if(ev.target?.getAttribute?.("data-close") === "1") this.closePolicyModal();
      });
    },

    list(){
      const all = Array.isArray(State.data?.customers) ? State.data.customers.slice() : [];
      const visible = all.filter(rec => Auth.canViewAllCustomers() || safeTrim(rec.agentName) === safeTrim(Auth?.current?.name));
      visible.sort((a,b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
      return visible;
    },

    filtered(){
      const q = safeTrim(UI.els.customersSearch?.value).toLowerCase();
      let rows = this.list();
      if(!q) return rows;
      return rows.filter(rec => [rec.fullName, rec.idNumber, rec.phone, rec.agentName, rec.email, rec.city].some(v => safeTrim(v).toLowerCase().includes(q)));
    },

    render(){
      if(!UI.els.customersTbody) return;
      const rows = this.filtered();
      if(UI.els.customersCountBadge){
        UI.els.customersCountBadge.textContent = rows.length + " לקוחות";
      }
      UI.els.customersTbody.innerHTML = rows.length ? rows.map(rec => {
        const updated = this.formatDate(rec.updatedAt || rec.createdAt);
        return `<tr>
          <td><div class="lcCustomers__nameCell"><strong>${escapeHtml(rec.fullName || "—")}</strong><span class="muted small">${escapeHtml(rec.city || "")}</span></div></td>
          <td>${escapeHtml(rec.idNumber || "—")}</td>
          <td dir="ltr">${escapeHtml(rec.phone || "—")}</td>
          <td>${escapeHtml(rec.agentName || "—")}</td>
          <td><span class="badge">${escapeHtml(rec.status || "חדש")}</span></td>
          <td>${escapeHtml(updated)}</td>
          <td><div class="lcCustomers__rowActions">
            <button class="btn btn--primary" data-open-customer="${escapeHtml(rec.id)}" type="button">פתח תיק</button>
            <button class="btn btn--danger lcCustomers__archiveBtn" data-archive-customer="${escapeHtml(rec.id)}" type="button">גנוז לקוח</button>
          </div></td>
        </tr>`;
      }).join("") : `<tr><td colspan="7"><div class="emptyState"><div class="emptyState__icon">🗂️</div><div class="emptyState__title">עדיין אין לקוחות</div><div class="emptyState__text">ברגע שמסיימים הקמת לקוח, הלקוח יישמר כאן אוטומטית ויהיה אפשר לפתוח את תיק הלקוח המלא.</div></div></td></tr>`;

      UI.els.customersTbody.querySelectorAll("[data-open-customer]").forEach(btn => {
        on(btn, "click", () => this.openByIdWithLoader(btn.getAttribute("data-open-customer")));
      });
      UI.els.customersTbody.querySelectorAll("[data-archive-customer]").forEach(btn => {
        on(btn, "click", () => ArchiveCustomerUI.open(btn.getAttribute("data-archive-customer")));
      });
    },

    showLoader(){
      if(!this.els.loader) return;
      this.els.loader.classList.add("is-visible");
      this.els.loader.setAttribute("aria-hidden","false");
      document.body.style.overflow = "hidden";
    },

    hideLoader(){
      if(!this.els.loader) return;
      this.els.loader.classList.remove("is-visible");
      this.els.loader.setAttribute("aria-hidden","true");
    },

    openByIdWithLoader(id, delay=1180){
      const rec = this.byId(id);
      if(!rec) return;
      this.showLoader();
      window.clearTimeout(this._loaderTimer);
      this._loaderTimer = window.setTimeout(() => {
        this.hideLoader();
        this.openById(id);
      }, delay);
    },

    byId(id){
      return (State.data?.customers || []).find(x => String(x.id) === String(id)) || null;
    },

    getAvatarText(rec){
      const name = safeTrim(rec?.fullName || "");
      if(!name) return "ל";
      const parts = name.split(/\s+/).filter(Boolean);
      return safeTrim(parts[0]?.[0] || name[0] || "ל");
    },

    sumPremium(policies=[]){
      return policies.reduce((sum, p) => sum + this.asNumber(p.premiumValue), 0);
    },

    asNumber(v){
      const n = Number(String(v ?? "").replace(/[^\d.\-]/g, ""));
      return Number.isFinite(n) ? n : 0;
    },

    formatMoney(v){
      const n = this.asNumber(v);
      if(!n) return "₪0";
      try{ return "₪" + n.toLocaleString("he-IL"); }catch(_){ return "₪" + n; }
    },

    collectPolicies(rec){
      const payload = rec?.payload || {};
      const policies = [];
      (payload.insureds || []).forEach((ins, idx) => {
        const insuredLabel = safeTrim(ins?.label) || safeTrim(ins?.type) || `מבוטח ${idx+1}`;
        (ins?.data?.existingPolicies || []).forEach((p, pIdx) => {
          const type = safeTrim(p?.type || p?.product || "פוליסה");
          const monthlyPremium = safeTrim(p?.monthlyPremium || p?.premiumMonthly || p?.premium || "");
          const coverItems = Array.isArray(p?.covers) ? p.covers.filter(Boolean) : [];
          const coverageValue = safeTrim(p?.sumInsured || p?.compensation || p?.coverage || (coverItems.length ? coverItems.join(", ") : ""));
          policies.push({
            id: safeTrim(p?.id) || `existing_${idx}_${pIdx}`,
            origin: "existing",
            insuredLabel,
            company: safeTrim(p?.company),
            type,
            premiumText: monthlyPremium ? this.formatMoney(monthlyPremium) : "—",
            premiumValue: monthlyPremium,
            startDate: safeTrim(p?.startDate),
            policyNumber: safeTrim(p?.policyNumber),
            coverageLabel: (type === "מחלות קשות" || type === "סרטן") ? "סכום פיצוי" : (coverItems.length ? "כיסויים" : "סכום ביטוח"),
            coverageValue,
            coverItems,
            subtitle: safeTrim(p?.policyNumber) ? `פוליסה ${p.policyNumber}` : insuredLabel,
            badgeText: "הגיעה עם הלקוח",
            badgeClass: "is-existing",
            ctaText: "פרטי פוליסה",
            details: {
              "סטטוס": "פוליסה קיימת",
              "מבוטח": insuredLabel,
              "חברה": safeTrim(p?.company),
              "סוג מוצר": type,
              "מספר פוליסה": safeTrim(p?.policyNumber),
              "פרמיה חודשית": monthlyPremium ? this.formatMoney(monthlyPremium) : "—",
              [(coverageValue ? ((type === "מחלות קשות" || type === "סרטן") ? "סכום פיצוי" : "סכום ביטוח") : "פרט נוסף")]: coverageValue || "—",
              "תחילת ביטוח": safeTrim(p?.startDate) || "—",
              "שיעבוד": p?.hasPledge ? `כן${safeTrim(p?.pledgeBankName) ? ` · ${safeTrim(p.pledgeBankName)}` : ""}` : "לא"
            }
          });
        });
      });

      (payload.newPolicies || []).forEach((p, idx) => {
        const type = safeTrim(p?.type || p?.product || (p?.company === "מדיקר" ? "מדיקר" : "פוליסה"));
        const premium = safeTrim(p?.premiumMonthly || p?.premium || p?.premiumBefore || "");
        const coverItems = Array.isArray(p?.healthCovers) ? p.healthCovers.filter(Boolean) : [];
        const coverageValue = safeTrim(p?.sumInsured || p?.compensation || p?.coverage || (coverItems.length ? coverItems.join(", ") : ""));
        const insuredLabel = this.getNewPolicyInsuredLabel(payload, p);
        policies.push({
          id: safeTrim(p?.id) || `new_${idx}`,
          origin: "new",
          insuredLabel,
          company: safeTrim(p?.company),
          type,
          premiumText: premium ? this.formatMoney(premium) : "—",
          premiumValue: premium,
          startDate: safeTrim(p?.startDate),
          policyNumber: safeTrim(p?.policyNumber),
          coverageLabel: (type === "מחלות קשות" || type === "סרטן") ? "סכום פיצוי" : (coverageValue && String(coverageValue).includes(",") ? "כיסויים" : "סכום ביטוח"),
          coverageValue,
          subtitle: insuredLabel,
          badgeText: "חדש",
          badgeClass: "is-new",
          ctaText: "פרטי פוליסה",
          details: {
            "סטטוס": "פוליסה חדשה",
            "מבוטח": insuredLabel,
            "חברה": safeTrim(p?.company),
            "סוג מוצר": type,
            "פרמיה חודשית": premium ? this.formatMoney(premium) : "—",
            "תחילת ביטוח": safeTrim(p?.startDate) || "—",
            [(coverageValue ? ((type === "מחלות קשות" || type === "סרטן") ? "סכום פיצוי" : (String(coverageValue).includes(",") ? "כיסויים" : "סכום ביטוח")) : "פרט נוסף")]: coverageValue || "—",
            "שיעבוד": p?.pledge ? "כן" : "לא"
          }
        });
      });
      return policies;
    },

    getNewPolicyInsuredLabel(payload, policy){
      if(policy?.insuredMode === "couple"){
        const primary = safeTrim(payload?.insureds?.[0]?.label) || "מבוטח ראשי";
        const spouse = safeTrim((payload?.insureds || []).find(x => x.type === "spouse")?.label);
        return spouse ? `${primary} + ${spouse}` : `${primary} (זוגי)`;
      }
      const ins = (payload?.insureds || []).find(x => x.id === policy?.insuredId);
      return safeTrim(ins?.label) || "מבוטח";
    },

    getStats(rec, policies){
      const uniqueCompanies = Array.from(new Set(policies.map(p => safeTrim(p.company)).filter(Boolean)));
      return [
        { icon: "👥", value: String(rec.insuredCount || payloadCount(rec)), label: "מבוטחים במשפחה", sub: "כולל ראשי / בני זוג / ילדים" },
        { icon: "💼", value: this.formatMoney(this.sumPremium(policies)), label: "פרמיה חודשית", sub: "סך כל הפוליסות בתיק" },
        { icon: "🏢", value: String(uniqueCompanies.length || 0), label: "חברות ביטוח", sub: uniqueCompanies.length ? uniqueCompanies.join(" · ") : "טרם נוספו חברות" },
        { icon: "🗂️", value: String(policies.length || 0), label: "פוליסות פעילות", sub: `${rec.existingPoliciesCount || 0} קיימות · ${rec.newPoliciesCount || 0} חדשות` }
      ];

      function payloadCount(rec){
        return Number(rec?.payload?.insureds?.length || rec?.insuredCount || 0) || 0;
      }
    },

    companyClass(company){
      const key = safeTrim(company);
      const map = {
        "הראל": "is-harel",
        "מגדל": "is-migdal",
        "הפניקס": "is-phoenix",
        "מנורה": "is-menora",
        "כלל": "is-clal",
        "הכשרה": "is-hachshara",
        "איילון": "is-ayalon",
        "AIG": "is-aig",
        "ביטוח ישיר": "is-direct",
        "9 מיליון": "is-nine",
        "מדיקר": "is-medicare"
      };
      return map[key] || "is-generic";
    },

    getCompanyLogoSrc(company){
      if(typeof Wizard?.getCompanyLogoSrc === "function") return Wizard.getCompanyLogoSrc(company) || "";
      const map = {
        "הפניקס": "afenix.png",
        "הראל": "harel.png",
        "כלל": "clal.png",
        "מגדל": "megdl.png",
        "מנורה": "menora.png",
        "איילון": "ayalon.png",
        "הכשרה": "achshara.png",
        "AIG": "aig.png",
        "ביטוח ישיר": "beytuyashir.png",
        "9 מיליון": "9milyon.png",
        "מדיקר": "medicare.png"
      };
      return map[company] || "";
    },

    renderPolicyCard(policy){
      const logoSrc = this.getCompanyLogoSrc(policy.company);
      const logoHtml = logoSrc
        ? `<img class="customerPolicyCard__logoImg" src="${escapeHtml(logoSrc)}" alt="${escapeHtml(policy.company || "")}" />`
        : `<span class="customerPolicyCard__logoFallback">${escapeHtml((policy.company || "ח").slice(0,1))}</span>`;
      const coverageLine = safeTrim(policy.coverageValue)
        ? `<div class="customerPolicyCard__metaLine"><span>${escapeHtml(policy.coverageLabel)}:</span> <strong>${escapeHtml(policy.coverageValue)}</strong></div>`
        : `<div class="customerPolicyCard__metaLine customerPolicyCard__metaLine--muted">${escapeHtml(policy.subtitle || "")}</div>`;
      const bottomLine = safeTrim(policy.startDate)
        ? `<div class="customerPolicyCard__metaLine"><span>תחילה:</span> <strong>${escapeHtml(policy.startDate)}</strong></div>`
        : (safeTrim(policy.policyNumber) ? `<div class="customerPolicyCard__metaLine"><span>מס׳ פוליסה:</span> <strong>${escapeHtml(policy.policyNumber)}</strong></div>` : `<div class="customerPolicyCard__metaLine customerPolicyCard__metaLine--muted">${escapeHtml(policy.insuredLabel || "")}</div>`);
      const coverItems = Array.isArray(policy.coverItems) ? policy.coverItems.filter(Boolean) : [];
      const coverChips = coverItems.length ? `<div class="customerPolicyCard__covers"><div class="customerPolicyCard__coversLabel">כיסויים</div><div class="customerPolicyCard__coversList">${coverItems.map(c => `<span class="customerPolicyCard__coverChip">${escapeHtml(c)}</span>`).join("")}</div></div>` : ``;
      return `<article class="customerPolicyCard ${this.companyClass(policy.company)} ${policy.origin === "new" ? "is-newCard" : "is-existingCard"}">
        <button class="customerPolicyCard__badge ${escapeHtml(policy.badgeClass)}" type="button" data-policy-open="${escapeHtml(policy.id)}">${escapeHtml(policy.badgeText)}</button>
        <div class="customerPolicyCard__shine" aria-hidden="true"></div>
        <div class="customerPolicyCard__head">
          <div class="customerPolicyCard__logoWrap">${logoHtml}</div>
          <div class="customerPolicyCard__brandText">
            <div class="customerPolicyCard__company">${escapeHtml(policy.company || "חברה")}</div>
            <div class="customerPolicyCard__product">${escapeHtml(policy.type || "פוליסה")}</div>
          </div>
        </div>
        <div class="customerPolicyCard__body">
          <div class="customerPolicyCard__premium">${escapeHtml(policy.premiumText || "—")}</div>
          ${coverageLine}
          ${bottomLine}
          ${coverChips}
        </div>
        <div class="customerPolicyCard__actions">
          <button class="customerPolicyCard__actionBtn" type="button" data-policy-open="${escapeHtml(policy.id)}">${escapeHtml(policy.ctaText)}</button>
        </div>
      </article>`;
    },

    renderPolicyWallet(rec, policies){
      const cards = policies.map(p => this.renderPolicyCard(p)).join("");
      return `<section class="customerWalletSection">
        <div class="customerWalletSection__head">
          <div class="customerWalletSection__titleWrap">
            <div class="customerWalletSection__icon">💼</div>
            <div>
              <div class="customerWalletSection__title">תיק הפוליסות</div>
              <div class="customerWalletSection__sub">תצוגת Wallet צבעונית — בדיוק לפי שפת העיצוב שבחרת</div>
            </div>
          </div>
        </div>
        <div class="customerPolicyGrid">${cards || `<div class="emptyState"><div class="emptyState__icon">🧾</div><div class="emptyState__title">עדיין אין פוליסות בתיק</div><div class="emptyState__text">ברגע שיישמרו פוליסות קיימות או חדשות, הן יוצגו כאן אוטומטית.</div></div>`}</div>
      </section>`;
    },

    bindPolicyCardActions(rec, policies){
      this.els.body.querySelectorAll("[data-policy-open]").forEach(btn => {
        on(btn, "click", () => {
          const id = btn.getAttribute("data-policy-open");
          const policy = policies.find(x => String(x.id) === String(id));
          if(policy) this.openPolicyModal(rec, policy);
        });
      });
    },

    openById(id){
      const rec = this.byId(id);
      if(!rec || !this.els.wrap) return;
      this.currentId = rec.id;
      const policies = this.collectPolicies(rec);
      const stats = this.getStats(rec, policies);

      if(this.els.name) this.els.name.textContent = rec.fullName || "תיק לקוח";
      if(this.els.avatar) this.els.avatar.textContent = this.getAvatarText(rec);
      if(this.els.meta){
        const metaParts = [
          rec.idNumber ? `<span class="customerHero__metaItem">ת.ז ${escapeHtml(rec.idNumber)}</span>` : "",
          rec.agentName ? `<span class="customerHero__metaSep">|</span><span class="customerHero__metaItem">נציג: ${escapeHtml(rec.agentName)}</span>` : "",
          rec.phone ? `<span class="customerHero__metaSep">|</span><span class="customerHero__metaItem" dir="ltr">${escapeHtml(rec.phone)}</span>` : ""
        ].filter(Boolean).join("");
        this.els.meta.innerHTML = metaParts;
      }
      if(this.els.dash){
        this.els.dash.innerHTML = stats.map(card => `
          <div class="customerStatCard">
            <div class="customerStatCard__icon">${card.icon}</div>
            <div class="customerStatCard__content">
              <div class="customerStatCard__value">${escapeHtml(card.value)}</div>
              <div class="customerStatCard__label">${escapeHtml(card.label)}</div>
              <div class="customerStatCard__sub">${escapeHtml(card.sub)}</div>
            </div>
          </div>`).join("");
      }
      if(this.els.body){
        this.els.body.innerHTML = this.renderPolicyWallet(rec, policies);
        this.bindPolicyCardActions(rec, policies);
      }
      this.els.wrap.classList.add("is-open");
      this.els.wrap.setAttribute("aria-hidden","false");
      document.body.style.overflow = "hidden";
    },

    openOpsById(id){
      const rec = this.byId(id);
      if(!rec) return;
      const prevPayload = Wizard.getOperationalPayload;
      try{
        Wizard.getOperationalPayload = () => JSON.parse(JSON.stringify(rec.payload || {}));
        Wizard.openOperationalReport();
      } finally {
        Wizard.getOperationalPayload = prevPayload;
      }
    },

    openPolicyModal(rec, policy){
      if(!this.policyModal.wrap || !this.policyModal.body) return;
      if(this.policyModal.title){
        this.policyModal.title.textContent = `${policy.company || "חברה"} · ${policy.type || "פוליסה"}`;
      }
      const detailRows = Object.entries(policy.details || {}).map(([k,v]) => `
        <div class="customerPolicyModal__row">
          <div class="customerPolicyModal__k">${escapeHtml(k)}</div>
          <div class="customerPolicyModal__v">${escapeHtml(safeTrim(v) || "—")}</div>
        </div>`).join("");
      this.policyModal.body.innerHTML = `
        <div class="customerPolicyModal__hero ${this.companyClass(policy.company)}">
          <div class="customerPolicyModal__heroTop">
            <div class="customerPolicyModal__heroBadge ${escapeHtml(policy.badgeClass)}">${escapeHtml(policy.badgeText)}</div>
            <div class="customerPolicyModal__heroPremium">${escapeHtml(policy.premiumText || "—")}</div>
          </div>
          <div class="customerPolicyModal__heroCompany">${escapeHtml(policy.company || "חברה")}</div>
          <div class="customerPolicyModal__heroType">${escapeHtml(policy.type || "פוליסה")}</div>
          <div class="customerPolicyModal__heroSub">${escapeHtml(rec.fullName || "לקוח")} · ${escapeHtml(policy.insuredLabel || "מבוטח")}</div>
        </div>
        <div class="customerPolicyModal__grid">${detailRows}</div>
      `;
      this.policyModal.wrap.classList.add("is-open");
      this.policyModal.wrap.setAttribute("aria-hidden", "false");
    },

    closePolicyModal(){
      if(!this.policyModal.wrap) return;
      this.policyModal.wrap.classList.remove("is-open");
      this.policyModal.wrap.setAttribute("aria-hidden", "true");
    },

    close(){
      if(!this.els.wrap) return;
      window.clearTimeout(this._loaderTimer);
      this.hideLoader();
      this.closePolicyModal();
      this.els.wrap.classList.remove("is-open");
      this.els.wrap.setAttribute("aria-hidden","true");
      document.body.style.overflow = "";
    },

    current(){
      return this.byId(this.currentId);
    },

    formatDate(v){
      if(!v) return "—";
      const d = new Date(v);
      if(Number.isNaN(d.getTime())) return String(v);
      return d.toLocaleString("he-IL");
    }
  };

  const ArchiveCustomerUI = {
    els: {},
    targetId: null,

    init(){
      this.els.wrap = $("#lcArchiveCustomerModal");
      this.els.backdrop = $("#lcArchiveCustomerBackdrop");
      this.els.close = $("#lcArchiveCustomerClose");
      this.els.cancel = $("#lcArchiveCustomerCancel");
      this.els.confirm = $("#lcArchiveCustomerConfirm");
      this.els.pin = $("#lcArchiveCustomerPin");
      this.els.error = $("#lcArchiveCustomerError");
      this.els.name = $("#lcArchiveCustomerName");
      this.els.meta = $("#lcArchiveCustomerMeta");

      on(this.els.backdrop, "click", () => this.close());
      on(this.els.close, "click", () => this.close());
      on(this.els.cancel, "click", () => this.close());
      on(this.els.confirm, "click", async () => { await this.confirm(); });
      on(this.els.pin, "keydown", async (ev) => {
        if(ev.key === "Enter"){
          ev.preventDefault();
          await this.confirm();
        }
      });
    },

    open(id){
      const rec = CustomersUI.byId(id);
      if(!rec || !this.els.wrap) return;
      this.targetId = rec.id;
      if(this.els.name) this.els.name.textContent = rec.fullName || "לקוח ללא שם";
      if(this.els.meta){
        this.els.meta.innerHTML = [
          rec.idNumber ? `ת״ז: <strong>${escapeHtml(rec.idNumber)}</strong>` : "",
          rec.phone ? `טלפון: <strong dir="ltr">${escapeHtml(rec.phone)}</strong>` : "",
          rec.agentName ? `נציג: <strong>${escapeHtml(rec.agentName)}</strong>` : ""
        ].filter(Boolean).map(x => `<span>${x}</span>`).join("");
      }
      if(this.els.pin) this.els.pin.value = "";
      this.showError("");
      this.els.wrap.classList.add("is-open");
      this.els.wrap.setAttribute("aria-hidden","false");
      setTimeout(() => this.els.pin?.focus?.(), 60);
    },

    close(){
      if(!this.els.wrap) return;
      this.els.wrap.classList.remove("is-open");
      this.els.wrap.setAttribute("aria-hidden","true");
      this.targetId = null;
      if(this.els.pin) this.els.pin.value = "";
      this.showError("");
    },

    showError(msg){
      if(!this.els.error) return;
      this.els.error.textContent = String(msg || "");
      this.els.error.style.display = msg ? "block" : "none";
    },

    getArchivePin(){
      return ARCHIVE_CUSTOMER_PIN;
    },

    async confirm(){
      const id = this.targetId;
      const rec = CustomersUI.byId(id);
      if(!id || !rec){
        this.showError("הלקוח לא נמצא יותר במערכת");
        return;
      }

      const typedPin = safeTrim(this.els.pin?.value);
      if(!typedPin){
        this.showError("נא להזין קוד מנהל");
        this.els.pin?.focus?.();
        return;
      }

      if(typedPin !== this.getArchivePin()){
        this.showError("קוד מנהל שגוי");
        this.els.pin?.focus?.();
        this.els.pin?.select?.();
        return;
      }

      const prevCustomers = Array.isArray(State.data?.customers) ? State.data.customers.slice() : [];
      const next = prevCustomers.filter(x => String(x.id) !== String(id));
      State.data.customers = next;
      State.data.meta = State.data.meta || {};
      State.data.meta.updatedAt = nowISO();

      const r = await App.persist("הלקוח נגנז ונמחק");
      if(!r?.ok){
        State.data.customers = prevCustomers;
        State.data.meta.updatedAt = nowISO();
        this.showError("שמירת הגניזה ל-Google Sheets נכשלה. הלקוח לא נמחק. בדוק חיבור ונסה שוב.");
        CustomersUI.render();
        return;
      }

      if(CustomersUI.currentId && String(CustomersUI.currentId) === String(id)){
        CustomersUI.close();
      }

      this.close();
      CustomersUI.render();
    }
  };

  // ---------- Proposals UI ----------
  const ProposalsUI = {
    list(){
      const all = Array.isArray(State.data?.proposals) ? State.data.proposals.slice() : [];
      const visible = all.filter(rec => Auth.canViewAllCustomers() || safeTrim(rec.agentName) === safeTrim(Auth?.current?.name));
      visible.sort((a,b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
      return visible;
    },

    filtered(){
      const q = safeTrim(UI.els.proposalsSearch?.value).toLowerCase();
      let rows = this.list();
      if(!q) return rows;
      return rows.filter(rec => [rec.fullName, rec.idNumber, rec.phone, rec.agentName, rec.email, rec.city].some(v => safeTrim(v).toLowerCase().includes(q)));
    },

    render(){
      if(!UI.els.proposalsTbody) return;
      const rows = this.filtered();
      if(UI.els.proposalsCountBadge) UI.els.proposalsCountBadge.textContent = rows.length + " הצעות";
      UI.els.proposalsTbody.innerHTML = rows.length ? rows.map(rec => `
        <tr>
          <td><div class="lcCustomers__nameCell"><strong>${escapeHtml(rec.fullName || "—")}</strong><span class="muted small">שלב ${escapeHtml(String(rec.currentStep || 1))} מתוך 8</span></div></td>
          <td>${escapeHtml(rec.idNumber || "—")}</td>
          <td dir="ltr">${escapeHtml(rec.phone || "—")}</td>
          <td>${escapeHtml(rec.agentName || "—")}</td>
          <td><span class="badge">טיוטה פתוחה</span></td>
          <td>${escapeHtml(CustomersUI.formatDate(rec.updatedAt || rec.createdAt))}</td>
          <td><div class="lcCustomers__rowActions">
            <button class="btn btn--primary" data-open-proposal="${escapeHtml(rec.id)}" type="button">המשך עריכה</button>
            <button class="btn" data-delete-proposal="${escapeHtml(rec.id)}" type="button">מחק</button>
          </div></td>
        </tr>`).join("") : `<tr><td colspan="7"><div class="emptyState"><div class="emptyState__icon">📝</div><div class="emptyState__title">אין כרגע הצעות פתוחות</div><div class="emptyState__text">כששומרים הקמת לקוח באמצע התהליך, ההצעה תופיע כאן ותאפשר להמשיך בדיוק מאותה נקודה.</div></div></td></tr>`;

      UI.els.proposalsTbody.querySelectorAll("[data-open-proposal]").forEach(btn => {
        on(btn, "click", () => this.openById(btn.getAttribute("data-open-proposal")));
      });
      UI.els.proposalsTbody.querySelectorAll("[data-delete-proposal]").forEach(btn => {
        on(btn, "click", async () => this.deleteById(btn.getAttribute("data-delete-proposal")));
      });
    },

    openById(id){
      const rec = (State.data?.proposals || []).find(x => String(x.id) === String(id));
      if(!rec) return;
      Wizard.openDraft(rec);
    },

    async deleteById(id){
      const rec = (State.data?.proposals || []).find(x => String(x.id) === String(id));
      if(!rec) return;
      const ok = window.confirm(`למחוק את ההצעה של ${rec.fullName || "הלקוח"}?`);
      if(!ok) return;
      State.data.proposals = (State.data.proposals || []).filter(x => String(x.id) !== String(id));
      State.data.meta.updatedAt = nowISO();
      await App.persist("ההצעה נמחקה");
      this.render();
    }
  };


  // ---------- App boot ----------
  

  // ---------- New Customer Wizard (Steps 1–7) ----------
  const Wizard = {
    els: {},
    isOpen: false,
    step: 1,
    steps: [
      { id:1, title:"פרטי לקוח" },
      { id:2, title:"BMI" },
      { id:3, title:"פוליסות קיימות" },
      { id:4, title:"ביטול בחברה נגדית" },
      { id:5, title:"פוליסות חדשות" },
      { id:6, title:"פרטי משלם" },
      { id:7, title:"סיכום" },
      { id:8, title:"הצהרת בריאות" }
    ],
    insureds: [],
    activeInsId: null,

    // closed lists
    clinics: ["כללית","מכבי","מאוחדת","לאומית"],
    shabanMap: {
      "כללית": ["אין שב״ן","כללית מושלם","כללית פלטינום"],
      "מכבי":  ["אין שב״ן","מכבי כסף","מכבי זהב","מכבי שלי"],
      "מאוחדת":["אין שב״ן","מאוחדת עדיף","מאוחדת שיא"],
      "לאומית":["אין שב״ן","לאומית כסף","לאומית זהב"]
    },
    occupations: [
      "אבטחה", "אדריכל", "אדריכלית", "אח", "אחות", "אחראי משמרת", "אינסטלטור", "אנליסט", "אנליסט פיננסי", "אסיסטנט", "איש אחזקה", "איש גבייה", "איש מכירות", "איש סיסטם", "איש תמיכה טכנית", "איש תפעול", "איש שירות", "איש שיווק", "איש QA", "איש DevOps", "אקטואר", "ארכיאולוג", "בודק תוכנה", "ביולוג", "בנאי", "בנקאי", "ברמן", "גזבר", "גנן", "גרפיקאי", "גרפיקאית", "דבוראי", "דוגמן", "דוגמנית", "דייל", "דיילת", "דייל קרקע", "דיילת קרקע", "דייג", "דיג׳יי", "הנדסאי", "הנדסאי אדריכלות", "הנדסאי בניין", "הנדסאי חשמל", "הנדסאי מכונות", "הנדסאי תוכנה", "ובמאי", "וטרינר", "וטרינרית", "זגג", "זכיין", "זמר", "זמרת", "חבלן", "חדרן", "חדרנית", "חובש", "חובשת", "חוקר", "חוקרת", "חשב", "חשבת", "חשב שכר", "חשב שכר בכיר", "חשמלאי", "חשמלאית", "טבח", "טבחית", "טבח ראשי", "טכנאי", "טכנאית", "טכנאי אלקטרוניקה", "טכנאי מיזוג", "טכנאי מחשבים", "טכנאי שירות", "טייס", "טייסת", "טלפן", "טלפנית", "טלמרקטינג", "יועץ", "יועצת", "יועץ ביטוח", "יועצת ביטוח", "יועץ השקעות", "יועצת השקעות", "יועץ מס", "יועצת מס", "יזם", "יזמת", "יחצן", "יחצנית", "כלכלן", "כלכלנית", "כבאי", "כבאית", "כתב", "כתבת", "לבורנט", "לבורנטית", "לוגיסטיקאי", "לוגיסטיקאית", "מהנדסת", "מהנדס", "מהנדס אזרחי", "מהנדסת אזרחית", "מהנדס בניין", "מהנדסת בניין", "מהנדס חשמל", "מהנדסת חשמל", "מהנדס מכונות", "מהנדסת מכונות", "מהנדס תוכנה", "מהנדסת תוכנה", "מדריך", "מדריכה", "מדריך כושר", "מדריכת כושר", "מזכיר", "מזכירה", "מזכיר רפואי", "מזכירה רפואית", "מחנך", "מחנכת", "מחסנאי", "מחסנאית", "מיילד", "מיילדת", "מכונאי", "מכונאית", "מכין שכר", "מנהל", "מנהלת", "מנהל אדמיניסטרטיבי", "מנהלת אדמיניסטרטיבית", "מנהל מוצר", "מנהלת מוצר", "מנהל פרויקט", "מנהלת פרויקט", "מנהל חשבונות", "מנהלת חשבונות", "מנהל כספים", "מנהלת כספים", "מנהל לקוחות", "מנהלת לקוחות", "מנהל מחסן", "מנהלת מחסן", "מנהל מוקד", "מנהלת מוקד", "מנהל משרד", "מנהלת משרד", "מנהל מרפאה", "מנהלת מרפאה", "מנהל סניף", "מנהלת סניף", "מנהל עבודה", "מנהלת עבודה", "מנהל רכש", "מנהלת רכש", "מנהל תפעול", "מנהלת תפעול", "מנהל תיקי לקוחות", "מנהלת תיקי לקוחות", "מנופאי", "מעבדה", "מעצב", "מעצבת", "מעצב גרפי", "מעצבת גרפית", "מפיק", "מפיקה", "מפעיל מכונה", "מפעילת מכונה", "מציל", "מצילה", "מרדים", "מרדימה", "מרכז", "מרכזת", "מרכז שירות", "מרכזת שירות", "מרצה", "מרצה בכיר", "משגיח כשרות", "משווק", "משווקת", "משלח", "משלחת", "מתאם", "מתאמת", "מתאם פגישות", "מתאמת פגישות", "מתכנת", "מתכנתת", "נהג", "נהגת", "נהג אוטובוס", "נהגת אוטובוס", "נהג חלוקה", "נהגת חלוקה", "נהג מונית", "נהגת מונית", "נהג משאית", "נהגת משאית", "נגר", "נגרית", "נציג", "נציגה", "נציג בק אופיס", "נציגה בק אופיס", "נציג מכירות", "נציגה מכירות", "נציג שירות", "נציגה שירות", "סגן מנהל", "סגנית מנהל", "סוכן", "סוכנת", "סוכן ביטוח", "סוכנת ביטוח", "סוכן מכירות", "סוכנת מכירות", "סטודנט", "סטודנטית", "ספר", "ספרית", "עובד אדמיניסטרציה", "עובדת אדמיניסטרציה", "עובד ייצור", "עובדת ייצור", "עובד ניקיון", "עובדת ניקיון", "עובד סוציאלי", "עובדת סוציאלית", "עובד כללי", "עובדת כללית", "עובד מעבדה", "עובדת מעבדה", "עובד תחזוקה", "עובדת תחזוקה", "עוזר הוראה", "עוזרת הוראה", "עורך דין", "עורכת דין", "עורך וידאו", "עורכת וידאו", "עיתונאי", "עיתונאית", "עמיל מכס", "עמילה מכס", "פועל", "פועלת", "פיזיותרפיסט", "פיזיותרפיסטית", "פקיד", "פקידה", "פרמדיק", "פרמדיקית", "פסיכולוג", "פסיכולוגית", "פקיד קבלה", "פקידה קבלה", "צלם", "צלמת", "צבעי", "צורף", "קבלן", "קב\"ט", "קונדיטור", "קונדיטורית", "קוסמטיקאית", "קופאי", "קופאית", "קצין בטיחות", "קצינת בטיחות", "קצין ביטחון", "קצינת ביטחון", "קצין רכב", "קצינת רכב", "קצין משאבי אנוש", "קצינת משאבי אנוש", "קריין", "קריינית", "רב", "רואת חשבון", "רואה חשבון", "רוקח", "רוקחת", "רופא", "רופאה", "רופא משפחה", "רופאת משפחה", "רופא שיניים", "רופאת שיניים", "רכז", "רכזת", "רכז גיוס", "רכזת גיוס", "רכז לוגיסטיקה", "רכזת לוגיסטיקה", "רכז תפעול", "רכזת תפעול", "רתך", "שף", "שפית", "שחקן", "שחקנית", "שמאי", "שמאי רכב", "שף קונדיטור", "שוטר", "שוטרת", "שומר", "שומרת", "שרברב", "תובע", "תובעת", "תזונאי", "תזונאית", "תופר", "תופרת", "תחקירן", "תחקירנית", "תיירן", "תיירנית", "תלמיד", "תלמידה", "עצמאי", "עצמאית", "בעל עסק", "בעלת עסק", "פרילנסר", "פרילנסרית", "לא עובד", "לא עובדת", "מחפש עבודה", "מחפשת עבודה", "פנסיונר", "פנסיונרית", "חייל", "חיילת", "איש קבע", "אשת קבע", "מילואימניק", "מילואימניקית", "מאבטח", "מאבטחת", "סדרן", "סדרנית", "עובד מדינה", "עובדת מדינה", "עובד עירייה", "עובדת עירייה", "עובד מועצה", "עובדת מועצה", "עובד ציבור", "עובדת ציבור", "מנכ\"ל", "מנכ\"לית", "סמנכ\"ל", "סמנכ\"לית", "מנהל מערכות מידע", "מנהלת מערכות מידע", "מנהל חדשנות", "מנהלת חדשנות", "מנהל דיגיטל", "מנהלת דיגיטל", "מנהל פיתוח עסקי", "מנהלת פיתוח עסקי", "מנהל קמפיינים", "מנהלת קמפיינים", "מפתח", "מפתחת", "מפתח תוכנה", "מפתחת תוכנה", "מפתח פול סטאק", "מפתחת פול סטאק", "מפתח בקאנד", "מפתחת בקאנד", "מפתח פרונטאנד", "מפתחת פרונטאנד", "מפתח מובייל", "מפתחת מובייל", "מפתח iOS", "מפתחת iOS", "מפתח Android", "מפתחת Android", "מהנדס נתונים", "מהנדסת נתונים", "מדען נתונים", "מדענית נתונים", "אנליסט נתונים", "אנליסטית נתונים", "מנהל IT", "מנהלת IT", "מומחה ענן", "מומחית ענן", "מומחה סייבר", "מומחית סייבר", "אנליסט סייבר", "אנליסטית סייבר", "חוקר סייבר", "חוקרת סייבר", "בודק חדירות", "בודקת חדירות", "DBA", "ארכיטקט תוכנה", "ארכיטקטית תוכנה", "מוכר", "מוכרת", "מוכר בחנות", "מוכרת בחנות", "מוכר פרונטלי", "מוכרת פרונטלית", "נציג תמיכה", "נציגת תמיכה", "נציג קשרי לקוחות", "נציגת קשרי לקוחות", "נציג שימור", "נציגת שימור", "מוקדן", "מוקדנית", "מוקדן שירות", "מוקדנית שירות", "מוקדן מכירות", "מוקדנית מכירות", "טלר", "טלרית", "מטפל", "מטפלת", "מטפל רגשי", "מטפלת רגשית", "מטפל זוגי", "מטפלת זוגית", "מטפל התנהגותי", "מטפלת התנהגותית", "פסיכותרפיסט", "פסיכותרפיסטית", "עובד סיעוד", "עובדת סיעוד", "מטפל סיעודי", "מטפלת סיעודית", "מלווה רפואי", "מלווה רפואית", "מרפא בעיסוק", "מרפאה בעיסוק", "קלינאי תקשורת", "קלינאית תקשורת", "רנטגנאי", "רנטגנאית", "דיאטן", "דיאטנית", "דיאטן קליני", "דיאטנית קלינית", "סניטר", "סניטרית", "רופא ילדים", "רופאת ילדים", "רופא עור", "רופאת עור", "רופא נשים", "רופאת נשים", "רופא פנימי", "רופאה פנימית", "אורתופד", "אורתופדית", "רדיולוג", "רדיולוגית", "קרדיולוג", "קרדיולוגית", "כירורג", "כירורגית", "רופא שיקום", "רופאת שיקום", "פודיאטור", "פודיאטרית", "גננת", "סייע", "סייעת", "מורה יסודי", "מורה על יסודי", "מורה לתיכון", "מורה לאנגלית", "מורה למתמטיקה", "מורה למדעים", "מורה למוזיקה", "מורה לאמנות", "מורה נהיגה", "מורה לחינוך מיוחד", "יועץ חינוכי", "יועצת חינוכית", "מנהל בית ספר", "מנהלת בית ספר", "ספרן", "ספרנית", "חוקר אקדמי", "חוקרת אקדמית", "בנקאי השקעות", "פקיד אשראי", "פקידת אשראי", "פקיד משכנתאות", "פקידת משכנתאות", "חתם אשראי", "חתמת אשראי", "מנהל סיכונים", "מנהלת סיכונים", "אנליסט אשראי", "אנליסטית אשראי", "יועץ פנסיוני", "יועצת פנסיונית", "שמאי ביטוח", "שמאית ביטוח", "מסלק תביעות", "מסלקת תביעות", "נהג מסחרי", "נהגת מסחרית", "נהג הסעות", "נהגת הסעות", "נהג מנוף", "נהגת מנוף", "מלגזן", "מלגזנית", "מנהל צי רכב", "מנהלת צי רכב", "שליח", "שליחה", "בלדר", "בלדרית", "דוור", "דוורית", "אחראי הפצה", "אחראית הפצה", "מתאם לוגיסטי", "מתאמת לוגיסטית", "מסגר", "מסגרית", "חרט", "חרטת", "רתך CO2", "רתכת CO2", "עובד מפעל", "עובדת מפעל", "מפעיל CNC", "מפעילת CNC", "חרט CNC", "חרטת CNC", "מפעיל לייזר", "מפעילת לייזר", "מפעיל רובוט", "מפעילת רובוט", "מפעיל קו ייצור", "מפעילת קו ייצור", "טכנאי מכשור ובקרה", "טכנאית מכשור ובקרה", "מהנדס ייצור", "מהנדסת ייצור", "מהנדס איכות", "מהנדסת איכות", "מנהל מפעל", "מנהלת מפעל", "מנהל ייצור", "מנהלת ייצור", "אופה", "אופה מקצועי", "אופה מקצועית", "שוקולטייר", "בריסטה", "טבח קו", "טבחית קו", "טבח מוסדי", "טבחית מוסדית", "סו שף", "מנהל מסעדה", "מנהלת מסעדה", "מלצר", "מלצרית", "מארח", "מארחת", "צלם סטילס", "צלמת סטילס", "צלם וידאו", "צלמת וידאו", "במאי", "במאית", "מפיק אירועים", "מפיקה אירועים", "שחקן קול", "שחקנית קול", "מעצב אופנה", "מעצבת אופנה", "סטייליסט", "סטייליסטית", "מאפר", "מאפרת", "מעצב פנים", "מעצבת פנים", "הום סטיילינג", "מקעקע", "מקעקעת", "עובד חקלאות", "עובדת חקלאות", "חקלאי", "חקלאית", "כורם", "כורמת", "רפתן", "רפתנית", "לולן", "לולנית", "מאלף כלבים", "מאלפת כלבים", "ספר כלבים", "ספרית כלבים", "מדריך רכיבה", "מדריכת רכיבה", "עורך דין מסחרי", "עורכת דין מסחרית", "עורך דין נדל\"ן", "עורכת דין נדל\"ן", "עורך דין משפחה", "עורכת דין משפחה", "יועץ משפטי", "יועצת משפטית", "מתמחה במשפטים", "מתמחה משפטית", "נוטריון", "חוקר פרטי", "חוקרת פרטית", "מודד", "מודדת", "שמאי מקרקעין", "שמאית מקרקעין", "סוכן נדל\"ן", "סוכנת נדל\"ן", "מתווך", "מתווכת", "מנהל פרויקטי נדל\"ן", "מנהלת פרויקטי נדל\"ן", "מנהל עבודה בבניין", "מנהלת עבודה בבניין", "מהנדס קונסטרוקציה", "מהנדסת קונסטרוקציה", "רצף", "רצפת", "טייח", "טייחת", "קבלן שיפוצים", "קבלנית שיפוצים", "מפעיל עגורן", "מפעילת עגורן", "מיזוג אוויר", "טכנאי קירור", "טכנאית קירור", "פקיד משרד", "פקידת משרד", "מזכירה בכירה", "מזכיר בכיר", "אדמיניסטרטור", "אדמיניסטרטורית", "רכז אדמיניסטרטיבי", "רכזת אדמיניסטרטיבית", "מזכיר אישי", "מזכירה אישית", "פקיד תפעול", "פקידת תפעול", "בק אופיס", "בק אופיס בכיר", "בק אופיס בכירה", "מקליד נתונים", "מקלידת נתונים", "מזין נתונים", "מזינת נתונים", "קניין", "קניינית", "מנהל סחר", "מנהלת סחר", "מנהל קטגוריה", "מנהלת קטגוריה", "מרצ'נדייזר", "מרצ'נדייזרית", "סדרן סחורה", "סדרנית סחורה", "מתרגם", "מתרגמת", "כתב טכני", "כתבת טכנית", "QA ידני", "QA אוטומציה", "בודק אוטומציה", "בודקת אוטומציה", "עוזר אדמיניסטרציה", "עוזרת אדמיניסטרציה", "עוזר תפעול", "עוזרת תפעול", "עוזר מכירות", "עוזרת מכירות", "עוזר שירות לקוחות", "עוזרת שירות לקוחות", "עוזר שירות", "עוזרת שירות", "עוזר גבייה", "עוזרת גבייה", "עוזר לוגיסטיקה", "עוזרת לוגיסטיקה", "עוזר רכש", "עוזרת רכש", "עוזר יבוא", "עוזרת יבוא", "עוזר יצוא", "עוזרת יצוא", "עוזר הדרכה", "עוזרת הדרכה", "עוזר שיווק", "עוזרת שיווק", "עוזר דיגיטל", "עוזרת דיגיטל", "עוזר גיוס", "עוזרת גיוס", "עוזר משאבי אנוש", "עוזרת משאבי אנוש", "עוזר פיתוח עסקי", "עוזרת פיתוח עסקי", "עוזר איכות", "עוזרת איכות", "עוזר בטיחות", "עוזרת בטיחות", "עוזר אחזקה", "עוזרת אחזקה", "עוזר הפצה", "עוזרת הפצה", "עוזר מלאי", "עוזרת מלאי", "עוזר מחסן", "עוזרת מחסן", "עוזר קליניקה", "עוזרת קליניקה", "עוזר מרפאה", "עוזרת מרפאה", "עוזר מעבדה", "עוזרת מעבדה", "עוזר תביעות", "עוזרת תביעות", "עוזר ביטוח", "עוזרת ביטוח", "עוזר פנסיה", "עוזרת פנסיה", "עוזר משכנתאות", "עוזרת משכנתאות", "עוזר אשראי", "עוזרת אשראי", "עוזר כספים", "עוזרת כספים", "עוזר חשבונות", "עוזרת חשבונות", "עוזר תוכן", "עוזרת תוכן", "עוזר סושיאל", "עוזרת סושיאל", "עוזר פרסום", "עוזרת פרסום", "עוזר מדיה", "עוזרת מדיה", "עוזר IT", "עוזרת IT", "עוזר מערכות מידע", "עוזרת מערכות מידע", "עוזר סייבר", "עוזרת סייבר", "עוזר מידע", "עוזרת מידע", "עוזר פרויקטים", "עוזרת פרויקטים", "עוזר לקוחות", "עוזרת לקוחות", "אחראי אדמיניסטרציה", "אחראית אדמיניסטרציה", "אחראי תפעול", "אחראית תפעול", "אחראי מכירות", "אחראית מכירות", "אחראי שירות לקוחות", "אחראית שירות לקוחות", "אחראי שירות", "אחראית שירות", "אחראי גבייה", "אחראית גבייה", "אחראי לוגיסטיקה", "אחראית לוגיסטיקה", "אחראי רכש", "אחראית רכש", "אחראי יבוא", "אחראית יבוא", "אחראי יצוא", "אחראית יצוא", "אחראי הדרכה", "אחראית הדרכה", "אחראי שיווק", "אחראית שיווק", "אחראי דיגיטל", "אחראית דיגיטל", "אחראי גיוס", "אחראית גיוס", "אחראי משאבי אנוש", "אחראית משאבי אנוש", "אחראי פיתוח עסקי", "אחראית פיתוח עסקי", "אחראי איכות", "אחראית איכות", "אחראי בטיחות", "אחראית בטיחות", "אחראי אחזקה", "אחראית אחזקה", "אחראי מלאי", "אחראית מלאי", "אחראי מחסן", "אחראית מחסן", "אחראי קליניקה", "אחראית קליניקה", "אחראי מרפאה", "אחראית מרפאה", "אחראי מעבדה", "אחראית מעבדה", "אחראי תביעות", "אחראית תביעות", "אחראי ביטוח", "אחראית ביטוח", "אחראי פנסיה", "אחראית פנסיה", "אחראי משכנתאות", "אחראית משכנתאות", "אחראי אשראי", "אחראית אשראי", "אחראי כספים", "אחראית כספים", "אחראי חשבונות", "אחראית חשבונות", "אחראי תוכן", "אחראית תוכן", "אחראי סושיאל", "אחראית סושיאל", "אחראי פרסום", "אחראית פרסום", "אחראי מדיה", "אחראית מדיה", "אחראי IT", "אחראית IT", "אחראי מערכות מידע", "אחראית מערכות מידע", "אחראי סייבר", "אחראית סייבר", "אחראי מידע", "אחראית מידע", "אחראי פרויקטים", "אחראית פרויקטים", "אחראי לקוחות", "אחראית לקוחות", "מנהל אדמיניסטרציה", "מנהלת אדמיניסטרציה", "מנהל מכירות", "מנהלת מכירות", "מנהל שירות לקוחות", "מנהלת שירות לקוחות", "מנהל שירות", "מנהלת שירות", "מנהל גבייה", "מנהלת גבייה", "מנהל לוגיסטיקה", "מנהלת לוגיסטיקה", "מנהל יבוא", "מנהלת יבוא", "מנהל יצוא", "מנהלת יצוא", "מנהל הדרכה", "מנהלת הדרכה", "מנהל שיווק", "מנהלת שיווק", "מנהל גיוס", "מנהלת גיוס", "מנהל משאבי אנוש", "מנהלת משאבי אנוש", "מנהל איכות", "מנהלת איכות", "מנהל בטיחות", "מנהלת בטיחות", "מנהל אחזקה", "מנהלת אחזקה", "מנהל הפצה", "מנהלת הפצה", "מנהל מלאי", "מנהלת מלאי", "מנהל קליניקה", "מנהלת קליניקה", "מנהל מעבדה", "מנהלת מעבדה", "מנהל תביעות", "מנהלת תביעות", "מנהל ביטוח", "מנהלת ביטוח", "מנהל פנסיה", "מנהלת פנסיה", "מנהל משכנתאות", "מנהלת משכנתאות", "מנהל אשראי", "מנהלת אשראי", "מנהל תוכן", "מנהלת תוכן", "מנהל סושיאל", "מנהלת סושיאל", "מנהל פרסום", "מנהלת פרסום", "מנהל מדיה", "מנהלת מדיה", "מנהל סייבר", "מנהלת סייבר", "מנהל מידע", "מנהלת מידע", "מנהל פרויקטים", "מנהלת פרויקטים", "רכז אדמיניסטרציה", "רכזת אדמיניסטרציה", "רכז מכירות", "רכזת מכירות", "רכז שירות לקוחות", "רכזת שירות לקוחות", "רכז שירות", "רכזת שירות", "רכז גבייה", "רכזת גבייה", "רכז רכש", "רכזת רכש", "רכז יבוא", "רכזת יבוא", "רכז יצוא", "רכזת יצוא", "רכז הדרכה", "רכזת הדרכה", "רכז שיווק", "רכזת שיווק", "רכז דיגיטל", "רכזת דיגיטל", "רכז משאבי אנוש", "רכזת משאבי אנוש", "רכז פיתוח עסקי", "רכזת פיתוח עסקי", "רכז איכות", "רכזת איכות", "רכז בטיחות", "רכזת בטיחות", "רכז אחזקה", "רכזת אחזקה", "רכז הפצה", "רכזת הפצה", "רכז מלאי", "רכזת מלאי", "רכז מחסן", "רכזת מחסן", "רכז קליניקה", "רכזת קליניקה", "רכז מרפאה", "רכזת מרפאה", "רכז מעבדה", "רכזת מעבדה", "רכז תביעות", "רכזת תביעות", "רכז ביטוח", "רכזת ביטוח", "רכז פנסיה", "רכזת פנסיה", "רכז משכנתאות", "רכזת משכנתאות", "רכז אשראי", "רכזת אשראי", "רכז כספים", "רכזת כספים", "רכז חשבונות", "רכזת חשבונות", "רכז תוכן", "רכזת תוכן", "רכז סושיאל", "רכזת סושיאל", "רכז פרסום", "רכזת פרסום", "רכז מדיה", "רכזת מדיה", "רכז IT", "רכזת IT", "רכז מערכות מידע", "רכזת מערכות מידע", "רכז סייבר", "רכזת סייבר", "רכז מידע", "רכזת מידע", "רכז פרויקטים", "רכזת פרויקטים", "רכז לקוחות", "רכזת לקוחות", "מתאם אדמיניסטרציה", "מתאמת אדמיניסטרציה", "מתאם תפעול", "מתאמת תפעול", "מתאם מכירות", "מתאמת מכירות", "מתאם שירות לקוחות", "מתאמת שירות לקוחות", "מתאם שירות", "מתאמת שירות", "מתאם גבייה", "מתאמת גבייה", "מתאם לוגיסטיקה", "מתאמת לוגיסטיקה", "מתאם רכש", "מתאמת רכש", "מתאם יבוא", "מתאמת יבוא", "מתאם יצוא", "מתאמת יצוא", "מתאם הדרכה", "מתאמת הדרכה", "מתאם שיווק", "מתאמת שיווק", "מתאם דיגיטל", "מתאמת דיגיטל", "מתאם גיוס", "מתאמת גיוס", "מתאם משאבי אנוש", "מתאמת משאבי אנוש", "מתאם פיתוח עסקי", "מתאמת פיתוח עסקי", "מתאם איכות", "מתאמת איכות", "מתאם בטיחות", "מתאמת בטיחות", "מתאם אחזקה", "מתאמת אחזקה", "מתאם הפצה", "מתאמת הפצה", "מתאם מלאי", "מתאמת מלאי", "מתאם מחסן", "מתאמת מחסן", "מתאם קליניקה", "מתאמת קליניקה", "מתאם מרפאה", "מתאמת מרפאה", "מתאם מעבדה", "מתאמת מעבדה", "מתאם תביעות", "מתאמת תביעות", "מתאם ביטוח", "מתאמת ביטוח", "מתאם פנסיה", "מתאמת פנסיה", "מתאם משכנתאות", "מתאמת משכנתאות", "מתאם אשראי", "מתאמת אשראי", "מתאם כספים", "מתאמת כספים", "מתאם חשבונות", "מתאמת חשבונות", "מתאם תוכן", "מתאמת תוכן", "מתאם סושיאל", "מתאמת סושיאל", "מתאם פרסום", "מתאמת פרסום", "מתאם מדיה", "מתאמת מדיה", "מתאם IT", "מתאמת IT", "מתאם מערכות מידע", "מתאמת מערכות מידע", "מתאם סייבר", "מתאמת סייבר", "מתאם מידע", "מתאמת מידע", "מתאם פרויקטים", "מתאמת פרויקטים", "מתאם לקוחות", "מתאמת לקוחות", "מומחה אדמיניסטרציה", "מומחית אדמיניסטרציה", "מומחה תפעול", "מומחית תפעול", "מומחה מכירות", "מומחית מכירות", "מומחה שירות לקוחות", "מומחית שירות לקוחות", "מומחה שירות", "מומחית שירות", "מומחה גבייה", "מומחית גבייה", "מומחה לוגיסטיקה", "מומחית לוגיסטיקה", "מומחה רכש", "מומחית רכש", "מומחה יבוא", "מומחית יבוא", "מומחה יצוא", "מומחית יצוא", "מומחה הדרכה", "מומחית הדרכה", "מומחה שיווק", "מומחית שיווק", "מומחה דיגיטל", "מומחית דיגיטל", "מומחה גיוס", "מומחית גיוס", "מומחה משאבי אנוש", "מומחית משאבי אנוש", "מומחה פיתוח עסקי", "מומחית פיתוח עסקי", "מומחה איכות", "מומחית איכות", "מומחה בטיחות", "מומחית בטיחות", "מומחה אחזקה", "מומחית אחזקה", "מומחה הפצה", "מומחית הפצה", "מומחה מלאי", "מומחית מלאי", "מומחה מחסן", "מומחית מחסן", "מומחה קליניקה", "מומחית קליניקה", "מומחה מרפאה", "מומחית מרפאה", "מומחה מעבדה", "מומחית מעבדה", "מומחה תביעות", "מומחית תביעות", "מומחה ביטוח", "מומחית ביטוח", "מומחה פנסיה", "מומחית פנסיה", "מומחה משכנתאות", "מומחית משכנתאות", "מומחה אשראי", "מומחית אשראי", "מומחה כספים", "מומחית כספים", "מומחה חשבונות", "מומחית חשבונות", "מומחה תוכן", "מומחית תוכן", "מומחה סושיאל", "מומחית סושיאל", "מומחה פרסום", "מומחית פרסום", "מומחה מדיה", "מומחית מדיה", "מומחה IT", "מומחית IT", "מומחה מערכות מידע", "מומחית מערכות מידע", "מומחה מידע", "מומחית מידע", "מומחה פרויקטים", "מומחית פרויקטים", "מומחה לקוחות", "מומחית לקוחות", "יועץ אדמיניסטרציה", "יועצת אדמיניסטרציה", "יועץ תפעול", "יועצת תפעול", "יועץ מכירות", "יועצת מכירות", "יועץ שירות לקוחות", "יועצת שירות לקוחות", "יועץ שירות", "יועצת שירות", "יועץ גבייה", "יועצת גבייה", "יועץ לוגיסטיקה", "יועצת לוגיסטיקה", "יועץ רכש", "יועצת רכש", "יועץ יבוא", "יועצת יבוא", "יועץ יצוא", "יועצת יצוא", "יועץ הדרכה", "יועצת הדרכה", "יועץ שיווק", "יועצת שיווק", "יועץ דיגיטל", "יועצת דיגיטל", "יועץ גיוס", "יועצת גיוס", "יועץ משאבי אנוש", "יועצת משאבי אנוש", "יועץ פיתוח עסקי", "יועצת פיתוח עסקי", "יועץ איכות", "יועצת איכות", "יועץ בטיחות", "יועצת בטיחות", "יועץ אחזקה", "יועצת אחזקה", "יועץ הפצה", "יועצת הפצה", "יועץ מלאי", "יועצת מלאי", "יועץ מחסן", "יועצת מחסן", "יועץ קליניקה", "יועצת קליניקה", "יועץ מרפאה", "יועצת מרפאה", "יועץ מעבדה", "יועצת מעבדה", "יועץ תביעות", "יועצת תביעות", "יועץ פנסיה", "יועצת פנסיה", "יועץ משכנתאות", "יועצת משכנתאות", "יועץ אשראי", "יועצת אשראי", "יועץ כספים", "יועצת כספים", "יועץ חשבונות", "יועצת חשבונות", "יועץ תוכן", "יועצת תוכן", "יועץ סושיאל", "יועצת סושיאל", "יועץ פרסום", "יועצת פרסום", "יועץ מדיה", "יועצת מדיה", "יועץ IT", "יועצת IT", "יועץ מערכות מידע", "יועצת מערכות מידע", "יועץ סייבר", "יועצת סייבר", "יועץ מידע", "יועצת מידע", "יועץ פרויקטים", "יועצת פרויקטים", "יועץ לקוחות", "יועצת לקוחות", "מדריך אדמיניסטרציה", "מדריכה אדמיניסטרציה", "מדריך תפעול", "מדריכה תפעול", "מדריך מכירות", "מדריכה מכירות", "מדריך שירות לקוחות", "מדריכה שירות לקוחות", "מדריך שירות", "מדריכה שירות", "מדריך גבייה", "מדריכה גבייה", "מדריך לוגיסטיקה", "מדריכה לוגיסטיקה", "מדריך רכש", "מדריכה רכש", "מדריך יבוא", "מדריכה יבוא", "מדריך יצוא", "מדריכה יצוא", "מדריך הדרכה", "מדריכה הדרכה", "מדריך שיווק", "מדריכה שיווק", "מדריך דיגיטל", "מדריכה דיגיטל", "מדריך גיוס", "מדריכה גיוס", "מדריך משאבי אנוש", "מדריכה משאבי אנוש", "מדריך פיתוח עסקי", "מדריכה פיתוח עסקי", "מדריך איכות", "מדריכה איכות", "מדריך בטיחות", "מדריכה בטיחות", "מדריך אחזקה", "מדריכה אחזקה", "מדריך הפצה", "מדריכה הפצה", "מדריך מלאי", "מדריכה מלאי", "מדריך מחסן", "מדריכה מחסן", "מדריך קליניקה", "מדריכה קליניקה", "מדריך מרפאה", "מדריכה מרפאה", "מדריך מעבדה", "מדריכה מעבדה", "מדריך תביעות", "מדריכה תביעות", "מדריך ביטוח", "מדריכה ביטוח", "מדריך פנסיה", "מדריכה פנסיה", "מדריך משכנתאות", "מדריכה משכנתאות", "מדריך אשראי", "מדריכה אשראי", "מדריך כספים", "מדריכה כספים", "מדריך חשבונות", "מדריכה חשבונות", "מדריך תוכן", "מדריכה תוכן", "מדריך סושיאל", "מדריכה סושיאל", "מדריך פרסום", "מדריכה פרסום", "מדריך מדיה", "מדריכה מדיה", "מדריך IT", "מדריכה IT", "מדריך מערכות מידע", "מדריכה מערכות מידע", "מדריך סייבר", "מדריכה סייבר", "מדריך מידע", "מדריכה מידע", "מדריך פרויקטים", "מדריכה פרויקטים", "מדריך לקוחות", "מדריכה לקוחות"
    ],
    companies: ["איילון","הראל","כלל","מגדל","מנורה","הפניקס","הכשרה","מדיקר"],
    // חברות שמופיעות רק בשלב "פוליסות קיימות"
    existingCompanies: ["איילון","הראל","כלל","מגדל","מנורה","הפניקס","הכשרה","AIG","ביטוח ישיר","9 מיליון"],

    insTypes: ["בריאות","מחלות קשות","סרטן","תאונות אישיות","ריסק","ריסק משכנתא"],
    bankNames: ["בנק הפועלים","בנק לאומי","בנק דיסקונט","בנק מזרחי-טפחות","הבנק הבינלאומי","בנק מרכנתיל","בנק ירושלים","בנק יהב","בנק מסד","פאג\"י","דואר ישראל","אחר"],

    
    bankAgencies: ["סוכנות מעלות - בנק לאומי","סוכנות פועלים - בנק הפועלים","סוכנות מזרחי טפחות - בנק מזרחי-טפחות","סוכנות עיר שלם - בנק ירושלים","סוכנות דיסקונט - בנק דיסקונט"],

    // כיסויי בריאות (לשלב 3 — פוליסות קיימות)
    healthCovers: [
      { k:"ניתוחים בארץ", sub:"בחירת מנתח/בי\"ח פרטי (לפי תנאי הפוליסה)" },
      { k:"ניתוחים בחו\"ל", sub:"כיסוי ניתוחים וטיפולים בחו\"ל" },
      { k:"השתלות", sub:"כיסוי השתלות וטיפולים מצילי חיים" },
      { k:"תרופות מחוץ לסל", sub:"תרופות שאינן בסל הבריאות" },
      { k:"אמבולטורי", sub:"בדיקות, טיפולים ושירותים ללא אשפוז" },
      { k:"ייעוץ מומחים", sub:"התייעצות עם מומחים ושירותי רופא" },
      { k:"רפואה משלימה", sub:"טיפולים משלימים (דיקור, כירופרקטיקה וכו’)" },
      { k:"בדיקות מתקדמות", sub:"MRI/CT/בדיקות יקרות (לפי תנאי הפוליסה)" },
      { k:"כתב שירות", sub:"שירותי רפואה/תורים/אבחונים (לפי כתב השירות)" }
    ],
init(){
      this.els.wrap = $("#lcWizard");
      if(!this.els.wrap) return;

      this.els.btnOpen = $("#btnNewCustomerWizard");
      this.els.btnClose = $("#lcWizardClose");
      this.els.body = $("#lcWizardBody");
      this.els.steps = $("#lcSteps");
      this.els.fill = $("#lcProgressFill");
      this.els.tabs = $("#lcInsTabs");
      this.els.btnAddIns = $("#lcAddInsuredBtn");
      this.els.hint = $("#lcWizardHint");
      this.els.btnPrev = $("#lcPrevStep");
      this.els.btnNext = $("#lcNextStep");
      this.els.btnSaveDraft = $("#lcSaveDraft");

      // picker
      this.els.picker = $("#lcInsPicker");
      this.els.pickerClose = $("#lcInsPickerClose");

      on(this.els.btnOpen, "click", () => {
        if(!Auth.current) return;
        this.reset();
        this.open();
      });

      on(this.els.btnClose, "click", () => this.close());
      on(this.els.wrap, "click", (e) => {
        const t = e.target;
        if(t && t.getAttribute && t.getAttribute("data-close") === "1") this.close();
      });

      on(this.els.btnAddIns, "click", () => this.openPicker());
      on(this.els.pickerClose, "click", () => this.closePicker());
      on(this.els.picker, "click", (e) => {
        const t = e.target;
        if(t && t.getAttribute && t.getAttribute("data-close") === "1") this.closePicker();
        if(t && t.matches && t.matches("[data-ins-type]")){
          const typ = t.getAttribute("data-ins-type");
          this.addInsured(typ);
          this.closePicker();
        }
      });

      on(this.els.btnPrev, "click", () => this.prevStep());
      on(this.els.btnNext, "click", () => this.nextStep());
      on(this.els.btnSaveDraft, "click", () => this.saveDraft());


      // report + finish flow
      this.els.report = $("#lcReport");
      this.els.reportBody = $("#lcReportBody");
      this.els.reportClose = $("#lcReportClose");
      this.els.reportPrint = $("#lcReportPrint");
      this.els.flow = $("#lcFlow");
      this.els.flowLoading = $("#lcFlowLoading");
      this.els.flowSuccess = $("#lcFlowSuccess");
      this.els.flowProgress = $("#lcFlowProgress");
      this.els.btnOpenCustomerFile = $("#lcOpenCustomerFile");
      this.els.btnSendToOps = $("#lcSendToOps");
      this.els.btnDownloadOpsFile = $("#lcDownloadOpsFile");
      this.els.btnBackToDashboard = $("#lcBackToDashboard");

      on(this.els.reportClose, "click", () => this.closeOperationalReport());
      on(this.els.reportPrint, "click", () => this.exportOperationalPdf());
      on(this.els.report, "click", (e) => {
        const t = e.target;
        if(t && t.getAttribute && t.getAttribute("data-close") === "1") this.closeOperationalReport();
      });
      on(this.els.btnOpenCustomerFile, "click", () => {
        const customerId = this.lastSavedCustomerId;
        this.hideFinishFlow();
        this.close();
        UI.goView("customers");
        if(customerId) setTimeout(() => CustomersUI.openByIdWithLoader(customerId, 1080), 80);
      });
      on(this.els.btnSendToOps, "click", () => {
        this.hideFinishFlow();
        this.openOperationalReport();
      });
      on(this.els.btnDownloadOpsFile, "click", () => this.exportOperationalPdf());
      on(this.els.btnBackToDashboard, "click", () => {
        this.hideFinishFlow();
        this.close();
        UI.goView("dashboard");
      });

      // covers drawer (Step 3 - Health only)
      this.els.coversDrawer = $("#lcCoversDrawer");
      this.els.coversDrawerBackdrop = $("#lcCoversDrawerBackdrop");
      this.els.coversDrawerClose = $("#lcCoversDrawerClose");
      this.els.coversDrawerTitle = $("#lcCoversDrawerTitle");
      this.els.coversHint = this.els.coversDrawer?.querySelector?.(".lcCoversHint") || null;
      this.els.coversList = $("#lcCoversList");
      this.els.coversSave = $("#lcCoversSave");
      this.els.coversCancel = $("#lcCoversCancel");
      this._coversCtx = null; // { kind, insId?, policyId? }

      on(this.els.coversDrawerBackdrop, "click", () => this.closeCoversDrawer());
      on(this.els.coversDrawerClose, "click", () => this.closeCoversDrawer());
      on(this.els.coversCancel, "click", () => this.closeCoversDrawer());
      on(this.els.coversSave, "click", () => this.saveCoversDrawer());

      // base insured
      this.reset();
    },

    reset(){
      const make = (type, label) => ({
        id: "ins_" + Math.random().toString(16).slice(2),
        type,
        label,
        data: {
          // step1
          firstName:"", lastName:"", idNumber:"",
          birthDate:"", gender:"",
          maritalStatus:"",
          phone:"", email:"",
          city:"", street:"", houseNumber:"", zip:"",
          clinic:"", shaban:"", occupation:"",
          // step2
          heightCm:"", weightKg:"", bmi:null,
          // policies
          existingPolicies: [],
          cancellations: {}, // by policyId
          newPolicies: [],
          // payer
          payerChoice:"insured", // insured/external
          externalPayer: { relation:"", firstName:"", lastName:"", idNumber:"", birthDate:"", phone:"" },
          payAll:true,
          policyPayers: {}, // policyId -> payerId/external
          paymentMethod:"cc", // cc/ho
          cc: { holderName:"", holderId:"", cardNumber:"", exp:"" },
          ho: { account:"", branch:"", bankName:"", bankNo:"" },
          healthDeclaration: { categories:{} }
        }
      });

      this.insureds = [ make("primary","מבוטח ראשי") ];
      this.activeInsId = this.insureds[0].id;
      // Step5 (new policies) is global for the case, not per-insured
      this.newPolicies = [];
      this.policyDraft = null;
      this.editingPolicyId = null;

      this.step = 1;
      this.lastSavedCustomerId = null;
      this.editingDraftId = null;
      this._finishing = false;
      this.render();
    },

    open(){
      this.isOpen = true;
      this.els.wrap.classList.add("is-open");
      this.els.wrap.setAttribute("aria-hidden","false");
      document.body.style.overflow = "hidden";
      this.render();
      setTimeout(() => {
        const first = this.els.body?.querySelector?.("input,select,textarea,button");
        first?.focus?.();
      }, 50);
    },

    close(){
      this.isOpen = false;
      this.els.wrap.classList.remove("is-open");
      this.els.wrap.setAttribute("aria-hidden","true");
      document.body.style.overflow = "";
      this.closePicker();
    },

    openPicker(){
      if(!this.els.picker) return;
      this.els.picker.classList.add("is-open");
      this.els.picker.setAttribute("aria-hidden","false");
    },
    closePicker(){
      if(!this.els.picker) return;
      this.els.picker.classList.remove("is-open");
      this.els.picker.setAttribute("aria-hidden","true");
    },


    // ===== Health Covers Drawer (Step 3) =====
    _findInsuredById(id){
      return (this.insureds || []).find(x => String(x.id) === String(id)) || null;
    },

    _findExistingPolicy(ins, pid){
      const list = ins?.data?.existingPolicies || [];
      return list.find(x => String(x.id) === String(pid)) || null;
    },

    getHealthCoverList(obj){
      if(Array.isArray(obj?.healthCovers)) return obj.healthCovers.filter(Boolean);
      if(Array.isArray(obj?.covers)) return obj.covers.filter(Boolean);
      return [];
    },

    summarizeHealthCovers(list, opts={}){
      const arr = Array.isArray(list) ? list.filter(Boolean) : [];
      const max = Number(opts.max || 2);
      const emptyLabel = safeTrim(opts.emptyLabel) || "טרם נבחרו כיסויים";
      if(!arr.length) return emptyLabel;
      if(arr.length <= max) return arr.join(" · ");
      return `${arr.slice(0, max).join(" · ")} +${arr.length - max}`;
    },

    openCoversDrawer(ins, pid){
      const pol = this._findExistingPolicy(ins, pid);
      if(!pol) return;
      if(pol.type !== "בריאות") return;
      if(!Array.isArray(pol.covers)) pol.covers = [];

      this._coversCtx = { kind: "existing", insId: ins.id, policyId: pid };
      this.renderCoversDrawer(pol, {
        title: "בחירת כיסויי בריאות",
        hint: "סמן את הכיסויים הרלוונטיים לפוליסה."
      });

      if(this.els.coversDrawer){
        this.els.coversDrawer.classList.add("is-open");
        this.els.coversDrawer.setAttribute("aria-hidden","false");
      }
    },

    openNewPolicyCoversDrawer(){
      this.ensurePolicyDraft();
      const d = this.policyDraft || {};
      if(d.type !== "בריאות") return;
      if(!Array.isArray(d.healthCovers)) d.healthCovers = [];
      this._coversCtx = { kind: "newDraft" };
      this.renderCoversDrawer(d, {
        title: "כיסויי בריאות — פוליסה חדשה",
        hint: "סמן את הכיסויים שהלקוח רכש ולחץ אישור כיסויים."
      });

      if(this.els.coversDrawer){
        this.els.coversDrawer.classList.add("is-open");
        this.els.coversDrawer.setAttribute("aria-hidden","false");
      }
    },

    closeCoversDrawer(){
      this._coversCtx = null;
      if(this.els.coversDrawer){
        this.els.coversDrawer.classList.remove("is-open");
        this.els.coversDrawer.setAttribute("aria-hidden","true");
      }
    },

    renderCoversDrawer(pol, opts={}){
      if(!this.els.coversList) return;
      const selected = new Set(this.getHealthCoverList(pol));
      if(this.els.coversDrawerTitle) this.els.coversDrawerTitle.textContent = String(opts.title || "בחירת כיסויי בריאות");
      if(this.els.coversHint) this.els.coversHint.textContent = String(opts.hint || "סמן את הכיסויים הרלוונטיים לפוליסה.");
      if(this.els.coversSave) this.els.coversSave.textContent = "אישור כיסויים";
      const items = (this.healthCovers || []).map(c => {
        const key = String(c?.k || "");
        const sub = String(c?.sub || "");
        const checked = selected.has(key) ? "checked" : "";
        return `
          <label class="lcCoverItem">
            <input type="checkbox" value="${escapeHtml(key)}" ${checked} />
            <span class="lcCoverItem__main">
              <span class="lcCoverItem__title">${escapeHtml(key)}</span>
              ${sub ? `<span class="lcCoverItem__sub">${escapeHtml(sub)}</span>` : ""}
            </span>
          </label>
        `;
      }).join("");
      this.els.coversList.innerHTML = items || `<div class="muted">אין כיסויים להצגה</div>`;

      setTimeout(() => {
        const first = this.els.coversList?.querySelector?.('input[type="checkbox"]');
        first?.focus?.();
      }, 20);
    },

    saveCoversDrawer(){
      try{
        const ctx = this._coversCtx;
        if(!ctx) return this.closeCoversDrawer();

        const chosen = [];
        this.els.coversList?.querySelectorAll?.('input[type="checkbox"]')?.forEach?.(cb => {
          if(cb.checked) chosen.push(String(cb.value || "").trim());
        });
        const filtered = chosen.filter(Boolean);

        if(ctx.kind === "newDraft"){
          this.ensurePolicyDraft();
          if(this.policyDraft) this.policyDraft.healthCovers = filtered;
          this.closeCoversDrawer();
          this.render();
          this.setHint(filtered.length ? ("נשמרו " + filtered.length + " כיסויים לפוליסת הבריאות") : "לא נבחרו כיסויים לפוליסת הבריאות");
          return;
        }

        const ins = this._findInsuredById(ctx.insId);
        if(!ins) return this.closeCoversDrawer();
        const pol = this._findExistingPolicy(ins, ctx.policyId);
        if(!pol) return this.closeCoversDrawer();
        if(pol.type !== "בריאות") return this.closeCoversDrawer();

        pol.covers = filtered;

        this.closeCoversDrawer();
        this.render();
        this.setHint(pol.covers.length ? ("נשמרו " + pol.covers.length + " כיסויים") : "לא נבחרו כיסויים");
      }catch(_e){
        this.closeCoversDrawer();
      }
    },

    addInsured(type){
      // Allow adding insured only in step 1 (פרטי לקוח)
      if (this.step !== 1) {
        this.setHint("ניתן להוסיף מבוטח רק בשלב פרטי לקוח");
        return;
      }
      const has = (t) => this.insureds.some(x => x.type === t);
      if(type === "spouse" && has("spouse")) return this.setHint("בן/בת זוג כבר קיים/ת");
      const label = (type === "spouse") ? "בן/בת זוג" : (type === "adult") ? "בגיר" : "קטין";
      const ins = {
        id: "ins_" + Math.random().toString(16).slice(2),
        type,
        label,
        data: JSON.parse(JSON.stringify(this.insureds[0].data)) // shallow baseline copy
      };
      // reset fields that must be entered
      ins.data.firstName = "";
      ins.data.lastName = "";
      ins.data.idNumber = "";
      ins.data.birthDate = "";
      ins.data.gender = "";
      ins.data.maritalStatus = "";
      ins.data.clinic = "";
      ins.data.shaban = "";
      ins.data.occupation = "";
      ins.data.heightCm = "";
      ins.data.weightKg = "";
      ins.data.bmi = null;
      ins.data.existingPolicies = [];
      ins.data.cancellations = {};
      ins.data.newPolicies = [];
      // child inherits contact/address from primary later in render/validate
      this.insureds.push(ins);
      this.activeInsId = ins.id;
      this.render();
      this.setHint("נוסף: " + label);
    },

    removeInsured(id){
      const idx = this.insureds.findIndex(x => x.id === id);
      if(idx <= 0) return; // cannot remove primary
      const removed = this.insureds[idx];
      this.insureds.splice(idx,1);
      if(this.activeInsId === id) this.activeInsId = this.insureds[0]?.id || null;
      this.render();
      this.setHint("הוסר: " + (removed?.label || "מבוטח"));
    },

    setActive(id){
      this.activeInsId = id;
      this.render();
    },

    prevStep(){
      if(this.step <= 1) return;
      this.step -= 1;
      this.render();
    },

    nextStep(){
      const v = this.validateStep(this.step);
      if(!v.ok){
        this.setHint(v.msg || "נא להשלים את כל החובה בכל המבוטחים");
        return;
      }
      if(this.step >= this.steps.length){
        this.finishWizard();
        return;
      }
      this.step += 1;
      this.setHint("");
      this.render();
    },

    setHint(msg){ if(this.els.hint) this.els.hint.textContent = msg ? String(msg) : ""; },

    getActive(){
      return this.insureds.find(x => x.id === this.activeInsId) || this.insureds[0];
    },

    // ---------- Rendering ----------
    render(){
      if(!this.els.wrap) return;
      this.renderSteps();
      this.renderTabs();
      // Show "Add insured" button only on step 1
      if (this.els.btnAddIns) {
        this.els.btnAddIns.style.display = (this.step === 1) ? "" : "none";
      }
      this.renderBody();
      this.renderFooter();
    },

    renderSteps(){
      if(!this.els.steps) return;
      const doneUpTo = this.step - 1;
      this.els.steps.innerHTML = this.steps.map(s => {
        const cls = [
          "lcStep",
          (s.id === this.step) ? "is-active" : "",
          (s.id <= doneUpTo) ? "is-done" : ""
        ].join(" ").trim();
        return `<div class="${cls}" data-step="${s.id}">
          <span class="lcStep__num">${s.id}</span>
          <span>${escapeHtml(s.title)}</span>
        </div>`;
      }).join("");

      // click to jump back only
      $$(".lcStep", this.els.steps).forEach(el => {
        on(el, "click", () => {
          const st = Number(el.getAttribute("data-step") || "1");
          if(st <= this.step) { this.step = st; this.render(); }
        });
      });

      // progress fill
      if(this.els.fill){
        const pct = Math.round(((this.step-1) / (this.steps.length-1)) * 100);
        this.els.fill.style.width = Math.max(0, Math.min(100, pct)) + "%";
      }
    },

    renderTabs(){
      if(!this.els.tabs) return;
      // Steps 5+ are case-level (not per-insured), so hide insured tabs
      if(this.step >= 5){
        this.els.tabs.innerHTML = "";
        this.els.tabs.style.display = "none";
        return;
      }
      this.els.tabs.style.display = "";
      const stepOkMap = this.stepCompletionMap(this.step);

      this.els.tabs.innerHTML = this.insureds.map(ins => {
        const isActive = ins.id === this.activeInsId;
        const ok = stepOkMap[ins.id] === true;
        const badgeCls = ok ? "ok" : "warn";
        const cls = "lcTab" + (isActive ? " is-active" : "");
        const removeBtn = (ins.type !== "primary") ? `<span class="lcDangerLink" data-remove="${ins.id}" title="הסר">✕</span>` : "";
        return `<div class="${cls}" data-ins="${ins.id}">
          <span class="lcTab__badge ${badgeCls}" aria-hidden="true"></span>
          <span>${escapeHtml(ins.label)}</span>
          ${removeBtn}
        </div>`;
      }).join("");

      $$(".lcTab", this.els.tabs).forEach(t => {
        on(t, "click", (e) => {
          const rm = e.target && e.target.getAttribute && e.target.getAttribute("data-remove");
          if(rm){ this.removeInsured(rm); return; }
          const id = t.getAttribute("data-ins");
          if(id) this.setActive(id);
        });
      });
    },

    renderFooter(){
      if(this.els.btnPrev) this.els.btnPrev.disabled = (this.step <= 1);
      if(this.els.btnNext) this.els.btnNext.textContent = (this.step >= this.steps.length) ? "סיום הקמת לקוח" : "הבא";
      if(this.els.btnNext) this.els.btnNext.disabled = false;
    },

    renderBody(){
      if(!this.els.body) return;
      const ins = this.getActive();
      const stepTitle = this.steps.find(s => s.id === this.step)?.title || "";
      const isCaseLevel = (this.step >= 5);
      const addBtn = (this.step === 3) ? `<button class="btn" id="lcAddExistingPolicy" type="button">➕ הוסף פוליסה</button>` : "";
      const head = (this.step === 5) ? "" : (isCaseLevel ? `<div class="lcWSection">
        <div class="row row--between">
          <div>
            <div class="lcWTitle">${escapeHtml(stepTitle)}</div>
            <div class="muted small">.</div>
          </div>
        </div>
      </div>` : `<div class="lcWSection">
        <div class="row row--between">
          <div>
            <div class="lcWTitle">${escapeHtml(stepTitle)} · ${escapeHtml(ins.label)}</div>
          </div>
          ${addBtn}
        </div>
      </div>`);

      let body = "";
      if(this.step === 1) body = this.renderStep1(ins);
      else if(this.step === 2) body = this.renderStep2(ins);
      else if(this.step === 3) body = this.renderStep3(ins);
      else if(this.step === 4) body = this.renderStep4(ins);
      else if(this.step === 5) body = this.renderStep5();
      else if(this.step === 6) body = this.renderStep6(this.insureds[0]);
      else if(this.step === 7) body = this.renderStep7();
      else body = this.renderStep8();

      this.els.body.innerHTML = head + body;

      // bind generic input handlers
      if(this.step < 5) this.bindInputs(ins);
      else if(this.step === 6) this.bindInputs(this.insureds[0]);
      else if(this.step === 8) this.bindHealthInputs();
    },

    bindInputs(ins){
      // any element with data-bind="path"
      $$("[data-bind]", this.els.body).forEach(el => {
        const path = el.getAttribute("data-bind");
        if(!path) return;
        const setVal = (doRender=false) => {
          let v = (el.type === "checkbox") ? !!el.checked : safeTrim(el.value);
          if(el.getAttribute && el.getAttribute("data-money")==="ils"){
            const raw = String(v||"").replace(/[₪,\s]/g,"");
            let cleaned = raw.replace(/[^0-9.]/g,"");
            const parts = cleaned.split(".");
            if(parts.length>2) cleaned = parts[0] + "." + parts.slice(1).join("");
            const [i,f] = cleaned.split(".");
            const ii = (i||"").replace(/^0+(?=\d)/,"");
            const withCommas = ii.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
            const formatted = (f!==undefined) ? (withCommas + "." + f) : withCommas;
            if(el.value !== formatted) el.value = formatted;
            v = cleaned;
          }
          this.setPath(ins.data, path, v);
          // special: step1 clinic -> shaban options reset
          if(path === "clinic"){
            if(!ins.data.clinic) ins.data.shaban = "";
            else if(!this.shabanMap[ins.data.clinic]?.includes(ins.data.shaban)) ins.data.shaban = "אין שב״ן";
            this.render(); // rerender to refresh selects
            return;
          }
          
if(path === "birthDate"){
  // dd/mm/yyyy typing (no re-render on partial typing; re-render only when full)
  if(el.getAttribute("data-datefmt") === "dmy"){
    const digits = String(el.value||"").replace(/[^\d]/g, "").slice(0, 8);
    let out = digits;
    if(out.length > 2) out = out.slice(0,2) + "/" + out.slice(2);
    if(out.length > 5) out = out.slice(0,5) + "/" + out.slice(5);
    if(el.value !== out) el.value = out;
    this.setPath(ins.data, path, out);
  }
  const val = String(ins.data.birthDate||"");
  const full = /^\d{4}-\d{2}-\d{2}$/.test(val) || /^\d{2}\/\d{2}\/\d{4}$/.test(val);
  if(doRender || full) this.render();
  return;
}
          if(path === "heightCm" || path === "weightKg"){
            this.calcBmi(ins);
            this.render(); // update BMI widget
            return;
          }
          if(path.endsWith(".bankAgency")){
            this.render();
            return;
          }
          // lightweight: keep hint clear
          this.setHint("");
        };

        on(el, "input", () => setVal(false));
        on(el, "change", () => setVal(true));
      });

      // add existing policy
      const addExist = $("#lcAddExistingPolicy", this.els.body);
      this.bindOccupationAutocomplete(ins);

      on(addExist, "click", () => { this.addExistingPolicy(ins); });

      // existing policy row actions
      $$("[data-del-exist]", this.els.body).forEach(btn => {
        on(btn, "click", () => {
          const pid = btn.getAttribute("data-del-exist");
          this.delExistingPolicy(ins, pid);
        });
      });

// open health covers drawer (Health only)
      $$("[data-open-covers]", this.els.body).forEach(btn => {
        on(btn, "click", () => {
          const pid = btn.getAttribute("data-open-covers");
          this.openCoversDrawer(ins, pid);
        });
      });

      // add new policy
      const addNew = $("#lcAddNewPolicy", this.els.body);
      on(addNew, "click", () => { this.addNewPolicy(ins); });
      $$("[data-del-new]", this.els.body).forEach(btn => {
        on(btn, "click", () => {
          const pid = btn.getAttribute("data-del-new");
          this.delNewPolicy(ins, pid);
        });
      });

      // cancellations choices
      $$("[data-cancel-policy]", this.els.body).forEach(el => {
        on(el, "change", () => {
          const pid = el.getAttribute("data-cancel-policy");
          const key = el.getAttribute("data-cancel-key");
          if(!pid || !key) return;
          if(!ins.data.cancellations[pid]) ins.data.cancellations[pid] = {};
          let v = (el.type === "checkbox") ? !!el.checked : safeTrim(el.value);
          if(el.getAttribute && el.getAttribute("data-money")==="ils"){
            const raw = String(v||"").replace(/[₪,\s]/g,"");
            let cleaned = raw.replace(/[^0-9.]/g,"");
            const parts = cleaned.split(".");
            if(parts.length>2) cleaned = parts[0] + "." + parts.slice(1).join("");
            const [i,f] = cleaned.split(".");
            const ii = (i||"").replace(/^0+(?=\d)/,"");
            const withCommas = ii.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
            const formatted = (f!==undefined) ? (withCommas + "." + f) : withCommas;
            if(el.value !== formatted) el.value = formatted;
            v = cleaned;
          }
          ins.data.cancellations[pid][key] = v;
          this.render();
        });
      });

      // payer controls
      $$("[data-payer]", this.els.body).forEach(el => {
        on(el, "change", () => {
          const k = el.getAttribute("data-payer");
          let v = (el.type === "checkbox") ? !!el.checked : safeTrim(el.value);
          if(el.getAttribute && el.getAttribute("data-money")==="ils"){
            const raw = String(v||"").replace(/[₪,\s]/g,"");
            let cleaned = raw.replace(/[^0-9.]/g,"");
            const parts = cleaned.split(".");
            if(parts.length>2) cleaned = parts[0] + "." + parts.slice(1).join("");
            const [i,f] = cleaned.split(".");
            const ii = (i||"").replace(/^0+(?=\d)/,"");
            const withCommas = ii.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
            const formatted = (f!==undefined) ? (withCommas + "." + f) : withCommas;
            if(el.value !== formatted) el.value = formatted;
            v = cleaned;
          }
          this.setPath(ins.data, k, v);
          this.render();
        });
      });
    },

    setPath(obj, path, value){
      const parts = String(path).split(".");
      let cur = obj;
      for(let i=0;i<parts.length-1;i++){
        const k = parts[i];
        if(!cur[k] || typeof cur[k] !== "object") cur[k] = {};
        cur = cur[k];
      }
      cur[parts[parts.length-1]] = value;
    },


    normalizeOccupationSearch(value){
      return String(value || "")
        .normalize("NFKC")
        .replace(/[׳'"`]/g, "")
        .replace(/[-_/.,]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
    },

    getOccupationSuggestions(term){
      const q = this.normalizeOccupationSearch(term);
      const list = Array.isArray(this.occupations) ? this.occupations : [];
      if(!q) return list.slice(0, 20);
      const exact = [];
      const starts = [];
      const includes = [];
      list.forEach(item => {
        const txt = this.normalizeOccupationSearch(item);
        if(!txt.includes(q)) return;
        if(txt === q) exact.push(item);
        else if(txt.startsWith(q)) starts.push(item);
        else includes.push(item);
      });
      return exact.concat(starts, includes).slice(0, 20);
    },

    renderOccupationSuggestions(term, currentValue){
      const cur = safeTrim(currentValue);
      const items = this.getOccupationSuggestions(term);
      if(!items.length){
        return `<button type="button" class="lcOccOption is-empty" data-occ-empty="1">לא נמצאו תוצאות. אפשר להקליד ידנית.</button>`;
      }
      return items.map(item => {
        const active = (safeTrim(item) === cur) ? " is-active" : "";
        return `<button type="button" class="lcOccOption${active}" data-occ-value="${escapeHtml(item)}">${escapeHtml(item)}</button>`;
      }).join("");
    },

    bindOccupationAutocomplete(ins){
      const input = $("#lcOccupationInput", this.els.body);
      const menu = $("#lcOccupationMenu", this.els.body);
      if(!input || !menu) return;

      const openMenu = () => {
        menu.classList.add("is-open");
        input.setAttribute("aria-expanded", "true");
      };
      const closeMenu = () => {
        menu.classList.remove("is-open");
        input.setAttribute("aria-expanded", "false");
      };
      const refreshMenu = () => {
        menu.innerHTML = this.renderOccupationSuggestions(input.value, ins.data.occupation || "");
      };
      const choose = (val) => {
        const picked = safeTrim(val);
        input.value = picked;
        ins.data.occupation = picked;
        refreshMenu();
        closeMenu();
        this.setHint("");
      };

      refreshMenu();
      on(input, "focus", () => { refreshMenu(); openMenu(); });
      on(input, "click", () => { refreshMenu(); openMenu(); });
      on(input, "input", () => { ins.data.occupation = safeTrim(input.value); refreshMenu(); openMenu(); });
      on(input, "keydown", (ev) => {
        const options = $$("[data-occ-value]", menu);
        const current = menu.querySelector(".lcOccOption.is-hover");
        let idx = current ? options.indexOf(current) : -1;
        if(ev.key === "ArrowDown"){
          ev.preventDefault();
          if(!menu.classList.contains("is-open")){ refreshMenu(); openMenu(); }
          idx = Math.min(idx + 1, options.length - 1);
          options.forEach(o => o.classList.remove("is-hover"));
          if(options[idx]) options[idx].classList.add("is-hover");
          return;
        }
        if(ev.key === "ArrowUp"){
          ev.preventDefault();
          idx = Math.max(idx - 1, 0);
          options.forEach(o => o.classList.remove("is-hover"));
          if(options[idx]) options[idx].classList.add("is-hover");
          return;
        }
        if(ev.key === "Enter" && menu.classList.contains("is-open")){
          const picked = menu.querySelector(".lcOccOption.is-hover") || menu.querySelector("[data-occ-value]");
          if(picked){
            ev.preventDefault();
            choose(picked.getAttribute("data-occ-value") || picked.textContent || "");
          }
          return;
        }
        if(ev.key === "Escape") closeMenu();
      });
      on(menu, "mousedown", (ev) => {
        const btn = ev.target && ev.target.closest ? ev.target.closest("[data-occ-value]") : null;
        if(!btn) return;
        ev.preventDefault();
        choose(btn.getAttribute("data-occ-value") || "");
      });
      on(document, "click", (ev) => {
        if(!this.els.body || !this.els.body.contains(input)) return;
        const inside = ev.target === input || menu.contains(ev.target);
        if(!inside) closeMenu();
      });
    },

    // ---------- Step 1 ----------
    renderStep1(ins){
      const d = ins.data;
      const isChild = ins.type === "child";
      const p = this.insureds[0]?.data || {};
      const age = this.calcAge(d.birthDate);
      const ageTxt = age === null ? "" : String(age);

      const clinicOpts = this.clinics.map(x => `<option value="${escapeHtml(x)}"${d.clinic===x?" selected":""}>${escapeHtml(x)}</option>`).join("");
      const shabanOptsRaw = this.shabanMap[d.clinic] || ["אין שב״ן"];
      const shabanOpts = shabanOptsRaw.map(x => `<option value="${escapeHtml(x)}"${d.shaban===x?" selected":""}>${escapeHtml(x)}</option>`).join("");

      const inherited = (key) => safeTrim(p[key]);

      return `
        <div class="lcWSection">
          <div class="lcWTitle">פרטי ${escapeHtml(ins.label)}</div>

          <div class="lcWGrid">
            ${this.fieldText("שם פרטי","firstName", d.firstName)}
            ${this.fieldText("שם משפחה","lastName", d.lastName)}
            ${this.fieldText("ת״ז","idNumber", d.idNumber, "numeric")}
            ${this.fieldDate("תאריך לידה","birthDate", d.birthDate)}
            <div class="field">
              <label class="label">גיל (אוטומטי)</label>
              <input class="input" value="${escapeHtml(ageTxt)}" disabled />
            </div>
            ${this.fieldSelect("מין","gender", d.gender, ["","זכר","נקבה"])}
            ${!isChild ? this.fieldSelect("מצב משפחתי","maritalStatus", d.maritalStatus, ["","רווק/ה","נשוי/אה","גרוש/ה","אלמן/ה","ידוע/ה בציבור"]) : ""}
            ${this.fieldText("טלפון","phone", isChild ? inherited("phone") : d.phone, "tel", isChild)}
            ${this.fieldText("מייל","email", isChild ? inherited("email") : d.email, "email", isChild)}
            ${this.fieldText("עיר","city", isChild ? inherited("city") : d.city, "text", isChild)}
            ${this.fieldText("רחוב","street", isChild ? inherited("street") : d.street, "text", isChild)}
            ${this.fieldText("מספר","houseNumber", isChild ? inherited("houseNumber") : d.houseNumber, "numeric", isChild)}
            <div class="field">
              <label class="label">מיקוד (אוטומטי)</label>
              <input class="input" data-zip="zip" value="${escapeHtml(isChild ? inherited("zip") : (d.zip||""))}" placeholder="ימולא אוטומטית" disabled />
              <div class="help">המיקוד נשלף אוטומטית לפי עיר/רחוב/מספר.</div>
            </div>

            ${!isChild ? `
              <div class="field">
                <label class="label">קופת חולים</label>
                <select class="input" data-bind="clinic">
                  <option value="" ${!d.clinic?"selected":""}>בחר…</option>
                  ${clinicOpts}
                </select>
              </div>
              <div class="field">
                <label class="label">שב״ן</label>
                <select class="input" data-bind="shaban" ${d.clinic ? "" : "disabled"}>
                  ${shabanOpts}
                </select>
                <div class="help">הרשימה משתנה לפי קופה + “אין שב״ן”.</div>
              </div>
              <div class="field">
                <label class="label">עיסוק</label>
                <div class="lcOccWrap">
                  <input
                    class="input lcOccInput"
                    id="lcOccupationInput"
                    type="text"
                    data-bind="occupation"
                    value="${escapeHtml(d.occupation || "")}"
                    placeholder="התחל להקליד עיסוק…"
                    autocomplete="off"
                    aria-autocomplete="list"
                    aria-expanded="false"
                  />
                  <div class="lcOccMenu" id="lcOccupationMenu">${this.renderOccupationSuggestions(d.occupation || "", d.occupation || "")}</div>
                </div>
                <div class="help">מאגר עיסוקים מורחב עם חיפוש חכם. אם לא נמצאה התאמה, אפשר להקליד עיסוק ידנית.</div>
              </div>
            ` : `
              <div class="field">
                <label class="label">קופת חולים</label>
                <select class="input" data-bind="clinic">
                  <option value="" ${!d.clinic?"selected":""}>בחר…</option>
                  ${clinicOpts}
                </select>
              </div>
              <div class="field">
                <label class="label">שב״ן</label>
                <select class="input" data-bind="shaban" ${d.clinic ? "" : "disabled"}>
                  ${shabanOpts}
                </select>
                <div class="help">הרשימה משתנה לפי קופה + “אין שב״ן”.</div>
              </div>
              <div class="field" style="grid-column: 1 / -1;">
                <label class="label">ירושה אוטומטית (לקטין)</label>
                <div class="help">כתובת / טלפון / מייל נלקחים מהמבוטח הראשי ולא ניתנים לעריכה.</div>
              </div>
            `}
          </div>
        </div>
      `;
    },

    // ---------- Step 2 ----------
    calcBmi(ins){
      const h = Number(ins.data.heightCm);
      const w = Number(ins.data.weightKg);
      if(!h || !w || h <= 0 || w <= 0) { ins.data.bmi = null; return; }
      const m = h / 100;
      const bmi = w / (m*m);
      ins.data.bmi = Math.round(bmi * 10) / 10;
    },

    bmiStatus(bmi){
      if(bmi === null || bmi === undefined || bmi === "") return { lamp:"", text:"", label:"" };
      const n = Number(bmi);
      if(n >= 18.5 && n <= 24.9) return { lamp:"green", label:"תקין", text:"ירוק · 18.5–24.9" };
      if(n >= 25 && n <= 29.9) return { lamp:"yellow", label:"עודף משקל", text:"צהוב · 25–29.9" };
      if(n >= 30) return { lamp:"red", label:"השמנה", text:"אדום · 30+" };
      return { lamp:"yellow", label:"נמוך", text:"מתחת ל-18.5" };
    },

    renderStep2(ins){
      this.calcBmi(ins);
      const d = ins.data;
      const st = this.bmiStatus(d.bmi);
      const has = !(d.bmi === null || d.bmi === undefined || d.bmi === "");
      const bmiTxt = has ? String(d.bmi) : "—";
      const labelTxt = has ? (st.label || "—") : "מלא גובה ומשקל";

      return `
        <div class="lcWSection">
          <div class="lcWTitle">BMI</div>
          <div class="lcWGrid">
            ${this.fieldText("גובה (ס״מ)","heightCm", d.heightCm, "numeric")}
            ${this.fieldText("משקל (ק״ג)","weightKg", d.weightKg, "numeric")}

            <div class="lcBmiCard ${has ? "" : "is-empty"}" data-bmi="card">
              <div class="lcBmiCard__side">
                <span class="lcLamp lcBmiDot ${st.lamp}" data-bmi="lamp" aria-hidden="true"></span>
              </div>
              <div class="lcBmiCard__main">
                <div class="lcBmiCard__value" data-bmi="value">${escapeHtml(bmiTxt)}</div>
                <div class="lcBmiCard__label" data-bmi="label">${escapeHtml(labelTxt)}</div>
              </div>
            </div>

          </div>
        </div>
      `;
    },

    // ---------- Step 3 ----------
    addExistingPolicy(ins){
      const p = {
        id: "pol_" + Math.random().toString(16).slice(2),
        company:"",
        type:"",
        policyNumber:"",
        sumInsured:"",
        hasPledge:false,
        bankAgency:false,
        pledgeBankName:"",
        bankAgencyName:"",
        compensation:"",
        monthlyPremium:""
      };
      ins.data.existingPolicies.push(p);
      this.render();
    },
    delExistingPolicy(ins, pid){
      ins.data.existingPolicies = (ins.data.existingPolicies || []).filter(p => p.id !== pid);
      delete ins.data.cancellations[pid];
      this.render();
    },

    renderStep3(ins){
      const d = ins.data;
      const anyHealth = (d.existingPolicies || []).some(x => x && x.type === "בריאות");
      const col4Label = anyHealth ? "כיסויים" : "סכום/פיצוי";

      const rows = (d.existingPolicies || []).map(p => {
        const logoSrc = this.getCompanyLogoSrc(p.company);
        const logo = logoSrc
          ? `<img class="lcPolLogoMini" src="${escapeHtml(logoSrc)}" alt="${escapeHtml(p.company||"")}" />`
          : `<div class="lcPolLogoMini lcPolLogoMini--empty" aria-hidden="true"></div>`;
        const compOpts = (this.existingCompanies || this.companies).map(x => `<option value="${escapeHtml(x)}"${p.company===x?" selected":""}>${escapeHtml(x)}</option>`).join("");
        const typeOpts = this.insTypes.map(x => `<option value="${escapeHtml(x)}"${p.type===x?" selected":""}>${escapeHtml(x)}</option>`).join("");
        const isRisk = (p.type === "ריסק" || p.type === "ריסק משכנתא");
        const isCI = (p.type === "מחלות קשות" || p.type === "סרטן");
        const isHealth = (p.type === "בריאות");
        const bankOpts = this.bankNames.map(b => `<option value="${escapeHtml(b)}"${safeTrim(p.pledgeBankName)===b?" selected":""}>${escapeHtml(b)}</option>`).join("");
        const agencies = this.bankAgencies.filter(a => !safeTrim(p.pledgeBankName) || String(a).includes(p.pledgeBankName));
        const agencyOpts = agencies.map(a => `<option value="${escapeHtml(a)}"${safeTrim(p.bankAgencyName)===a?" selected":""}>${escapeHtml(a)}</option>`).join("");

        const coversCount = Array.isArray(p.covers) ? p.covers.length : 0;
        const coversLabel = coversCount ? (coversCount + " כיסויים נבחרו") : "בחירת כיסויים";

        return `
          <tr>
            <td>
              <div class="lcPolCompanyCell">
                ${logo}
                <select class="input" data-bind="existingPolicies.${p.id}.company" aria-label="חברת ביטוח">
                  <option value="">בחר…</option>${compOpts}
                </select>
              </div>
            </td>
            <td>
              <select class="input" data-bind="existingPolicies.${p.id}.type">
                <option value="">בחר…</option>${typeOpts}
              </select>
            </td>
            <td><input class="input" data-bind="existingPolicies.${p.id}.policyNumber" value="${escapeHtml(p.policyNumber||"")}" placeholder="מספר פוליסה" /></td>
            <td>
              ${isHealth ? `
                <button class="btn lcSmallBtn lcCoversBtn" data-open-covers="${escapeHtml(p.id)}" type="button">${escapeHtml(coversLabel)}</button>
              ` : isRisk ? `<input class="input" data-bind="existingPolicies.${p.id}.sumInsured" value="${escapeHtml(p.sumInsured||"")}" placeholder="סכום ביטוח" />` : isCI ? `<input class="input" data-bind="existingPolicies.${p.id}.compensation" value="${escapeHtml(p.compensation||"")}" placeholder="סכום פיצוי" />` : `<span class="muted small">—</span>`}
            </td>
            <td>
              <div class="moneyField" title="פרמיה חודשית">
                <input class="input moneyField__input" data-money="ils" data-bind="existingPolicies.${p.id}.monthlyPremium" value="${escapeHtml(p.monthlyPremium||"")}" placeholder="0" inputmode="decimal" />
                <span class="moneyField__sym">₪</span>
              </div>
            </td>
            <td>
              ${isRisk ? `
                <label class="row" style="gap:8px">
                  <input type="checkbox" data-bind="existingPolicies.${p.id}.hasPledge" ${p.hasPledge ? "checked":""} />
                  <span class="small">יש שיעבוד</span>
                </label>

                ${p.hasPledge ? `
                  <select class="input" style="margin-top:6px" data-bind="existingPolicies.${p.id}.pledgeBankName">
                    <option value="">בחר בנק משעבד…</option>
                    ${bankOpts}
                  </select>

                  <label class="row" style="gap:8px; margin-top:6px">
                    <input type="checkbox" data-bind="existingPolicies.${p.id}.bankAgency" ${p.bankAgency ? "checked":""} />
                    <span class="small">נרכשה דרך סוכנות בנק</span>
                  </label>

                  ${p.bankAgency ? `
                    <select class="input" style="margin-top:6px" data-bind="existingPolicies.${p.id}.bankAgencyName">
                      <option value="">בחר סוכנות…</option>
                      ${agencyOpts}
                    </select>
                  `:""}
                `:""}
              ` : `<span class="muted small">—</span>`}
            </td>
            <td><button class="btn lcSmallBtn" data-del-exist="${p.id}" type="button">הסר</button></td>
          </tr>
        `;
      }).join("");

      return `
        <div class="lcWSection">
          <div class="lcPolTableWrap" style="padding:0">
            <table class="lcPolTable">
              <thead>
                <tr>
                  <th>חברה</th>
                  <th>סוג</th>
                  <th>מספר</th>
                  <th>${escapeHtml(col4Label)}</th>
                  <th>פרמיה חודשית</th>
                  <th>שיעבוד</th>
                  <th style="width:100px">פעולות</th>
                </tr>
              </thead>
              <tbody>${rows || `<tr><td colspan="7" class="muted">אין פוליסות עדיין</td></tr>`}</tbody>
            </table>
          </div>

          
        </div>
      `;
    },

    // Step3/5 use virtual binding for policy rows by id
    resolvePolicyBind(ins, path, value, kind){
      // path example: existingPolicies.<id>.company
      const parts = String(path).split(".");
      const listName = parts[0]; // existingPolicies/newPolicies
      const pid = parts[1];
      const field = parts.slice(2).join(".");
      const list = (listName === "existingPolicies") ? ins.data.existingPolicies : ins.data.newPolicies;
      const row = (list || []).find(x => x.id === pid);
      if(!row) return false;
      row[field] = value;
      return true;
    },

    // override bindInputs with policy binds
    bindInputs(ins){
      $$("[data-bind]", this.els.body).forEach(el => {
        const path = el.getAttribute("data-bind");
        if(!path) return;

        const setVal = (doRender=false) => {
          let v = (el.type === "checkbox") ? !!el.checked : safeTrim(el.value);
          if(el.getAttribute && el.getAttribute("data-money")==="ils"){
            const raw = String(v||"").replace(/[₪,\s]/g,"");
            let cleaned = raw.replace(/[^0-9.]/g,"");
            const parts = cleaned.split(".");
            if(parts.length>2) cleaned = parts[0] + "." + parts.slice(1).join("");
            const [i,f] = cleaned.split(".");
            const ii = (i||"").replace(/^0+(?=\d)/,"");
            const withCommas = ii.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
            const formatted = (f!==undefined) ? (withCommas + "." + f) : withCommas;
            if(el.value !== formatted) el.value = formatted;
            v = cleaned;
          }

          // policy virtual binding
          if(path.startsWith("existingPolicies.") || path.startsWith("newPolicies.")){
            const ok = this.resolvePolicyBind(ins, path, v);
            if(ok){
              if(path.endsWith(".type")) this.render(); // to refresh conditional fields
              if(path.endsWith(".hasPledge") || path.endsWith(".bankAgency") || path.endsWith(".pledgeBankName") || path.endsWith(".bankAgencyName")) this.render();
              if(path.endsWith(".premiumBefore") || path.endsWith(".discountPct") || path.endsWith(".discountYears")) this.render();
              this.setHint("");
              return;
            }
          }

          // normal bind
          this.setPath(ins.data, path, v);

          if(path === "clinic"){
            if(!ins.data.clinic) ins.data.shaban = "";
            else if(!this.shabanMap[ins.data.clinic]?.includes(ins.data.shaban)) ins.data.shaban = "אין שב״ן";
            this.render();
            return;
          }
          if(path === "birthDate"){
            // don't re-render on every keystroke (prevents focus loss while typing)
            if(doRender) this.render();
            return;
          }
          if(path === "heightCm" || path === "weightKg"){
            // live update without destroying the input focus
            this.calcBmi(ins);
            this.updateBmiUI(ins);
            if(doRender) this.render();
            return;
          }
          if(path === "city" || path === "street" || path === "houseNumber"){
            this.scheduleZipLookup(ins);
            this.setHint("");
            return;
          }

          this.setHint("");
        };

        on(el, "input", () => setVal(false));
        on(el, "change", () => setVal(true));
      });

      const addExist = $("#lcAddExistingPolicy", this.els.body);
      this.bindOccupationAutocomplete(ins);

      on(addExist, "click", () => { this.addExistingPolicy(ins); });
      $$("[data-del-exist]", this.els.body).forEach(btn => on(btn, "click", () => this.delExistingPolicy(ins, btn.getAttribute("data-del-exist"))));

      // open health covers drawer (Health only)
      $$("[data-open-covers]", this.els.body).forEach(btn => {
        on(btn, "click", () => {
          const pid = btn.getAttribute("data-open-covers");
          if(!pid) return;
          this.openCoversDrawer(ins, pid);
        });
      });

      const addNew = $("#lcAddNewPolicy", this.els.body);
      on(addNew, "click", () => { this.addNewPolicy(ins); });
      $$("[data-del-new]", this.els.body).forEach(btn => on(btn, "click", () => this.delNewPolicy(ins, btn.getAttribute("data-del-new"))));

      $$("[data-cancel-policy]", this.els.body).forEach(el => {
        on(el, "change", () => {
          const pid = el.getAttribute("data-cancel-policy");
          const key = el.getAttribute("data-cancel-key");
          if(!pid || !key) return;
          if(!ins.data.cancellations[pid]) ins.data.cancellations[pid] = { attachments: {} };
          let v = (el.type === "checkbox") ? !!el.checked : safeTrim(el.value);
          if(el.getAttribute && el.getAttribute("data-money")==="ils"){
            const raw = String(v||"").replace(/[₪,\s]/g,"");
            let cleaned = raw.replace(/[^0-9.]/g,"");
            const parts = cleaned.split(".");
            if(parts.length>2) cleaned = parts[0] + "." + parts.slice(1).join("");
            const [i,f] = cleaned.split(".");
            const ii = (i||"").replace(/^0+(?=\d)/,"");
            const withCommas = ii.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
            const formatted = (f!==undefined) ? (withCommas + "." + f) : withCommas;
            if(el.value !== formatted) el.value = formatted;
            v = cleaned;
          }
          if(key.startsWith("att:")){
            const attKey = key.slice(4);
            if(!ins.data.cancellations[pid].attachments) ins.data.cancellations[pid].attachments = {};
            ins.data.cancellations[pid].attachments[attKey] = v;
          }else{
            ins.data.cancellations[pid][key] = v;
          }
          this.render();
        });
      });

      $$("[data-payer]", this.els.body).forEach(el => {
        on(el, "change", () => {
          const k = el.getAttribute("data-payer");
          let v = (el.type === "checkbox") ? !!el.checked : safeTrim(el.value);
          if(el.getAttribute && el.getAttribute("data-money")==="ils"){
            const raw = String(v||"").replace(/[₪,\s]/g,"");
            let cleaned = raw.replace(/[^0-9.]/g,"");
            const parts = cleaned.split(".");
            if(parts.length>2) cleaned = parts[0] + "." + parts.slice(1).join("");
            const [i,f] = cleaned.split(".");
            const ii = (i||"").replace(/^0+(?=\d)/,"");
            const withCommas = ii.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
            const formatted = (f!==undefined) ? (withCommas + "." + f) : withCommas;
            if(el.value !== formatted) el.value = formatted;
            v = cleaned;
          }
          this.setPath(ins.data, k, v);
          this.render();
        });
      });
    },

    // ---------- Step 4 ----------
    renderStep4(ins){
      const d = ins.data;
      const list = d.existingPolicies || [];
      const cancelOptions = [
        {v:"", t:"בחר…"},
        {v:"full", t:"ביטול מלא"},
        {v:"partial_health", t:"ביטול חלקי"},
        {v:"nochange_client", t:"ללא שינוי – לבקשת הלקוח"},
        {v:"agent_appoint", t:"מינוי סוכן"},
        {v:"nochange_collective", t:"ללא שינוי – קולקטיב"},
      ];
      const reasons = ["","הוזלת עלויות / מיקסום זכויות","סדר בתיק הביטוחי","רכישת ביטוח חדש"];
      const annexes = Array.from({length:11}).map((_,i)=>`נספח ${i+1}`);

      if(!list.length){
        return `<div class="lcWSection"><div class="lcWTitle">ביטול בחברה נגדית</div><div class="muted">אין פוליסות קיימות למבוטח הזה.</div></div>`;
      }

      const blocks = list.map(p => {
        const c = d.cancellations[p.id] || {};
        const status = safeTrim(c.status || "");
        const needReason = (status === "full" || status === "partial_health");
        const reasonOpts = reasons.map(x => `<option value="${escapeHtml(x)}"${c.reason===x?" selected":""}>${escapeHtml(x || "בחר…")}</option>`).join("");
        const statusOpts = cancelOptions.map(o => `<option value="${o.v}"${status===o.v?" selected":""}>${escapeHtml(o.t)}</option>`).join("");

        const isHealthPolicy = (() => {
          const t = safeTrim(p.type || "");
          return t.includes("בריאות") || t.toLowerCase().includes("health");
        })();
        const showAnnex = (status === "partial_health") && isHealthPolicy;
        const pledgedBank = !!(p.hasPledge && p.bankAgency);

        return `
          <div class="lcWSection lcCancelCard">
            <div class="row row--between">
              <div>
                <div class="lcWTitle">${escapeHtml(p.type || "פוליסה")} · ${escapeHtml(p.company || "חברה")}</div>
                <div class="muted small">מספר: ${escapeHtml(p.policyNumber || "—")}</div>
              </div>
              ${pledgedBank ? `<span class="lcWBadge"><span class="lcStopBlink" aria-hidden="true">🛑</span>שים לב! יש לשלוח ביטול גם לחברת הביטוח וגם לסוכנות</span>` : ``}
            </div>

            <div class="lcWGrid" style="margin-top:10px">
              <div class="field">
                <label class="label">סטטוס</label>
                <select class="input" data-cancel-policy="${p.id}" data-cancel-key="status">${statusOpts}</select>
              </div>

              <div class="field">
                <label class="label">סיבת ביטול</label>
                <select class="input" data-cancel-policy="${p.id}" data-cancel-key="reason" ${needReason ? "" : "disabled"}>${reasonOpts}</select>
                <div class="help">${needReason ? "חובה לבחור סיבה" : "נדרש רק בביטול מלא/חלקי"}</div>
              </div>
            </div>

            ${showAnnex ? `
              <div class="divider"></div>
              <div class="lcWTitle" style="margin-bottom:8px">נספחים לביטול חלקי (בריאות בלבד)</div>
              <div class="lcWGrid">
                ${annexes.map(a => `
                  <label class="row" style="gap:8px">
                    <input type="checkbox" data-cancel-policy="${p.id}" data-cancel-key="att:${escapeHtml(a)}" ${(c.attachments && c.attachments[a]) ? "checked":""} />
                    <span class="small">${escapeHtml(a)}</span>
                  </label>
                `).join("")}
              </div>
            `:""}
          </div>
        `;
      }).join("");

      return `<div class="lcCancelList">` + blocks + `</div>`;
    },

    // ---------- Step 5 (NEW: company -> product, case-level) ----------
    getCompanyLogoSrc(company){
      const map = {
        "הפניקס": "afenix.png",
        "הראל": "harel.png",
        "כלל": "clal.png",
        "מגדל": "megdl.png",
        "מנורה": "menora.png",
        "איילון": "ayalon.png",
        "הכשרה": "achshara.png",
        "AIG": "aig.png",
        "ביטוח ישיר": "beytuyashir.png",
        "9 מיליון": "9milyon.png",
        "מדיקר": "medicare.png"
      };
      return map[company] || "";
    },

    isMedicareCompany(company){
      return safeTrim(company) === "מדיקר";
    },

    ensurePolicyDraft(){
      if(this.policyDraft) return;
      const firstIns = this.insureds[0];
      const spouse = this.insureds.find(x => x.type === "spouse");
      this.policyDraft = {
        insuredMode: "single", // single/couple
        insuredId: firstIns?.id || "",
        company: "",
        type: "",
        sumInsured: "",
        compensation: "",
        premiumMonthly: "",
        startDate: "",
        healthCovers: [],
        pledge: false,
        pledgeBank: { bankName:"", bankNo:"", branch:"", amount:"", years:"", address:"" }
      };
      if(!spouse){
        // if no spouse exists, couple option will be hidden anyway
      }
    },

    addDraftPolicy(){
      this.ensurePolicyDraft();
      const d = this.policyDraft;

      // build normalized policy
      const p = {
        id: this.editingPolicyId || ("npol_" + Math.random().toString(16).slice(2)),
        insuredMode: d.insuredMode,
        insuredId: d.insuredId || "",
        company: d.company || "",
        type: this.isMedicareCompany(d.company) ? "מדיקר" : (d.type || ""),
        sumInsured: (d.sumInsured || ""),
        compensation: (d.compensation || ""),
        premiumMonthly: (d.premiumMonthly || ""),
        startDate: (d.startDate || ""),
        healthCovers: Array.isArray(d.healthCovers) ? d.healthCovers.filter(Boolean) : [],
        pledge: !!d.pledge,
        pledgeBank: Object.assign({ bankName:"", bankNo:"", branch:"", amount:"", years:"", address:"" }, d.pledgeBank || {})
      };

      this.newPolicies = (this.newPolicies || []);
      if(this.editingPolicyId){
        this.newPolicies = this.newPolicies.map(item => item.id === this.editingPolicyId ? p : item);
      }else{
        this.newPolicies.push(p);
      }

      const keepMode = d.insuredMode;
      const keepIns = d.insuredId;

      this.editingPolicyId = null;
      this.policyDraft = null;
      this.ensurePolicyDraft();
      this.policyDraft.insuredMode = keepMode;
      this.policyDraft.insuredId = keepIns;
      this.policyDraft.company = "";
      this.policyDraft.type = "";
      this.policyDraft.sumInsured = "";
      this.policyDraft.compensation = "";
      this.policyDraft.premiumMonthly = "";
      this.policyDraft.startDate = "";
      this.policyDraft.healthCovers = [];
      this.policyDraft.pledge = false;
      this.policyDraft.pledgeBank = { bankName:"", bankNo:"", branch:"", amount:"", years:"", address:"" };

      this.render();
    },

    startEditNewPolicy(pid){
      const p = (this.newPolicies || []).find(item => item.id === pid);
      if(!p) return;
      this.editingPolicyId = pid;
      this.policyDraft = {
        insuredMode: p.insuredMode || "single",
        insuredId: p.insuredId || (this.insureds[0]?.id || ""),
        company: p.company || "",
        type: this.isMedicareCompany(p.company) ? "" : (p.type || ""),
        sumInsured: p.sumInsured || "",
        compensation: p.compensation || "",
        premiumMonthly: p.premiumMonthly || "",
        startDate: p.startDate || "",
        healthCovers: Array.isArray(p.healthCovers) ? p.healthCovers.slice() : [],
        pledge: !!p.pledge,
        pledgeBank: Object.assign({ bankName:"", bankNo:"", branch:"", amount:"", years:"", address:"" }, p.pledgeBank || {})
      };
      this.setHint("מצב עריכה הופעל עבור הפוליסה שנבחרה");
      this.render();
    },

    cancelEditNewPolicy(){
      this.editingPolicyId = null;
      this.policyDraft = null;
      this.setHint("עריכת הפוליסה בוטלה");
      this.render();
    },

    delNewPolicy(pid){
      this.newPolicies = (this.newPolicies || []).filter(p => p.id !== pid);
      // clean any payer mappings that may reference this policy (stored on primary)
      const d0 = this.insureds[0]?.data;
      if(d0 && d0.policyPayers) delete d0.policyPayers[pid];
      this.render();
    },

    validateStep5(){
      const list = (this.newPolicies || []);
      if(list.length < 1) return { ok:false, msg:"חובה להוסיף לפחות פוליסה אחת" };

      // validate each policy
      const bad = list.filter(p => {
        const isMedicare = this.isMedicareCompany(p.company);
        if(!safeTrim(p.company)) return true;
        if(!isMedicare && !safeTrim(p.type)) return true;

        if(!safeTrim(p.premiumMonthly)) return true;
        if(!safeTrim(p.startDate)) return true;
        if(!isMedicare && p.type === "בריאות"){
          const covers = Array.isArray(p.healthCovers) ? p.healthCovers.filter(Boolean) : [];
          if(!covers.length) return true;
        }

        if(!isMedicare && (p.type === "סרטן" || p.type === "מחלות קשות")){
          if(!safeTrim(p.compensation)) return true;
        }
        if(!isMedicare && (p.type === "ריסק" || p.type === "ריסק משכנתא")){
          if(!safeTrim(p.sumInsured)) return true;
        }
        if(!isMedicare && (p.type === "ריסק" || p.type === "ריסק משכנתא") && p.pledge){
          const b = p.pledgeBank || {};
          const req = ["bankName","bankNo","branch","amount","years","address"];
          if(!req.every(k => safeTrim(b[k]))) return true;
        }

        // insured linkage
        if(p.insuredMode === "single"){
          if(!safeTrim(p.insuredId)) return true;
        }else{
          // couple requires spouse to exist
          const spouse = this.insureds.find(x => x.type === "spouse");
          if(!spouse) return true;
        }
        return false;
      });

      if(bad.length) return { ok:false, msg:"יש פוליסות חסרות / לא תקינות — נא להשלים חובה" };
      return { ok:true };
    },

    renderStep5(){
      this.ensurePolicyDraft();
      const d = this.policyDraft;
      const spouse = this.insureds.find(x => x.type === "spouse");
      const insuredOpts = this.insureds.map(ins => `<option value="${ins.id}"${d.insuredId===ins.id?" selected":""}>${escapeHtml(ins.label)}</option>`).join("");

      const companyCards = this.companies.map(c => {
        const src = this.getCompanyLogoSrc(c);
        const selected = (d.company === c);
        const cls = "lcCoCard" + (selected ? " is-selected" : "");
        const logo = src ? `<img class="lcCoLogo" src="${escapeHtml(src)}" alt="${escapeHtml(c)}" />` : `<div class="lcCoLogo lcCoLogo--text">${escapeHtml(c)}</div>`;
        return `<button type="button" class="${cls}" data-co="${escapeHtml(c)}">${logo}<div class="lcCoName">${escapeHtml(c)}</div></button>`;
      }).join("");

      const productOpts = this.insTypes.map(t => `<option value="${escapeHtml(t)}"${d.type===t?" selected":""}>${escapeHtml(t)}</option>`).join("");

      const isMedicare = this.isMedicareCompany(d.company);
      const needComp = !isMedicare && (d.type === "סרטן" || d.type === "מחלות קשות");
      const needSum = !isMedicare && (d.type === "ריסק" || d.type === "ריסק משכנתא");
      const isMortgage = !isMedicare && (d.type === "ריסק משכנתא");
      const isRisk = !isMedicare && (d.type === "ריסק" || d.type === "ריסק משכנתא");
      const canPledge = isRisk;

      const list = (this.newPolicies || []);

      // group rendering
      const byIns = {};
      this.insureds.forEach(ins => byIns[ins.id] = []);
      byIns["__couple_primary__"] = [];
      byIns["__couple_spouse__"] = [];

      list.forEach(p => {
        if(p.insuredMode === "couple"){
          const primary = this.insureds[0];
          const sp = spouse;
          if(primary) byIns[primary.id].push(p);
          if(sp) byIns[sp.id].push(p);
        }else{
          if(byIns[p.insuredId]) byIns[p.insuredId].push(p);
        }
      });

      const renderPolicyCard = (p, showCoupleBadge=false) => {
        const src = this.getCompanyLogoSrc(p.company);
        const logo = src
          ? `<div class="lcPolLogoWrap"><img class="lcPolLogo" src="${escapeHtml(src)}" alt="${escapeHtml(p.company)}" /></div>`
          : `<div class="lcPolLogoWrap"><div class="lcPolLogo lcPolLogo--text">${escapeHtml((p.company || "").slice(0,2) || "•")}</div></div>`;
        const badge = showCoupleBadge ? `<span class="lcChip">זוגי</span>` : "";
        const isMedicare = this.isMedicareCompany(p.company);
        const sumLabel = (p.type === "מחלות קשות" || p.type === "סרטן") ? "סכום פיצוי" : "סכום ביטוח";
        const sumValue = (p.type === "מחלות קשות" || p.type === "סרטן") ? (p.compensation || "") : (p.sumInsured || "");
        const policyTitle = `${escapeHtml(p.company)}${isMedicare ? "" : ` · ${escapeHtml(p.type)}`}`;
        const pledgeText = (!isMedicare && (p.type === "ריסק" || p.type === "ריסק משכנתא") && p.pledge) ? "שיעבוד פעיל" : "ללא שיעבוד";
        const coverItems = this.getHealthCoverList(p);
        const coverSummary = this.summarizeHealthCovers(coverItems, { max: 2, emptyLabel: "טרם נבחרו כיסויים" });
        const fmtDate = (v) => {
          const s = safeTrim(v);
          if(!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return s || "—";
          const [y,m,d] = s.split('-');
          return `${d}.${m}.${y}`;
        };
        const fmtMoney = (v) => {
          const raw = String(v || '').replace(/[₪,\s]/g,'');
          if(!raw) return '—';
          const n = Number(raw);
          if(Number.isFinite(n)) return `₪${n.toLocaleString('he-IL')}`;
          return `₪${escapeHtml(String(v))}`;
        };
        const chips = [
          `<span class="lcPolInfoChip"><span class="lcPolInfoChip__icon">💰</span><span class="lcPolInfoChip__text"><b>${fmtMoney(p.premiumMonthly)}</b><small>פרמיה חודשית</small></span></span>`,
          `<span class="lcPolInfoChip"><span class="lcPolInfoChip__icon">📅</span><span class="lcPolInfoChip__text"><b>${escapeHtml(fmtDate(p.startDate))}</b><small>תחילת ביטוח</small></span></span>`,
          sumValue ? `<span class="lcPolInfoChip"><span class="lcPolInfoChip__icon">🛡️</span><span class="lcPolInfoChip__text"><b>${fmtMoney(sumValue)}</b><small>${sumLabel}</small></span></span>` : '',
          (!isMedicare && (p.type === "ריסק" || p.type === "ריסק משכנתא")) ? `<span class="lcPolInfoChip"><span class="lcPolInfoChip__icon">🏦</span><span class="lcPolInfoChip__text"><b>${escapeHtml(pledgeText)}</b><small>סטטוס שיעבוד</small></span></span>` : ''
        ].filter(Boolean).join('');
        return `<div class="lcPolCard lcPolCard--premium" data-pol="${p.id}">
          <div class="lcPolCard__top">
            <div class="lcPolCard__brand">
              ${logo}
              <div class="lcPolCard__brandText">
                <div class="lcPolTitle">${policyTitle} ${badge}</div>
                <div class="lcPolSub">פוליסה חדשה${showCoupleBadge ? " · משויכת לשני מבוטחים" : ""}</div>
              </div>
            </div>
            <div class="lcPolSummaryTag">חדש</div>
          </div>
          <div class="lcPolInfoStrip">${chips}</div>
          ${p.type === "בריאות" ? `<div class="lcPolCoverCompact">
            <div class="lcPolCoverCompact__text"><span class="lcPolCoverCompact__count">${coverItems.length || 0}</span><span>${escapeHtml(coverSummary)}</span></div>
            <button type="button" class="lcPolCoverCompact__btn" data-editpol="${p.id}">ערוך כיסויים</button>
          </div>` : ``}
          <div class="lcPolCard__actions">
            <button type="button" class="lcIconActionBtn" data-editpol="${p.id}" aria-label="עריכה"><span class="lcIconActionBtn__icon">✏️</span><span>עריכה</span></button>
            <button type="button" class="lcIconActionBtn lcIconActionBtn--danger" data-delpol="${p.id}" aria-label="הסר"><span class="lcIconActionBtn__icon">🗑️</span><span>הסר</span></button>
          </div>
        </div>`;
      };

      const groupsHtml = this.insureds.map(ins => {
        const items = (byIns[ins.id] || []);
        if(!items.length) return "";
        // show "couple" badge for policies that are couple
        const cards = items.map(p => renderPolicyCard(p, p.insuredMode === "couple")).join("");
        return `<div class="lcWSection">
          <div class="lcWTitle">${escapeHtml(ins.label)}</div>
          <div class="lcPolList">${cards}</div>
        </div>`;
      }).join("");

      const emptyNote = (!groupsHtml.trim()) ? `<div class="muted small">עדיין לא נוספו פוליסות חדשות.</div>` : "";

      const form = `<div class="lcWSection lcPolBuilderSection">
        <div class="lcWTitle">${this.editingPolicyId ? "עריכת פוליסה" : "הוספת פוליסה חדשה"}</div>
        <div class="lcPolBuilderIntro muted">פריסה פרימיום מסודרת: כרטיס זכוכית, Summary עליון ו-grid קבוע לשדות החובה.</div>
        <div class="lcPolForm lcPolForm--premium">
          <div class="lcPolBuilderCard">
            <div class="lcPolBuilderCard__head">
              <div>
                <div class="lcPolBuilderCard__eyebrow">Premium Policy Layout</div>
                <div class="lcPolBuilderCard__title">${this.editingPolicyId ? "עריכת פרטי הפוליסה" : "פרטי הפוליסה החדשה"}</div>
              </div>
              <div class="lcPolBuilderMiniSummary">
                <div class="lcPolBuilderMiniSummary__item">
                  <span>חברה</span>
                  <strong>${escapeHtml(d.company || "טרם נבחרה")}</strong>
                </div>
                <div class="lcPolBuilderMiniSummary__item">
                  <span>מוצר</span>
                  <strong>${escapeHtml(isMedicare ? (d.company ? "מדיקר" : "טרם נבחר") : (d.type || "טרם נבחר"))}</strong>
                </div>
              </div>
            </div>

            <div class="lcField lcInsuredGlass lcPolBuilderAssign">
              <div class="lcInsuredGlassCard">
                <div class="lcInsuredGlassHead">
                  <label class="lcLabel">שיוך למבוטח</label>
                  <div class="small muted">קובע למי הפוליסה תשויך בסיכום</div>
                </div>
                <div class="lcInsuredGlassRow">
                  <select class="lcSelect" data-pdraft="insuredId"${(d.insuredMode==="couple")?" disabled":""}>
                    ${insuredOpts}
                  </select>
                  ${spouse ? `<button type="button" class="lcBtn lcBtn--ghost ${d.insuredMode==="couple"?"is-active":""}" data-pdraftmode="couple">פוליסה זוגית (ראשי + בן/בת זוג)</button>` : ``}
                  <button type="button" class="lcBtn lcBtn--ghost ${d.insuredMode==="single"?"is-active":""}" data-pdraftmode="single">פוליסה למבוטח אחד</button>
                </div>
              </div>
            </div>

            <div class="lcField lcPolBuilderCompanies">
              <label class="lcLabel">בחירת חברה</label>
              <div class="lcCoGrid">${companyCards}</div>
            </div>

            <div class="lcPolGrid lcPolGrid--top lcPolGrid--mainRow">
              <div class="lcField lcPolField lcPolField--company">
                <label class="lcLabel">חברה</label>
                <div class="lcPolStaticValue lcPolControlShell">${escapeHtml(d.company || "בחר חברה")}</div>
              </div>

              ${isMedicare ? `<div class="lcField lcPolField lcPolField--product">
                <label class="lcLabel">מוצר</label>
                <div class="lcPolStaticValue lcPolControlShell">מדיקר</div>
              </div>` : `<div class="lcField lcPolField lcPolField--product">
                <label class="lcLabel">מוצר ביטוח</label>
                <div class="lcPolSelectWrap lcPolControlShell">
                  <select class="lcSelect lcPolSelect" data-pdraft="type" ${!d.company?"disabled":""}>
                    <option value="">בחר מוצר…</option>
                    ${productOpts}
                  </select>
                </div>
              </div>`}

              <div class="lcField lcPolField lcPolField--date">
                <label class="lcLabel">תאריך תחילת ביטוח (חובה)</label>
                <div class="lcPolDateWrap lcPolControlShell">
                  <input class="lcInput lcPolDateInput" type="date" data-pdraft="startDate" value="${escapeHtml(d.startDate || "")}" />
                </div>
              </div>

              <div class="lcField lcPolField lcPolField--premiumMain">
                <label class="lcLabel">פרמיה חודשית (חובה)</label>
                <div class="lcPolMoneyWrap lcPolControlShell">
                  <span class="lcPolMoneyWrap__sym">₪</span>
                  <input class="lcInput lcPolMoneyWrap__input" type="text" inputmode="numeric" data-pdraft="premiumMonthly" value="${escapeHtml(d.premiumMonthly || "")}" placeholder="לדוגמה: 250" />
                </div>
              </div>
            </div>

            <div class="lcPolGrid lcPolGrid--money">

              ${needSum ? `<div class="lcField lcPolField lcPolField--sum">
                <label class="lcLabel">סכום ביטוח (חובה)</label>
                <input class="lcInput" type="text" inputmode="numeric" data-pdraft="sumInsured" value="${escapeHtml(d.sumInsured || "")}" placeholder="לדוגמה: 1,000,000" />
              </div>` : ``}

              ${needComp ? `<div class="lcField lcPolField lcPolField--sum">
                <label class="lcLabel">סכום פיצוי (חובה)</label>
                <input class="lcInput" type="text" inputmode="numeric" data-pdraft="compensation" value="${escapeHtml(d.compensation || "")}" placeholder="לדוגמה: 500,000" />
              </div>` : ``}

              ${canPledge ? `<div class="lcField lcPolField lcPolField--pledgeSwitch">
                <label class="lcLabel">שיעבוד</label>
                <label class="lcPolToggle">
                  <input type="checkbox" data-pdraft="pledge" ${d.pledge ? "checked":""} />
                  <span>שיעבוד (מוטב בלתי חוזר)</span>
                </label>
                <div class="help small muted">אופציונלי בריסק. בריסק משכנתא לרוב נדרש.</div>
              </div>` : ``}
            </div>

            ${(!isMedicare && d.type === "בריאות") ? `<div class="lcPolCoverCompact lcPolCoverCompact--editor">
              <div class="lcPolCoverCompact__text"><span class="lcPolCoverCompact__count">${this.getHealthCoverList(d).length || 0}</span><span>${escapeHtml(this.summarizeHealthCovers(this.getHealthCoverList(d), { max: 2, emptyLabel: "טרם נבחרו כיסויים" }))}</span></div>
              <button type="button" class="lcPolCoverCompact__btn" data-open-new-health-covers="1">${this.getHealthCoverList(d).length ? "ערוך כיסויים" : "אישור כיסויים"}</button>
            </div>` : ``}

            ${(canPledge && d.pledge) ? `<div class="lcWSection lcPledgeBox">
              <div class="lcWTitle">פרטי המוטב הבלתי חוזר</div>
              <div class="lcGrid2">
                <div class="lcField"><label class="lcLabel">שם בנק</label><input class="lcInput" data-pdraft-bank="bankName" value="${escapeHtml(d.pledgeBank.bankName||"")}" /></div>
                <div class="lcField"><label class="lcLabel">מספר בנק</label><input class="lcInput" data-pdraft-bank="bankNo" value="${escapeHtml(d.pledgeBank.bankNo||"")}" inputmode="numeric" /></div>
                <div class="lcField"><label class="lcLabel">מספר סניף</label><input class="lcInput" data-pdraft-bank="branch" value="${escapeHtml(d.pledgeBank.branch||"")}" inputmode="numeric" /></div>
                <div class="lcField"><label class="lcLabel">סכום לשיעבוד</label><input class="lcInput" data-pdraft-bank="amount" value="${escapeHtml(d.pledgeBank.amount||"")}" inputmode="numeric" /></div>
                <div class="lcField"><label class="lcLabel">לכמה שנים</label><input class="lcInput" data-pdraft-bank="years" value="${escapeHtml(d.pledgeBank.years||"")}" inputmode="numeric" /></div>
                <div class="lcField"><label class="lcLabel">כתובת הבנק</label><input class="lcInput" data-pdraft-bank="address" value="${escapeHtml(d.pledgeBank.address||"")}" /></div>
              </div>
            </div>` : ``}

            <div class="lcPolBuilderActions">
              ${this.editingPolicyId ? `<button type="button" class="lcBtn" data-cancel-editpol="1">ביטול עריכה</button>` : ``}<button type="button" class="lcBtn lcBtn--primary" data-addpol="1">${this.editingPolicyId ? "שמור שינויים" : "הוסף פוליסה"}</button>
            </div>
          </div>
        </div>
      </div>`;

      const res = form + `<div class="lcWSection">
        <div class="lcWTitle">פוליסות שנוספו</div>
        ${emptyNote}
      </div>` + groupsHtml;

      // bind handlers after render
      setTimeout(() => {
        // company card click
        $$(".lcCoCard", this.els.body).forEach(btn => {
          on(btn, "click", () => {
            this.ensurePolicyDraft();
            const co = btn.getAttribute("data-co");
            this.policyDraft.company = co || "";
            // reset product & dependent fields when changing company
            this.policyDraft.type = "";
            this.policyDraft.sumInsured = "";
            this.policyDraft.compensation = "";
            this.policyDraft.pledge = false;
            this.policyDraft.pledgeBank = { bankName:"", bankNo:"", branch:"", amount:"", years:"", address:"" };
            this.render();
          });
        });

        // insured mode toggle
        $$("[data-pdraftmode]", this.els.body).forEach(b => {
          on(b, "click", () => {
            this.ensurePolicyDraft();
            const mode = b.getAttribute("data-pdraftmode");
            if(mode === "couple" && !spouse) return;
            this.policyDraft.insuredMode = (mode === "couple") ? "couple" : "single";
            this.render();
          });
        });

        // draft field inputs
        $$("[data-pdraft]", this.els.body).forEach(el => {
          on(el, "input", () => {
            this.ensurePolicyDraft();
            const k = el.getAttribute("data-pdraft");
            if(!k) return;
            if(el.type === "checkbox") this.policyDraft[k] = !!el.checked;
            else this.policyDraft[k] = el.value;
            if(k === "type" && this.policyDraft[k] !== "בריאות") this.policyDraft.healthCovers = [];
            // Re-render only when the change affects visible structure
            if(k === "type" || k === "pledge" || k === "insuredId" || k === "company") this.render();
          });
          on(el, "change", () => {
            this.ensurePolicyDraft();
            const k = el.getAttribute("data-pdraft");
            if(!k) return;
            if(el.type === "checkbox") this.policyDraft[k] = !!el.checked;
            else this.policyDraft[k] = el.value;
            if(k === "type" && this.policyDraft[k] !== "בריאות") this.policyDraft.healthCovers = [];
            // Re-render only when the change affects visible structure
            if(k === "type" || k === "pledge" || k === "insuredId" || k === "company") this.render();
          });
        });

        $$("[data-open-new-health-covers]", this.els.body).forEach(btn => {
          on(btn, "click", () => this.openNewPolicyCoversDrawer());
        });

        $$("[data-pdraft-bank]", this.els.body).forEach(el => {
          on(el, "input", () => {
            this.ensurePolicyDraft();
            const k = el.getAttribute("data-pdraft-bank");
            if(!k) return;
            this.policyDraft.pledgeBank[k] = el.value;
          });
          on(el, "change", () => {
            this.ensurePolicyDraft();
            const k = el.getAttribute("data-pdraft-bank");
            if(!k) return;
            this.policyDraft.pledgeBank[k] = el.value;
          });
        });

        // add policy
        const addBtn = this.els.body.querySelector('[data-addpol="1"]');
        if(addBtn){
          on(addBtn, "click", () => {
            const chk = this.validateDraftPolicy();
            if(!chk.ok){
              this.setHint(chk.msg);
              return;
            }
            this.setHint("");
            this.addDraftPolicy();
          });
        }

        // edit policy buttons
        $$('[data-editpol]', this.els.body).forEach(btn => {
          on(btn, 'click', () => {
            const pid = btn.getAttribute('data-editpol');
            if(pid) this.startEditNewPolicy(pid);
          });
        });

        // delete policy buttons
        $$("[data-delpol]", this.els.body).forEach(btn => {
          on(btn, "click", () => {
            const pid = btn.getAttribute("data-delpol");
            if(pid) this.delNewPolicy(pid);
          });
        });

        const cancelEditBtn = this.els.body.querySelector('[data-cancel-editpol="1"]');
        if(cancelEditBtn){
          on(cancelEditBtn, 'click', () => this.cancelEditNewPolicy());
        }

      }, 0);

      return res;
    },

    validateDraftPolicy(){
      this.ensurePolicyDraft();
      const d = this.policyDraft;

      if(d.insuredMode === "couple"){
        const spouse = this.insureds.find(x => x.type === "spouse");
        if(!spouse) return { ok:false, msg:"כדי להוסיף פוליסה זוגית יש להוסיף בן/בת זוג בשלב 1" };
      }else{
        if(!safeTrim(d.insuredId)) return { ok:false, msg:"בחר למי שייכת הפוליסה" };
      }

      const isMedicare = this.isMedicareCompany(d.company);

      if(!safeTrim(d.company)) return { ok:false, msg:"בחר חברה" };
      if(!isMedicare && !safeTrim(d.type)) return { ok:false, msg:"בחר מוצר ביטוח" };

      if(!safeTrim(d.premiumMonthly)) return { ok:false, msg:"חובה למלא פרמיה חודשית" };
      if(!safeTrim(d.startDate)) return { ok:false, msg:"חובה למלא תאריך תחילת ביטוח" };
      if(!isMedicare && d.type === "בריאות"){
        const covers = Array.isArray(d.healthCovers) ? d.healthCovers.filter(Boolean) : [];
        if(!covers.length) return { ok:false, msg:"במוצר בריאות חובה לאשר לפחות כיסוי אחד" };
      }

      if(!isMedicare && (d.type === "סרטן" || d.type === "מחלות קשות")){
        if(!safeTrim(d.compensation)) return { ok:false, msg:"במוצר זה חובה למלא סכום פיצוי" };
      }
      if(!isMedicare && (d.type === "ריסק" || d.type === "ריסק משכנתא")){
        if(!safeTrim(d.sumInsured)) return { ok:false, msg:"בריסק/ריסק משכנתא חובה למלא סכום ביטוח" };
      }
      if(!isMedicare && (d.type === "ריסק" || d.type === "ריסק משכנתא") && d.pledge){
        const b = d.pledgeBank || {};
        const req = ["bankName","bankNo","branch","amount","years","address"];
        const ok = req.every(k => safeTrim(b[k]));
        if(!ok) return { ok:false, msg:"בשיעבוד חובה למלא את כל פרטי המוטב הבלתי חוזר" };
      }
      return { ok:true };
    },
// ---------- Step 6 ----------
    renderStep6(ins){
      const d = ins.data;
      const insuredPayers = this.insureds
        .filter(x => x.type !== "child")
        .map(x => ({ id:x.id, label:x.label, name: (safeTrim(x.data.firstName)+" "+safeTrim(x.data.lastName)).trim() || x.label }));
      const payerOpts = insuredPayers.map(x => `<option value="${x.id}"${safeTrim(d.selectedPayerId)===x.id?" selected":""}>${escapeHtml(x.name)} (${escapeHtml(x.label)})</option>`).join("");

      const method = safeTrim(d.paymentMethod || "cc");
      return `
        <div class="lcWSection">
          <div class="lcWTitle">פרטי משלם</div>
          <div class="muted small">בחירת משלם, אמצעי תשלום ופרטי חיוב לפי שיטת התשלום.</div>

          <div class="lcWGrid">
            <div class="field">
              <label class="label">בחירת משלם</label>
              <select class="input" data-payer="payerChoice">
                <option value="insured" ${d.payerChoice==="insured"?"selected":""}>מבוטח קיים</option>
                <option value="external" ${d.payerChoice==="external"?"selected":""}>משלם חריג</option>
              </select>
            </div>

            <div class="field">
              <label class="label">אמצעי תשלום</label>
              <select class="input" data-payer="paymentMethod">
                <option value="cc" ${method==="cc"?"selected":""}>כרטיס אשראי</option>
                <option value="ho" ${method==="ho"?"selected":""}>הוראת קבע</option>
              </select>
            </div>
          </div>

          <div class="divider"></div>

          ${d.payerChoice === "insured" ? `
            <div class="field">
              <label class="label">מי המשלם?</label>
              <select class="input" data-payer="selectedPayerId">
                <option value="">בחר…</option>
                ${payerOpts}
              </select>
              <div class="help">קטין לא יכול להיות משלם.</div>
            </div>
          ` : `
            <div class="lcWGrid">
              ${this.fieldText("קרבה","externalPayer.relation", d.externalPayer?.relation || "")}
              ${this.fieldText("שם פרטי","externalPayer.firstName", d.externalPayer?.firstName || "")}
              ${this.fieldText("שם משפחה","externalPayer.lastName", d.externalPayer?.lastName || "")}
              ${this.fieldText("ת״ז","externalPayer.idNumber", d.externalPayer?.idNumber || "", "numeric")}
              ${this.fieldDate("תאריך לידה","externalPayer.birthDate", d.externalPayer?.birthDate || "")}
              ${this.fieldText("טלפון","externalPayer.phone", d.externalPayer?.phone || "", "tel")}
            </div>
          `}

          <div class="divider"></div>

          ${method==="cc" ? `
            <div class="lcWGrid">
              ${this.fieldText("שם מחזיק/ה","cc.holderName", d.cc?.holderName || "")}
              ${this.fieldText("ת״ז מחזיק/ה","cc.holderId", d.cc?.holderId || "", "numeric")}
              ${this.fieldText("מספר כרטיס","cc.cardNumber", d.cc?.cardNumber || "", "numeric")}
              ${this.fieldText("תוקף (MM/YY)","cc.exp", d.cc?.exp || "", "text")}
            </div>
          ` : `
            <div class="lcWGrid">
              <div class="field">
                <label class="label">שם הבנק</label>
                <select class="input" data-payer="ho.bankName">
                  <option value="">בחר…</option>
                  ${this.bankNames.map(b => `<option value="${escapeHtml(b)}"${d.ho?.bankName===b?" selected":""}>${escapeHtml(b)}</option>`).join("")}
                </select>
              </div>
              ${this.fieldText("מספר בנק","ho.bankNo", d.ho?.bankNo || "", "numeric")}
              ${this.fieldText("מספר סניף","ho.branch", d.ho?.branch || "", "numeric")}
              ${this.fieldText("מספר חשבון","ho.account", d.ho?.account || "", "numeric")}
            </div>
          `}
        </div>
      `;
    },

    // ---------- Step 7 ----------
    renderStep7(){
      const formatPolicyInsured = (p={}) => {
        if(p.insuredMode === "couple"){
          const primaryLabel = safeTrim(this.insureds?.[0]?.label) || "מבוטח ראשי";
          const spouseLabel = safeTrim(this.insureds.find(x => x.type === "spouse")?.label);
          return spouseLabel ? `${primaryLabel} + ${spouseLabel}` : `${primaryLabel} (זוגי)`;
        }
        const ins = this.insureds.find(x => x.id === p.insuredId);
        return safeTrim(ins?.label) || "מבוטח";
      };

      const renderExistingSummaryTable = (list=[]) => {
        if(!list.length) return `<div class="muted small">אין פוליסות קיימות.</div>`;
        const rows = list.map(p => {
          const logoSrc = this.getCompanyLogoSrc(p.company);
          const logo = logoSrc
            ? `<img class="lcPolLogoMini" src="${escapeHtml(logoSrc)}" alt="${escapeHtml(p.company||"")}" />`
            : `<div class="lcPolLogoMini lcPolLogoMini--empty" aria-hidden="true"></div>`;
          const isRisk = (p.type === "ריסק" || p.type === "ריסק משכנתא");
          const isCI = (p.type === "מחלות קשות" || p.type === "סרטן");
          const sumOrComp = isRisk ? (p.sumInsured||"") : (isCI ? (p.compensation||"") : "");
          const pledgeTxt = isRisk ? (p.hasPledge ? `כן (${escapeHtml(p.pledgeBankName||"")})` : "לא") : "—";
          return `<tr>
            <td><div class="lcPolCompanyCell">${logo}<div class="small"><b>${escapeHtml(p.company||"")}</b></div></div></td>
            <td>${escapeHtml(p.type||"")}</td>
            <td>${escapeHtml(p.policyNumber||"")}</td>
            <td>${escapeHtml(sumOrComp)}</td>
            <td>${pledgeTxt}</td>
          </tr>`;
        }).join("");
        return `<div class="lcPolTableWrap" style="margin-top:10px">
          <table class="lcPolTable">
            <thead><tr><th>חברה</th><th>סוג</th><th>מספר</th><th>סכום/פיצוי</th><th>שיעבוד</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
      };

      const renderNewSummaryTable = (list=[]) => {
        if(!list.length) return `<div class="muted small">עדיין לא נוספו פוליסות חדשות.</div>`;
        const rows = list.map(p => {
          const logoSrc = this.getCompanyLogoSrc(p.company);
          const logo = logoSrc
            ? `<img class="lcPolLogoMini" src="${escapeHtml(logoSrc)}" alt="${escapeHtml(p.company||"")}" />`
            : `<div class="lcPolLogoMini lcPolLogoMini--empty" aria-hidden="true"></div>`;
          const isMedicare = this.isMedicareCompany(p.company);
          const isRisk = !isMedicare && (p.type === "ריסק" || p.type === "ריסק משכנתא");
          const isCI = !isMedicare && (p.type === "מחלות קשות" || p.type === "סרטן");
          const insuredTxt = formatPolicyInsured(p);
          const coverageTxt = isRisk
            ? (safeTrim(p.sumInsured) ? `סכום ביטוח: ${escapeHtml(p.sumInsured)}` : "—")
            : (isCI
              ? (safeTrim(p.compensation) ? `סכום פיצוי: ${escapeHtml(p.compensation)}` : "—")
              : "—");
          let pledgeTxt = "—";
          if(isRisk){
            pledgeTxt = p.pledge ? "כן" : "לא";
            const b = p.pledgeBank || {};
            if(p.pledge && [b.bankName, b.bankNo, b.branch, b.amount, b.years, b.address].some(v => safeTrim(v))){
              const parts = [];
              if(safeTrim(b.bankName)) parts.push(`בנק: ${escapeHtml(b.bankName)}`);
              if(safeTrim(b.bankNo)) parts.push(`מס' בנק: ${escapeHtml(b.bankNo)}`);
              if(safeTrim(b.branch)) parts.push(`סניף: ${escapeHtml(b.branch)}`);
              if(safeTrim(b.amount)) parts.push(`סכום: ${escapeHtml(b.amount)}`);
              if(safeTrim(b.years)) parts.push(`שנים: ${escapeHtml(b.years)}`);
              if(safeTrim(b.address)) parts.push(`כתובת: ${escapeHtml(b.address)}`);
              pledgeTxt += `<div class="small muted">${parts.join(" · ")}</div>`;
            }
          }
          return `<tr>
            <td>${escapeHtml(insuredTxt)}</td>
            <td><div class="lcPolCompanyCell">${logo}<div class="small"><b>${escapeHtml(p.company||"")}</b></div></div></td>
            <td>${escapeHtml(isMedicare ? "מדיקר" : (p.type || ""))}</td>
            <td>${escapeHtml(p.premiumMonthly || "")}</td>
            <td>${escapeHtml(p.startDate || "")}</td>
            <td>${coverageTxt}</td>
            <td>${pledgeTxt}</td>
          </tr>`;
        }).join("");
        return `<div class="lcPolTableWrap" style="margin-top:10px">
          <table class="lcPolTable lcPolTable--summaryNew">
            <thead><tr><th>מבוטח</th><th>חברה</th><th>סוג</th><th>פרמיה חודשית</th><th>תחילת ביטוח</th><th>סכום/פיצוי</th><th>שיעבוד</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
      };

      const existingCount = this.insureds.reduce((acc, ins) => acc + ((ins.data?.existingPolicies || []).length), 0);
      const newCount = (this.newPolicies || []).length;

      const existingBlocks = this.insureds.map(ins => {
        const list = ins.data?.existingPolicies || [];
        return `<div class="lcWSection lcSummarySection">
          <div class="lcWTitle">פוליסות קיימות — ${escapeHtml(ins.label)}</div>
          ${renderExistingSummaryTable(list)}
        </div>`;
      }).join("");

      const newPoliciesBlock = `<div class="lcWSection lcSummarySection">
        <div class="lcWTitle">פוליסות חדשות</div>
        <div class="muted small">להלן כל הפוליסות החדשות שנבחרו בתהליך, כולל פרמיה, תאריך תחילה, סכום ביטוח/פיצוי ופרטי שיעבוד כאשר קיימים.</div>
        ${renderNewSummaryTable(this.newPolicies || [])}
      </div>`;

      return `
        <div class="lcWSection lcSummaryHero">
          <div class="lcWTitle">סיכום הקמה</div>
          <div class="lcSummaryMeta">
            <div class="lcSummaryMetaCard"><span class="lcSummaryMetaCard__k">מבוטחים</span><strong class="lcSummaryMetaCard__v">${this.insureds.length}</strong></div>
            <div class="lcSummaryMetaCard"><span class="lcSummaryMetaCard__k">פוליסות קיימות</span><strong class="lcSummaryMetaCard__v">${existingCount}</strong></div>
            <div class="lcSummaryMetaCard"><span class="lcSummaryMetaCard__k">פוליסות חדשות</span><strong class="lcSummaryMetaCard__v">${newCount}</strong></div>
          </div>
        </div>

        ${existingBlocks}
        ${newPoliciesBlock}
      `;
    },


    // ---------- Step 8 · Phoenix original PDF ----------
    phoenixForms: {
      health: { key:'health', path:'./assets/forms/phoenix/phoenix-health-critical-illness.pdf', title:'הפניקס · בריאות / מחלות קשות', description:'זהו הטופס המקורי של הפניקס לביטוח בריאות. אם קיימת בעסקה פוליסת בריאות — זהו טופס האם שממנו יתר ההצעות יורשות נתונים.', questionnairePath:'./assets/forms/phoenix/phoenix-questionnaires.pdf' },
      ci: { key:'ci', path:'./assets/forms/phoenix/phoenix-critical-illness.pdf', title:'הפניקס · מחלות קשות', description:'הטופס המקורי של הפניקס למחלות קשות / מרפא סרטן.', questionnairePath:'./assets/forms/phoenix/phoenix-questionnaires.pdf' },
      risk_short: { key:'risk_short', path:'./assets/forms/phoenix/phoenix-life-short-up-to-2m-up-to-55.pdf', title:'הפניקס · ריסק מקוצר', description:'נפתח כאשר אין בריאות, והמוצר הוא ריסק עד 2 מיליון ועד גיל 55.', questionnairePath:'./assets/forms/phoenix/phoenix-questionnaires.pdf' },
      risk_long: { key:'risk_long', path:'./assets/forms/phoenix/phoenix-life-extended-over-2m-over-55.pdf', title:'הפניקס · ריסק מורחב', description:'נפתח כאשר אין בריאות, והמוצר הוא ריסק מעל 2 מיליון או גיל מעל 55.', questionnairePath:'./assets/forms/phoenix/phoenix-questionnaires.pdf' },
      mortgage_short: { key:'mortgage_short', path:'./assets/forms/phoenix/phoenix-mortgage-up-to-2m.pdf', title:'הפניקס · משכנתא עד 2 מיליון', description:'הטופס המקורי של הפניקס למשכנתא עד 2 מיליון.', questionnairePath:'./assets/forms/phoenix/phoenix-questionnaires.pdf' },
      mortgage_long: { key:'mortgage_long', path:'./assets/forms/phoenix/phoenix-mortgage-over-2m.pdf', title:'הפניקס · משכנתא מעל 2 מיליון', description:'הטופס המקורי של הפניקס למשכנתא מעל 2 מיליון.', questionnairePath:'./assets/forms/phoenix/phoenix-questionnaires.pdf' }
    },

    getPhoenixHealthState(){
      const primary = this.insureds[0] || { data:{} };
      primary.data = primary.data || {};
      if(!primary.data.healthDeclaration || typeof primary.data.healthDeclaration !== 'object') primary.data.healthDeclaration = {};
      const st = primary.data.healthDeclaration;
      if(!st.mode) st.mode = 'phoenix_original_pdf';
      if(!st.prefillSnapshot) st.prefillSnapshot = null;
      if(!st.viewerUrl) st.viewerUrl = '';
      if(!st.questionnaireUrl) st.questionnaireUrl = '';
      if(!st.selectedFormKey) st.selectedFormKey = '';
      if(!st.reason) st.reason = '';
      if(!st.lastGeneratedAt) st.lastGeneratedAt = '';
      if(st.confirmed !== true) st.confirmed = false;
      if(st.pdfOpened !== true) st.pdfOpened = false;
      return st;
    },

    getPhoenixPolicies(){
      return (this.newPolicies || []).filter(p => safeTrim(p?.company) === 'הפניקס');
    },

    parsePolicyAmount(policy){
      const raw = safeTrim(policy?.sumInsured || policy?.compensation || policy?.premiumMonthly || '');
      const num = Number(String(raw).replace(/[^0-9.]/g, ''));
      return isFinite(num) ? num : 0;
    },

    getPrimaryInsuredAge(){
      const ins = this.insureds[0]?.data || {};
      return this.calcAge(ins.birthDate || ins.dateOfBirth || '');
    },

    choosePhoenixPrimaryForm(){
      const policies = this.getPhoenixPolicies();
      if(!policies.length) return null;

      const health = policies.find(p => safeTrim(p.type) === 'בריאות');
      if(health) return { ...this.phoenixForms.health, policy: health, reason:'נמצאה פוליסת בריאות — נפתחת ההצהרה המורחבת של הבריאות כטופס האם.' };

      const risk = policies.find(p => {
        const t = safeTrim(p.type);
        return t === 'ריסק' || t === 'ריסק משכנתא';
      });
      if(risk){
        const amount = this.parsePolicyAmount(risk);
        const age = this.getPrimaryInsuredAge();
        if(safeTrim(risk.type) === 'ריסק משכנתא'){
          if(amount > 2000000) return { ...this.phoenixForms.mortgage_long, policy:risk, reason:'ריסק משכנתא מעל 2 מיליון — נבחר טופס המשכנתא הארוך.' };
          return { ...this.phoenixForms.mortgage_short, policy:risk, reason:'ריסק משכנתא עד 2 מיליון — נבחר טופס המשכנתא המתאים.' };
        }
        if(amount <= 2000000 && age && age <= 55) return { ...this.phoenixForms.risk_short, policy:risk, reason:'ריסק עד 2 מיליון ועד גיל 55 — נבחר טופס החיים המקוצר.' };
        return { ...this.phoenixForms.risk_long, policy:risk, reason:'ריסק מעל 2 מיליון או מעל גיל 55 — נבחר טופס החיים המורחב.' };
      }

      const ci = policies.find(p => ['מחלות קשות','סרטן','מרפא סרטן'].includes(safeTrim(p.type)));
      if(ci) return { ...this.phoenixForms.ci, policy:ci, reason:'אין בריאות אך קיימת פוליסת מחלות קשות — נבחר טופס מחלות קשות.' };
      return null;
    },

    buildPhoenixPrefillSnapshot(formDef){
      const primary = this.insureds[0]?.data || {};
      const spouseIns = this.insureds.find((x,idx) => idx>0 && (safeTrim(x?.relation) === 'בן/בת זוג' || safeTrim(x?.data?.relation) === 'בן/בת זוג'));
      const spouse = spouseIns?.data || {};
      const policy = formDef?.policy || {};
      const fullName = [safeTrim(primary.firstName), safeTrim(primary.lastName)].filter(Boolean).join(' ');
      const spouseFullName = [safeTrim(spouse.firstName), safeTrim(spouse.lastName)].filter(Boolean).join(' ');
      const h = Number(String(primary.heightCm || '').replace(/[^0-9.]/g,''));
      const w = Number(String(primary.weightKg || '').replace(/[^0-9.]/g,''));
      const bmi = (h && w) ? (w / Math.pow(h/100,2)).toFixed(1) : '';
      return {
        fullName,
        firstName: safeTrim(primary.firstName), lastName: safeTrim(primary.lastName), idNumber: safeTrim(primary.idNumber), birthDate: safeTrim(primary.birthDate), age: this.calcAge(primary.birthDate || ''),
        phone: safeTrim(primary.phone), email: safeTrim(primary.email), city: safeTrim(primary.city), address: safeTrim(primary.address), gender: safeTrim(primary.gender), smoker: safeTrim(primary.smoker) === 'כן',
        heightCm: safeTrim(primary.heightCm), weightKg: safeTrim(primary.weightKg), bmi,
        smokingAmount: safeTrim(primary.smokingAmount || primary.cigarettesPerDay || ''), stopSmokingYear: safeTrim(primary.stopSmokingYear || ''),
        spouseFullName, spouseFirstName: safeTrim(spouse.firstName), spouseLastName: safeTrim(spouse.lastName), spouseId: safeTrim(spouse.idNumber),
        spouseHeightCm: safeTrim(spouse.heightCm), spouseWeightKg: safeTrim(spouse.weightKg), spouseSmoker: safeTrim(spouse.smoker) === 'כן',
        spouseSmokingAmount: safeTrim(spouse.smokingAmount || spouse.cigarettesPerDay || ''), spouseStopSmokingYear: safeTrim(spouse.stopSmokingYear || ''),
        policyType: safeTrim(policy.type), startDate: safeTrim(policy.startDate), premiumMonthly: safeTrim(policy.premiumMonthly), sumInsured: safeTrim(policy.sumInsured), compensation: safeTrim(policy.compensation), company: safeTrim(policy.company),
        agentName: safeTrim(Auth?.current?.name), hasSpouse: !!spouseIns
      };
    },

    getPhoenixCandidatePaths(relPath){
      const clean = String(relPath || '').replace(/^\.+\//,'');
      const fileName = clean.split('/').pop() || clean;
      const candidates = [
        `./${clean}`,
        clean,
        `./assets/forms/phoenix/${fileName}`,
        `assets/forms/phoenix/${fileName}`,
        `./${fileName}`,
        fileName,
        `/assets/forms/phoenix/${fileName}`
      ];
      return Array.from(new Set(candidates.filter(Boolean)));
    },

    async tryFetchPhoenixPdf(paths){
      let lastErr = null;
      for(const path of paths){
        try{
          const res = await fetch(path, { cache:'no-store' });
          if(!res.ok) throw new Error(`HTTP ${res.status}`);
          const bytes = await res.arrayBuffer();
          const sig = Array.from(new Uint8Array(bytes).slice(0,4)).map(n => String.fromCharCode(n)).join('');
          if(sig !== '%PDF') throw new Error('Not a PDF payload');
          return { path, bytes };
        }catch(err){
          lastErr = err;
        }
      }
      if(lastErr) throw lastErr;
      throw new Error('Phoenix PDF not found');
    },

    async createFilledPhoenixPdf(formDef, questionnaireMode=false){
      if(!formDef) return { url:'', usedOriginal:true };
      const configuredPath = questionnaireMode ? formDef.questionnairePath : formDef.path;
      const candidatePaths = this.getPhoenixCandidatePaths(configuredPath);
      const st = this.getPhoenixHealthState();
      st.prefillSnapshot = this.buildPhoenixPrefillSnapshot(formDef);

      let fetched = null;
      try{
        fetched = await this.tryFetchPhoenixPdf(candidatePaths);
      }catch(fetchErr){
        console.warn('PHOENIX_FETCH_FALLBACK', fetchErr);
        return { url: candidatePaths[0] || configuredPath, usedOriginal:true };
      }

      const sourcePath = fetched.path;
      const bytes = fetched.bytes;
      if(!(window.PDFLib) || /mortgage/.test(formDef.key)) return { url: sourcePath, usedOriginal:true };
      const { PDFDocument } = window.PDFLib;
      const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption:true });
      const form = pdfDoc.getForm();
      const s = st.prefillSnapshot || {};
      const setText = (name, value) => { try{ form.getTextField(name).setText(String(value || '')); }catch(_e){} };
      const setCheck = (name, checked) => { try{ const cb = form.getCheckBox(name); checked ? cb.check() : cb.uncheck(); }catch(_e){} };
      const fmtDate = (v) => { const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v||'')); return m ? `${m[3]}/${m[2]}/${m[1]}` : String(v||''); };

      ['FullName','Text32','Text200959595'].forEach(n => setText(n, s.fullName));
      ['FullNameSpouse'].forEach(n => setText(n, s.spouseFullName));
      ['FirstName'].forEach(n => setText(n, s.firstName));
      ['LastName'].forEach(n => setText(n, s.lastName));
      ['PID'].forEach(n => setText(n, s.idNumber));
      ['FirstNameSpouse'].forEach(n => setText(n, s.spouseFirstName));
      ['LastNameSpouse'].forEach(n => setText(n, s.spouseLastName));
      ['PIDSpouse'].forEach(n => setText(n, s.spouseId));
      ['Date'].forEach(n => setText(n, fmtDate(s.startDate || nowISO().slice(0,10))));
      ['AgentName'].forEach(n => setText(n, s.agentName));
      ['AgentPID'].forEach(n => setText(n, s.idNumber));
      ['Hight'].forEach(n => setText(n, s.heightCm));
      ['Weight'].forEach(n => setText(n, s.weightKg));
      ['HightSpouse'].forEach(n => setText(n, s.spouseHeightCm));
      ['WeightSpouse'].forEach(n => setText(n, s.spouseWeightKg));
      ['ClientSmokeNum'].forEach(n => setText(n, s.smokingAmount));
      ['ClientSmokeNumSpouse'].forEach(n => setText(n, s.spouseSmokingAmount));
      ['ClientStopSmokeYear'].forEach(n => setText(n, s.stopSmokingYear));
      ['ClientStopSmokeYearSpouse'].forEach(n => setText(n, s.spouseStopSmokingYear));
      ['IsSmoking'].forEach(n => setCheck(n, !!s.smoker));
      ['IsSmokingBzug'].forEach(n => setCheck(n, !!s.spouseSmoker));
      ['Text24'].forEach(n => setText(n, s.weightKg));
      ['Text26'].forEach(n => setText(n, s.bmi));
      ['Text35','Text36','Text37'].forEach(n => setText(n, s.idNumber));

      if(questionnaireMode){
        ['AgentName','AgentNumber','Text32','Text33','Text35','Text36','Text37'].forEach(n => setText(n, s.agentName || s.fullName));
        ['Text46','Text47','Text48','Text49','Text50','Text51','Text52','Text53','Text54','Text55','Text56','Text57','Text58','Text59','Text60','Text61','Text62','Text63','Text64','Text65','Text66','Text67','Text68','Text81','Text96','Text97','Text98','Text99','Text125','Text126','Text127','Text128','Text129','Text130'].forEach(n => { try{ if(!form.getTextField(n).getText()) setText(n, s.fullName); }catch(_e){} });
      }

      try{ form.updateFieldAppearances(); }catch(_e){}
      const out = await pdfDoc.save();
      return { url: URL.createObjectURL(new Blob([out], { type:'application/pdf' })), usedOriginal:false };
    },

    async openPhoenixPdf(questionnaireMode=false){
      const formDef = this.choosePhoenixPrimaryForm();
      const st = this.getPhoenixHealthState();
      if(!formDef){ this.setHint('לא נמצאה כרגע פוליסת הפניקס רלוונטית לפתיחת הצהרת בריאות.'); return; }
      st.selectedFormKey = formDef.key;
      st.reason = formDef.reason;
      this.setHint('טוען את הטופס המקורי של הפניקס…');
      try{
        const res = await this.createFilledPhoenixPdf(formDef, questionnaireMode);
        if(questionnaireMode){
          if(st.questionnaireUrl && st.questionnaireUrl.startsWith('blob:')) URL.revokeObjectURL(st.questionnaireUrl);
          st.questionnaireUrl = res.url;
        }else{
          if(st.viewerUrl && st.viewerUrl.startsWith('blob:')) URL.revokeObjectURL(st.viewerUrl);
          st.viewerUrl = res.url;
          st.pdfOpened = true;
          st.lastGeneratedAt = nowISO();
        }
        this.setHint(questionnaireMode ? 'שאלוני ההמשך נטענו.' : 'הטופס המקורי של הפניקס נטען בהצלחה.');
        this.render();
      }catch(err){
        console.error('PHOENIX_PDF_OPEN_ERROR', err);
        this.setHint('טעינת טופס הפניקס נכשלה. ודא שהקבצים קיימים בתוך assets/forms/phoenix או ליד index.html, ושהשם שלהם תואם בדיוק.');
      }
    },

    renderStep8(){
      const st = this.getPhoenixHealthState();
      const formDef = this.choosePhoenixPrimaryForm();
      if(!formDef){
        return `<div class="lcHealthEmpty"><div class="lcHealthEmpty__icon">📄</div><div class="lcHealthEmpty__title">הצהרת בריאות מקורית</div><div class="lcHealthEmpty__text">כרגע לא נמצאה פוליסת הפניקס רלוונטית. כדי לפתוח טופס מקורי יש לבחור בשלב 5 פוליסת הפניקס בבריאות / מחלות קשות / ריסק / ריסק משכנתא.</div></div>`;
      }
      const snap = st.prefillSnapshot && st.selectedFormKey === formDef.key ? st.prefillSnapshot : this.buildPhoenixPrefillSnapshot(formDef);
      const chips = [`חברה: ${formDef.policy?.company || 'הפניקס'}`, `מוצר: ${formDef.policy?.type || '—'}`, snap.age ? `גיל: ${snap.age}` : '', formDef.policy?.sumInsured ? `סכום ביטוח: ${escapeHtml(formDef.policy.sumInsured)}` : '', formDef.policy?.compensation ? `סכום פיצוי: ${escapeHtml(formDef.policy.compensation)}` : ''].filter(Boolean);
      const frame = st.viewerUrl ? `<iframe class="lcPhoenix__frame" id="lcPhoenixPdfFrame" src="${escapeHtml(st.viewerUrl)}#toolbar=0&navpanes=0&statusbar=0"></iframe>` : `<div class="lcPhoenix__empty"><div><div style="font-size:42px;margin-bottom:12px">📑</div><div style="font-weight:900;font-size:20px;color:#13315c;margin-bottom:8px">עדיין לא נטען טופס</div><div style="max-width:420px;line-height:1.8">לחץ על "טען את הטופס המקורי" והמערכת תפתח את ה-PDF המקורי של הפניקס במסך מלא, עם ירושה אוטומטית של הפרטים האישיים שכבר הוזנו בוויזארד.</div></div></div>`;
      const mortgageWarn = /mortgage/.test(formDef.key) ? `<div class="lcPhoenix__alert">שים לב: שני קבצי המשכנתא המקוריים אינם כוללים כרגע שדות AcroForm מובנים, לכן בשלב זה המערכת מציגה אותם כמסמך המקורי עצמו, אך בלי שפיכה דיגיטלית מלאה של השדות לתוכו.</div>` : '';
      return `<div class="lcPhoenix"><div class="lcPhoenix__side"><div class="lcPhoenix__kicker">שלב 8 · טופס מקורי של החברה</div><h2 class="lcPhoenix__title">${escapeHtml(formDef.title)}</h2><div class="lcPhoenix__sub">${escapeHtml(formDef.description)}</div><div class="lcPhoenix__chips">${chips.map(c => `<span class="lcPhoenix__chip">${c}</span>`).join('')}</div><div class="lcPhoenix__meta"><div class="lcPhoenix__metaItem"><b>מבוטח ראשי</b><span>${escapeHtml(snap.fullName || '—')}</span></div><div class="lcPhoenix__metaItem"><b>ת״ז</b><span>${escapeHtml(snap.idNumber || '—')}</span></div><div class="lcPhoenix__metaItem"><b>טלפון</b><span>${escapeHtml(snap.phone || '—')}</span></div><div class="lcPhoenix__metaItem"><b>כתובת</b><span>${escapeHtml([snap.address, snap.city].filter(Boolean).join(', ') || '—')}</span></div><div class="lcPhoenix__metaItem"><b>BMI</b><span>${escapeHtml(snap.bmi || '—')}</span></div><div class="lcPhoenix__metaItem"><b>נציג</b><span>${escapeHtml(snap.agentName || '—')}</span></div></div><div class="lcPhoenix__actions"><button type="button" class="btn btn--primary" data-phx-open-pdf="1">טען את הטופס המקורי</button><button type="button" class="btn" data-phx-open-q="1">פתח שאלוני המשך של הפניקס</button>${st.viewerUrl ? `<a class="btn" href="${escapeHtml(st.viewerUrl)}" download="phoenix-form.pdf">הורד PDF ממולא</a>` : ''}</div><div class="lcPhoenix__helper">${escapeHtml(formDef.reason || '')}<br>מה שהנציג כבר הזין בוויזארד נשפך אוטומטית לשדות שקיימים בקובץ המקורי של הפניקס. את שדות הבריאות והכן/לא ממשיכים למלא על גבי הטופס עצמו.</div>${mortgageWarn}${st.questionnaireUrl ? `<div class="lcPhoenix__alert">שאלוני ההמשך נטענו. כדי להשלים אותם אפשר לפתוח את קובץ השאלונים בדפדפן דרך כפתור ההורדה/הצגה.</div>` : ''}<label class="lcPhoenix__check"><input type="checkbox" data-phx-confirm="1" ${st.confirmed ? 'checked' : ''}><span>בדקתי ופתחתי את הטופס המקורי של החברה. אפשר להמשיך לסיום הלקוח רק אחרי פתיחת הטופס ואישור הבדיקה.</span></label></div><div class="lcPhoenix__viewer"><div class="lcPhoenix__viewerTop"><div><div class="lcPhoenix__viewerTitle">מסמך מלא על המסך</div><div class="lcPhoenix__viewerSub">המערכת מציגה את ה-PDF המקורי של החברה. במקרה של תשובה חיובית ניתן לפתוח גם את קובץ שאלוני ההמשך.</div></div>${st.lastGeneratedAt ? `<div class="small muted">עודכן: ${escapeHtml(new Date(st.lastGeneratedAt).toLocaleString('he-IL'))}</div>` : ''}</div><div class="lcPhoenix__frameWrap">${frame}</div></div></div>`;
    },

    bindHealthInputs(){
      const st = this.getPhoenixHealthState();
      const openBtn = this.els.body.querySelector('[data-phx-open-pdf]');
      if(openBtn) on(openBtn, 'click', async () => { await this.openPhoenixPdf(false); });
      const qBtn = this.els.body.querySelector('[data-phx-open-q]');
      if(qBtn) on(qBtn, 'click', async () => { await this.openPhoenixPdf(true); if(this.getPhoenixHealthState().questionnaireUrl) window.open(this.getPhoenixHealthState().questionnaireUrl, '_blank'); });
      const confirmEl = this.els.body.querySelector('[data-phx-confirm]');
      if(confirmEl) on(confirmEl, 'change', () => { st.confirmed = !!confirmEl.checked; this.setHint(st.confirmed ? 'שלב 8 אושר.' : 'יש לאשר לאחר פתיחת הטופס המקורי.'); });
      if(!st.viewerUrl){ setTimeout(() => { if(this.step === 8 && !this.getPhoenixHealthState().viewerUrl) this.openPhoenixPdf(false); }, 80); }
    },

    getHealthBlockingIssue(){
      const formDef = this.choosePhoenixPrimaryForm();
      if(!formDef) return { ok:false, msg:'לא נמצאה פוליסת הפניקס רלוונטית לשלב 8.' };
      const st = this.getPhoenixHealthState();
      if(!st.viewerUrl) return { ok:false, msg:'יש לפתוח קודם את הטופס המקורי של הפניקס.' };
      if(!st.confirmed) return { ok:false, msg:'יש לסמן שאישרת את בדיקת הטופס המקורי לפני סיום.' };
      return { ok:true };
    },


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
      if (r.ok) UI.renderSyncStatus(label || "נשמר", "ok", r.at);
      else UI.renderSyncStatus("שגיאה בשמירה", "err", null, r.error);
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
  Wizard.init();
  App._bootPromise = App.boot();

})();