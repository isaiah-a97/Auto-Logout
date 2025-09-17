
// Storage schema:
// { limitMinutes: number, breakLimitMinutes: number, sites: string[], redirectTo: string | null }
const DEFAULTS = {
  limitMinutes: 0.083, // 5 seconds for testing
  breakLimitMinutes: 10, // 10 minutes for break mode
  sites: [
    "facebook.com",
    "instagram.com",
    "twitter.com",
    "x.com",
    "tiktok.com",
    "reddit.com",
    "youtube.com"
  ],
  redirectTo: "blocked.html", // set to null to disable redirect
  warningSecondsBefore: 10
};

let state = {
  activeTabId: null,
  activeDomain: null,
  windowFocused: true,
  userActive: true
};

// Icon state
let isTimerActive = false;
let timerPaused = false;

async function updateIcon() {
  try {
    const iconPath = isTimerActive ? "/icon-red.png" : "/icon-purple.png";
    console.log("Updating icon to:", iconPath, "isTimerActive:", isTimerActive);
    await chrome.action.setIcon({
      path: {
        16: iconPath,
        48: iconPath,
        128: iconPath
      }
    });
    console.log("Icon updated successfully");
  } catch (error) {
    console.error("Error updating icon:", error);
  }
}

// Shared timer state
let sharedTimerState = {
  secondsUsed: 0,
  lastResetDate: null
};

async function getSettings() {
  const data = await chrome.storage.sync.get(DEFAULTS);
  return { ...DEFAULTS, ...data };
}

async function isBreakModeActive() {
  try {
    const data = await chrome.storage.local.get(['breakMode']);
    return data.breakMode || false;
  } catch (error) {
    console.error("Error checking break mode:", error);
    return false;
  }
}

async function getCurrentTimeLimit() {
  const settings = await getSettings();
  const isBreakMode = await isBreakModeActive();
  
  // Return break mode limit if break mode is active, otherwise work mode limit
  return isBreakMode ? settings.breakLimitMinutes : settings.limitMinutes;
}

async function playWarningSound() {
  try {
    await ensureOffscreen();
    await chrome.runtime.sendMessage({ play: { source: 'beep.mp3', volume: 1 } });
  } catch (error) {
    console.error("Error requesting warning sound:", error);
  }
}

async function loadSharedTimerState() {
  try {
    const data = await chrome.storage.local.get(['sharedTimerState']);
    if (data.sharedTimerState) {
      sharedTimerState = { ...sharedTimerState, ...data.sharedTimerState };
    }
  } catch (error) {
    console.error("Error loading shared timer state:", error);
  }
}

async function saveSharedTimerState() {
  try {
    await chrome.storage.local.set({ sharedTimerState });
  } catch (error) {
    console.error("Error saving shared timer state:", error);
  }
}

async function resetTimer() {
  try {
    sharedTimerState.secondsUsed = 0;
    await saveSharedTimerState();
    console.log("Timer reset due to mode change");
  } catch (error) {
    console.error("Error resetting timer:", error);
  }
}

function getTodayDateString() {
  return new Date().toDateString();
}

async function checkAndResetDaily() {
  const today = getTodayDateString();
  if (sharedTimerState.lastResetDate !== today) {
    sharedTimerState.secondsUsed = 0;
    sharedTimerState.lastResetDate = today;
    await saveSharedTimerState();
    console.log("Daily timer reset for", today);
  }
}

