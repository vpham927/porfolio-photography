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

// Rows are matched against each photo's film simulation, in this order.
// Set `style` on a photo in gallery-data.js to place it in a row by title.
const STYLE_ROWS = [
  { title: "Warm Tones", match: /nostalgic|classic neg|pro neg|reala|astia/i },
  { title: "Classic Chrome", match: /classic chrome|eterna|bleach/i },
  { title: "Vivid", match: /velvia|provia/i },
  { title: "Monochrome / ACROS", match: /mono|acros|sepia/i },
];
const FALLBACK_ROW = "Natural";

function photoStyle(photo) {
  if (photo.style) return photo.style;
  const sim = photo.recipe?.["Film Sim"] || "";
  return STYLE_ROWS.find((row) => row.match.test(sim))?.title || FALLBACK_ROW;
}

function groupByStyle(photos) {
  const groups = new Map(
    [...STYLE_ROWS.map((row) => row.title), FALLBACK_ROW].map((title) => [title, []])
  );

  photos.forEach((photo) => {
    const style = photoStyle(photo);
    if (!groups.has(style)) groups.set(style, []);
    groups.get(style).push(photo);
  });

  return [...groups].filter(([, items]) => items.length > 0);
}

const STYLE_GROUPS = groupByStyle(
  [...PHOTOGRAPHS].sort((a, b) => photoTime(b) - photoTime(a))
);

// Flattened in row order so "Next Photo" walks the rows as they appear.
const GALLERY = STYLE_GROUPS.flatMap(([, items]) => items);

function createCard(photo, index, { clone = false } = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "gallery__item";
  button.style.aspectRatio = photo.aspect;
  button.dataset.index = String(index);

  if (clone) {
    button.tabIndex = -1;
    button.setAttribute("aria-hidden", "true");
    button.dataset.clone = "";
  } else {
    button.setAttribute("aria-label", `View ${photo.title}`);
  }

  const img = document.createElement("img");
  img.src = photo.image;
  img.alt = clone ? "" : photo.alt || photo.title;
  // Originals load up front so nothing pops in mid-scroll; clones reuse the
  // same (by then cached) thumbnails.
  img.loading = clone ? "lazy" : "eager";
  img.decoding = "async";

  button.appendChild(img);
  return button;
}

function renderGallery() {
  const fragment = document.createDocumentFragment();
  let offset = 0;

  STYLE_GROUPS.forEach(([title, items], rowIndex) => {
    const row = document.createElement("section");
    row.className = "style-row";
    if (rowIndex % 2 === 0) row.classList.add("style-row--reverse");
    row.setAttribute("aria-label", title);

    const heading = document.createElement("h2");
    heading.className = "style-row__title";
    heading.textContent = title;

    const viewport = document.createElement("div");
    viewport.className = "style-row__viewport";

    const track = document.createElement("div");
    track.className = "style-row__track";

    const start = offset;
    items.forEach((photo, i) => track.appendChild(createCard(photo, start + i)));
    offset += items.length;

    viewport.appendChild(track);
    row.append(heading, viewport);
    fragment.appendChild(row);
  });

  // Clones are added by the ResizeObserver below once the rows have a width.
  galleryEl.appendChild(fragment);
}

// The track holds one "set" of cards (the row's photos, repeated until it is
// at least as wide as the row) followed by an identical copy of that set. The
// keyframes slide the track by exactly -50%, so the copy lands where the
// original started and the loop has no visible seam.
function fillTracks() {
  galleryEl.querySelectorAll(".style-row__track").forEach((track) => {
    track.querySelectorAll("[data-clone]").forEach((el) => el.remove());

    const originals = [...track.children];
    const rowWidth = track.parentElement.clientWidth;
    // Cards are spaced with margin-right (not gap), so scrollWidth is the
    // exact width of one set and -50% is always a whole number of sets.
    const baseWidth = track.scrollWidth;
    const repeats = Math.max(1, Math.ceil(rowWidth / baseWidth));

    const copies = repeats * 2 - 1;
    for (let r = 0; r < copies; r++) {
      originals.forEach((card) => {
        const photo = GALLERY[Number(card.dataset.index)];
        track.appendChild(createCard(photo, Number(card.dataset.index), { clone: true }));
      });
    }
  });
}

let lastGalleryWidth = 0;
new ResizeObserver(([entry]) => {
  const width = Math.round(entry.contentRect.width);
  if (width === lastGalleryWidth) return;
  lastGalleryWidth = width;
  fillTracks();
}).observe(galleryEl);

// Touch devices have no hover, so hold the row still while it is being
// touched and for a moment afterwards.
const touchResume = new WeakMap();

galleryEl.addEventListener("pointerdown", (event) => {
  if (event.pointerType === "mouse") return;
  const row = event.target.closest(".style-row");
  if (!row) return;
  clearTimeout(touchResume.get(row));
  row.classList.add("is-paused");
});

["pointerup", "pointercancel"].forEach((type) => {
  galleryEl.addEventListener(type, (event) => {
    if (event.pointerType === "mouse") return;
    const row = event.target.closest(".style-row");
    if (!row) return;
    touchResume.set(
      row,
      setTimeout(() => row.classList.remove("is-paused"), 2500)
    );
  });
});

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
