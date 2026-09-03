/* ==========================================================
   MAPA — app.js
   Leaflet + Nominatim + OSRM + Overpass + Wikipedia (fotos)
   ========================================================== */

// ---------- Estado global ----------
const state = {
  mode: 'search',           // search | directions | measure
  lastMarker: null,
  categoryLayer: null,
  routeLayer: null,
  routeMarkers: [],
  routeAlternatives: [],
  selectedAltIndex: 0,
  measurePoints: [],        // [{lat, lon, marker}]
  measureLine: null,
  measureLabels: [],
  originCoords: null,
  destCoords: null,
  stops: [],                // [{coords, el}]
  activeProfile: 'driving',
  history: JSON.parse(localStorage.getItem('map_history') || '[]'),
  favorites: JSON.parse(localStorage.getItem('map_favorites') || '[]'),
  cycleLayer: null,
  currentPlace: null
};

// ---------- Inicialización del mapa ----------
const map = L.map('map', { zoomControl: false }).setView([40.4168, -3.7038], 13);

L.control.zoom({ position: 'bottomright' }).addTo(map);

// ---------- Capas base (estándar / satélite / oscuro) ----------
const baseLayers = {
  standard: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }),
  satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics'
  }),
  dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
  })
};

let currentBaseLayer = 'standard';
baseLayers.standard.addTo(map);

function setBaseLayer(name) {
  if (name === currentBaseLayer) return;
  map.removeLayer(baseLayers[currentBaseLayer]);
  baseLayers[name].addTo(map);
  currentBaseLayer = name;
  document.body.classList.toggle('dark-mode', name === 'dark');

  document.querySelectorAll('.layer-option').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.layer === name);
  });
}

// ---------- Capa de carriles bici (tiles OSM Cyclosm, gratis) ----------
const cycleTileLayer = L.tileLayer('https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png', {
  maxZoom: 20,
  opacity: 0.75,
  attribution: '&copy; CyclOSM'
});

document.getElementById('cycle-layer-toggle').addEventListener('change', (e) => {
  if (e.target.checked) {
    cycleTileLayer.addTo(map);
  } else {
    map.removeLayer(cycleTileLayer);
  }
});

// ---------- Menú de capas ----------
const layersBtn = document.getElementById('layers-btn');
const layersMenu = document.getElementById('layers-menu');

layersBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  layersMenu.hidden = !layersMenu.hidden;
});

document.querySelectorAll('.layer-option').forEach(btn => {
  btn.addEventListener('click', () => setBaseLayer(btn.dataset.layer));
});

document.addEventListener('click', (e) => {
  if (!layersMenu.hidden && !e.target.closest('#layers-menu') && !e.target.closest('#layers-btn')) {
    layersMenu.hidden = true;
  }
});

// ---------- Cargar ubicación compartida por link (?lat=&lon=&z=) ----------
(function loadFromURL() {
  const params = new URLSearchParams(window.location.search);
  const lat = parseFloat(params.get('lat'));
  const lon = parseFloat(params.get('lon'));
  const zoom = parseInt(params.get('z')) || 16;
  const label = params.get('label');

  if (!isNaN(lat) && !isNaN(lon)) {
    map.setView([lat, lon], zoom);
    placeMarker(lat, lon, label || 'Ubicación compartida');
  }
})();

// ---------- Helpers generales ----------
function showToast(msg, duration = 2200) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { toast.hidden = true; }, duration);
}

function placeMarker(lat, lon, label) {
  if (state.lastMarker) map.removeLayer(state.lastMarker);
  state.lastMarker = L.marker([lat, lon]).addTo(map);
  if (label) state.lastMarker.bindPopup(label).openPopup();
  return state.lastMarker;
}

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(km) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(2)} km`;
}

function formatDuration(seconds) {
  const min = Math.round(seconds / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h} h ${m} min`;
}

/* ==========================================================
   TABS / MODOS
   ========================================================== */
const tabs = document.querySelectorAll('.tab');
const panels = {
  search: document.getElementById('panel-search'),
  directions: document.getElementById('panel-directions'),
  measure: document.getElementById('panel-measure'),
  place: document.getElementById('panel-place')
};

function setMode(mode) {
  state.mode = mode;
  tabs.forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
  Object.entries(panels).forEach(([key, panelEl]) => {
    panelEl.hidden = !(key === mode || (key === 'place' && false));
  });
  if (mode !== 'measure') {
    map.getContainer().style.cursor = '';
  } else {
    map.getContainer().style.cursor = 'crosshair';
  }
}

