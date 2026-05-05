(() => {
  const STORAGE_CONTENT = "proit_landing_content_v1";
  const STORAGE_APPLICATIONS_LEGACY = "proit_landing_applications_v1";
  const STORAGE_APPLICATIONS_SECURE = "proit_landing_applications_secure_v2";
  const STORAGE_ADMIN_AUTH = "proit_landing_admin_auth_v2";
  const STORAGE_GALLERY_PREVIEWS = "proit_landing_gallery_previews_v1";
  const STORAGE_THEME = "proit_landing_theme_v1";
  const API_BASE = "/api";
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

  const escapeHtml = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");

  const normalizeImage = (url) => String(url ?? "")
    .replaceAll("&amp;", "&")
    .replace(/^http:\/\//i, "https://")
    .trim();

  const sanitizePhone = (value) => String(value ?? "").replace(/[^\d+]/g, "");

  const hasMojibake = (value) => /(?:Р[\u0400-\u04FF]|С[\u0400-\u04FF]){4,}/.test(String(value ?? ""));

  const fallbackTeacherImage = (name) => {
    const initials = String(name ?? "PR")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join("");

    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 160'>
      <defs>
        <linearGradient id='g' x1='0' x2='1' y1='0' y2='1'>
          <stop offset='0%' stop-color='#dae6f6'/>
          <stop offset='100%' stop-color='#d6f2f1'/>
        </linearGradient>
      </defs>
      <rect width='160' height='160' rx='18' fill='url(#g)'/>
      <text x='50%' y='54%' text-anchor='middle' font-size='54' font-family='Consolas,monospace' fill='#3d659a' font-weight='700'>${initials || "PR"}</text>
    </svg>`;

    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  };

  const uid = (prefix = "id") => `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;

  const fetchApi = async (path, options = {}) => {
    const response = await fetch(`${API_BASE}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      },
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

  const buildDefaultData = () => {
    if (typeof window.PRO_IT_BUILD_DEFAULT_DATA === "function") {
      return window.PRO_IT_BUILD_DEFAULT_DATA();
    }
    return ({
    meta: {
      source: "vk.com/proittaganrog",
      updatedAt: new Date().toISOString()
    },
    brand: {
      schoolName: "Школа ПРО IT",
      heroTitle: "Школа ПРО IT Таганрог",
      heroSubtitle: "Проектная IT-школа на базе ИКТИБ ЮФУ для школьников от 12 лет и студентов СПО.",
      tagline: "Создадим крутой IT-проект вместе!",
      primaryCta: "Записаться на обучение",
      secondaryCta: "Смотреть курсы"
    },
    about: {
      lead: "Школа ПРО IT — это занятия по проектной деятельности для школьников и студентов СПО на базе ИКТИБ ЮФУ.",
      description: "С 2021 года школа помогает начинающим войти в IT с нуля: участники изучают инструменты разработки, собираются в команды и доводят идеи до реальных работающих проектов.",
      points: [
        "Очный и онлайн форматы обучения",
        "Практика с наставниками из ИКТИБ ЮФУ",
        "Командные и индивидуальные проекты",
        "Подготовка к защитам, олимпиадам и хакатонам",
        "Сертификат по итогам обучения"
      ]
    },
    enrollment: {
      ageInfo: "Для школьников 12+ и студентов СПО",
      duration: "6 месяцев",
      formats: "Очно и онлайн"
    },
    achievements: [
      {
        title: "Работаем с 2021 года",
        value: "4+ года",
        description: "Стабильные запуски потоков и интенсивов в Таганроге."
      },
      {
        title: "Участники школы",
        value: "200+",
        description: "Сотни учеников прошли обучение и защитили свои проекты."
      },
      {
        title: "Хакатоны",
        value: "Победы",
        description: "Преподаватели и ученики занимают призовые места в Cyber Garden и IT-Будущее."
      },
      {
        title: "Защиты проектов",
        value: "Регулярно",
        description: "Итоговые защиты с презентацией собственных IT-продуктов."
      }
    ],
    teachers: [
      {
        id: "zykova",
        name: "Алёна Владимировна Зыкова",
        role: "Руководитель Школы ПРО IT",
        bio: "Координирует образовательную программу и запуск потоков.",
        photo: ""
      },
      {
        id: "frolov",
        name: "Виталий Витальевич Фролов",
        role: "Преподаватель web-разработки",
        bio: "HTML/CSS/JS, React, командная разработка проектов.",
        photo: ""
      },
      {
        id: "surmeneva",
        name: "Ирина Андреевна Сурменева",
        role: "Преподаватель цифрового дизайна",
        bio: "Figma, UI/UX и визуальная упаковка цифровых продуктов.",
        photo: ""
      },
      {
        id: "lavrov",
        name: "Даниил Эдуардович Лавров",
        role: "Преподаватель направления ИИ",
        bio: "Python, нейросети и прикладные AI-проекты.",
        photo: ""
      },
      {
        id: "odintsov",
        name: "Дмитрий Максимович Одинцов",
        role: "Преподаватель направления ИИ",
        bio: "Практика по ML и проектной работе в командах.",
        photo: ""
      },
      {
        id: "placeholder-go",
        name: "Преподаватель GO (назначается)",
        role: "Направление Go",
        bio: "Заполните имя и фото в админ-панели.",
        photo: ""
      },
      {
        id: "placeholder-mobile",
        name: "Преподаватель Mobile (назначается)",
        role: "Мобильная разработка",
        bio: "Заполните имя и фото в админ-панели.",
        photo: ""
      }
    ],
    courses: [
      {
        id: "web",
        title: "web-разработка",
        ageCategory: "12+",
        shortDescription: "Создание современных сайтов и web-приложений.",
        fullDescription: "Курс по фронтенду и основам командной разработки. Ученики осваивают HTML, CSS, JavaScript, React, проектируют интерфейсы и доводят свои продукты до рабочей версии.",
        duration: "6 месяцев",
        formats: ["очно"],
        teacherId: "frolov",
        image: "",
        price: "20 000 ₽"
      },
      {
        id: "python",
        title: "python",
        ageCategory: "12+",
        shortDescription: "Универсальный старт в программировании на Python.",
        fullDescription: "От базового синтаксиса до решения прикладных задач: работа с данными, алгоритмы, автоматизация и подготовка к участию в олимпиадах и хакатонах.",
        duration: "6 месяцев",
        formats: ["очно"],
        teacherId: "lavrov",
        image: "",
        price: "20 000 ₽"
      },
      {
        id: "go",
        title: "Программирование на GO",
        ageCategory: "13+",
        shortDescription: "Системный подход и разработка быстрых серверных сервисов.",
        fullDescription: "Практический курс по Go: синтаксис, структуры данных, конкурентность, разработка API и командная проектная работа для понимания backend-подходов.",
        duration: "6 месяцев",
        formats: ["очно"],
        teacherId: "placeholder-go",
        image: "",
        price: "20 000 ₽"
      },
      {
        id: "mobile",
        title: "мобильная разработка",
        ageCategory: "13+",
        shortDescription: "Проектирование и создание мобильных приложений.",
        fullDescription: "Ученики изучают архитектуру мобильных приложений, интерфейсы, логику экранов и собирают MVP-приложения с защитой в конце обучения.",
        duration: "6 месяцев",
        formats: ["очно", "онлайн"],
        teacherId: "placeholder-mobile",
        image: "",
        price: "20 000 ₽"
      },
      {
        id: "design",
        title: "цифровой дизайн",
        ageCategory: "12+",
        shortDescription: "UX/UI-дизайн, Figma и визуальная коммуникация.",
        fullDescription: "На курсе формируется понимание пользовательского опыта, сеток, типографики, прототипирования и презентации дизайн-решений для реальных IT-проектов.",
        duration: "6 месяцев",
        formats: ["очно", "онлайн"],
        teacherId: "surmeneva",
        image: "",
        price: "20 000 ₽"
      },
      {
        id: "ai",
        title: "искуственный интеллект",
        ageCategory: "13+",
        shortDescription: "Нейросети, компьютерное зрение и AI-проекты.",
        fullDescription: "Участники проходят путь от Python-базы к нейросетевым моделям, обучению на данных и созданию прикладных решений с ИИ для защиты итоговых проектов.",
        duration: "6 месяцев",
        formats: ["очно", "онлайн"],
        teacherId: "odintsov",
        image: "",
        price: "20 000 ₽"
      }
    ],
    gallery: [
      {
        image: "",
        title: "Защита проектов",
        caption: "Итоговая презентация команд",
        postUrl: "https://vk.com/wall-225264273_71"
      },
      {
        image: "",
        title: "Командная работа",
        caption: "Выступления и обратная связь",
        postUrl: "https://vk.com/wall-225264273_73"
      },
      {
        image: "",
        title: "Старт интенсива",
        caption: "Первое занятие потока",
        postUrl: "https://vk.com/wall-225264273_85"
      },
      {
        image: "",
        title: "Финальные защиты",
        caption: "Проекты учеников летнего интенсива",
        postUrl: "https://vk.com/wall-225264273_93"
      },
      {
        image: "",
        title: "Набор в школу",
        caption: "Новый поток и направления",
        postUrl: "https://vk.com/wall-225264273_98"
      },
      {
        image: "",
        title: "Хакатон Cyber Garden",
        caption: "Победа преподавателей школы",
        postUrl: "https://vk.com/wall-225264273_109"
      }
    ],
    reviews: [
      {
        author: "Ученик, цифровой дизайн",
        role: "Отзыв после первого занятия",
        text: "Первое занятие очень понравилось: разобрали Figma, нашли идеи для проектов и начали делать собственные макеты."
      },
      {
        author: "Ученик, web-разработка",
        role: "Отзыв после старта курса",
        text: "Сделали рабочую страницу на HTML/CSS/JS. Было непросто, но преподаватель объяснял всё по шагам и помогал каждому."
      },
      {
        author: "Ученик, искусственный интеллект",
        role: "Отзыв о занятиях",
        text: "Понравилась атмосфера и подача материала: начали с Python, а дальше перешли к нейросетям и идеям итогового проекта."
      },
      {
        author: "Родитель участника",
        role: "Общее впечатление",
        text: "Ребёнок ходит с интересом, рассказывает о команде и своих задачах. Видно практический результат уже в процессе обучения."
      }
    ],
    contacts: {
      address: "Таганрог, ул. Энгельса, 1, ИТА ЮФУ, корпус «Г»",
      phone: "+7 (964) 908-77-60",
      email: "azykova@sfedu.ru",
      vk: "https://vk.com/proittaganrog",
      telegram: "https://t.me/school_pro_it",
      mapEmbed: "https://www.google.com/maps?q=%D0%A2%D0%B0%D0%B3%D0%B0%D0%BD%D1%80%D0%BE%D0%B3%2C%20%D1%83%D0%BB%D0%B8%D1%86%D0%B0%20%D0%AD%D0%BD%D0%B3%D0%B5%D0%BB%D1%8C%D1%81%D0%B0%2C%201&output=embed"
    }
  });
  };

  const loadSiteData = () => {
    const defaults = buildDefaultData();
    try {
      const raw = localStorage.getItem(STORAGE_CONTENT);
      if (!raw) {
        localStorage.setItem(STORAGE_CONTENT, JSON.stringify(defaults));
        return defaults;
      }
      if (hasMojibake(raw)) {
        localStorage.setItem(STORAGE_CONTENT, JSON.stringify(defaults));
        return defaults;
      }
      const saved = JSON.parse(raw);
      return mergeWithDefaults(defaults, saved);
    } catch (_error) {
      return defaults;
    }
  };

  const saveSiteData = (data) => {
    localStorage.setItem(STORAGE_CONTENT, JSON.stringify(data));
  };

  const loadLegacyApplications = () => {
    try {
      const raw = localStorage.getItem(STORAGE_APPLICATIONS_LEGACY);
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
      return [];
    }
  };

  const loadSecureApplications = () => {
    try {
      const raw = localStorage.getItem(STORAGE_APPLICATIONS_SECURE);
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
      return [];
    }
  };

  const saveSecureApplications = (list) => {
    localStorage.setItem(STORAGE_APPLICATIONS_SECURE, JSON.stringify(list));
  };

  const loadAuthBundle = () => {
    try {
      const raw = localStorage.getItem(STORAGE_ADMIN_AUTH);
      return raw ? JSON.parse(raw) : null;
    } catch (_error) {
      return null;
    }
  };

  const isStrongCryptoReady = () => Boolean(window.ProItSecurity?.supportsStrongCrypto);

  const cutoffTimestamp = () => Date.now() - (APPLICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const pruneEncryptedApplications = (entries) => {
    const cutoff = cutoffTimestamp();
    return entries.filter((entry) => {
      const createdAt = Date.parse(String(entry?.meta?.createdAt || ""));
      if (!Number.isFinite(createdAt)) {
        return true;
      }
      return createdAt >= cutoff;
    });
  };

  let cachedPublicKey = null;
  let cachedPublicKeyFingerprint = "";

  const getPublicKey = async () => {
    if (!isStrongCryptoReady()) {
      throw new Error("В браузере недоступны современные криптографические функции.");
    }
    const bundle = loadAuthBundle();
    if (!bundle) {
      throw new Error("Приём заявок временно недоступен: администратор ещё не завершил настройку безопасности.");
    }
    const fingerprint = JSON.stringify(bundle?.keys?.publicJwk || {});
    if (cachedPublicKey && fingerprint === cachedPublicKeyFingerprint) {
      return cachedPublicKey;
    }
    cachedPublicKey = await window.ProItSecurity.importPublicKey(bundle);
    cachedPublicKeyFingerprint = fingerprint;
    return cachedPublicKey;
  };

  const loadGalleryPreviews = () => {
    try {
      const raw = localStorage.getItem(STORAGE_GALLERY_PREVIEWS);
      if (!raw) {
        return {};
      }
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_error) {
      return {};
    }
  };

  const saveGalleryPreviews = (previews) => {
    localStorage.setItem(STORAGE_GALLERY_PREVIEWS, JSON.stringify(previews));
  };

  const state = {
    data: loadSiteData(),
    galleryPreviews: loadGalleryPreviews(),
    galleryHydrationInFlight: false,
    lastCourseCardTrigger: null,
    toastTimer: null
  };

  const getTeacherById = (teacherId) => state.data.teachers.find((teacher) => teacher.id === teacherId) || null;

  const applyTheme = (theme) => {
    const normalized = theme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = normalized;
    const isDark = normalized === "dark";

    const headerLogo = byId("headerYufuLogo");
    const footerLogo = byId("footerYufuLogo");
    [headerLogo, footerLogo].forEach((logo) => {
      if (!logo) {
        return;
      }
      const lightSrc = logo.dataset.logoLight;
      const darkSrc = logo.dataset.logoDark;
      logo.src = isDark ? (darkSrc || lightSrc || logo.src) : (lightSrc || logo.src);
    });

    const button = byId("themeToggle");
    if (button) {
      button.setAttribute("aria-pressed", String(isDark));
      button.setAttribute("title", isDark ? "Светлая тема" : "Тёмная тема");
    }
  };

  const initTheme = () => {
    const savedTheme = localStorage.getItem(STORAGE_THEME);
    if (savedTheme === "dark" || savedTheme === "light") {
      applyTheme(savedTheme);
      return;
    }
    const preferredDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    applyTheme(preferredDark ? "dark" : "light");
  };

  const fetchJsonWithTimeout = async (url, timeoutMs = 7000) => {
    const controller = new AbortController();
    const timerId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        return null;
      }
      return await response.json();
    } catch (_error) {
      return null;
    } finally {
      clearTimeout(timerId);
    }
  };

  const resolveVkPreviewByPostUrl = async (postUrl) => {
    const normalizedPostUrl = normalizeImage(postUrl);
    if (!normalizedPostUrl) {
      return "";
    }
    if (Object.prototype.hasOwnProperty.call(state.galleryPreviews, normalizedPostUrl)) {
      return normalizeImage(state.galleryPreviews[normalizedPostUrl] || "");
    }

    const vkOEmbedUrl = `https://vk.com/oembed.php?url=${encodeURIComponent(normalizedPostUrl)}&format=json`;
    const noEmbedUrl = `https://noembed.com/embed?url=${encodeURIComponent(normalizedPostUrl)}`;

    const vkData = await fetchJsonWithTimeout(vkOEmbedUrl);
    const vkThumb = normalizeImage(vkData?.thumbnail_url || "");
    if (vkThumb) {
      state.galleryPreviews[normalizedPostUrl] = vkThumb;
      saveGalleryPreviews(state.galleryPreviews);
      return vkThumb;
    }

    const noEmbedData = await fetchJsonWithTimeout(noEmbedUrl);
    const noEmbedThumb = normalizeImage(noEmbedData?.thumbnail_url || "");
    if (noEmbedThumb) {
      state.galleryPreviews[normalizedPostUrl] = noEmbedThumb;
      saveGalleryPreviews(state.galleryPreviews);
      return noEmbedThumb;
    }

    state.galleryPreviews[normalizedPostUrl] = null;
    saveGalleryPreviews(state.galleryPreviews);
    return "";
  };

  const hydrateGalleryPreviews = async () => {
    if (state.galleryHydrationInFlight) {
      return;
    }

    const pending = state.data.gallery.filter((item) => {
      const postUrl = normalizeImage(item.postUrl);
      const image = normalizeImage(item.image);
      return !image && postUrl && !Object.prototype.hasOwnProperty.call(state.galleryPreviews, postUrl);
    });

    if (!pending.length) {
      return;
    }

    state.galleryHydrationInFlight = true;
    try {
      const resolved = await Promise.all(pending.map((item) => resolveVkPreviewByPostUrl(item.postUrl)));
      if (resolved.some(Boolean)) {
        renderGallery();
      }
    } finally {
      state.galleryHydrationInFlight = false;
    }
  };

  const showToast = (message) => {
    const toast = byId("toast");
    if (!toast) {
      return;
    }
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
  };

  const renderHero = () => {
    const { brand, enrollment, courses } = state.data;
    const brandNameNode = byId("brandName");
    if (brandNameNode) {
      brandNameNode.textContent = brand.schoolName;
    }
    byId("heroTitle").textContent = brand.heroTitle;
    byId("heroSubtitle").textContent = brand.heroSubtitle;
    byId("heroPrimaryCta").textContent = brand.primaryCta;
    byId("heroSecondaryCta").textContent = brand.secondaryCta;

    const heroMeta = byId("heroMeta");
    const items = [enrollment.ageInfo, enrollment.duration, enrollment.formats];
    heroMeta.innerHTML = items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");

    const heroCode = byId("heroCode");
    heroCode.textContent = [
      "type ProITSchool = {",
      `  name: "${brand.schoolName}";`,
      "  city: \"Таганрог\";",
      "  base: \"ИКТИБ ЮФУ\";",
      `  tracks: ${courses.length};`,
      `  format: "${enrollment.formats}";`,
      "  entry: \"с нуля\";",
      "};",
      "",
      "const school: ProITSchool = initSchool();",
      "startProjectLearning(school);"
    ].join("\n");
  };

  const renderAbout = () => {
    const { about } = state.data;
    byId("aboutLead").textContent = about.lead;
    byId("aboutDescription").textContent = about.description;
    byId("aboutPoints").innerHTML = about.points.map((point) => `<li>${escapeHtml(point)}</li>`).join("");
  };

  const renderAchievements = () => {
    const container = byId("achievementsGrid");
    const { achievements } = state.data;

    if (!achievements.length) {
      container.innerHTML = "<div class='empty-block'>Добавьте достижения в админ-панели.</div>";
      return;
    }

    container.innerHTML = achievements.map((item) => `
      <article class="achievement-card reveal">
        <p class="achievement-value">${escapeHtml(item.value)}</p>
        <p class="achievement-title">${escapeHtml(item.title)}</p>
        <p class="achievement-desc">${escapeHtml(item.description)}</p>
      </article>
    `).join("");
  };

  const renderCourseSelect = () => {
    const select = byId("mainCourseSelect");
    select.innerHTML = state.data.courses.map((course) => `
      <option value="${escapeHtml(course.id)}">${escapeHtml(course.title)}</option>
    `).join("");
  };

  const renderCourses = () => {
    const container = byId("coursesGrid");
    const { courses } = state.data;

    if (!courses.length) {
      container.innerHTML = "<div class='empty-block'>Курсы не добавлены.</div>";
      return;
    }

    container.innerHTML = courses.map((course, index) => `
      <article class="course-card reveal">
        <span class="course-index">${String(index + 1).padStart(2, "0")}</span>
        <h3>${escapeHtml(course.title)}</h3>
        <p class="course-short">${escapeHtml(course.shortDescription)}</p>
        <div class="chip-line">
          <span class="chip">${escapeHtml(course.ageCategory)}</span>
          <span class="chip">${escapeHtml((course.formats || []).join(", "))}</span>
        </div>
        <button class="btn btn-ghost" type="button" data-open-course="${escapeHtml(course.id)}">Подробнее и запись</button>
      </article>
    `).join("");
  };

  const renderTeachers = () => {
    const container = byId("teachersGrid");
    const { teachers } = state.data;

    if (!teachers.length) {
      container.innerHTML = "<div class='empty-block'>Добавьте преподавателей в админ-панели.</div>";
      return;
    }

    container.innerHTML = teachers.map((teacher) => {
      const photo = normalizeImage(teacher.photo);
      const fallback = fallbackTeacherImage(teacher.name);
      const media = photo
        ? `<img class="teacher-photo" src="${escapeHtml(photo)}" alt="${escapeHtml(teacher.name)}" loading="lazy" onerror="this.onerror=null;this.src='${escapeHtml(fallback)}';">`
        : `<div class="teacher-fallback teacher-photo-slot">${escapeHtml((teacher.name || "ПР").split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "ПР")}</div>`;

      return `
        <article class="teacher-card reveal">
          ${media}
          <div class="teacher-content">
            <h3>${escapeHtml(teacher.name)}</h3>
            <p class="teacher-role">${escapeHtml(teacher.role)}</p>
            <p class="teacher-bio">${escapeHtml(teacher.bio)}</p>
          </div>
        </article>
      `;
    }).join("");
  };

  const renderGallery = () => {
    const container = byId("galleryGrid");
    const { gallery } = state.data;

    if (!gallery.length) {
      container.innerHTML = "<div class='empty-block'>Галерея пока не заполнена.</div>";
      return;
    }

    container.innerHTML = gallery.map((item) => {
      const explicitImage = normalizeImage(item.image);
      const postUrl = normalizeImage(item.postUrl);
      const previewImage = postUrl ? normalizeImage(state.galleryPreviews[postUrl] || "") : "";
      const finalImage = explicitImage || previewImage;
      const linkStart = item.postUrl ? `<a class="gallery-card reveal" href="${escapeHtml(item.postUrl)}" target="_blank" rel="noopener">` : "<article class='gallery-card reveal'>";
      const linkEnd = item.postUrl ? "</a>" : "</article>";
      const media = finalImage
        ? `<img src="${escapeHtml(finalImage)}" alt="${escapeHtml(item.title || "Фото школы")}" loading="lazy">`
        : `<div class="gallery-image-slot">Загрузка фото из VK...</div>`;
      return `
        ${linkStart}
          ${media}
          <div class="gallery-overlay">
            <p class="gallery-title">${escapeHtml(item.title || "Фото")}</p>
            <p class="gallery-caption">${escapeHtml(item.caption || "")}</p>
          </div>
        ${linkEnd}
      `;
    }).join("");

    hydrateGalleryPreviews();
  };

  const renderReviews = () => {
    const container = byId("reviewsGrid");
    const { reviews } = state.data;

    if (!reviews.length) {
      container.innerHTML = "<div class='empty-block'>Отзывы пока не добавлены.</div>";
      return;
    }

    container.innerHTML = reviews.map((review) => `
      <article class="review-card reveal">
        <p class="review-text">${escapeHtml(review.text)}</p>
        <p class="review-author">${escapeHtml(review.author)}</p>
        <p class="review-role">${escapeHtml(review.role)}</p>
      </article>
    `).join("");
  };

  const renderContacts = () => {
    const { brand, contacts } = state.data;

    byId("contactsSchoolName").textContent = brand.heroTitle;
    byId("contactAddress").textContent = contacts.address;
    byId("contactPhone").textContent = contacts.phone;
    byId("contactPhone").href = `tel:${sanitizePhone(contacts.phone)}`;
    byId("contactEmail").textContent = contacts.email;
    byId("contactEmail").href = `mailto:${contacts.email}`;
    byId("contactVk").href = contacts.vk;
    byId("contactTg").href = contacts.telegram;
    byId("mapFrame").src = contacts.mapEmbed;

  };

  const getCourseById = (courseId) => state.data.courses.find((course) => course.id === courseId) || null;

  const playCourseModalExpandAnimation = (sourceCard) => {
    const modal = byId("courseModal");
    const dialog = modal?.querySelector(".modal-dialog");
    const backdrop = modal?.querySelector(".modal-backdrop");
    if (!modal || !dialog || !backdrop || !sourceCard) {
      return;
    }

    const prefersReducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      return;
    }

    const sourceRect = sourceCard.getBoundingClientRect();
    const targetRect = dialog.getBoundingClientRect();
    if (!sourceRect.width || !sourceRect.height || !targetRect.width || !targetRect.height) {
      return;
    }

    const sourceCenterX = sourceRect.left + sourceRect.width / 2;
    const sourceCenterY = sourceRect.top + sourceRect.height / 2;
    const targetCenterX = targetRect.left + targetRect.width / 2;
    const targetCenterY = targetRect.top + targetRect.height / 2;

    const deltaX = sourceCenterX - targetCenterX;
    const deltaY = sourceCenterY - targetCenterY;
    const scaleX = Math.max(0.2, Math.min(1, sourceRect.width / targetRect.width));
    const scaleY = Math.max(0.2, Math.min(1, sourceRect.height / targetRect.height));

    dialog.getAnimations().forEach((animation) => animation.cancel());
    backdrop.getAnimations().forEach((animation) => animation.cancel());

    dialog.animate([
      {
        transform: `translate(${deltaX}px, ${deltaY}px) scale(${scaleX}, ${scaleY})`,
        opacity: 0.22
      },
      {
        transform: "translate(0px, 0px) scale(1, 1)",
        opacity: 1
      }
    ], {
      duration: 430,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      fill: "both"
    });

    backdrop.animate([
      { opacity: 0 },
      { opacity: 1 }
    ], {
      duration: 260,
      easing: "ease-out",
      fill: "both"
    });
  };

  const openCourseModal = (courseId, sourceCard = null) => {
    const course = getCourseById(courseId);
    if (!course) {
      return;
    }

    const teacher = getTeacherById(course.teacherId);
    byId("modalCourseId").value = course.id;
    byId("modalCourseTitle").textContent = course.title;
    byId("modalCourseDescription").textContent = course.fullDescription;
    byId("modalCourseAge").textContent = course.ageCategory || "12+";
    byId("modalCourseFormats").textContent = (course.formats || ["очно"]).join(", ");
    byId("modalCourseDuration").textContent = course.duration || "6 месяцев";
    byId("modalCoursePrice").textContent = course.price || "20 000 ₽";

    byId("modalTeacherName").textContent = teacher ? teacher.name : "Преподаватель назначается";
    byId("modalTeacherRole").textContent = teacher ? teacher.role : "Место для данных из админ-панели";

    const teacherPhoto = byId("modalTeacherPhoto");
    const modalFallback = fallbackTeacherImage(teacher ? teacher.name : "ПР");
    teacherPhoto.src = teacher && teacher.photo ? normalizeImage(teacher.photo) : modalFallback;
    teacherPhoto.alt = teacher ? teacher.name : "Фото преподавателя";
    teacherPhoto.onerror = () => {
      teacherPhoto.onerror = null;
      teacherPhoto.src = modalFallback;
    };

    const formatSelect = byId("modalFormatSelect");
    formatSelect.innerHTML = (course.formats || ["очно", "онлайн"])
      .map((format) => `<option value="${escapeHtml(format)}">${escapeHtml(format)}</option>`)
      .join("");

    byId("courseModal").hidden = false;
    document.body.classList.add("body-lock");

    requestAnimationFrame(() => {
      playCourseModalExpandAnimation(sourceCard || state.lastCourseCardTrigger);
    });
  };

  const closeCourseModal = () => {
    byId("courseModal").hidden = true;
    document.body.classList.remove("body-lock");
  };

  const addApplication = async (application) => {
    const entry = {
      id: uid("app"),
      createdAt: new Date().toISOString(),
      processed: false,
      ...application
    };
    await fetchApi("/applications", {
      method: "POST",
      body: JSON.stringify(entry)
    });
  };

  const migrateLegacyApplications = async () => {
    // Applications are stored in SQL via API now; legacy localStorage migration is disabled.
    return Promise.resolve();
  };

  const handleMainEnrollmentSubmit = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const course = getCourseById(formData.get("courseId"));

    if (!course) {
      showToast("Не удалось определить курс. Проверьте данные формы.");
      return;
    }

    if (formData.get("privacyConsent") !== "on") {
      showToast("Для отправки заявки необходимо согласие на обработку персональных данных.");
      return;
    }

    try {
      await addApplication({
        source: "main",
        courseId: course.id,
        courseTitle: course.title,
        fullName: String(formData.get("fullName") || "").trim(),
        phone: String(formData.get("phone") || "").trim(),
        format: String(formData.get("format") || "").trim(),
        comment: String(formData.get("comment") || "").trim(),
        consentPolicyVersion: PRIVACY_POLICY_VERSION,
        consentAcceptedAt: new Date().toISOString()
      });
      form.reset();
      renderCourseSelect();
      showToast("Заявка отправлена. Спасибо!");
    } catch (error) {
      showToast(error?.message || "Не удалось отправить заявку.");
    }
  };

  const handleCourseEnrollmentSubmit = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const course = getCourseById(formData.get("courseId"));

    if (!course) {
      showToast("Не удалось определить курс.");
      return;
    }

    if (formData.get("privacyConsent") !== "on") {
      showToast("Для отправки заявки необходимо согласие на обработку персональных данных.");
      return;
    }

    try {
      await addApplication({
        source: "course",
        courseId: course.id,
        courseTitle: course.title,
        fullName: String(formData.get("fullName") || "").trim(),
        phone: String(formData.get("phone") || "").trim(),
        format: String(formData.get("format") || "").trim(),
        comment: String(formData.get("comment") || "").trim(),
        consentPolicyVersion: PRIVACY_POLICY_VERSION,
        consentAcceptedAt: new Date().toISOString()
      });
      form.reset();
      closeCourseModal();
      showToast("Вы успешно записаны на курс.");
    } catch (error) {
      showToast(error?.message || "Не удалось отправить заявку.");
    }
  };

  let revealObserver = null;
  const activateReveal = () => {
    const nodes = Array.from(document.querySelectorAll(".reveal"));

    if (!("IntersectionObserver" in window)) {
      nodes.forEach((node) => node.classList.add("reveal-visible"));
      return;
    }

    if (!revealObserver) {
      revealObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("reveal-visible");
            revealObserver.unobserve(entry.target);
          }
        });
      }, { threshold: 0.15 });
    }

    nodes.forEach((node) => {
      if (!node.classList.contains("reveal-visible")) {
        revealObserver.observe(node);
      }
    });
  };

  const setupCarouselControls = () => {
    const mapping = {
      gallery: byId("galleryGrid"),
      reviews: byId("reviewsGrid")
    };

    document.querySelectorAll("[data-carousel-prev]").forEach((button) => {
      const key = button.dataset.carouselPrev;
      button.onclick = () => {
        const track = mapping[key];
        if (!track) {
          return;
        }
        const step = Math.max(320, Math.floor(track.clientWidth * 0.85));
        track.scrollBy({ left: -step, behavior: "smooth" });
      };
    });

    document.querySelectorAll("[data-carousel-next]").forEach((button) => {
      const key = button.dataset.carouselNext;
      button.onclick = () => {
        const track = mapping[key];
        if (!track) {
          return;
        }
        const step = Math.max(320, Math.floor(track.clientWidth * 0.85));
        track.scrollBy({ left: step, behavior: "smooth" });
      };
    });
  };

  const renderAll = () => {
    renderHero();
    renderAbout();
    renderAchievements();
    renderCourseSelect();
    renderCourses();
    renderTeachers();
    renderGallery();
    renderReviews();
    renderContacts();
    setupCarouselControls();
    activateReveal();
    saveSiteData(state.data);
  };

  const bindEvents = () => {
    const brandTrigger = byId("brandTrigger");
    const navToggle = byId("navToggle");
    const navLinks = byId("siteNav");
    let brandTapCount = 0;
    let brandTapTimer = null;

    brandTrigger?.addEventListener("click", (event) => {
      event.preventDefault();
      brandTapCount += 1;

      clearTimeout(brandTapTimer);
      brandTapTimer = setTimeout(() => {
        brandTapCount = 0;
      }, 2200);

      if (brandTapCount >= 7) {
        brandTapCount = 0;
        window.location.href = "admin.html";
      }
    });

    byId("themeToggle")?.addEventListener("click", () => {
      const current = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
      const next = current === "dark" ? "light" : "dark";
      localStorage.setItem(STORAGE_THEME, next);
      applyTheme(next);
    });

    navToggle?.addEventListener("click", () => {
      if (!navLinks) {
        return;
      }
      const isOpen = navLinks.classList.toggle("open");
      navToggle.setAttribute("aria-expanded", String(isOpen));
    });

    navLinks?.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        if (!navLinks.classList.contains("open")) {
          return;
        }
        navLinks.classList.remove("open");
        navToggle?.setAttribute("aria-expanded", "false");
      });
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 760 && navLinks?.classList.contains("open")) {
        navLinks.classList.remove("open");
        navToggle?.setAttribute("aria-expanded", "false");
      }
    });

    byId("mainEnrollmentForm").addEventListener("submit", handleMainEnrollmentSubmit);
    byId("courseEnrollmentForm").addEventListener("submit", handleCourseEnrollmentSubmit);

    byId("coursesGrid").addEventListener("click", (event) => {
      const button = event.target.closest("[data-open-course]");
      if (!button) {
        return;
      }
      state.lastCourseCardTrigger = button.closest(".course-card");
      openCourseModal(button.dataset.openCourse, state.lastCourseCardTrigger);
    });

    byId("courseModal").addEventListener("click", (event) => {
      if (event.target.closest("[data-close-modal]")) {
        closeCourseModal();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !byId("courseModal").hidden) {
        closeCourseModal();
      }
    });

    window.addEventListener("storage", (event) => {
      if (event.key === STORAGE_CONTENT) {
        state.data = loadSiteData();
        renderAll();
      }
      if (event.key === STORAGE_ADMIN_AUTH) {
        cachedPublicKey = null;
        cachedPublicKeyFingerprint = "";
      }
      if (event.key === STORAGE_THEME) {
        applyTheme(event.newValue === "dark" ? "dark" : "light");
      }
    });
  };

  const init = async () => {
    initTheme();
    renderAll();
    bindEvents();
    try {
      await migrateLegacyApplications();
    } catch (_error) {
      // Keep page functional even if secure migration cannot be completed now.
    }
  };

  void init();
})();
