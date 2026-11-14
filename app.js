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

  const STATUS_CYCLE = ['priority', 'scouted', 'raided'];
  const STATUS_ORDER = { priority: 0, scouted: 1, raided: 2 };
  const STATUS_LABELS = {
    priority: 'Priority',
    scouted: 'Scouted',
    raided: 'Raided',
    compromised: 'Scouted'
  };

  const state = {
    apiBase: '',
    bases: [],
    activeView: 'grid', // 'grid' | 'table' | 'map'
    filterStatus: 'all',
    searchQuery: '',
    sortField: 'status', // 'status' | 'name' | 'distance'
    sortAsc: true,
    dossierBaseId: null,
    dossierTransform: { scale: 1, x: 0, y: 0, isDragging: false, startX: 0, startY: 0 },
    mapSelectedId: null,
    radar: {
      centerX: 0,
      centerZ: 0,
      zoom: 1,
      isDragging: false,
      dragStartX: 0,
      dragStartZ: 0,
      hoveredId: null
    },
    pendingUploadFilename: ''
  };

  // ============================================================================
  // HELPERS & XAERO FORMATTER
  // ============================================================================

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function normalizeStatus(s) {
    return s === 'compromised' ? 'scouted' : s || 'scouted';
  }

  function getNetherCoords(base) {
    if (base.dimension === 'the_end') return null;
    if (base.dimension === 'the_nether') return { x: base.x, y: base.y, z: base.z };
    return { x: Math.floor(base.x / 8), y: 128, z: Math.floor(base.z / 8) };
  }

  function buildXaeroWaypoint(base) {
    const cleanName = String(base.name || 'Base')
      .replace(/:/g, '-')
      .replace(/[\r\n]+/g, ' ')
      .trim();
    const initials = cleanName.slice(0, 2).toUpperCase() || 'B';
    const st = normalizeStatus(base.status);
    const color = st === 'priority' ? 12 : st === 'raided' ? 7 : 14;
    const disabled = st === 'raided' ? 'true' : 'false';

    let dimFolder = 'Internal-overworld-waypoints';
    if (base.dimension === 'the_nether') dimFolder = 'Internal-the_nether-waypoints';
    else if (base.dimension === 'the_end') dimFolder = 'Internal-the_end-waypoints';

    return {
      chatLine: `xaero-waypoint:${cleanName}:${initials}:${base.x}:${base.y}:${base.z}:${color}:${disabled}:0:${dimFolder}`,
      fileLine: `waypoint:${cleanName}:${initials}:${base.x}:${base.y}:${base.z}:${color}:${disabled}:0:gui.xaero_default:false:0:0:false`
    };
  }

  function getPlateSrc(filename) {
    if (!filename) return '';
    if (BUILTIN_IMAGES.has(filename)) {
      return `./plates/${encodeURIComponent(filename)}`;
    }
    return `${state.apiBase}/plates/${encodeURIComponent(filename)}`;
  }

  let toastTimer = null;
  function showToast(msg) {
    const bar = document.getElementById('toast-bar');
    if (!bar) return;
    bar.textContent = msg;
    bar.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      bar.hidden = true;
    }, 2200);
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

  async function copyText(text, label = 'Copied', triggerEl = null, inlineLabel = '✓ Copied') {
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
  // API & DATA SYNC
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
    } catch {
      const fallbackRes = await fetch(`./bases.json?t=${Date.now()}`);
      state.bases = (await fallbackRes.json()) || [];
    }
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
      renderAll();
      return data.base;
    } catch {
      showToast('Failed to save changes');
      return null;
    }
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
      renderAll();
      return data.base;
    } catch {
      showToast('Failed to add base');
      return null;
    }
  }

  async function deleteBase(id) {
    try {
      const res = await fetch(`${state.apiBase}/api/bases/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        const data = await res.json();
        state.bases = data.bases;
        renderAll();
      }
    } catch {
      showToast('Failed to delete base');
    }
  }

  // ============================================================================
  // FILTERING, SORTING & RENDERING
  // ============================================================================

  function getFilteredBases() {
    const q = state.searchQuery.trim().toLowerCase();
    const list = state.bases.filter(b => {
      const st = normalizeStatus(b.status);
      if (state.filterStatus !== 'all' && st !== state.filterStatus) return false;
      if (q) {
        const hay = `${b.name} ${b.x} ${b.y} ${b.z} ${b.containers || ''} ${b.notes || ''} ${(b.players || []).join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const dir = state.sortAsc ? 1 : -1;
    list.sort((a, b) => {
      if (state.sortField === 'name') {
        return a.name.localeCompare(b.name) * dir;
      }
      if (state.sortField === 'distance') {
        const da = Math.hypot(a.x, a.z);
        const db = Math.hypot(b.x, b.z);
        return (da - db) * dir;
      }
      // Default: sort by status (Priority -> Scouted -> Raided), then name
      const sa = STATUS_ORDER[normalizeStatus(a.status)] ?? 1;
      const sb = STATUS_ORDER[normalizeStatus(b.status)] ?? 1;
      if (sa !== sb) return (sa - sb) * dir;
      return a.name.localeCompare(b.name);
    });

    return list;
  }

  function renderCounts() {
    const total = state.bases.length;
    const priority = state.bases.filter(b => normalizeStatus(b.status) === 'priority').length;
    const scouted = state.bases.filter(b => normalizeStatus(b.status) === 'scouted').length;
    const raided = state.bases.filter(b => normalizeStatus(b.status) === 'raided').length;

    const summaryParts = [`${total} cataloged`, `${priority} priority`];
    if (raided > 0) summaryParts.push(`${raided} raided`);

    document.getElementById('header-summary').textContent = summaryParts.join(' · ');
    document.getElementById('count-all').textContent = total;
    document.getElementById('count-priority').textContent = priority;
    document.getElementById('count-scouted').textContent = scouted;
    document.getElementById('count-raided').textContent = raided;
  }

  function renderGrid(filtered) {
    const grid = document.getElementById('bases-grid');
    if (filtered.length === 0) {
      grid.innerHTML = `<div style="grid-column:1/-1;padding:64px 0;text-align:center;color:var(--text-muted);">No matching bases found.</div>`;
      return;
    }

    grid.innerHTML = filtered
      .map(base => {
        const st = normalizeStatus(base.status);
        const stLabel = STATUS_LABELS[st] || 'Scouted';
        const nc = getNetherCoords(base);
        const imgSrc = getPlateSrc(base.image);
        const focusOrigin = base.cropFocus || '50% 50%';
        const xyzCopy = `${base.x} ${base.y} ${base.z}`;
        const netherCopy = nc ? `${nc.x} 128 ${nc.z}` : '';
        const summary = base.containers || base.notes || 'No field notes recorded';

        return `
          <article class="base-card ${st === 'raided' ? 'is-raided' : ''}">
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
                  <h2 class="card-title" data-open-dossier="${escapeHtml(base.id)}">${escapeHtml(base.name)}</h2>
                  ${base.dimension === 'the_end' ? `<span class="dim-pill">END</span>` : ''}
                  ${base.dimension === 'the_nether' ? `<span class="dim-pill">NETHER</span>` : ''}
                </div>
                <button
                  type="button"
                  class="status-tag is-${st}"
                  data-cycle-status="${escapeHtml(base.id)}"
                  title="Click to cycle status (Priority → Scouted → Raided)"
                >
                  <span class="status-dot dot-${st}"></span>
                  <span>${stLabel}</span>
                </button>
              </div>

              <p class="card-desc" title="${escapeHtml(summary)}">${escapeHtml(summary)}</p>

              <div class="card-footer-row">
                <div class="coord-group">
                  <span class="coord-xyz" data-copy="${escapeHtml(xyzCopy)}" title="Click to copy Overworld XYZ">
                    ${base.x}, ${base.y}, ${base.z}
                  </span>
                  ${
                    nc
                      ? `<span class="coord-nether" data-copy="${escapeHtml(netherCopy)}" title="Click to copy Nether Roof coordinates (X÷8, Z÷8)">· N: ${nc.x}, ${nc.z}</span>`
                      : `<span class="coord-nether">· End</span>`
                  }
                </div>

                <button type="button" class="xaero-copy-btn" data-copy-xaero="${escapeHtml(base.id)}" title="Copy Xaero's Minimap waypoint string">
                  Copy Xaero
                </button>
              </div>
            </div>
          </article>
        `;
      })
      .join('');
  }

  function renderTable(filtered) {
    const tbody = document.getElementById('bases-tbody');
    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="padding:48px 18px;text-align:center;color:var(--text-muted);">No matching bases found.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered
      .map(base => {
        const st = normalizeStatus(base.status);
        const stLabel = STATUS_LABELS[st] || 'Scouted';
        const nc = getNetherCoords(base);
        const summary = base.containers || base.notes || '—';
        const xyzCopy = `${base.x} ${base.y} ${base.z}`;
        const netherCopy = nc ? `${nc.x} 128 ${nc.z}` : '';

        return `
          <tr class="${st === 'raided' ? 'is-raided' : ''}">
            <td>
              <button type="button" class="row-title-btn" data-open-dossier="${escapeHtml(base.id)}">
                <span class="status-dot dot-${st}"></span>
                <span>${escapeHtml(base.name)}</span>
                ${base.dimension === 'the_end' ? `<span class="dim-pill">END</span>` : ''}
                ${base.dimension === 'the_nether' ? `<span class="dim-pill">NETHER</span>` : ''}
              </button>
            </td>
            <td>
              <button
                type="button"
                class="status-tag is-${st}"
                data-cycle-status="${escapeHtml(base.id)}"
                title="Click to cycle status"
              >
                <span class="status-dot dot-${st}"></span>
                <span>${stLabel}</span>
              </button>
            </td>
            <td style="color:var(--text-secondary);max-width:340px;overflow:hidden;text-overflow:ellipsis;">
              ${escapeHtml(summary)}
            </td>
            <td class="num">
              <span class="coord-xyz" data-copy="${escapeHtml(xyzCopy)}" title="Click to copy Overworld XYZ">
                ${base.x}, ${base.y}, ${base.z}
              </span>
            </td>
            <td class="num">
              ${
                nc
                  ? `<span class="coord-nether" data-copy="${escapeHtml(netherCopy)}" title="Click to copy Nether Roof XYZ">${nc.x}, 128, ${nc.z}</span>`
                  : `<span style="color:var(--text-muted);">—</span>`
              }
            </td>
            <td class="num">
              <button type="button" class="xaero-copy-btn" data-copy-xaero="${escapeHtml(base.id)}">
                Copy Xaero
              </button>
            </td>
          </tr>
        `;
      })
      .join('');
  }

  // ============================================================================
  // 2D COORDINATE MAP
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

    // 26,800 block span ensures ±10,000 world border has generous padding
    const worldSpan = 26800 / state.radar.zoom;
    const pxPerBlock = Math.min(W, H) / worldSpan;

    const toScreenX = wx => W / 2 + (wx - state.radar.centerX) * pxPerBlock;
    const toScreenY = wz => H / 2 + (wz - state.radar.centerZ) * pxPerBlock;

    // 2000-block grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
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

    // 0,0 Origin Axes
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.09)';
    ctx.beginPath();
    ctx.moveTo(toScreenX(0), 0);
    ctx.lineTo(toScreenX(0), H);
    ctx.moveTo(0, toScreenY(0));
    ctx.lineTo(W, toScreenY(0));
    ctx.stroke();

    // ±10,000 World Border
    const wbL = toScreenX(-10000);
    const wbR = toScreenX(10000);
    const wbT = toScreenY(-10000);
    const wbB = toScreenY(10000);
    ctx.strokeStyle = 'rgba(232, 106, 71, 0.25)';
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(wbL, wbT, wbR - wbL, wbB - wbT);
    ctx.setLineDash([]);

    // Plot bases
    const visible = getFilteredBases();
    visible.forEach(base => {
      const sx = toScreenX(base.x);
      const sy = toScreenY(base.z);
      const st = normalizeStatus(base.status);
      const isSelected = state.mapSelectedId === base.id || state.radar.hoveredId === base.id;

      let color = '#d4a946';
      if (st === 'priority') color = '#e86a47';
      else if (st === 'raided') color = '#5e5c56';

      if (isSelected) {
        ctx.strokeStyle = '#f0ede6';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(sx - 7, sy - 7, 14, 14);
      }

      ctx.fillStyle = color;
      ctx.fillRect(sx - 3.5, sy - 3.5, 7, 7);

      const label = base.name;
      ctx.font = isSelected ? '600 12px "Inter", sans-serif' : '500 11.5px "Inter", sans-serif';
      const tw = ctx.measureText(label).width;
      const offset = LABEL_OFFSETS[base.id] || { dx: 9, dy: 4 };
      const placeLeft = sx + tw + 24 > W;
      const textX = placeLeft ? sx - tw - 9 : sx + offset.dx;

      ctx.fillStyle = isSelected ? '#ffffff' : 'rgba(240, 237, 230, 0.78)';
      ctx.fillText(label, textX, sy + offset.dy);
    });

    ctx.restore();
  }

  function renderMapSelectedCard() {
    const card = document.getElementById('map-selected-card');
    const base = state.bases.find(b => b.id === state.mapSelectedId);
    if (!base) {
      card.hidden = true;
      return;
    }
    card.hidden = false;
    const st = normalizeStatus(base.status);
    const stLabel = STATUS_LABELS[st] || 'Scouted';
    const nc = getNetherCoords(base);
    const imgSrc = getPlateSrc(base.image);
    const focusOrigin = base.cropFocus || '50% 50%';

    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
        <div style="display:flex;align-items:center;gap:8px;min-width:0;">
          <strong style="font-size:15.5px;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(base.name)}</strong>
          <span class="status-tag is-${st}" style="padding:2px 7px;font-size:11px;">
            <span class="status-dot dot-${st}"></span>${stLabel}
          </span>
        </div>
        <button type="button" class="btn-link" id="map-card-close">Close</button>
      </div>

      ${
        imgSrc
          ? `<div class="card-media" data-open-dossier="${escapeHtml(base.id)}" style="border:1px solid var(--border-subtle);">
               <img src="${imgSrc}" alt="${escapeHtml(base.name)}" style="transform-origin:${escapeHtml(focusOrigin)};object-position:${escapeHtml(focusOrigin)};" />
             </div>`
          : ''
      }

      <div class="nether-callout">
        <div style="color:var(--text-primary);font-weight:500;">XYZ: ${base.x}, ${base.y}, ${base.z}</div>
        ${nc ? `<div style="margin-top:3px;color:var(--text-secondary);">Nether Roof (÷8): ${nc.x}, 128, ${nc.z}</div>` : `<div style="margin-top:3px;">Dimension: The End</div>`}
      </div>

      <p style="font-size:13px;color:var(--text-secondary);line-height:1.45;">
        ${escapeHtml(base.containers || base.notes || 'No notes recorded.')}
      </p>

      <div style="display:flex;gap:8px;margin-top:auto;padding-top:12px;border-top:1px solid var(--border-subtle);">
        <button type="button" class="btn-primary" style="flex:1;" data-copy-xaero="${escapeHtml(base.id)}">Copy Xaero</button>
        <button type="button" class="btn-secondary" data-open-dossier="${escapeHtml(base.id)}">Inspect / Edit</button>
      </div>
    `;

    document.getElementById('map-card-close')?.addEventListener('click', () => {
      state.mapSelectedId = null;
      renderMapSelectedCard();
      drawMapCanvas();
    });
  }

  // ============================================================================
  // DETAIL / EDIT MODAL
  // ============================================================================

  function updateDossierNetherPreview() {
    const dim = document.getElementById('edit-dimension').value;
    const x = Number(document.getElementById('edit-x').value) || 0;
    const y = Number(document.getElementById('edit-y').value) || 0;
    const z = Number(document.getElementById('edit-z').value) || 0;
    const nc = getNetherCoords({ dimension: dim, x, y, z });
    document.getElementById('dossier-nether-readout').textContent = nc
      ? `Nether Roof Portal (÷8): ${nc.x}, 128, ${nc.z}`
      : 'Dimension: The End (No Nether Portal link)';
  }

  function openDossier(baseId) {
    const base = state.bases.find(b => b.id === baseId);
    if (!base) return;
    state.dossierBaseId = base.id;

    document.getElementById('dossier-title').textContent = base.name;
    document.getElementById('dossier-coords-sub').textContent = `${base.x}, ${base.y}, ${base.z}`;

    const imgEl = document.getElementById('dossier-img');
    imgEl.src = getPlateSrc(base.image);
    state.dossierTransform = { scale: 1, x: 0, y: 0, isDragging: false, startX: 0, startY: 0 };
    updateDossierImageTransform();

    document.getElementById('edit-name').value = base.name || '';
    document.getElementById('edit-status').value = normalizeStatus(base.status);
    document.getElementById('edit-dimension').value = base.dimension || 'overworld';
    document.getElementById('edit-x').value = base.x;
    document.getElementById('edit-y').value = base.y;
    document.getElementById('edit-z').value = base.z;
    document.getElementById('edit-containers').value = base.containers || '';
    document.getElementById('edit-notes').value = base.notes || '';

    updateDossierNetherPreview();
    document.getElementById('dossier-modal').hidden = false;
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
  // ADD BASE & F3 SCREENSHOT OCR
  // ============================================================================

  function openIngestModal() {
    document.getElementById('ingest-form').reset();
    state.pendingUploadFilename = '';
    document.getElementById('ingest-preview-img').hidden = true;
    document.getElementById('ingest-preview-empty').hidden = false;
    document.getElementById('ocr-status-text').textContent =
      'Optional — automatically reads player name and Block XYZ';
    document.getElementById('ingest-modal').hidden = false;
  }

  function closeIngestModal() {
    document.getElementById('ingest-modal').hidden = true;
  }

  async function handleFileDropOrSelect(file) {
    if (!file) return;
    openIngestModal();

    const baseName = file.name.replace(/\.[^.]+$/, '');
    document.getElementById('new-name').value = baseName;
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
    } catch {}
  }

  // ============================================================================
  // MASTER RENDER & EVENTS
  // ============================================================================

  function renderAll() {
    renderCounts();
    const filtered = getFilteredBases();
    if (state.activeView === 'grid') renderGrid(filtered);
    else if (state.activeView === 'table') renderTable(filtered);
    else if (state.activeView === 'map') {
      drawMapCanvas();
      renderMapSelectedCard();
    }
  }

  function bindEvents() {
    // Segmented View Switcher
    document.querySelectorAll('.seg-item').forEach(btn => {
      btn.addEventListener('click', () => {
        state.activeView = btn.dataset.view;
        document.querySelectorAll('.seg-item').forEach(b => b.classList.toggle('is-active', b === btn));
        document.getElementById('view-grid').hidden = state.activeView !== 'grid';
        document.getElementById('view-table').hidden = state.activeView !== 'table';
        document.getElementById('view-map').hidden = state.activeView !== 'map';
        renderAll();
      });
    });

    // Status Filter Pills
    document.getElementById('filter-status').addEventListener('click', e => {
      const btn = e.target.closest('.filter-pill');
      if (!btn) return;
      state.filterStatus = btn.dataset.status;
      document.querySelectorAll('.filter-pill').forEach(b => b.classList.toggle('is-active', b === btn));
      renderAll();
    });

    // Table Column Sorting
    document.querySelectorAll('.th-sortable').forEach(th => {
      th.addEventListener('click', () => {
        const field = th.dataset.sort;
        if (state.sortField === field) {
          state.sortAsc = !state.sortAsc;
        } else {
          state.sortField = field;
          state.sortAsc = true;
        }
        renderAll();
      });
    });

    // Search Input & "/" Keyboard Shortcut
    const searchInput = document.getElementById('search-input');
    const kbdHint = document.getElementById('search-kbd-hint');
    searchInput.addEventListener('input', e => {
      state.searchQuery = e.target.value;
      renderAll();
    });
    searchInput.addEventListener('focus', () => {
      if (kbdHint) kbdHint.hidden = true;
    });
    searchInput.addEventListener('blur', () => {
      if (kbdHint && !searchInput.value) kbdHint.hidden = false;
    });

    // Copy All Xaero & Download .txt
    const exportBtn = document.getElementById('btn-export-xaero');
    exportBtn.addEventListener('click', () => {
      const activeBases = state.bases.filter(b => normalizeStatus(b.status) !== 'raided');
      const lines = activeBases.map(b => buildXaeroWaypoint(b).chatLine);
      copyText(lines.join('\n'), `Copied ${lines.length} active Xaero waypoints`, exportBtn, `✓ Copied (${lines.length})`);
    });

    document.getElementById('btn-download-xaero').addEventListener('click', () => {
      const header = [
        '#',
        '#waypoint:name:initials:x:y:z:color:disabled:type:set:rotate_on_tp:tp_yaw:visibility_type:destination',
        '#'
      ];
      const lines = state.bases.map(b => buildXaeroWaypoint(b).fileLine);
      const blob = new Blob([[...header, ...lines].join('\n')], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'mw$default_1.txt';
      a.click();
      URL.revokeObjectURL(url);
      showToast('Downloaded mw$default_1.txt');
    });

    // Delegated Card & Table Actions
    document.body.addEventListener('click', async e => {
      const cycleBtn = e.target.closest('[data-cycle-status]');
      if (cycleBtn) {
        e.stopPropagation();
        const id = cycleBtn.dataset.cycleStatus;
        const base = state.bases.find(b => b.id === id);
        if (!base) return;
        const curr = normalizeStatus(base.status);
        const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(curr) + 1) % STATUS_CYCLE.length];
        await updateBase(id, { status: next });
        showToast(`${base.name} → ${STATUS_LABELS[next]}`);
        return;
      }

      const copyEl = e.target.closest('[data-copy]');
      if (copyEl && copyEl.dataset.copy) {
        e.stopPropagation();
        await copyText(copyEl.dataset.copy, `Copied ${copyEl.dataset.copy}`, copyEl, '✓ Copied');
        return;
      }

      const xaeroBtn = e.target.closest('[data-copy-xaero]');
      if (xaeroBtn) {
        e.stopPropagation();
        const base = state.bases.find(b => b.id === xaeroBtn.dataset.copyXaero);
        if (!base) return;
        await copyText(
          buildXaeroWaypoint(base).chatLine,
          `Copied Xaero waypoint for ${base.name}`,
          xaeroBtn,
          '✓ Copied'
        );
        return;
      }

      const dossierTrigger = e.target.closest('[data-open-dossier]');
      if (dossierTrigger) {
        e.stopPropagation();
        openDossier(dossierTrigger.dataset.openDossier);
      }
    });

    // Map Canvas Events
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
          state.radar.centerX -= (mx - state.radar.dragStartX) / pxPerBlock;
          state.radar.centerZ -= (my - state.radar.dragStartZ) / pxPerBlock;
          state.radar.dragStartX = mx;
          state.radar.dragStartZ = my;
          drawMapCanvas();
          return;
        }

        const wx = Math.round(state.radar.centerX + (mx - rect.width / 2) / pxPerBlock);
        const wz = Math.round(state.radar.centerZ + (my - rect.height / 2) / pxPerBlock);
        document.getElementById('radar-cursor-readout').textContent = `X: ${wx}, Z: ${wz}`;

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
        state.radar.dragStartX = e.clientX - rect.left;
        state.radar.dragStartZ = e.clientY - rect.top;
      });

      window.addEventListener('mouseup', () => {
        state.radar.isDragging = false;
      });

      canvas.addEventListener('click', () => {
        if (state.radar.hoveredId) {
          state.mapSelectedId = state.radar.hoveredId;
          renderMapSelectedCard();
          drawMapCanvas();
        }
      });

      canvas.addEventListener(
        'wheel',
        e => {
          e.preventDefault();
          const factor = e.deltaY < 0 ? 1.2 : 1 / 1.2;
          state.radar.zoom = Math.max(0.6, Math.min(10, state.radar.zoom * factor));
          drawMapCanvas();
        },
        { passive: false }
      );
    }

    document.getElementById('radar-reset-view')?.addEventListener('click', () => {
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

    ['edit-x', 'edit-y', 'edit-z', 'edit-dimension'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', updateDossierNetherPreview);
      document.getElementById(id)?.addEventListener('change', updateDossierNetherPreview);
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
    viewport.addEventListener('dblclick', () => {
      state.dossierTransform = { scale: 1, x: 0, y: 0, isDragging: false, startX: 0, startY: 0 };
      updateDossierImageTransform();
    });
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

    const dossierXyzBtn = document.getElementById('dossier-copy-xyz');
    dossierXyzBtn.addEventListener('click', () => {
      const b = state.bases.find(item => item.id === state.dossierBaseId);
      if (b) copyText(`${b.x} ${b.y} ${b.z}`, `Copied ${b.x} ${b.y} ${b.z}`, dossierXyzBtn, '✓ Copied XYZ');
    });

    const dossierXaeroBtn = document.getElementById('dossier-copy-xaero');
    dossierXaeroBtn.addEventListener('click', () => {
      const b = state.bases.find(item => item.id === state.dossierBaseId);
      if (b) {
        copyText(
          buildXaeroWaypoint(b).chatLine,
          `Copied Xaero waypoint for ${b.name}`,
          dossierXaeroBtn,
          '✓ Waypoint Copied'
        );
      }
    });

    document.getElementById('dossier-form').addEventListener('submit', async e => {
      e.preventDefault();
      if (!state.dossierBaseId) return;
      const patch = {
        name: document.getElementById('edit-name').value.trim(),
        status: document.getElementById('edit-status').value,
        dimension: document.getElementById('edit-dimension').value,
        x: Number(document.getElementById('edit-x').value),
        y: Number(document.getElementById('edit-y').value),
        z: Number(document.getElementById('edit-z').value),
        containers: document.getElementById('edit-containers').value.trim(),
        notes: document.getElementById('edit-notes').value.trim()
      };
      const updated = await updateBase(state.dossierBaseId, patch);
      if (updated) {
        closeDossier();
        showToast(`Saved ${updated.name}`);
      }
    });

    document.getElementById('btn-delete-base').addEventListener('click', async () => {
      if (!state.dossierBaseId) return;
      await deleteBase(state.dossierBaseId);
      closeDossier();
      showToast('Base deleted');
    });

    // Add Base Modal & Global Drag-and-Drop
    document.getElementById('btn-open-ingest').addEventListener('click', openIngestModal);
    document.getElementById('ingest-close').addEventListener('click', closeIngestModal);
    document.getElementById('ingest-cancel').addEventListener('click', closeIngestModal);
    document.getElementById('ingest-modal').addEventListener('click', e => {
      if (e.target.id === 'ingest-modal') closeIngestModal();
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
        containers: document.getElementById('new-containers').value.trim(),
        notes: document.getElementById('new-notes').value.trim(),
        image: state.pendingUploadFilename || ''
      });
      if (created) {
        closeIngestModal();
        showToast(`Added ${created.name}`);
      }
    });

    window.addEventListener('keydown', e => {
      const tag = document.activeElement?.tagName;
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      if (e.key === '/' && !inInput && document.getElementById('dossier-modal').hidden && document.getElementById('ingest-modal').hidden) {
        e.preventDefault();
        searchInput.focus();
        return;
      }

      if (e.key === 'Escape') {
        if (!document.getElementById('dossier-modal').hidden) closeDossier();
        if (!document.getElementById('ingest-modal').hidden) closeIngestModal();
        if (document.activeElement === searchInput) searchInput.blur();
      }

      if (!document.getElementById('dossier-modal').hidden && !inInput) {
        if (e.key === 'ArrowLeft') navigateDossier(-1);
        if (e.key === 'ArrowRight') navigateDossier(1);
      }
    });

    window.addEventListener('resize', () => {
      if (state.activeView === 'map') drawMapCanvas();
    });
  }

  bindEvents();
  fetchBases();
})();
