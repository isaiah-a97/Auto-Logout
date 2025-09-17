const DEFAULTS = {
  limitMinutes: 0.083, // 5 seconds for testing
  breakLimitMinutes: 10, // 10 minutes for break mode
  sites: ["facebook.com","instagram.com","twitter.com","x.com","tiktok.com","reddit.com","youtube.com"],
  redirectTo: "blocked.html",
  warningSecondsBefore: 10,
  themeColor: "#3b82f6",
  darkMode: false
};

async function load() {
  const data = await chrome.storage.sync.get(DEFAULTS);
  document.getElementById("limit").value = data.limitMinutes;
  document.getElementById("breakLimit").value = data.breakLimitMinutes;
  document.getElementById("sites").value = data.sites.join("\n");
  document.getElementById("redirect").value = data.redirectTo || "";
  // range + label
  const warn = data.warningSecondsBefore || 10;
  const warnInput = document.getElementById("warningSecondsBefore");
  const warnLabel = document.getElementById("warningValue");
  warnInput.value = warn;
  warnLabel.textContent = String(warn);
  // set initial progress fill of range using CSS var --p (in %)
  warnInput.style.setProperty('--p', `${(warn - warnInput.min) / (warnInput.max - warnInput.min) * 100}%`);
  document.getElementById("themeColor").value = data.themeColor || "#3b82f6";
  document.getElementById("darkMode").checked = !!data.darkMode;
  document.getElementById("darkSwitch").classList.toggle('on', !!data.darkMode);
  // Live preview
  if (data.darkMode) document.documentElement.classList.add('dark');
  document.documentElement.style.setProperty('--primary', data.themeColor || '#3b82f6');
}

async function save() {
  const limit = Math.max(0.083, parseFloat(document.getElementById("limit").value || "0.083"));
  const breakLimit = Math.max(1, parseFloat(document.getElementById("breakLimit").value || "10"));
  const sites = document.getElementById("sites").value
    .split("\n")
    .map(s => s.trim().replace(/^https?:\/\//, "").replace(/^www\./, ""))
    .filter(Boolean);
  const redirectTo = document.getElementById("redirect").value || null;
  const warningSecondsBefore = Math.max(1, parseInt(document.getElementById("warningSecondsBefore").value || "10", 10));
  const themeColor = document.getElementById("themeColor").value || "#3b82f6";
  const darkMode = !!document.getElementById("darkMode").checked;

  await chrome.storage.sync.set({ limitMinutes: limit, breakLimitMinutes: breakLimit, sites, redirectTo, warningSecondsBefore, themeColor, darkMode });
  const status = document.getElementById("status");
  status.textContent = "Saved";
  setTimeout(() => status.textContent = "", 1200);
}

document.getElementById("save").addEventListener("click", save);
// Range label sync + live preview of theme and dark switch
document.getElementById("warningSecondsBefore").addEventListener('input', (e) => {
  document.getElementById("warningValue").textContent = String(e.target.value);
  const el = e.target;
  el.style.setProperty('--p', `${(el.value - el.min) / (el.max - el.min) * 100}%`);
});
document.getElementById("themeColor").addEventListener('input', (e) => {
  document.documentElement.style.setProperty('--primary', e.target.value || '#3b82f6');
});
document.getElementById("darkSwitch").addEventListener('click', () => {
  const checkbox = document.getElementById("darkMode");
  checkbox.checked = !checkbox.checked;
  document.getElementById("darkSwitch").classList.toggle('on', checkbox.checked);
  document.documentElement.classList.toggle('dark', checkbox.checked);
});
load();
