(() => {
  const STORAGE_THEME = "proit_landing_theme_v1";
  const API_BASE = String(window.PRO_IT_API_BASE || "/api").replace(/\/$/, "");
  const PRIVACY_POLICY_VERSION = "2026-04-14";

  const byId = (id) => document.getElementById(id);

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

  const fetchApi = async (path, options = {}) => {
    const response = await fetch(`${API_BASE}${path}`, {
      credentials: "include",
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

  const loadSiteData = async () => {
    try {
      const data = await fetchApi("/content");
      return data && typeof data === "object" ? data : emptyData();
    } catch (error) {
      const response = await fetch("content.json", { cache: "no-store" });
      if (!response.ok) {
        throw error;
      }
      const fallback = await response.json();
      return fallback && typeof fallback === "object" ? fallback : emptyData();
    }
  };

  const state = {
    data: emptyData(),
    galleryPreviews: {},
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
        return vkThumb;
      }

    const noEmbedData = await fetchJsonWithTimeout(noEmbedUrl);
      const noEmbedThumb = normalizeImage(noEmbedData?.thumbnail_url || "");
      if (noEmbedThumb) {
        state.galleryPreviews[normalizedPostUrl] = noEmbedThumb;
        return noEmbedThumb;
      }

      state.galleryPreviews[normalizedPostUrl] = null;
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
        ? `<img class="teacher-photo" src="${escapeHtml(photo)}" data-fallback="${escapeHtml(fallback)}" alt="${escapeHtml(teacher.name)}" loading="lazy">`
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
    await fetchApi("/applications", {
      method: "POST",
      body: JSON.stringify(application)
    });
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
        website: String(formData.get("website") || "").trim(),
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
        website: String(formData.get("website") || "").trim(),
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
    document.querySelectorAll("img[data-fallback]").forEach((image) => {
      image.addEventListener("error", () => {
        const fallback = image.dataset.fallback;
        image.removeAttribute("data-fallback");
        image.src = fallback;
      }, { once: true });
    });
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
      navToggle.setAttribute("aria-label", isOpen ? "Закрыть меню" : "Открыть меню");
    });

    navLinks?.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        if (!navLinks.classList.contains("open")) {
          return;
        }
        navLinks.classList.remove("open");
        navToggle?.setAttribute("aria-expanded", "false");
        navToggle?.setAttribute("aria-label", "Открыть меню");
      });
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 1080 && navLinks?.classList.contains("open")) {
        navLinks.classList.remove("open");
        navToggle?.setAttribute("aria-expanded", "false");
        navToggle?.setAttribute("aria-label", "Открыть меню");
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
      if (event.key === STORAGE_THEME) {
        applyTheme(event.newValue === "dark" ? "dark" : "light");
      }
    });
  };

  const init = async () => {
    initTheme();
    bindEvents();
    try {
      state.data = await loadSiteData();
    } catch (_error) {
      showToast("Не удалось загрузить данные сайта.");
    }
    renderAll();
  };

  void init();
})();