function domainFromUrl(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function isTrackedDomain(hostname, sites) {
  if (!hostname) return false;
  return sites.some(site => hostname === site || hostname.endsWith(`.${site}`));
}

async function clearCookiesForDomain(domain) {
  try {
    const candidates = await chrome.cookies.getAll({ domain });
    await Promise.all(candidates.map(c => {
      const protocol = c.secure ? "https:" : "http:";
      const host = c.domain.startsWith(".") ? c.domain.slice(1) : c.domain;
      const url = `${protocol}//${host}${c.path}`;
      return chrome.cookies.remove({ url, name: c.name, storeId: c.storeId });
    }));
    console.log(`Cleared cookies for domain: ${domain}`);
  } catch (error) {
    console.error(`Error clearing cookies for domain ${domain}:`, error);
  }
}

async function enforceIfNeeded(settings) {
  const limitSec = await getCurrentTimeLimit() * 60;
  const warnBefore = Math.max(1, settings.warningSecondsBefore || 10);
  const warningTime = Math.max(1, limitSec - warnBefore);

  if (sharedTimerState.secondsUsed === warningTime && warningTime > 0) {
    playWarningSound();
  }
  
  if (sharedTimerState.secondsUsed >= limitSec) {
    console.log("Time limit reached! Clearing cookies for all tracked domains...");
    
    // Clear cookies for all tracked domains
    for (const site of settings.sites) {
      await clearCookiesForDomain(site);
      // Also try clearing for www subdomain
      await clearCookiesForDomain(`www.${site}`);
    }
    
    // Post-limit action: either close all tracked tabs or redirect them
    try {
      const tabs = await chrome.tabs.query({});
      const trackedTabIds = [];
      let activeTrackedInCurrentWindow = false;
      for (const tab of tabs) {
        if (tab.url) {
          const domain = domainFromUrl(tab.url);
          if (isTrackedDomain(domain, settings.sites)) {
            trackedTabIds.push(tab.id);
            if (tab.active) activeTrackedInCurrentWindow = true;
          }
        }
      }

      if (settings.redirectTo === 'close') {
        // Close all tracked tabs (including the current one if it's tracked)
        for (const tabId of trackedTabIds) {
          try { await chrome.tabs.remove(tabId); } catch (error) {
            console.error(`Error closing tab ${tabId}:`, error);
          }
        }
        // Sweep any auto-opened empty/new tabs shortly after
        setTimeout(() => {
          try { closeEmptyTabsAndCurrentTab(null); } catch {}
        }, 100);
      } else if (settings.redirectTo) {
        // Redirect all tracked tabs to the configured blocked page
        for (const tabId of trackedTabIds) {
          try {
            await chrome.tabs.update(tabId, { url: chrome.runtime.getURL(settings.redirectTo) });
          } catch (error) {
            console.error(`Error redirecting tab ${tabId}:`, error);
          }
        }
      }
    } catch (error) {
      console.error('Error handling post-limit tab action:', error);
    }
    
    // Reset the shared timer
    sharedTimerState.secondsUsed = 0;
    await saveSharedTimerState();
  }
}

async function tick() {
  try {
    await checkAndResetDaily();
    const settings = await getSettings();

    // Timer should be active if ANY tracked-site tab exists, regardless of focus/active tab
    let shouldBeActive = false;
    try {
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        if (tab.url) {
          const domain = domainFromUrl(tab.url);
          if (isTrackedDomain(domain, settings.sites)) {
            shouldBeActive = true;
            break;
          }
        }
      }
    } catch {
      shouldBeActive = false;
    }

    // Update icon only if state changed
    if (shouldBeActive !== isTimerActive) {
      console.log("Timer state changing from", isTimerActive, "to", shouldBeActive);
      isTimerActive = shouldBeActive;
      await updateIcon();
    }

    // Increment timer and enforce when active and not paused
    if (shouldBeActive && !timerPaused) {
      sharedTimerState.secondsUsed += 1;
      await saveSharedTimerState();
      await enforceIfNeeded(settings);
    }
  } catch (error) {
    console.error("Error in tick function:", error);
  }
}

chrome.tabs.onActivated.addListener(({ tabId }) => {
  state.activeTabId = tabId;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (tabId === state.activeTabId && changeInfo.url) {
    state.activeDomain = domainFromUrl(changeInfo.url);
  }
});

chrome.windows.onFocusChanged.addListener(windowId => {
  state.windowFocused = windowId !== chrome.windows.WINDOW_ID_NONE;
});