tabs.forEach(tab => {
  tab.addEventListener('click', () => setMode(tab.dataset.mode));
});

document.getElementById('menu-toggle').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('collapsed');
  setTimeout(() => map.invalidateSize(), 260);
});

/* ==========================================================
   HISTORIAL DE BÚSQUEDAS
   ========================================================== */
function saveHistory(entry) {
  state.history = state.history.filter(h => h.display_name !== entry.display_name);
  state.history.unshift(entry);
  state.history = state.history.slice(0, 8);
  localStorage.setItem('map_history', JSON.stringify(state.history));
  renderHistory();
}

function removeHistoryItem(index) {
  state.history.splice(index, 1);
  localStorage.setItem('map_history', JSON.stringify(state.history));
  renderHistory();
}

function renderHistory() {
  const section = document.getElementById('history-section');
  const list = document.getElementById('history-list');
  list.innerHTML = '';

  if (!state.history.length) {
    section.classList.remove('visible');
    return;
  }
  section.classList.add('visible');

  state.history.forEach((h, i) => {
    const li = el('li');
    const btn = el('button', 'list-item');
    btn.innerHTML = `
      <span class="list-icon">🕑</span>
      <span class="list-text">
        <span class="list-title">${h.display_name.split(',')[0]}</span>
        <span class="list-subtitle">${h.display_name.split(',').slice(1).join(',').trim()}</span>
      </span>
    `;
    const removeBtn = el('button', 'list-remove', '✕');
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeHistoryItem(i);
    });
    btn.appendChild(removeBtn);
    btn.addEventListener('click', () => openPlace(h));
    li.appendChild(btn);
    list.appendChild(li);
  });
}
renderHistory();

/* ==========================================================
   FAVORITOS
   ========================================================== */
function isFavorite(lat, lon) {
  return state.favorites.some(f => Math.abs(f.lat - lat) < 0.0001 && Math.abs(f.lon - lon) < 0.0001);
}

function toggleFavorite(place) {
  const { lat, lon } = place;
  if (isFavorite(lat, lon)) {
    state.favorites = state.favorites.filter(f => !(Math.abs(f.lat - lat) < 0.0001 && Math.abs(f.lon - lon) < 0.0001));
  } else {
    state.favorites.unshift({ lat, lon, name: place.name });
    state.favorites = state.favorites.slice(0, 20);
  }
  localStorage.setItem('map_favorites', JSON.stringify(state.favorites));
  renderFavorites();
  updateFavButton();
}

function updateFavButton() {
  const btn = document.getElementById('place-fav-btn');
  if (!state.currentPlace) return;
  btn.classList.toggle('active', isFavorite(state.currentPlace.lat, state.currentPlace.lon));
}

function renderFavorites() {
  const section = document.getElementById('favorites-section');
  const list = document.getElementById('favorites-list');
  list.innerHTML = '';

  if (!state.favorites.length) {
    section.classList.remove('visible');
    return;
  }
  section.classList.add('visible');

  state.favorites.forEach((f, i) => {
    const li = el('li');
    const btn = el('button', 'list-item');
    btn.innerHTML = `
      <span class="list-icon fav-star">⭐</span>
      <span class="list-text">
        <span class="list-title">${f.name}</span>
        <span class="list-subtitle">${f.lat.toFixed(4)}, ${f.lon.toFixed(4)}</span>
      </span>
    `;
    const removeBtn = el('button', 'list-remove', '✕');
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.favorites.splice(i, 1);
      localStorage.setItem('map_favorites', JSON.stringify(state.favorites));
      renderFavorites();
      updateFavButton();
    });
    btn.appendChild(removeBtn);
    btn.addEventListener('click', () => openPlace({ display_name: f.name, lat: f.lat, lon: f.lon }));
    li.appendChild(btn);
    list.appendChild(li);
  });
}
renderFavorites();

document.getElementById('place-fav-btn').addEventListener('click', () => {
  if (!state.currentPlace) return;
  toggleFavorite(state.currentPlace);
});

/* ==========================================================
   BÚSQUEDA (Nominatim) + resultados en sidebar
   ========================================================== */
const searchInput = document.getElementById('search-input');
const searchClear = document.getElementById('search-clear');
const resultsList = document.getElementById('results-list');

let searchDebounce = null;

