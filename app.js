(() => {
  'use strict';

  // ============================================================================
  // STATE
  // ============================================================================
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

  const state = {
    apiBase: '',
    bases: [],
    untracked: [],
    activeView: 'plates', // 'plates' | 'ledger' | 'cartography' | 'xaero'
    filters: {
      query: '',
      status: 'all',
      tier: 'all',
      dimension: 'all'
    },
    sortBy: 'plate', // 'plate' | 'priority' | 'distance' | 'depth' | 'name' | 'x' | 'z' | 'tier'
    sortDir: 1,
    cropMode: 'subject', // 'subject' | 'raw'
    origin: { x: 0, z: 0, label: 'WORLD SPAWN (0, 0)' },
    selectedIds: new Set(),
    routeIds: [], // Ordered array of base IDs for the Raid Route Sequencer
    focusedBaseId: null,
    dossierBaseId: null,
    dossierTransform: { scale: 1, x: 0, y: 0, isDragging: false, startX: 0, startY: 0 },
    radar: {
      centerX: 0,
      centerZ: 0,
      zoom: 1, // 1 = full ±10500 view
      isDragging: false,
      dragStartX: 0,
      dragStartZ: 0,
      pointerX: 0,
      pointerZ: 0,
      hoveredId: null,
      showRegions: true,
      showLabels: true,
      netherScale: false
    },
    pendingUploadFilename: ''
  };

  const STATUS_ORDER = { priority: 0, scouted: 1, compromised: 2, raided: 3 };
  const TIER_ORDER = { high: 0, medium: 1, low: 2 };
  const STATUS_CYCLE = ['priority', 'scouted', 'raided', 'compromised'];

  // ============================================================================
  // CARTOGRAPHIC & TELEMETRY MATH
  // ============================================================================

  function getNetherCoords(base) {
    if (base.dimension === 'the_end') {
      return null;
    }
    if (base.dimension === 'the_nether') {
      return { x: base.x, y: base.y, z: base.z };
    }
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
   * Computes Minecraft's exact F3 Rotation Yaw (-180 to +180) and compass octant
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

    // Standard compass angle where 0 = North (-Z), 90 = East (+X), 180 = South (+Z), 270 = West (-X)
    const compassDeg = (Math.atan2(dx, -dz) * (180 / Math.PI) + 360) % 360;
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const cardinal = dirs[Math.round(compassDeg / 45) % 8];
    return { yaw, yawStr, cardinal };
  }

  function formatNumber(n) {
    return Number(n).toLocaleString('en-US');
  }

  function sanitizeXaeroToken(str) {
    return String(str || 'Target')
      .replace(/:/g, '-')
      .replace(/[\r\n]+/g, ' ')
      .trim();
  }

  function buildXaeroWaypointData(base, options = {}) {
    const {
      indexPrefix = '',
      coordMode = 'exact',
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
      : sanitizeXaeroToken(base.name).slice(0, 2).toUpperCase() || 'T';

    const color = base.xaeroColor !== undefined ? Number(base.xaeroColor) : 12;
    const disabled = disableRaided && base.status === 'raided' ? 'true' : 'false';
    const cleanSet = sanitizeXaeroToken(setName || 'gui.xaero_default');

    let dimFolder = 'Internal-overworld-waypoints';
    if (coordMode === 'nether_roof' || base.dimension === 'the_nether') {
      dimFolder = 'Internal-the_nether-waypoints';
    } else if (base.dimension === 'the_end') {
      dimFolder = 'Internal-the_end-waypoints';
    }

    const chatLine = `xaero-waypoint:${name}:${initials}:${x}:${y}:${z}:${color}:${disabled}:0:${dimFolder}`;
    const fileLine = `waypoint:${name}:${initials}:${x}:${y}:${z}:${color}:${disabled}:0:${cleanSet}:false:0:0:false`;

    return { name, initials, x, y, z, color, disabled, chatLine, fileLine };
  }

  // ============================================================================
  // CLIPBOARD & TOAST
  // ============================================================================

  let toastTimer = null;
  function showToast(message) {
    const bar = document.getElementById('toast-bar');
    if (!bar) return;
    bar.textContent = message;
    bar.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      bar.hidden = true;
    }, 2400);
  }

  async function copyText(text, label = 'COPIED TO CLIPBOARD') {
    try {
      await navigator.clipboard.writeText(text);
      showToast(`${label} // ${text.length > 48 ? text.slice(0, 48) + '...' : text}`);
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      showToast(label);
    }
  }

  // ============================================================================
  // API CALLS & DYNAMIC TUNNEL DISCOVERY
  // ============================================================================

  function getPlateSrc(filename) {
    if (!filename) return '';
    if (BUILTIN_IMAGES.has(filename)) {
      return `./plates/${encodeURIComponent(filename)}`;
    }
    return `${state.apiBase}/plates/${encodeURIComponent(filename)}`;
  }

  async function resolveApiBase() {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.trycloudflare.com')) {
      state.apiBase = '';
      return '';
    }
    // Discover active Cloudflare tunnel endpoint via GitHub Gist API (with raw fallback)
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
    } catch (err) {
      // Seamless fallback to static bases.json on CDN if tunnel is mid-rotation
      const fallbackRes = await fetch(`./bases.json?t=${Date.now()}`);
      state.bases = (await fallbackRes.json()) || [];
      state.untracked = [];
    }
    if (!state.focusedBaseId && state.bases.length > 0) {
      state.focusedBaseId = state.bases[0].id;
    }
    populateOriginSelect();
    renderAll();
  }

  async function updateBase(id, patch) {
    const res = await fetch(`${state.apiBase}/api/bases/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    });
    if (!res.ok) {
      showToast('ERROR SAVING TARGET');
      return null;
    }
    const data = await res.json();
    state.bases = data.bases;
    populateOriginSelect();
    renderAll();
    return data.base;
  }

  async function bulkUpdateBases(ids, patch) {
    const res = await fetch(`${state.apiBase}/api/bases/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, patch })
    });
    if (res.ok) {
      const data = await res.json();
      state.bases = data.bases;
      renderAll();
    }
  }

  async function createBase(payload) {
    const res = await fetch(`${state.apiBase}/api/bases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      showToast('FAILED TO CREATE RECORD');
      return null;
    }
    const data = await res.json();
    state.bases = data.bases;
    state.untracked = state.untracked.filter(f => f.toLowerCase() !== (payload.image || '').toLowerCase());
    populateOriginSelect();
    renderAll();
    return data.base;
  }

  async function deleteBase(id) {
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
    }
  }

  // ============================================================================
  // FILTERING & SORTING
  // ============================================================================

  function getFilteredBases() {
    const q = state.filters.query.trim().toLowerCase();
    const filtered = state.bases.filter(b => {
      if (state.filters.status !== 'all' && b.status !== state.filters.status) return false;
      if (state.filters.tier !== 'all' && b.tier !== state.filters.tier) return false;
      if (state.filters.dimension !== 'all' && b.dimension !== state.filters.dimension) return false;
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
    filtered.sort((a, b) => {
      switch (state.sortBy) {
        case 'priority': {
          const sDiff = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
          if (sDiff !== 0) return sDiff * dir;
          return ((TIER_ORDER[a.tier] ?? 9) - (TIER_ORDER[b.tier] ?? 9)) * dir;
        }
        case 'tier':
          return ((TIER_ORDER[a.tier] ?? 9) - (TIER_ORDER[b.tier] ?? 9)) * dir;
        case 'distance': {
          const da = getDistanceFrom(a, state.origin.x, state.origin.z).ow;
          const db = getDistanceFrom(b, state.origin.x, state.origin.z).ow;
          return (da - db) * dir;
        }
        case 'depth':
          return (a.y - b.y) * dir;
        case 'x':
          return (a.x - b.x) * dir;
        case 'z':
          return (a.z - b.z) * dir;
        case 'name':
          return a.name.localeCompare(b.name) * dir;
        case 'plate':
        default:
          return String(a.plate).localeCompare(String(b.plate), undefined, { numeric: true }) * dir;
      }
    });

    return filtered;
  }

  // ============================================================================
  // RENDERING: MASTHEAD & UNTRACKED BANNER
  // ============================================================================

  function populateOriginSelect() {
    const sel = document.getElementById('origin-select');
    if (!sel) return;
    const currentVal = sel.value || '0,0';
    const optionsHtml = [
      `<option value="0,0">WORLD SPAWN (0, 0)</option>`,
      ...state.bases
        .filter(b => b.dimension === 'overworld')
        .map(b => `<option value="${b.x},${b.z}">PLATE ${b.plate} · ${escapeHtml(b.name)} (${b.x}, ${b.z})</option>`)
    ];
    sel.innerHTML = optionsHtml.join('');
    if ([...sel.options].some(o => o.value === currentVal)) {
      sel.value = currentVal;
    }
  }

  function renderMastheadStats() {
    const total = state.bases.length;
    const priority = state.bases.filter(b => b.status === 'priority').length;
    const scouted = state.bases.filter(b => b.status === 'scouted').length;
    const raided = state.bases.filter(b => b.status === 'raided').length;

    document.getElementById('stat-total').textContent = total;
    document.getElementById('stat-priority').textContent = priority;
    document.getElementById('stat-scouted').textContent = scouted;
    document.getElementById('stat-raided').textContent = raided;
    document.getElementById('stat-route').textContent = state.routeIds.length;

    const banner = document.getElementById('untracked-banner');
    if (state.untracked.length > 0) {
      banner.hidden = false;
      document.getElementById('untracked-list-text').textContent =
        `${state.untracked.length} screenshot file(s) in workspace folder not yet cataloged: ${state.untracked.join(', ')}`;
      const btnWrap = document.getElementById('untracked-buttons');
      btnWrap.innerHTML = state.untracked
        .slice(0, 4)
        .map(
          fname =>
            `<button type="button" class="btn-Action" data-ingest-file="${escapeHtml(fname)}">+ CATALOG ${escapeHtml(fname)}</button>`
        )
        .join('');
    } else {
      banner.hidden = true;
    }
  }

  // ============================================================================
  // RENDERING: VIEW 01 — CONTACT SHEET (PLATES)
  // ============================================================================

  function renderPlatesView(filtered) {
    const grid = document.getElementById('plates-grid');
    grid.classList.toggle('crop-subject', state.cropMode === 'subject');

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div style="padding: 48px 24px; grid-column: 1 / -1; text-align: center; color: var(--ink-muted); font-family: var(--font-mono);">
          NO RECONNAISSANCE PLATES MATCH CURRENT FILTER PARAMETERS
        </div>
      `;
      return;
    }

    grid.innerHTML = filtered
      .map(base => {
        const nc = getNetherCoords(base);
        const dist = getDistanceFrom(base, state.origin.x, state.origin.z);
        const bearing = getBearing(state.origin.x, state.origin.z, base.x, base.z);
        const routeIdx = state.routeIds.indexOf(base.id);
        const isInRoute = routeIdx !== -1;

        const dimShort =
          base.dimension === 'the_end' ? 'THE END' : base.dimension === 'the_nether' ? 'NETHER' : 'OVERWORLD';

        const netherStr = nc ? `${nc.x} · 128 · ${nc.z}` : 'END GATEWAY';
        const netherCopy = nc ? `${nc.x} 128 ${nc.z}` : `${base.x} ${base.y} ${base.z}`;
        const xyzStr = `${base.x} · ${base.y} · ${base.z}`;
        const xyzCopy = `${base.x} ${base.y} ${base.z}`;
        const imgSrc = getPlateSrc(base.image);
        const focusOrigin = base.cropFocus || '50% 50%';

        return `
          <article class="plate-card ${base.status === 'raided' ? 'is-raided' : ''} ${isInRoute ? 'in-route' : ''}" data-base-id="${escapeHtml(base.id)}">
            <header class="plate-header">
              <div class="plate-id-wrap">
                <span class="plate-index">Plate ${escapeHtml(base.plate)}</span>
                <h2 class="plate-title" title="${escapeHtml(base.name)}">${escapeHtml(base.name)}</h2>
              </div>
              <div class="plate-badges">
                <span class="dim-tag dim-${escapeHtml(base.dimension)}">${dimShort}</span>
                <button
                  type="button"
                  class="status-chip status-${escapeHtml(base.status)}"
                  data-cycle-status="${escapeHtml(base.id)}"
                  title="Click to cycle status (Priority → Scouted → Raided → Compromised)"
                >${escapeHtml(base.status)}</button>
              </div>
            </header>

            <div class="plate-Stage" data-open-dossier="${escapeHtml(base.id)}">
              ${
                imgSrc
                  ? `<img src="${imgSrc}" alt="Reconnaissance plate for ${escapeHtml(base.name)}" style="transform-origin: ${escapeHtml(focusOrigin)}; object-position: ${escapeHtml(focusOrigin)};" />`
                  : `<div style="display:flex;align-items:center;justify-content:center;height:100%;font-family:var(--font-mono);color:var(--ink-muted);font-size:11px;">NO OPTICAL PLATE ATTACHED</div>`
              }
              <div class="plate-overlay-meta">
                <div class="plate-tag-group">
                  <span class="overlay-chip tier-${escapeHtml(base.tier)}">TIER: ${escapeHtml(base.tier.toUpperCase())}</span>
                  <span class="overlay-chip">Y: ${base.y}</span>
                </div>
                <span class="overlay-chip">${escapeHtml(base.biome.replace('minecraft:', ''))}</span>
              </div>
            </div>

            <div class="plate-telemetry">
              <div class="telemetry-cell is-copyable" data-copy="${escapeHtml(xyzCopy)}" data-copy-label="COPIED BLOCK XYZ (${escapeHtml(base.name)})" title="Click to copy Block X Y Z">
                <span class="tel-label"><span>BLOCK X · Y · Z</span><span>[COPY]</span></span>
                <span class="tel-value">${xyzStr}</span>
              </div>
              <div class="telemetry-cell is-copyable" data-copy="${escapeHtml(netherCopy)}" data-copy-label="COPIED NETHER VECTOR (${escapeHtml(base.name)})" title="Click to copy Nether Roof coordinates">
                <span class="tel-label"><span>NETHER ROOF (÷8)</span><span>[COPY]</span></span>
                <span class="tel-value tel-nether">${netherStr}</span>
              </div>
              <div class="telemetry-cell">
                <span class="tel-label"><span>VECTOR DELTA</span><span>${bearing.cardinal}</span></span>
                <span class="tel-value">${formatNumber(dist.ow)}m · Yaw ${bearing.yawStr}</span>
              </div>
              <div class="telemetry-cell">
                <span class="tel-label"><span>REGION FILE</span><span>CHUNK</span></span>
                <span class="tel-value" title="${escapeHtml(base.region)}">${escapeHtml(base.region.split(' ')[0])} · [${escapeHtml(base.chunk.split(',')[0])},${escapeHtml(base.chunk.split(',')[2] || '0').trim()}]</span>
              </div>
            </div>

            <div class="plate-body">
              <div class="plate-containers" title="${escapeHtml(base.containers || '')}">
                ${escapeHtml(base.containers || 'Standard storage layout')}
              </div>
              <p class="plate-notes">${escapeHtml(base.notes || 'No field notes recorded.')}</p>
              <div class="plate-players">
                <span>SPOTTED: ${escapeHtml((base.players || []).join(', ') || 'None')}</span>
                <span>${escapeHtml(base.capturedAt || '')}</span>
              </div>
            </div>

            <footer class="plate-footer">
              <button type="button" class="plate-foot-btn" data-copy-xaero="${escapeHtml(base.id)}">
                COPY XAERO CHAT
              </button>
              <button type="button" class="plate-foot-btn ${isInRoute ? 'is-active-route' : ''}" data-toggle-route="${escapeHtml(base.id)}">
                ${isInRoute ? `IN ROUTE [#0${routeIdx + 1}]` : '+ QUEUE ROUTE'}
              </button>
              <button type="button" class="plate-foot-btn" data-open-dossier="${escapeHtml(base.id)}">
                DOSSIER / EDIT
              </button>
            </footer>
          </article>
        `;
      })
      .join('');
  }

  // ============================================================================
  // RENDERING: VIEW 02 — COORDINATE LEDGER (TABLE + PINNED PREVIEW)
  // ============================================================================

  function renderLedgerView(filtered) {
    const tbody = document.getElementById('ledger-tbody');
    const selCount = state.selectedIds.size;
    document.getElementById('ledger-selected-count').textContent = `${selCount} SELECTED`;
    document.getElementById('ledger-bulk-actions').hidden = selCount === 0;

    tbody.innerHTML = filtered
      .map(base => {
        const nc = getNetherCoords(base);
        const dist = getDistanceFrom(base, state.origin.x, state.origin.z);
        const bearing = getBearing(state.origin.x, state.origin.z, base.x, base.z);
        const checked = state.selectedIds.has(base.id) ? 'checked' : '';
        const isFocused = state.focusedBaseId === base.id ? 'is-focused' : '';
        const dimShort = base.dimension === 'the_end' ? 'END' : base.dimension === 'the_nether' ? 'NETHER' : 'OW';

        return `
          <tr class="${isFocused}" data-row-id="${escapeHtml(base.id)}">
            <td class="col-check">
              <input type="checkbox" data-select-id="${escapeHtml(base.id)}" ${checked} aria-label="Select ${escapeHtml(base.name)}" />
            </td>
            <td class="col-plate">${escapeHtml(base.plate)}</td>
            <td class="col-name">
              <strong style="cursor:pointer;" data-open-dossier="${escapeHtml(base.id)}">${escapeHtml(base.name)}</strong>
            </td>
            <td class="col-status">
              <button type="button" class="status-chip status-${escapeHtml(base.status)}" data-cycle-status="${escapeHtml(base.id)}">
                ${escapeHtml(base.status)}
              </button>
            </td>
            <td class="col-tier" style="font-family:var(--font-mono);font-size:11px;text-transform:uppercase;">
              ${escapeHtml(base.tier)}
            </td>
            <td class="col-dim">
              <span class="dim-tag dim-${escapeHtml(base.dimension)}">${dimShort}</span>
            </td>
            <td class="col-num copy-coord" data-copy="${base.x} ${base.y} ${base.z}" title="Click to copy X Y Z">${base.x}</td>
            <td class="col-num copy-coord" data-copy="${base.x} ${base.y} ${base.z}" title="Click to copy X Y Z">${base.y}</td>
            <td class="col-num copy-coord" data-copy="${base.x} ${base.y} ${base.z}" title="Click to copy X Y Z">${base.z}</td>
            <td class="col-num copy-coord" style="color:#d9a76c;" data-copy="${nc ? `${nc.x} 128 ${nc.z}` : ''}">${nc ? nc.x : '—'}</td>
            <td class="col-num copy-coord" style="color:#d9a76c;" data-copy="${nc ? `${nc.x} 128 ${nc.z}` : ''}">${nc ? nc.z : '—'}</td>
            <td class="col-num">${formatNumber(dist.ow)}m <span style="color:var(--ink-muted);">(${dist.nether !== null ? formatNumber(dist.nether) + 'm' : 'END'})</span></td>
            <td class="col-num">${bearing.cardinal} ${bearing.yawStr}</td>
            <td class="col-meta" style="font-family:var(--font-mono);font-size:11px;color:var(--ink-secondary);">
              ${escapeHtml(base.biome.replace('minecraft:', ''))} · <span style="color:var(--ink-muted);">${escapeHtml(base.region.split(' ')[0])}</span>
            </td>
            <td class="col-actions">
              <div style="display:flex;gap:4px;">
                <button type="button" class="btn-Action" data-copy-xaero="${escapeHtml(base.id)}">XAERO</button>
                <button type="button" class="btn-Action" data-toggle-route="${escapeHtml(base.id)}">${state.routeIds.includes(base.id) ? 'ROUTED' : '+ROUTE'}</button>
                <button type="button" class="btn-Action" data-open-dossier="${escapeHtml(base.id)}">OPEN</button>
              </div>
            </td>
          </tr>
        `;
      })
      .join('');

    renderLedgerSidePreview();
  }

  function renderLedgerSidePreview() {
    const base = state.bases.find(b => b.id === state.focusedBaseId) || state.bases[0];
    if (!base) return;
    const nc = getNetherCoords(base);
    const dist = getDistanceFrom(base, state.origin.x, state.origin.z);
    const bearing = getBearing(state.origin.x, state.origin.z, base.x, base.z);

    document.getElementById('preview-plate').textContent = `Plate ${base.plate}`;
    document.getElementById('preview-name').textContent = base.name;
    const imgEl = document.getElementById('preview-img');
    imgEl.src = getPlateSrc(base.image);
    document.getElementById('preview-image-wrap').dataset.openDossier = base.id;

    document.getElementById('preview-specs').innerHTML = `
      <div class="spec-row"><span class="spec-key">BLOCK XYZ</span><span>${base.x}, ${base.y}, ${base.z}</span></div>
      <div class="spec-row"><span class="spec-key">NETHER ROOF (÷8)</span><span style="color:#d9a76c;">${nc ? `${nc.x}, 128, ${nc.z}` : 'N/A (THE END)'}</span></div>
      <div class="spec-row"><span class="spec-key">VECTOR / F3 YAW</span><span>${formatNumber(dist.ow)}m · ${bearing.cardinal} (${bearing.yawStr})</span></div>
      <div class="spec-row"><span class="spec-key">REGION / CHUNK</span><span>${escapeHtml(base.region)}</span></div>
      <div class="spec-row"><span class="spec-key">SPOTTED PLAYERS</span><span>${escapeHtml((base.players || []).join(', '))}</span></div>
      <div class="spec-row"><span class="spec-key">CONTAINERS</span><span>${escapeHtml(base.containers || '—')}</span></div>
      <p style="color:var(--ink-secondary);font-size:12px;line-height:1.45;margin-top:4px;">${escapeHtml(base.notes || '')}</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px;">
        <button type="button" class="btn-primary" data-copy-xaero="${escapeHtml(base.id)}">COPY XAERO</button>
        <button type="button" class="btn-secondary" data-open-dossier="${escapeHtml(base.id)}">FULL DOSSIER</button>
      </div>
    `;
  }

  // ============================================================================
  // RENDERING: VIEW 03 — SPATIAL PLOT & RAID ROUTE SEQUENCER
  // ============================================================================

  function renderCartographyView() {
    renderRouteSidebar();
    drawRadarCanvas();
  }

  function renderRouteSidebar() {
    const listEl = document.getElementById('route-list');
    const stops = state.routeIds.map(id => state.bases.find(b => b.id === id)).filter(Boolean);

    let totalOw = 0;
    let totalNether = 0;
    let prevX = state.origin.x;
    let prevZ = state.origin.z;

    const itemsHtml = stops.map((base, idx) => {
      const legOw = Math.round(Math.hypot(base.x - prevX, base.z - prevZ));
      const legNether = Math.round(legOw / 8);
      const bearing = getBearing(prevX, prevZ, base.x, base.z);
      totalOw += legOw;
      totalNether += legNether;
      prevX = base.x;
      prevZ = base.z;
      const nc = getNetherCoords(base);

      return `
        <div class="route-item">
          <div class="route-item-top">
            <div>
              <span class="route-step-num">LEG 0${idx + 1}</span>
              <span class="route-step-name" style="margin-left:8px;cursor:pointer;" data-open-dossier="${escapeHtml(base.id)}">${escapeHtml(base.name)}</span>
            </div>
            <div style="display:flex;gap:4px;">
              <button type="button" class="btn-Action" data-copy-xaero="${escapeHtml(base.id)}">XAERO</button>
              <button type="button" class="btn-Action" data-toggle-route="${escapeHtml(base.id)}" title="Remove stop">×</button>
            </div>
          </div>
          <div class="route-item-leg">
            <span>OW: ${base.x}, ${base.y}, ${base.z}</span>
            <span style="color:#d9a76c;">N: ${nc ? `${nc.x}, ${nc.z}` : 'END'}</span>
          </div>
          <div class="route-item-leg" style="color:var(--ink-muted);">
            <span>Δ ${formatNumber(legOw)}m (${formatNumber(legNether)}m N)</span>
            <span>F3 YAW: ${bearing.cardinal} ${bearing.yawStr}</span>
          </div>
        </div>
      `;
    });

    document.getElementById('route-count').textContent = stops.length;
    document.getElementById('route-dist-ow').textContent = `${formatNumber(totalOw)} m`;
    document.getElementById('route-dist-nether').textContent = `${formatNumber(totalNether)} m`;

    if (stops.length === 0) {
      listEl.innerHTML = `
        <div style="padding: 32px 18px; color: var(--ink-muted); font-family: var(--font-mono); font-size: 11px; line-height: 1.6;">
          NO TARGETS IN ACTIVE ROUTE MANIFEST.<br/><br/>
          Click any target node on the spatial plot, or press <strong>QUEUE PRIORITY</strong> above to chain a multi-target raid vector and compute exact Nether Roof travel bearings.
        </div>
      `;
    } else {
      listEl.innerHTML = itemsHtml.join('');
    }
  }

  function optimizeRouteNearestNeighbor() {
    const stops = state.routeIds.map(id => state.bases.find(b => b.id === id)).filter(Boolean);
    if (stops.length < 2) return;
    const remaining = [...stops];
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

    state.routeIds = ordered;
    renderAll();
    showToast('RAID ROUTE OPTIMIZED (NEAREST-NEIGHBOR VECTOR)');
  }

  function drawRadarCanvas() {
    const canvas = document.getElementById('radar-canvas');
    const container = document.getElementById('radar-container');
    if (!canvas || !container || state.activeView !== 'cartography') return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));

    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.scale(dpr, dpr);

    const W = rect.width;
    const H = rect.height;

    // Clear background
    ctx.fillStyle = '#080908';
    ctx.fillRect(0, 0, W, H);

    // Coordinate conversion helpers: world range ±10,800 at zoom=1
    const worldSpan = 22000 / state.radar.zoom;
    const pxPerBlock = Math.min(W, H) / worldSpan;

    const toScreenX = wx => W / 2 + (wx - state.radar.centerX) * pxPerBlock;
    const toScreenY = wz => H / 2 + (wz - state.radar.centerZ) * pxPerBlock;

    // 1. Optional 512m Region Grid
    if (state.radar.showRegions && pxPerBlock * 512 >= 14) {
      ctx.strokeStyle = '#141714';
      ctx.lineWidth = 1;
      const startReg = Math.floor((-10500) / 512) * 512;
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

    // 2. Major 2000-block Grid Lines
    ctx.strokeStyle = '#1d211d';
    ctx.lineWidth = 1;
    ctx.font = '10px "IBM Plex Mono", monospace';
    ctx.fillStyle = '#4c4e48';
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

    // Axis labels
    for (let g = -10000; g <= 10000; g += 2000) {
      if (g === 0) continue;
      const sx = toScreenX(g);
      const sy = toScreenY(g);
      const labelVal = state.radar.netherScale ? Math.round(g / 8) : g;
      if (sx > 30 && sx < W - 30) {
        ctx.fillText(`X:${labelVal}`, sx + 4, 14);
      }
      if (sy > 20 && sy < H - 20) {
        ctx.fillText(`Z:${labelVal}`, 8, sy - 4);
      }
    }

    // 3. Zero Axes (X=0, Z=0)
    ctx.strokeStyle = '#2d332d';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(toScreenX(0), 0);
    ctx.lineTo(toScreenX(0), H);
    ctx.moveTo(0, toScreenY(0));
    ctx.lineTo(W, toScreenY(0));
    ctx.stroke();

    // 4. ±10,000 World Border Box
    const wbLeft = toScreenX(-10000);
    const wbRight = toScreenX(10000);
    const wbTop = toScreenY(-10000);
    const wbBottom = toScreenY(10000);
    ctx.strokeStyle = 'rgba(212, 77, 39, 0.38)';
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(wbLeft, wbTop, wbRight - wbLeft, wbBottom - wbTop);
    ctx.setLineDash([]);

    // 5. Active Raid Route Vector Path
    if (state.routeIds.length > 0) {
      ctx.strokeStyle = '#d44d27';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      let prevSX = toScreenX(state.origin.x);
      let prevSY = toScreenY(state.origin.z);
      ctx.moveTo(prevSX, prevSY);

      state.routeIds.forEach((id, idx) => {
        const b = state.bases.find(item => item.id === id);
        if (!b) return;
        const sx = toScreenX(b.x);
        const sy = toScreenY(b.z);
        ctx.lineTo(sx, sy);

        // Midpoint leg label
        const midX = (prevSX + sx) / 2;
        const midY = (prevSY + sy) / 2;
        ctx.save();
        ctx.fillStyle = '#d44d27';
        ctx.font = '600 9.5px "IBM Plex Mono", monospace';
        ctx.fillText(`L0${idx + 1}`, midX + 5, midY - 4);
        ctx.restore();

        prevSX = sx;
        prevSY = sy;
      });
      ctx.stroke();
    }

    // 6. Origin Marker
    const origSX = toScreenX(state.origin.x);
    const origSY = toScreenY(state.origin.z);
    ctx.strokeStyle = '#eae6df';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(origSX - 7, origSY);
    ctx.lineTo(origSX + 7, origSY);
    ctx.moveTo(origSX, origSY - 7);
    ctx.lineTo(origSX, origSY + 7);
    ctx.stroke();
    ctx.fillStyle = '#9c9990';
    ctx.font = '9.5px "IBM Plex Mono", monospace';
    ctx.fillText('ORIGIN', origSX + 8, origSY + 12);

    // 7. Plot Target Nodes
    const visibleBases = getFilteredBases();
    visibleBases.forEach(base => {
      const sx = toScreenX(base.x);
      const sy = toScreenY(base.z);
      const isHovered = state.radar.hoveredId === base.id;
      const routeIdx = state.routeIds.indexOf(base.id);

      let color = '#c59b38';
      if (base.status === 'priority') color = '#d44d27';
      else if (base.status === 'raided') color = '#5a5e58';
      else if (base.status === 'compromised') color = '#b86b28';
      if (base.dimension === 'the_end') color = '#9e78a1';

      // Outer reticle if hovered or in route
      if (isHovered || routeIdx !== -1) {
        ctx.strokeStyle = isHovered ? '#eae6df' : '#d44d27';
        ctx.lineWidth = 1;
        ctx.strokeRect(sx - 8, sy - 8, 16, 16);
      }

      // Node geometric marker (square for Overworld, diamond for The End)
      ctx.fillStyle = color;
      if (base.dimension === 'the_end') {
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-4.5, -4.5, 9, 9);
        ctx.restore();
      } else {
        ctx.fillRect(sx - 4, sy - 4, 8, 8);
      }

      // Callout label
      if (state.radar.showLabels || isHovered) {
        const coordText = state.radar.netherScale
          ? `[${Math.floor(base.x / 8)}, ${Math.floor(base.z / 8)}]`
          : `[${base.x}, ${base.z}]`;
        const routePrefix = routeIdx !== -1 ? `#0${routeIdx + 1} ` : '';
        const label = `${routePrefix}${base.plate} ${base.name} ${coordText}`;

        ctx.font = isHovered ? '600 11px "IBM Plex Mono", monospace' : '10px "IBM Plex Mono", monospace';
        const textWidth = ctx.measureText(label).width;

        // Slight offset on northern cluster (dort930656 & frrrupy share Z=-9877/-9878)
        const yOffset = base.id === 'frrrupy' ? 14 : -8;
        const placeLeft = sx + textWidth + 24 > W;
        const boxX = placeLeft ? sx - textWidth - 16 : sx + 8;
        const textX = placeLeft ? sx - textWidth - 12 : sx + 12;

        ctx.fillStyle = 'rgba(12, 13, 12, 0.84)';
        ctx.fillRect(boxX, sy + yOffset - 9, textWidth + 8, 14);
        ctx.fillStyle = isHovered ? '#ffffff' : '#eae6df';
        ctx.fillText(label, textX, sy + yOffset + 1);
      }
    });

    ctx.restore();
  }

  // ============================================================================
  // RENDERING: VIEW 04 — XAERO'S MINIMAP TELEMETRY & FILE I/O
  // ============================================================================

  function getXaeroScopeBases() {
    const scope = document.getElementById('xaero-scope')?.value || 'unraided';
    if (scope === 'priority') {
      return state.bases.filter(b => b.status === 'priority');
    }
    if (scope === 'unraided') {
      return state.bases.filter(b => b.status !== 'raided');
    }
    if (scope === 'route') {
      return state.routeIds.map(id => state.bases.find(b => b.id === id)).filter(Boolean);
    }
    if (scope === 'the_end') {
      return state.bases.filter(b => b.dimension === 'the_end');
    }
    return [...state.bases];
  }

  function renderXaeroView() {
    const coordMode = document.getElementById('xaero-coord-mode')?.value || 'exact';
    const setName = document.getElementById('xaero-set-name')?.value || 'gui.xaero_default';
    const prefixPlate = document.getElementById('xaero-prefix-plate')?.checked ?? true;
    const includeTier = document.getElementById('xaero-include-tier')?.checked ?? true;
    const disableRaided = document.getElementById('xaero-disable-raided')?.checked ?? true;

    const list = getXaeroScopeBases();
    const compiled = list.map((base, idx) => {
      const scope = document.getElementById('xaero-scope')?.value;
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

    const chatContainer = document.getElementById('xaero-chat-list');
    if (compiled.length === 0) {
      chatContainer.innerHTML = `<div style="padding:20px;font-family:var(--font-mono);color:var(--ink-muted);">NO TARGETS IN SELECTED SCOPE</div>`;
    } else {
      chatContainer.innerHTML = compiled
        .map(
          ({ base, wp }) => `
          <div class="xaero-chat-row">
            <strong>${escapeHtml(base.plate)} · ${escapeHtml(base.name)}</strong>
            <span class="xaero-chat-string" title="${escapeHtml(wp.chatLine)}">${escapeHtml(wp.chatLine)}</span>
            <button type="button" class="btn-Action" data-copy="${escapeHtml(wp.chatLine)}" data-copy-label="COPIED XAERO CHAT LINE">COPY LINE</button>
          </div>
        `
        )
        .join('');
    }

    const fileHeader = [
      '#',
      '#waypoint:name:initials:x:y:z:color:disabled:type:set:rotate_on_tp:tp_yaw:visibility_type:destination',
      '#'
    ];
    const fileBody = compiled.map(c => c.wp.fileLine);
    const fullFileText = [...fileHeader, ...fileBody].join('\n');
    document.getElementById('xaero-file-output').textContent = fullFileText;
  }

  // ============================================================================
  // DOSSIER MODAL (HIGH-RES OPTICAL INSPECTOR + EDITOR)
  // ============================================================================

  function openDossier(baseId) {
    const base = state.bases.find(b => b.id === baseId);
    if (!base) return;
    state.dossierBaseId = base.id;
    state.focusedBaseId = base.id;

    document.getElementById('dossier-plate').textContent = `Plate ${base.plate}`;
    document.getElementById('dossier-title').textContent = base.name;
    document.getElementById('dossier-dim-badge').textContent = base.dimension.replace('minecraft:', '').toUpperCase();

    const imgEl = document.getElementById('dossier-img');
    imgEl.src = getPlateSrc(base.image);
    document.getElementById('dossier-file-meta').textContent =
      `PLATE ASSET: ${base.image || 'NONE'} · CAPTURED: ${base.capturedAt || 'UNKNOWN'}${base.gameDay ? ` (DAY ${base.gameDay})` : ''} · SCROLL TO ZOOM / DRAG TO PAN`;

    // Populate Form
    document.getElementById('edit-name').value = base.name || '';
    document.getElementById('edit-status').value = base.status || 'scouted';
    document.getElementById('edit-tier').value = base.tier || 'medium';
    document.getElementById('edit-dimension').value = base.dimension || 'overworld';
    document.getElementById('edit-color').value = String(base.xaeroColor ?? 12);
    document.getElementById('edit-x').value = base.x;
    document.getElementById('edit-y').value = base.y;
    document.getElementById('edit-z').value = base.z;
    document.getElementById('edit-biome').value = base.biome || '';
    document.getElementById('edit-region').value = base.region || '';
    document.getElementById('edit-players').value = (base.players || []).join(', ');
    document.getElementById('edit-containers').value = base.containers || '';
    document.getElementById('edit-notes').value = base.notes || '';
    document.getElementById('dossier-save-msg').textContent = '';

    updateDossierComputedTelemetry(base);
    applyDossierOpticalPreset('full');

    document.getElementById('dossier-modal').hidden = false;
  }

  function updateDossierComputedTelemetry(base) {
    const nc = getNetherCoords(base);
    const dist = getDistanceFrom(base, state.origin.x, state.origin.z);
    const bearing = getBearing(state.origin.x, state.origin.z, base.x, base.z);
    const wp = buildXaeroWaypointData(base, { indexPrefix: base.plate, includeTier: true });

    document.getElementById('dossier-computed-strip').innerHTML = `
      <div><span style="color:var(--ink-muted);display:block;font-size:9px;">NETHER ROOF (÷8)</span><strong style="color:#d9a76c;">${nc ? `${nc.x}, 128, ${nc.z}` : 'N/A (THE END)'}</strong></div>
      <div><span style="color:var(--ink-muted);display:block;font-size:9px;">RADIAL DISTANCE</span><strong>${formatNumber(dist.ow)}m OW ${dist.nether !== null ? `(${formatNumber(dist.nether)}m N)` : ''}</strong></div>
      <div><span style="color:var(--ink-muted);display:block;font-size:9px;">F3 HEADING YAW</span><strong>${bearing.cardinal} · ${bearing.yawStr}</strong></div>
    `;
    document.getElementById('dossier-xaero-preview').value = wp.chatLine;
  }

  function applyDossierOpticalPreset(preset) {
    const buttons = document.querySelectorAll('#dossier-zoom-presets .seg-btn');
    buttons.forEach(btn => btn.classList.toggle('is-active', btn.dataset.preset === preset));

    const img = document.getElementById('dossier-img');
    if (!img) return;

    if (preset === 'full') {
      state.dossierTransform = { scale: 1, x: 0, y: 0, isDragging: false, startX: 0, startY: 0 };
      img.style.transformOrigin = '50% 50%';
    } else if (preset === 'subject') {
      state.dossierTransform = { scale: 1.55, x: 0, y: 0, isDragging: false, startX: 0, startY: 0 };
      img.style.transformOrigin = '52% 52%';
    } else if (preset === 'f3_left') {
      // Zooms directly onto top-left BetterF3 XYZ / Block / Region / Biome telemetry
      state.dossierTransform = { scale: 2.35, x: 0, y: 0, isDragging: false, startX: 0, startY: 0 };
      img.style.transformOrigin = '6% 18%';
    } else if (preset === 'f3_right') {
      // Zooms directly onto top-right BetterF3 Targeted Block readout
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

  function closeDossier() {
    document.getElementById('dossier-modal').hidden = true;
    state.dossierBaseId = null;
  }

  // ============================================================================
  // NEW TARGET INGESTION & OPTICAL F3 SCREENSHOT PARSER (OCR)
  // ============================================================================

  function openIngestModal(prefillFile = null) {
    document.getElementById('ingest-form').reset();
    state.pendingUploadFilename = '';
    document.getElementById('ingest-preview-img').hidden = true;
    document.getElementById('ingest-preview-empty').hidden = false;
    document.getElementById('btn-run-ocr').hidden = true;
    document.getElementById('ocr-status-text').textContent = 'AWAITING IMAGE OR MANUAL ENTRY';
    document.getElementById('ingest-modal').hidden = false;

    if (prefillFile) {
      loadExistingUntrackedFileForIngest(prefillFile);
    }
  }

  function closeIngestModal() {
    document.getElementById('ingest-modal').hidden = true;
  }

  function loadExistingUntrackedFileForIngest(filename) {
    state.pendingUploadFilename = filename;
    const baseName = filename.replace(/\.[^.]+$/, '');
    document.getElementById('new-name').value = baseName;
    document.getElementById('new-players').value = baseName;

    const imgEl = document.getElementById('ingest-preview-img');
    imgEl.src = getPlateSrc(filename);
    imgEl.hidden = false;
    document.getElementById('ingest-preview-empty').hidden = true;
    document.getElementById('btn-run-ocr').hidden = false;
    imgEl.onload = () => {
      runOpticalF3Extraction(imgEl);
    };
  }

  async function handleFileDropOrSelect(file) {
    if (!file) return;
    openIngestModal();

    const baseName = file.name.replace(/\.[^.]+$/, '');
    document.getElementById('new-name').value = baseName;
    document.getElementById('new-players').value = baseName;
    document.getElementById('ocr-status-text').textContent = 'UPLOADING SCREENSHOT TO WORKSPACE...';

    const reader = new FileReader();
    reader.onload = async e => {
      const dataUrl = e.target.result;
      const imgEl = document.getElementById('ingest-preview-img');
      imgEl.src = dataUrl;
      imgEl.hidden = false;
      document.getElementById('ingest-preview-empty').hidden = true;
      document.getElementById('btn-run-ocr').hidden = false;

      // Save file to workspace root via /api/upload
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
      } catch (err) {
        console.warn('Upload failed:', err);
      }

      imgEl.onload = () => {
        runOpticalF3Extraction(imgEl);
      };
    };
    reader.readAsDataURL(file);
  }

  /**
   * Crops the top-left F3 debug telemetry zone and extracts Block X Y Z, Dimension, and Biome
   * using on-demand Tesseract.js OCR if available, with graceful fallback.
   */
  async function runOpticalF3Extraction(imgElement) {
    const statusEl = document.getElementById('ocr-status-text');
    statusEl.textContent = 'SCANNING F3 DEBUG TELEMETRY (TOP-LEFT QUADRANT)...';

    try {
      // Load Tesseract.js dynamically only when needed
      if (!window.Tesseract) {
        await new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
          s.onload = resolve;
          s.onerror = reject;
          document.head.appendChild(s);
        });
      }

      // Crop top-left 38% width x 65% height where F3 Block/XYZ/Dimension/Biome live
      const offCanvas = document.createElement('canvas');
      const cropW = Math.floor((imgElement.naturalWidth || 1920) * 0.36);
      const cropH = Math.floor((imgElement.naturalHeight || 1080) * 0.62);
      offCanvas.width = cropW;
      offCanvas.height = cropH;
      const ctx = offCanvas.getContext('2d');
      ctx.drawImage(imgElement, 0, 0, cropW, cropH, 0, 0, cropW, cropH);

      const result = await window.Tesseract.recognize(offCanvas, 'eng');
      const rawText = result?.data?.text || '';
      parseF3TextIntoForm(rawText);
    } catch (err) {
      statusEl.textContent = 'OPTICAL OCR OFFLINE — ENTER BLOCK X, Y, Z FROM IMAGE';
    }
  }

  function parseF3TextIntoForm(text) {
    const statusEl = document.getElementById('ocr-status-text');
    let foundCoords = false;

    // Match "Block: -4920 -18 -1237"
    const blockMatch = text.match(/Block:\s*([+-]?\d+)\s+([+-]?\d+)\s+([+-]?\d+)/i);
    if (blockMatch) {
      document.getElementById('new-x').value = parseInt(blockMatch[1], 10);
      document.getElementById('new-y').value = parseInt(blockMatch[2], 10);
      document.getElementById('new-z').value = parseInt(blockMatch[3], 10);
      foundCoords = true;
    } else {
      // Fallback: Match "XYZ: -4919,836 -17,38702 -1236,462"
      const xyzMatch = text.match(/XYZ:\s*([+-]?\d+)[.,]\d+\s+([+-]?\d+)[.,]\d+\s+([+-]?\d+)/i);
      if (xyzMatch) {
        document.getElementById('new-x').value = parseInt(xyzMatch[1], 10);
        document.getElementById('new-y').value = parseInt(xyzMatch[2], 10);
        document.getElementById('new-z').value = parseInt(xyzMatch[3], 10);
        foundCoords = true;
      }
    }

    if (/the_end/i.test(text)) {
      document.getElementById('new-dimension').value = 'the_end';
    } else if (/the_nether/i.test(text)) {
      document.getElementById('new-dimension').value = 'the_nether';
    } else if (/overworld/i.test(text)) {
      document.getElementById('new-dimension').value = 'overworld';
    }

    const biomeMatch = text.match(/Biome:\s*(?:minecraft:)?([a-z0-9_]+)/i);
    if (biomeMatch) {
      document.getElementById('new-biome').value = biomeMatch[1].toLowerCase();
    }

    statusEl.textContent = foundCoords
      ? 'F3 TELEMETRY EXTRACTED AUTOMATICALLY — VERIFY BEFORE SAVING'
      : 'PARTIAL SCAN — VERIFY BLOCK X, Y, Z COORDINATES';
  }

  // ============================================================================
  // MASTER RENDER DISPATCH
  // ============================================================================

  function renderAll() {
    renderMastheadStats();
    const filtered = getFilteredBases();

    if (state.activeView === 'plates') {
      renderPlatesView(filtered);
    } else if (state.activeView === 'ledger') {
      renderLedgerView(filtered);
    } else if (state.activeView === 'cartography') {
      renderCartographyView();
    } else if (state.activeView === 'xaero') {
      renderXaeroView();
    }
  }

  function switchView(viewName) {
    state.activeView = viewName;
    document.querySelectorAll('.nav-tab').forEach(btn => {
      btn.classList.toggle('is-active', btn.dataset.view === viewName);
    });
    document.getElementById('view-plates').hidden = viewName !== 'plates';
    document.getElementById('view-ledger').hidden = viewName !== 'ledger';
    document.getElementById('view-cartography').hidden = viewName !== 'cartography';
    document.getElementById('view-xaero').hidden = viewName !== 'xaero';
    document.getElementById('plate-crop-control').hidden = viewName !== 'plates';

    renderAll();
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ============================================================================
  // EVENT LISTENERS
  // ============================================================================

  function bindEvents() {
    // Top Navigation Tabs
    document.querySelectorAll('.nav-tab').forEach(btn => {
      btn.addEventListener('click', () => switchView(btn.dataset.view));
    });

    // Search Input
    document.getElementById('search-input').addEventListener('input', e => {
      state.filters.query = e.target.value;
      renderAll();
    });

    // Segmented Filter Buttons (Status, Tier, Dimension)
    document.getElementById('filter-status').addEventListener('click', e => {
      const btn = e.target.closest('.seg-btn');
      if (!btn) return;
      state.filters.status = btn.dataset.status;
      document.querySelectorAll('#filter-status .seg-btn').forEach(b => b.classList.toggle('is-active', b === btn));
      renderAll();
    });

    document.getElementById('filter-tier').addEventListener('click', e => {
      const btn = e.target.closest('.seg-btn');
      if (!btn) return;
      state.filters.tier = btn.dataset.tier;
      document.querySelectorAll('#filter-tier .seg-btn').forEach(b => b.classList.toggle('is-active', b === btn));
      renderAll();
    });

    document.getElementById('filter-dim').addEventListener('click', e => {
      const btn = e.target.closest('.seg-btn');
      if (!btn) return;
      state.filters.dimension = btn.dataset.dim;
      document.querySelectorAll('#filter-dim .seg-btn').forEach(b => b.classList.toggle('is-active', b === btn));
      renderAll();
    });

    // Vector Origin Selector
    document.getElementById('origin-select').addEventListener('change', e => {
      const [ox, oz] = e.target.value.split(',').map(Number);
      state.origin = {
        x: ox || 0,
        z: oz || 0,
        label: e.target.options[e.target.selectedIndex]?.text || 'ORIGIN'
      };
      renderAll();
    });

    // Optical Crop Mode Toggle
    document.getElementById('toggle-crop-mode').addEventListener('click', e => {
      const btn = e.target.closest('.seg-btn');
      if (!btn) return;
      state.cropMode = btn.dataset.crop;
      document.querySelectorAll('#toggle-crop-mode .seg-btn').forEach(b => b.classList.toggle('is-active', b === btn));
      renderAll();
    });

    // Sort Select
    document.getElementById('sort-select').addEventListener('change', e => {
      state.sortBy = e.target.value;
      state.sortDir = 1;
      renderAll();
    });

    // Delegated Clicks across Main Workspace & Banners
    document.body.addEventListener('click', async e => {
      // 1. Cycle Status
      const cycleBtn = e.target.closest('[data-cycle-status]');
      if (cycleBtn) {
        e.stopPropagation();
        const id = cycleBtn.dataset.cycleStatus;
        const base = state.bases.find(b => b.id === id);
        if (!base) return;
        const nextStatus = STATUS_CYCLE[(STATUS_CYCLE.indexOf(base.status) + 1) % STATUS_CYCLE.length];
        await updateBase(id, { status: nextStatus });
        showToast(`${base.name.toUpperCase()} STATUS → ${nextStatus.toUpperCase()}`);
        return;
      }

      // 2. Copy Arbitrary Text (XYZ, Nether, Xaero line)
      const copyEl = e.target.closest('[data-copy]');
      if (copyEl) {
        e.stopPropagation();
        const text = copyEl.dataset.copy;
        if (text) {
          await copyText(text, copyEl.dataset.copyLabel || 'COPIED TELEMETRY');
        }
        return;
      }

      // 3. Copy Xaero Waypoint for Base ID
      const xaeroBtn = e.target.closest('[data-copy-xaero]');
      if (xaeroBtn) {
        e.stopPropagation();
        const base = state.bases.find(b => b.id === xaeroBtn.dataset.copyXaero);
        if (!base) return;
        const wp = buildXaeroWaypointData(base, { indexPrefix: base.plate, includeTier: true });
        await copyText(wp.chatLine, `XAERO WAYPOINT COPIED (${base.name})`);
        return;
      }

      // 4. Toggle Base in Raid Route
      const routeBtn = e.target.closest('[data-toggle-route]');
      if (routeBtn) {
        e.stopPropagation();
        const id = routeBtn.dataset.toggleRoute;
        const idx = state.routeIds.indexOf(id);
        if (idx === -1) {
          state.routeIds.push(id);
          showToast('ADDED TO RAID ROUTE MANIFEST');
        } else {
          state.routeIds.splice(idx, 1);
          showToast('REMOVED FROM RAID ROUTE MANIFEST');
        }
        renderAll();
        return;
      }

      // 5. Open Dossier Modal
      const dossierTrigger = e.target.closest('[data-open-dossier]');
      if (dossierTrigger) {
        e.stopPropagation();
        openDossier(dossierTrigger.dataset.openDossier);
        return;
      }

      // 6. Catalog Untracked File from Banner
      const ingestFileBtn = e.target.closest('[data-ingest-file]');
      if (ingestFileBtn) {
        openIngestModal(ingestFileBtn.dataset.ingestFile);
        return;
      }
    });

    // Ledger Table Header Sorting & Row Hover / Selection
    document.querySelector('.ledger-table thead').addEventListener('click', e => {
      const th = e.target.closest('th[data-sort]');
      if (!th) return;
      const col = th.dataset.sort;
      if (state.sortBy === col) {
        state.sortDir *= -1;
      } else {
        state.sortBy = col;
        state.sortDir = 1;
      }
      renderAll();
    });

    document.getElementById('ledger-tbody').addEventListener('mouseover', e => {
      const tr = e.target.closest('tr[data-row-id]');
      if (tr && state.focusedBaseId !== tr.dataset.rowId) {
        state.focusedBaseId = tr.dataset.rowId;
        document.querySelectorAll('#ledger-tbody tr').forEach(r => r.classList.toggle('is-focused', r === tr));
        renderLedgerSidePreview();
      }
    });

    document.getElementById('ledger-tbody').addEventListener('change', e => {
      const cb = e.target.closest('input[data-select-id]');
      if (!cb) return;
      if (cb.checked) state.selectedIds.add(cb.dataset.selectId);
      else state.selectedIds.delete(cb.dataset.selectId);
      renderLedgerView(getFilteredBases());
    });

    document.getElementById('ledger-check-all').addEventListener('change', e => {
      const filtered = getFilteredBases();
      if (e.target.checked) {
        filtered.forEach(b => state.selectedIds.add(b.id));
      } else {
        state.selectedIds.clear();
      }
      renderLedgerView(filtered);
    });

    // Ledger Bulk Actions
    document.querySelectorAll('[data-bulk-status]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const status = btn.dataset.bulkStatus;
        const ids = [...state.selectedIds];
        await bulkUpdateBases(ids, { status });
        showToast(`UPDATED ${ids.length} TARGETS → ${status.toUpperCase()}`);
      });
    });

    document.getElementById('btn-bulk-route').addEventListener('click', () => {
      state.selectedIds.forEach(id => {
        if (!state.routeIds.includes(id)) state.routeIds.push(id);
      });
      renderAll();
      showToast(`QUEUED ${state.selectedIds.size} TARGETS INTO RAID ROUTE`);
    });

    document.getElementById('btn-bulk-xaero').addEventListener('click', () => {
      const lines = [...state.selectedIds]
        .map(id => state.bases.find(b => b.id === id))
        .filter(Boolean)
        .map(b => buildXaeroWaypointData(b, { indexPrefix: b.plate, includeTier: true }).chatLine);
      copyText(lines.join('\n'), `COPIED ${lines.length} XAERO WAYPOINTS`);
    });

    // Cartography / Radar Controls
    document.getElementById('radar-show-regions').addEventListener('change', e => {
      state.radar.showRegions = e.target.checked;
      drawRadarCanvas();
    });
    document.getElementById('radar-show-labels').addEventListener('change', e => {
      state.radar.showLabels = e.target.checked;
      drawRadarCanvas();
    });
    document.getElementById('radar-nether-scale').addEventListener('change', e => {
      state.radar.netherScale = e.target.checked;
      drawRadarCanvas();
    });
    document.getElementById('radar-reset-view').addEventListener('click', () => {
      state.radar.centerX = 0;
      state.radar.centerZ = 0;
      state.radar.zoom = 1;
      drawRadarCanvas();
    });

    // Route Sequencer Buttons
    document.getElementById('btn-route-autopopulate').addEventListener('click', () => {
      state.routeIds = state.bases
        .filter(b => b.status === 'priority' && b.dimension === 'overworld')
        .map(b => b.id);
      optimizeRouteNearestNeighbor();
    });
    document.getElementById('btn-route-optimize').addEventListener('click', optimizeRouteNearestNeighbor);
    document.getElementById('btn-route-clear').addEventListener('click', () => {
      state.routeIds = [];
      renderAll();
    });
    document.getElementById('btn-route-copy-xaero').addEventListener('click', () => {
      const stops = state.routeIds.map(id => state.bases.find(b => b.id === id)).filter(Boolean);
      if (stops.length === 0) {
        showToast('QUEUE TARGETS IN ROUTE FIRST');
        return;
      }
      const lines = stops.map((b, i) =>
        buildXaeroWaypointData(b, {
          indexPrefix: String(i + 1).padStart(2, '0'),
          includeTier: true
        }).chatLine
      );
      copyText(lines.join('\n'), `COPIED ${lines.length} ROUTE WAYPOINTS`);
    });
    document.getElementById('btn-route-copy-nether').addEventListener('click', () => {
      const stops = state.routeIds.map(id => state.bases.find(b => b.id === id)).filter(Boolean);
      if (stops.length === 0) {
        showToast('QUEUE TARGETS IN ROUTE FIRST');
        return;
      }
      const lines = stops.map((b, i) =>
        buildXaeroWaypointData(b, {
          indexPrefix: String(i + 1).padStart(2, '0'),
          coordMode: 'nether_roof',
          includeTier: false
        }).chatLine
      );
      copyText(lines.join('\n'), `COPIED ${lines.length} NETHER ROOF PORTAL WAYPOINTS`);
    });

    bindRadarCanvasEvents();

    // Xaero Studio Controls
    ['xaero-scope', 'xaero-coord-mode', 'xaero-set-name', 'xaero-prefix-plate', 'xaero-include-tier', 'xaero-disable-raided'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', renderXaeroView);
      document.getElementById(id)?.addEventListener('change', renderXaeroView);
    });

    document.getElementById('btn-copy-all-chat').addEventListener('click', () => {
      const rows = [...document.querySelectorAll('#xaero-chat-list .xaero-chat-string')].map(el => el.textContent);
      if (rows.length > 0) copyText(rows.join('\n'), `COPIED ${rows.length} XAERO CHAT STRINGS`);
    });

    document.getElementById('btn-copy-file-text').addEventListener('click', () => {
      const text = document.getElementById('xaero-file-output').textContent;
      copyText(text, 'COPIED mw$default_1.txt CONTENT');
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
      showToast('DOWNLOADED mw$default_1.txt');
    });

    document.getElementById('btn-xaero-import').addEventListener('click', handleXaeroImport);

    // Dossier Modal Events
    bindDossierEvents();

    // Ingest Modal & Global Drag-and-Drop
    bindIngestEvents();

    window.addEventListener('resize', () => {
      if (state.activeView === 'cartography') drawRadarCanvas();
    });
  }

  function bindRadarCanvasEvents() {
    const canvas = document.getElementById('radar-canvas');
    if (!canvas) return;

    const getScreenTransform = () => {
      const rect = canvas.getBoundingClientRect();
      const worldSpan = 22000 / state.radar.zoom;
      const pxPerBlock = Math.min(rect.width, rect.height) / worldSpan;
      return { rect, pxPerBlock };
    };

    canvas.addEventListener('mousemove', e => {
      const { rect, pxPerBlock } = getScreenTransform();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      if (state.radar.isDragging) {
        const dx = (mx - state.radar.dragStartX) / pxPerBlock;
        const dz = (my - state.radar.dragStartZ) / pxPerBlock;
        state.radar.centerX -= dx;
        state.radar.centerZ -= dz;
        state.radar.dragStartX = mx;
        state.radar.dragStartZ = my;
        drawRadarCanvas();
        return;
      }

      const wx = Math.round(state.radar.centerX + (mx - rect.width / 2) / pxPerBlock);
      const wz = Math.round(state.radar.centerZ + (my - rect.height / 2) / pxPerBlock);
      document.getElementById('radar-cursor-readout').textContent =
        `CURSOR: X ${wx} · Z ${wz} (NETHER: ${Math.floor(wx / 8)}, ${Math.floor(wz / 8)} · r.${Math.floor(wx / 512)}.${Math.floor(wz / 512)}.mca)`;

      // Hit test nodes
      let hit = null;
      for (const b of getFilteredBases()) {
        const sx = rect.width / 2 + (b.x - state.radar.centerX) * pxPerBlock;
        const sy = rect.height / 2 + (b.z - state.radar.centerZ) * pxPerBlock;
        if (Math.hypot(mx - sx, my - sy) < 11) {
          hit = b.id;
          break;
        }
      }
      if (state.radar.hoveredId !== hit) {
        state.radar.hoveredId = hit;
        canvas.style.cursor = hit ? 'pointer' : 'crosshair';
        drawRadarCanvas();
      }
    });

    canvas.addEventListener('mousedown', e => {
      const { rect } = getScreenTransform();
      state.radar.isDragging = true;
      state.radar.dragStartX = e.clientX - rect.left;
      state.radar.dragStartZ = e.clientY - rect.top;
    });

    window.addEventListener('mouseup', () => {
      state.radar.isDragging = false;
    });

    canvas.addEventListener('click', e => {
      if (!state.radar.hoveredId) return;
      const id = state.radar.hoveredId;
      if (e.shiftKey) {
        openDossier(id);
      } else {
        const idx = state.routeIds.indexOf(id);
        if (idx === -1) state.routeIds.push(id);
        else state.routeIds.splice(idx, 1);
        renderAll();
      }
    });

    canvas.addEventListener(
      'wheel',
      e => {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.18 : 1 / 1.18;
        state.radar.zoom = Math.max(0.6, Math.min(12, state.radar.zoom * factor));
        drawRadarCanvas();
      },
      { passive: false }
    );
  }

  function bindDossierEvents() {
    document.getElementById('dossier-close').addEventListener('click', closeDossier);
    document.getElementById('dossier-modal').addEventListener('click', e => {
      if (e.target.id === 'dossier-modal') closeDossier();
    });

    document.getElementById('dossier-zoom-presets').addEventListener('click', e => {
      const btn = e.target.closest('.seg-btn');
      if (btn) applyDossierOpticalPreset(btn.dataset.preset);
    });

    const viewport = document.getElementById('dossier-viewport');
    viewport.addEventListener(
      'wheel',
      e => {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
        state.dossierTransform.scale = Math.max(1, Math.min(5, state.dossierTransform.scale * factor));
        updateDossierImageTransform();
      },
      { passive: false }
    );

    viewport.addEventListener('mousedown', e => {
      state.dossierTransform.isDragging = true;
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
      state.dossierTransform.isDragging = false;
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

    window.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        if (!document.getElementById('dossier-modal').hidden) closeDossier();
        if (!document.getElementById('ingest-modal').hidden) closeIngestModal();
      }
      if (!document.getElementById('dossier-modal').hidden) {
        const tag = document.activeElement?.tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
          if (e.key === 'ArrowLeft') navigateDossier(-1);
          if (e.key === 'ArrowRight') navigateDossier(1);
        }
      }
    });

    document.getElementById('dossier-copy-xyz').addEventListener('click', () => {
      const b = state.bases.find(item => item.id === state.dossierBaseId);
      if (b) copyText(`${b.x} ${b.y} ${b.z}`, 'COPIED BLOCK XYZ');
    });

    document.getElementById('dossier-copy-nether').addEventListener('click', () => {
      const b = state.bases.find(item => item.id === state.dossierBaseId);
      if (!b) return;
      const nc = getNetherCoords(b);
      if (nc) copyText(`${nc.x} 128 ${nc.z}`, 'COPIED NETHER ROOF COORDS');
    });

    document.getElementById('dossier-copy-xaero').addEventListener('click', () => {
      const b = state.bases.find(item => item.id === state.dossierBaseId);
      if (!b) return;
      const wp = buildXaeroWaypointData(b, { indexPrefix: b.plate, includeTier: true });
      copyText(wp.chatLine, 'COPIED XAERO WAYPOINT');
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
        region: document.getElementById('edit-region').value.trim(),
        players: document.getElementById('edit-players').value,
        containers: document.getElementById('edit-containers').value.trim(),
        notes: document.getElementById('edit-notes').value.trim()
      };
      const updated = await updateBase(state.dossierBaseId, patch);
      if (updated) {
        updateDossierComputedTelemetry(updated);
        document.getElementById('dossier-title').textContent = updated.name;
        document.getElementById('dossier-save-msg').textContent = 'RECORD SAVED';
        showToast(`SAVED DOSSIER // ${updated.name.toUpperCase()}`);
      }
    });

    document.getElementById('btn-delete-base').addEventListener('click', async () => {
      if (!state.dossierBaseId) return;
      const b = state.bases.find(item => item.id === state.dossierBaseId);
      await deleteBase(state.dossierBaseId);
      closeDossier();
      showToast(`REMOVED RECORD // ${b ? b.name.toUpperCase() : ''}`);
    });
  }

  function bindIngestEvents() {
    document.getElementById('btn-open-ingest').addEventListener('click', () => openIngestModal());
    document.getElementById('ingest-close').addEventListener('click', closeIngestModal);
    document.getElementById('ingest-cancel').addEventListener('click', closeIngestModal);
    document.getElementById('ingest-modal').addEventListener('click', e => {
      if (e.target.id === 'ingest-modal') closeIngestModal();
    });

    const fileInput = document.getElementById('ingest-file-input');
    fileInput.addEventListener('change', e => {
      const f = e.target.files?.[0];
      if (f) handleFileDropOrSelect(f);
    });

    document.getElementById('btn-run-ocr').addEventListener('click', () => {
      const imgEl = document.getElementById('ingest-preview-img');
      if (imgEl && !imgEl.hidden) runOpticalF3Extraction(imgEl);
    });

    // Global Window Drag-and-Drop for Screenshots
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

    window.addEventListener('dragover', e => {
      e.preventDefault();
    });

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
      const payload = {
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
      };
      const created = await createBase(payload);
      if (created) {
        closeIngestModal();
        showToast(`CATALOGED PLATE ${created.plate} // ${created.name.toUpperCase()}`);
      }
    });
  }

  async function handleXaeroImport() {
    const raw = document.getElementById('xaero-import-textarea').value.trim();
    if (!raw) return;

    const lines = raw.split(/\r?\n/);
    let importedCount = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      // Matches either "xaero-waypoint:name:init:x:y:z:color:..." or "waypoint:name:init:x:y:z:color:..."
      const parts = trimmed.split(':');
      if (parts.length >= 6 && (parts[0] === 'waypoint' || parts[0] === 'xaero-waypoint')) {
        const name = parts[1] || 'Imported Target';
        const x = parseInt(parts[3], 10);
        const y = parseInt(parts[4], 10);
        const z = parseInt(parts[5], 10);
        const color = parseInt(parts[6] || '12', 10);
        if (!Number.isNaN(x) && !Number.isNaN(z)) {
          await createBase({
            name,
            x,
            y: Number.isNaN(y) ? 64 : y,
            z,
            xaeroColor: Number.isNaN(color) ? 12 : color,
            status: 'scouted',
            tier: 'medium',
            notes: 'Imported via Xaero telemetry string.'
          });
          importedCount++;
        }
      }
    }

    if (importedCount > 0) {
      document.getElementById('xaero-import-textarea').value = '';
      showToast(`IMPORTED ${importedCount} WAYPOINT(S) INTO LEDGER`);
    } else {
      showToast('NO VALID XAERO WAYPOINT LINES DETECTED');
    }
  }

  // ============================================================================
  // INIT
  // ============================================================================
  bindEvents();
  fetchBases();
})();
