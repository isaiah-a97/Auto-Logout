(() => {
  const FLOATER_ID = '__auto_logout_floater__';
  if (document.getElementById(FLOATER_ID)) return; // one per page

  const root = document.createElement('div');
  root.id = FLOATER_ID;
  root.style.cssText = [
    'position:fixed',
    'left:16px',
    'top:16px',
    'z-index:2147483647',
    'user-select:none',
    'cursor:grab',
    'transition:left .12s ease, top .12s ease',
    'visibility:hidden'
  ].join(';');

  // Shadow DOM for consistent styling across sites
  const shadow = root.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = [
    '*{box-sizing:border-box;margin:0;padding:0}',
    ':host{font:13px system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a}',
    '.card{background:#fff;border:1px solid rgba(0,0,0,.08);box-shadow:0 6px 24px rgba(0,0,0,.18),0 2px 8px rgba(0,0,0,.12);border-radius:10px;padding:10px 12px;width:180px}',
    '.row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px}',
    '.title{font-weight:700;font-size:12px;opacity:.85}',
    '.btn{appearance:none;-webkit-appearance:none;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:8px;padding:2px 6px;cursor:pointer;font:inherit;line-height:1}',
    '.timer{font-size:22px;font-weight:800;margin:2px 0 6px;letter-spacing:.3px}',
    '.bar{height:8px;background:#e5e7eb;border-radius:999px;overflow:hidden}',
    '.fill{height:100%;width:0%;background:#3b82f6;transition:width .25s linear}'
  ].join('\n');
  const card = document.createElement('div');
  card.className = 'card';
  const header = document.createElement('div');
  header.className = 'row';
  const title = document.createElement('div');
  title.className = 'title';
  title.textContent = 'Time left';
  const pauseBtn = document.createElement('button');
  pauseBtn.className = 'btn';
  pauseBtn.title = 'Pause/Play timer';
  pauseBtn.textContent = '⏸️';
  const modeBtn = document.createElement('button');
  modeBtn.className = 'btn';
  modeBtn.textContent = '☕';
  modeBtn.title = 'Toggle break mode';
  header.append(title, pauseBtn, modeBtn);

  const timer = document.createElement('div');
  timer.className = 'timer';
  timer.textContent = '--:--';

  const bar = document.createElement('div');
  bar.className = 'bar';
  const fill = document.createElement('div');
  fill.className = 'fill';
  bar.append(fill);

  card.append(header, timer, bar);
  shadow.append(style, card);
  (document.body || document.documentElement).appendChild(root);

  // Position persistence (shared across tabs)
  let pos = { left: 16, top: 16 };
  chrome.storage.local.get(['floaterPos']).then((v)=>{
    if (v && v.floaterPos && Number.isFinite(v.floaterPos.left) && Number.isFinite(v.floaterPos.top)) {
      pos = v.floaterPos;
      root.style.left = pos.left + 'px';
      root.style.top = pos.top + 'px';
    }
    // Show only after applying stored position to avoid visible jump
    root.style.visibility = 'visible';
  }).catch(()=>{});

  function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }

  // Dragging (top/left coordinates; down moves down intuitively)
  let dragging = false; let startX=0, startY=0; let startLeft=0, startTop=0; let raf = null; let lastSync=0;
  function onMove(e){
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const nextLeft = clamp(startLeft + dx, 8, Math.max(8, window.innerWidth - root.offsetWidth - 8));
    const nextTop  = clamp(startTop + dy, 8, Math.max(8, window.innerHeight - root.offsetHeight - 8));
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(()=>{
      pos.left = nextLeft; pos.top = nextTop;
      root.style.left = pos.left + 'px';
      root.style.top = pos.top + 'px';
    });
    // Throttled cross-tab sync while dragging
    const now = Date.now();
    if (now - lastSync > 150) {
      lastSync = now;
      chrome.storage.local.set({ floaterPos: { left: nextLeft, top: nextTop } }).catch(()=>{});
    }
  }
  root.addEventListener('mousedown', (e) => {
    dragging = true; root.style.cursor='grabbing';
    // Disable transition while dragging for direct response
    const prevTransition = root.style.transition;
    root.setAttribute('data-prev-transition', prevTransition);
    root.style.transition = 'none';
    startX = e.clientX; startY = e.clientY;
    // compute current
    const rect = root.getBoundingClientRect();
    startLeft = rect.left; startTop = rect.top;
    e.preventDefault();
  });
  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false; root.style.cursor='grab';
    // Restore transition after drag
    const prev = root.getAttribute('data-prev-transition') || 'left .12s ease, top .12s ease';
    root.style.transition = prev;
    chrome.storage.local.set({ floaterPos: pos }).catch(()=>{});
  });
  window.addEventListener('mousemove', (e) => { if(!dragging) return; onMove(e); });

  // Apply position updates from other tabs immediately
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.floaterPos && !dragging) {
      const v = changes.floaterPos.newValue;
      if (v && Number.isFinite(v.left) && Number.isFinite(v.top)) {
        pos = { left: v.left, top: v.top };
        root.style.left = pos.left + 'px';
        root.style.top = pos.top + 'px';
      }
    }
  });

  // Query + render
  function fmt(sec){sec=Math.max(0,Math.floor(sec));const m=Math.floor(sec/60),s=sec%60;return `${m}:${s.toString().padStart(2,'0')}`}
  async function get(){ try{ return await chrome.runtime.sendMessage({type:'getStatusForActiveTab'}) }catch{ return null } }
  async function renderOnce(){
    const data = await get();
    if (!data) return;
    const remaining = Math.max(0, data.limitSec - data.elapsedSec);
    timer.textContent = fmt(remaining);
    const pct = Math.min(100, Math.max(0, (data.elapsedSec / data.limitSec) * 100));
    fill.style.width = pct + '%';
  }
  const iv = setInterval(renderOnce, 500);
  window.addEventListener('unload', () => clearInterval(iv));
  // Pause/play button
  async function refreshPauseButton() {
    try {
      const v = await chrome.storage.local.get(['timerPaused']);
      pauseBtn.textContent = v.timerPaused ? '▶️' : '⏸️';
      pauseBtn.title = v.timerPaused ? 'Resume timer' : 'Pause timer';
    } catch {}
  }
  refreshPauseButton();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.timerPaused) {
      const val = !!changes.timerPaused.newValue;
      pauseBtn.textContent = val ? '▶️' : '⏸️';
      pauseBtn.title = val ? 'Resume timer' : 'Pause timer';
    }
  });
  pauseBtn.addEventListener('click', async () => {
    try {
      const res = await chrome.runtime.sendMessage({ type: 'togglePause' });
      if (res && typeof res.paused === 'boolean') {
        pauseBtn.textContent = res.paused ? '▶️' : '⏸️';
        pauseBtn.title = res.paused ? 'Resume timer' : 'Pause timer';
      }
    } catch {}
  });

  // Mode button -> toggle break mode and reset timer
  modeBtn.addEventListener('click', async () => {
    try {
      const cur = await chrome.storage.local.get(['breakMode']);
      const next = !cur.breakMode;
      await chrome.storage.local.set({ breakMode: next });
      await chrome.runtime.sendMessage({ type: 'resetTimer' });
      // reflect icon immediately
      modeBtn.textContent = next ? '☕' : '🖥️';
      renderOnce();
    } catch {}
  });

  // Reflect current mode on load and when storage changes
  async function refreshModeIcon() {
    try {
      const cur = await chrome.storage.local.get(['breakMode']);
      modeBtn.textContent = cur.breakMode ? '☕' : '🖥️';
    } catch {}
  }
  refreshModeIcon();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.breakMode) {
      modeBtn.textContent = changes.breakMode.newValue ? '☕' : '🖥️';
    }
  });
})();