searchInput.addEventListener('input', () => {
  const q = searchInput.value.trim();
  searchClear.hidden = !q;
  clearTimeout(searchDebounce);
  if (q.length < 3) {
    resultsList.innerHTML = '';
    return;
  }
  searchDebounce = setTimeout(() => runSearch(q), 400);
});

searchClear.addEventListener('click', () => {
  searchInput.value = '';
  searchClear.hidden = true;
  resultsList.innerHTML = '';
});

document.getElementById('search-form').addEventListener('submit', (e) => {
  e.preventDefault();
});

async function runSearch(query) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&addressdetails=1&extratags=1&limit=10`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'es' } });
    const data = await res.json();
    renderResults(data);
  } catch (err) {
    console.error(err);
    showToast('No se pudo buscar. Revisa tu conexión.');
  }
}

function categoryIcon(item) {
  const type = (item.type || '') + ' ' + (item.class || '');
  if (type.includes('restaurant')) return '🍽️';
  if (type.includes('fuel')) return '⛽';
  if (type.includes('pharmacy')) return '💊';
  if (type.includes('cafe')) return '☕';
  if (type.includes('supermarket')) return '🛒';
  if (type.includes('atm') || type.includes('bank')) return '🏧';
  if (type.includes('hotel')) return '🏨';
  return '📍';
}

function renderResults(results) {
  resultsList.innerHTML = '';
  document.getElementById('history-section').classList.toggle('visible', false);

  results.forEach(r => {
    const li = el('li');
    const btn = el('button', 'list-item');
    btn.innerHTML = `
      <span class="list-icon">${categoryIcon(r)}</span>
      <span class="list-text">
        <span class="list-title">${r.display_name.split(',')[0]}</span>
        <span class="list-subtitle">${r.display_name.split(',').slice(1, 3).join(',').trim()}</span>
      </span>
    `;
    btn.addEventListener('click', () => openPlace(r));
    li.appendChild(btn);
    resultsList.appendChild(li);
  });

  if (!results.length) {
    resultsList.innerHTML = '<li class="hint">Sin resultados.</li>';
  }
}

/* ==========================================================
   CATEGORÍAS CERCANAS (Overpass API)
   ========================================================== */
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    const alreadyActive = chip.classList.contains('active');
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    clearCategoryLayer();

    if (alreadyActive) return;

    chip.classList.add('active');
    searchNearbyCategory(chip.dataset.cat, chip.textContent.trim());
  });
});

function clearCategoryLayer() {
  if (state.categoryLayer) {
    map.removeLayer(state.categoryLayer);
    state.categoryLayer = null;
  }
}

async function searchNearbyCategory(cat, label) {
  const center = map.getCenter();
  const radius = 3000; // metros

  const tagMap = {
    restaurant: 'amenity=restaurant',
    fuel: 'amenity=fuel',
    pharmacy: 'amenity=pharmacy',
    cafe: 'amenity=cafe',
    supermarket: 'shop=supermarket',
    atm: 'amenity=atm'
  };

  const tag = tagMap[cat];
  const query = `
    [out:json][timeout:15];
    (
      node[${tag}](around:${radius},${center.lat},${center.lng});
    );
    out center 30;
  `;

  showToast(`Buscando ${label.replace(/^\S+\s/, '').toLowerCase()} cerca...`, 1500);
  resultsList.innerHTML = '';

  try {
    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      body: 'data=' + encodeURIComponent(query)
    });
    const data = await res.json();
    renderOverpassResults(data.elements, cat);
  } catch (err) {
    console.error(err);
    showToast('No se pudo consultar lugares cercanos.');
  }
}

function renderOverpassResults(elements, cat) {
  clearCategoryLayer();
  const icon = { restaurant: '🍽️', fuel: '⛽', pharmacy: '💊', cafe: '☕', supermarket: '🛒', atm: '🏧' }[cat] || '📍';

  const markers = [];
  resultsList.innerHTML = '';

  if (!elements.length) {
    resultsList.innerHTML = '<li class="hint">No se encontraron lugares cercanos.</li>';
    return;
  }

  elements.forEach(e => {
    const name = e.tags?.name || 'Sin nombre';
    const lat = e.lat, lon = e.lon;

    const marker = L.marker([lat, lon], {
      icon: L.divIcon({
        className: '',
        html: `<div style="background:#fff;border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.3);font-size:15px;">${icon}</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15]
      })
    }).bindPopup(name);
    markers.push(marker);

    const li = el('li');
    const btn = el('button', 'list-item');
    btn.innerHTML = `
      <span class="list-icon">${icon}</span>
      <span class="list-text">
        <span class="list-title">${name}</span>
        <span class="list-subtitle">${e.tags?.['addr:street'] || 'Ubicación cercana'}</span>
      </span>
    `;
    btn.addEventListener('click', () => {
      map.setView([lat, lon], 17);
      marker.openPopup();
      openPlace({
        display_name: name,
        lat, lon,
        type: cat
      });
    });
    li.appendChild(btn);
    resultsList.appendChild(li);
  });

  state.categoryLayer = L.layerGroup(markers).addTo(map);
}

