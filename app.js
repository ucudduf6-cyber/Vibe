"use strict";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const STORAGE = {
  profile: "worker_profile_v1",
  posts: "worker_posts_v1",
  likes: "worker_likes_v1",
  accounts: "worker_demo_accounts_v1",
  session: "worker_demo_session_v1"
};

const defaultProfile = {
  name: "Гость",
  handle: "@worker",
  bio: "Расскажи немного о себе.",
  email: "",
  loggedIn: false
};

let profile = load(STORAGE.profile, defaultProfile);
let posts = load(STORAGE.posts, []);
let likes = load(STORAGE.likes, []);
let accounts = load(STORAGE.accounts, []);
let currentPage = "feed";
let authMode = "login";
let newestFirst = true;
let deferredInstallPrompt = null;
let activeSearch = "";

function load(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? structuredCloneSafe(fallback) : JSON.parse(value);
  } catch {
    return structuredCloneSafe(fallback);
  }
}

function structuredCloneSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    toast("Не удалось сохранить данные. Возможно, память браузера заполнена.");
    return false;
  }
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function initials(name) {
  return (String(name || "W").trim()[0] || "W").toUpperCase();
}

function toast(message) {
  const container = $("#toastContainer");
  if (!container) return;

  const element = document.createElement("div");
  element.className = "toast";
  element.textContent = message;
  container.appendChild(element);

  setTimeout(() => {
    element.style.opacity = "0";
    element.style.transform = "translateY(5px)";
    setTimeout(() => element.remove(), 220);
  }, 3000);
}

function formatDate(timestamp) {
  const date = new Date(timestamp);
  const difference = Date.now() - date.getTime();

  if (difference < 60_000) return "только что";
  if (difference < 3_600_000) return `${Math.floor(difference / 60_000)} мин. назад`;
  if (difference < 86_400_000) return `${Math.floor(difference / 3_600_000)} ч. назад`;

  return date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    year: date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined
  });
}

function updateProfileUI() {
  const name = profile.name || "Гость";
  const handle = profile.handle || "@worker";
  const bio = profile.bio || "Расскажи немного о себе.";
  const avatar = initials(name);

  $("#sidebarName").textContent = name;
  $("#sidebarHandle").textContent = handle;
  $("#sidebarAvatar").textContent = avatar;
  $("#topAvatar").textContent = avatar;
  $("#composerAvatar").textContent = avatar;
  $("#widgetAvatar").textContent = avatar;
  $("#widgetName").textContent = name;
  $("#widgetHandle").textContent = handle;
  $("#widgetBio").textContent = bio;

  $("#statPosts").textContent = posts.filter(post => post.authorHandle === handle).length;
  $("#logoutButton").classList.toggle("hidden", !profile.loggedIn);

  document.title = currentPage === "feed"
    ? "WORKER — общение без границ"
    : `${pageInfo[currentPage]?.title || "WORKER"} — WORKER`;
}

const pageInfo = {
  feed: {
    title: "Лента",
    subtitle: "Что происходит в твоём мире?",
    section: "Последние публикации"
  },
  messages: {
    title: "Сообщения",
    subtitle: "Пространство для общения.",
    section: "Твои сообщения"
  },
  search: {
    title: "Поиск",
    subtitle: "Находи интересные публикации и людей.",
    section: "Результаты поиска"
  },
  notifications: {
    title: "Уведомления",
    subtitle: "Всё важное в одном месте.",
    section: "Последние события"
  },
  profile: {
    title: "Мой профиль",
    subtitle: "Твоё пространство в WORKER.",
    section: "Мои публикации"
  }
};

