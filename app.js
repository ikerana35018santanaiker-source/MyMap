// ---- Inicialización del mapa ----
const map = L.map('map', {
  zoomControl: false
}).setView([40.4168, -3.7038], 13); // Madrid por defecto

L.control.zoom({ position: 'bottomright' }).addTo(map);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

let currentMarker = null;

function placeMarker(lat, lon, label) {
  if (currentMarker) {
    map.removeLayer(currentMarker);
  }
  currentMarker = L.marker([lat, lon]).addTo(map);
  if (label) {
    currentMarker.bindPopup(label).openPopup();
  }
}

// ---- Búsqueda con Nominatim (OpenStreetMap) ----
const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const suggestionsEl = document.getElementById('suggestions');

let debounceTimer = null;
let activeIndex = -1;
let currentResults = [];

async function searchPlaces(query) {
  if (!query || query.length < 3) {
    hideSuggestions();
    return;
  }
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&addressdetails=1&limit=6`;
    const res = await fetch(url, {
      headers: { 'Accept-Language': 'es' }
    });
    const data = await res.json();
    currentResults = data;
    renderSuggestions(data);
  } catch (err) {
    console.error('Error buscando lugares:', err);
    hideSuggestions();
  }
}

function renderSuggestions(results) {
  suggestionsEl.innerHTML = '';
  activeIndex = -1;

  if (!results.length) {
    hideSuggestions();
    return;
  }

  results.forEach((r, i) => {
    const li = document.createElement('li');
    const mainName = r.display_name.split(',')[0];
    const rest = r.display_name.split(',').slice(1).join(',').trim();

    const nameEl = document.createElement('span');
    nameEl.className = 'place-name';
    nameEl.textContent = mainName;

    const detailEl = document.createElement('span');
    detailEl.className = 'place-detail';
    detailEl.textContent = rest;

    li.appendChild(nameEl);
    li.appendChild(detailEl);

    li.addEventListener('click', () => selectResult(i));
    suggestionsEl.appendChild(li);
  });

  suggestionsEl.classList.add('visible');
}

function hideSuggestions() {
  suggestionsEl.classList.remove('visible');
  suggestionsEl.innerHTML = '';
  activeIndex = -1;
}

function selectResult(index) {
  const r = currentResults[index];
  if (!r) return;

  const lat = parseFloat(r.lat);
  const lon = parseFloat(r.lon);

  map.setView([lat, lon], 16);
  placeMarker(lat, lon, r.display_name.split(',')[0]);

  searchInput.value = r.display_name.split(',')[0];
  hideSuggestions();
}

searchInput.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  const query = searchInput.value.trim();
  debounceTimer = setTimeout(() => searchPlaces(query), 400);
});

searchInput.addEventListener('keydown', (e) => {
  const items = suggestionsEl.querySelectorAll('li');
  if (!items.length) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    activeIndex = Math.min(activeIndex + 1, items.length - 1);
    updateActiveItem(items);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    activeIndex = Math.max(activeIndex - 1, 0);
    updateActiveItem(items);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (activeIndex >= 0) {
      selectResult(activeIndex);
    } else if (currentResults.length) {
      selectResult(0);
    }
  } else if (e.key === 'Escape') {
    hideSuggestions();
  }
});

function updateActiveItem(items) {
  items.forEach((item, i) => {
    item.classList.toggle('active', i === activeIndex);
  });
  if (activeIndex >= 0) {
    items[activeIndex].scrollIntoView({ block: 'nearest' });
  }
}

searchForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (currentResults.length) {
    selectResult(activeIndex >= 0 ? activeIndex : 0);
  }
});

document.addEventListener('click', (e) => {
  if (!searchForm.contains(e.target)) {
    hideSuggestions();
  }
});

// ---- Geolocalización ----
const locateBtn = document.getElementById('locate-btn');

locateBtn.addEventListener('click', () => {
  if (!navigator.geolocation) {
    alert('Tu navegador no soporta geolocalización.');
    return;
  }

  locateBtn.disabled = true;

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude } = pos.coords;
      map.setView([latitude, longitude], 16);
      placeMarker(latitude, longitude, 'Estás aquí');
      locateBtn.disabled = false;
    },
    (err) => {
      console.error(err);
      alert('No se pudo obtener tu ubicación.');
      locateBtn.disabled = false;
    }
  );
});
