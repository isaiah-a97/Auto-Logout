function fmt(sec) {
  sec = Math.max(0, Math.floor(sec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

async function queryStatus() {
  try {
    return await chrome.runtime.sendMessage({ type: "getStatusForActiveTab" });
  } catch (error) {
    console.error("Error querying status:", error);
    return null;
  }
}

async function init() {
  const domainEl = document.getElementById("domain");
  const timerEl = document.getElementById("timer");
  const fillEl = document.getElementById("fill");
  const statusEl = document.getElementById("status");
  const breakModeToggle = document.getElementById("breakModeToggle");
  const timerEmojiEl = document.getElementById("timerEmoji");

  let last = await queryStatus();

  // Apply theme settings
  try {
    const { themeColor = '#3b82f6', darkMode = false } = await chrome.storage.sync.get({ themeColor: '#3b82f6', darkMode: false });
    document.documentElement.style.setProperty('--theme-color', themeColor);
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  } catch {}

  // Load break mode state
  async function loadBreakModeState() {
    try {
      const data = await chrome.storage.local.get(['breakMode']);
      breakModeToggle.checked = data.breakMode || false;
      updateModeInfo();
    } catch (error) {
      console.error("Error loading break mode state:", error);
    }
  }

  // Save break mode state and reset timer
  async function saveBreakModeState() {
    try {
      await chrome.storage.local.set({ breakMode: breakModeToggle.checked });
      updateModeInfo();
      
      // Reset the timer when switching modes
      await chrome.runtime.sendMessage({ type: "resetTimer" });
      
      // Immediately refresh the display with new data
      const newData = await queryStatus();
      render(newData);
    } catch (error) {
      console.error("Error saving break mode state:", error);
    }
  }

  // Update mode info display
  function updateModeInfo() {
    if (breakModeToggle.checked) {
      timerEmojiEl.textContent = "☕";
    } else {
      timerEmojiEl.textContent = "🖥️";
    }
  }

  // Handle break mode toggle
  breakModeToggle.addEventListener('change', saveBreakModeState);

  function render(data) {
    if (!data) {
      domainEl.textContent = "Error loading data";
      timerEl.textContent = "--:--";
      fillEl.style.width = "0%";
      statusEl.textContent = "Unable to connect to extension";
      return;
    }
  
    // helper: strip .com/.co.uk etc. and capitalise first letter
    function formatDomain(rawDomain) {
      if (!rawDomain) return "";
      const cleaned = rawDomain
        .replace(/^www\./i, "")                       // remove www.
        .replace(/\.(com|co\.uk|org|net|io|edu|gov)$/i, ""); // strip common endings
      return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    }
  
    // helper: show only first 10 characters, then …
    function truncate(text, max = 10) {
      return text.length > max ? text.slice(0, max) + "…" : text;
    }
  
    const displayDomain = data.domain ? truncate(formatDomain(data.domain)) : "";
  
    // For shared timer, show current domain or generic message
    if (data.isSharedTimer) {
      if (data.domain && data.isTracked) {
        domainEl.textContent = `${displayDomain} 🚫`;
      } else if (data.domain && !data.isTracked) {
        domainEl.textContent = `${displayDomain} (not tracked ✅)`;
      } else {
        domainEl.textContent = "No tracked site active";
      }
    } else {
      domainEl.textContent = data.domain
        ? displayDomain
        : "No website detected";
    }
  
    // Show timer for tracked sites or when on untracked site (for shared timer)
    if (data.isSharedTimer) {
      const remaining = Math.max(0, data.limitSec - data.elapsedSec);
      timerEl.textContent = fmt(remaining);
      const pct = Math.min(100, Math.max(0, (data.elapsedSec / data.limitSec) * 100));
      fillEl.style.width = `${pct}%`;
    } else {
      if (!data.isTracked) {
        timerEl.textContent = "--:--";
        fillEl.style.width = "0%";
        statusEl.textContent = data.domain
          ? "This domain is not in your tracked sites list."
          : "Open a website tab.";
        return;
      }
  
      const remaining = Math.max(0, data.limitSec - data.elapsedSec);
      timerEl.textContent = fmt(remaining);
      const pct = Math.min(100, Math.max(0, (data.elapsedSec / data.limitSec) * 100));
      fillEl.style.width = `${pct}%`;
    }
  
    // Status messages
    const activeNotes = [];
    if (!data.windowFocused) activeNotes.push("window not focused");
    if (!data.userActive) activeNotes.push("idle");
  
    if (data.isSharedTimer && !data.isTracked && data.domain) {
      statusEl.textContent = "";
    } else if (activeNotes.length) {
      statusEl.textContent = `Timer paused: ${activeNotes.join(", ")}`;
    } else {
      statusEl.textContent = "";
    }
  }
  

  // Load break mode state and render immediately
  await loadBreakModeState();
  render(last);

  // Live update every 500 ms
  const interval = setInterval(async () => {
    const data = await queryStatus();
    render(data);
  }, 500);

  // If popup closes, stop polling
  window.addEventListener("unload", () => clearInterval(interval));
}

init();
