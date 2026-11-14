(() => {
  'use strict';

  const GIST_ID = '59b75b538b54d79b1f4068000714e761';
  const BUILTIN_IMAGES = new Set([
    'artap2.png',
    'Bence_0427.png',
    'dort930656.png',
    'dort930656_2.png',
    'DUNDUS.png',
    'frrrupy.png',
    'geminixi.png',
    'MANDYzZz.png',
    'marcizaza.png',
    'Materetek34566_benceapa2.png',
    'monalokal2011.png',
    'monalokal2011_2.png',
    'nemvagyok2.png',
    'oliver1234.png',
    'SPKIY.png',
    'vadkacsa.png'
  ]);

  const STATUS_ORDER = { priority: 0, scouted: 1, compromised: 2, raided: 3 };
  const TIER_ORDER = { high: 0, medium: 1, low: 2 };
  const STATUS_CYCLE = ['priority', 'scouted', 'compromised', 'raided'];
  const STATUS_LABELS = {
    priority: 'Priority',
    scouted: 'Scouted',
    compromised: 'Alert',
    raided: 'Raided'
  };
  const TIER_LABELS = {
    high: 'High',
    medium: 'Med',
    low: 'Low'
  };

  const state = {
    apiBase: '',
    bases: [],
    untracked: [],
    activeView: 'grid', // 'grid' | 'table' | 'map'
    globalCoordMode: 'overworld', // 'overworld' | 'nether'
    cropMode: 'subject', // 'subject' | 'raw'
    showCardVectors: true,
    filters: {
      query: '',
      status: 'all',
      tiers: new Set(),
      dimensions: new Set(),
      routeOnly: false
    },
    sortBy: 'priority', // 'priority' | 'plate' | 'distance' | 'depth' | 'name' | 'x' | 'tier'
    sortDir: 1, // 1 = asc, -1 = desc
    origin: { x: 0, z: 0, label: 'Spawn (0, 0)' },
    selectedIds: new Set(),
    lastSelectedId: null,
    routeIds: [],
    focusedBaseId: null,
    dossierBaseId: null,
    dossierTransform: { scale: 1, x: 0, y: 0, isDragging: false, startX: 0, startY: 0 },
    mapSelectedId: null,
    tableColumns: {
      plate: true,
      status: true,
      tier: true,
      loot: true,
      ow: true,
      nether: true,
      vector: true,
      meta: false,
      players: false
    },
    tableShowPreview: true,
    tableCompact: false,
    radar: {
      centerX: 0,
      centerZ: 0,
      zoom: 1,
      isDragging: false,
      dragStartX: 0,
      dragStartZ: 0,
      dragDistance: 0,
      hoveredId: null,
      showRegions: true,
      showLabels: true,
      netherScale: false
    },
    cmd: {
      isOpen: false,
      query: '',
      activeIndex: 0,
      items: []
    },
    floatingMenu: {
      menuId: null,
      type: null,
      baseId: null,
      triggerEl: null
    },
    pendingUploadFilename: '',
    lastFocusedElement: null
  };

  const PREFS_KEY = 'recon_ledger_prefs_v1';

  function loadPersistedPrefs() {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (['grid', 'table', 'map'].includes(saved.activeView)) state.activeView = saved.activeView;
      if (['overworld', 'nether'].includes(saved.globalCoordMode)) state.globalCoordMode = saved.globalCoordMode;
      if (['subject', 'raw'].includes(saved.cropMode)) state.cropMode = saved.cropMode;
      if (typeof saved.showCardVectors === 'boolean') state.showCardVectors = saved.showCardVectors;
      if (typeof saved.sortBy === 'string') state.sortBy = saved.sortBy;
      if (saved.sortDir === 1 || saved.sortDir === -1) state.sortDir = saved.sortDir;
      if (saved.origin && typeof saved.origin.x === 'number' && typeof saved.origin.z === 'number') {
        state.origin = {
          x: saved.origin.x,
          z: saved.origin.z,
          label: saved.origin.label || 'Spawn (0, 0)'
        };
      }
      if (Array.isArray(saved.routeIds)) {
        state.routeIds = saved.routeIds.filter(id => typeof id === 'string');
      }
      if (saved.tableColumns && typeof saved.tableColumns === 'object') {
        state.tableColumns = { ...state.tableColumns, ...saved.tableColumns };
      }
      if (typeof saved.tableShowPreview === 'boolean') state.tableShowPreview = saved.tableShowPreview;
      if (typeof saved.tableCompact === 'boolean') state.tableCompact = saved.tableCompact;
    } catch {}
  }

  function savePersistedPrefs() {
    try {
      localStorage.setItem(
        PREFS_KEY,
        JSON.stringify({
          activeView: state.activeView,
          globalCoordMode: state.globalCoordMode,
          cropMode: state.cropMode,
          showCardVectors: state.showCardVectors,
          sortBy: state.sortBy,
          sortDir: state.sortDir,
          origin: state.origin,
          routeIds: state.routeIds,
          tableColumns: state.tableColumns,
          tableShowPreview: state.tableShowPreview,
          tableCompact: state.tableCompact
        })
      );
    } catch {}
  }

  function syncControlsFromState() {
    document.querySelectorAll('.view-segmented .seg-item').forEach(btn => {
      btn.classList.toggle('is-active', btn.dataset.view === state.activeView);
    });
    document.getElementById('view-grid').hidden = state.activeView !== 'grid';
    document.getElementById('view-table').hidden = state.activeView !== 'table';
    document.getElementById('view-map').hidden = state.activeView !== 'map';

    document.querySelectorAll('#global-coord-mode .seg-item').forEach(btn => {
      btn.classList.toggle('is-active', btn.dataset.coordMode === state.globalCoordMode);
    });
    document.querySelectorAll('#toggle-crop-mode .seg-item').forEach(btn => {
      btn.classList.toggle('is-active', btn.dataset.crop === state.cropMode);
    });

    const sortSel = document.getElementById('sort-select');
    if (sortSel) sortSel.value = state.sortBy;
    const sortDirBtn = document.getElementById('btn-sort-dir');
    if (sortDirBtn) sortDirBtn.textContent = state.sortDir === 1 ? '↑ ASC' : '↓ DESC';

    const vecCb = document.getElementById('toggle-card-vectors');
    if (vecCb) vecCb.checked = state.showCardVectors;
    const prevCb = document.getElementById('toggle-table-preview');
    if (prevCb) prevCb.checked = state.tableShowPreview;
    const compCb = document.getElementById('toggle-table-compact');
    if (compCb) compCb.checked = state.tableCompact;

    document.querySelectorAll('#table-col-toggles input[data-col]').forEach(cb => {
      const col = cb.dataset.col;
      if (col in state.tableColumns) cb.checked = Boolean(state.tableColumns[col]);
    });
  }

  // ============================================================================
  // TELEMETRY, NETHER CONVERSION & F3 YAW MATH
  // ============================================================================

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatNumber(n) {
    return Number(n || 0).toLocaleString('en-US');
  }

  function normalizeStatus(s) {
    return ['priority', 'scouted', 'compromised', 'raided'].includes(s) ? s : 'scouted';
  }

  function getNetherCoords(base) {
    if (base.dimension === 'the_end') return null;
    if (base.dimension === 'the_nether') return { x: base.x, y: base.y, z: base.z };
    return {
      x: Math.floor(base.x / 8),
      y: 128,
      z: Math.floor(base.z / 8)
    };
  }

  function getDistanceFrom(base, originX, originZ) {
    const dx = base.x - originX;
    const dz = base.z - originZ;
    const ow = Math.round(Math.hypot(dx, dz));
    const nether = base.dimension === 'overworld' ? Math.round(ow / 8) : null;
    return { ow, nether, dx, dz };
  }

  /**
   * Computes Minecraft's exact F3 Rotation Yaw (-180° to +180°) and compass octant.
   * In Minecraft: +Z = South (0°), -X = West (+90°), -Z = North (±180°), +X = East (-90°)
   */
  function getBearing(fromX, fromZ, toX, toZ) {
    const dx = toX - fromX;
    const dz = toZ - fromZ;
    if (dx === 0 && dz === 0) {
      return { yaw: 0, yawStr: '0.0°', cardinal: 'ORIGIN' };
    }
    const yaw = Math.atan2(-dx, dz) * (180 / Math.PI);
    const yawStr = (yaw >= 0 ? '+' : '') + yaw.toFixed(1) + '°';
    const compassDeg = (Math.atan2(dx, -dz) * (180 / Math.PI) + 360) % 360;
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const cardinal = dirs[Math.round(compassDeg / 45) % 8];
    return { yaw, yawStr, cardinal };
  }

  function sanitizeXaeroToken(str) {
    return String(str || 'Base')
      .replace(/:/g, '-')
      .replace(/[\r\n]+/g, ' ')
      .trim();
  }

  const SMP_SEED = '-614052161281575935';

  function getChunkbaseUrl(x, z, dimension = 'overworld') {
    const dimParam = dimension === 'the_end' ? 'end' : dimension === 'the_nether' ? 'nether' : 'overworld';
    return `https://www.chunkbase.com/apps/seed-map#seed=${SMP_SEED}&platform=java_1_21&dimension=${dimParam}&x=${Math.round(x || 0)}&z=${Math.round(z || 0)}&zoom=0.5`;
  }

  function buildXaeroWaypointData(base, options = {}) {
    const {
      indexPrefix = '',
      coordMode = state.globalCoordMode === 'nether' ? 'nether_roof' : 'exact',
      includeTier = false,
      setName = 'gui.xaero_default',
      disableRaided = true
    } = options;

    let x = base.x;
    let y = base.y;
    let z = base.z;
    let dimSuffix = '';

    if (coordMode === 'nether_roof' && base.dimension === 'overworld') {
      const nc = getNetherCoords(base);
      x = nc.x;
      y = 128;
      z = nc.z;
      dimSuffix = ' [N-ROOF]';
    }

    const prefixStr = indexPrefix ? `${indexPrefix}_` : '';
    const tierChar = base.tier ? base.tier[0].toUpperCase() : 'M';
    const tierTag = includeTier ? ` [${tierChar} Y${base.y}]` : '';
    const rawName = `${prefixStr}${base.name}${tierTag}${dimSuffix}`;
    const name = sanitizeXaeroToken(rawName);

    const initials = indexPrefix
      ? String(indexPrefix).slice(0, 2).toUpperCase()
      : sanitizeXaeroToken(base.name).slice(0, 2).toUpperCase() || 'B';

    const st = normalizeStatus(base.status);
    const defaultColor = st === 'priority' ? 12 : st === 'raided' ? 7 : st === 'compromised' ? 6 : 14;
    const color = base.xaeroColor !== undefined ? Number(base.xaeroColor) : defaultColor;
    const disabled = disableRaided && st === 'raided' ? 'true' : 'false';
    const cleanSet = sanitizeXaeroToken(setName || 'gui.xaero_default');

    return {
      name,
      initials,
      x,
      y,
      z,
      color,
      disabled,
      coordsText: `${x} ${y} ${z}`,
      fileLine: `waypoint:${name}:${initials}:${x}:${y}:${z}:${color}:${disabled}:0:${cleanSet}:false:0:0:false`
    };
  }

  function getPlateSrc(filename) {
    if (!filename) return '';
    if (BUILTIN_IMAGES.has(filename)) {
      return `./plates/${encodeURIComponent(filename)}`;
    }
    return `${state.apiBase}/plates/${encodeURIComponent(filename)}`;
  }

  // ============================================================================
  // TOAST, UNDO & TWO-STEP CONFIRMATION
  // ============================================================================

  let toastTimer = null;
  function showToast(msg, options = {}) {
    const bar = document.getElementById('toast-bar');
    if (!bar) return;
    const { undoLabel = 'Undo', onUndo = null, duration = onUndo ? 5500 : 2400 } = options;
    bar.innerHTML = '';
    const span = document.createElement('span');
    span.textContent = msg;
    bar.appendChild(span);

    if (typeof onUndo === 'function') {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'toast-undo-btn';
      btn.textContent = undoLabel;
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        bar.hidden = true;
        clearTimeout(toastTimer);
        await onUndo();
      });
      bar.appendChild(btn);
    }

    bar.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      bar.hidden = true;
    }, duration);
  }

  function armConfirmButton(btn, confirmText = 'Confirm Delete?') {
    if (!btn) return false;
    if (btn.classList.contains('is-confirming')) {
      btn.classList.remove('is-confirming');
      if (btn.dataset.origLabel) btn.textContent = btn.dataset.origLabel;
      clearTimeout(btn._confirmTimer);
      return true;
    }
    btn.dataset.origLabel = btn.textContent;
    btn.textContent = confirmText;
    btn.classList.add('is-confirming');
    clearTimeout(btn._confirmTimer);
    btn._confirmTimer = setTimeout(() => {
      btn.classList.remove('is-confirming');
      if (btn.dataset.origLabel) btn.textContent = btn.dataset.origLabel;
    }, 3200);
    return false;
  }

  function flashInlineCopied(el, tempText = '✓ Copied') {
    if (!el) return;
    if (!el.dataset.origText) {
      el.dataset.origText = el.textContent;
    }
    el.classList.add('is-copied');
    el.textContent = tempText;
    clearTimeout(el._copyTimer);
    el._copyTimer = setTimeout(() => {
      el.classList.remove('is-copied');
      if (el.dataset.origText) {
        el.textContent = el.dataset.origText;
      }
    }, 1350);
  }

  async function copyText(text, label = 'Copied to clipboard', triggerEl = null, inlineLabel = '✓ Copied') {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    if (triggerEl) {
      flashInlineCopied(triggerEl, inlineLabel);
    }
    showToast(label);
  }

  // ============================================================================
  // API & DYNAMIC TUNNEL SYNC
  // ============================================================================

  async function resolveApiBase() {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.trycloudflare.com')) {
      state.apiBase = '';
      return '';
    }
    try {
      const gistRes = await fetch(`https://api.github.com/gists/${GIST_ID}`, { cache: 'no-store' });
      if (gistRes.ok) {
        const gistData = await gistRes.json();
        const content = gistData?.files?.['tunnel.json']?.content;
        if (content) {
          const parsed = JSON.parse(content);
          if (parsed.apiUrl) {
            state.apiBase = parsed.apiUrl.replace(/\/+$/, '');
            return state.apiBase;
          }
        }
      }
    } catch {}

    try {
      const rawRes = await fetch(
        `https://gist.githubusercontent.com/zenzty/${GIST_ID}/raw/tunnel.json?t=${Date.now()}`,
        { cache: 'no-store' }
      );
      if (rawRes.ok) {
        const parsed = await rawRes.json();
        if (parsed.apiUrl) {
          state.apiBase = parsed.apiUrl.replace(/\/+$/, '');
          return state.apiBase;
        }
      }
    } catch {}
    return state.apiBase;
  }

  async function fetchBases() {
    await resolveApiBase();
    try {
      const res = await fetch(`${state.apiBase}/api/bases`, { cache: 'no-store' });
      if (!res.ok) throw new Error('API non-200');
      const data = await res.json();
      state.bases = data.bases || [];
      state.untracked = data.untracked || [];
    } catch {
      const fallbackRes = await fetch(`./bases.json?t=${Date.now()}`);
      state.bases = (await fallbackRes.json()) || [];
      state.untracked = [];
    }
    const validIds = new Set(state.bases.map(b => b.id));
    state.routeIds = state.routeIds.filter(id => validIds.has(id));
    if (!state.focusedBaseId && state.bases.length > 0) {
      state.focusedBaseId = state.bases[0].id;
    }
    populateOriginSelect();
    renderAll();
  }

  async function updateBase(id, patch) {
    try {
      const res = await fetch(`${state.apiBase}/api/bases/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch)
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      state.bases = data.bases;
      populateOriginSelect();
      renderAll();
      return data.base;
    } catch {
      // Optimistic local update if offline
      const idx = state.bases.findIndex(b => b.id === id);
      if (idx !== -1) {
        state.bases[idx] = { ...state.bases[idx], ...patch };
        renderAll();
        return state.bases[idx];
      }
      showToast('Failed to save changes');
      return null;
    }
  }

  async function bulkUpdateBases(ids, patch, action = null) {
    try {
      const res = await fetch(`${state.apiBase}/api/bases/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, patch, action })
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      state.bases = data.bases;
      if (action === 'delete') {
        ids.forEach(id => {
          state.selectedIds.delete(id);
          state.routeIds = state.routeIds.filter(rid => rid !== id);
        });
      }
      populateOriginSelect();
      renderAll();
      return true;
    } catch {
      const idSet = new Set(ids);
      if (action === 'delete') {
        state.bases = state.bases.filter(b => !idSet.has(b.id));
        ids.forEach(id => state.selectedIds.delete(id));
      } else if (patch) {
        state.bases = state.bases.map(b => (idSet.has(b.id) ? { ...b, ...patch } : b));
      }
      renderAll();
      return true;
    }
  }

  async function restoreBases(deletedBases) {
    if (!deletedBases || deletedBases.length === 0) return;
    try {
      const res = await fetch(`${state.apiBase}/api/bases/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restore', items: deletedBases })
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      state.bases = data.bases;
    } catch {
      const existingIds = new Set(state.bases.map(b => b.id));
      deletedBases.forEach(b => {
        if (b && b.id && !existingIds.has(b.id)) state.bases.push(b);
      });
    }
    populateOriginSelect();
    renderAll();
    showToast(`Restored ${deletedBases.length} base(s)`);
  }

  async function createBase(payload) {
    try {
      const res = await fetch(`${state.apiBase}/api/bases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      state.bases = data.bases;
      state.untracked = state.untracked.filter(
        f => f.toLowerCase() !== String(payload.image || '').toLowerCase()
      );
      populateOriginSelect();
      renderAll();
      return data.base;
    } catch {
      showToast('Failed to add base');
      return null;
    }
  }

  async function deleteBase(id) {
    const snapshot = state.bases.find(b => b.id === id);
    try {
      const res = await fetch(`${state.apiBase}/api/bases/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        const data = await res.json();
        state.bases = data.bases;
        state.selectedIds.delete(id);
        state.routeIds = state.routeIds.filter(rid => rid !== id);
        populateOriginSelect();
        renderAll();
        return snapshot ? [snapshot] : [];
      }
    } catch {
      showToast('Failed to delete base');
    }
    return [];
  }

  // ============================================================================
  // FILTERING & SORTING
  // ============================================================================

  function getFilteredBases() {
    const q = state.filters.query.trim().toLowerCase();
    const list = state.bases.filter(b => {
      const st = normalizeStatus(b.status);
      if (state.filters.status !== 'all' && st !== state.filters.status) return false;
      if (state.filters.tiers.size > 0 && !state.filters.tiers.has(b.tier || 'medium')) return false;
      if (state.filters.dimensions.size > 0 && !state.filters.dimensions.has(b.dimension || 'overworld')) return false;
      if (state.filters.routeOnly && !state.routeIds.includes(b.id)) return false;

      if (q) {
        const hay = [
          b.plate,
          b.name,
          b.biome,
          b.region,
          b.containers,
          b.notes,
          ...(b.players || []),
          `${b.x} ${b.y} ${b.z}`
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const dir = state.sortDir;
    list.sort((a, b) => {
      switch (state.sortBy) {
        case 'priority': {
          const sDiff = (STATUS_ORDER[normalizeStatus(a.status)] ?? 9) - (STATUS_ORDER[normalizeStatus(b.status)] ?? 9);
          if (sDiff !== 0) return sDiff * dir;
          const tDiff = (TIER_ORDER[a.tier || 'medium'] ?? 9) - (TIER_ORDER[b.tier || 'medium'] ?? 9);
          if (tDiff !== 0) return tDiff * dir;
          return a.name.localeCompare(b.name);
        }
        case 'tier':
          return ((TIER_ORDER[a.tier || 'medium'] ?? 9) - (TIER_ORDER[b.tier || 'medium'] ?? 9)) * dir;
        case 'distance': {
          const da = getDistanceFrom(a, state.origin.x, state.origin.z).ow;
          const db = getDistanceFrom(b, state.origin.x, state.origin.z).ow;
          return (da - db) * dir;
        }
        case 'depth':
          return (a.y - b.y) * dir;
        case 'x':
          return (a.x - b.x) * dir;
        case 'name':
          return a.name.localeCompare(b.name) * dir;
        case 'plate':
        default:
          return String(a.plate).localeCompare(String(b.plate), undefined, { numeric: true }) * dir;
      }
    });

    return list;
  }

  // ============================================================================
  // RENDERING: HEADER, COUNTS, FACETS & BULK BAR
  // ============================================================================

  function populateOriginSelect() {
    const sel = document.getElementById('origin-select');
    if (!sel) return;
    const currentVal = sel.value || '0,0';
    const options = [
      `<option value="0,0">World Spawn (0, 0)</option>`,
      ...state.bases
        .filter(b => b.dimension !== 'the_end')
        .map(b => `<option value="${b.x},${b.z}">${escapeHtml(b.plate)} · ${escapeHtml(b.name)} (${b.x}, ${b.z})</option>`)
    ];
    sel.innerHTML = options.join('');
    if ([...sel.options].some(o => o.value === currentVal)) {
      sel.value = currentVal;
    }
  }

  function renderHeaderAndCounts() {
    const total = state.bases.length;
    const priority = state.bases.filter(b => normalizeStatus(b.status) === 'priority').length;
    const scouted = state.bases.filter(b => normalizeStatus(b.status) === 'scouted').length;
    const compromised = state.bases.filter(b => normalizeStatus(b.status) === 'compromised').length;
    const raided = state.bases.filter(b => normalizeStatus(b.status) === 'raided').length;

    const parts = [`${total} cataloged`, `${priority} priority`, `${scouted} scouted`];
    if (raided > 0) parts.push(`${raided} raided`);
    document.getElementById('header-summary').textContent = parts.join(' · ');

    document.getElementById('active-origin-pill').textContent = `Origin: ${state.origin.label}`;

    document.getElementById('count-all').textContent = total;
    document.getElementById('count-priority').textContent = priority;
    document.getElementById('count-scouted').textContent = scouted;
    document.getElementById('count-compromised').textContent = compromised;
    document.getElementById('count-raided').textContent = raided;

    // Facet counts
    ['high', 'medium', 'low'].forEach(t => {
      const el = document.getElementById(`facet-count-tier-${t}`);
      if (el) el.textContent = state.bases.filter(b => (b.tier || 'medium') === t).length;
    });
    ['overworld', 'the_end', 'the_nether'].forEach(d => {
      const el = document.getElementById(`facet-count-dim-${d}`);
      if (el) el.textContent = state.bases.filter(b => (b.dimension || 'overworld') === d).length;
    });

    // Route count badge
    const routeBadge = document.getElementById('header-route-count');
    routeBadge.textContent = state.routeIds.length;
    routeBadge.classList.toggle('has-items', state.routeIds.length > 0);

    // Coordinate mode indicator
    document.getElementById('coord-mode-indicator').textContent =
      state.globalCoordMode === 'nether' ? 'Mode: Nether ÷8' : 'Nether ÷8';

    // Untracked banner
    const banner = document.getElementById('untracked-banner');
    if (state.untracked.length > 0) {
      banner.hidden = false;
      document.getElementById('untracked-list-text').textContent =
        `${state.untracked.length} new screenshot(s) detected in folder: ${state.untracked.join(', ')}`;
      document.getElementById('untracked-buttons').innerHTML = state.untracked
        .slice(0, 4)
        .map(
          fname =>
            `<button type="button" class="btn-secondary btn-xs" data-ingest-file="${escapeHtml(fname)}">+ Catalog ${escapeHtml(fname)}</button>`
        )
        .join('');
    } else {
      banner.hidden = true;
    }

    renderActiveFacetChips();
    renderBulkActionBar();
  }

  function renderActiveFacetChips() {
    const wrap = document.getElementById('active-filter-chips');
    const badge = document.getElementById('active-facet-count');
    const chips = [];

    state.filters.tiers.forEach(t => {
      chips.push(
        `<span class="filter-chip">Tier: ${TIER_LABELS[t] || t} <button type="button" data-remove-facet="tier:${t}" aria-label="Remove tier filter">×</button></span>`
      );
    });
    state.filters.dimensions.forEach(d => {
      const label = d === 'the_end' ? 'The End' : d === 'the_nether' ? 'Nether' : 'Overworld';
      chips.push(
        `<span class="filter-chip">Dim: ${label} <button type="button" data-remove-facet="dim:${d}" aria-label="Remove dimension filter">×</button></span>`
      );
    });
    if (state.filters.routeOnly) {
      chips.push(
        `<span class="filter-chip">In Route (${state.routeIds.length}) <button type="button" data-remove-facet="route" aria-label="Remove route filter">×</button></span>`
      );
    }

    const count = chips.length;
    badge.textContent = count;
    badge.hidden = count === 0;

    if (count > 0) {
      chips.push(`<button type="button" class="btn-link" id="btn-clear-chips">Reset</button>`);
    }
    wrap.innerHTML = chips.join('');
  }

  function renderBulkActionBar() {
    const bar = document.getElementById('bulk-action-bar');
    const count = state.selectedIds.size;
    bar.hidden = count === 0;
    const delBtn = document.getElementById('btn-bulk-delete');
    if (delBtn && delBtn.classList.contains('is-confirming')) {
      delBtn.classList.remove('is-confirming');
      delBtn.textContent = 'Delete';
    }
    if (count > 0) {
      document.getElementById('bulk-selected-count').textContent = `${count} selected`;
    }
  }

  function syncSelectionStateDOM() {
    document.querySelectorAll('#bases-grid .base-card[data-base-id]').forEach(card => {
      const id = card.dataset.baseId;
      const selected = state.selectedIds.has(id);
      card.classList.toggle('is-selected', selected);
      const chip = card.querySelector('[data-select-chip]');
      if (chip) {
        chip.classList.toggle('is-checked', selected);
        chip.setAttribute('aria-pressed', String(selected));
        const box = chip.querySelector('.select-box-icon');
        if (box) box.textContent = selected ? '✓' : '';
      }
    });

    document.querySelectorAll('#bases-tbody tr[data-base-id]').forEach(tr => {
      const id = tr.dataset.baseId;
      const selected = state.selectedIds.has(id);
      tr.classList.toggle('is-selected', selected);
      const cb = tr.querySelector('input[data-select-id]');
      if (cb) cb.checked = selected;
    });

    const checkAll = document.getElementById('table-check-all');
    if (checkAll) {
      const filtered = getFilteredBases();
      const visibleIds = filtered.map(b => b.id);
      const selectedVisibleCount = visibleIds.filter(id => state.selectedIds.has(id)).length;
      checkAll.checked = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;
      checkAll.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < visibleIds.length;
    }

    renderBulkActionBar();
  }

  function syncRouteStateDOM() {
    savePersistedPrefs();
    renderHeaderAndCounts();
    renderRouteDrawer();

    if (state.filters.routeOnly || state.activeView === 'map') {
      renderAll();
      return;
    }

    document.querySelectorAll('#bases-grid .base-card[data-base-id]').forEach(card => {
      const id = card.dataset.baseId;
      const rIdx = state.routeIds.indexOf(id);
      const inRoute = rIdx !== -1;
      const chip = card.querySelector('.card-route-chip[data-toggle-route]');
      if (chip) {
        chip.classList.toggle('in-route', inRoute);
        chip.textContent = inRoute ? `Stop #${rIdx + 1}` : '+ Route';
      }
    });

    document.querySelectorAll('#bases-tbody tr[data-base-id]').forEach(tr => {
      const id = tr.dataset.baseId;
      const rIdx = state.routeIds.indexOf(id);
      const inRoute = rIdx !== -1;
      const btn = tr.querySelector('.tbl-action-btn[data-toggle-route]');
      if (btn) {
        btn.classList.toggle('in-route', inRoute);
        btn.textContent = inRoute ? `#${rIdx + 1}` : '+Route';
      }
    });
  }

  // ============================================================================
  // VIEW 1: PHOTO GRID
  // ============================================================================

  function renderGrid(filtered) {
    const grid = document.getElementById('bases-grid');
    grid.classList.toggle('crop-subject', state.cropMode === 'subject');

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div style="grid-column:1/-1;padding:64px 0;text-align:center;color:var(--text-muted);display:flex;flex-direction:column;align-items:center;gap:12px;">
          <div>No bases match the current filters.</div>
          <button type="button" class="btn-secondary btn-sm" data-reset-all-filters>Reset All Filters</button>
        </div>
      `;
      return;
    }

    grid.innerHTML = filtered
      .map(base => {
        const st = normalizeStatus(base.status);
        const stLabel = STATUS_LABELS[st] || 'Scouted';
        const tier = base.tier || 'medium';
        const nc = getNetherCoords(base);
        const dist = getDistanceFrom(base, state.origin.x, state.origin.z);
        const bearing = getBearing(state.origin.x, state.origin.z, base.x, base.z);
        const imgSrc = getPlateSrc(base.image);
        const focusOrigin = base.cropFocus || '50% 50%';
        const isSelected = state.selectedIds.has(base.id);
        const routeIdx = state.routeIds.indexOf(base.id);
        const isInRoute = routeIdx !== -1;

        const xyzCopy = `${base.x} ${base.y} ${base.z}`;
        const netherCopy = nc ? `${nc.x} 128 ${nc.z}` : '';
        const summary = base.containers || base.notes || 'No field notes recorded';

        const primaryCoordHtml =
          state.globalCoordMode === 'nether' && nc
            ? `<span class="coord-xyz" style="color:var(--accent-nether);" data-copy="${escapeHtml(netherCopy)}" title="Click to copy Nether Roof XYZ">N: ${nc.x}, 128, ${nc.z}</span>
               <span class="coord-nether" style="color:var(--text-muted);" data-copy="${escapeHtml(xyzCopy)}" title="Click to copy Overworld XYZ">· OW: ${base.x}, ${base.z}</span>`
            : `<span class="coord-xyz" data-copy="${escapeHtml(xyzCopy)}" title="Click to copy Overworld XYZ">${base.x}, ${base.y}, ${base.z}</span>
               ${
                 nc
                   ? `<span class="coord-nether" data-copy="${escapeHtml(netherCopy)}" title="Click to copy Nether Roof coordinates (X÷8, 128, Z÷8)">· N: ${nc.x}, ${nc.z}</span>`
                   : `<span class="coord-nether" style="color:var(--text-muted);">· End</span>`
               }`;

        return `
          <article
            class="base-card ${st === 'raided' ? 'is-raided' : ''} ${isSelected ? 'is-selected' : ''} ${isInRoute ? 'in-route' : ''}"
            data-base-id="${escapeHtml(base.id)}"
          >
            <div class="card-media-overlay">
              <button
                type="button"
                class="card-select-chip ${isSelected ? 'is-checked' : ''}"
                data-select-chip="${escapeHtml(base.id)}"
                aria-pressed="${isSelected}"
                title="Select for bulk editing (Shift+Click for range)"
              >
                <span class="select-box-icon" aria-hidden="true">${isSelected ? '✓' : ''}</span>
                <span>Select</span>
              </button>

              <button
                type="button"
                class="card-route-chip ${isInRoute ? 'is-routed' : ''}"
                data-toggle-route="${escapeHtml(base.id)}"
                title="${isInRoute ? 'Click to remove from Raid Route' : 'Add to Raid Route Planner'}"
              >
                ${isInRoute ? `Route #0${routeIdx + 1}` : '+ Route'}
              </button>
            </div>

            <div class="card-media" data-open-dossier="${escapeHtml(base.id)}">
              ${
                imgSrc
                  ? `<img src="${imgSrc}" alt="${escapeHtml(base.name)}" loading="lazy" style="transform-origin:${escapeHtml(focusOrigin)};object-position:${escapeHtml(focusOrigin)};" />`
                  : `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);font-size:12px;">No screenshot</div>`
              }
            </div>

            <div class="card-body">
              <div class="card-header-row">
                <div class="card-title-wrap">
                  <span class="card-plate-idx">${escapeHtml(base.plate || '')}</span>
                  <h2 class="card-title" data-open-dossier="${escapeHtml(base.id)}">${escapeHtml(base.name)}</h2>
                  ${base.dimension === 'the_end' ? `<span class="dim-pill">END</span>` : ''}
                  ${base.dimension === 'the_nether' ? `<span class="dim-pill">NETHER</span>` : ''}
                  ${tier === 'high' ? `<button type="button" class="tier-pill tier-high" data-tier-picker="${escapeHtml(base.id)}" title="Click to change Loot Tier">HIGH</button>` : ''}
                </div>

                <div class="card-header-right">
                  <button
                    type="button"
                    class="status-tag is-${st}"
                    data-status-picker="${escapeHtml(base.id)}"
                    title="Click to change status (Alt+Click to cycle)"
                  >
                    <span class="status-dot dot-${st}"></span>
                    <span>${stLabel}</span>
                  </button>
                  <button
                    type="button"
                    class="btn-row-menu"
                    data-open-ctx="${escapeHtml(base.id)}"
                    aria-label="More actions for ${escapeHtml(base.name)}"
                    title="More actions (Right-click anywhere on card)"
                  >⋯</button>
                </div>
              </div>

              <p class="card-desc" title="${escapeHtml(summary)}">${escapeHtml(summary)}</p>

              ${
                state.showCardVectors
                  ? `<div class="card-vector-line">
                       <span>Δ ${formatNumber(dist.ow)}m OW ${dist.nether !== null ? `(${formatNumber(dist.nether)}m N)` : ''}</span>
                       <span>Yaw ${bearing.cardinal} ${bearing.yawStr}</span>
                     </div>`
                  : ''
              }

              <div class="card-footer-row">
                <div class="coord-group">
                  ${primaryCoordHtml}
                </div>

                <button
                  type="button"
                  class="xaero-copy-btn"
                  data-copy-xaero="${escapeHtml(base.id)}"
                  title="Copy local Xaero waypoint file line (for mw$default_1.txt)"
                >
                  Copy Xaero
                </button>
              </div>
            </div>
          </article>
        `;
      })
      .join('');
  }

  // ============================================================================
  // VIEW 2: TANSTACK-INSPIRED POWER DATA TABLE + DOCKED PREVIEW
  // ============================================================================

  function renderTable(filtered) {
    const table = document.getElementById('bases-table');
    const tbody = document.getElementById('bases-tbody');
    const previewPane = document.getElementById('table-preview-pane');
    const togglePreviewBtn = document.getElementById('btn-toggle-preview-inline');

    table.classList.toggle('is-compact', state.tableCompact);
    previewPane.hidden = !state.tableShowPreview;
    if (togglePreviewBtn) {
      togglePreviewBtn.textContent = state.tableShowPreview ? 'Hide Preview Pane' : 'Show Preview Pane';
    }

    document.getElementById('table-row-summary').textContent =
      `Showing ${filtered.length} of ${state.bases.length} bases`;

    // Update Master Checkbox indeterminate/checked state
    const checkAll = document.getElementById('table-check-all');
    if (checkAll) {
      const visibleIds = filtered.map(b => b.id);
      const selectedVisibleCount = visibleIds.filter(id => state.selectedIds.has(id)).length;
      checkAll.checked = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;
      checkAll.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < visibleIds.length;
    }

    // Update Column Visibility & Sort Headers
    document.querySelectorAll('#bases-table thead th[data-col-id]').forEach(th => {
      const colId = th.dataset.colId;
      if (colId !== 'name') {
        th.hidden = !state.tableColumns[colId];
      }
    });

    document.querySelectorAll('#bases-table thead th.th-sortable').forEach(th => {
      const isSorted = th.dataset.sort === state.sortBy;
      th.classList.toggle('is-sorted', isSorted);
      const baseLabel = th.dataset.baseLabel || th.textContent.replace(/\s*[↑↓]$/, '');
      th.dataset.baseLabel = baseLabel;
      th.textContent = isSorted ? `${baseLabel} ${state.sortDir === 1 ? '↑' : '↓'}` : baseLabel;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="12" style="padding:48px 18px;text-align:center;color:var(--text-muted);"><div style="display:flex;flex-direction:column;align-items:center;gap:10px;"><span>No matching bases found.</span><button type="button" class="btn-secondary btn-xs" data-reset-all-filters>Reset All Filters</button></div></td></tr>`;
      return;
    }

    tbody.innerHTML = filtered
      .map(base => {
        const st = normalizeStatus(base.status);
        const stLabel = STATUS_LABELS[st] || 'Scouted';
        const tier = base.tier || 'medium';
        const nc = getNetherCoords(base);
        const dist = getDistanceFrom(base, state.origin.x, state.origin.z);
        const bearing = getBearing(state.origin.x, state.origin.z, base.x, base.z);
        const isSelected = state.selectedIds.has(base.id);
        const isFocused = state.focusedBaseId === base.id;
        const routeIdx = state.routeIds.indexOf(base.id);
        const summary = base.containers || base.notes || '—';
        const xyzCopy = `${base.x} ${base.y} ${base.z}`;
        const netherCopy = nc ? `${nc.x} 128 ${nc.z}` : '';

        return `
          <tr
            class="${st === 'raided' ? 'is-raided' : ''} ${isSelected ? 'is-selected' : ''} ${isFocused ? 'is-focused' : ''}"
            data-base-id="${escapeHtml(base.id)}"
          >
            <td class="col-check">
              <input
                type="checkbox"
                data-select-id="${escapeHtml(base.id)}"
                ${isSelected ? 'checked' : ''}
                aria-label="Select ${escapeHtml(base.name)}"
              />
            </td>

            <td class="mono" style="color:var(--text-muted);" ${!state.tableColumns.plate ? 'hidden' : ''}>
              ${escapeHtml(base.plate || '—')}
            </td>

            <td data-name-cell="${escapeHtml(base.id)}">
              <div style="display:flex;align-items:center;gap:6px;">
                <button type="button" class="row-title-btn" data-open-dossier="${escapeHtml(base.id)}" title="Inspect Dossier &amp; F3 Loupe">
                  <span class="status-dot dot-${st}"></span>
                  <span>${escapeHtml(base.name)}</span>
                </button>
                <button
                  type="button"
                  class="btn-inline-rename"
                  data-inline-rename="${escapeHtml(base.id)}"
                  aria-label="Rename ${escapeHtml(base.name)} inline"
                  title="Rename inline (F2)"
                >✎</button>
                ${base.dimension === 'the_end' ? `<span class="dim-pill">END</span>` : ''}
                ${base.dimension === 'the_nether' ? `<span class="dim-pill">NETHER</span>` : ''}
                ${routeIdx !== -1 ? `<span class="route-step-pill">#0${routeIdx + 1}</span>` : ''}
              </div>
            </td>

            <td ${!state.tableColumns.status ? 'hidden' : ''}>
              <button
                type="button"
                class="status-tag is-${st}"
                data-status-picker="${escapeHtml(base.id)}"
                title="Click to select status"
              >
                <span class="status-dot dot-${st}"></span>
                <span>${stLabel}</span>
              </button>
            </td>

            <td ${!state.tableColumns.tier ? 'hidden' : ''}>
              <button
                type="button"
                class="tier-pill ${tier === 'high' ? 'tier-high' : ''}"
                data-tier-picker="${escapeHtml(base.id)}"
                title="Click to change Loot Tier"
              >
                ${TIER_LABELS[tier] || 'Med'} ▾
              </button>
            </td>

            <td
              class="editable-cell"
              data-inline-edit="${escapeHtml(base.id)}"
              data-edit-field="containers"
              title="Double-click to edit loot summary inline"
              ${!state.tableColumns.loot ? 'hidden' : ''}
            >
              ${escapeHtml(summary)}
            </td>

            <td class="num" ${!state.tableColumns.ow ? 'hidden' : ''}>
              <span class="coord-xyz" data-copy="${escapeHtml(xyzCopy)}" title="Click to copy Overworld XYZ">
                ${base.x}, ${base.y}, ${base.z}
              </span>
            </td>

            <td class="num" ${!state.tableColumns.nether ? 'hidden' : ''}>
              ${
                nc
                  ? `<span class="coord-nether" data-copy="${escapeHtml(netherCopy)}" title="Click to copy Nether Roof XYZ (X÷8, 128, Z÷8)">${nc.x}, 128, ${nc.z}</span>`
                  : `<span style="color:var(--text-muted);">—</span>`
              }
            </td>

            <td class="num" style="color:var(--text-secondary);" ${!state.tableColumns.vector ? 'hidden' : ''} title="${dist.nether !== null ? `Nether distance: ${formatNumber(dist.nether)}m` : 'The End'}">
              <span>${formatNumber(dist.ow)}m</span>
              <span style="color:var(--text-muted);margin-left:4px;">· ${bearing.cardinal} ${bearing.yawStr}</span>
            </td>

            <td class="mono" style="color:var(--text-secondary);font-size:11.5px;" ${!state.tableColumns.meta ? 'hidden' : ''}>
              ${escapeHtml((base.biome || '—').replace('minecraft:', ''))}
            </td>

            <td style="color:var(--text-secondary);font-size:12px;" ${!state.tableColumns.players ? 'hidden' : ''}>
              ${escapeHtml((base.players || []).join(', ') || '—')}
            </td>

            <td class="num">
              <div style="display:inline-flex;align-items:center;gap:4px;">
                <button type="button" class="xaero-copy-btn" data-copy-xaero="${escapeHtml(base.id)}" title="Copy local Xaero waypoint file line">
                  Xaero
                </button>
                <button
                  type="button"
                  class="xaero-copy-btn ${routeIdx !== -1 ? 'is-copied' : ''}"
                  data-toggle-route="${escapeHtml(base.id)}"
                  title="Toggle in Raid Route"
                >
                  ${routeIdx !== -1 ? `#0${routeIdx + 1}` : '+Route'}
                </button>
                <button
                  type="button"
                  class="btn-row-menu"
                  data-open-ctx="${escapeHtml(base.id)}"
                  aria-label="More actions"
                >⋯</button>
              </div>
            </td>
          </tr>
        `;
      })
      .join('');

    renderTableSidePreview();
  }

  function renderTableSidePreview() {
    if (!state.tableShowPreview) return;
    const base = state.bases.find(b => b.id === state.focusedBaseId) || state.bases[0];
    if (!base) return;

    const st = normalizeStatus(base.status);
    const stLabel = STATUS_LABELS[st] || 'Scouted';
    const nc = getNetherCoords(base);
    const dist = getDistanceFrom(base, state.origin.x, state.origin.z);
    const bearing = getBearing(state.origin.x, state.origin.z, base.x, base.z);
    const routeIdx = state.routeIds.indexOf(base.id);

    document.getElementById('preview-plate').textContent = `PLATE ${base.plate || '01'}`;
    document.getElementById('preview-name').textContent = base.name;
    document.getElementById('preview-status-slot').innerHTML = `
      <button type="button" class="status-tag is-${st}" data-status-picker="${escapeHtml(base.id)}">
        <span class="status-dot dot-${st}"></span><span>${stLabel}</span>
      </button>
    `;

    const imgEl = document.getElementById('preview-img');
    imgEl.src = getPlateSrc(base.image);
    document.getElementById('preview-image-wrap').dataset.openDossier = base.id;

    document.getElementById('preview-specs').innerHTML = `
      <div class="spec-row">
        <span class="spec-key">OVERWORLD XYZ</span>
        <span class="coord-xyz" data-copy="${base.x} ${base.y} ${base.z}">${base.x}, ${base.y}, ${base.z}</span>
      </div>
      <div class="spec-row">
        <span class="spec-key">NETHER ROOF (÷8)</span>
        ${
          nc
            ? `<span class="coord-nether" data-copy="${nc.x} 128 ${nc.z}">${nc.x}, 128, ${nc.z}</span>`
            : `<span style="color:var(--text-muted);">The End</span>`
        }
      </div>
      <div class="spec-row">
        <span class="spec-key">VECTOR / F3 YAW</span>
        <span>${formatNumber(dist.ow)}m · ${bearing.cardinal} (${bearing.yawStr})</span>
      </div>
      <div class="spec-row">
        <span class="spec-key">BIOME</span>
        <span>${escapeHtml((base.biome || '—').replace('minecraft:', ''))}</span>
      </div>
      <div class="spec-row">
        <span class="spec-key">SPOTTED PLAYERS</span>
        <span>${escapeHtml((base.players || []).join(', ') || '—')}</span>
      </div>
      <p style="font-size:12px;color:var(--text-secondary);line-height:1.45;margin-top:4px;">
        ${escapeHtml(base.containers || '')}${base.notes ? ` — ${escapeHtml(base.notes)}` : ''}
      </p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px;">
        <button type="button" class="btn-primary btn-sm" data-copy-xaero="${escapeHtml(base.id)}" title="Copy local Xaero waypoint file line">Copy Xaero</button>
        <button type="button" class="btn-secondary btn-sm" data-toggle-route="${escapeHtml(base.id)}">
          ${routeIdx !== -1 ? `In Route (#0${routeIdx + 1})` : '+ Add to Route'}
        </button>
      </div>
      <button type="button" class="btn-secondary btn-sm" data-open-dossier="${escapeHtml(base.id)}" style="width:100%;">
        Open Full Dossier &amp; F3 Loupe
      </button>
    `;
  }

  // ============================================================================
  // VIEW 3: 2D COORDINATE MAP & RAID ROUTE SEQUENCER
  // ============================================================================

  const LABEL_OFFSETS = {
    dort930656: { dx: 9, dy: -7 },
    dort930656_2: { dx: 9, dy: -6 },
    monalokal2011: { dx: 9, dy: -6 },
    monalokal2011_2: { dx: 9, dy: -6 },
    frrrupy: { dx: 9, dy: 14 },
    nemvagyok2: { dx: 9, dy: -6 },
    SPKIY: { dx: 9, dy: 12 }
  };

  function drawMapCanvas() {
    const canvas = document.getElementById('radar-canvas');
    const container = document.getElementById('radar-container');
    if (!canvas || !container || state.activeView !== 'map') return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));

    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.scale(dpr, dpr);

    const W = rect.width;
    const H = rect.height;

    ctx.fillStyle = '#080908';
    ctx.fillRect(0, 0, W, H);

    const worldSpan = 26800 / state.radar.zoom;
    const pxPerBlock = Math.min(W, H) / worldSpan;

    const toScreenX = wx => W / 2 + (wx - state.radar.centerX) * pxPerBlock;
    const toScreenY = wz => H / 2 + (wz - state.radar.centerZ) * pxPerBlock;

    // 1. Optional 512m Region Grid
    if (state.radar.showRegions && pxPerBlock * 512 >= 12) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.022)';
      ctx.lineWidth = 1;
      const startReg = Math.floor(-10500 / 512) * 512;
      ctx.beginPath();
      for (let r = startReg; r <= 10500; r += 512) {
        const sx = toScreenX(r);
        const sy = toScreenY(r);
        if (sx >= 0 && sx <= W) {
          ctx.moveTo(sx, 0);
          ctx.lineTo(sx, H);
        }
        if (sy >= 0 && sy <= H) {
          ctx.moveTo(0, sy);
          ctx.lineTo(W, sy);
        }
      }
      ctx.stroke();
    }

    // 2. 2000-block Grid Lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.045)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let g = -10000; g <= 10000; g += 2000) {
      const sx = toScreenX(g);
      const sy = toScreenY(g);
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, H);
      ctx.moveTo(0, sy);
      ctx.lineTo(W, sy);
    }
    ctx.stroke();

    // 3. 0,0 Origin Axes
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.beginPath();
    ctx.moveTo(toScreenX(0), 0);
    ctx.lineTo(toScreenX(0), H);
    ctx.moveTo(0, toScreenY(0));
    ctx.lineTo(W, toScreenY(0));
    ctx.stroke();

    // 4. ±10,000 World Border
    const wbL = toScreenX(-10000);
    const wbR = toScreenX(10000);
    const wbT = toScreenY(-10000);
    const wbB = toScreenY(10000);
    ctx.strokeStyle = 'rgba(232, 106, 71, 0.25)';
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(wbL, wbT, wbR - wbL, wbB - wbT);
    ctx.setLineDash([]);

    // 5. Active Raid Route Vector Path with Directional Arrowheads
    if (state.routeIds.length > 0) {
      let prevSX = toScreenX(state.origin.x);
      let prevSY = toScreenY(state.origin.z);

      state.routeIds.forEach((id, idx) => {
        const b = state.bases.find(item => item.id === id);
        if (!b || b.dimension === 'the_end') return;
        const sx = toScreenX(b.x);
        const sy = toScreenY(b.z);

        ctx.strokeStyle = '#e86a47';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(prevSX, prevSY);
        ctx.lineTo(sx, sy);
        ctx.stroke();

        const midX = (prevSX + sx) / 2;
        const midY = (prevSY + sy) / 2;
        const angle = Math.atan2(sy - prevSY, sx - prevSX);
        const legLen = Math.hypot(sx - prevSX, sy - prevSY);

        if (legLen > 24) {
          ctx.save();
          ctx.translate(midX, midY);
          ctx.rotate(angle);
          ctx.fillStyle = '#e86a47';
          ctx.beginPath();
          ctx.moveTo(5, 0);
          ctx.lineTo(-4, -3.5);
          ctx.lineTo(-4, 3.5);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }

        ctx.save();
        ctx.fillStyle = '#e86a47';
        ctx.font = '600 10px "IBM Plex Mono", monospace';
        ctx.fillText(`L0${idx + 1}`, midX + 7, midY - 5);
        ctx.restore();

        prevSX = sx;
        prevSY = sy;
      });
    }

    // 6. Active Vector Origin Crosshair
    const origSX = toScreenX(state.origin.x);
    const origSY = toScreenY(state.origin.z);
    ctx.strokeStyle = '#f0ede6';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(origSX - 6, origSY);
    ctx.lineTo(origSX + 6, origSY);
    ctx.moveTo(origSX, origSY - 6);
    ctx.lineTo(origSX, origSY + 6);
    ctx.stroke();

    // 7. Plot Target Nodes
    const visible = getFilteredBases();
    visible.forEach(base => {
      const sx = toScreenX(base.x);
      const sy = toScreenY(base.z);
      const st = normalizeStatus(base.status);
      const routeIdx = state.routeIds.indexOf(base.id);
      const isSelected = state.mapSelectedId === base.id || state.radar.hoveredId === base.id;

      let color = '#d4a946';
      if (st === 'priority') color = '#e86a47';
      else if (st === 'compromised') color = '#d9823b';
      else if (st === 'raided') color = '#5e5c56';

      if (isSelected || routeIdx !== -1) {
        ctx.strokeStyle = isSelected ? '#f0ede6' : '#e86a47';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(sx - 7, sy - 7, 14, 14);
      }

      ctx.fillStyle = color;
      ctx.fillRect(sx - 3.5, sy - 3.5, 7, 7);

      if (state.radar.showLabels || isSelected) {
        const routePrefix = routeIdx !== -1 ? `#0${routeIdx + 1} ` : '';
        const coordSuffix = state.radar.netherScale
          ? ` [${Math.floor(base.x / 8)}, ${Math.floor(base.z / 8)}]`
          : '';
        const label = `${routePrefix}${base.name}${coordSuffix}`;
        ctx.font = isSelected ? '600 12px "Inter", sans-serif' : '500 11.5px "Inter", sans-serif';
        const tw = ctx.measureText(label).width;
        const offset = LABEL_OFFSETS[base.id] || { dx: 9, dy: 4 };
        const placeLeft = sx + tw + 24 > W;
        const textX = placeLeft ? sx - tw - 9 : sx + offset.dx;

        ctx.fillStyle = isSelected ? '#ffffff' : 'rgba(240, 237, 230, 0.8)';
        ctx.fillText(label, textX, sy + offset.dy);
      }
    });

    ctx.restore();
  }

  function fitMapToActive() {
    const routeBases = state.routeIds
      .map(id => state.bases.find(b => b.id === id))
      .filter(b => b && b.dimension !== 'the_end');
    const pool =
      routeBases.length > 0
        ? routeBases
        : getFilteredBases().filter(b => b.dimension !== 'the_end' && normalizeStatus(b.status) !== 'raided');

    if (pool.length === 0) return;

    const xs = pool.map(b => b.x);
    const zs = pool.map(b => b.z);
    if (routeBases.length > 0) {
      xs.push(state.origin.x);
      zs.push(state.origin.z);
    }

    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);

    state.radar.centerX = (minX + maxX) / 2;
    state.radar.centerZ = (minZ + maxZ) / 2;
    const span = Math.max(2200, Math.max(maxX - minX, maxZ - minZ) * 1.38);
    state.radar.zoom = Math.max(0.65, Math.min(10, 26800 / span));
    drawMapCanvas();
    showToast(routeBases.length > 0 ? 'Fitted map to active Raid Route' : 'Fitted map to active bases');
  }

  function renderMapSidebar() {
    const card = document.getElementById('map-selected-card');
    const base = state.bases.find(b => b.id === state.mapSelectedId) || state.bases[0];
    if (base) {
      const st = normalizeStatus(base.status);
      const stLabel = STATUS_LABELS[st] || 'Scouted';
      const nc = getNetherCoords(base);
      const dist = getDistanceFrom(base, state.origin.x, state.origin.z);
      const bearing = getBearing(state.origin.x, state.origin.z, base.x, base.z);
      const imgSrc = getPlateSrc(base.image);
      const focusOrigin = base.cropFocus || '50% 50%';
      const inRoute = state.routeIds.includes(base.id);

      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <div style="display:flex;align-items:center;gap:8px;min-width:0;">
            <strong style="font-size:15px;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(base.name)}</strong>
            <button type="button" class="status-tag is-${st}" data-status-picker="${escapeHtml(base.id)}">
              <span class="status-dot dot-${st}"></span><span>${stLabel}</span>
            </button>
          </div>
          <button type="button" class="btn-secondary btn-xs" data-open-dossier="${escapeHtml(base.id)}">Dossier</button>
        </div>

        ${
          imgSrc
            ? `<div class="card-media" data-open-dossier="${escapeHtml(base.id)}" style="border:1px solid var(--border-subtle);">
                 <img src="${imgSrc}" alt="${escapeHtml(base.name)}" style="transform-origin:${escapeHtml(focusOrigin)};object-position:${escapeHtml(focusOrigin)};" />
               </div>`
            : ''
        }

        <div class="nether-callout mono" style="font-size:11.5px;">
          <div style="color:var(--text-primary);">OW: ${base.x}, ${base.y}, ${base.z}</div>
          ${nc ? `<div>Nether (÷8): ${nc.x}, 128, ${nc.z}</div>` : `<div>Dimension: The End</div>`}
          <div style="color:var(--text-secondary);margin-top:2px;">Δ ${formatNumber(dist.ow)}m · Yaw ${bearing.cardinal} ${bearing.yawStr}</div>
        </div>

        <div style="display:flex;gap:6px;">
          <button type="button" class="btn-primary btn-xs" style="flex:1;" data-copy-xaero="${escapeHtml(base.id)}">Copy Xaero</button>
          <button type="button" class="btn-secondary btn-xs" style="flex:1;" data-toggle-route="${escapeHtml(base.id)}">
            ${inRoute ? 'Remove from Route' : '+ Add to Route'}
          </button>
        </div>
      `;
    }

    // Render Map Route Mini-List
    document.getElementById('map-route-count').textContent = state.routeIds.length;
    const miniList = document.getElementById('map-route-mini-list');
    if (state.routeIds.length === 0) {
      miniList.innerHTML = `<div style="font-size:12px;color:var(--text-muted);padding:12px 0;">Shift+Click any base on the map or click <strong>Queue Priority</strong> to build a multi-stop raid vector.</div>`;
    } else {
      let prevX = state.origin.x;
      let prevZ = state.origin.z;
      miniList.innerHTML = state.routeIds
        .map((id, idx) => {
          const b = state.bases.find(item => item.id === id);
          if (!b) return '';
          if (b.dimension === 'the_end') {
            return `
              <div class="route-leg-card">
                <div class="route-leg-top">
                  <span class="mono" style="font-size:11.5px;font-weight:600;color:var(--text-primary);">
                    #0${idx + 1} · ${escapeHtml(b.name)}
                  </span>
                  <button type="button" class="btn-icon-close" data-toggle-route="${escapeHtml(b.id)}" title="Remove stop">×</button>
                </div>
                <div class="route-leg-meta">
                  <span>End Gateway</span>
                  <span>The End (${b.x}, ${b.z})</span>
                </div>
              </div>
            `;
          }
          const legOw = Math.round(Math.hypot(b.x - prevX, b.z - prevZ));
          const legN = Math.round(legOw / 8);
          const bearing = getBearing(prevX, prevZ, b.x, b.z);
          prevX = b.x;
          prevZ = b.z;
          return `
            <div class="route-leg-card">
              <div class="route-leg-top">
                <span class="mono" style="font-size:11.5px;font-weight:600;color:var(--text-primary);">
                  #0${idx + 1} · ${escapeHtml(b.name)}
                </span>
                <button type="button" class="btn-icon-close" data-toggle-route="${escapeHtml(b.id)}" title="Remove stop">×</button>
              </div>
              <div class="route-leg-meta">
                <span>Δ ${formatNumber(legN)}m N (${formatNumber(legOw)}m)</span>
                <span>${bearing.cardinal} ${bearing.yawStr}</span>
              </div>
            </div>
          `;
        })
        .join('');
    }
  }

  // ============================================================================
  // RAID ROUTE PLANNER DRAWER & NEAREST-NEIGHBOR OPTIMIZER
  // ============================================================================

  function renderRouteDrawer() {
    const listEl = document.getElementById('route-list');
    const stops = state.routeIds.map(id => state.bases.find(b => b.id === id)).filter(Boolean);

    let totalOw = 0;
    let totalNether = 0;
    let prevX = state.origin.x;
    let prevZ = state.origin.z;

    const itemsHtml = stops.map((base, idx) => {
      const isEnd = base.dimension === 'the_end';
      const legOw = isEnd ? 0 : Math.round(Math.hypot(base.x - prevX, base.z - prevZ));
      const legNether = isEnd ? 0 : Math.round(legOw / 8);
      const bearing = isEnd ? { cardinal: 'END', yawStr: 'Gateway' } : getBearing(prevX, prevZ, base.x, base.z);
      totalOw += legOw;
      totalNether += legNether;
      if (!isEnd) {
        prevX = base.x;
        prevZ = base.z;
      }
      const nc = getNetherCoords(base);

      return `
        <div class="route-leg-card">
          <div class="route-leg-top">
            <div style="display:flex;align-items:center;gap:8px;">
              <span class="route-step-pill">LEG 0${idx + 1}</span>
              <strong style="cursor:pointer;" data-open-dossier="${escapeHtml(base.id)}">${escapeHtml(base.name)}</strong>
            </div>
            <div style="display:flex;gap:4px;">
              <button type="button" class="btn-secondary btn-xs" data-route-move="${idx}:-1" ${idx === 0 ? 'disabled' : ''} title="Move Up">↑</button>
              <button type="button" class="btn-secondary btn-xs" data-route-move="${idx}:1" ${idx === stops.length - 1 ? 'disabled' : ''} title="Move Down">↓</button>
              <button type="button" class="btn-secondary btn-xs" data-copy-xaero="${escapeHtml(base.id)}">Xaero</button>
              <button type="button" class="btn-secondary btn-xs" data-toggle-route="${escapeHtml(base.id)}" title="Remove stop">×</button>
            </div>
          </div>
          <div class="route-leg-meta">
            <span class="coord-xyz" data-copy="${base.x} ${base.y} ${base.z}">OW: ${base.x}, ${base.y}, ${base.z}</span>
            ${
              nc
                ? `<span class="coord-nether" data-copy="${nc.x} 128 ${nc.z}">Nether: ${nc.x}, 128, ${nc.z}</span>`
                : `<span>The End</span>`
            }
          </div>
          <div class="route-leg-meta" style="color:var(--text-muted);">
            <span>${isEnd ? 'End Gateway (Stronghold Portal)' : `Leg Δ: ${formatNumber(legOw)}m OW (${formatNumber(legNether)}m N)`}</span>
            <span>${isEnd ? 'Dimension: End' : `F3 Yaw: ${bearing.cardinal} ${bearing.yawStr}`}</span>
          </div>
        </div>
      `;
    });

    document.getElementById('route-count').textContent = stops.length;
    document.getElementById('route-dist-ow').textContent = `${formatNumber(totalOw)} m`;
    document.getElementById('route-dist-nether').textContent = `${formatNumber(totalNether)} m`;

    const canReorder = stops.length >= 2;
    const hasStops = stops.length > 0;
    ['btn-route-optimize', 'map-btn-route-optimize', 'btn-route-reverse'].forEach(id => {
      const btn = document.getElementById(id);
      if (btn) btn.disabled = !canReorder;
    });
    ['btn-route-clear', 'btn-route-copy-xaero', 'btn-route-copy-nether'].forEach(id => {
      const btn = document.getElementById(id);
      if (btn) btn.disabled = !hasStops;
    });

    if (stops.length === 0) {
      listEl.innerHTML = `
        <div style="padding:36px 16px;text-align:center;color:var(--text-muted);line-height:1.6;">
          No bases queued in the active Raid Route.<br/>
          Click <strong>Queue All Priority</strong> above, or click <strong>+ Route</strong> on any card or table row to build an optimized multi-base raid path.
        </div>
      `;
    } else {
      listEl.innerHTML = itemsHtml.join('');
    }
  }

  function optimizeRouteNearestNeighbor() {
    const stops = state.routeIds.map(id => state.bases.find(b => b.id === id)).filter(Boolean);
    if (stops.length < 2) return;
    const owStops = stops.filter(b => b.dimension !== 'the_end');
    const endStops = stops.filter(b => b.dimension === 'the_end');
    const remaining = [...owStops];
    const ordered = [];
    let currX = state.origin.x;
    let currZ = state.origin.z;

    while (remaining.length > 0) {
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const d = Math.hypot(remaining[i].x - currX, remaining[i].z - currZ);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
      const next = remaining.splice(bestIdx, 1)[0];
      ordered.push(next.id);
      currX = next.x;
      currZ = next.z;
    }

    endStops.forEach(b => ordered.push(b.id));
    state.routeIds = ordered;
    renderAll();
    showToast('Optimized route order (Nearest-Neighbor from Origin)');
  }

  // ============================================================================
  // XAERO STUDIO MODAL
  // ============================================================================

  function getXaeroScopeBases() {
    const scope = document.getElementById('xaero-scope')?.value || 'unraided';
    if (scope === 'priority') return state.bases.filter(b => normalizeStatus(b.status) === 'priority');
    if (scope === 'unraided') return state.bases.filter(b => normalizeStatus(b.status) !== 'raided');
    if (scope === 'route') return state.routeIds.map(id => state.bases.find(b => b.id === id)).filter(Boolean);
    if (scope === 'selected') return [...state.selectedIds].map(id => state.bases.find(b => b.id === id)).filter(Boolean);
    if (scope === 'the_end') return state.bases.filter(b => b.dimension === 'the_end');
    return [...state.bases];
  }

  function renderXaeroStudio() {
    const coordMode = document.getElementById('xaero-coord-mode')?.value || 'exact';
    const setName = document.getElementById('xaero-set-name')?.value || 'gui.xaero_default';
    const prefixPlate = document.getElementById('xaero-prefix-plate')?.checked ?? true;
    const includeTier = document.getElementById('xaero-include-tier')?.checked ?? true;
    const disableRaided = document.getElementById('xaero-disable-raided')?.checked ?? true;
    const scope = document.getElementById('xaero-scope')?.value || 'unraided';

    const list = getXaeroScopeBases();
    const compiled = list.map((base, idx) => {
      const indexPrefix = prefixPlate ? (scope === 'route' ? String(idx + 1).padStart(2, '0') : base.plate) : '';
      return {
        base,
        wp: buildXaeroWaypointData(base, {
          indexPrefix,
          coordMode,
          includeTier,
          setName,
          disableRaided
        })
      };
    });

    const fileHeader = [
      '#',
      '#waypoint:name:initials:x:y:z:color:disabled:type:set:rotate_on_tp:tp_yaw:visibility_type:destination',
      '#'
    ];
    const fileBody = compiled.map(c => c.wp.fileLine);
    document.getElementById('xaero-file-output').textContent = [...fileHeader, ...fileBody].join('\n');

    const manualContainer = document.getElementById('xaero-manual-list');
    if (manualContainer) {
      if (compiled.length === 0) {
        manualContainer.innerHTML = `<div style="padding:18px;color:var(--text-muted);">No bases in selected scope.</div>`;
      } else {
        manualContainer.innerHTML = compiled
          .map(
            ({ base, wp }) => `
            <div class="xaero-manual-row">
              <strong style="min-width:130px;">${escapeHtml(base.plate || '')} · ${escapeHtml(base.name)}</strong>
              <span class="xaero-manual-string" title="${escapeHtml(wp.fileLine)}">XYZ: ${wp.x}, ${wp.y}, ${wp.z} · ${escapeHtml(wp.fileLine)}</span>
              <div style="display:flex;gap:6px;flex-shrink:0;">
                <button type="button" class="xaero-copy-btn" data-copy="${escapeHtml(wp.coordsText)}">Copy XYZ</button>
                <button type="button" class="xaero-copy-btn" data-copy="${escapeHtml(wp.fileLine)}">Copy File Line</button>
              </div>
            </div>
          `
          )
          .join('');
      }
    }
  }

  async function handleXaeroImport() {
    const raw = document.getElementById('xaero-import-textarea').value.trim();
    if (!raw) return;

    const lines = raw.split(/\r?\n/);
    const batchItems = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const parts = trimmed.split(':');
      if (parts.length >= 6 && parts[0] === 'waypoint') {
        const name = (parts[1] || 'Imported Base').replace(/^\d+_/, '').replace(/\s*\[N-ROOF\]$/i, '').trim() || 'Imported Base';
        const x = parseInt(parts[3], 10);
        const y = parseInt(parts[4], 10);
        const z = parseInt(parts[5], 10);
        const color = parseInt(parts[6] || '12', 10);
        const disabled = String(parts[7] || 'false').toLowerCase() === 'true';
        const dimHint = String(parts[9] || '').toLowerCase();

        let dimension = 'overworld';
        if (dimHint.includes('the_end')) dimension = 'the_end';
        else if (dimHint.includes('the_nether') && !/\[n-roof\]/i.test(parts[1] || '')) dimension = 'the_nether';

        const status = disabled ? 'raided' : color === 12 || color === 4 ? 'priority' : color === 6 ? 'compromised' : 'scouted';

        if (!Number.isNaN(x) && !Number.isNaN(z)) {
          batchItems.push({
            name,
            x,
            y: Number.isNaN(y) ? 64 : y,
            z,
            dimension,
            xaeroColor: Number.isNaN(color) ? 12 : color,
            status,
            tier: 'medium',
            notes: 'Imported via Xaero waypoint string.'
          });
        }
      }
    }

    if (batchItems.length === 0) {
      showToast('No valid Xaero waypoint lines found');
      return;
    }

    try {
      const res = await fetch(`${state.apiBase}/api/bases/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'import', items: batchItems })
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      state.bases = data.bases;
      populateOriginSelect();
      renderAll();
    } catch {
      for (const item of batchItems) {
        await createBase(item);
      }
    }

    document.getElementById('xaero-import-textarea').value = '';
    renderXaeroStudio();
    showToast(`Imported ${batchItems.length} waypoint(s)`);
  }

  // ============================================================================
  // DETAIL / EDIT DOSSIER MODAL & OPTICAL PRESETS
  // ============================================================================

  function updateDossierComputedPreview() {
    const dim = document.getElementById('edit-dimension').value;
    const x = Number(document.getElementById('edit-x').value) || 0;
    const y = Number(document.getElementById('edit-y').value) || 0;
    const z = Number(document.getElementById('edit-z').value) || 0;
    const tempBase = { dimension: dim, x, y, z };
    const nc = getNetherCoords(tempBase);
    const dist = getDistanceFrom(tempBase, state.origin.x, state.origin.z);
    const bearing = getBearing(state.origin.x, state.origin.z, x, z);

    document.getElementById('dossier-computed-strip').innerHTML = `
      <div>
        <span class="popover-label" style="display:block;">NETHER ROOF (÷8)</span>
        <strong style="color:var(--accent-nether);">${nc ? `${nc.x}, 128, ${nc.z}` : 'The End'}</strong>
      </div>
      <div>
        <span class="popover-label" style="display:block;">RADIAL DISTANCE</span>
        <strong>${formatNumber(dist.ow)}m OW ${dist.nether !== null ? `(${formatNumber(dist.nether)}m N)` : ''}</strong>
      </div>
      <div>
        <span class="popover-label" style="display:block;">F3 HEADING YAW</span>
        <strong>${bearing.cardinal} · ${bearing.yawStr}</strong>
      </div>
    `;
  }

  function applyDossierOpticalPreset(preset) {
    document.querySelectorAll('#dossier-zoom-presets .seg-item').forEach(btn => {
      btn.classList.toggle('is-active', btn.dataset.preset === preset);
    });
    const img = document.getElementById('dossier-img');
    if (!img) return;

    if (preset === 'full') {
      state.dossierTransform = { scale: 1, x: 0, y: 0, isDragging: false, startX: 0, startY: 0 };
      img.style.transformOrigin = '50% 50%';
    } else if (preset === 'subject') {
      state.dossierTransform = { scale: 1.55, x: 0, y: 0, isDragging: false, startX: 0, startY: 0 };
      img.style.transformOrigin = '52% 52%';
    } else if (preset === 'f3_left') {
      state.dossierTransform = { scale: 2.35, x: 0, y: 0, isDragging: false, startX: 0, startY: 0 };
      img.style.transformOrigin = '6% 18%';
    } else if (preset === 'f3_right') {
      state.dossierTransform = { scale: 2.35, x: 0, y: 0, isDragging: false, startX: 0, startY: 0 };
      img.style.transformOrigin = '94% 22%';
    }
    updateDossierImageTransform();
  }

  function updateDossierImageTransform() {
    const img = document.getElementById('dossier-img');
    if (!img) return;
    const { scale, x, y } = state.dossierTransform;
    img.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
  }

  function openDossier(baseId) {
    const base = state.bases.find(b => b.id === baseId);
    if (!base) return;
    if (document.getElementById('dossier-modal').hidden) {
      state.lastFocusedElement = document.activeElement;
    }
    state.dossierBaseId = base.id;
    state.focusedBaseId = base.id;

    const delBtn = document.getElementById('btn-delete-base');
    if (delBtn) {
      delBtn.classList.remove('is-confirming');
      delBtn.textContent = 'Delete';
    }

    document.getElementById('dossier-plate').textContent = `PLATE ${base.plate || '01'}`;
    document.getElementById('dossier-title').textContent = base.name;
    document.getElementById('dossier-dim-badge').textContent = (base.dimension || 'overworld')
      .replace('minecraft:', '')
      .toUpperCase();

    const imgEl = document.getElementById('dossier-img');
    imgEl.src = getPlateSrc(base.image);
    document.getElementById('dossier-file-meta').textContent =
      `File: ${base.image || 'None'} · Scroll to zoom · Drag to pan`;

    document.getElementById('edit-name').value = base.name || '';
    document.getElementById('edit-status').value = normalizeStatus(base.status);
    document.getElementById('edit-tier').value = base.tier || 'medium';
    document.getElementById('edit-dimension').value = base.dimension || 'overworld';
    document.getElementById('edit-color').value = String(base.xaeroColor ?? 12);
    document.getElementById('edit-x').value = base.x;
    document.getElementById('edit-y').value = base.y;
    document.getElementById('edit-z').value = base.z;
    document.getElementById('edit-biome').value = base.biome || '';
    document.getElementById('edit-players').value = (base.players || []).join(', ');
    document.getElementById('edit-containers').value = base.containers || '';
    document.getElementById('edit-notes').value = base.notes || '';

    const routeBtn = document.getElementById('dossier-toggle-route');
    const inRoute = state.routeIds.includes(base.id);
    routeBtn.textContent = inRoute ? 'In Route (Remove)' : '+ Add to Route';

    updateDossierComputedPreview();
    applyDossierOpticalPreset('full');
    document.getElementById('dossier-modal').hidden = false;
  }

  function closeDossier() {
    document.getElementById('dossier-modal').hidden = true;
    state.dossierBaseId = null;
    state.lastFocusedElement?.focus?.();
  }

  // ============================================================================
  // SCOPED CONTEXT MENU & INLINE STATUS / TIER PICKERS
  // ============================================================================

  function closeContextMenus() {
    const ctxMenu = document.getElementById('context-menu');
    const inlinePicker = document.getElementById('inline-picker');
    if (ctxMenu) ctxMenu.hidden = true;
    if (inlinePicker) inlinePicker.hidden = true;
    if (state.floatingMenu.triggerEl) {
      state.floatingMenu.triggerEl.classList.remove('is-open');
      state.floatingMenu.triggerEl.setAttribute('aria-expanded', 'false');
    }
    state.floatingMenu = { menuId: null, type: null, baseId: null, triggerEl: null };
  }

  function positionFloatingMenu(menuEl, clientX, clientY) {
    menuEl.hidden = false;
    const rect = menuEl.getBoundingClientRect();
    const x = Math.min(clientX, window.innerWidth - rect.width - 12);
    const y = Math.min(clientY, window.innerHeight - rect.height - 12);
    menuEl.style.left = `${Math.max(8, x)}px`;
    menuEl.style.top = `${Math.max(8, y)}px`;
  }

  function openContextMenu(baseId, clientX, clientY, triggerEl = null) {
    const menu = document.getElementById('context-menu');
    if (
      triggerEl &&
      !menu.hidden &&
      state.floatingMenu.menuId === 'context-menu' &&
      (state.floatingMenu.triggerEl === triggerEl || state.floatingMenu.baseId === baseId)
    ) {
      closeContextMenus();
      return;
    }

    closeAllPopovers();
    closeContextMenus();
    const base = state.bases.find(b => b.id === baseId);
    if (!base) return;
    const nc = getNetherCoords(base);
    const inRoute = state.routeIds.includes(base.id);

    menu.innerHTML = `
      <div class="ctx-section-label">${escapeHtml(base.plate || '')} · ${escapeHtml(base.name)}</div>
      <button type="button" class="ctx-item" data-ctx-action="dossier" data-id="${escapeHtml(base.id)}">
        <span>Open Dossier &amp; F3 Loupe</span>
        <kbd class="kbd-token">↵</kbd>
      </button>
      <button type="button" class="ctx-item" data-ctx-action="xaero-ow" data-id="${escapeHtml(base.id)}">
        <span>Copy Local Xaero Line (OW)</span>
        <kbd class="kbd-token">C</kbd>
      </button>
      ${
        nc
          ? `<button type="button" class="ctx-item" data-ctx-action="xaero-nether" data-id="${escapeHtml(base.id)}">
               <span>Copy Local Nether Line (÷8)</span>
               <kbd class="kbd-token">N</kbd>
             </button>`
          : ''
      }
      <button type="button" class="ctx-item" data-ctx-action="copy-xyz" data-id="${escapeHtml(base.id)}">
        <span>Copy Overworld XYZ (${base.x}, ${base.y}, ${base.z})</span>
      </button>
      ${
        nc
          ? `<button type="button" class="ctx-item" data-ctx-action="copy-nether-xyz" data-id="${escapeHtml(base.id)}">
               <span>Copy Nether Roof XYZ (${nc.x}, 128, ${nc.z})</span>
             </button>`
          : ''
      }
      <button type="button" class="ctx-item" data-ctx-action="open-seedmap" data-id="${escapeHtml(base.id)}">
        <span>Open in Chunkbase Seed Map ↗</span>
      </button>
      <div class="ctx-divider"></div>
      <button type="button" class="ctx-item" data-ctx-action="toggle-route" data-id="${escapeHtml(base.id)}">
        <span>${inRoute ? 'Remove from Raid Route' : '+ Add to Raid Route'}</span>
        <kbd class="kbd-token">R</kbd>
      </button>
      <button type="button" class="ctx-item" data-ctx-action="set-origin" data-id="${escapeHtml(base.id)}">
        <span>Set as Reference Vector Origin</span>
        <kbd class="kbd-token">O</kbd>
      </button>
      <button type="button" class="ctx-item" data-ctx-action="load-calc" data-id="${escapeHtml(base.id)}">
        <span>Load in Nether Calculator</span>
      </button>
      <div class="ctx-divider"></div>
      <div class="ctx-section-label">Set Status</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px;padding:0 4px;">
        <button type="button" class="ctx-item" data-ctx-status="priority" data-id="${escapeHtml(base.id)}"><span class="status-dot dot-priority"></span> Priority</button>
        <button type="button" class="ctx-item" data-ctx-status="scouted" data-id="${escapeHtml(base.id)}"><span class="status-dot dot-scouted"></span> Scouted</button>
        <button type="button" class="ctx-item" data-ctx-status="compromised" data-id="${escapeHtml(base.id)}"><span class="status-dot dot-compromised"></span> Alert</button>
        <button type="button" class="ctx-item" data-ctx-status="raided" data-id="${escapeHtml(base.id)}"><span class="status-dot dot-raided"></span> Raided</button>
      </div>
      <div class="ctx-divider"></div>
      <button type="button" class="ctx-item is-danger" data-ctx-action="delete" data-id="${escapeHtml(base.id)}">
        <span>Delete Base</span>
      </button>
    `;

    state.floatingMenu = { menuId: 'context-menu', type: 'ctx', baseId, triggerEl };
    if (triggerEl) {
      triggerEl.classList.add('is-open');
      triggerEl.setAttribute('aria-expanded', 'true');
    }
    positionFloatingMenu(menu, clientX, clientY);
    menu.focus({ preventScroll: true });
  }

  function openInlinePicker(type, baseId, anchorEl) {
    const picker = document.getElementById('inline-picker');
    if (
      !picker.hidden &&
      state.floatingMenu.menuId === 'inline-picker' &&
      (state.floatingMenu.triggerEl === anchorEl ||
        (state.floatingMenu.type === type && state.floatingMenu.baseId === baseId))
    ) {
      closeContextMenus();
      return;
    }

    closeAllPopovers();
    closeContextMenus();
    const base = state.bases.find(b => b.id === baseId);
    if (!base) return;
    const rect = anchorEl.getBoundingClientRect();

    if (type === 'status') {
      picker.innerHTML = `
        <div class="ctx-section-label">Status — ${escapeHtml(base.name)}</div>
        ${['priority', 'scouted', 'compromised', 'raided']
          .map(
            st => `
          <button type="button" class="ctx-item" data-ctx-status="${st}" data-id="${escapeHtml(base.id)}">
            <span style="display:inline-flex;align-items:center;gap:7px;">
              <span class="status-dot dot-${st}"></span>
              <span>${STATUS_LABELS[st]}</span>
            </span>
            ${normalizeStatus(base.status) === st ? '<span>✓</span>' : ''}
          </button>
        `
          )
          .join('')}
      `;
    } else if (type === 'tier') {
      picker.innerHTML = `
        <div class="ctx-section-label">Loot Tier — ${escapeHtml(base.name)}</div>
        ${['high', 'medium', 'low']
          .map(
            t => `
          <button type="button" class="ctx-item" data-ctx-tier="${t}" data-id="${escapeHtml(base.id)}">
            <span>${TIER_LABELS[t]} Value</span>
            ${(base.tier || 'medium') === t ? '<span>✓</span>' : ''}
          </button>
        `
          )
          .join('')}
      `;
    }

    state.floatingMenu = { menuId: 'inline-picker', type, baseId, triggerEl: anchorEl };
    anchorEl.classList.add('is-open');
    anchorEl.setAttribute('aria-expanded', 'true');
    positionFloatingMenu(picker, rect.left, rect.bottom + 4);
    picker.focus({ preventScroll: true });
  }

  // ============================================================================
  // COMMAND PALETTE (Ctrl+K / ⌘K)
  // ============================================================================

  function buildCommandItems(query) {
    const q = query.trim().toLowerCase();
    const actions = [
      {
        group: 'Route & Telemetry Actions',
        label: 'Queue All Priority Bases into Raid Route & Optimize',
        sub: 'Route Planner',
        run: () => {
          state.routeIds = state.bases
            .filter(b => normalizeStatus(b.status) === 'priority' && b.dimension !== 'the_end')
            .map(b => b.id);
          optimizeRouteNearestNeighbor();
          document.getElementById('route-drawer-backdrop').hidden = false;
        }
      },
      {
        group: 'Route & Telemetry Actions',
        label: 'Open Raid Route Planner Drawer',
        sub: 'Shortcut: R',
        run: () => {
          document.getElementById('route-drawer-backdrop').hidden = false;
        }
      },
      {
        group: 'Route & Telemetry Actions',
        label: 'Copy All Active Local Xaero Waypoint Lines (Overworld)',
        sub: 'mw$default_1.txt',
        run: () => {
          const lines = state.bases
            .filter(b => normalizeStatus(b.status) !== 'raided')
            .map(b => buildXaeroWaypointData(b, { coordMode: 'exact' }).fileLine);
          copyText(lines.join('\n'), `Copied ${lines.length} local Xaero file lines`);
        }
      },
      {
        group: 'Route & Telemetry Actions',
        label: 'Copy All Active Nether Roof Portal Waypoint Lines (÷8)',
        sub: 'mw$default_1.txt',
        run: () => {
          const lines = state.bases
            .filter(b => normalizeStatus(b.status) !== 'raided' && b.dimension === 'overworld')
            .map(b => buildXaeroWaypointData(b, { coordMode: 'nether_roof' }).fileLine);
          copyText(lines.join('\n'), `Copied ${lines.length} Nether Roof file lines`);
        }
      },
      {
        group: 'Route & Telemetry Actions',
        label: `Copy SMP World Seed (${SMP_SEED})`,
        sub: 'World Seed',
        run: () => {
          copyText(SMP_SEED, `Copied SMP Seed ${SMP_SEED}`);
        }
      },
      {
        group: 'Route & Telemetry Actions',
        label: `Open SMP Seed Map in Chunkbase (${SMP_SEED})`,
        sub: 'External Map ↗',
        run: () => {
          window.open(getChunkbaseUrl(state.origin.x, state.origin.z, 'overworld'), '_blank', 'noopener');
        }
      },
      {
        group: 'Route & Telemetry Actions',
        label: 'Open Nether Coordinate Calculator & Vector Origin',
        sub: 'Shortcut: C',
        run: () => togglePopover('popover-nether', 'btn-toggle-nether-pop')
      },
      {
        group: 'Route & Telemetry Actions',
        label: 'Toggle Global Coordinate Mode (Overworld ↔ Nether ÷8)',
        sub: state.globalCoordMode === 'nether' ? 'Currently: Nether ÷8' : 'Currently: Overworld',
        run: () => {
          state.globalCoordMode = state.globalCoordMode === 'nether' ? 'overworld' : 'nether';
          syncControlsFromState();
          renderAll();
          showToast(`Display Mode → ${state.globalCoordMode === 'nether' ? 'Nether Roof (÷8)' : 'Overworld'}`);
        }
      },
      {
        group: 'Route & Telemetry Actions',
        label: 'Open Local Xaero Waypoint Manager',
        sub: 'Export / Import',
        run: () => {
          renderXaeroStudio();
          document.getElementById('xaero-modal').hidden = false;
        }
      },
      {
        group: 'Route & Telemetry Actions',
        label: 'Add New Base / Drop F3 Screenshot',
        sub: 'Shortcut: N',
        run: () => openIngestModal()
      },
      {
        group: 'Views & Filters',
        label: 'Switch to Photo Grid View',
        sub: 'Shortcut: 1',
        run: () => switchView('grid')
      },
      {
        group: 'Views & Filters',
        label: 'Switch to Power Data Table View',
        sub: 'Shortcut: 2',
        run: () => switchView('table')
      },
      {
        group: 'Views & Filters',
        label: 'Switch to 2D Coordinate Map View',
        sub: 'Shortcut: 3',
        run: () => switchView('map')
      },
      {
        group: 'Views & Filters',
        label: 'Reset All Active Filters & Selection',
        sub: 'Clear',
        run: () => {
          state.filters.status = 'all';
          state.filters.query = '';
          state.filters.tiers.clear();
          state.filters.dimensions.clear();
          state.filters.routeOnly = false;
          state.selectedIds.clear();
          document.getElementById('search-input').value = '';
          const clearBtn = document.getElementById('btn-clear-search');
          if (clearBtn) clearBtn.hidden = true;
          const kbd = document.getElementById('search-kbd-hint');
          if (kbd) kbd.hidden = false;
          document.querySelectorAll('.filter-pill').forEach(b => {
            const active = b.dataset.status === 'all';
            b.classList.toggle('is-active', active);
            b.setAttribute('aria-selected', String(active));
          });
          document.querySelectorAll('#popover-facets input[type="checkbox"]').forEach(cb => {
            cb.checked = false;
          });
          renderAll();
        }
      }
    ];

    const baseItems = state.bases.map(b => {
      const nc = getNetherCoords(b);
      return {
        group: 'Cataloged Bases (Enter to Inspect)',
        label: `${b.plate || ''} · ${b.name}`,
        sub: `OW: ${b.x}, ${b.y}, ${b.z}${nc ? ` · N: ${nc.x}, ${nc.z}` : ' · END'}`,
        searchStr: `${b.plate} ${b.name} ${b.x} ${b.z} ${b.containers || ''} ${b.biome || ''}`.toLowerCase(),
        run: () => openDossier(b.id)
      };
    });

    const all = [...actions, ...baseItems];
    if (!q) return all;
    return all.filter(item => {
      const hay = `${item.label} ${item.sub} ${item.searchStr || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }

  function renderCommandList() {
    const listEl = document.getElementById('cmd-list');
    state.cmd.items = buildCommandItems(state.cmd.query);
    if (state.cmd.activeIndex >= state.cmd.items.length) {
      state.cmd.activeIndex = 0;
    }

    if (state.cmd.items.length === 0) {
      listEl.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-muted);">No matching commands or bases.</div>`;
      return;
    }

    let lastGroup = '';
    const html = [];
    state.cmd.items.forEach((item, idx) => {
      if (item.group !== lastGroup) {
        lastGroup = item.group;
        html.push(`<div class="cmd-group-heading">${escapeHtml(lastGroup)}</div>`);
      }
      html.push(`
        <button
          type="button"
          class="cmd-item ${idx === state.cmd.activeIndex ? 'is-active' : ''}"
          data-cmd-idx="${idx}"
          role="option"
          aria-selected="${idx === state.cmd.activeIndex}"
        >
          <span>${escapeHtml(item.label)}</span>
          <span class="cmd-item-sub">${escapeHtml(item.sub)}</span>
        </button>
      `);
    });
    listEl.innerHTML = html.join('');
    listEl.querySelector('.cmd-item.is-active')?.scrollIntoView({ block: 'nearest' });
  }

  function openCommandModal() {
    state.lastFocusedElement = document.activeElement;
    state.cmd.isOpen = true;
    state.cmd.query = '';
    state.cmd.activeIndex = 0;
    const modal = document.getElementById('cmd-modal');
    const input = document.getElementById('cmd-input');
    modal.hidden = false;
    input.value = '';
    renderCommandList();
    input.focus();
  }

  function closeCommandModal() {
    state.cmd.isOpen = false;
    document.getElementById('cmd-modal').hidden = true;
    state.lastFocusedElement?.focus?.();
  }

  // ============================================================================
  // TWO-WAY NETHER CALCULATOR
  // ============================================================================

  function updateCalculatorFromOverworld() {
    const owX = Number(document.getElementById('calc-ow-x').value) || 0;
    const owZ = Number(document.getElementById('calc-ow-z').value) || 0;
    const nX = Math.floor(owX / 8);
    const nZ = Math.floor(owZ / 8);
    document.getElementById('calc-nether-x').value = nX;
    document.getElementById('calc-nether-z').value = nZ;
    updateCalculatorMeta(owX, owZ);
  }

  function updateCalculatorFromNether() {
    const nX = Number(document.getElementById('calc-nether-x').value) || 0;
    const nZ = Number(document.getElementById('calc-nether-z').value) || 0;
    const owX = nX * 8;
    const owZ = nZ * 8;
    document.getElementById('calc-ow-x').value = owX;
    document.getElementById('calc-ow-z').value = owZ;
    updateCalculatorMeta(owX, owZ);
  }

  function updateCalculatorMeta(owX, owZ) {
    const distOw = Math.round(Math.hypot(owX - state.origin.x, owZ - state.origin.z));
    const distNether = Math.round(distOw / 8);
    const originShort = (state.origin.label || 'Spawn').split('(')[0].trim() || 'Spawn';
    document.getElementById('calc-meta-readout').textContent =
      `Distance from ${originShort}: ${formatNumber(distOw)} blocks OW (${formatNumber(distNether)} blocks in Nether)`;
  }

  // ============================================================================
  // ADD BASE & F3 SCREENSHOT OCR
  // ============================================================================

  function updateNewBaseNetherPreview() {
    const x = Number(document.getElementById('new-x').value);
    const z = Number(document.getElementById('new-z').value);
    const dim = document.getElementById('new-dimension').value;
    const el = document.getElementById('new-nether-preview');
    if (dim === 'the_end') {
      el.textContent = 'Dimension: The End (No Nether Portal link)';
      return;
    }
    if (!Number.isNaN(x) && !Number.isNaN(z)) {
      el.textContent = `Nether Roof Portal (÷8): ${Math.floor(x / 8)}, 128, ${Math.floor(z / 8)}`;
    }
  }

  function openIngestModal(prefillFile = null) {
    state.lastFocusedElement = document.activeElement;
    document.getElementById('ingest-form').reset();
    state.pendingUploadFilename = '';
    document.getElementById('ingest-preview-img').hidden = true;
    document.getElementById('ingest-preview-empty').hidden = false;
    document.getElementById('ocr-status-text').textContent =
      'Optional — automatically reads player name, Block XYZ, Dimension & Biome';
    document.getElementById('ingest-modal').hidden = false;

    if (prefillFile) {
      state.pendingUploadFilename = prefillFile;
      const baseName = prefillFile.replace(/\.[^.]+$/, '');
      document.getElementById('new-name').value = baseName;
      document.getElementById('new-players').value = baseName;
      const imgEl = document.getElementById('ingest-preview-img');
      imgEl.src = getPlateSrc(prefillFile);
      imgEl.hidden = false;
      document.getElementById('ingest-preview-empty').hidden = true;
      imgEl.onload = () => runOpticalF3Extraction(imgEl);
    }
  }

  function closeIngestModal() {
    document.getElementById('ingest-modal').hidden = true;
    state.lastFocusedElement?.focus?.();
  }

  async function handleFileDropOrSelect(file) {
    if (!file) return;
    openIngestModal();

    const baseName = file.name.replace(/\.[^.]+$/, '');
    document.getElementById('new-name').value = baseName;
    document.getElementById('new-players').value = baseName;
    document.getElementById('ocr-status-text').textContent = 'Reading coordinates from screenshot...';

    const reader = new FileReader();
    reader.onload = async e => {
      const dataUrl = e.target.result;
      const imgEl = document.getElementById('ingest-preview-img');
      imgEl.src = dataUrl;
      imgEl.hidden = false;
      document.getElementById('ingest-preview-empty').hidden = true;

      try {
        const res = await fetch(`${state.apiBase}/api/upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: file.name, dataUrl })
        });
        if (res.ok) {
          const uploaded = await res.json();
          state.pendingUploadFilename = uploaded.filename;
        }
      } catch {}

      imgEl.onload = () => runOpticalF3Extraction(imgEl);
    };
    reader.readAsDataURL(file);
  }

  async function runOpticalF3Extraction(imgElement) {
    try {
      if (!window.Tesseract) {
        await new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
          s.onload = resolve;
          s.onerror = reject;
          document.head.appendChild(s);
        });
      }

      const offCanvas = document.createElement('canvas');
      const cropW = Math.floor((imgElement.naturalWidth || 1920) * 0.36);
      const cropH = Math.floor((imgElement.naturalHeight || 1080) * 0.62);
      offCanvas.width = cropW;
      offCanvas.height = cropH;
      const ctx = offCanvas.getContext('2d');
      ctx.drawImage(imgElement, 0, 0, cropW, cropH, 0, 0, cropW, cropH);

      const result = await window.Tesseract.recognize(offCanvas, 'eng');
      const text = result?.data?.text || '';

      const blockMatch = text.match(/Block:\s*([+-]?\d+)\s+([+-]?\d+)\s+([+-]?\d+)/i);
      if (blockMatch) {
        document.getElementById('new-x').value = parseInt(blockMatch[1], 10);
        document.getElementById('new-y').value = parseInt(blockMatch[2], 10);
        document.getElementById('new-z').value = parseInt(blockMatch[3], 10);
      } else {
        const xyzMatch = text.match(/XYZ:\s*([+-]?\d+)[.,]\d+\s+([+-]?\d+)[.,]\d+\s+([+-]?\d+)/i);
        if (xyzMatch) {
          document.getElementById('new-x').value = parseInt(xyzMatch[1], 10);
          document.getElementById('new-y').value = parseInt(xyzMatch[2], 10);
          document.getElementById('new-z').value = parseInt(xyzMatch[3], 10);
        }
      }

      if (/the_end/i.test(text)) document.getElementById('new-dimension').value = 'the_end';
      else if (/the_nether/i.test(text)) document.getElementById('new-dimension').value = 'the_nether';

      const biomeMatch = text.match(/Biome:\s*(?:minecraft:)?([a-z0-9_]+)/i);
      if (biomeMatch) document.getElementById('new-biome').value = biomeMatch[1].toLowerCase();

      updateNewBaseNetherPreview();
    } catch {}
  }

  // ============================================================================
  // POPOVER & VIEW MANAGEMENT
  // ============================================================================

  function closeAllPopovers() {
    ['popover-nether', 'popover-facets', 'popover-display'].forEach(id => {
      const p = document.getElementById(id);
      if (p) p.hidden = true;
    });
    ['btn-toggle-nether-pop', 'btn-toggle-facets', 'btn-toggle-display-pop', 'active-origin-pill'].forEach(id => {
      const b = document.getElementById(id);
      if (b) {
        b.setAttribute('aria-expanded', 'false');
        b.classList.remove('is-open');
      }
    });
  }

  function togglePopover(popoverId, btnId) {
    const pop = document.getElementById(popoverId);
    const btn = document.getElementById(btnId);
    if (!pop) return;
    const willOpen = pop.hidden;
    closeAllPopovers();
    closeContextMenus();
    if (willOpen) {
      pop.hidden = false;
      if (btn) {
        btn.setAttribute('aria-expanded', 'true');
        btn.classList.add('is-open');
      }
      if (popoverId === 'popover-nether') {
        const originPill = document.getElementById('active-origin-pill');
        if (originPill) {
          originPill.setAttribute('aria-expanded', 'true');
          originPill.classList.add('is-open');
        }
      }
    }
  }

  function switchView(viewName) {
    state.activeView = viewName;
    document.querySelectorAll('.view-segmented .seg-item').forEach(btn => {
      btn.classList.toggle('is-active', btn.dataset.view === viewName);
    });
    document.getElementById('view-grid').hidden = viewName !== 'grid';
    document.getElementById('view-table').hidden = viewName !== 'table';
    document.getElementById('view-map').hidden = viewName !== 'map';
    renderAll();
  }

  function renderAll() {
    savePersistedPrefs();
    renderHeaderAndCounts();
    renderRouteDrawer();
    const filtered = getFilteredBases();

    if (state.activeView === 'grid') {
      renderGrid(filtered);
    } else if (state.activeView === 'table') {
      renderTable(filtered);
    } else if (state.activeView === 'map') {
      drawMapCanvas();
      renderMapSidebar();
    }
  }

  // ============================================================================
  // INLINE TABLE CELL EDITING
  // ============================================================================

  function startInlineEdit(td, baseId, field) {
    if (!td || td.querySelector('.inline-edit-input')) return;
    const base = state.bases.find(b => b.id === baseId);
    if (!base) return;

    const currentVal = base[field] || '';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'inline-edit-input';
    input.value = currentVal;

    td.innerHTML = '';
    td.appendChild(input);
    input.focus();
    input.select();

    let committed = false;
    const commit = async () => {
      if (committed) return;
      committed = true;
      const nextVal = input.value.trim();
      if (nextVal && nextVal !== currentVal) {
        await updateBase(baseId, { [field]: nextVal });
        showToast(`Updated ${nextVal}`);
      } else {
        renderAll();
      }
    };

    input.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        commit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        committed = true;
        renderAll();
      }
    });
    input.addEventListener('blur', commit);
  }

  // ============================================================================
  // EVENT BINDINGS
  // ============================================================================

  function bindEvents() {
    // View Switcher
    document.querySelectorAll('.view-segmented .seg-item').forEach(btn => {
      btn.addEventListener('click', () => switchView(btn.dataset.view));
    });

    // Popover Triggers
    document.getElementById('btn-toggle-nether-pop').addEventListener('click', e => {
      e.stopPropagation();
      togglePopover('popover-nether', 'btn-toggle-nether-pop');
    });
    document.getElementById('active-origin-pill').addEventListener('click', e => {
      e.stopPropagation();
      togglePopover('popover-nether', 'btn-toggle-nether-pop');
    });
    document.getElementById('btn-toggle-facets').addEventListener('click', e => {
      e.stopPropagation();
      togglePopover('popover-facets', 'btn-toggle-facets');
    });
    document.getElementById('btn-toggle-display-pop').addEventListener('click', e => {
      e.stopPropagation();
      togglePopover('popover-display', 'btn-toggle-display-pop');
    });

    document.querySelectorAll('[data-close-popover]').forEach(btn => {
      btn.addEventListener('click', closeAllPopovers);
    });

    // Global Coordinate Mode Toggle inside Nether Popover
    document.getElementById('global-coord-mode').addEventListener('click', e => {
      const btn = e.target.closest('.seg-item');
      if (!btn) return;
      state.globalCoordMode = btn.dataset.coordMode;
      document
        .querySelectorAll('#global-coord-mode .seg-item')
        .forEach(b => b.classList.toggle('is-active', b === btn));
      renderAll();
    });

    // Two-Way Nether Calculator Inputs
    ['calc-ow-x', 'calc-ow-z'].forEach(id => {
      document.getElementById(id).addEventListener('input', updateCalculatorFromOverworld);
    });
    ['calc-nether-x', 'calc-nether-z'].forEach(id => {
      document.getElementById(id).addEventListener('input', updateCalculatorFromNether);
    });
    document.getElementById('btn-copy-calc-ow').addEventListener('click', e => {
      const x = document.getElementById('calc-ow-x').value;
      const z = document.getElementById('calc-ow-z').value;
      copyText(`${x} 64 ${z}`, `Copied Overworld ${x} 64 ${z}`, e.currentTarget);
    });
    document.getElementById('btn-copy-calc-nether').addEventListener('click', e => {
      const x = document.getElementById('calc-nether-x').value;
      const z = document.getElementById('calc-nether-z').value;
      copyText(`${x} 128 ${z}`, `Copied Nether Roof ${x} 128 ${z}`, e.currentTarget);
    });
    document.getElementById('btn-open-calc-seedmap')?.addEventListener('click', () => {
      const x = Number(document.getElementById('calc-ow-x').value) || 0;
      const z = Number(document.getElementById('calc-ow-z').value) || 0;
      window.open(getChunkbaseUrl(x, z, 'overworld'), '_blank', 'noopener');
    });

    // Vector Origin Select
    document.getElementById('origin-select').addEventListener('change', e => {
      const [ox, oz] = e.target.value.split(',').map(Number);
      state.origin = {
        x: ox || 0,
        z: oz || 0,
        label: e.target.options[e.target.selectedIndex]?.text || 'Spawn (0, 0)'
      };
      updateCalculatorFromOverworld();
      renderAll();
      showToast(`Vector Origin → ${state.origin.label}`);
    });

    // Status Filter Tabs
    document.getElementById('filter-status').addEventListener('click', e => {
      const btn = e.target.closest('.filter-pill');
      if (!btn) return;
      state.filters.status = btn.dataset.status;
      document.querySelectorAll('.filter-pill').forEach(b => {
        const active = b === btn;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-selected', String(active));
      });
      renderAll();
    });

    // Faceted Filter Checkboxes
    document.querySelectorAll('input[data-facet="tier"]').forEach(cb => {
      cb.addEventListener('change', () => {
        if (cb.checked) state.filters.tiers.add(cb.value);
        else state.filters.tiers.delete(cb.value);
        renderAll();
      });
    });
    document.querySelectorAll('input[data-facet="dimension"]').forEach(cb => {
      cb.addEventListener('change', () => {
        if (cb.checked) state.filters.dimensions.add(cb.value);
        else state.filters.dimensions.delete(cb.value);
        renderAll();
      });
    });
    document.getElementById('facet-route-only').addEventListener('change', e => {
      state.filters.routeOnly = e.target.checked;
      renderAll();
    });

    const resetFacets = () => {
      state.filters.tiers.clear();
      state.filters.dimensions.clear();
      state.filters.routeOnly = false;
      document.querySelectorAll('#popover-facets input[type="checkbox"]').forEach(cb => {
        cb.checked = false;
      });
      renderAll();
    };
    document.getElementById('btn-reset-facets').addEventListener('click', resetFacets);

    // Display Options Popover Controls
    document.getElementById('sort-select').addEventListener('change', e => {
      state.sortBy = e.target.value;
      renderAll();
    });
    document.getElementById('btn-sort-dir').addEventListener('click', e => {
      state.sortDir *= -1;
      e.currentTarget.textContent = state.sortDir === 1 ? '↑ ASC' : '↓ DESC';
      renderAll();
    });
    document.getElementById('toggle-crop-mode').addEventListener('click', e => {
      const btn = e.target.closest('.seg-item');
      if (!btn) return;
      state.cropMode = btn.dataset.crop;
      document
        .querySelectorAll('#toggle-crop-mode .seg-item')
        .forEach(b => b.classList.toggle('is-active', b === btn));
      renderAll();
    });
    document.getElementById('toggle-card-vectors').addEventListener('change', e => {
      state.showCardVectors = e.target.checked;
      renderAll();
    });

    // Table Column Toggles
    document.querySelectorAll('#table-col-toggles input[data-col]').forEach(cb => {
      cb.addEventListener('change', () => {
        state.tableColumns[cb.dataset.col] = cb.checked;
        renderAll();
      });
    });
    document.getElementById('toggle-table-preview').addEventListener('change', e => {
      state.tableShowPreview = e.target.checked;
      renderAll();
    });
    document.getElementById('btn-toggle-preview-inline').addEventListener('click', () => {
      state.tableShowPreview = !state.tableShowPreview;
      document.getElementById('toggle-table-preview').checked = state.tableShowPreview;
      renderAll();
    });
    document.getElementById('toggle-table-compact').addEventListener('change', e => {
      state.tableCompact = e.target.checked;
      renderAll();
    });

    // Search Input & Clear Button
    const searchInput = document.getElementById('search-input');
    const kbdHint = document.getElementById('search-kbd-hint');
    const clearSearchBtn = document.getElementById('btn-clear-search');
    const syncSearchAffordances = () => {
      const hasVal = Boolean(searchInput.value.trim());
      if (clearSearchBtn) clearSearchBtn.hidden = !hasVal;
      if (kbdHint) kbdHint.hidden = hasVal || document.activeElement === searchInput;
    };
    searchInput.addEventListener('input', e => {
      state.filters.query = e.target.value;
      syncSearchAffordances();
      renderAll();
    });
    searchInput.addEventListener('focus', syncSearchAffordances);
    searchInput.addEventListener('blur', syncSearchAffordances);
    clearSearchBtn?.addEventListener('click', () => {
      searchInput.value = '';
      state.filters.query = '';
      syncSearchAffordances();
      renderAll();
      searchInput.focus();
    });

    // Table Header Sorting & Master Checkbox
    document.querySelector('#bases-table thead').addEventListener('click', e => {
      const th = e.target.closest('.th-sortable');
      if (!th) return;
      const field = th.dataset.sort;
      if (state.sortBy === field) state.sortDir *= -1;
      else {
        state.sortBy = field;
        state.sortDir = 1;
      }
      document.getElementById('sort-select').value = state.sortBy;
      renderAll();
    });

    document.getElementById('table-check-all').addEventListener('change', e => {
      const filtered = getFilteredBases();
      if (e.target.checked) filtered.forEach(b => state.selectedIds.add(b.id));
      else filtered.forEach(b => state.selectedIds.delete(b.id));
      syncSelectionStateDOM();
    });

    // Table Row Hover -> Live Preview Update & Double-Click Inline Edit
    const tbody = document.getElementById('bases-tbody');
    tbody.addEventListener('mouseover', e => {
      // Do not jump row focus while a floating dropdown/context menu or inline input is open
      if (
        !document.getElementById('context-menu').hidden ||
        !document.getElementById('inline-picker').hidden ||
        tbody.querySelector('.inline-edit-input')
      ) {
        return;
      }
      const tr = e.target.closest('tr[data-base-id]');
      if (tr && state.focusedBaseId !== tr.dataset.baseId) {
        state.focusedBaseId = tr.dataset.baseId;
        document.querySelectorAll('#bases-tbody tr').forEach(r => r.classList.toggle('is-focused', r === tr));
        renderTableSidePreview();
      }
    });

    tbody.addEventListener('dblclick', e => {
      const cell = e.target.closest('[data-inline-edit]');
      if (!cell) return;
      e.preventDefault();
      startInlineEdit(cell, cell.dataset.inlineEdit, cell.dataset.editField);
    });

    // Table Keyboard Navigation (including F2 for inline rename)
    document.getElementById('bases-table').addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT') return;
      const filtered = getFilteredBases();
      if (filtered.length === 0) return;
      const idx = Math.max(0, filtered.findIndex(b => b.id === state.focusedBaseId));

      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        state.focusedBaseId = filtered[Math.min(filtered.length - 1, idx + 1)].id;
        renderTable(filtered);
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        state.focusedBaseId = filtered[Math.max(0, idx - 1)].id;
        renderTable(filtered);
      } else if (e.key === ' ') {
        e.preventDefault();
        const id = state.focusedBaseId;
        if (state.selectedIds.has(id)) state.selectedIds.delete(id);
        else state.selectedIds.add(id);
        syncSelectionStateDOM();
      } else if (e.key === 'F2' && state.focusedBaseId) {
        e.preventDefault();
        const nameCell = document.querySelector(`td[data-name-cell="${CSS.escape(state.focusedBaseId)}"]`);
        if (nameCell) startInlineEdit(nameCell, state.focusedBaseId, 'name');
      } else if (e.key === 'Enter' && state.focusedBaseId) {
        e.preventDefault();
        openDossier(state.focusedBaseId);
      }
    });

    // Floating Bulk Action Bar Events
    document.getElementById('btn-bulk-select-all').addEventListener('click', () => {
      getFilteredBases().forEach(b => state.selectedIds.add(b.id));
      syncSelectionStateDOM();
    });
    document.getElementById('btn-bulk-clear').addEventListener('click', () => {
      state.selectedIds.clear();
      syncSelectionStateDOM();
    });
    document.querySelectorAll('[data-bulk-status]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const st = btn.dataset.bulkStatus;
        const ids = [...state.selectedIds];
        await bulkUpdateBases(ids, { status: st });
        showToast(`Updated ${ids.length} bases → ${STATUS_LABELS[st]}`);
      });
    });
    document.querySelectorAll('[data-bulk-tier]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const tier = btn.dataset.bulkTier;
        const ids = [...state.selectedIds];
        await bulkUpdateBases(ids, { tier });
        showToast(`Updated ${ids.length} bases → ${TIER_LABELS[tier]} Tier`);
      });
    });
    document.getElementById('btn-bulk-route').addEventListener('click', () => {
      let added = 0;
      state.selectedIds.forEach(id => {
        if (!state.routeIds.includes(id)) {
          state.routeIds.push(id);
          added++;
        }
      });
      syncRouteStateDOM();
      showToast(`Added ${added} base(s) to Raid Route`);
    });
    document.getElementById('btn-bulk-xaero').addEventListener('click', e => {
      const lines = [...state.selectedIds]
        .map(id => state.bases.find(b => b.id === id))
        .filter(Boolean)
        .map(b => buildXaeroWaypointData(b, { indexPrefix: b.plate, includeTier: true }).fileLine);
      copyText(lines.join('\n'), `Copied ${lines.length} local Xaero lines`, e.currentTarget);
    });
    document.getElementById('btn-bulk-delete').addEventListener('click', async e => {
      const ids = [...state.selectedIds];
      if (ids.length === 0) return;
      if (!armConfirmButton(e.currentTarget, `Confirm Delete (${ids.length})?`)) return;
      const deletedSnapshot = state.bases.filter(b => state.selectedIds.has(b.id));
      await bulkUpdateBases(ids, null, 'delete');
      showToast(`Deleted ${ids.length} base(s)`, {
        onUndo: () => restoreBases(deletedSnapshot)
      });
    });

    // Route Planner Drawer & Controls
    const routeBackdrop = document.getElementById('route-drawer-backdrop');
    document.getElementById('btn-toggle-route-drawer').addEventListener('click', () => {
      routeBackdrop.hidden = !routeBackdrop.hidden;
    });
    document.getElementById('btn-close-route-drawer').addEventListener('click', () => {
      routeBackdrop.hidden = true;
    });
    routeBackdrop.addEventListener('click', e => {
      if (e.target === routeBackdrop) routeBackdrop.hidden = true;
    });

    const queuePriorityToRoute = () => {
      state.routeIds = state.bases
        .filter(b => normalizeStatus(b.status) === 'priority' && b.dimension !== 'the_end')
        .map(b => b.id);
      optimizeRouteNearestNeighbor();
    };
    document.getElementById('btn-route-autopopulate').addEventListener('click', queuePriorityToRoute);
    document.getElementById('map-btn-route-priority').addEventListener('click', queuePriorityToRoute);
    document.getElementById('btn-route-optimize').addEventListener('click', optimizeRouteNearestNeighbor);
    document.getElementById('map-btn-route-optimize').addEventListener('click', optimizeRouteNearestNeighbor);
    document.getElementById('btn-route-reverse')?.addEventListener('click', () => {
      if (state.routeIds.length < 2) return;
      state.routeIds.reverse();
      syncRouteStateDOM();
      showToast('Reversed Raid Route order');
    });
    document.getElementById('map-btn-route-open').addEventListener('click', () => {
      routeBackdrop.hidden = false;
    });
    document.getElementById('btn-route-clear').addEventListener('click', () => {
      state.routeIds = [];
      syncRouteStateDOM();
    });

    document.getElementById('btn-route-copy-xaero').addEventListener('click', e => {
      const stops = state.routeIds.map(id => state.bases.find(b => b.id === id)).filter(Boolean);
      if (stops.length === 0) return showToast('Queue bases in route first');
      const lines = stops.map((b, i) =>
        buildXaeroWaypointData(b, {
          indexPrefix: String(i + 1).padStart(2, '0'),
          coordMode: 'exact',
          includeTier: true
        }).fileLine
      );
      copyText(lines.join('\n'), `Copied ${lines.length} local Xaero route lines`, e.currentTarget);
    });

    document.getElementById('btn-route-copy-nether').addEventListener('click', e => {
      const stops = state.routeIds.map(id => state.bases.find(b => b.id === id)).filter(Boolean);
      if (stops.length === 0) return showToast('Queue bases in route first');
      const lines = stops.map((b, i) => {
        const wp = buildXaeroWaypointData(b, {
          indexPrefix: String(i + 1).padStart(2, '0'),
          coordMode: 'nether_roof',
          includeTier: false
        });
        return `${String(i + 1).padStart(2, '0')}. ${b.name}: ${wp.coordsText}`;
      });
      copyText(lines.join('\n'), `Copied ${lines.length} Nether Roof coordinates`, e.currentTarget);
    });

    // Xaero Studio Modal
    const xaeroModal = document.getElementById('xaero-modal');
    document.getElementById('btn-open-xaero-modal').addEventListener('click', () => {
      state.lastFocusedElement = document.activeElement;
      renderXaeroStudio();
      xaeroModal.hidden = false;
    });
    document.getElementById('xaero-modal-close').addEventListener('click', () => {
      xaeroModal.hidden = true;
      state.lastFocusedElement?.focus?.();
    });
    xaeroModal.addEventListener('click', e => {
      if (e.target === xaeroModal) {
        xaeroModal.hidden = true;
        state.lastFocusedElement?.focus?.();
      }
    });
    ['xaero-scope', 'xaero-coord-mode', 'xaero-set-name', 'xaero-prefix-plate', 'xaero-include-tier', 'xaero-disable-raided'].forEach(
      id => {
        document.getElementById(id)?.addEventListener('input', renderXaeroStudio);
        document.getElementById(id)?.addEventListener('change', renderXaeroStudio);
      }
    );
    document.getElementById('btn-copy-all-coords')?.addEventListener('click', e => {
      const list = getXaeroScopeBases();
      const coordMode = document.getElementById('xaero-coord-mode')?.value || 'exact';
      const rows = list.map(b => {
        const wp = buildXaeroWaypointData(b, { coordMode });
        return `${b.plate || ''} ${b.name}: ${wp.coordsText}`;
      });
      if (rows.length > 0) copyText(rows.join('\n'), `Copied ${rows.length} base coordinates`, e.currentTarget);
    });
    document.getElementById('btn-copy-file-text').addEventListener('click', e => {
      const text = document.getElementById('xaero-file-output').textContent;
      copyText(text, 'Copied mw$default_1.txt content', e.currentTarget);
    });
    document.getElementById('btn-download-xaero-file').addEventListener('click', () => {
      const text = document.getElementById('xaero-file-output').textContent;
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'mw$default_1.txt';
      a.click();
      URL.revokeObjectURL(url);
      showToast('Downloaded mw$default_1.txt');
    });
    document.getElementById('btn-xaero-import').addEventListener('click', handleXaeroImport);

    // Command Palette Events
    document.getElementById('btn-open-cmd').addEventListener('click', openCommandModal);
    document.getElementById('cmd-close')?.addEventListener('click', closeCommandModal);
    document.getElementById('cmd-modal').addEventListener('click', e => {
      if (e.target.id === 'cmd-modal') closeCommandModal();
      const itemBtn = e.target.closest('[data-cmd-idx]');
      if (itemBtn) {
        const item = state.cmd.items[Number(itemBtn.dataset.cmdIdx)];
        closeCommandModal();
        item?.run();
      }
    });
    document.getElementById('cmd-list')?.addEventListener('mousemove', e => {
      const itemBtn = e.target.closest('[data-cmd-idx]');
      if (!itemBtn) return;
      const idx = Number(itemBtn.dataset.cmdIdx);
      if (!Number.isNaN(idx) && state.cmd.activeIndex !== idx) {
        state.cmd.activeIndex = idx;
        document.querySelectorAll('#cmd-list .cmd-item').forEach(btn => {
          const isActive = Number(btn.dataset.cmdIdx) === idx;
          btn.classList.toggle('is-active', isActive);
          btn.setAttribute('aria-selected', String(isActive));
        });
      }
    });
    document.getElementById('cmd-input').addEventListener('input', e => {
      state.cmd.query = e.target.value;
      state.cmd.activeIndex = 0;
      renderCommandList();
    });
    document.getElementById('cmd-input').addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (state.cmd.items.length > 0) {
          state.cmd.activeIndex = (state.cmd.activeIndex + 1) % state.cmd.items.length;
          renderCommandList();
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (state.cmd.items.length > 0) {
          state.cmd.activeIndex = (state.cmd.activeIndex - 1 + state.cmd.items.length) % state.cmd.items.length;
          renderCommandList();
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = state.cmd.items[state.cmd.activeIndex];
        if (item) {
          closeCommandModal();
          item.run();
        }
      }
    });

    // Context Menu & Inline Picker Keyboard & Hover Sync (Single Unified Highlight)
    ['context-menu', 'inline-picker'].forEach(menuId => {
      const menuEl = document.getElementById(menuId);
      if (!menuEl) return;

      menuEl.addEventListener('mouseover', e => {
        const item = e.target.closest('.ctx-item');
        if (item && document.activeElement !== item) {
          item.focus({ preventScroll: true });
        }
      });

      menuEl.addEventListener('mouseleave', () => {
        menuEl.focus({ preventScroll: true });
      });

      menuEl.addEventListener('keydown', e => {
        const items = [...menuEl.querySelectorAll('.ctx-item')];
        if (items.length === 0) return;
        const idx = items.indexOf(document.activeElement);
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          items[(idx + 1) % items.length].focus({ preventScroll: true });
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          items[(idx - 1 + items.length) % items.length].focus({ preventScroll: true });
        } else if (e.key === 'Home') {
          e.preventDefault();
          items[0].focus({ preventScroll: true });
        } else if (e.key === 'End') {
          e.preventDefault();
          items[items.length - 1].focus({ preventScroll: true });
        }
      });
    });

    // Global Right-Click Context Menu on Cards & Rows
    document.body.addEventListener('contextmenu', e => {
      const target = e.target.closest('[data-base-id]');
      if (!target) return;
      e.preventDefault();
      openContextMenu(target.dataset.baseId, e.clientX, e.clientY);
    });

    // Capture-phase Outside Pointerdown & Scroll Dismissal (Never bypassed by stopPropagation)
    document.addEventListener(
      'pointerdown',
      e => {
        if (!e.target.closest('.popover-anchor') && !e.target.closest('#active-origin-pill')) {
          closeAllPopovers();
        }
        const activeTrigger = state.floatingMenu.triggerEl;
        if (
          !e.target.closest('#context-menu') &&
          !e.target.closest('#inline-picker') &&
          (!activeTrigger || !activeTrigger.contains(e.target))
        ) {
          closeContextMenus();
        }
      },
      true
    );

    window.addEventListener(
      'scroll',
      e => {
        if (
          e.target &&
          e.target.closest &&
          (e.target.closest('#context-menu') || e.target.closest('#inline-picker'))
        ) {
          return;
        }
        if (!document.getElementById('context-menu').hidden || !document.getElementById('inline-picker').hidden) {
          closeContextMenus();
        }
      },
      true
    );

    // Delegated Click Handler
    document.body.addEventListener('click', async e => {
      // Reset All Filters (from Empty State button)
      if (e.target.closest('[data-reset-all-filters]')) {
        state.filters.status = 'all';
        state.filters.query = '';
        searchInput.value = '';
        syncSearchAffordances();
        document.querySelectorAll('.filter-pill').forEach(b => {
          const active = b.dataset.status === 'all';
          b.classList.toggle('is-active', active);
          b.setAttribute('aria-selected', String(active));
        });
        resetFacets();
        return;
      }

      // Remove Active Facet Chip
      const removeChipBtn = e.target.closest('[data-remove-facet]');
      if (removeChipBtn) {
        const token = removeChipBtn.dataset.removeFacet;
        if (token === 'route') {
          state.filters.routeOnly = false;
          document.getElementById('facet-route-only').checked = false;
        } else if (token.startsWith('tier:')) {
          const v = token.split(':')[1];
          state.filters.tiers.delete(v);
          const cb = document.querySelector(`input[data-facet="tier"][value="${v}"]`);
          if (cb) cb.checked = false;
        } else if (token.startsWith('dim:')) {
          const v = token.split(':')[1];
          state.filters.dimensions.delete(v);
          const cb = document.querySelector(`input[data-facet="dimension"][value="${v}"]`);
          if (cb) cb.checked = false;
        }
        renderAll();
        return;
      }
      if (e.target.id === 'btn-clear-chips') {
        resetFacets();
        return;
      }

      // Row / Card Selection (with Shift+Click range selection & zero-reflow DOM sync)
      const selectChipBtn = e.target.closest('[data-select-chip]');
      const selectInput = e.target.closest('input[data-select-id]');
      if (selectChipBtn || selectInput) {
        e.stopPropagation();
        if (selectChipBtn) e.preventDefault();
        const id = selectChipBtn ? selectChipBtn.dataset.selectChip : selectInput.dataset.selectId;
        if (!id) return;
        const willSelect = selectChipBtn ? !state.selectedIds.has(id) : selectInput.checked;
        const filtered = getFilteredBases();
        if (e.shiftKey && state.lastSelectedId) {
          const i1 = filtered.findIndex(b => b.id === state.lastSelectedId);
          const i2 = filtered.findIndex(b => b.id === id);
          if (i1 !== -1 && i2 !== -1) {
            const [start, end] = i1 < i2 ? [i1, i2] : [i2, i1];
            for (let i = start; i <= end; i++) {
              if (willSelect) state.selectedIds.add(filtered[i].id);
              else state.selectedIds.delete(filtered[i].id);
            }
          }
        } else {
          if (willSelect) state.selectedIds.add(id);
          else state.selectedIds.delete(id);
        }
        state.lastSelectedId = id;
        syncSelectionStateDOM();
        return;
      }

      // Inline Rename Trigger Button (✎ in Table View)
      const inlineRenameBtn = e.target.closest('[data-inline-rename]');
      if (inlineRenameBtn) {
        e.stopPropagation();
        const id = inlineRenameBtn.dataset.inlineRename;
        const td = inlineRenameBtn.closest('td');
        if (td) startInlineEdit(td, id, 'name');
        return;
      }

      // Open Context Menu via ⋯ button (or close if already open on this button)
      const ctxBtn = e.target.closest('[data-open-ctx]');
      if (ctxBtn) {
        e.stopPropagation();
        const rect = ctxBtn.getBoundingClientRect();
        openContextMenu(ctxBtn.dataset.openCtx, rect.left, rect.bottom + 4, ctxBtn);
        return;
      }

      // Status Picker or Alt+Click Cycle
      const statusBtn = e.target.closest('[data-status-picker]');
      if (statusBtn) {
        e.stopPropagation();
        const id = statusBtn.dataset.statusPicker;
        if (e.altKey) {
          const base = state.bases.find(b => b.id === id);
          if (base) {
            const curr = normalizeStatus(base.status);
            const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(curr) + 1) % STATUS_CYCLE.length];
            await updateBase(id, { status: next });
            showToast(`${base.name} → ${STATUS_LABELS[next]}`);
          }
        } else {
          openInlinePicker('status', id, statusBtn);
        }
        return;
      }

      // Tier Picker
      const tierBtn = e.target.closest('[data-tier-picker]');
      if (tierBtn) {
        e.stopPropagation();
        openInlinePicker('tier', tierBtn.dataset.tierPicker, tierBtn);
        return;
      }

      // Context Menu / Inline Picker Actions
      const ctxStatus = e.target.closest('[data-ctx-status]');
      if (ctxStatus) {
        const id = ctxStatus.dataset.id;
        const st = ctxStatus.dataset.ctxStatus;
        closeContextMenus();
        const updated = await updateBase(id, { status: st });
        if (updated) showToast(`${updated.name} → ${STATUS_LABELS[st]}`);
        return;
      }

      const ctxTier = e.target.closest('[data-ctx-tier]');
      if (ctxTier) {
        const id = ctxTier.dataset.id;
        const tier = ctxTier.dataset.ctxTier;
        closeContextMenus();
        const updated = await updateBase(id, { tier });
        if (updated) showToast(`${updated.name} → ${TIER_LABELS[tier]} Tier`);
        return;
      }

      const ctxAction = e.target.closest('[data-ctx-action]');
      if (ctxAction) {
        const id = ctxAction.dataset.id;
        const act = ctxAction.dataset.ctxAction;
        const base = state.bases.find(b => b.id === id);
        if (!base) {
          closeContextMenus();
          return;
        }

        if (act === 'delete') {
          if (!armConfirmButton(ctxAction, 'Confirm Delete Base?')) return;
          closeContextMenus();
          const deleted = await deleteBase(id);
          showToast(`Deleted ${base.name}`, {
            onUndo: () => restoreBases(deleted)
          });
          return;
        }

        closeContextMenus();
        if (act === 'dossier') openDossier(id);
        else if (act === 'xaero-ow') {
          copyText(
            buildXaeroWaypointData(base, { coordMode: 'exact' }).fileLine,
            `Copied local Xaero line (${base.name})`
          );
        } else if (act === 'xaero-nether') {
          copyText(
            buildXaeroWaypointData(base, { coordMode: 'nether_roof' }).fileLine,
            `Copied Nether Roof Xaero line (${base.name})`
          );
        } else if (act === 'copy-xyz') {
          copyText(`${base.x} ${base.y} ${base.z}`, `Copied ${base.x} ${base.y} ${base.z}`);
        } else if (act === 'copy-nether-xyz') {
          const nc = getNetherCoords(base);
          if (nc) copyText(`${nc.x} 128 ${nc.z}`, `Copied Nether ${nc.x} 128 ${nc.z}`);
        } else if (act === 'open-seedmap') {
          window.open(getChunkbaseUrl(base.x, base.z, base.dimension), '_blank', 'noopener');
        } else if (act === 'toggle-route') {
          const idx = state.routeIds.indexOf(id);
          if (idx === -1) state.routeIds.push(id);
          else state.routeIds.splice(idx, 1);
          syncRouteStateDOM();
        } else if (act === 'set-origin') {
          state.origin = { x: base.x, z: base.z, label: `${base.name} (${base.x}, ${base.z})` };
          updateCalculatorFromOverworld();
          renderAll();
          showToast(`Vector Origin set to ${base.name}`);
        } else if (act === 'load-calc') {
          document.getElementById('calc-ow-x').value = base.x;
          document.getElementById('calc-ow-z').value = base.z;
          updateCalculatorFromOverworld();
          togglePopover('popover-nether', 'btn-toggle-nether-pop');
        }
        return;
      }

      // Route Reorder (↑ / ↓)
      const routeMoveBtn = e.target.closest('[data-route-move]');
      if (routeMoveBtn) {
        const [idxStr, dirStr] = routeMoveBtn.dataset.routeMove.split(':');
        const idx = Number(idxStr);
        const targetIdx = idx + Number(dirStr);
        if (targetIdx >= 0 && targetIdx < state.routeIds.length) {
          const tmp = state.routeIds[idx];
          state.routeIds[idx] = state.routeIds[targetIdx];
          state.routeIds[targetIdx] = tmp;
          syncRouteStateDOM();
        }
        return;
      }

      // Toggle Route Membership
      const routeBtn = e.target.closest('[data-toggle-route]');
      if (routeBtn) {
        e.stopPropagation();
        const id = routeBtn.dataset.toggleRoute;
        const idx = state.routeIds.indexOf(id);
        if (idx === -1) {
          state.routeIds.push(id);
          showToast('Added to Raid Route');
        } else {
          state.routeIds.splice(idx, 1);
          showToast('Removed from Raid Route');
        }
        syncRouteStateDOM();
        return;
      }

      // Copy Arbitrary Coordinate / String
      const copyEl = e.target.closest('[data-copy]');
      if (copyEl && copyEl.dataset.copy) {
        e.stopPropagation();
        await copyText(copyEl.dataset.copy, `Copied ${copyEl.dataset.copy}`, copyEl, '✓ Copied');
        return;
      }

      // Copy Local Xaero Waypoint Line
      const xaeroBtn = e.target.closest('[data-copy-xaero]');
      if (xaeroBtn) {
        e.stopPropagation();
        const base = state.bases.find(b => b.id === xaeroBtn.dataset.copyXaero);
        if (!base) return;
        const wp = buildXaeroWaypointData(base, { indexPrefix: base.plate, includeTier: true });
        await copyText(wp.fileLine, `Copied local Xaero line for ${base.name}`, xaeroBtn, '✓ Copied');
        return;
      }

      // Open Dossier
      const dossierTrigger = e.target.closest('[data-open-dossier]');
      if (dossierTrigger) {
        e.stopPropagation();
        openDossier(dossierTrigger.dataset.openDossier);
        return;
      }

      // Untracked File Ingest
      const ingestFileBtn = e.target.closest('[data-ingest-file]');
      if (ingestFileBtn) {
        openIngestModal(ingestFileBtn.dataset.ingestFile);
      }
    });

    // Map Canvas Events (Zoom-to-Cursor & Drag-Click Guard)
    const canvas = document.getElementById('radar-canvas');
    if (canvas) {
      const getTransform = () => {
        const rect = canvas.getBoundingClientRect();
        const worldSpan = 26800 / state.radar.zoom;
        const pxPerBlock = Math.min(rect.width, rect.height) / worldSpan;
        return { rect, pxPerBlock };
      };

      canvas.addEventListener('mousemove', e => {
        const { rect, pxPerBlock } = getTransform();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        if (state.radar.isDragging) {
          const dx = mx - state.radar.dragStartX;
          const dy = my - state.radar.dragStartZ;
          state.radar.dragDistance += Math.hypot(dx, dy);
          state.radar.centerX -= dx / pxPerBlock;
          state.radar.centerZ -= dy / pxPerBlock;
          state.radar.dragStartX = mx;
          state.radar.dragStartZ = my;
          drawMapCanvas();
          return;
        }

        const wx = Math.round(state.radar.centerX + (mx - rect.width / 2) / pxPerBlock);
        const wz = Math.round(state.radar.centerZ + (my - rect.height / 2) / pxPerBlock);
        document.getElementById('radar-cursor-readout').textContent =
          `X: ${wx}, Z: ${wz} · Nether: ${Math.floor(wx / 8)}, ${Math.floor(wz / 8)}`;

        let hit = null;
        for (const b of getFilteredBases()) {
          const sx = rect.width / 2 + (b.x - state.radar.centerX) * pxPerBlock;
          const sy = rect.height / 2 + (b.z - state.radar.centerZ) * pxPerBlock;
          if (Math.hypot(mx - sx, my - sy) < 12) {
            hit = b.id;
            break;
          }
        }
        if (state.radar.hoveredId !== hit) {
          state.radar.hoveredId = hit;
          canvas.style.cursor = hit ? 'pointer' : 'crosshair';
          drawMapCanvas();
        }
      });

      canvas.addEventListener('mousedown', e => {
        const { rect } = getTransform();
        state.radar.isDragging = true;
        state.radar.dragDistance = 0;
        state.radar.dragStartX = e.clientX - rect.left;
        state.radar.dragStartZ = e.clientY - rect.top;
      });

      window.addEventListener('mouseup', () => {
        state.radar.isDragging = false;
      });

      canvas.addEventListener('click', e => {
        if (state.radar.dragDistance > 4) return;
        if (!state.radar.hoveredId) return;
        const id = state.radar.hoveredId;
        if (e.shiftKey) {
          const idx = state.routeIds.indexOf(id);
          if (idx === -1) state.routeIds.push(id);
          else state.routeIds.splice(idx, 1);
          renderAll();
        } else {
          state.mapSelectedId = id;
          renderMapSidebar();
          drawMapCanvas();
        }
      });

      canvas.addEventListener(
        'wheel',
        e => {
          e.preventDefault();
          const { rect, pxPerBlock: oldScale } = getTransform();
          const mx = e.clientX - rect.left;
          const my = e.clientY - rect.top;
          const wxBefore = state.radar.centerX + (mx - rect.width / 2) / oldScale;
          const wzBefore = state.radar.centerZ + (my - rect.height / 2) / oldScale;

          const factor = e.deltaY < 0 ? 1.22 : 1 / 1.22;
          state.radar.zoom = Math.max(0.6, Math.min(14, state.radar.zoom * factor));

          const newWorldSpan = 26800 / state.radar.zoom;
          const newScale = Math.min(rect.width, rect.height) / newWorldSpan;
          state.radar.centerX = wxBefore - (mx - rect.width / 2) / newScale;
          state.radar.centerZ = wzBefore - (my - rect.height / 2) / newScale;
          drawMapCanvas();
        },
        { passive: false }
      );
    }

    document.getElementById('radar-show-regions').addEventListener('change', e => {
      state.radar.showRegions = e.target.checked;
      drawMapCanvas();
    });
    document.getElementById('radar-show-labels').addEventListener('change', e => {
      state.radar.showLabels = e.target.checked;
      drawMapCanvas();
    });
    document.getElementById('radar-nether-scale').addEventListener('change', e => {
      state.radar.netherScale = e.target.checked;
      drawMapCanvas();
    });
    document.getElementById('radar-fit-active')?.addEventListener('click', fitMapToActive);
    document.getElementById('radar-reset-view').addEventListener('click', () => {
      state.radar.centerX = 0;
      state.radar.centerZ = 0;
      state.radar.zoom = 1;
      drawMapCanvas();
    });

    // Dossier Modal Events
    document.getElementById('dossier-close').addEventListener('click', closeDossier);
    document.getElementById('dossier-modal').addEventListener('click', e => {
      if (e.target.id === 'dossier-modal') closeDossier();
    });
    document.getElementById('dossier-zoom-presets').addEventListener('click', e => {
      const btn = e.target.closest('.seg-item');
      if (btn) applyDossierOpticalPreset(btn.dataset.preset);
    });
    ['edit-x', 'edit-y', 'edit-z', 'edit-dimension'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', updateDossierComputedPreview);
      document.getElementById(id)?.addEventListener('change', updateDossierComputedPreview);
    });

    const viewport = document.getElementById('dossier-viewport');
    viewport.addEventListener(
      'wheel',
      e => {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.18 : 1 / 1.18;
        state.dossierTransform.scale = Math.max(1, Math.min(5, state.dossierTransform.scale * factor));
        updateDossierImageTransform();
      },
      { passive: false }
    );
    viewport.addEventListener('dblclick', () => applyDossierOpticalPreset('full'));
    viewport.addEventListener('mousedown', e => {
      state.dossierTransform.isDragging = true;
      viewport.classList.add('is-dragging');
      state.dossierTransform.startX = e.clientX - state.dossierTransform.x;
      state.dossierTransform.startY = e.clientY - state.dossierTransform.y;
    });
    window.addEventListener('mousemove', e => {
      if (!state.dossierTransform.isDragging) return;
      state.dossierTransform.x = e.clientX - state.dossierTransform.startX;
      state.dossierTransform.y = e.clientY - state.dossierTransform.startY;
      updateDossierImageTransform();
    });
    window.addEventListener('mouseup', () => {
      if (state.dossierTransform.isDragging) {
        state.dossierTransform.isDragging = false;
        viewport.classList.remove('is-dragging');
      }
    });

    const navigateDossier = dir => {
      const list = getFilteredBases();
      const idx = list.findIndex(b => b.id === state.dossierBaseId);
      if (idx === -1) return;
      const next = list[(idx + dir + list.length) % list.length];
      if (next) openDossier(next.id);
    };
    document.getElementById('dossier-prev').addEventListener('click', () => navigateDossier(-1));
    document.getElementById('dossier-next').addEventListener('click', () => navigateDossier(1));

    document.getElementById('dossier-copy-xyz').addEventListener('click', e => {
      const b = state.bases.find(item => item.id === state.dossierBaseId);
      if (b) copyText(`${b.x} ${b.y} ${b.z}`, `Copied ${b.x} ${b.y} ${b.z}`, e.currentTarget);
    });
    document.getElementById('dossier-copy-nether').addEventListener('click', e => {
      const b = state.bases.find(item => item.id === state.dossierBaseId);
      if (!b) return;
      const nc = getNetherCoords(b);
      if (nc) copyText(`${nc.x} 128 ${nc.z}`, `Copied Nether ${nc.x} 128 ${nc.z}`, e.currentTarget);
    });
    document.getElementById('dossier-copy-xaero').addEventListener('click', e => {
      const b = state.bases.find(item => item.id === state.dossierBaseId);
      if (b) {
        copyText(
          buildXaeroWaypointData(b, { indexPrefix: b.plate, includeTier: true }).fileLine,
          `Copied local Xaero line for ${b.name}`,
          e.currentTarget
        );
      }
    });
    document.getElementById('dossier-open-seedmap')?.addEventListener('click', () => {
      const x = Number(document.getElementById('edit-x').value) || 0;
      const z = Number(document.getElementById('edit-z').value) || 0;
      const dim = document.getElementById('edit-dimension').value || 'overworld';
      window.open(getChunkbaseUrl(x, z, dim), '_blank', 'noopener');
    });
    document.getElementById('dossier-toggle-route').addEventListener('click', () => {
      if (!state.dossierBaseId) return;
      const idx = state.routeIds.indexOf(state.dossierBaseId);
      if (idx === -1) state.routeIds.push(state.dossierBaseId);
      else state.routeIds.splice(idx, 1);
      openDossier(state.dossierBaseId);
      syncRouteStateDOM();
    });

    document.getElementById('dossier-form').addEventListener('submit', async e => {
      e.preventDefault();
      if (!state.dossierBaseId) return;
      const patch = {
        name: document.getElementById('edit-name').value.trim(),
        status: document.getElementById('edit-status').value,
        tier: document.getElementById('edit-tier').value,
        dimension: document.getElementById('edit-dimension').value,
        xaeroColor: Number(document.getElementById('edit-color').value),
        x: Number(document.getElementById('edit-x').value),
        y: Number(document.getElementById('edit-y').value),
        z: Number(document.getElementById('edit-z').value),
        biome: document.getElementById('edit-biome').value.trim(),
        players: document.getElementById('edit-players').value,
        containers: document.getElementById('edit-containers').value.trim(),
        notes: document.getElementById('edit-notes').value.trim()
      };
      const updated = await updateBase(state.dossierBaseId, patch);
      if (updated) {
        closeDossier();
        showToast(`Saved ${updated.name}`);
      }
    });

    document.getElementById('btn-delete-base').addEventListener('click', async e => {
      if (!state.dossierBaseId) return;
      if (!armConfirmButton(e.currentTarget, 'Confirm Delete?')) return;
      const base = state.bases.find(b => b.id === state.dossierBaseId);
      const deleted = await deleteBase(state.dossierBaseId);
      closeDossier();
      showToast(`Deleted ${base?.name || 'base'}`, {
        onUndo: () => restoreBases(deleted)
      });
    });

    // Add Base Modal & Global Drag-and-Drop
    document.getElementById('btn-open-ingest').addEventListener('click', () => openIngestModal());
    document.getElementById('ingest-close').addEventListener('click', closeIngestModal);
    document.getElementById('ingest-cancel').addEventListener('click', closeIngestModal);
    document.getElementById('ingest-modal').addEventListener('click', e => {
      if (e.target.id === 'ingest-modal') closeIngestModal();
    });
    ['new-x', 'new-z', 'new-dimension'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', updateNewBaseNetherPreview);
      document.getElementById(id)?.addEventListener('change', updateNewBaseNetherPreview);
    });
    document.getElementById('ingest-file-input').addEventListener('change', e => {
      const f = e.target.files?.[0];
      if (f) handleFileDropOrSelect(f);
    });

    let dragCounter = 0;
    const dropOverlay = document.getElementById('dropzone-overlay');
    window.addEventListener('dragenter', e => {
      if (e.dataTransfer?.types?.includes('Files')) {
        dragCounter++;
        dropOverlay.hidden = false;
      }
    });
    window.addEventListener('dragleave', () => {
      dragCounter = Math.max(0, dragCounter - 1);
      if (dragCounter === 0) dropOverlay.hidden = true;
    });
    window.addEventListener('dragover', e => e.preventDefault());
    window.addEventListener('drop', e => {
      e.preventDefault();
      dragCounter = 0;
      dropOverlay.hidden = true;
      const file = e.dataTransfer?.files?.[0];
      if (file && file.type.startsWith('image/')) {
        handleFileDropOrSelect(file);
      }
    });

    document.getElementById('ingest-form').addEventListener('submit', async e => {
      e.preventDefault();
      const created = await createBase({
        name: document.getElementById('new-name').value.trim(),
        status: document.getElementById('new-status').value,
        x: Number(document.getElementById('new-x').value),
        y: Number(document.getElementById('new-y').value),
        z: Number(document.getElementById('new-z').value),
        dimension: document.getElementById('new-dimension').value,
        tier: document.getElementById('new-tier').value,
        biome: document.getElementById('new-biome').value.trim() || 'unknown',
        players: document.getElementById('new-players').value,
        containers: document.getElementById('new-containers').value.trim(),
        notes: document.getElementById('new-notes').value.trim(),
        image: state.pendingUploadFilename || ''
      });
      if (created) {
        closeIngestModal();
        showToast(`Added ${created.name}`);
      }
    });

    // Global Keyboard Shortcuts
    window.addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (state.cmd.isOpen) closeCommandModal();
        else openCommandModal();
        return;
      }

      if (e.key === 'Escape') {
        if (state.cmd.isOpen) return closeCommandModal();
        if (!document.getElementById('context-menu').hidden || !document.getElementById('inline-picker').hidden) {
          const prevTrigger = state.floatingMenu.triggerEl;
          closeContextMenus();
          prevTrigger?.focus?.({ preventScroll: true });
          return;
        }
        closeAllPopovers();
        if (!document.getElementById('dossier-modal').hidden) return closeDossier();
        if (!document.getElementById('xaero-modal').hidden) {
          document.getElementById('xaero-modal').hidden = true;
          state.lastFocusedElement?.focus?.();
          return;
        }
        if (!document.getElementById('ingest-modal').hidden) return closeIngestModal();
        if (!document.getElementById('route-drawer-backdrop').hidden) {
          document.getElementById('route-drawer-backdrop').hidden = true;
          return;
        }
        if (state.selectedIds.size > 0) {
          state.selectedIds.clear();
          syncSelectionStateDOM();
          return;
        }
        if (document.activeElement === searchInput) searchInput.blur();
        return;
      }

      const tag = document.activeElement?.tagName;
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if (inInput) return;

      if (!document.getElementById('dossier-modal').hidden) {
        if (e.key === 'ArrowLeft') navigateDossier(-1);
        if (e.key === 'ArrowRight') navigateDossier(1);
        return;
      }

      if (e.key === '/') {
        e.preventDefault();
        searchInput.focus();
      } else if (e.key === '1') {
        switchView('grid');
      } else if (e.key === '2') {
        switchView('table');
      } else if (e.key === '3') {
        switchView('map');
      } else if (e.key.toLowerCase() === 'r' && !e.metaKey && !e.ctrlKey) {
        const rb = document.getElementById('route-drawer-backdrop');
        rb.hidden = !rb.hidden;
      } else if (e.key.toLowerCase() === 'c' && !e.metaKey && !e.ctrlKey) {
        togglePopover('popover-nether', 'btn-toggle-nether-pop');
      } else if (e.key.toLowerCase() === 'n' && !e.metaKey && !e.ctrlKey) {
        openIngestModal();
      }
    });

    window.addEventListener('resize', () => {
      closeContextMenus();
      if (state.activeView === 'map') drawMapCanvas();
    });
  }

  loadPersistedPrefs();
  syncControlsFromState();
  bindEvents();
  fetchBases();
})();
