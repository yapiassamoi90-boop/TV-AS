
const $ = selector => document.querySelector(selector);

const programs = [
  {
    id: "france24",
    name: "France 24 Français",
    category: "news",
    country: "France",
    url: "https://www.france24.com/fr/direct",
    type: "Site officiel"
  },
  {
    id: "unwebtv",
    name: "ONU Web TV",
    category: "news",
    country: "International",
    url: "https://webtv.un.org/en",
    type: "Site officiel"
  },
  {
    id: "nasa",
    name: "NASA+",
    category: "series",
    country: "États-Unis",
    url: "https://plus.nasa.gov/",
    type: "Streaming officiel"
  },
  {
    id: "fifa",
    name: "FIFA+",
    category: "sport",
    country: "International",
    url: "https://www.plus.fifa.com/",
    type: "Plateforme officielle"
  },
  {
    id: "archive",
    name: "Films du domaine public",
    category: "movies",
    country: "International",
    url: "https://archive.org/details/feature_films",
    type: "Catalogue public"
  }
];

let custom = JSON.parse(localStorage.getItem("tvmas_custom") || "[]");
let favorites = JSON.parse(localStorage.getItem("tvmas_favs") || "[]");
let downloads = JSON.parse(localStorage.getItem("tvmas_downloads") || "[]");
let category = "all";
let activeObjectUrl = null;

function allPrograms() {
  return [...programs, ...custom];
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#39;"
  })[char]);
}

function render() {
  const search = $("#searchInput").value.trim().toLowerCase();

  let list = allPrograms().filter(item => {
    const matchesCategory =
      category === "all" ||
      (category === "favorites" && favorites.includes(item.id)) ||
      (category === "downloads" && downloads.some(d => d.id === item.id)) ||
      item.category === category;

    return matchesCategory &&
      (item.name + " " + item.country).toLowerCase().includes(search);
  });

  if (category === "downloads") {
    list = downloads.filter(item =>
      (item.name + " " + item.country).toLowerCase().includes(search)
    );
  }

  $("#channelGrid").innerHTML = list.map(item => `
    <article class="card">
      <h3>${escapeHTML(item.name)}</h3>
      <p>${escapeHTML(item.country || "Source ajoutée")}</p>
      <button data-play="${escapeHTML(item.id)}">▶ Regarder</button>
      <button data-fav="${escapeHTML(item.id)}">
        ${favorites.includes(item.id) ? "♥" : "♡"}
      </button>
      ${item.downloadAllowed && item.url ?
        `<button data-download="${escapeHTML(item.id)}">↓ Télécharger</button>` : ""}
      ${category === "downloads" ?
        `<button data-delete="${escapeHTML(item.id)}">Supprimer</button>` : ""}
    </article>
  `).join("");

  $("#emptyState").hidden = list.length > 0;
}

function showPlayer(title, url, isDownloaded = false) {
  const video = $("#videoPlayer");

  if (activeObjectUrl) {
    URL.revokeObjectURL(activeObjectUrl);
    activeObjectUrl = null;
  }

  video.pause();
  video.removeAttribute("src");
  video.load();

  $("#playerTitle").textContent = title;
  $("#playerMessage").textContent = "";

  if (isDownloaded) {
    activeObjectUrl = URL.createObjectURL(url);
    video.src = activeObjectUrl;
    video.play().catch(() => {});
    $("#sourceLink").hidden = true;
  } else if (/\.(mp4|webm)(\?|$)/i.test(url)) {
    video.src = url;
    video.play().catch(() => {});
    $("#sourceLink").hidden = true;
  } else {
    $("#playerMessage").textContent =
      "Cette source doit être ouverte sur le site officiel.";
    $("#sourceLink").href = url;
    $("#sourceLink").hidden = false;
    window.open(url, "_blank", "noopener");
  }

  $("#playerSection").scrollIntoView({ behavior: "smooth" });
}