/* ==========================================================
   PANEL DE LUGAR (detalle + fotos de Wikipedia/Wikimedia)
   ========================================================== */
async function openPlace(result) {
  const lat = parseFloat(result.lat);
  const lon = parseFloat(result.lon);
  const name = result.display_name.split(',')[0];
  const subtitle = result.display_name.split(',').slice(1).join(',').trim();

  map.setView([lat, lon], 17);
  placeMarker(lat, lon, name);

  saveHistory(result);

  document.getElementById('place-title').textContent = name;
  document.getElementById('place-subtitle').textContent = subtitle;
  document.getElementById('place-meta').innerHTML = `
    <div>📍 ${lat.toFixed(5)}, ${lon.toFixed(5)}</div>
  `;

  renderOpeningHours(result.extratags?.opening_hours);

  // Mostrar panel de lugar por encima del panel activo
  Object.values(panels).forEach(p => p.hidden = true);
  panels.place.hidden = false;

  state.currentPlace = { lat, lon, name };
  updateFavButton();

  loadPlacePhotos(name);
}

function renderOpeningHours(raw) {
  const hoursEl = document.getElementById('place-hours');
  if (!raw) {
    hoursEl.classList.remove('visible');
    hoursEl.innerHTML = '';
    return;
  }
  // Heurística simple: no interpretamos el horario completo (formato OSM
  // es complejo), solo mostramos el texto crudo con un icono de reloj.
  hoursEl.classList.add('visible');
  hoursEl.innerHTML = `🕐 <span>${raw}</span>`;
}

document.getElementById('place-back').addEventListener('click', () => {
  panels.place.hidden = true;
  setMode(state.mode);
});

function goToDirectionsFrom(profile) {
  if (!state.currentPlace) return;
  panels.place.hidden = true;
  setMode('directions');
  document.getElementById('dest-input').value = state.currentPlace.name;
  state.destCoords = { lat: state.currentPlace.lat, lon: state.currentPlace.lon };

  document.querySelectorAll('.profile-btn').forEach(b => b.classList.toggle('active', b.dataset.profile === profile));
  state.activeProfile = profile;

  maybeDrawRoute();
}

document.getElementById('place-walk-btn').addEventListener('click', () => goToDirectionsFrom('foot'));
document.getElementById('place-drive-btn').addEventListener('click', () => goToDirectionsFrom('driving'));

document.getElementById('place-share-btn').addEventListener('click', () => {
  if (!state.currentPlace) return;
  const { lat, lon, name } = state.currentPlace;
  const url = `${location.origin}${location.pathname}?lat=${lat}&lon=${lon}&z=17&label=${encodeURIComponent(name)}`;
  navigator.clipboard?.writeText(url).then(() => {
    showToast('Enlace copiado al portapapeles');
  }).catch(() => {
    prompt('Copia este enlace:', url);
  });
});

async function loadPlacePhotos(name) {
  const container = document.getElementById('place-photos');
  const extractEl = document.getElementById('place-extract');
  container.className = '';
  container.innerHTML = '<div class="hint" style="padding:12px 16px;">Buscando fotos...</div>';
  extractEl.classList.remove('visible');
  extractEl.innerHTML = '';

  try {
    // Buscar página de Wikipedia relacionada
    const searchUrl = `https://es.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(name)}&format=json&origin=*&srlimit=1`;
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();
    const page = searchData.query?.search?.[0];

    if (!page) {
      renderNoPhotos();
      return;
    }

    // Extracto de texto (resumen) de la página
    loadWikiExtract(page.title, extractEl);

    // Obtener imágenes de esa página vía Wikimedia REST (page media)
    const mediaUrl = `https://es.wikipedia.org/api/rest_v1/page/media-list/${encodeURIComponent(page.title)}`;
    const mediaRes = await fetch(mediaUrl);
    if (!mediaRes.ok) { renderNoPhotos(); return; }
    const mediaData = await mediaRes.json();

    const images = (mediaData.items || [])
      .filter(i => i.type === 'image' && i.srcset?.length)
      .slice(0, 8);

    if (!images.length) {
      renderNoPhotos();
      return;
    }

    container.innerHTML = '';
    images.forEach(img => {
      const src = 'https:' + (img.srcset[img.srcset.length - 1]?.src || img.srcset[0].src);
      const imgEl = document.createElement('img');
      imgEl.src = src;
      imgEl.loading = 'lazy';
      imgEl.alt = name;
      container.appendChild(imgEl);
    });
  } catch (err) {
    console.error(err);
    renderNoPhotos();
  }

  function renderNoPhotos() {
    container.className = 'empty';
    container.innerHTML = 'No hay fotos disponibles';
  }
}