async function updateIdleState() {
  chrome.idle.queryState(60, stateStr => {
    state.userActive = stateStr === "active";
  });
}
setInterval(updateIdleState, 15000);
updateIdleState();

setInterval(tick, 1000);

// Message handler for popup communication
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "getStatusForActiveTab") {
    handleStatusRequest(sendResponse);
    return true; // Keep message channel open for async response
  } else if (request.type === "closeBlockedTabs") {
    handleCloseBlockedTabs(sendResponse);
    return true; // Keep message channel open for async response
  } else if (request.type === "resetTimer") {
    resetTimer();
    sendResponse({ success: true });
    return true;
  } else if (request.type === 'togglePause') {
    (async () => {
      try {
        const cur = await chrome.storage.local.get(['timerPaused']);
        const next = !cur.timerPaused;
        await chrome.storage.local.set({ timerPaused: next });
        sendResponse({ success: true, paused: next });
      } catch (e) {
        console.error('Error toggling pause:', e);
        sendResponse({ success: false });
      }
    })();
    return true;
  }
});

async function ensureOffscreen() {
  try {
    let hasDoc = false;
    try {
      if (chrome.offscreen && chrome.offscreen.hasDocument) {
        hasDoc = await chrome.offscreen.hasDocument();
      }
    } catch (e) {
      console.warn('[audio] hasDocument check failed, will try to create anyway:', e);
    }

    if (hasDoc) {
      // Already exists
      return;
    }

    console.log('[audio] creating offscreen document');
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['AUDIO_PLAYBACK'],
      justification: 'Play short warning beep before time limit.'
    });
    console.log('[audio] offscreen document created');
  } catch (e) {
    console.error('[audio] create offscreen failed:', e);
    throw e;
  }
}

async function handleStatusRequest(sendResponse) {
  try {
    await checkAndResetDaily();
    const settings = await getSettings();
    const currentLimitSec = await getCurrentTimeLimit() * 60;
    
    if (state.activeTabId == null) {
      sendResponse({
        domain: null,
        isTracked: false,
        elapsedSec: sharedTimerState.secondsUsed,
        limitSec: currentLimitSec,
        windowFocused: state.windowFocused,
        userActive: state.userActive,
        isSharedTimer: true
      });
      return;
    }

    let tab;
    try {
      tab = await chrome.tabs.get(state.activeTabId);
    } catch {
      sendResponse({
        domain: null,
        isTracked: false,
        elapsedSec: sharedTimerState.secondsUsed,
        limitSec: currentLimitSec,
        windowFocused: state.windowFocused,
        userActive: state.userActive,
        isSharedTimer: true
      });
      return;
    }

    const domain = domainFromUrl(tab.url);
    const isTracked = isTrackedDomain(domain, settings.sites);

    sendResponse({
      domain,
      isTracked,
      elapsedSec: sharedTimerState.secondsUsed,
      limitSec: currentLimitSec,
      windowFocused: state.windowFocused,
      userActive: state.userActive,
      isSharedTimer: true
    });
  } catch (error) {
    console.error("Error handling status request:", error);
    sendResponse({
      domain: null,
      isTracked: false,
      elapsedSec: 0,
      limitSec: 300,
      windowFocused: false,
      userActive: false,
      isSharedTimer: true
    });
  }
}