async function downloadProgram(item) {
  if (!item.downloadAllowed) {
    alert("Le téléchargement n'est pas autorisé pour ce programme.");
    return;
  }

  if (!/\.(mp4)(\?|$)/i.test(item.url)) {
    alert("Ce lien n'est pas un fichier MP4 direct. Le téléchargement intégré nécessite un fichier vidéo MP4 accessible.");
    return;
  }

  try {
    $("#playerMessage").textContent = "Téléchargement en cours...";
    const response = await fetch(item.url);

    if (!response.ok) throw new Error("Téléchargement impossible");

    const blob = await response.blob();

    if (!blob.type.startsWith("video/")) {
      throw new Error("Le lien ne renvoie pas une vidéo.");
    }

    const saved = {
      id: item.id,
      name: item.name,
      country: item.country,
      type: item.type,
      category: item.category,
      blob,
      savedAt: Date.now()
    };

    const db = await openDB();
    await saveToDB(db, saved);

    if (!downloads.some(d => d.id === item.id)) {
      downloads.push({
        id: item.id,
        name: item.name,
        country: item.country,
        category: item.category
      });
    }

    localStorage.setItem("tvmas_downloads", JSON.stringify(downloads));
    alert("Vidéo téléchargée avec succès !");
    render();
  } catch (error) {
    console.error(error);
    alert("Téléchargement impossible. Vérifie le lien et les autorisations du diffuseur.");
  }
}

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("TVMONDEAS_DB", 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("videos")) {
        db.createObjectStore("videos", { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function saveToDB(db, item) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("videos", "readwrite");
    tx.objectStore("videos").put(item);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

function getFromDB(id) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction("videos", "readonly");
    const request = tx.objectStore("videos").get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }));
}

function deleteFromDB(id) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction("videos", "readwrite");
    tx.objectStore("videos").delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  }));
}

$("#channelGrid").addEventListener("click", async event => {
  const play = event.target.closest("[data-play]");
  const fav = event.target.closest("[data-fav]");
  const dl = event.target.closest("[data-download]");
  const del = event.target.closest("[data-delete]");

  if (play) {
    const id = play.dataset.play;

    if (category === "downloads") {
      const saved = await getFromDB(id);
      if (saved) showPlayer(saved.name, saved.blob, true);
      else alert("Cette vidéo n'est plus disponible.");
    } else {
      const item = allPrograms().find(x => x.id === id);
      if (item) showPlayer(item.name, item.url);
    }
  }

  if (fav) {
    const id = fav.dataset.fav;
    favorites = favorites.includes(id)
      ? favorites.filter(x => x !== id)
      : [...favorites, id];

    localStorage.setItem("tvmas_favs", JSON.stringify(favorites));
    render();
  }

  if (dl) {
    const item = allPrograms().find(x => x.id === dl.dataset.download);
    if (item) downloadProgram(item);
  }

  if (del) {
    const id = del.dataset.delete;
    if (confirm("Supprimer cette vidéo téléchargée ?")) {
      await deleteFromDB(id);
      downloads = downloads.filter(x => x.id !== id);
      localStorage.setItem("tvmas_downloads", JSON.stringify(downloads));
      render();
    }
  }
});

document.querySelectorAll(".tabs button").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelector(".tabs .active")?.classList.remove("active");
    button.classList.add("active");
    category = button.dataset.category;
    render();
  });
});

$("#searchInput").addEventListener("input", render);

$("#exploreBtn").onclick = () =>
  $("#programmes").scrollIntoView({ behavior: "smooth" });

$("#addForm").addEventListener("submit", event => {
  event.preventDefault();

  const name = $("#newName").value.trim();
  const url = $("#newUrl").value.trim();

  try {
    if (!["https:", "http:"].includes(new URL(url).protocol)) {
      throw new Error();
    }
  } catch {
    alert("Entre un lien valide commençant par https://");
    return;
  }

  custom.push({
    id: "custom-" + Date.now(),
    name,
    category: $("#newCategory").value,
    country: "Ajout personnel",
    type: "Source ajoutée",
    url,
    downloadAllowed: $("#downloadAllowed").checked
  });

  localStorage.setItem("tvmas_custom", JSON.stringify(custom));
  event.target.reset();
  category = "all";
  render();
});

function updateConnection() {
  $("#connectionStatus").textContent = navigator.onLine
    ? "● Connecté — les programmes en ligne sont accessibles."
    : "● Hors connexion — consulte tes vidéos téléchargées.";
}

window.addEventListener("online", updateConnection);
window.addEventListener("offline", updateConnection);
updateConnection();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(console.error);
  });
}

let deferredPrompt;
window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  deferredPrompt = event;
  $("#installBtn").hidden = false;
});

$("#installBtn").addEventListener("click", async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  $("#installBtn").hidden = true;
});

render();