async function loadWikiExtract(title, extractEl) {
  try {
    const url = `https://es.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&titles=${encodeURIComponent(title)}&format=json&origin=*`;
    const res = await fetch(url);
    const data = await res.json();
    const pages = data.query?.pages || {};
    const page = Object.values(pages)[0];
    const extract = page?.extract;

    if (extract) {
      extractEl.classList.add('visible');
      const short = extract.length > 400 ? extract.slice(0, 400).trim() + '…' : extract;
      extractEl.textContent = short;
    }
  } catch (err) {
    console.error(err);
  }
}

/* ==========================================================
   RUTAS (OSRM) — origen, destino, perfil, pasos
   ========================================================== */
const originInput = document.getElementById('origin-input');
const destInput = document.getElementById('dest-input');
const dirSuggestions = document.getElementById('directions-suggestions');

let activeDirField = null; // 'origin' | 'dest'
let dirDebounce = null;

[originInput, destInput].forEach((input, idx) => {
  input.addEventListener('input', () => {
    activeDirField = idx === 0 ? 'origin' : 'dest';
    clearTimeout(dirDebounce);
    const q = input.value.trim();
    if (q.length < 3) {
      dirSuggestions.hidden = true;
      return;
    }
    dirDebounce = setTimeout(() => searchDirSuggestions(q), 400);
  });
});

async function searchDirSuggestions(query) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'es' } });
    const data = await res.json();
    renderDirSuggestions(data);
  } catch (err) {
    console.error(err);
  }
}

function renderDirSuggestions(results) {
  dirSuggestions.innerHTML = '';
  if (!results.length) {
    dirSuggestions.hidden = true;
    return;
  }
  dirSuggestions.hidden = false;
  dirSuggestions.classList.add('visible');

  results.forEach(r => {
    const li = el('li');
    const btn = el('button', 'list-item');
    btn.innerHTML = `
      <span class="list-icon">📍</span>
      <span class="list-text">
        <span class="list-title">${r.display_name.split(',')[0]}</span>
        <span class="list-subtitle">${r.display_name.split(',').slice(1, 3).join(',').trim()}</span>
      </span>
    `;
    btn.addEventListener('click', () => {
      const coords = { lat: parseFloat(r.lat), lon: parseFloat(r.lon) };
      const placeName = r.display_name.split(',')[0];

      if (activeDirField === 'origin') {
        originInput.value = placeName;
        state.originCoords = coords;
      } else if (activeDirField === 'dest') {
        destInput.value = placeName;
        state.destCoords = coords;
      } else {
        // Es una parada intermedia
        const stop = state.stops.find(s => s.id === activeDirField);
        if (stop) {
          stop.input.value = placeName;
          stop.coords = coords;
        }
      }
      dirSuggestions.hidden = true;
      maybeDrawRoute();
    });
    li.appendChild(btn);
    dirSuggestions.appendChild(li);
  });
}

document.getElementById('swap-btn').addEventListener('click', () => {
  const tmpVal = originInput.value;
  originInput.value = destInput.value;
  destInput.value = tmpVal;

  const tmpCoords = state.originCoords;
  state.originCoords = state.destCoords;
  state.destCoords = tmpCoords;

  maybeDrawRoute();
});

/* ---- Paradas intermedias ---- */
const stopsContainer = document.getElementById('stops-container');

document.getElementById('add-stop-btn').addEventListener('click', () => {
  addStopField();
});

