(() => {
  const API_BASE = String(window.PRO_IT_API_BASE || "/api").replace(/\/$/, "");
  const PRIVACY_POLICY_VERSION = "2026-04-14";
  const byId = (id) => document.getElementById(id);

  const emptyData = () => ({
    meta: { source: "", updatedAt: "" },
    brand: { schoolName: "", heroTitle: "", heroSubtitle: "", tagline: "", primaryCta: "", secondaryCta: "" },
    about: { lead: "", description: "", points: [] },
    enrollment: { ageInfo: "", duration: "", formats: "" },
    achievements: [],
    teachers: [],
    courses: [],
    gallery: [],
    reviews: [],
    contacts: { address: "", phone: "", email: "", vk: "", telegram: "", mapEmbed: "" }
  });

  const escapeHtml = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

  const slugify = (value) => String(value ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^\wа-яё-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  const normalizeImage = (value) => String(value ?? "")
    .replaceAll("&amp;", "&")
    .replace(/^http:\/\//i, "https://")
    .trim();

  const newId = (prefix) => {
    const random = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `${prefix}_${random}`;
  };

  const state = {
    data: emptyData(),
    applications: [],
    activeTab: "applications",
    serverCsrfToken: "",
    lastActivityAt: Date.now(),
    sessionTimer: null,
    activityHandler: null,
    toastTimer: null
  };

  const showToast = (message) => {
    const toast = byId("adminToast");
    if (!toast) {
      return;
    }
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
  };

  const fetchApi = async (path, options = {}) => {
    const method = String(options.method || "GET").toUpperCase();
    const headers = { ...(options.headers || {}) };
    if (options.body && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }
    if (state.serverCsrfToken && !["GET", "HEAD", "OPTIONS"].includes(method)) {
      headers["X-CSRF-Token"] = state.serverCsrfToken;
    }

    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      method,
      credentials: "include",
      headers
    });

    if (!response.ok) {
      let message = "Ошибка API";
      try {
        const payload = await response.json();
        message = payload?.error || message;
      } catch (_error) {
        // API may return an empty error response.
      }
      throw new Error(message);
    }
    if (response.status === 204) {
      return null;
    }
    return response.json();
  };

  const loadContent = async () => {
    const data = await fetchApi("/content");
    state.data = data && typeof data === "object" ? data : emptyData();
  };

  const normalizeApplication = (item) => ({
    id: String(item?.id || ""),
    createdAt: String(item?.createdAt || ""),
    processed: Boolean(item?.processed),
    source: String(item?.source || ""),
    courseTitle: String(item?.courseTitle || ""),
    fullName: String(item?.fullName || ""),
    phone: String(item?.phone || ""),
    format: String(item?.format || ""),
    comment: String(item?.comment || ""),
    consentPolicyVersion: String(item?.consentPolicyVersion || PRIVACY_POLICY_VERSION),
    consentAcceptedAt: String(item?.consentAcceptedAt || "")
  });

  const loadApplications = async () => {
    const items = await fetchApi("/applications");
    state.applications = (Array.isArray(items) ? items : [])
      .map(normalizeApplication)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
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
    const timestamp = Date.parse(state.data.meta?.updatedAt || "");
    if (label) {
      label.textContent = timestamp ? `Последнее сохранение: ${new Date(timestamp).toLocaleString("ru-RU")}` : "Данные загружены с сервера";
    }
  };

  const renderApplications = () => {
    const body = byId("applicationsTableBody");
    if (!state.applications.length) {
      body.innerHTML = `<tr><td colspan="8">Заявок пока нет.</td></tr>`;
      return;
    }
    body.innerHTML = state.applications.map((item) => `
      <tr>
        <td data-label="Дата">${escapeHtml(new Date(item.createdAt).toLocaleString("ru-RU"))}</td>
        <td data-label="Курс">${escapeHtml(item.courseTitle)}</td>
        <td data-label="ФИО">${escapeHtml(item.fullName)}</td>
        <td data-label="Телефон">${escapeHtml(item.phone)}</td>
        <td data-label="Формат">${escapeHtml(item.format)}</td>
        <td data-label="Комментарий">${escapeHtml(item.comment)}</td>
        <td data-label="Статус"><button class="status-pill ${item.processed ? "done" : "pending"}" data-toggle-processed="${escapeHtml(item.id)}" type="button">${item.processed ? "Обработана" : "Новая"}</button></td>
        <td data-label="Действие"><button class="admin-action-btn" data-delete-app="${escapeHtml(item.id)}" type="button">Удалить</button></td>
      </tr>
    `).join("");
  };

  const teacherOptions = (selectedId) => {
    const options = [`<option value="">Не выбран</option>`];
    (state.data.teachers || []).forEach((teacher) => {
      const selected = teacher.id === selectedId ? " selected" : "";
      options.push(`<option value="${escapeHtml(teacher.id)}"${selected}>${escapeHtml(teacher.name)}</option>`);
    });
    return options.join("");
  };

  const fillContentForm = () => {
    const form = byId("contentForm");
    const brand = state.data.brand || {};
    const about = state.data.about || {};
    const contacts = state.data.contacts || {};
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

  const renderAchievements = () => {
    byId("achievementsEditor").innerHTML = (state.data.achievements || []).map((item) => `
      <div class="collection-row" data-kind="achievement">
        <div class="collection-row-grid">
          <label>Заголовок<input data-field="title" type="text" value="${escapeHtml(item.title)}"></label>
          <label>Значение<input data-field="value" type="text" value="${escapeHtml(item.value)}"></label>
          <label>Описание<input data-field="description" type="text" value="${escapeHtml(item.description)}"></label>
        </div>
        <div class="collection-row-actions"><button class="btn-remove-row" data-remove-row type="button">Удалить</button></div>
      </div>
    `).join("");
  };

  const renderTeachers = () => {
    byId("teachersEditor").innerHTML = (state.data.teachers || []).map((teacher) => `
      <div class="collection-row" data-kind="teacher">
        <div class="collection-row-grid">
          <label>ID<input data-field="id" type="text" value="${escapeHtml(teacher.id)}"></label>
          <label>ФИО<input data-field="name" type="text" value="${escapeHtml(teacher.name)}"></label>
          <label>Роль<input data-field="role" type="text" value="${escapeHtml(teacher.role)}"></label>
        </div>
        <div class="collection-row-grid two">
          <label>Фото (URL)<input data-field="photo" type="url" value="${escapeHtml(teacher.photo)}"></label>
          <label>Описание<textarea data-field="bio" rows="3">${escapeHtml(teacher.bio)}</textarea></label>
        </div>
        <div class="collection-row-actions"><button class="btn-remove-row" data-remove-row type="button">Удалить</button></div>
      </div>
    `).join("");
  };

  const renderCourses = () => {
    byId("coursesEditor").innerHTML = (state.data.courses || []).map((course) => `
      <div class="collection-row" data-kind="course">
        <div class="collection-row-grid">
          <label>ID<input data-field="id" type="text" value="${escapeHtml(course.id)}"></label>
          <label>Название<input data-field="title" type="text" value="${escapeHtml(course.title)}"></label>
          <label>Возраст<input data-field="ageCategory" type="text" value="${escapeHtml(course.ageCategory || "12+")}"></label>
        </div>
        <div class="collection-row-grid">
          <label>Длительность<input data-field="duration" type="text" value="${escapeHtml(course.duration || "6 месяцев")}"></label>
          <label>Стоимость<input data-field="price" type="text" value="${escapeHtml(course.price || "")}"></label>
          <label>Форматы (через запятую)<input data-field="formats" type="text" value="${escapeHtml((course.formats || []).join(", "))}"></label>
          <label>Преподаватель<select data-field="teacherId">${teacherOptions(course.teacherId || "")}</select></label>
        </div>
        <div class="collection-row-grid two">
          <label>Краткое описание<textarea data-field="shortDescription" rows="3">${escapeHtml(course.shortDescription)}</textarea></label>
          <label>Подробное описание<textarea data-field="fullDescription" rows="4">${escapeHtml(course.fullDescription)}</textarea></label>
        </div>
        <label>Изображение курса (URL)<input data-field="image" type="url" value="${escapeHtml(course.image)}"></label>
        <div class="collection-row-actions"><button class="btn-remove-row" data-remove-row type="button">Удалить</button></div>
      </div>
    `).join("");
  };

  const renderGallery = () => {
    byId("galleryEditor").innerHTML = (state.data.gallery || []).map((item) => `
      <div class="collection-row" data-kind="gallery">
        <div class="collection-row-grid">
          <label>Фото (URL)<input data-field="image" type="url" value="${escapeHtml(item.image)}"></label>
          <label>Заголовок<input data-field="title" type="text" value="${escapeHtml(item.title)}"></label>
          <label>Подпись<input data-field="caption" type="text" value="${escapeHtml(item.caption)}"></label>
        </div>
        <label>Ссылка на пост/источник<input data-field="postUrl" type="url" value="${escapeHtml(item.postUrl)}"></label>
        <div class="collection-row-actions"><button class="btn-remove-row" data-remove-row type="button">Удалить</button></div>
      </div>
    `).join("");
  };

  const renderReviews = () => {
    byId("reviewsEditor").innerHTML = (state.data.reviews || []).map((review) => `
      <div class="collection-row" data-kind="review">
        <div class="collection-row-grid">
          <label>Автор<input data-field="author" type="text" value="${escapeHtml(review.author)}"></label>
          <label>Роль<input data-field="role" type="text" value="${escapeHtml(review.role)}"></label>
          <span></span>
        </div>
        <label>Текст отзыва<textarea data-field="text" rows="4">${escapeHtml(review.text)}</textarea></label>
        <div class="collection-row-actions"><button class="btn-remove-row" data-remove-row type="button">Удалить</button></div>
      </div>
    `).join("");
  };

  const renderPanels = () => {
    renderApplications();
    fillContentForm();
    renderAchievements();
    renderTeachers();
    renderCourses();
    renderGallery();
    renderReviews();
    updateLastUpdatedLabel();
  };

  const collectRows = (containerId, fields) => Array.from(byId(containerId).querySelectorAll(".collection-row")).map((row) => {
    const data = {};
    fields.forEach((field) => {
      const input = row.querySelector(`[data-field="${field}"]`);
      data[field] = input ? input.value.trim() : "";
    });
    return data;
  });

  const saveContent = async (message) => {
    state.data.meta = { ...(state.data.meta || {}), updatedAt: new Date().toISOString() };
    const saved = await fetchApi("/content", { method: "PUT", body: JSON.stringify(state.data) });
    state.data = saved;
    renderPanels();
    showToast(message);
  };

  const saveContentSafely = (message) => saveContent(message).catch((error) => {
    showToast(error?.message || "Не удалось сохранить изменения.");
  });

  const exportApplicationsCsv = () => {
    const rows = state.applications.map((item) => [
      new Date(item.createdAt).toLocaleString("ru-RU"),
      item.courseTitle,
      item.fullName,
      item.phone,
      item.format,
      item.comment,
      item.source,
      item.processed ? "Обработана" : "Новая",
      item.consentAcceptedAt ? new Date(item.consentAcceptedAt).toLocaleString("ru-RU") : "",
      item.consentPolicyVersion
    ]);
    const csv = [["Дата", "Курс", "ФИО", "Телефон", "Формат", "Комментарий", "Источник", "Статус", "Согласие", "Версия политики"], ...rows]
      .map((line) => line.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `pro_it_applications_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const closeAdmin = () => {
    byId("adminApp").hidden = true;
    byId("adminLoginWrap").hidden = false;
    if (state.sessionTimer) {
      clearInterval(state.sessionTimer);
      state.sessionTimer = null;
    }
    if (state.activityHandler) {
      window.removeEventListener("pointerdown", state.activityHandler);
      window.removeEventListener("keydown", state.activityHandler);
      state.activityHandler = null;
    }
  };

  const logout = async (message = "Сеанс завершён.") => {
    try {
      await fetchApi("/admin/logout", { method: "POST", body: "{}" });
    } catch (_error) {
      // The browser session is cleared on the server when the cookie expires.
    }
    state.serverCsrfToken = "";
    closeAdmin();
    showToast(message);
  };

  const startSessionWatcher = () => {
    state.lastActivityAt = Date.now();
    state.activityHandler = () => { state.lastActivityAt = Date.now(); };
    window.addEventListener("pointerdown", state.activityHandler, { passive: true });
    window.addEventListener("keydown", state.activityHandler);
    state.sessionTimer = setInterval(() => {
      if (Date.now() - state.lastActivityAt > 15 * 60 * 1000) {
        void logout("Сеанс завершён по таймауту.");
      }
    }, 30000);
  };

  const openAdmin = () => {
    byId("adminLoginWrap").hidden = true;
    byId("adminApp").hidden = false;
    renderPanels();
    setTab("applications");
    startSessionWatcher();
  };

  const setupAuth = async () => {
    const loginWrap = byId("adminLoginWrap");
    const appWrap = byId("adminApp");
    const form = byId("adminLoginForm");
    const password = byId("adminPasswordInput");
    const confirmation = byId("adminPasswordConfirmInput");
    const setupFields = byId("adminSetupFields");
    const hint = byId("adminLoginModeHint");
    const errorNode = byId("adminLoginError");
    const submit = byId("adminLoginSubmitBtn");

    closeAdmin();
    const status = await fetchApi("/admin/status");
    const refreshMode = () => {
      const firstRun = !status.configured;
      setupFields.hidden = !firstRun;
      confirmation.required = firstRun;
      hint.textContent = firstRun ? "Первый вход: создайте пароль администратора." : "Введите пароль для входа";
      submit.textContent = firstRun ? "Создать пароль и войти" : "Войти";
    };
    refreshMode();

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      errorNode.textContent = "";
      submit.disabled = true;
      const value = password.value;
      try {
        if (!status.configured) {
          if (value !== confirmation.value) {
            throw new Error("Пароль и подтверждение не совпадают.");
          }
          await fetchApi("/admin/setup", { method: "POST", body: JSON.stringify({ password: value }) });
          status.configured = true;
          refreshMode();
        }
        const sessionData = await fetchApi("/admin/login", { method: "POST", body: JSON.stringify({ password: value }) });
        state.serverCsrfToken = String(sessionData?.csrfToken || "");
        await Promise.all([loadApplications(), loadContent()]);
        form.reset();
        openAdmin();
        showToast("Вход выполнен.");
      } catch (loginError) {
        errorNode.textContent = loginError?.message || "Не удалось выполнить вход.";
      } finally {
        submit.disabled = false;
      }
    });

    byId("logoutBtn").addEventListener("click", () => { void logout(); });
    loginWrap.hidden = false;
    appWrap.hidden = true;
  };

  const bindEvents = () => {
    document.querySelectorAll(".admin-tab-btn").forEach((button) => {
      button.addEventListener("click", () => setTab(button.dataset.tab));
    });

    byId("applicationsTableBody").addEventListener("click", async (event) => {
      const toggle = event.target.closest("[data-toggle-processed]");
      if (toggle) {
        const item = state.applications.find((entry) => entry.id === toggle.dataset.toggleProcessed);
        if (!item) return;
        try {
          await fetchApi(`/applications/${encodeURIComponent(item.id)}/processed`, {
            method: "PATCH",
            body: JSON.stringify({ processed: !item.processed })
          });
          item.processed = !item.processed;
          renderApplications();
          showToast("Статус заявки обновлён.");
        } catch (error) {
          showToast(error?.message || "Не удалось обновить статус заявки.");
        }
        return;
      }

      const remove = event.target.closest("[data-delete-app]");
      if (!remove) return;
      try {
        await fetchApi(`/applications/${encodeURIComponent(remove.dataset.deleteApp)}`, { method: "DELETE" });
        state.applications = state.applications.filter((item) => item.id !== remove.dataset.deleteApp);
        renderApplications();
        showToast("Заявка удалена.");
      } catch (error) {
        showToast(error?.message || "Не удалось удалить заявку.");
      }
    });

    byId("exportApplicationsBtn").addEventListener("click", exportApplicationsCsv);
    byId("clearApplicationsBtn").addEventListener("click", async () => {
      if (!window.confirm("Удалить все заявки?")) return;
      try {
        await fetchApi("/applications", { method: "DELETE" });
        state.applications = [];
        renderApplications();
        showToast("Все заявки очищены.");
      } catch (error) {
        showToast(error?.message || "Не удалось очистить заявки.");
      }
    });

    byId("contentForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      state.data.brand = {
        ...state.data.brand,
        schoolName: form.schoolName.value.trim(),
        heroTitle: form.heroTitle.value.trim(),
        heroSubtitle: form.heroSubtitle.value.trim(),
        tagline: form.tagline.value.trim(),
        primaryCta: form.primaryCta.value.trim(),
        secondaryCta: form.secondaryCta.value.trim()
      };
      state.data.about = {
        ...state.data.about,
        lead: form.aboutLead.value.trim(),
        description: form.aboutDescription.value.trim(),
        points: form.aboutPoints.value.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)
      };
      state.data.contacts = {
        ...state.data.contacts,
        address: form.address.value.trim(),
        phone: form.phone.value.trim(),
        email: form.email.value.trim(),
        vk: form.vk.value.trim(),
        telegram: form.telegram.value.trim(),
        mapEmbed: form.mapEmbed.value.trim()
      };
      void saveContentSafely("Основной контент сохранён.");
    });

    ["achievementsEditor", "teachersEditor", "coursesEditor", "galleryEditor", "reviewsEditor"].forEach((id) => {
      byId(id).addEventListener("click", (event) => event.target.closest("[data-remove-row]")?.closest(".collection-row")?.remove());
    });

    byId("addAchievementBtn").addEventListener("click", () => {
      byId("achievementsEditor").insertAdjacentHTML("beforeend", `<div class="collection-row" data-kind="achievement"><div class="collection-row-grid"><label>Заголовок<input data-field="title" type="text"></label><label>Значение<input data-field="value" type="text"></label><label>Описание<input data-field="description" type="text"></label></div><div class="collection-row-actions"><button class="btn-remove-row" data-remove-row type="button">Удалить</button></div></div>`);
    });
    byId("saveAchievementsBtn").addEventListener("click", () => {
      state.data.achievements = collectRows("achievementsEditor", ["title", "value", "description"])
        .filter((item) => item.title || item.value || item.description);
      void saveContentSafely("Достижения сохранены.");
    });

    byId("addTeacherBtn").addEventListener("click", () => {
      byId("teachersEditor").insertAdjacentHTML("beforeend", `<div class="collection-row" data-kind="teacher"><div class="collection-row-grid"><label>ID<input data-field="id" type="text"></label><label>ФИО<input data-field="name" type="text"></label><label>Роль<input data-field="role" type="text"></label></div><div class="collection-row-grid two"><label>Фото (URL)<input data-field="photo" type="url"></label><label>Описание<textarea data-field="bio" rows="3"></textarea></label></div><div class="collection-row-actions"><button class="btn-remove-row" data-remove-row type="button">Удалить</button></div></div>`);
    });
    byId("saveTeachersBtn").addEventListener("click", () => {
      state.data.teachers = collectRows("teachersEditor", ["id", "name", "role", "photo", "bio"])
        .map((item) => ({ ...item, id: item.id || slugify(item.name) || newId("teacher"), photo: normalizeImage(item.photo) }))
        .filter((item) => item.name);
      renderCourses();
      void saveContentSafely("Преподаватели сохранены.");
    });

    byId("addCourseBtn").addEventListener("click", () => {
      byId("coursesEditor").insertAdjacentHTML("beforeend", `<div class="collection-row" data-kind="course"><div class="collection-row-grid"><label>ID<input data-field="id" type="text"></label><label>Название<input data-field="title" type="text"></label><label>Возраст<input data-field="ageCategory" type="text" value="12+"></label></div><div class="collection-row-grid"><label>Длительность<input data-field="duration" type="text" value="6 месяцев"></label><label>Стоимость<input data-field="price" type="text"></label><label>Форматы (через запятую)<input data-field="formats" type="text" value="очно"></label><label>Преподаватель<select data-field="teacherId">${teacherOptions("")}</select></label></div><div class="collection-row-grid two"><label>Краткое описание<textarea data-field="shortDescription" rows="3"></textarea></label><label>Подробное описание<textarea data-field="fullDescription" rows="4"></textarea></label></div><label>Изображение курса (URL)<input data-field="image" type="url"></label><div class="collection-row-actions"><button class="btn-remove-row" data-remove-row type="button">Удалить</button></div></div>`);
    });
    byId("saveCoursesBtn").addEventListener("click", () => {
      state.data.courses = collectRows("coursesEditor", ["id", "title", "ageCategory", "duration", "price", "formats", "teacherId", "shortDescription", "fullDescription", "image"])
        .map((item) => ({
          id: item.id || slugify(item.title) || newId("course"),
          title: item.title,
          ageCategory: item.ageCategory || "12+",
          shortDescription: item.shortDescription,
          fullDescription: item.fullDescription,
          duration: item.duration || "6 месяцев",
          price: item.price,
          formats: item.formats.split(",").map((value) => value.trim()).filter(Boolean),
          teacherId: item.teacherId,
          image: normalizeImage(item.image)
        }))
        .filter((item) => item.title);
      void saveContentSafely("Курсы сохранены.");
    });

    byId("addGalleryBtn").addEventListener("click", () => {
      byId("galleryEditor").insertAdjacentHTML("beforeend", `<div class="collection-row" data-kind="gallery"><div class="collection-row-grid"><label>Фото (URL)<input data-field="image" type="url"></label><label>Заголовок<input data-field="title" type="text"></label><label>Подпись<input data-field="caption" type="text"></label></div><label>Ссылка на пост/источник<input data-field="postUrl" type="url"></label><div class="collection-row-actions"><button class="btn-remove-row" data-remove-row type="button">Удалить</button></div></div>`);
    });
    byId("saveGalleryBtn").addEventListener("click", () => {
      state.data.gallery = collectRows("galleryEditor", ["image", "title", "caption", "postUrl"])
        .map((item) => ({ ...item, image: normalizeImage(item.image), postUrl: normalizeImage(item.postUrl) }))
        .filter((item) => item.image || item.postUrl);
      void saveContentSafely("Галерея сохранена.");
    });

    byId("addReviewBtn").addEventListener("click", () => {
      byId("reviewsEditor").insertAdjacentHTML("beforeend", `<div class="collection-row" data-kind="review"><div class="collection-row-grid"><label>Автор<input data-field="author" type="text"></label><label>Роль<input data-field="role" type="text"></label><span></span></div><label>Текст отзыва<textarea data-field="text" rows="4"></textarea></label><div class="collection-row-actions"><button class="btn-remove-row" data-remove-row type="button">Удалить</button></div></div>`);
    });
    byId("saveReviewsBtn").addEventListener("click", () => {
      state.data.reviews = collectRows("reviewsEditor", ["author", "role", "text"]).filter((item) => item.author || item.text);
      void saveContentSafely("Отзывы сохранены.");
    });

    byId("passwordForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector("button[type=submit]");
      if (form.newPassword.value !== form.confirmNewPassword.value) {
        showToast("Новый пароль и подтверждение не совпадают.");
        return;
      }
      button.disabled = true;
      try {
        const result = await fetchApi("/admin/change-password", {
          method: "POST",
          body: JSON.stringify({ currentPassword: form.currentPassword.value, newPassword: form.newPassword.value })
        });
        state.serverCsrfToken = String(result?.csrfToken || "");
        form.reset();
        showToast("Пароль обновлён.");
      } catch (error) {
        showToast(error?.message || "Не удалось обновить пароль.");
      } finally {
        button.disabled = false;
      }
    });
  };

  bindEvents();
  setupAuth().catch((error) => {
    byId("adminLoginError").textContent = error?.message || "Не удалось подключиться к серверу.";
  });
})();