async function handleCloseBlockedTabs(sendResponse) {
  try {
    // Get all tabs
    const tabs = await chrome.tabs.query({});
    
    // Find tabs that are showing the blocked page
    const blockedPageTabs = [];
    let currentTabId = null;
    
    for (const tab of tabs) {
      if (tab.url && tab.url.includes('blocked.html')) {
        blockedPageTabs.push(tab.id);
        // Check if this is the current active tab
        if (tab.active) {
          currentTabId = tab.id;
        }
      }
    }
    
    console.log(`Found ${blockedPageTabs.length} blocked page tabs to close:`, blockedPageTabs);
    console.log(`Current active tab ID: ${currentTabId}`);
    
    // Close all blocked page tabs except the current one
    let closedCount = 0;
    for (const tabId of blockedPageTabs) {
      // Skip the current tab - we'll handle it separately
      if (tabId === currentTabId) {
        continue;
      }
      
      try {
        await chrome.tabs.remove(tabId);
        closedCount++;
        console.log(`Successfully closed tab ${tabId}`);
      } catch (error) {
        console.error(`Failed to close tab ${tabId}:`, error);
      }
    }
    
    // Schedule cleanup of empty/new tabs and current tab after 0.1 seconds
    setTimeout(async () => {
      try {
        await closeEmptyTabsAndCurrentTab(currentTabId);
      } catch (error) {
        console.error('Error in delayed tab cleanup:', error);
      }
    }, 100);
    
    // If no other tabs were closed, open a new tab immediately to ensure user has somewhere to go
    if (closedCount === 0) {
      try {
        await chrome.tabs.create({ url: 'chrome://newtab/' });
        console.log('Opened new tab as fallback');
      } catch (error) {
        console.error('Failed to open new tab:', error);
      }
    }
    
    sendResponse({ success: true, closedTabs: closedCount });
  } catch (error) {
    console.error('Error in handleCloseBlockedTabs:', error);
    sendResponse({ success: false, error: error.message });
  }
}

async function closeEmptyTabsAndCurrentTab(currentTabId) {
  try {
    // Get all tabs
    const tabs = await chrome.tabs.query({});
    
    // Find empty/new tabs (tabs with no URL or new tab URLs)
    const emptyTabs = [];
    
    for (const tab of tabs) {
      // Check for empty URLs or new tab URLs
      if (!tab.url || 
          tab.url === 'chrome://newtab/' || 
          tab.url === 'chrome://new-tab-page/' ||
          tab.url === 'about:blank' ||
          tab.url === 'chrome-search://local-ntp/local-ntp.html' ||
          tab.url.startsWith('chrome://newtab/')) {
        emptyTabs.push(tab.id);
      }
    }
    
    // Add the current tab to the list of tabs to close
    if (currentTabId !== null) {
      emptyTabs.push(currentTabId);
      console.log(`Adding current tab ${currentTabId} to cleanup list`);
    }
    
    console.log(`Found ${emptyTabs.length} tabs to close (empty + current):`, emptyTabs);
    
    // Close all empty tabs and the current tab
    let closedCount = 0;
    for (const tabId of emptyTabs) {
      try {
        await chrome.tabs.remove(tabId);
        closedCount++;
        console.log(`Successfully closed tab ${tabId}`);
      } catch (error) {
        console.error(`Failed to close tab ${tabId}:`, error);
      }
    }
    
    console.log(`Closed ${closedCount} tabs (empty + current)`);
    
    // Do not open a replacement tab; emulate Back to Work behavior precisely
    
  } catch (error) {
    console.error('Error in closeEmptyTabsAndCurrentTab:', error);
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.sync.get(null);
  if (!("limitMinutes" in existing)) {
    await chrome.storage.sync.set(DEFAULTS);
  }
  
  // Initialize shared timer state
  await loadSharedTimerState();
  await checkAndResetDaily();
  
  // Set up daily reset alarm
  chrome.alarms.create('dailyReset', {
    when: getNextMidnight(),
    periodInMinutes: 24 * 60 // 24 hours
  });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'dailyReset') {
    checkAndResetDaily();
  }
});

function getNextMidnight() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0); // Next midnight
  return midnight.getTime();
}

// Initialize on startup
(async () => {
  await loadSharedTimerState();
  await checkAndResetDaily();
  await updateIcon(); // Initialize with white icon
})();

// Initialize paused state and keep it in sync
(async () => {
  try {
    const v = await chrome.storage.local.get(['timerPaused']);
    timerPaused = !!v.timerPaused;
  } catch {}
})();

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.timerPaused) {
    timerPaused = !!changes.timerPaused.newValue;
  }
});