function addStopField() {
  const stopId = 'stop_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  const row = el('div', 'stop-row');
  row.dataset.stopId = stopId;
  row.innerHTML = `
    <span class="dot"></span>
    <input type="text" placeholder="Añadir parada" autocomplete="off" />
    <button class="stop-remove" aria-label="Quitar parada">✕</button>
  `;

  const input = row.querySelector('input');
  const removeBtn = row.querySelector('.stop-remove');

  let stopDebounce = null;
  input.addEventListener('input', () => {
    activeDirField = stopId;
    clearTimeout(stopDebounce);
    const q = input.value.trim();
    if (q.length < 3) { dirSuggestions.hidden = true; return; }
    stopDebounce = setTimeout(() => searchDirSuggestions(q), 400);
  });

  removeBtn.addEventListener('click', () => {
    state.stops = state.stops.filter(s => s.id !== stopId);
    row.remove();
    maybeDrawRoute();
  });

  stopsContainer.appendChild(row);
  state.stops.push({ id: stopId, coords: null, input, row });
  input.focus();
}

document.querySelectorAll('.profile-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.profile-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.activeProfile = btn.dataset.profile;
    maybeDrawRoute();
  });
});

function maybeDrawRoute() {
  if (state.originCoords && state.destCoords) {
    drawRoute(state.originCoords, state.destCoords, state.activeProfile);
  }
}

function getWaypoints() {
  const stopCoords = state.stops.filter(s => s.coords).map(s => s.coords);
  return [state.originCoords, ...stopCoords, state.destCoords];
}

async function drawRoute(origin, dest, profile, viaOverride) {
  clearRoute();
  showToast('Calculando ruta...', 1200);

  const profileMap = { driving: 'driving', cycling: 'cycling', foot: 'foot' };
  const p = profileMap[profile] || 'driving';

  const waypoints = viaOverride || getWaypoints();
  const coordStr = waypoints.map(w => `${w.lon},${w.lat}`).join(';');
  const hasStops = waypoints.length > 2;

  // Alternativas solo tienen sentido sin paradas intermedias (limitación de OSRM)
  const alternatives = !hasStops;

  const url = `https://router.project-osrm.org/route/v1/${p}/${coordStr}?overview=full&geometries=geojson&steps=true&alternatives=${alternatives}`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (!data.routes || !data.routes.length) {
      showToast('No se encontró una ruta.');
      return;
    }

    state.routeAlternatives = data.routes;
    state.selectedAltIndex = 0;
    state.currentWaypoints = waypoints;

    renderAlternatives(data.routes, alternatives);
    renderRoute(data.routes[0], waypoints);
  } catch (err) {
    console.error(err);
    showToast('No se pudo calcular la ruta.');
  }
}

function renderAlternatives(routes, show) {
  const container = document.getElementById('route-alternatives');
  container.innerHTML = '';

  if (!show || routes.length < 2) return;

  routes.forEach((route, i) => {
    const opt = el('div', 'alt-option' + (i === 0 ? ' selected' : ''));
    opt.innerHTML = `
      <span class="alt-time">${formatDuration(route.duration)}</span>
      <span class="alt-dist">${formatDistance(route.distance / 1000)}</span>
    `;
    opt.addEventListener('click', () => {
      state.selectedAltIndex = i;
      document.querySelectorAll('.alt-option').forEach((o, oi) => o.classList.toggle('selected', oi === i));
      renderRoute(routes[i], state.currentWaypoints);
    });
    container.appendChild(opt);
  });
}

