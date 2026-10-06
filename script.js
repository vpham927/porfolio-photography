const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

const galleryEl = document.getElementById("gallery");
const photoModal = document.getElementById("photo-modal");
const siteDeck = document.getElementById("site-deck");
const photoPane = document.getElementById("main");
const resumePane = document.getElementById("resume-pane");

const photoImage = document.getElementById("photo-image");
const photoTitle = document.getElementById("photo-title");
const photoDesc = document.getElementById("photo-desc");
const photoSpecs = document.getElementById("photo-specs");
const photoRecipe = document.getElementById("photo-recipe");
const recipeHeading = document.getElementById("recipe-heading");

let activePhotoIndex = 0;
let lastFocus = null;
let activeModal = null;

document.querySelectorAll(".js-year").forEach((el) => {
  el.textContent = String(new Date().getFullYear());
});

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

function photoTime(photo) {
  const time = Date.parse(photo?.date || "");
  return Number.isNaN(time) ? 0 : time;
}

const GALLERY = [...PHOTOGRAPHS].sort((a, b) => photoTime(b) - photoTime(a));

function renderGallery() {
  const fragment = document.createDocumentFragment();

  GALLERY.forEach((photo, index) => {
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
  const photo = GALLERY[index];
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
  const next = (activePhotoIndex + 1) % GALLERY.length;
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

  if (event.key === "Escape" && isResumeView()) {
    openPhotos();
  }
});

renderGallery();

function isResumeView() {
  return document.documentElement.dataset.view === "resume";
}

function setView(view) {
  document.documentElement.dataset.view = view;
  photoPane.inert = view === "resume";
  resumePane.inert = view !== "resume";
}

function scrollResumeTo(id, smooth = true) {
  const target = document.getElementById(id);
  if (!target) return;

  // Offset by the pane's top padding so the target clears the fixed site bar.
  const top =
    target.getBoundingClientRect().top -
    resumePane.getBoundingClientRect().top +
    resumePane.scrollTop -
    parseFloat(getComputedStyle(resumePane).paddingTop);

  resumePane.scrollTo({ top, behavior: smooth ? "smooth" : "auto" });
}

function openPhotos({ skipHistory = false, smooth = false } = {}) {
  setView("photos");
  photoPane.scrollTo({ top: 0, behavior: smooth ? "smooth" : "auto" });

  if (!skipHistory && location.hash) {
    history.pushState({ view: "photos" }, "", location.pathname + location.search);
  }
}

function openResume(id, { skipHistory = false, smooth = false } = {}) {
  setView("resume");
  scrollResumeTo(id, smooth);

  if (!skipHistory) {
    history.pushState({ view: "resume" }, "", `#${id}`);
  }
}

function syncViewFromHash() {
  const id = location.hash.replace("#", "");
  const target = id && document.getElementById(id);

  if (target && resumePane.contains(target)) {
    openResume(id, { skipHistory: true });
  } else {
    openPhotos({ skipHistory: true });
  }
}

document.querySelectorAll("[data-open-photos]").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    openPhotos({ smooth: !isResumeView() });
  });
});

document.querySelectorAll("[data-open-resume]").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    openResume(link.dataset.openResume, { smooth: isResumeView() });
  });
});

window.addEventListener("popstate", syncViewFromHash);
syncViewFromHash();
