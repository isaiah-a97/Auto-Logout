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

    // For shared timer, show current domain or generic message
    if (data.isSharedTimer) {
      if (data.domain && data.isTracked) {
        domainEl.textContent = data.domain;
      } else if (data.domain && !data.isTracked) {
        domainEl.textContent = `${data.domain} (not tracked)`;
      } else {
        domainEl.textContent = "No tracked site active";
      }
    } else {
      domainEl.textContent = data.domain
        ? data.domain
        : "No website detected";
    }

    // Show timer for tracked sites or when on untracked site (for shared timer)
    if (data.isSharedTimer) {
      if (data.isTracked) {
        const remaining = Math.max(0, data.limitSec - data.elapsedSec);
        timerEl.textContent = fmt(remaining);
        const pct = Math.min(100, Math.max(0, (data.elapsedSec / data.limitSec) * 100));
        fillEl.style.width = `${pct}%`;
      } else {
        // Show shared timer even when on untracked site
        const remaining = Math.max(0, data.limitSec - data.elapsedSec);
        timerEl.textContent = fmt(remaining);
        const pct = Math.min(100, Math.max(0, (data.elapsedSec / data.limitSec) * 100));
        fillEl.style.width = `${pct}%`;
      }
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
      statusEl.textContent = "Open a tracked site to continue the timer";
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
