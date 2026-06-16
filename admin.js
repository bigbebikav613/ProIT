(() => {
  const STORAGE_CONTENT = "proit_landing_content_v1";
  const STORAGE_APPLICATIONS_LEGACY = "proit_landing_applications_v1";
  const STORAGE_APPLICATIONS_SECURE = "proit_landing_applications_secure_v2";
  const STORAGE_ADMIN_AUTH = "proit_landing_admin_auth_v2";
  const STORAGE_ADMIN_SESSION = "proit_landing_admin_session_v2";
  const STORAGE_ADMIN_RATE_LIMIT = "proit_landing_admin_rate_limit_v2";
  const STORAGE_ADMIN_SERVER_CSRF = "proit_landing_admin_server_csrf_v1";
  const LEGACY_ADMIN_PIN_KEY = "proit_landing_admin_pin_v1";
  const LEGACY_ADMIN_SESSION_KEY = "proit_landing_admin_session_v1";
  const API_BASE = "/api";

  const SESSION_TTL_MS = 1000 * 60 * 60 * 8;
  const SESSION_IDLE_MS = 1000 * 60 * 15;
  const MAX_FAILED_ATTEMPTS = 10;
  const APPLICATION_RETENTION_DAYS = 180;
  const PRIVACY_POLICY_VERSION = "2026-04-14";

  const byId = (id) => document.getElementById(id);
  const deepClone = (value) => JSON.parse(JSON.stringify(value));

  const mergeWithDefaults = (defaults, saved) => {
    if (Array.isArray(defaults)) {
      return Array.isArray(saved) ? saved : deepClone(defaults);
    }
    if (defaults && typeof defaults === "object") {
      const result = {};
      for (const key of Object.keys(defaults)) {
        result[key] = mergeWithDefaults(defaults[key], saved ? saved[key] : undefined);
      }
      if (saved && typeof saved === "object") {
        for (const key of Object.keys(saved)) {
          if (!(key in result)) {
            result[key] = saved[key];
          }
        }
      }
      return result;
    }
    return saved !== undefined ? saved : defaults;
  };

  const fallbackDefaults = () => ({
    meta: { source: "vk.com/proittaganrog", updatedAt: new Date().toISOString() },
    brand: {
      schoolName: "Школа ПРО IT",
      heroTitle: "Школа ПРО IT Таганрог",
      heroSubtitle: "Проектная IT-школа на базе ИКТИБ ЮФУ для школьников и студентов СПО.",
      tagline: "Создадим крутой IT-проект вместе!",
      primaryCta: "Записаться на обучение",
      secondaryCta: "Смотреть курсы"
    },
    about: { lead: "", description: "", points: [] },
    enrollment: { ageInfo: "12+", duration: "6 месяцев", formats: "Очно и онлайн" },
    achievements: [],
    teachers: [],
    courses: [],
    gallery: [],
    reviews: [],
    contacts: {
      address: "",
      phone: "",
      email: "",
      vk: "",
      telegram: "",
      mapEmbed: ""
    }
  });

  const buildDefaultData = () => {
    if (typeof window.PRO_IT_BUILD_DEFAULT_DATA === "function") {
      return window.PRO_IT_BUILD_DEFAULT_DATA();
    }
    return fallbackDefaults();
  };

  const escapeHtml = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");

  const slugify = (value) => String(value ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^\wа-яё-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  const splitLines = (value) => String(value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const normalizeImage = (url) => String(url ?? "")
    .replaceAll("&amp;", "&")
    .replace(/^http:\/\//i, "https://")
    .trim();

  const hasMojibake = (value) => /(?:[РС][\u0400-\u04FF]){4,}/.test(String(value ?? ""));

  const loadData = () => {
    const defaults = buildDefaultData();
    try {
      const raw = localStorage.getItem(STORAGE_CONTENT);
      if (!raw || hasMojibake(raw)) {
        localStorage.setItem(STORAGE_CONTENT, JSON.stringify(defaults));
        return defaults;
      }
      return mergeWithDefaults(defaults, JSON.parse(raw));
    } catch (_error) {
      return defaults;
    }
  };

  const saveData = (data) => {
    localStorage.setItem(STORAGE_CONTENT, JSON.stringify(data));
  };

  const loadLegacyApplications = () => {
    try {
      const raw = localStorage.getItem(STORAGE_APPLICATIONS_LEGACY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
      return [];
    }
  };

  const loadSecureApplicationPayload = () => {
    try {
      const raw = localStorage.getItem(STORAGE_APPLICATIONS_SECURE);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
      return [];
    }
  };

  const saveSecureApplicationPayload = (list) => {
    localStorage.setItem(STORAGE_APPLICATIONS_SECURE, JSON.stringify(list));
  };

  const parseJsonStorage = (key, fallback = null) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_error) {
      return fallback;
    }
  };

  const loadAuthBundle = () => parseJsonStorage(STORAGE_ADMIN_AUTH, null);
  const loadServerCsrfToken = () => {
    try {
      return String(sessionStorage.getItem(STORAGE_ADMIN_SERVER_CSRF) || "");
    } catch (_error) {
      return "";
    }
  };
  const saveServerCsrfToken = (token) => {
    if (!token) {
      sessionStorage.removeItem(STORAGE_ADMIN_SERVER_CSRF);
      return;
    }
    sessionStorage.setItem(STORAGE_ADMIN_SERVER_CSRF, String(token));
  };

  const saveAuthBundle = (bundle) => {
    localStorage.setItem(STORAGE_ADMIN_AUTH, JSON.stringify(bundle));
  };

  const state = {
    data: loadData(),
    applications: [],
    activeTab: "applications",
    toastTimer: null,
    authBundle: loadAuthBundle(),
    serverAuthConfigured: true,
    serverCsrfToken: loadServerCsrfToken(),
    privateKey: null,
    publicKey: null,
    sessionWatcher: null,
    activityHandler: null
  };

  const showToast = (message) => {
    const toast = byId("adminToast");
    if (!toast) {
      return;
    }
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
  };

  const ensureSecurityRuntime = () => {
    if (!window.ProItSecurity || !window.ProItSecurity.supportsStrongCrypto) {
      throw new Error("Современный криптографический API недоступен в этом браузере.");
    }
  };

  const nextId = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;

  const fetchApi = async (path, options = {}) => {
    const method = String(options.method || "GET").toUpperCase();
    const headers = {
      ...(options.headers || {})
    };
    if (!Object.prototype.hasOwnProperty.call(headers, "Content-Type")) {
      headers["Content-Type"] = "application/json";
    }
    if (state.serverCsrfToken && !["GET", "HEAD", "OPTIONS"].includes(method)) {
      headers["X-CSRF-Token"] = state.serverCsrfToken;
    }

    const response = await fetch(`${API_BASE}${path}`, {
      credentials: "same-origin",
      headers,
      ...options
    });

    if (!response.ok) {
      let message = "Ошибка API";
      try {
        const payload = await response.json();
        message = payload?.error || message;
      } catch (_error) {
        // Ignore JSON parse errors and use default message.
      }
      throw new Error(message);
    }

    if (response.status === 204) {
      return null;
    }
    return response.json();
  };

  const loadApplicationsFromApi = async () => {
    const items = await fetchApi("/applications", { method: "GET" });
    state.applications = pruneApplications(Array.isArray(items) ? items : []);
  };

  const loadServerAuthStatus = async () => {
    const status = await fetchApi("/admin/status", { method: "GET" });
    state.serverAuthConfigured = Boolean(status?.configured);
  };

  const loginServerSession = async (password) => {
    const payload = await fetchApi("/admin/login", {
      method: "POST",
      body: JSON.stringify({ password })
    });
    state.serverCsrfToken = String(payload?.csrfToken || "");
    saveServerCsrfToken(state.serverCsrfToken);
  };

  const setupServerCredentials = async (password) => {
    await fetchApi("/admin/setup", {
      method: "POST",
      body: JSON.stringify({ password })
    });
    state.serverAuthConfigured = true;
  };

  const logoutServerSession = async () => {
    try {
      await fetchApi("/admin/logout", { method: "POST", body: JSON.stringify({}) });
    } catch (_error) {
      // Ignore logout failures and clear local state anyway.
    }
    state.serverCsrfToken = "";
    saveServerCsrfToken("");
  };

  const normalizeApplication = (application) => {
    const createdAt = application?.createdAt ? String(application.createdAt) : new Date().toISOString();
    return {
      id: String(application?.id || nextId("app")),
      createdAt,
      processed: Boolean(application?.processed),
      source: String(application?.source || ""),
      courseId: String(application?.courseId || ""),
      courseTitle: String(application?.courseTitle || ""),
      fullName: String(application?.fullName || ""),
      phone: String(application?.phone || ""),
      email: String(application?.email || ""),
      format: String(application?.format || ""),
      comment: String(application?.comment || ""),
      consentPolicyVersion: String(application?.consentPolicyVersion || PRIVACY_POLICY_VERSION),
      consentAcceptedAt: String(application?.consentAcceptedAt || createdAt)
    };
  };

  const retentionCutoff = () => Date.now() - (APPLICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const pruneApplications = (list) => {
    const cutoff = retentionCutoff();
    const map = new Map();
    list.map(normalizeApplication).forEach((application) => {
      const created = Date.parse(application.createdAt);
      if (!Number.isFinite(created) || created < cutoff) {
        return;
      }
      map.set(application.id, application);
    });
    return [...map.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  };

  const loadRateLimit = () => parseJsonStorage(STORAGE_ADMIN_RATE_LIMIT, {
    failedAttempts: 0,
    lockUntil: 0,
    lastFailedAt: 0
  });

  const saveRateLimit = (value) => {
    localStorage.setItem(STORAGE_ADMIN_RATE_LIMIT, JSON.stringify(value));
  };

  const getLockRemainingMs = () => {
    const limiter = loadRateLimit();
    return Math.max(0, Number(limiter?.lockUntil || 0) - Date.now());
  };

  const registerFailedAttempt = () => {
    const previous = loadRateLimit();
    const failedAttempts = Math.min(MAX_FAILED_ATTEMPTS, Number(previous?.failedAttempts || 0) + 1);
    const lockMs = Math.min(30 * 60 * 1000, Math.pow(2, Math.max(0, failedAttempts - 1)) * 5000);
    const next = {
      failedAttempts,
      lastFailedAt: Date.now(),
      lockUntil: Date.now() + lockMs
    };
    saveRateLimit(next);
    return next;
  };

  const resetRateLimit = () => {
    localStorage.removeItem(STORAGE_ADMIN_RATE_LIMIT);
  };

  const loadSession = () => {
    try {
      const raw = sessionStorage.getItem(STORAGE_ADMIN_SESSION);
      return raw ? JSON.parse(raw) : null;
    } catch (_error) {
      return null;
    }
  };

  const saveSession = (session) => {
    sessionStorage.setItem(STORAGE_ADMIN_SESSION, JSON.stringify(session));
  };

  const clearSession = () => {
    sessionStorage.removeItem(STORAGE_ADMIN_SESSION);
  };

  const createSession = () => {
    const now = Date.now();
    return {
      token: window.ProItSecurity.randomToken(),
      issuedAt: now,
      lastActivityAt: now,
      expiresAt: now + SESSION_TTL_MS
    };
  };

  const isSessionValid = (session) => {
    if (!session?.token || !session?.expiresAt || !session?.lastActivityAt) {
      return false;
    }
    const now = Date.now();
    if (now >= Number(session.expiresAt)) {
      return false;
    }
    if (now - Number(session.lastActivityAt) > SESSION_IDLE_MS) {
      return false;
    }
    return true;
  };

  const touchSession = () => {
    const session = loadSession();
    if (!isSessionValid(session)) {
      return false;
    }
    const now = Date.now();
    if (now - Number(session.lastActivityAt) < 30000) {
      return true;
    }
    session.lastActivityAt = now;
    saveSession(session);
    return true;
  };

  const encryptAndStoreApplications = async (list) => {
    ensureSecurityRuntime();
    if (!state.publicKey) {
      throw new Error("Публичный ключ не инициализирован.");
    }
    const prepared = pruneApplications(list);
    const payload = [];
    for (const application of prepared) {
      payload.push(await window.ProItSecurity.encryptApplicationRecord(application, state.publicKey));
    }
    saveSecureApplicationPayload(payload);
    localStorage.removeItem(STORAGE_APPLICATIONS_LEGACY);
  };

  const decryptApplicationsFromStorage = async (privateKey) => {
    ensureSecurityRuntime();
    const payload = loadSecureApplicationPayload();
    const applications = [];
    for (const encrypted of payload) {
      try {
        const decrypted = await window.ProItSecurity.decryptApplicationRecord(encrypted, privateKey);
        applications.push(normalizeApplication(decrypted));
      } catch (_error) {
        // Skip damaged payload records.
      }
    }
    return pruneApplications(applications);
  };

  const mergeLegacyApplications = async () => {
    const legacy = pruneApplications(loadLegacyApplications());
    if (!legacy.length) {
      return;
    }
    state.applications = pruneApplications([...state.applications, ...legacy]);
    await encryptAndStoreApplications(state.applications);
  };

  const persistApplicationsSecure = async (successMessage) => {
    try {
      await encryptAndStoreApplications(state.applications);
      if (successMessage) {
        showToast(successMessage);
      }
    } catch (_error) {
      showToast("Не удалось безопасно сохранить заявки.");
    }
  };

  const setTab = (tab) => {
    state.activeTab = tab;
    document.querySelectorAll(".admin-tab-btn").forEach((button) => {
      button.classList.toggle("active", button.dataset.tab === tab);
    });
    document.querySelectorAll(".admin-tab-panel").forEach((panel) => {
      panel.classList.toggle("active", panel.id === `tab-${tab}`);
    });
  };

  const updateLastUpdatedLabel = () => {
    const label = byId("lastUpdatedLabel");
    if (!label) {
      return;
    }
    const date = new Date(state.data.meta?.updatedAt || Date.now());
    label.textContent = `Последнее сохранение: ${date.toLocaleString("ru-RU")}`;
  };

  const persistData = (message) => {
    state.data.meta = state.data.meta || {};
    state.data.meta.updatedAt = new Date().toISOString();
    saveData(state.data);
    updateLastUpdatedLabel();
    if (message) {
      showToast(message);
    }
  };

  const teacherOptions = (selectedId) => {
    const options = [`<option value="">Не выбран</option>`];
    state.data.teachers.forEach((teacher) => {
      options.push(`<option value="${escapeHtml(teacher.id)}" ${teacher.id === selectedId ? "selected" : ""}>${escapeHtml(teacher.name)}</option>`);
    });
    return options.join("");
  };

  const renderApplicationsTable = () => {
    const body = byId("applicationsTableBody");
    const rows = [...state.applications].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="8">Заявок пока нет.</td></tr>`;
      return;
    }
    body.innerHTML = rows.map((app) => `
      <tr>
        <td>${new Date(app.createdAt).toLocaleString("ru-RU")}</td>
        <td>${escapeHtml(app.courseTitle || "")}</td>
        <td>${escapeHtml(app.fullName || "")}</td>
        <td>${escapeHtml(app.phone || "")}</td>
        <td>${escapeHtml(app.format || "")}</td>
        <td>${escapeHtml(app.comment || "")}</td>
        <td>
          <button class="status-pill ${app.processed ? "done" : "pending"}" data-toggle-processed="${escapeHtml(app.id)}" type="button">
            ${app.processed ? "Обработана" : "Новая"}
          </button>
        </td>
        <td><button class="admin-action-btn" data-delete-app="${escapeHtml(app.id)}" type="button">Удалить</button></td>
      </tr>
    `).join("");
  };

  const fillContentForm = () => {
    const form = byId("contentForm");
    const { brand, about, contacts } = state.data;
    form.schoolName.value = brand.schoolName || "";
    form.heroTitle.value = brand.heroTitle || "";
    form.heroSubtitle.value = brand.heroSubtitle || "";
    form.tagline.value = brand.tagline || "";
    form.primaryCta.value = brand.primaryCta || "";
    form.secondaryCta.value = brand.secondaryCta || "";
    form.aboutLead.value = about.lead || "";
    form.aboutDescription.value = about.description || "";
    form.aboutPoints.value = (about.points || []).join("\n");
    form.address.value = contacts.address || "";
    form.phone.value = contacts.phone || "";
    form.email.value = contacts.email || "";
    form.vk.value = contacts.vk || "";
    form.telegram.value = contacts.telegram || "";
    form.mapEmbed.value = contacts.mapEmbed || "";
  };

  const renderAchievementsEditor = () => {
    const container = byId("achievementsEditor");
    container.innerHTML = (state.data.achievements || []).map((item) => `
      <div class="collection-row" data-kind="achievement">
        <div class="collection-row-grid">
          <label>Заголовок<input data-field="title" type="text" value="${escapeHtml(item.title || "")}"></label>
          <label>Значение<input data-field="value" type="text" value="${escapeHtml(item.value || "")}"></label>
          <label>Описание<input data-field="description" type="text" value="${escapeHtml(item.description || "")}"></label>
        </div>
        <div class="collection-row-actions"><button class="btn-remove-row" data-remove-row type="button">Удалить</button></div>
      </div>
    `).join("");
  };

  const renderTeachersEditor = () => {
    const container = byId("teachersEditor");
    container.innerHTML = (state.data.teachers || []).map((teacher) => `
      <div class="collection-row" data-kind="teacher">
        <div class="collection-row-grid">
          <label>ID<input data-field="id" type="text" value="${escapeHtml(teacher.id || "")}"></label>
          <label>ФИО<input data-field="name" type="text" value="${escapeHtml(teacher.name || "")}"></label>
          <label>Роль<input data-field="role" type="text" value="${escapeHtml(teacher.role || "")}"></label>
        </div>
        <div class="collection-row-grid two">
          <label>Фото (URL)<input data-field="photo" type="url" value="${escapeHtml(teacher.photo || "")}"></label>
          <label>Описание<textarea data-field="bio" rows="3">${escapeHtml(teacher.bio || "")}</textarea></label>
        </div>
        <div class="collection-row-actions"><button class="btn-remove-row" data-remove-row type="button">Удалить</button></div>
      </div>
    `).join("");
  };

  const renderCoursesEditor = () => {
    const container = byId("coursesEditor");
    container.innerHTML = (state.data.courses || []).map((course) => `
      <div class="collection-row" data-kind="course">
        <div class="collection-row-grid">
          <label>ID<input data-field="id" type="text" value="${escapeHtml(course.id || "")}"></label>
          <label>Название<input data-field="title" type="text" value="${escapeHtml(course.title || "")}"></label>
          <label>Возраст<input data-field="ageCategory" type="text" value="${escapeHtml(course.ageCategory || "12+")}"></label>
        </div>
        <div class="collection-row-grid">
          <label>Длительность<input data-field="duration" type="text" value="${escapeHtml(course.duration || "6 месяцев")}"></label>
          <label>Стоимость<input data-field="price" type="text" value="${escapeHtml(course.price || "20 000 ₽")}"></label>
          <label>Форматы (через запятую)<input data-field="formats" type="text" value="${escapeHtml((course.formats || []).join(", "))}"></label>
          <label>Преподаватель
            <select data-field="teacherId">${teacherOptions(course.teacherId || "")}</select>
          </label>
        </div>
        <div class="collection-row-grid two">
          <label>Краткое описание<textarea data-field="shortDescription" rows="3">${escapeHtml(course.shortDescription || "")}</textarea></label>
          <label>Подробное описание<textarea data-field="fullDescription" rows="4">${escapeHtml(course.fullDescription || "")}</textarea></label>
        </div>
        <label>Изображение курса (URL)<input data-field="image" type="url" value="${escapeHtml(course.image || "")}"></label>
        <div class="collection-row-actions"><button class="btn-remove-row" data-remove-row type="button">Удалить</button></div>
      </div>
    `).join("");
  };

  const renderGalleryEditor = () => {
    const container = byId("galleryEditor");
    container.innerHTML = (state.data.gallery || []).map((item) => `
      <div class="collection-row" data-kind="gallery">
        <div class="collection-row-grid">
          <label>Фото (URL)<input data-field="image" type="url" value="${escapeHtml(item.image || "")}"></label>
          <label>Заголовок<input data-field="title" type="text" value="${escapeHtml(item.title || "")}"></label>
          <label>Подпись<input data-field="caption" type="text" value="${escapeHtml(item.caption || "")}"></label>
        </div>
        <label>Ссылка на пост/источник<input data-field="postUrl" type="url" value="${escapeHtml(item.postUrl || "")}"></label>
        <div class="collection-row-actions"><button class="btn-remove-row" data-remove-row type="button">Удалить</button></div>
      </div>
    `).join("");
  };

  const renderReviewsEditor = () => {
    const container = byId("reviewsEditor");
    container.innerHTML = (state.data.reviews || []).map((review) => `
      <div class="collection-row" data-kind="review">
        <div class="collection-row-grid">
          <label>Автор<input data-field="author" type="text" value="${escapeHtml(review.author || "")}"></label>
          <label>Роль<input data-field="role" type="text" value="${escapeHtml(review.role || "")}"></label>
          <span></span>
        </div>
        <label>Текст отзыва<textarea data-field="text" rows="4">${escapeHtml(review.text || "")}</textarea></label>
        <div class="collection-row-actions"><button class="btn-remove-row" data-remove-row type="button">Удалить</button></div>
      </div>
    `).join("");
  };

  const renderAllPanels = () => {
    state.data = mergeWithDefaults(buildDefaultData(), state.data);
    renderApplicationsTable();
    fillContentForm();
    renderAchievementsEditor();
    renderTeachersEditor();
    renderCoursesEditor();
    renderGalleryEditor();
    renderReviewsEditor();
    updateLastUpdatedLabel();
  };

  const collectRows = (containerId, fields) => {
    const rows = Array.from(byId(containerId).querySelectorAll(".collection-row"));
    return rows.map((row) => {
      const data = {};
      fields.forEach((field) => {
        const input = row.querySelector(`[data-field="${field}"]`);
        data[field] = input ? input.value.trim() : "";
      });
      return data;
    });
  };

  const bindCollectionRemove = (containerId) => {
    byId(containerId).addEventListener("click", (event) => {
      const button = event.target.closest("[data-remove-row]");
      if (button) {
        button.closest(".collection-row")?.remove();
      }
    });
  };

  const exportApplicationsXlsx = () => {
    const rows = [...state.applications]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map((app) => [
        new Date(app.createdAt).toLocaleString("ru-RU"),
        app.courseTitle || "",
        app.fullName || "",
        app.phone || "",
        app.format || "",
        app.comment || "",
        app.source || "",
        app.processed ? "Обработана" : "Новая",
        app.consentAcceptedAt ? new Date(app.consentAcceptedAt).toLocaleString("ru-RU") : "",
        app.consentPolicyVersion || PRIVACY_POLICY_VERSION
      ]);
    const csv = [
      ["Дата", "Курс", "ФИО", "Телефон", "Формат", "Комментарий", "Источник", "Статус", "Согласие (дата)", "Версия политики"],
      ...rows
    ].map((line) => line.map((v) => `"${String(v).replaceAll("\"", "\"\"")}"`).join(",")).join("\n");

    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `pro_it_applications_${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
  };

  const setupAuth = async () => {
    ensureSecurityRuntime();
    sessionStorage.removeItem(LEGACY_ADMIN_SESSION_KEY);

    const loginWrap = byId("adminLoginWrap");
    const appWrap = byId("adminApp");
    const loginForm = byId("adminLoginForm");
    const loginError = byId("adminLoginError");
    const loginHint = byId("adminLoginModeHint");
    const setupFields = byId("adminSetupFields");
    const submitButton = byId("adminLoginSubmitBtn");
    const passwordInput = byId("adminPasswordInput");
    const passwordConfirmInput = byId("adminPasswordConfirmInput");

    const stopSessionWatcher = () => {
      if (state.sessionWatcher) {
        clearInterval(state.sessionWatcher);
        state.sessionWatcher = null;
      }
      if (state.activityHandler) {
        window.removeEventListener("pointerdown", state.activityHandler);
        window.removeEventListener("keydown", state.activityHandler);
        state.activityHandler = null;
      }
    };

    const closeAdmin = () => {
      appWrap.hidden = true;
      loginWrap.hidden = false;
      stopSessionWatcher();
    };

    const logout = async (message) => {
      await logoutServerSession();
      clearSession();
      stopSessionWatcher();
      state.privateKey = null;
      state.publicKey = null;
      closeAdmin();
      if (message) {
        showToast(message);
      }
    };

    const startSessionWatcher = () => {
      stopSessionWatcher();
      state.activityHandler = () => {
        if (!touchSession()) {
          void logout("Сеанс завершён: требуется повторный вход.");
        }
      };
      window.addEventListener("pointerdown", state.activityHandler, { passive: true });
      window.addEventListener("keydown", state.activityHandler);
      state.sessionWatcher = setInterval(() => {
        if (!isSessionValid(loadSession())) {
          void logout("Сеанс завершён по таймауту.");
        }
      }, 15000);
    };

    const openAdmin = () => {
      loginWrap.hidden = true;
      appWrap.hidden = false;
      renderAllPanels();
      setTab("applications");
      startSessionWatcher();
    };

    const refreshLoginMode = () => {
      const localNeedsSetup = !state.authBundle?.auth?.hash || !state.authBundle?.keys?.publicJwk;
      const needsSetup = localNeedsSetup || !state.serverAuthConfigured;
      setupFields.hidden = !needsSetup;
      passwordConfirmInput.required = needsSetup;
      loginHint.textContent = needsSetup
        ? "Первый вход: создайте пароль администратора."
        : "Введите пароль для входа";
      submitButton.textContent = needsSetup ? "Создать пароль и войти" : "Войти";
      loginForm.reset();
      loginError.textContent = "";
    };

    const unlockAdminContext = async (password) => {
      if (!state.authBundle?.auth?.hash || !state.authBundle?.keys?.publicJwk) {
        throw new Error("Не найден профиль безопасности администратора.");
      }
      state.publicKey = await window.ProItSecurity.importPublicKey(state.authBundle);
      state.privateKey = await window.ProItSecurity.unlockPrivateKey(state.authBundle, password);
      await loginServerSession(password);
      await loadApplicationsFromApi();
    };

    await loadServerAuthStatus();
    refreshLoginMode();
    closeAdmin();

    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const lockRemaining = getLockRemainingMs();
      if (lockRemaining > 0) {
        loginError.textContent = `Слишком много попыток. Повторите через ${Math.ceil(lockRemaining / 1000)} сек.`;
        return;
      }

      const password = passwordInput.value;
      const localNeedsSetup = !state.authBundle?.auth?.hash || !state.authBundle?.keys?.publicJwk;
      const serverNeedsSetup = !state.serverAuthConfigured;
      const isFirstSetup = localNeedsSetup || serverNeedsSetup;
      submitButton.disabled = true;

      try {
        if (isFirstSetup) {
          if (password !== passwordConfirmInput.value) {
            loginError.textContent = "Пароль и подтверждение не совпадают.";
            return;
          }
          const strength = window.ProItSecurity.validatePasswordStrength(password);
          if (!strength.ok) {
            loginError.textContent = strength.errors.join(" ");
            return;
          }
          if (!localNeedsSetup) {
            const verified = await window.ProItSecurity.verifyCredentialBundle(state.authBundle, password);
            if (!verified) {
              const limiter = registerFailedAttempt();
              const remaining = Math.max(0, Number(limiter.lockUntil) - Date.now());
              loginError.textContent = `Неверный пароль. Повторите через ${Math.ceil(remaining / 1000)} сек.`;
              return;
            }
          }
          if (localNeedsSetup) {
            state.authBundle = await window.ProItSecurity.createCredentialBundle(password);
            saveAuthBundle(state.authBundle);
            localStorage.removeItem(LEGACY_ADMIN_PIN_KEY);
          }
          if (serverNeedsSetup) {
            await setupServerCredentials(password);
          }
        } else {
          const verified = await window.ProItSecurity.verifyCredentialBundle(state.authBundle, password);
          if (!verified) {
            const limiter = registerFailedAttempt();
            const remaining = Math.max(0, Number(limiter.lockUntil) - Date.now());
            loginError.textContent = `Неверный пароль. Повторите через ${Math.ceil(remaining / 1000)} сек.`;
            return;
          }
        }

        await unlockAdminContext(password);
        resetRateLimit();
        saveSession(createSession());
        loginError.textContent = "";
        openAdmin();
        showToast(isFirstSetup ? "Безопасный профиль создан." : "Вход выполнен.");
        refreshLoginMode();
      } catch (error) {
        if (!isFirstSetup) {
          registerFailedAttempt();
        }
        loginError.textContent = error?.message || "Не удалось выполнить вход.";
      } finally {
        submitButton.disabled = false;
      }
    });

    byId("logoutBtn").addEventListener("click", () => {
      void logout("Сеанс завершён.");
    });
  };

  const bindEvents = () => {
    document.querySelectorAll(".admin-tab-btn").forEach((button) => {
      button.addEventListener("click", () => setTab(button.dataset.tab));
    });

    byId("applicationsTableBody").addEventListener("click", async (event) => {
      const toggleButton = event.target.closest("[data-toggle-processed]");
      if (toggleButton) {
        const appId = toggleButton.dataset.toggleProcessed;
        const target = state.applications.find((app) => app.id === appId);
        if (!target) {
          return;
        }
        const nextProcessed = !target.processed;
        try {
          await fetchApi(`/applications/${encodeURIComponent(appId)}/processed`, {
            method: "PATCH",
            body: JSON.stringify({ processed: nextProcessed })
          });
          target.processed = nextProcessed;
          renderApplicationsTable();
          showToast("Статус заявки обновлён.");
        } catch (error) {
          showToast(error?.message || "Не удалось обновить статус заявки.");
        }
        return;
      }

      const deleteButton = event.target.closest("[data-delete-app]");
      if (!deleteButton) {
        return;
      }
      const appId = deleteButton.dataset.deleteApp;
      try {
        await fetchApi(`/applications/${encodeURIComponent(appId)}`, { method: "DELETE" });
        state.applications = state.applications.filter((app) => app.id !== appId);
        renderApplicationsTable();
        showToast("Заявка удалена.");
      } catch (error) {
        showToast(error?.message || "Не удалось удалить заявку.");
      }
    });

    byId("exportApplicationsBtn").addEventListener("click", exportApplicationsXlsx);

    byId("clearApplicationsBtn").addEventListener("click", async () => {
      if (!window.confirm("Удалить все заявки?")) {
        return;
      }
      try {
        await fetchApi("/applications", { method: "DELETE" });
        state.applications = [];
        renderApplicationsTable();
        showToast("Все заявки очищены.");
      } catch (error) {
        showToast(error?.message || "Не удалось очистить заявки.");
      }
    });

    byId("contentForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      state.data.brand.schoolName = form.schoolName.value.trim();
      state.data.brand.heroTitle = form.heroTitle.value.trim();
      state.data.brand.heroSubtitle = form.heroSubtitle.value.trim();
      state.data.brand.tagline = form.tagline.value.trim();
      state.data.brand.primaryCta = form.primaryCta.value.trim();
      state.data.brand.secondaryCta = form.secondaryCta.value.trim();
      state.data.about.lead = form.aboutLead.value.trim();
      state.data.about.description = form.aboutDescription.value.trim();
      state.data.about.points = splitLines(form.aboutPoints.value);
      state.data.contacts.address = form.address.value.trim();
      state.data.contacts.phone = form.phone.value.trim();
      state.data.contacts.email = form.email.value.trim();
      state.data.contacts.vk = form.vk.value.trim();
      state.data.contacts.telegram = form.telegram.value.trim();
      state.data.contacts.mapEmbed = form.mapEmbed.value.trim();
      persistData("Основной контент сохранён.");
    });

    bindCollectionRemove("achievementsEditor");
    bindCollectionRemove("teachersEditor");
    bindCollectionRemove("coursesEditor");
    bindCollectionRemove("galleryEditor");
    bindCollectionRemove("reviewsEditor");

    byId("addAchievementBtn").addEventListener("click", () => {
      byId("achievementsEditor").insertAdjacentHTML("beforeend", `
        <div class="collection-row" data-kind="achievement">
          <div class="collection-row-grid">
            <label>Заголовок<input data-field="title" type="text"></label>
            <label>Значение<input data-field="value" type="text"></label>
            <label>Описание<input data-field="description" type="text"></label>
          </div>
          <div class="collection-row-actions"><button class="btn-remove-row" data-remove-row type="button">Удалить</button></div>
        </div>
      `);
    });

    byId("saveAchievementsBtn").addEventListener("click", () => {
      const rows = collectRows("achievementsEditor", ["title", "value", "description"]);
      state.data.achievements = rows.filter((row) => row.title || row.value || row.description);
      persistData("Достижения сохранены.");
    });

    byId("addTeacherBtn").addEventListener("click", () => {
      byId("teachersEditor").insertAdjacentHTML("beforeend", `
        <div class="collection-row" data-kind="teacher">
          <div class="collection-row-grid">
            <label>ID<input data-field="id" type="text"></label>
            <label>ФИО<input data-field="name" type="text"></label>
            <label>Роль<input data-field="role" type="text"></label>
          </div>
          <div class="collection-row-grid two">
            <label>Фото (URL)<input data-field="photo" type="url"></label>
            <label>Описание<textarea data-field="bio" rows="3"></textarea></label>
          </div>
          <div class="collection-row-actions"><button class="btn-remove-row" data-remove-row type="button">Удалить</button></div>
        </div>
      `);
    });

    byId("saveTeachersBtn").addEventListener("click", () => {
      const rows = collectRows("teachersEditor", ["id", "name", "role", "photo", "bio"]);
      state.data.teachers = rows
        .map((teacher) => ({
          ...teacher,
          id: teacher.id || slugify(teacher.name) || `teacher_${Math.random().toString(16).slice(2, 7)}`,
          photo: normalizeImage(teacher.photo)
        }))
        .filter((teacher) => teacher.name);
      persistData("Преподаватели сохранены.");
      renderCoursesEditor();
    });

    byId("addCourseBtn").addEventListener("click", () => {
      byId("coursesEditor").insertAdjacentHTML("beforeend", `
        <div class="collection-row" data-kind="course">
          <div class="collection-row-grid">
            <label>ID<input data-field="id" type="text"></label>
            <label>Название<input data-field="title" type="text"></label>
            <label>Возраст<input data-field="ageCategory" type="text" value="12+"></label>
          </div>
          <div class="collection-row-grid">
            <label>Длительность<input data-field="duration" type="text" value="6 месяцев"></label>
            <label>Стоимость<input data-field="price" type="text" value="20 000 ₽"></label>
            <label>Форматы (через запятую)<input data-field="formats" type="text" value="очно"></label>
            <label>Преподаватель
              <select data-field="teacherId">${teacherOptions("")}</select>
            </label>
          </div>
          <div class="collection-row-grid two">
            <label>Краткое описание<textarea data-field="shortDescription" rows="3"></textarea></label>
            <label>Подробное описание<textarea data-field="fullDescription" rows="4"></textarea></label>
          </div>
          <label>Изображение курса (URL)<input data-field="image" type="url"></label>
          <div class="collection-row-actions"><button class="btn-remove-row" data-remove-row type="button">Удалить</button></div>
        </div>
      `);
    });

    byId("saveCoursesBtn").addEventListener("click", () => {
      const rows = collectRows("coursesEditor", ["id", "title", "ageCategory", "duration", "price", "formats", "teacherId", "shortDescription", "fullDescription", "image"]);
      state.data.courses = rows
        .map((course) => ({
          id: course.id || slugify(course.title) || `course_${Math.random().toString(16).slice(2, 7)}`,
          title: course.title,
          ageCategory: course.ageCategory || "12+",
          shortDescription: course.shortDescription,
          fullDescription: course.fullDescription,
          duration: course.duration || "6 месяцев",
          price: course.price || "20 000 ₽",
          formats: course.formats ? course.formats.split(",").map((item) => item.trim()).filter(Boolean) : ["очно"],
          teacherId: course.teacherId,
          image: normalizeImage(course.image)
        }))
        .filter((course) => course.title);
      persistData("Курсы сохранены.");
    });

    byId("addGalleryBtn").addEventListener("click", () => {
      byId("galleryEditor").insertAdjacentHTML("beforeend", `
        <div class="collection-row" data-kind="gallery">
          <div class="collection-row-grid">
            <label>Фото (URL)<input data-field="image" type="url"></label>
            <label>Заголовок<input data-field="title" type="text"></label>
            <label>Подпись<input data-field="caption" type="text"></label>
          </div>
          <label>Ссылка на пост/источник<input data-field="postUrl" type="url"></label>
          <div class="collection-row-actions"><button class="btn-remove-row" data-remove-row type="button">Удалить</button></div>
        </div>
      `);
    });

    byId("saveGalleryBtn").addEventListener("click", () => {
      const rows = collectRows("galleryEditor", ["image", "title", "caption", "postUrl"]);
      state.data.gallery = rows
        .map((item) => ({
          image: normalizeImage(item.image),
          title: item.title,
          caption: item.caption,
          postUrl: item.postUrl
        }))
        .filter((item) => item.image || item.postUrl);
      persistData("Галерея сохранена.");
    });

    byId("addReviewBtn").addEventListener("click", () => {
      byId("reviewsEditor").insertAdjacentHTML("beforeend", `
        <div class="collection-row" data-kind="review">
          <div class="collection-row-grid">
            <label>Автор<input data-field="author" type="text"></label>
            <label>Роль<input data-field="role" type="text"></label>
            <span></span>
          </div>
          <label>Текст отзыва<textarea data-field="text" rows="4"></textarea></label>
          <div class="collection-row-actions"><button class="btn-remove-row" data-remove-row type="button">Удалить</button></div>
        </div>
      `);
    });

    byId("saveReviewsBtn").addEventListener("click", () => {
      const rows = collectRows("reviewsEditor", ["author", "role", "text"]);
      state.data.reviews = rows.filter((row) => row.author || row.text);
      persistData("Отзывы сохранены.");
    });

    byId("passwordForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const currentPassword = form.currentPassword.value;
      const newPassword = form.newPassword.value;
      const confirmNewPassword = form.confirmNewPassword.value;

      if (!state.authBundle) {
        showToast("Сначала выполните вход в админ-панель.");
        return;
      }
      if (newPassword !== confirmNewPassword) {
        showToast("Новый пароль и подтверждение не совпадают.");
        return;
      }
      const strength = window.ProItSecurity.validatePasswordStrength(newPassword);
      if (!strength.ok) {
        showToast(strength.errors.join(" "));
        return;
      }

      const submit = form.querySelector("button[type=\"submit\"]");
      if (submit) {
        submit.disabled = true;
      }
      try {
        const verified = await window.ProItSecurity.verifyCredentialBundle(state.authBundle, currentPassword);
        if (!verified) {
          showToast("Неверный текущий пароль.");
          return;
        }

        const serverResult = await fetchApi("/admin/change-password", {
          method: "POST",
          body: JSON.stringify({
            currentPassword,
            newPassword
          })
        });
        state.serverCsrfToken = String(serverResult?.csrfToken || state.serverCsrfToken || "");
        saveServerCsrfToken(state.serverCsrfToken);

        const updatedBundle = await window.ProItSecurity.rewrapCredentialBundle(
          state.authBundle,
          currentPassword,
          newPassword
        );
        state.authBundle = updatedBundle;
        saveAuthBundle(updatedBundle);
        state.publicKey = await window.ProItSecurity.importPublicKey(updatedBundle);
        state.privateKey = await window.ProItSecurity.unlockPrivateKey(updatedBundle, newPassword);
        await loadApplicationsFromApi();
        form.reset();
        showToast("Пароль обновлён.");
      } catch (error) {
        showToast(error?.message || "Не удалось обновить пароль.");
      } finally {
        if (submit) {
          submit.disabled = false;
        }
      }
    });

    window.addEventListener("storage", (event) => {
      if (event.key === STORAGE_CONTENT) {
        state.data = loadData();
        renderAllPanels();
      }
      if (event.key === STORAGE_ADMIN_AUTH && state.privateKey) {
        clearSession();
        state.privateKey = null;
        state.publicKey = null;
        state.serverCsrfToken = "";
        saveServerCsrfToken("");
        showToast("Параметры безопасности изменены в другой вкладке. Требуется повторный вход.");
        byId("adminApp").hidden = true;
        byId("adminLoginWrap").hidden = false;
      }
    });
  };

  bindEvents();
  setupAuth().catch((error) => {
    const loginError = byId("adminLoginError");
    if (loginError) {
      loginError.textContent = error?.message || "Не удалось инициализировать безопасность.";
    }
  });
})();