function navigate(page) {
  if (!pageInfo[page]) page = "feed";
  currentPage = page;

  $$(".nav-item[data-page], .mobile-nav-item[data-page]").forEach(button => {
    button.classList.toggle("active", button.dataset.page === page);
  });

  $("#pageTitle").textContent = pageInfo[page].title;
  $("#pageSubtitle").textContent = pageInfo[page].subtitle;
  $("#feedSectionTitle").textContent = pageInfo[page].section;

  if (page === "profile") {
    $("#profileName").value = profile.name === "Гость" ? "" : profile.name;
    $("#profileBio").value = profile.bio || "";
  }

  renderPosts();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function extractTags(text) {
  return [...new Set((text.match(/#[\p{L}\p{N}_]+/gu) || []).map(tag => tag.slice(1)))];
}

function renderPosts() {
  const container = $("#postsContainer");
  const empty = $("#emptyState");
  let list = [...posts];

  if (currentPage === "profile") {
    list = list.filter(post => post.authorHandle === profile.handle);
  } else if (currentPage === "messages") {
    container.innerHTML = "";
    empty.classList.remove("hidden");
    $(".empty-icon", empty).textContent = "↗";
    $("h3", empty).textContent = "Личные сообщения появятся позже";
    $("p", empty).textContent = "Пока здесь доступна лента публикаций. Для настоящих чатов нужен сервер.";
    $("#emptyCreate").classList.add("hidden");
    return;
  } else if (currentPage === "notifications") {
    container.innerHTML = "";
    empty.classList.remove("hidden");
    $(".empty-icon", empty).textContent = "♧";
    $("h3", empty).textContent = "Пока нет уведомлений";
    $("p", empty).textContent = "Когда появится серверная система уведомлений, события будут отображаться здесь.";
    $("#emptyCreate").classList.add("hidden");
    return;
  } else if (currentPage === "search") {
    const query = activeSearch.trim().toLowerCase();
    list = query
      ? list.filter(post =>
          post.text.toLowerCase().includes(query) ||
          post.authorName.toLowerCase().includes(query) ||
          post.authorHandle.toLowerCase().includes(query) ||
          extractTags(post.text).some(tag => tag.toLowerCase().includes(query.replace(/^#/, "")))
        )
      : list;
  }

  if (newestFirst) list.sort((a, b) => b.createdAt - a.createdAt);
  else list.sort((a, b) => (b.likes || 0) - (a.likes || 0));

  container.innerHTML = "";

  if (!list.length) {
    empty.classList.remove("hidden");
    $(".empty-icon", empty).textContent = currentPage === "search" ? "⌕" : "✦";
    $("h3", empty).textContent = currentPage === "search" && activeSearch
      ? "Ничего не найдено"
      : "Пока здесь тихо";
    $("p", empty).textContent = currentPage === "search" && activeSearch
      ? "Попробуй изменить поисковый запрос."
      : "Создай первую публикацию и начни общение.";
    $("#emptyCreate").classList.remove("hidden");
    return;
  }

  empty.classList.add("hidden");

  list.forEach(post => {
    const liked = likes.includes(post.id);
    const card = document.createElement("article");
    card.className = "post-card";

    const tags = extractTags(post.text);
    const safeText = escapeHTML(post.text).replace(/(#[\p{L}\p{N}_]+)/gu, '<span class="post-tag">$1</span>');

    card.innerHTML = `
      <div class="post-header">
        <span class="avatar">${escapeHTML(initials(post.authorName))}</span>
        <div class="post-author">
          <strong>${escapeHTML(post.authorName)}</strong>
          <div class="post-meta">${escapeHTML(post.authorHandle)} · ${escapeHTML(formatDate(post.createdAt))}</div>
        </div>
        ${post.authorHandle === profile.handle ? `<button class="post-menu" data-delete="${escapeHTML(post.id)}" aria-label="Удалить публикацию">···</button>` : ""}
      </div>
      <div class="post-body">${safeText}</div>
      ${tags.length ? `<div>${tags.map(tag => `<button class="post-tag" data-tag="${escapeHTML(tag)}">#${escapeHTML(tag)}</button>`).join("")}</div>` : ""}
      <div class="post-actions">
        <button class="post-action ${liked ? "liked" : ""}" data-like="${escapeHTML(post.id)}">${liked ? "♥" : "♡"} <span>${post.likes || 0}</span></button>
        <button class="post-action" data-comment="${escapeHTML(post.id)}">▢ <span>Ответить</span></button>
        <button class="post-action share-action" data-share="${escapeHTML(post.id)}">↗ <span>Поделиться</span></button>
      </div>
    `;

    container.appendChild(card);
  });
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.remove("hidden");

  const field = $("textarea", modal) || $("input:not(.hidden)", modal);
  if (field) setTimeout(() => field.focus(), 50);
}

function closeModal(id) {
  document.getElementById(id)?.classList.add("hidden");
}

function openPostModal() {
  $("#postText").value = "";
  $("#charCount").textContent = "0 / 2000";
  openModal("postModal");
}

function createPost(text) {
  const content = String(text || "").trim();
  if (!content) {
    toast("Напиши что-нибудь перед публикацией.");
    return false;
  }

  if (content.length > 2000) {
    toast("Публикация слишком длинная.");
    return false;
  }

  const post = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    text: content,
    authorName: profile.name || "Гость",
    authorHandle: profile.handle || "@worker",
    createdAt: Date.now(),
    likes: 0
  };

  posts.unshift(post);
  if (!save(STORAGE.posts, posts)) {
    posts.shift();
    return false;
  }

  navigate("feed");
  toast("Публикация добавлена!");
  return true;
}

function setAuthMode(mode) {
  authMode = mode === "register" ? "register" : "login";

  $$(".auth-tab").forEach(tab => {
    tab.classList.toggle("active", tab.dataset.auth === authMode);
  });

  const isRegister = authMode === "register";
  $("#authTitle").textContent = isRegister ? "Создать аккаунт" : "Добро пожаловать";
  $("#authName").classList.toggle("hidden", !isRegister);
  $("#authNameLabel").classList.toggle("hidden", !isRegister);
  $("#authName").required = isRegister;
  $("#authPassword").autocomplete = isRegister ? "new-password" : "current-password";
  $(".auth-submit").textContent = isRegister ? "Зарегистрироваться ↗" : "Войти ↗";
}

function openAuth() {
  setAuthMode("login");
  $("#authForm").reset();
  openModal("authModal");
}

function handleAuth(event) {
  event.preventDefault();

  const email = $("#authEmail").value.trim().toLowerCase();
  const password = $("#authPassword").value;
  const name = $("#authName").value.trim();

  if (!email || password.length < 6) {
    toast("Проверь электронную почту и пароль.");
    return;
  }

  if (authMode === "register") {
    if (accounts.some(account => account.email === email)) {
      toast("Этот адрес уже зарегистрирован в деморежиме.");
      return;
    }

    const account = {
      email,
      // Только для локальной демонстрации. Не использовать реальные пароли.
      password,
      name: name || "Пользователь"
    };

    accounts.push(account);
    if (!save(STORAGE.accounts, accounts)) {
      accounts.pop();
      return;
    }

    profile = {
      name: account.name,
      handle: makeHandle(account.name, email),
      bio: "Расскажи немного о себе.",
      email,
      loggedIn: true
    };

    save(STORAGE.profile, profile);
    closeModal("authModal");
    updateProfileUI();
    renderPosts();
    toast("Демонстрационный аккаунт создан!");
    return;
  }

  const account = accounts.find(item => item.email === email && item.password === password);
  if (!account) {
    toast("Аккаунт не найден. Зарегистрируйся в деморежиме.");
    return;
  }

  profile = {
    name: account.name,
    handle: makeHandle(account.name, email),
    bio: "Расскажи немного о себе.",
    email,
    loggedIn: true
  };

  save(STORAGE.profile, profile);
  closeModal("authModal");
  updateProfileUI();
  renderPosts();
  toast("Ты вошёл в WORKER!");
}

function makeHandle(name, email) {
  const base = (name || email.split("@")[0])
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_]+/gu, "")
    .slice(0, 18) || "worker";
  return "@" + base;
}

function toggleLike(id) {
  const post = posts.find(item => item.id === id);
  if (!post) return;

  if (likes.includes(id)) {
    likes = likes.filter(item => item !== id);
    post.likes = Math.max(0, (post.likes || 0) - 1);
  } else {
    likes.push(id);
    post.likes = (post.likes || 0) + 1;
  }

  save(STORAGE.likes, likes);
  save(STORAGE.posts, posts);
  renderPosts();
}

async function sharePost(id) {
  const post = posts.find(item => item.id === id);
  if (!post) return;

  const shareData = {
    title: `Публикация ${post.authorName} — WORKER`,
    text: post.text,
    url: location.href
  };

  try {
    if (navigator.share) {
      await navigator.share(shareData);
    } else if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(`${post.text}\n\n${location.href}`);
      toast("Текст публикации скопирован.");
    } else {
      toast("Копирование недоступно в этом браузере.");
    }
  } catch (error) {
    if (error.name !== "AbortError") toast("Не удалось поделиться публикацией.");
  }
}

function deletePost(id) {
  const post = posts.find(item => item.id === id);
  if (!post || post.authorHandle !== profile.handle) return;

  if (!confirm("Удалить эту публикацию?")) return;

  posts = posts.filter(item => item.id !== id);
  likes = likes.filter(item => item !== id);
  save(STORAGE.posts, posts);
  save(STORAGE.likes, likes);
  updateProfileUI();
  renderPosts();
  toast("Публикация удалена.");
}

function search(query) {
  activeSearch = query;
  navigate("search");
}

function handleProfileSave(event) {
  event.preventDefault();

  const name = $("#profileName").value.trim();
  const bio = $("#profileBio").value.trim();

  if (!name) {
    toast("Укажи имя.");
    return;
  }

  const oldHandle = profile.handle;
  profile.name = name;
  profile.bio = bio || "Расскажи немного о себе.";
  profile.handle = profile.loggedIn
    ? makeHandle(name, profile.email || "worker@example.com")
    : "@worker";

  posts.forEach(post => {
    if (post.authorHandle === oldHandle) {
      post.authorHandle = profile.handle;
      post.authorName = profile.name;
    }
  });

  if (profile.loggedIn) {
    const account = accounts.find(item => item.email === profile.email);
    if (account) account.name = name;
    save(STORAGE.accounts, accounts);
  }

  save(STORAGE.profile, profile);
  save(STORAGE.posts, posts);
  closeModal("profileModal");
  updateProfileUI();
  renderPosts();
  toast("Профиль сохранён.");
}

function handleLogout() {
  if (!confirm("Выйти из аккаунта?")) return;

  profile = structuredCloneSafe(defaultProfile);
  save(STORAGE.profile, profile);
  closeModal("profileModal");
  updateProfileUI();
  navigate("feed");
  toast("Ты вышел из аккаунта.");
}

function registerEvents() {
  document.addEventListener("click", event => {
    const pageButton = event.target.closest("[data-page]");
    if (pageButton) {
      event.preventDefault();
      navigate(pageButton.dataset.page);
      return;
    }

    const closeButton = event.target.closest("[data-close]");
    if (closeButton) {
      closeModal(closeButton.dataset.close);
      return;
    }

    const tagButton = event.target.closest("[data-tag]");
    if (tagButton) {
      $("#globalSearch").value = tagButton.dataset.tag;
      search(tagButton.dataset.tag);
      return;
    }

    const likeButton = event.target.closest("[data-like]");
    if (likeButton) {
      toggleLike(likeButton.dataset.like);
      return;
    }

    const shareButton = event.target.closest("[data-share]");
    if (shareButton) {
      sharePost(shareButton.dataset.share);
      return;
    }

    const deleteButton = event.target.closest("[data-delete]");
    if (deleteButton) {
      deletePost(deleteButton.dataset.delete);
      return;
    }

    const commentButton = event.target.closest("[data-comment]");
    if (commentButton) {
      toast("Комментарии станут доступны после подключения сервера.");
      return;
    }

    const authTab = event.target.closest("[data-auth]");
    if (authTab) {
      setAuthMode(authTab.dataset.auth);
      return;
    }

    const trend = event.target.closest("[data-tag]");
    if (trend) {
      search(trend.dataset.tag);
    }
  });

  $("#headingCreate").addEventListener("click", openPostModal);
  $("#welcomeCreate").addEventListener("click", openPostModal);
  $("#composerOpen").addEventListener("click", openPostModal);
  $("#composerPublish").addEventListener("click", openPostModal);
  $("#mobileCreate").addEventListener("click", openPostModal);
  $("#infoCreate").addEventListener("click", openPostModal);
  $("#emptyCreate").addEventListener("click", openPostModal);

  $("#authSidebar").addEventListener("click", openAuth);
  $("#sidebarProfile").addEventListener("click", () => {
    if (profile.loggedIn) {
      $("#profileName").value = profile.name;
      $("#profileBio").value = profile.bio;
      openModal("profileModal");
    } else {
      openAuth();
    }
  });

  $("#profileForm").addEventListener("submit", handleProfileSave);
  $("#logoutButton").addEventListener("click", handleLogout);
  $("#authForm").addEventListener("submit", handleAuth);

  $("#postForm").addEventListener("submit", event => {
    event.preventDefault();
    if (createPost($("#postText").value)) closeModal("postModal");
  });

  $("#postText").addEventListener("input", () => {
    $("#charCount").textContent = `${$("#postText").value.length} / 2000`;
  });

  $("#globalSearch").addEventListener("keydown", event => {
    if (event.key === "Enter") search($("#globalSearch").value);
  });

  $("#globalSearch").addEventListener("search", () => {
    if (!$("#globalSearch").value) {
      activeSearch = "";
      if (currentPage === "search") renderPosts();
    }
  });

  $("#sortButton").addEventListener("click", () => {
    newestFirst = !newestFirst;
    $("#sortButton").textContent = newestFirst ? "Сначала новые ↓" : "Сначала популярные ↓";
    renderPosts();
  });

  $("#addEmoji").addEventListener("click", () => {
    const field = $("#postText");
    field.value += " 😊";
    field.dispatchEvent(new Event("input"));
    openModal("postModal");
    field.focus();
  });

  $("#addTag").addEventListener("click", () => {
    const field = $("#postText");
    field.value += `${field.value.trim() ? " " : ""}#`;
    field.dispatchEvent(new Event("input"));
    openModal("postModal");
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
  });

  $("#installButton").addEventListener("click", installApp);

  $$(".modal-overlay").forEach(overlay => {
    overlay.addEventListener("click", event => {
      if (event.target === overlay) closeModal(overlay.id);
    });
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      $$(".modal-overlay").forEach(modal => modal.classList.add("hidden"));
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      $("#globalSearch").focus();
    }
  });

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    $("#installButton").classList.remove("hidden");
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    toast("WORKER установлен!");
  });
}

async function installApp() {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    return;
  }

  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
    toast("В Safari нажми «Поделиться», затем «На экран Домой».");
  } else {
    toast("В меню браузера выбери «Установить приложение» или «Добавить на главный экран».");
  }
}

function seedPosts() {
  if (posts.length) return;

  posts = [
    {
      id: "welcome-worker",
      text: "Добро пожаловать в WORKER! ✨ Это пространство для общения, идей и новых знакомств. Создай свою первую публикацию и начни свою историю. #WORKER #Знакомства",
      authorName: "Команда WORKER",
      authorHandle: "@worker",
      createdAt: Date.now() - 120000,
      likes: 3
    },
    {
      id: "ideas-worker",
      text: "Большие перемены часто начинаются с маленькой идеи. Не бойся делиться тем, что тебя вдохновляет. 🚀 #Идеи #Жизнь",
      authorName: "Команда WORKER",
      authorHandle: "@worker",
      createdAt: Date.now() - 3600000,
      likes: 5
    }
  ];

  save(STORAGE.posts, posts);
}

function init() {
  if (!profile || typeof profile !== "object") {
    profile = structuredCloneSafe(defaultProfile);
  }

  if (!Array.isArray(posts)) posts = [];
  if (!Array.isArray(likes)) likes = [];
  if (!Array.isArray(accounts)) accounts = [];

  seedPosts();
  updateProfileUI();
  registerEvents();
  navigate("feed");

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("./sw.js")
      .then(() => console.log("WORKER: service worker зарегистрирован"))
      .catch(error => console.warn("WORKER: service worker не зарегистрирован", error));
  }
}

document.addEventListener("DOMContentLoaded", init);