function renderRoute(route, waypoints) {
  if (state.routeLayer) map.removeLayer(state.routeLayer);
  state.routeMarkers.forEach(m => map.removeLayer(m));
  state.routeMarkers = [];

  const coords = route.geometry.coordinates.map(c => [c[1], c[0]]);

  const line = L.polyline(coords, { color: '#1a73e8', weight: 6, opacity: 0.85 });
  state.routeLayer = line.addTo(map);

  // Habilitar arrastre del trazado para forzar un camino distinto
  enableRouteDragging(line, waypoints);

  waypoints.forEach((wp, i) => {
    const isOrigin = i === 0;
    const isDest = i === waypoints.length - 1;
    const color = isOrigin ? '#1a73e8' : isDest ? '#d93025' : '#5f6368';
    const marker = L.marker([wp.lat, wp.lon], {
      icon: L.divIcon({
        className: '',
        html: `<div style="background:${color};color:#fff;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;box-shadow:0 2px 6px rgba(0,0,0,0.3);border:2px solid #fff;">${isOrigin ? 'A' : isDest ? 'B' : i}</div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11]
      })
    }).addTo(map);
    state.routeMarkers.push(marker);
  });

  map.fitBounds(L.latLngBounds(coords), { padding: [40, 40] });

  renderRouteSummary(route);
  document.getElementById('export-gpx-btn').hidden = false;
  document.getElementById('drag-hint').hidden = false;
}

// Arrastrar la línea de la ruta inserta un punto intermedio ahí y
// recalcula usando ese punto como parada forzada.
function enableRouteDragging(line, waypoints) {
  let dragging = false;

  // Quitar handlers de un arrastre anterior antes de registrar los nuevos,
  // así evitamos acumular listeners cada vez que se recalcula la ruta.
  map.off('mouseup', map._routeDragHandler);

  line.on('mousedown', (e) => {
    dragging = true;
    map.dragging.disable();
    L.DomEvent.stopPropagation(e);
  });

  map._routeDragHandler = async (e) => {
    if (!dragging) return;
    dragging = false;
    map.dragging.enable();

    // Insertar el punto soltado como parada nueva entre origen y destino
    const dropPoint = { lat: e.latlng.lat, lon: e.latlng.lng };
    const newWaypoints = [waypoints[0], dropPoint, waypoints[waypoints.length - 1]];

    showToast('Recalculando con el nuevo punto...', 1200);
    await drawRoute(waypoints[0], waypoints[waypoints.length - 1], state.activeProfile, newWaypoints);
  };

  map.on('mouseup', map._routeDragHandler);
}

function clearRoute() {
  if (state.routeLayer) {
    map.removeLayer(state.routeLayer);
    state.routeLayer = null;
  }
  state.routeMarkers.forEach(m => map.removeLayer(m));
  state.routeMarkers = [];
  document.getElementById('route-alternatives').innerHTML = '';
  document.getElementById('export-gpx-btn').hidden = true;
  document.getElementById('drag-hint').hidden = true;
}

function renderRouteSummary(route) {
  const summary = document.getElementById('route-summary');
  summary.hidden = false;
  summary.innerHTML = `
    <div class="summary-time">${formatDuration(route.duration)}</div>
    <div class="summary-dist">${formatDistance(route.distance / 1000)}</div>
  `;

  const stepsList = document.getElementById('route-steps');
  stepsList.innerHTML = '';

  const allSteps = (route.legs || []).flatMap(leg => leg.steps || []);
  allSteps.forEach((step, i) => {
    const li = el('li');
    const instruction = describeStep(step);
    li.innerHTML = `
      <span class="step-num">${i + 1}</span>
      <span>
        ${instruction}
        <div class="step-dist">${formatDistance(step.distance / 1000)}</div>
      </span>
    `;
    stepsList.appendChild(li);
  });

  state.currentRoute = route;
}

/* ---- Exportar ruta como GPX ---- */
document.getElementById('export-gpx-btn').addEventListener('click', () => {
  if (!state.currentRoute) return;
  const coords = state.currentRoute.geometry.coordinates; // [lon, lat]
  const gpx = buildGPX(coords, 'Ruta');
  downloadFile('ruta.gpx', gpx);
});

function buildGPX(lonLatPairs, name) {
  const points = lonLatPairs.map(([lon, lat]) => `      <trkpt lat="${lat}" lon="${lon}"></trkpt>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Mapa" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${name}</name>
    <trkseg>
${points}
    </trkseg>
  </trk>
</gpx>`;
}

function downloadFile(filename, content) {
  const blob = new Blob([content], { type: 'application/gpx+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function describeStep(step) {
  const type = step.maneuver?.type;
  const modifier = step.maneuver?.modifier;
  const name = step.name || 'la vía';

  const typeMap = {
    depart: `Sal por ${name}`,
    arrive: 'Llega a tu destino',
    turn: `Gira${modifier ? ' ' + translateModifier(modifier) : ''} hacia ${name}`,
    'new name': `Continúa por ${name}`,
    continue: `Continúa por ${name}`,
    merge: `Incorpórate a ${name}`,
    'on ramp': `Toma la rampa hacia ${name}`,
    'off ramp': `Sal hacia ${name}`,
    fork: `Mantente${modifier ? ' ' + translateModifier(modifier) : ''} en ${name}`,
    roundabout: `Toma la rotonda hacia ${name}`,
    rotary: `Toma la rotonda hacia ${name}`
  };

  return typeMap[type] || `Continúa por ${name}`;
}

function translateModifier(mod) {
  const map = {
    left: 'a la izquierda',
    right: 'a la derecha',
    'slight left': 'ligeramente a la izquierda',
    'slight right': 'ligeramente a la derecha',
    'sharp left': 'bruscamente a la izquierda',
    'sharp right': 'bruscamente a la derecha',
    straight: 'recto',
    uturn: 'en U'
  };
  return map[mod] || mod;
}

/* ==========================================================
   MEDIR DISTANCIA (clics en el mapa)
   ========================================================== */
map.on('click', (e) => {
  if (state.mode !== 'measure') return;
  addMeasurePoint(e.latlng.lat, e.latlng.lng);
});

function addMeasurePoint(lat, lon) {
  const index = state.measurePoints.length;
  const marker = L.marker([lat, lon], {
    icon: L.divIcon({
      className: '',
      html: `<div style="background:#1a73e8;color:#fff;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;box-shadow:0 2px 6px rgba(0,0,0,0.3);">${index + 1}</div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    })
  }).addTo(map);

  state.measurePoints.push({ lat, lon, marker });
  redrawMeasure();
}

function redrawMeasure() {
  if (state.measureLine) map.removeLayer(state.measureLine);
  state.measureLabels.forEach(l => map.removeLayer(l));
  state.measureLabels = [];

  const latlngs = state.measurePoints.map(p => [p.lat, p.lon]);

  if (latlngs.length >= 2) {
    state.measureLine = L.polyline(latlngs, { color: '#d93025', weight: 4, dashArray: '8 6' }).addTo(map);
  }

  let total = 0;
  for (let i = 1; i < state.measurePoints.length; i++) {
    const a = state.measurePoints[i - 1];
    const b = state.measurePoints[i];
    const d = haversine(a.lat, a.lon, b.lat, b.lon);
    total += d;

    const midLat = (a.lat + b.lat) / 2;
    const midLon = (a.lon + b.lon) / 2;
    const label = L.marker([midLat, midLon], {
      icon: L.divIcon({
        className: 'measure-label',
        html: formatDistance(d),
        iconSize: null
      })
    }).addTo(map);
    state.measureLabels.push(label);
  }

  const totalEl = document.getElementById('measure-total');
  if (total > 0) {
    totalEl.classList.add('visible');
    totalEl.textContent = `Distancia total: ${formatDistance(total)}`;
  } else {
    totalEl.classList.remove('visible');
  }

  const pointsList = document.getElementById('measure-points');
  pointsList.innerHTML = '';
  state.measurePoints.forEach((p, i) => {
    const li = el('li');
    li.innerHTML = `
      <span class="measure-marker">${i + 1}</span>
      <span>${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}</span>
    `;
    pointsList.appendChild(li);
  });

  document.getElementById('measure-export-btn').hidden = state.measurePoints.length < 2;
}

document.getElementById('measure-clear').addEventListener('click', () => {
  state.measurePoints.forEach(p => map.removeLayer(p.marker));
  state.measurePoints = [];
  redrawMeasure();
});

document.getElementById('measure-export-btn').addEventListener('click', () => {
  if (state.measurePoints.length < 2) return;
  const pairs = state.measurePoints.map(p => [p.lon, p.lat]);
  const gpx = buildGPX(pairs, 'Medición');
  downloadFile('medicion.gpx', gpx);
});

/* ==========================================================
   GEOLOCALIZACIÓN
   ========================================================== */
document.getElementById('locate-btn').addEventListener('click', () => {
  if (!navigator.geolocation) {
    showToast('Tu navegador no soporta geolocalización.');
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude } = pos.coords;
      map.setView([latitude, longitude], 16);
      placeMarker(latitude, longitude, 'Estás aquí');

      if (state.mode === 'directions' && !state.originCoords) {
        originInput.value = 'Mi ubicación';
        state.originCoords = { lat: latitude, lon: longitude };
        maybeDrawRoute();
      }
    },
    () => showToast('No se pudo obtener tu ubicación.')
  );
});

/* ==========================================================
   Cerrar sugerencias al hacer clic fuera
   ========================================================== */
document.addEventListener('click', (e) => {
  if (!e.target.closest('#directions-inputs')) {
    dirSuggestions.hidden = true;
  }
});

/* ==========================================================
   PWA — registro del service worker
   ========================================================== */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => {
      console.warn('No se pudo registrar el service worker:', err);
    });
  });
}
