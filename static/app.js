// AgroStock Ganadero - Lógica de Cliente y Campo (Con Audio, Excel y Backup)

let state = {
  summary: null,
  batches: [],
  paddocks: [],
  categories: [],
  warehouses: [],
  supplies: [],
  healthEvents: [],
  selectedMangaBatchId: null,
  activeSupplyForUse: null,
  activeSupplyForAdd: null,
  soundEnabled: localStorage.getItem('agrostock_sound') !== 'false', // Por defecto activado
  healthFilterText: '',
  healthFilterStatus: 'all', // 'all', 'active', 'ready'
  healthSortColumn: null, // 'vacuna', 'lote', 'cantidad', 'aplicado', 'apto_faena', 'cantidad_consumida'
  healthSortDirection: 'asc' // 'asc' o 'desc'
};

// ==================== MOTOR DE AUDIO Y VOZ ====================
class SoundEngine {
  constructor() {
    this.ctx = null;
  }

  init() {
    if (!this.ctx && (window.AudioContext || window.webkitAudioContext)) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
  }

  // Tono positivo (campana armónica ascendente para sumas y éxitos)
  playPositiveChime() {
    if (!state.soundEnabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.12); // E5
      osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.25); // G5

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.35);
    } catch (e) {
      console.warn('AudioContext error:', e);
    }
  }

  // Tono de advertencia / baja (tono más grave y seco para muertes/restas)
  playWarningTone() {
    if (!state.soundEnabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(329.63, now); // E4
      osc.frequency.exponentialRampToValueAtTime(261.63, now + 0.2); // C4

      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.3);
    } catch (e) {}
  }

  // Síntesis de voz en español para confirmar la cantidad en voz alta
  speak(text) {
    if (!state.soundEnabled || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel(); // Cancelar cualquier frase anterior
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'es-ES';
      utterance.rate = 1.05; // Ritmo fluido y ágil
      window.speechSynthesis.speak(utterance);
    } catch (e) {}
  }
}

const sounds = new SoundEngine();

function toggleMangaSound() {
  state.soundEnabled = !state.soundEnabled;
  localStorage.setItem('agrostock_sound', state.soundEnabled);
  updateSoundButtonUI();
  if (state.soundEnabled) {
    sounds.playPositiveChime();
    sounds.speak('Audio activado');
    showToast('Sonido y voz activados', 'success');
  } else {
    showToast('Sonido silenciado', 'success');
  }
}

function updateSoundButtonUI() {
  const btn = document.getElementById('mangaSoundToggle');
  const text = document.getElementById('mangaSoundText');
  const icon = document.getElementById('mangaSoundIcon');
  if (!btn) return;

  if (state.soundEnabled) {
    btn.className = "px-3 py-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-950 font-black text-xs rounded-xl border border-emerald-400 flex items-center space-x-1.5 transition";
    if (text) text.textContent = "Audio Activado";
    if (icon) {
      icon.setAttribute('data-lucide', 'volume-2');
      icon.className = "w-4 h-4 text-emerald-700";
    }
  } else {
    btn.className = "px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs rounded-xl border border-slate-300 flex items-center space-x-1.5 transition";
    if (text) text.textContent = "Silenciado";
    if (icon) {
      icon.setAttribute('data-lucide', 'volume-x');
      icon.className = "w-4 h-4 text-slate-500";
    }
  }
  lucide.createIcons();
}

// Inicialización de la aplicación
document.addEventListener('DOMContentLoaded', () => {
  initServiceWorker();
  initOnlineListener();
  initMangaInputListeners();
  updateSoundButtonUI();
  refreshData();
  lucide.createIcons();
});

function initServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/static/sw.js').catch(() => {});
  }
}

function initOnlineListener() {
  const badge = document.getElementById('connectionBadge');
  function update() {
    if (!badge) return;
    if (navigator.onLine) {
      badge.className = "hidden sm:inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-200 border border-emerald-400/30";
      badge.innerHTML = '<span class="w-2.5 h-2.5 mr-2 bg-emerald-400 rounded-full animate-pulse"></span> Conectado';
    } else {
      badge.className = "hidden sm:inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-400/30";
      badge.innerHTML = '<span class="w-2.5 h-2.5 mr-2 bg-amber-400 rounded-full"></span> Sin Conexión';
    }
  }
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
}

// ==================== ACCIONES DE REPORTE Y BACKUP ====================

function downloadExcelReport() {
  showToast('Generando planilla de existencias para Excel...', 'success');
  // Descarga directa a través de la API Java
  window.location.href = '/api/reports/stock-csv';
}

function downloadBackupDb() {
  showToast('Descargando copia de seguridad (ganaderia.db)...', 'success');
  window.location.href = '/api/backup';
}

// ==================== NAVEGACIÓN ENTRE PESTAÑAS ====================

function switchTab(tabName) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.nav-tab').forEach(el => {
    el.classList.remove('border-emerald-400', 'text-white');
    el.classList.add('border-transparent', 'text-emerald-200');
  });

  const targetView = document.getElementById(`view-${tabName}`);
  const targetTab = document.getElementById(`tab-${tabName}`);

  if (targetView) targetView.classList.remove('hidden');
  if (targetTab) {
    targetTab.classList.add('border-emerald-400', 'text-white');
    targetTab.classList.remove('border-transparent', 'text-emerald-200');
  }

  if (tabName === 'manga') {
    onMangaBatchChange();
    updateMangaActionLabels();
    updateSoundButtonUI();
  } else if (tabName === 'tratamientos') {
    applyHealthFilters();
  }

  lucide.createIcons();
}

