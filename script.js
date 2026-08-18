const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

const galleryEl = document.getElementById("gallery");
const photoModal = document.getElementById("photo-modal");
const siteDeck = document.getElementById("site-deck");
const yearEl = document.getElementById("year");
const homePane = document.getElementById("page");
const photoPane = document.getElementById("photographs");

const photoImage = document.getElementById("photo-image");
const photoTitle = document.getElementById("photo-title");
const photoDesc = document.getElementById("photo-desc");
const photoSpecs = document.getElementById("photo-specs");
const photoRecipe = document.getElementById("photo-recipe");
const recipeHeading = document.getElementById("recipe-heading");

let activePhotoIndex = 0;
let lastFocus = null;
let activeModal = null;

yearEl.textContent = String(new Date().getFullYear());

const themeToggle = document.getElementById("theme-toggle");
const themeToggleLabel = document.getElementById("theme-toggle-label");

function currentTheme() {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("theme", theme);

  const label = theme === "light" ? "Flash off" : "Flash on";
  themeToggleLabel.textContent = label;
  themeToggle.setAttribute("aria-label", label);
}

applyTheme(currentTheme());

themeToggle.addEventListener("click", () => {
  applyTheme(currentTheme() === "dark" ? "light" : "dark");
});

function renderGallery() {
  const fragment = document.createDocumentFragment();

  PHOTOGRAPHS.forEach((photo, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "gallery__item";
    button.style.aspectRatio = photo.aspect;
    button.dataset.index = String(index);
    button.setAttribute("aria-label", `View ${photo.title}`);

    const img = document.createElement("img");
    img.src = photo.image;
    img.alt = photo.alt || photo.title;
    img.loading = "lazy";
    img.decoding = "async";

    button.appendChild(img);
    fragment.appendChild(button);
  });

  galleryEl.appendChild(fragment);
}

function fillDefinitionList(listEl, entries) {
  listEl.replaceChildren();

  entries.forEach(([term, value]) => {
    const dt = document.createElement("dt");
    dt.textContent = term;
    const dd = document.createElement("dd");
    dd.textContent = value;
    listEl.append(dt, dd);
  });
}

function populatePhoto(index) {
  const photo = PHOTOGRAPHS[index];
  activePhotoIndex = index;

  photoImage.src = photo.imageHiRes;
  photoImage.alt = photo.alt || photo.title;
  photoTitle.textContent = photo.title;
  photoDesc.textContent = photo.description || "";
  photoDesc.hidden = !photo.description;
  recipeHeading.textContent = photo.recipeTitle || "None";

  const recipeEntries = Object.entries(photo.recipe || {});
  document.querySelector(".recipe").hidden = recipeEntries.length === 0;

  fillDefinitionList(photoSpecs, [
    ["Camera", photo.camera],
    ["Lens", photo.lens],
    ["ISO", photo.iso],
    ["Shutter Speed", photo.shutter],
    ["Aperture", photo.aperture],
  ]);

  fillDefinitionList(photoRecipe, recipeEntries);
}

function getFocusable(container) {
  return [...container.querySelectorAll(FOCUSABLE)].filter(
    (el) => el.getClientRects().length > 0
  );
}

function setPageInert(inert) {
  siteDeck.inert = inert;
  document.body.classList.toggle("modal-open", inert);
}

function openModal(modal, { restore } = {}) {
  lastFocus = restore || document.activeElement;
  activeModal = modal;
  modal.hidden = false;
  setPageInert(true);

  const focusTarget =
    modal.querySelector("[data-initial-focus]") ||
    getFocusable(modal)[0] ||
    modal;
  focusTarget.focus();
}

function closeModal(modal) {
  if (modal.hidden) return;

  modal.hidden = true;
  if (activeModal === modal) activeModal = null;
  setPageInert(false);

  if (lastFocus && typeof lastFocus.focus === "function") {
    lastFocus.focus();
  }
  lastFocus = null;
}

function openPhoto(index, trigger) {
  populatePhoto(index);
  openModal(photoModal, { restore: trigger });
}

function showNextPhoto() {
  const next = (activePhotoIndex + 1) % PHOTOGRAPHS.length;
  populatePhoto(next);
}

function trapFocus(event, modal) {
  if (event.key !== "Tab") return;

  const nodes = getFocusable(modal);
  if (nodes.length === 0) {
    event.preventDefault();
    return;
  }

  const first = nodes[0];
  const last = nodes[nodes.length - 1];

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

photoModal.querySelectorAll("[data-close-photo]").forEach((el) => {
  el.addEventListener("click", () => closeModal(photoModal));
});

document.getElementById("photo-back").addEventListener("click", () => {
  closeModal(photoModal);
});

document.getElementById("photo-next").addEventListener("click", showNextPhoto);

document.querySelector(".photo-modal__figure").addEventListener("click", (event) => {
  if (event.target === event.currentTarget) {
    closeModal(photoModal);
  }
});

galleryEl.addEventListener("click", (event) => {
  const item = event.target.closest(".gallery__item");
  if (!item) return;
  openPhoto(Number(item.dataset.index), item);
});

document.addEventListener("keydown", (event) => {
  if (activeModal) {
    if (event.key === "Escape") {
      closeModal(activeModal);
      return;
    }

    if (activeModal === photoModal && event.key === "ArrowRight") {
      showNextPhoto();
      return;
    }

    trapFocus(event, activeModal);
    return;
  }

  if (event.key === "Escape" && isPhotosView()) {
    openHome("top");
  }
});

renderGallery();

function isPhotosView() {
  return document.documentElement.dataset.view === "photos";
}

function scrollHomeTo(id, smooth = true) {
  const target = document.getElementById(id);
  if (!homePane || !target) return;

  const top =
    target.getBoundingClientRect().top -
    homePane.getBoundingClientRect().top +
    homePane.scrollTop;

  homePane.scrollTo({ top, behavior: smooth ? "smooth" : "auto" });
}

function openPhotos({ skipHistory = false } = {}) {
  document.documentElement.dataset.view = "photos";
  photoPane.scrollTo({ top: 0 });

  if (!skipHistory && location.hash !== "#photographs") {
    history.pushState({ view: "photos" }, "", "#photographs");
  }
}

function openHome(id, { skipHistory = false, smooth = false } = {}) {
  document.documentElement.dataset.view = "home";
  if (id) scrollHomeTo(id, smooth);

  if (!skipHistory) {
    history.pushState({ view: "home" }, "", id ? `#${id}` : "#top");
  }
}

function syncViewFromHash() {
  if (location.hash === "#photographs") {
    openPhotos({ skipHistory: true });
    return;
  }

  const id = location.hash.replace("#", "");
  openHome(id || "top", { skipHistory: true });
}

document.querySelectorAll("[data-open-photos]").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    openPhotos();
  });
});

document.querySelectorAll("[data-home-target]").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    openHome(link.dataset.homeTarget, { smooth: !isPhotosView() });
  });
});

document.querySelectorAll(".explore").forEach((link) => {
  link.addEventListener("click", (event) => {
    const id = link.getAttribute("href").replace("#", "");
    event.preventDefault();
    openHome(id, { smooth: true });
  });
});

window.addEventListener("popstate", syncViewFromHash);
syncViewFromHash();
