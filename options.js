const DEFAULTS = {
  limitMinutes: 0.083, // 5 seconds for testing
  breakLimitMinutes: 10, // 10 minutes for break mode
  sites: ["facebook.com","instagram.com","twitter.com","x.com","tiktok.com","reddit.com","youtube.com"],
  redirectTo: "blocked.html"
};

async function load() {
  const data = await chrome.storage.sync.get(DEFAULTS);
  document.getElementById("limit").value = data.limitMinutes;
  document.getElementById("breakLimit").value = data.breakLimitMinutes;
  document.getElementById("sites").value = data.sites.join("\n");
  document.getElementById("redirect").value = data.redirectTo || "";
}

async function save() {
  const limit = Math.max(0.083, parseFloat(document.getElementById("limit").value || "0.083"));
  const breakLimit = Math.max(1, parseFloat(document.getElementById("breakLimit").value || "10"));
  const sites = document.getElementById("sites").value
    .split("\n")
    .map(s => s.trim().replace(/^https?:\/\//, "").replace(/^www\./, ""))
    .filter(Boolean);
  const redirectTo = document.getElementById("redirect").value || null;

  await chrome.storage.sync.set({ limitMinutes: limit, breakLimitMinutes: breakLimit, sites, redirectTo });
  const status = document.getElementById("status");
  status.textContent = "Saved";
  setTimeout(() => status.textContent = "", 1200);
}

document.getElementById("save").addEventListener("click", save);
load();