// Cargar todos los datos
async function refreshData() {
  try {
    await Promise.all([
      loadSummary(),
      loadBatches(),
      loadPaddocks(),
      loadCategories(),
      loadWarehouses(),
      loadSupplies(),
      loadHealthEvents(),
      loadHistory()
    ]);
    populateFormSelects();
    lucide.createIcons();
  } catch (err) {
    console.error(err);
    showToast('Error al conectar con la base de datos', 'error');
  }
}

// ==================== CARGADORES API ====================

async function loadSummary() {
  const res = await fetch('/api/summary');
  if (!res.ok) return;
  const data = await res.json();
  state.summary = data;

  document.getElementById('kpiTotalHeads').textContent = data.total_heads.toLocaleString();
  document.getElementById('kpiTotalPaddocks').textContent = data.total_paddocks;
  document.getElementById('kpiHectares').textContent = `${data.total_hectares} ha totales`;
  document.getElementById('kpiStockingRate').textContent = data.stocking_rate;
  document.getElementById('kpiCriticalSupplies').textContent = data.critical_supplies.length;

  // Alerta de Carencia Sanitaria
  const alertBox = document.getElementById('withdrawalAlertBox');
  const alertList = document.getElementById('withdrawalAlertList');
  if (data.active_withdrawals && data.active_withdrawals.length > 0) {
    alertBox.classList.remove('hidden');
    alertList.innerHTML = data.active_withdrawals.map(w => `
      <div class="bg-white p-3 rounded-xl border border-rose-300 flex flex-col sm:flex-row justify-between sm:items-center gap-2">
        <div>
          <span class="font-black text-rose-900 text-base">${w.batch_name}</span>
          <span class="text-xs text-slate-500 font-semibold block">En ${w.paddock_name} | Medicamento: <strong>${w.medicine_name}</strong></span>
        </div>
        <div class="flex items-center space-x-2">
          <span class="bg-rose-600 text-white text-xs sm:text-sm font-black px-3 py-1 rounded-full whitespace-nowrap">
            Faltan ${w.days_left} días de espera
          </span>
          <span class="text-xs text-rose-700 font-bold hidden sm:inline">(Hasta el ${w.withdrawal_end_date})</span>
        </div>
      </div>
    `).join('');
  } else {
    alertBox.classList.add('hidden');
  }

  // Grilla de Potreros
  const paddocksGrid = document.getElementById('paddocksGrid');
  paddocksGrid.innerHTML = data.paddocks.map(p => {
    const isOccupied = p.total_heads > 0;
    return `
      <div class="bg-white p-4 sm:p-5 rounded-2xl shadow-sm border-2 border-slate-200 flex flex-col justify-between">
        <div>
          <div class="flex justify-between items-start mb-1">
            <h4 class="font-black text-slate-900 text-base sm:text-lg">${p.name}</h4>
            <span class="text-xs font-black px-2.5 py-1 rounded-full ${isOccupied ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}">
              ${isOccupied ? 'Ocupado' : 'Libre'}
            </span>
          </div>
          <p class="text-xs font-bold text-slate-500 mb-3">${p.hectares} Hectáreas</p>
        </div>

        <div class="border-t-2 border-slate-100 pt-3 flex justify-between items-center">
          <div>
            <span class="text-xs font-bold text-slate-500 block uppercase">Hacienda:</span>
            <span class="text-2xl font-black text-slate-900">${p.total_heads} <span class="text-xs font-bold text-slate-500">cab</span></span>
          </div>
          <div class="text-right">
            <span class="text-xs font-bold text-slate-500 block uppercase">Carga:</span>
            <span class="text-sm font-black ${p.stocking_rate > 1.0 ? 'text-amber-700' : 'text-slate-800'}">
              ${p.stocking_rate} v/ha
            </span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Categorías
  const catList = document.getElementById('categoriesList');
  catList.innerHTML = data.categories.map(c => `
    <div class="bg-slate-50 p-3 rounded-xl border-2 border-slate-100 text-center">
      <span class="text-xs font-bold text-slate-600 block truncate">${c.name}</span>
      <span class="text-2xl font-black text-slate-900">${c.heads}</span>
    </div>
  `).join('');
}

async function loadBatches() {
  const res = await fetch('/api/batches');
  if (!res.ok) return;
  state.batches = await res.json();

  const tbody = document.getElementById('batchesTableBody');
  if (state.batches.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center py-6 text-slate-400 font-bold">No hay lotes registrados</td></tr>`;
    return;
  }

  tbody.innerHTML = state.batches.map(b => `
    <tr class="hover:bg-slate-50 transition">
      <td class="py-3.5 px-4 font-black text-slate-900">${b.name}</td>
      <td class="py-3.5 px-4">
        <span class="bg-slate-100 text-slate-800 text-xs px-2.5 py-1 rounded-full font-bold">
          ${b.category_name}
        </span>
      </td>
      <td class="py-3.5 px-4 text-slate-700 font-bold">${b.paddock_name}</td>
      <td class="py-3.5 px-4 text-right font-black text-slate-900 text-lg">${b.head_count}</td>
      <td class="py-3.5 px-4 text-center">
        <button onclick="selectBatchForManga('${b.id}')" class="text-xs bg-amber-500 hover:bg-amber-600 text-slate-950 font-black px-3.5 py-2 rounded-xl transition shadow-sm">
          🤠 Contar en Manga
        </button>
      </td>
    </tr>
  `).join('');

  const mangaSelect = document.getElementById('mangaBatchSelect');
  mangaSelect.innerHTML = state.batches.map(b => `
    <option value="${b.id}">${b.name} (${b.head_count} cab en ${b.paddock_name})</option>
  `).join('');

  if (!state.selectedMangaBatchId && state.batches.length > 0) {
    state.selectedMangaBatchId = state.batches[0].id;
  }
}

async function loadPaddocks() {
  const res = await fetch('/api/paddocks');
  if (!res.ok) return;
  state.paddocks = await res.json();
}

async function loadCategories() {
  const res = await fetch('/api/categories');
  if (!res.ok) return;
  state.categories = await res.json();
}

async function loadWarehouses() {
  const res = await fetch('/api/warehouses');
  if (!res.ok) return;
  state.warehouses = await res.json();
}

async function loadSupplies() {
  const res = await fetch('/api/supplies');
  if (!res.ok) return;
  state.supplies = await res.json();

  const grid = document.getElementById('suppliesGrid');
  grid.innerHTML = state.supplies.map(s => {
    const isCritical = s.total_stock <= s.min_stock_alert;
    const isPharma = s.supply_type === 'medicamento' || s.supply_type === 'vacuna';
    return `
      <div class="bg-white p-5 rounded-2xl shadow-sm border-2 ${isCritical ? 'border-rose-400 bg-rose-50/20' : 'border-slate-200'} flex flex-col justify-between">
        <div>
          <div class="flex justify-between items-start mb-2">
            <span class="text-xs font-black uppercase px-2.5 py-1 rounded-md ${isPharma ? 'bg-purple-100 text-purple-800' : 'bg-amber-100 text-amber-900'}">
              ${isPharma ? '💊 Fármaco' : '🌾 Alimento / Insumo'}
            </span>
            ${isCritical ? '<span class="text-xs bg-rose-600 text-white font-black px-2.5 py-1 rounded-full animate-pulse">Queda Poco</span>' : ''}
          </div>
          <h4 class="font-black text-slate-900 text-lg mb-1">${s.name}</h4>
          
          ${s.withdrawal_days > 0 ? `
            <div class="text-xs font-black text-rose-700 bg-rose-100/70 px-2.5 py-1 rounded-lg inline-block mt-1">
              ⚠️ ${s.withdrawal_days} días de carencia para faena
            </div>
          ` : ''}

          <div class="mt-4 pt-3 border-t-2 border-slate-100">
            <span class="text-xs font-bold text-slate-500 uppercase block">Hay en galpón:</span>
            <div class="text-3xl font-black ${isCritical ? 'text-rose-600' : 'text-slate-900'}">
              ${s.total_stock} <span class="text-sm font-bold text-slate-500">${s.unit_of_measure}</span>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-slate-100">
          <button onclick="openUseSupplyModal('${s.id}')" class="py-2.5 px-3 bg-amber-500 hover:bg-amber-600 active:scale-95 text-slate-950 font-black text-xs sm:text-sm rounded-xl flex items-center justify-center space-x-1 shadow-sm">
            <span>🚜 Usar / Dar</span>
          </button>
          <button onclick="openAddSupplyStockModal('${s.id}')" class="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-xs sm:text-sm rounded-xl flex items-center justify-center space-x-1 shadow-sm">
            <span>📥 Entró</span>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// ==================== LIBRO SANITARIO Y TRATAMIENTOS ====================

async function loadHealthEvents() {
  const res = await fetch('/api/health-events');
  if (!res.ok) return;
  state.healthEvents = await res.json();

  // Actualizar contadores en los botones de filtro
  const total = state.healthEvents.length;
  const activeCount = state.healthEvents.filter(e => e.is_active_withdrawal).length;
  const readyCount = total - activeCount;

  const countAll = document.getElementById('countHealthAll');
  const countActive = document.getElementById('countHealthActive');
  const countReady = document.getElementById('countHealthReady');

  if (countAll) countAll.textContent = total;
  if (countActive) countActive.textContent = activeCount;
  if (countReady) countReady.textContent = readyCount;

  applyHealthFilters();
}

function setHealthStatusFilter(status) {
  state.healthFilterStatus = status;

  const btnAll = document.getElementById('filterHealthAll');
  const btnActive = document.getElementById('filterHealthActive');
  const btnReady = document.getElementById('filterHealthReady');

  const activeClasses = "px-3 sm:px-4 py-2 rounded-lg font-black text-xs sm:text-sm transition bg-white text-slate-900 shadow-sm whitespace-nowrap";
  const inactiveClasses = "px-3 sm:px-4 py-2 rounded-lg font-black text-xs sm:text-sm transition text-slate-600 hover:text-slate-900 whitespace-nowrap";

  if (btnAll) btnAll.className = status === 'all' ? activeClasses : inactiveClasses;
  if (btnActive) btnActive.className = status === 'active' ? activeClasses : inactiveClasses;
  if (btnReady) btnReady.className = status === 'ready' ? activeClasses : inactiveClasses;

  applyHealthFilters();
}

function sortHealthTable(column) {
  if (state.healthSortColumn === column) {
    // Si ya estaba seleccionada esta columna, invierte el sentido (asc <-> desc)
    state.healthSortDirection = state.healthSortDirection === 'asc' ? 'desc' : 'asc';
  } else {
    state.healthSortColumn = column;
    // Vacuna y Lote arrancan de la A a la Z (asc); fechas y números arrancan de mayor a menor (desc)
    state.healthSortDirection = (column === 'vacuna' || column === 'lote') ? 'asc' : 'desc';
  }

  updateSortHeaderIcons();
  applyHealthFilters();
}

function updateSortHeaderIcons() {
  const columns = ['vacuna', 'lote', 'cantidad', 'aplicado', 'apto_faena', 'cantidad_consumida'];
  const labels = {
    vacuna: 'Vacuna',
    lote: 'Lote',
    cantidad: 'Cantidad',
    aplicado: 'Fecha de Aplicación',
    apto_faena: 'Días Faltantes de Carencia',
    cantidad_consumida: 'Cantidad Consumida'
  };

  columns.forEach(col => {
    const icon = document.getElementById(`sortIcon-${col}`);
    if (!icon) return;

    if (state.healthSortColumn === col) {
      icon.textContent = state.healthSortDirection === 'asc' ? ' ▲' : ' ▼';
      icon.className = 'text-xs font-black text-emerald-700';
    } else {
      icon.textContent = ' ↕';
      icon.className = 'text-xs font-black text-slate-400';
    }
  });

  const activeLabel = document.getElementById('activeSortLabel');
  if (activeLabel) {
    if (state.healthSortColumn) {
      const orderTxt = state.healthSortDirection === 'asc' ? 'A a la Z / menor a mayor' : 'Z a la A / mayor a menor';
      activeLabel.textContent = `Orden: ${labels[state.healthSortColumn]} (${orderTxt})`;
    } else {
      activeLabel.textContent = 'Sin orden activo';
    }
  }
}

function clearHealthFilters() {
  const input = document.getElementById('healthSearchInput');
  if (input) input.value = '';
  state.healthFilterText = '';
  state.healthSortColumn = null;
  state.healthSortDirection = 'asc';
  updateSortHeaderIcons();
  setHealthStatusFilter('all');
}

function applyHealthFilters() {
  const searchInput = document.getElementById('healthSearchInput');
  const query = (searchInput ? searchInput.value : '').toLowerCase().trim();
  state.healthFilterText = query;

  let filtered = state.healthEvents.filter(e => {
    // Filtro por texto (vacuna o lote)
    const matchesText = !query || 
      (e.supply_name && e.supply_name.toLowerCase().includes(query)) ||
      (e.batch_name && e.batch_name.toLowerCase().includes(query));

    // Filtro por estado
    let matchesStatus = true;
    if (state.healthFilterStatus === 'active') {
      matchesStatus = e.is_active_withdrawal === true;
    } else if (state.healthFilterStatus === 'ready') {
      matchesStatus = e.is_active_withdrawal === false;
    }

    return matchesText && matchesStatus;
  });

  // ORDENAMIENTO AL TOCAR EL TEXTO DEL ENCABEZADO
  if (state.healthSortColumn) {
    const col = state.healthSortColumn;
    const isAsc = state.healthSortDirection === 'asc';
    const mult = isAsc ? 1 : -1;

    filtered.sort((a, b) => {
      // 1. Vacuna: de la A a la Z
      if (col === 'vacuna') {
        const nameA = (a.supply_name || '').toLowerCase();
        const nameB = (b.supply_name || '').toLowerCase();
        return nameA.localeCompare(nameB, 'es', { sensitivity: 'base' }) * mult;
      }

      // 2. Lote: orden por lote
      if (col === 'lote') {
        const loteA = (a.batch_name || '').toLowerCase();
        const loteB = (b.batch_name || '').toLowerCase();
        return loteA.localeCompare(loteB, 'es', { sensitivity: 'base' }) * mult;
      }

      // 3. Cantidad: por cantidad de cabezas
      if (col === 'cantidad') {
        const qtyA = Number(a.heads_treated) || 0;
        const qtyB = Number(b.heads_treated) || 0;
        return (qtyA - qtyB) * mult;
      }

      // 4. Aplicado: por fecha de aplicación
      if (col === 'aplicado') {
        const dateA = new Date(a.application_date || '1970-01-01').getTime();
        const dateB = new Date(b.application_date || '1970-01-01').getTime();
        return (dateA - dateB) * mult;
      }

      // 5. Apto Faena: para los días faltantes de carencia
      if (col === 'apto_faena') {
        const daysA = Number(a.days_left) || 0;
        const daysB = Number(b.days_left) || 0;
        return (daysA - daysB) * mult;
      }

      // 6. Cantidad Consumida: por cantidad consumida
      if (col === 'cantidad_consumida') {
        const consA = Number(a.total_consumed) || 0;
        const consB = Number(b.total_consumed) || 0;
        return (consA - consB) * mult;
      }

      return 0;
    });
  }

  const tbody = document.getElementById('healthTreatmentsTableBody');
  const feedback = document.getElementById('healthFilterFeedback');

  if (feedback) {
    feedback.textContent = `Mostrando ${filtered.length} de ${state.healthEvents.length} tratamientos`;
  }

  if (!tbody) return;

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center py-8 text-slate-400 font-bold">
          No se encontraron tratamientos con los filtros seleccionados.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(e => {
    const isUnderWithdrawal = e.is_active_withdrawal;
    return `
      <tr class="hover:bg-slate-50 transition">
        <!-- 1. Vacuna / Medicamento -->
        <td class="py-3.5 px-4 font-black text-slate-900">
          <div class="flex items-center space-x-2">
            <span class="p-1.5 bg-emerald-100 text-emerald-800 rounded-lg"><i data-lucide="syringe" class="w-4 h-4"></i></span>
            <span>${e.supply_name}</span>
          </div>
        </td>

        <!-- 2. Lote Tratado -->
        <td class="py-3.5 px-4 font-bold text-slate-800">
          <div>${e.batch_name}</div>
          <div class="text-xs font-semibold text-slate-400">${e.operator_name || 'Personal de campo'}</div>
        </td>

        <!-- 3. Cantidad (Cabezas) -->
        <td class="py-3.5 px-4 text-center font-black text-slate-900 text-base">
          ${e.heads_treated} <span class="text-xs font-bold text-slate-500">cab</span>
        </td>

        <!-- 4. Aplicado (Fecha) -->
        <td class="py-3.5 px-4 text-center font-bold text-slate-700">
          ${e.application_date}
        </td>

        <!-- 5. Apto Faena (Carencia) -->
        <td class="py-3.5 px-4">
          ${isUnderWithdrawal ? `
            <div class="inline-flex flex-col">
              <span class="bg-rose-100 text-rose-800 border border-rose-300 text-xs px-2.5 py-1 rounded-full font-black flex items-center space-x-1">
                <span class="w-2 h-2 bg-rose-600 rounded-full animate-ping"></span>
                <span>Faltan ${e.days_left} días</span>
              </span>
              <span class="text-xs text-rose-700 font-bold mt-1">Apto: ${e.withdrawal_end_date}</span>
            </div>
          ` : `
            <div class="inline-flex flex-col">
              <span class="bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs px-2.5 py-1 rounded-full font-black">
                ✅ Apto para faena
              </span>
              ${e.withdrawal_end_date ? `<span class="text-xs text-slate-500 font-medium mt-1">Venció: ${e.withdrawal_end_date}</span>` : ''}
            </div>
          `}
        </td>

        <!-- 6. Cantidad Consumida -->
        <td class="py-3.5 px-4 text-right font-black text-slate-900 text-base">
          ${e.total_consumed} <span class="text-xs font-bold text-slate-500">${e.unit_of_measure}</span>
          <div class="text-xs font-normal text-slate-400">(${e.dose_per_head} ${e.unit_of_measure}/cab)</div>
        </td>
      </tr>
    `;
  }).join('');

  lucide.createIcons();
}

async function loadHistory() {
  const res = await fetch('/api/history');
  if (!res.ok) return;
  const history = await res.json();

  const timeline = document.getElementById('historyTimeline');
  if (history.length === 0) {
    timeline.innerHTML = `<p class="text-xs text-slate-400 font-bold text-center py-4">No hay movimientos registrados.</p>`;
    return;
  }

  timeline.innerHTML = history.map(h => {
    let color = 'bg-slate-100 text-slate-700';
    let label = h.movement_type;
    let emoji = '📌';

    if (h.movement_type === 'nacimiento') { color = 'bg-emerald-100 text-emerald-900'; label = 'NACIMIENTO / ENTRADA'; emoji = '🌱'; }
    else if (h.movement_type === 'muerte') { color = 'bg-rose-100 text-rose-900'; label = 'BAJA / MUERTE'; emoji = '⚠️'; }
    else if (h.movement_type === 'traslado_potrero') { color = 'bg-blue-100 text-blue-900'; label = 'MUDANZA DE POTRERO'; emoji = '🚚'; }
    else if (h.movement_type === 'venta') { color = 'bg-purple-100 text-purple-900'; label = 'VENTA'; emoji = '💰'; }

    return `
      <div class="p-3 bg-white rounded-xl border border-slate-200 flex items-start space-x-3 text-xs sm:text-sm">
        <span class="text-2xl">${emoji}</span>
        <div class="flex-1">
          <div class="flex justify-between items-baseline">
            <span class="font-black text-slate-900">${h.batch_name}</span>
            <span class="text-slate-400 font-bold text-xs">${h.movement_date}</span>
          </div>
          <p class="text-slate-700 mt-0.5 font-medium">
            <span class="px-2 py-0.5 rounded font-black text-xs ${color}">${label}</span>
            <strong>${h.quantity > 0 ? '+' : ''}${h.quantity} cabezas</strong>.
            ${h.cause_reason ? `<span class="text-rose-700 font-bold">[Causa: ${h.cause_reason}]</span>` : ''}
            ${h.origin_paddock && h.destination_paddock ? `(De ${h.origin_paddock} a ${h.destination_paddock})` : ''}
            ${h.notes ? ` - ${h.notes}` : ''}
          </p>
        </div>
      </div>
    `;
  }).join('');
}

// ==================== MODO MANGA CON AUDIO Y CANTIDADES FLEXIBLES ====================

function initMangaInputListeners() {
  const input = document.getElementById('mangaQuantityInput');
  if (input) {
    input.addEventListener('input', () => {
      updateMangaActionLabels();
    });
  }
}

function getSelectedQty() {
  const input = document.getElementById('mangaQuantityInput');
  const val = parseInt(input.value) || 1;
  return Math.max(1, val);
}

function setSelectedQty(val) {
  const input = document.getElementById('mangaQuantityInput');
  input.value = Math.max(1, val);
  updateMangaActionLabels();
}

function alterSelectedQty(delta) {
  const input = document.getElementById('mangaQuantityInput');
  let current = parseInt(input.value) || 1;
  current = Math.max(1, current + delta);
  input.value = current;
  updateMangaActionLabels();
}

function updateMangaActionLabels() {
  const qty = getSelectedQty();
  document.getElementById('btnLabelSumar').textContent = `+ ${qty}`;
  document.getElementById('btnLabelRestar').textContent = `- ${qty}`;
  document.getElementById('btnLabelMudar').textContent = `Mover ${qty}`;
  document.getElementById('btnLabelVender').textContent = `Vender ${qty}`;

  const deathCountNotice = document.getElementById('deathCountNotice');
  if (deathCountNotice) {
    deathCountNotice.textContent = `Se restarán ${qty} cabezas por muerte/baja`;
  }
  const saleNoticeText = document.getElementById('saleNoticeText');
  if (saleNoticeText) {
    saleNoticeText.textContent = `Se darán de baja ${qty} cabezas por venta`;
  }
}

function selectBatchForManga(batchId) {
  state.selectedMangaBatchId = batchId;
  const select = document.getElementById('mangaBatchSelect');
  if (select) select.value = batchId;
  switchTab('manga');
  onMangaBatchChange();
}

function onMangaBatchChange() {
  const select = document.getElementById('mangaBatchSelect');
  if (!select) return;
  const bId = select.value;
  state.selectedMangaBatchId = bId;

  const batch = state.batches.find(b => b.id === bId);
  const display = document.getElementById('mangaCounterDisplay');
  const padName = document.getElementById('mangaPaddockName');
  const catName = document.getElementById('mangaCategoryName');

  if (batch) {
    display.textContent = batch.head_count;
    padName.textContent = `📍 Potrero: ${batch.paddock_name}`;
    catName.textContent = `🏷️ Tipo: ${batch.category_name}`;
  }
}

// Acción de sumar con feedback sonoro y de voz
async function executeMangaAction(action_type, cause_reason = null) {
  if (!state.selectedMangaBatchId) return;
  const qty = getSelectedQty();

  const currentBatch = state.batches.find(b => b.id === state.selectedMangaBatchId);
  if (!currentBatch) return;

  const delta = (action_type === 'muerte') ? -qty : qty;
  const newCount = currentBatch.head_count + delta;
  if (newCount < 0) {
    showToast('No puedes restar más animales de los que hay en el lote', 'error');
    return;
  }

  // Actualización optimista
  currentBatch.head_count = newCount;
  document.getElementById('mangaCounterDisplay').textContent = newCount;

  // Feedback sonoro inmediato
  if (delta > 0) {
    sounds.playPositiveChime();
    sounds.speak(`Sumadas ${qty} cabezas`);
  } else {
    sounds.playWarningTone();
    sounds.speak(`Baja de ${qty} cabezas`);
  }

  try {
    const res = await fetch('/api/batches/quick-counter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        batch_id: state.selectedMangaBatchId,
        delta: delta,
        action_type: action_type,
        cause_reason: cause_reason,
        notes: `${action_type === 'nacimiento' ? 'Ingreso/Nacimiento' : 'Baja'} de ${qty} cabezas`
      })
    });
    if (!res.ok) throw new Error();
    showToast(`Registrado: ${delta > 0 ? '+' : ''}${delta} cabezas`, 'success');
    refreshData();
  } catch (err) {
    showToast('Error al conectar con el servidor', 'error');
  }
}

// Muerte / Baja con Causa
function openMangaDeathModal() {
  updateMangaActionLabels();
  document.getElementById('mangaDeathModal').classList.remove('hidden');
}

function confirmMangaDeath() {
  const cause = document.getElementById('deathCauseSelect').value;
  closeModal('mangaDeathModal');
  executeMangaAction('muerte', cause);
}

// Mudar de Potrero con sonido
function openMovePaddockModal() {
  const qty = getSelectedQty();
  document.getElementById('moveQuantityInput').value = qty;
  document.getElementById('movePaddockModal').classList.remove('hidden');
}

async function confirmMovePaddock() {
  const destPaddockId = document.getElementById('moveDestinationPaddock').value;
  const qty = parseInt(document.getElementById('moveQuantityInput').value);

  if (!qty || qty <= 0) {
    showToast('Ingresa una cantidad válida', 'error');
    return;
  }

  try {
    const res = await fetch('/api/batches/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        batch_id: state.selectedMangaBatchId,
        movement_type: 'traslado_potrero',
        quantity: qty,
        destination_paddock_id: destPaddockId
      })
    });
    if (!res.ok) throw new Error();
    closeModal('movePaddockModal');

    sounds.playPositiveChime();
    sounds.speak(`Mudadas ${qty} cabezas`);

    showToast(`Se mudaron ${qty} cabezas correctamente`, 'success');
    refreshData();
  } catch (err) {
    showToast('Error al trasladar la hacienda', 'error');
  }
}

// Venta de Animales con sonido
function openSaleModal() {
  const qty = getSelectedQty();
  document.getElementById('saleQuantityInput').value = qty;
  document.getElementById('saleModal').classList.remove('hidden');
}

async function confirmSale() {
  const qty = parseInt(document.getElementById('saleQuantityInput').value);
  const notes = document.getElementById('saleNotesInput').value.trim();

  if (!qty || qty <= 0) {
    showToast('Ingresa una cantidad válida', 'error');
    return;
  }

  try {
    const res = await fetch('/api/batches/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        batch_id: state.selectedMangaBatchId,
        movement_type: 'venta',
        quantity: qty,
        notes: notes || `Venta de ${qty} cabezas`
      })
    });
    if (!res.ok) throw new Error();
    closeModal('saleModal');

    sounds.playPositiveChime();
    sounds.speak(`Venta de ${qty} cabezas guardada`);

    showToast(`Venta de ${qty} cabezas guardada`, 'success');
    refreshData();
  } catch {
    showToast('Error al registrar la venta', 'error');
  }
}

// ==================== COMIDA Y REMEDIOS ====================

function openUseSupplyModal(supplyId) {
  const supply = state.supplies.find(s => s.id === supplyId);
  if (!supply) return;
  state.activeSupplyForUse = supply;

  document.getElementById('useSupplyTitle').textContent = `Usar / Dar de comer: ${supply.name}`;
  document.getElementById('useSupplySubtitle').textContent = `Stock actual disponible: ${supply.total_stock} ${supply.unit_of_measure}`;
  document.getElementById('useSupplyUnitBadge').textContent = supply.unit_of_measure;
  document.getElementById('useSupplyQuantity').value = 1;

  document.getElementById('useSupplyModal').classList.remove('hidden');
}

function setUseSupplyQty(val) {
  document.getElementById('useSupplyQuantity').value = val;
}

async function confirmUseSupply() {
  if (!state.activeSupplyForUse) return;
  const qty = parseFloat(document.getElementById('useSupplyQuantity').value);
  if (!qty || qty <= 0) {
    showToast('Ingresa una cantidad válida', 'error');
    return;
  }

  const wh = state.activeSupplyForUse.stocks.find(st => st.current_quantity > 0) || state.activeSupplyForUse.stocks[0];
  const whId = wh ? wh.warehouse_id : state.warehouses[0].id;

  try {
    const res = await fetch('/api/supplies/movement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supply_id: state.activeSupplyForUse.id,
        warehouse_id: whId,
        movement_type: 'consumo_animal',
        quantity: qty,
        notes: `Uso / Entrega a animales (${qty} ${state.activeSupplyForUse.unit_of_measure})`
      })
    });
    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.detail || 'Error');
    }
    closeModal('useSupplyModal');
    sounds.playPositiveChime();
    showToast(`Se descontaron ${qty} ${state.activeSupplyForUse.unit_of_measure}`, 'success');
    refreshData();
  } catch (err) {
    showToast(err.message || 'Error al descontar stock', 'error');
  }
}

function openAddSupplyStockModal(supplyId) {
  const supply = state.supplies.find(s => s.id === supplyId);
  if (!supply) return;
  state.activeSupplyForAdd = supply;

  document.getElementById('addSupplyTitle').textContent = `Entró Compra: ${supply.name}`;
  document.getElementById('addSupplySubtitle').textContent = `Sumar a galpón (${supply.unit_of_measure})`;
  document.getElementById('addSupplyUnitBadge').textContent = supply.unit_of_measure;
  document.getElementById('addSupplyQuantity').value = 10;
  document.getElementById('addSupplyInvoice').value = '';

  document.getElementById('addSupplyStockModal').classList.remove('hidden');
}

async function confirmAddSupplyStock() {
  if (!state.activeSupplyForAdd) return;
  const qty = parseFloat(document.getElementById('addSupplyQuantity').value);
  const inv = document.getElementById('addSupplyInvoice').value.trim();

  if (!qty || qty <= 0) {
    showToast('Ingresa una cantidad válida', 'error');
    return;
  }

  const whId = state.warehouses[0].id;

  try {
    const res = await fetch('/api/supplies/movement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supply_id: state.activeSupplyForAdd.id,
        warehouse_id: whId,
        movement_type: 'ingreso_compra',
        quantity: qty,
        reference_invoice: inv,
        notes: `Entrada de compra (${qty} ${state.activeSupplyForAdd.unit_of_measure})`
      })
    });
    if (!res.ok) throw new Error();
    closeModal('addSupplyStockModal');
    sounds.playPositiveChime();
    showToast(`Se sumaron ${qty} ${state.activeSupplyForAdd.unit_of_measure}`, 'success');
    refreshData();
  } catch {
    showToast('Error al sumar la compra', 'error');
  }
}

// ==================== TRATAMIENTOS SANITARIOS ====================

function onHealthBatchSelect() {
  const sel = document.getElementById('healthBatchSelect');
  if (!sel || !sel.selectedOptions[0]) return;
  const heads = sel.selectedOptions[0].getAttribute('data-heads');
  document.getElementById('healthHeadsTreated').value = heads || 1;
  calculateHealthConsumption();
}

function onHealthSupplySelect() {
  const sel = document.getElementById('healthSupplySelect');
  if (!sel || !sel.selectedOptions[0]) return;
  const withdrawal = sel.selectedOptions[0].getAttribute('data-withdrawal');
  const preview = document.getElementById('healthWithdrawalText');
  if (preview) {
    preview.textContent = `${withdrawal} días de espera`;
  }
  calculateHealthConsumption();
}

function calculateHealthConsumption() {
  const heads = parseFloat(document.getElementById('healthHeadsTreated').value) || 0;
  const dose = parseFloat(document.getElementById('healthDosePerHead').value) || 0;
  const total = (heads * dose).toFixed(1);

  const sel = document.getElementById('healthSupplySelect');
  const unit = sel && sel.selectedOptions[0] ? sel.selectedOptions[0].getAttribute('data-unit') : 'ml';
  document.getElementById('healthTotalDisplay').textContent = `${total} ${unit}`;
}

async function submitHealthEvent(e) {
  e.preventDefault();
  const batchId = document.getElementById('healthBatchSelect').value;
  const supplyId = document.getElementById('healthSupplySelect').value;
  const heads = parseInt(document.getElementById('healthHeadsTreated').value);
  const dose = parseFloat(document.getElementById('healthDosePerHead').value);
  const whId = document.getElementById('healthWarehouseSelect').value;
  const operator = document.getElementById('healthOperatorName').value;

  try {
    const res = await fetch('/api/health-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        batch_id: batchId,
        supply_id: supplyId,
        heads_treated: heads,
        dose_per_head: dose,
        warehouse_id: whId,
        operator_name: operator
      })
    });
    if (!res.ok) throw new Error();
    sounds.playPositiveChime();
    showToast('Tratamiento guardado y stock descontado', 'success');
    await refreshData();
    switchTab('tratamientos');
  } catch {
    showToast('Error al guardar el tratamiento', 'error');
  }
}

// ==================== SELECTS DE FORMULARIOS ====================

function populateFormSelects() {
  const movePaddock = document.getElementById('moveDestinationPaddock');
  if (movePaddock) {
    movePaddock.innerHTML = state.paddocks.map(p => `<option value="${p.id}">${p.name} (${p.hectares} ha)</option>`).join('');
  }

  const newCat = document.getElementById('newBatchCategory');
  if (newCat) {
    newCat.innerHTML = state.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  }
  const newPad = document.getElementById('newBatchPaddock');
  if (newPad) {
    newPad.innerHTML = state.paddocks.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  }

  const smSupply = document.getElementById('supplyMoveSupplySelect');
  if (smSupply) {
    smSupply.innerHTML = state.supplies.map(s => `<option value="${s.id}">${s.name} (${s.unit_of_measure})</option>`).join('');
  }
  const smWh = document.getElementById('supplyMoveWarehouseSelect');
  if (smWh) {
    smWh.innerHTML = state.warehouses.map(w => `<option value="${w.id}">${w.name}</option>`).join('');
  }

  const hBatch = document.getElementById('healthBatchSelect');
  if (hBatch) {
    hBatch.innerHTML = state.batches.map(b => `<option value="${b.id}" data-heads="${b.head_count}">${b.name} (${b.head_count} cab)</option>`).join('');
    onHealthBatchSelect();
  }
  const hSupply = document.getElementById('healthSupplySelect');
  if (hSupply) {
    const pharmaSupplies = state.supplies.filter(s => s.supply_type === 'medicamento' || s.supply_type === 'vacuna');
    hSupply.innerHTML = pharmaSupplies.map(s => `
      <option value="${s.id}" data-unit="${s.unit_of_measure}" data-withdrawal="${s.withdrawal_days}">${s.name} (${s.withdrawal_days}d carencia)</option>
    `).join('');
    onHealthSupplySelect();
  }
  const hWh = document.getElementById('healthWarehouseSelect');
  if (hWh) {
    hWh.innerHTML = state.warehouses.map(w => `<option value="${w.id}">${w.name}</option>`).join('');
  }
}

// Crear nuevo Potrero
function openNewPaddockModal() {
  document.getElementById('newPaddockModal').classList.remove('hidden');
}

async function submitNewPaddock() {
  const name = document.getElementById('newPaddockName').value.trim();
  const ha = parseFloat(document.getElementById('newPaddockHectares').value);
  if (!name || !ha) {
    showToast('Escribe nombre y hectáreas', 'error');
    return;
  }
  try {
    const res = await fetch('/api/paddocks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, hectares: ha })
    });
    if (!res.ok) throw new Error();
    closeModal('newPaddockModal');
    sounds.playPositiveChime();
    showToast('Potrero creado', 'success');
    refreshData();
  } catch {
    showToast('Error al crear el potrero', 'error');
  }
}

// Crear nuevo Lote
function openNewBatchModal() {
  document.getElementById('newBatchModal').classList.remove('hidden');
}

async function submitNewBatch() {
  const name = document.getElementById('newBatchName').value.trim();
  const catId = document.getElementById('newBatchCategory').value;
  const padId = document.getElementById('newBatchPaddock').value;
  const heads = parseInt(document.getElementById('newBatchHeadCount').value);

  if (!name || !heads) {
    showToast('Completa el nombre y la cantidad', 'error');
    return;
  }

  try {
    const res = await fetch('/api/batches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name, category_id: catId, paddock_id: padId, head_count: heads, average_weight_kg: 0
      })
    });
    if (!res.ok) throw new Error();
    closeModal('newBatchModal');
    sounds.playPositiveChime();
    showToast('Lote de vacas creado', 'success');
    refreshData();
  } catch {
    showToast('Error al crear el lote', 'error');
  }
}

// Modal Compra General
function openSupplyMovementModal() {
  document.getElementById('supplyMovementModal').classList.remove('hidden');
}

async function submitSupplyMovement() {
  const supplyId = document.getElementById('supplyMoveSupplySelect').value;
  const whId = document.getElementById('supplyMoveWarehouseSelect').value;
  const qty = parseFloat(document.getElementById('supplyMoveQuantity').value);
  const inv = document.getElementById('supplyMoveInvoice').value;

  if (!qty || qty <= 0) {
    showToast('Ingresa una cantidad válida', 'error');
    return;
  }

  try {
    const res = await fetch('/api/supplies/movement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supply_id: supplyId,
        warehouse_id: whId,
        movement_type: 'ingreso_compra',
        quantity: qty,
        reference_invoice: inv
      })
    });
    if (!res.ok) throw new Error();
    closeModal('supplyMovementModal');
    sounds.playPositiveChime();
    showToast('Entrada guardada', 'success');
    refreshData();
  } catch {
    showToast('Error al guardar la entrada', 'error');
  }
}

// ==================== AUXILIARES ====================

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toastMsg');
  const toastEmoji = document.getElementById('toastEmoji');

  toastMsg.textContent = msg;
  toastEmoji.textContent = type === 'error' ? '❌' : '✅';

  toast.classList.remove('translate-y-24', 'opacity-0');
  toast.classList.add('translate-y-0', 'opacity-100');

  setTimeout(() => {
    toast.classList.remove('translate-y-0', 'opacity-100');
    toast.classList.add('translate-y-24', 'opacity-0');
  }, 3200);
}
