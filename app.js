/* ============================================================
   Job Radar — app.js
   Vanilla JS. No build step. Everything runs client-side.
   Résumé data is parsed in-browser and stored in localStorage
   only — nothing is ever sent to a server.
   ============================================================ */

const CONFIG = {
  ownerName: "Akash Jaiswal",
  ownerTitle: "Java Backend Developer",
  storageKey: "jobradar.resumes.v2",
  activeKey: "jobradar.active.v2",
  companiesKey: "jobradar.companies.v1",
  jobsCacheKey: "jobradar.jobscache.v1",
  maxJobsPerSource: 100,
  staleAfterDays: 45,        // treat postings older than this as no longer "active"
  strongMatchThreshold: 55,  // % score considered a "strong match"
  pageSize: 12
};

document.getElementById("footerName").textContent =
  `${CONFIG.ownerName} · ${CONFIG.ownerTitle}`;

if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

/* ---------- Skill dictionary (used for résumé keyword extraction) ---------- */
const SKILL_DICTIONARY = [
  // languages
  "java","python","javascript","typescript","c++","c#","go","golang","rust","kotlin","swift","php","ruby","scala","r ","sql","html","css","bash","shell",
  // java / backend
  "spring","spring boot","hibernate","jpa","microservices","rest api","restful","graphql","grpc","kafka","rabbitmq","junit","mockito","maven","gradle","soap",
  // frontend
  "react","angular","vue","redux","next.js","node.js","node","express","tailwind","webpack","jquery",
  // data
  "mysql","postgres","postgresql","mongodb","redis","oracle","cassandra","elasticsearch","dynamodb","snowflake","etl","data warehouse","pandas","numpy",
  // cloud/devops
  "aws","azure","gcp","docker","kubernetes","terraform","jenkins","ci/cd","github actions","ansible","linux","nginx","cloudformation",
  // ml/ai
  "machine learning","deep learning","tensorflow","pytorch","nlp","llm","generative ai","scikit-learn",
  // practice / role
  "agile","scrum","kanban","tdd","system design","design patterns","object oriented","oop","unit testing","api design","backend","frontend","full stack","fullstack",
  "software engineer","software developer","backend developer","frontend developer","data engineer","data scientist","devops","sre","qa","test automation",
  "product management","project management","ui/ux","figma"
];

/* ---------- Utilities ---------- */
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

function escapeHtml(str = "") {
  return str.replace(/[&<>"']/g, m => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[m]));
}
function stripHtml(html = "") {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent || div.innerText || "";
}
function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
function relativeTime(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return "";
  const diffMs = Date.now() - d.getTime();
  const days = Math.floor(diffMs / 86400000);
  if (days <= 0) {
    const hrs = Math.floor(diffMs / 3600000);
    if (hrs <= 0) return "just now";
    return `${hrs}h ago`;
  }
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return `${months} mo ago`;
}
function daysAgo(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return 9999;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}
function fileSizeLabel(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}
function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  return haystack.split(needle).length - 1;
}

/* ---------- State ---------- */
let resumes = [];        // {id, filename, type, size, uploadedAt, text, keywords}
let activeResumeId = null;
let allJobs = [];         // normalized + scored
let visibleCount = CONFIG.pageSize;
let lastScanAt = null;
let isScanning = false;
let companies = [];       // {id, name, slug, platform}

// A small starter set so the radar isn't empty on first load — fintech +
// insurtech across India, US, and Europe, chosen for 3–6 yr Java +
// Spring Boot backend profiles specifically. All nine are confirmed
// Greenhouse/Lever boards with real, current backend postings — mostly
// underrated/less-competitive than the big unicorn names, on purpose.
// Swap for your own targets any time via the Companies form below.
const DEFAULT_COMPANIES = [
  { name: "Razorpay", slug: "razorpaysoftwareprivatelimited", platform: "greenhouse" },
  { name: "PayPay India", slug: "pay2dc", platform: "greenhouse" },
  { name: "Next Insurance", slug: "nextinsurance66", platform: "greenhouse" },
  { name: "Ethos Life", slug: "ethoslife", platform: "greenhouse" },
  { name: "Modulr", slug: "modulrfinance", platform: "greenhouse" },
  { name: "Bitpanda", slug: "bitpanda", platform: "greenhouse" },
  { name: "N26", slug: "n26", platform: "greenhouse" },
  { name: "Adyen", slug: "adyen", platform: "greenhouse" },
  { name: "Tala", slug: "tala", platform: "lever" },
  { name: "Stable Money", slug: "stable-money1", platform: "lever" }
];

/* ---------- Persistence ---------- */
function loadState() {
  try {
    resumes = JSON.parse(localStorage.getItem(CONFIG.storageKey) || "[]");
  } catch { resumes = []; }
  activeResumeId = localStorage.getItem(CONFIG.activeKey) || null;
  if (!resumes.find(r => r.id === activeResumeId)) {
    activeResumeId = resumes[0]?.id || null;
  }
}
function saveResumes() {
  localStorage.setItem(CONFIG.storageKey, JSON.stringify(resumes));
}
function saveActive() {
  if (activeResumeId) localStorage.setItem(CONFIG.activeKey, activeResumeId);
  else localStorage.removeItem(CONFIG.activeKey);
}
function loadCompanies() {
  try {
    const raw = localStorage.getItem(CONFIG.companiesKey);
    companies = raw ? JSON.parse(raw) : DEFAULT_COMPANIES.map(c => ({ id: uid(), ...c }));
  } catch { companies = DEFAULT_COMPANIES.map(c => ({ id: uid(), ...c })); }
  saveCompanies();
}
function saveCompanies() {
  localStorage.setItem(CONFIG.companiesKey, JSON.stringify(companies));
}
function saveJobsCache() {
  try {
    localStorage.setItem(CONFIG.jobsCacheKey, JSON.stringify({
      updatedAt: lastScanAt ? lastScanAt.toISOString() : null,
      resumeId: activeResumeId,
      jobs: allJobs
    }));
  } catch { /* storage full or unavailable — cache is best-effort */ }
}
function loadJobsCache() {
  try {
    const raw = localStorage.getItem(CONFIG.jobsCacheKey);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
// Re-scores cached jobs against whichever résumé is active right now —
// no network call, so switching active résumé feels instant.
function recomputeMatches() {
  const active = resumes.find(r => r.id === activeResumeId);
  const keywords = active ? active.keywords : [];
  allJobs = allJobs.map(j => ({ ...j, match: scoreJob(j, keywords) }));
  saveJobsCache();
}

/* ============================================================
   RÉSUMÉ PARSING
   ============================================================ */
async function parsePdf(arrayBuffer) {
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(it => it.str).join(" ") + "\n";
  }
  return text.trim();
}
async function parseDocx(arrayBuffer) {
  const result = await mammoth.extractRawText({ arrayBuffer });
  return (result.value || "").trim();
}
function parseTxt(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").trim());
    reader.onerror = reject;
    reader.readAsText(file);
  });
}
function readAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

function extractKeywords(text) {
  const lower = " " + text.toLowerCase() + " ";
  const found = SKILL_DICTIONARY
    .map(skill => ({ skill: skill.trim(), count: countOccurrences(lower, skill.trim()) }))
    .filter(x => x.count > 0)
    .sort((a, b) => b.count - a.count)
    .map(x => x.skill);
  return Array.from(new Set(found)).slice(0, 25);
}

/* ---------- Upload flow ---------- */
const dropzone = $("#dropzone");
const fileInput = $("#fileInput");
const progressWrap = $("#uploadProgressWrap");
const progressBar = $("#uploadProgressBar");
const progressStage = $("#uploadStage");
const progressFileName = $("#uploadFileName");

dropzone.addEventListener("click", () => fileInput.click());
dropzone.addEventListener("keydown", e => {
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); }
});
["dragover", "dragenter"].forEach(evt =>
  dropzone.addEventListener(evt, e => { e.preventDefault(); dropzone.classList.add("dragover"); })
);
["dragleave", "drop"].forEach(evt =>
  dropzone.addEventListener(evt, e => { e.preventDefault(); dropzone.classList.remove("dragover"); })
);
dropzone.addEventListener("drop", e => {
  const files = Array.from(e.dataTransfer.files || []);
  handleFiles(files);
});
fileInput.addEventListener("change", e => {
  handleFiles(Array.from(e.target.files || []));
  fileInput.value = "";
});

async function handleFiles(files) {
  for (const file of files) {
    await uploadOneFile(file);
  }
}

function setProgress(pct, stage, isError = false) {
  progressBar.style.width = pct + "%";
  progressBar.classList.toggle("error", isError);
  progressStage.textContent = stage;
}

async function uploadOneFile(file) {
  const ext = file.name.split(".").pop().toLowerCase();
  if (!["pdf", "docx", "txt"].includes(ext)) {
    alert(`"${file.name}" isn't a supported format. Use PDF, DOCX or TXT.`);
    return;
  }

  progressWrap.hidden = false;
  progressFileName.textContent = file.name;
  setProgress(8, "Reading file…");

  try {
    let text = "";
    if (ext === "pdf") {
      setProgress(20, "Reading file…");
      const buf = await readAsArrayBuffer(file);
      setProgress(45, "Extracting text (PDF)…");
      text = await parsePdf(buf);
    } else if (ext === "docx") {
      setProgress(20, "Reading file…");
      const buf = await readAsArrayBuffer(file);
      setProgress(45, "Extracting text (DOCX)…");
      text = await parseDocx(buf);
    } else {
      setProgress(30, "Reading text file…");
      text = await parseTxt(file);
    }

    if (!text || text.replace(/\s/g, "").length < 20) {
      throw new Error("Couldn't find readable text in this file.");
    }

    setProgress(75, "Analyzing skills…");
    const keywords = extractKeywords(text);
    await new Promise(r => setTimeout(r, 250)); // let the UI show the stage briefly

    const resume = {
      id: uid(),
      filename: file.name,
      type: ext.toUpperCase(),
      size: file.size,
      uploadedAt: new Date().toISOString(),
      text,
      keywords
    };
    resumes.unshift(resume);
    if (!activeResumeId) activeResumeId = resume.id;
    saveResumes();
    saveActive();

    setProgress(100, "Done ✓");
    setTimeout(() => { progressWrap.hidden = true; setProgress(0, ""); }, 900);

    renderResumes();
    updateStats();
    scanJobs();
  } catch (err) {
    console.error(err);
    setProgress(100, "Failed — " + err.message, true);
    setTimeout(() => { progressWrap.hidden = true; setProgress(0, ""); }, 2600);
  }
}

/* ---------- Resume list rendering ---------- */
function renderResumes() {
  const list = $("#resumeList");
  const empty = $("#resumeEmpty");
  const actions = $("#resumeActions");

  if (!resumes.length) {
    list.innerHTML = "";
    empty.hidden = false;
    actions.hidden = true;
    $("#statResume").textContent = "No résumé";
    return;
  }
  empty.hidden = true;
  actions.hidden = false;

  list.innerHTML = resumes.map(r => `
    <div class="resume-card ${r.id === activeResumeId ? "active" : ""}" data-id="${r.id}">
      <button class="resume-radio" data-action="activate" data-id="${r.id}" aria-label="Set as active résumé"></button>
      <div class="resume-info">
        <div class="resume-name">
          ${escapeHtml(r.filename)}
          <span class="resume-badge">${r.type}</span>
          ${r.id === activeResumeId ? '<span class="resume-badge" style="background:var(--amber-dim);color:var(--amber)">ACTIVE</span>' : ""}
        </div>
        <div class="resume-meta">${fileSizeLabel(r.size)} · uploaded ${relativeTime(r.uploadedAt)}</div>
        ${r.keywords.length ? `<div class="resume-skills">${r.keywords.slice(0, 8).map(k => `<span class="skill-chip">${escapeHtml(k)}</span>`).join("")}</div>` : ""}
      </div>
      <div class="resume-actions-row">
        <button class="icon-btn" data-action="preview" data-id="${r.id}" title="Preview" aria-label="Preview résumé">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/></svg>
        </button>
        <button class="icon-btn danger" data-action="delete" data-id="${r.id}" title="Remove" aria-label="Remove résumé">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z"/></svg>
        </button>
      </div>
    </div>
  `).join("");

  const active = resumes.find(r => r.id === activeResumeId);
  $("#statResume").textContent = active ? active.filename.replace(/\.(pdf|docx|txt)$/i, "") : "No résumé";
}

$("#resumeList").addEventListener("click", e => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const { action, id } = btn.dataset;
  if (action === "activate") {
    activeResumeId = id;
    saveActive();
    renderResumes();
    recomputeMatches();
    updateStats();
    renderJobs();
  } else if (action === "preview") {
    openPreview(id);
  } else if (action === "delete") {
    deleteResume(id);
  }
});

function deleteResume(id) {
  const r = resumes.find(x => x.id === id);
  if (!r) return;
  if (!confirm(`Remove "${r.filename}"? This can't be undone.`)) return;
  resumes = resumes.filter(x => x.id !== id);
  if (activeResumeId === id) activeResumeId = resumes[0]?.id || null;
  saveResumes();
  saveActive();
  renderResumes();
  recomputeMatches();
  updateStats();
  renderJobs();
}

$("#removeAllBtn").addEventListener("click", () => {
  if (!resumes.length) return;
  if (!confirm("Remove all résumés? This can't be undone.")) return;
  resumes = [];
  activeResumeId = null;
  saveResumes();
  saveActive();
  renderResumes();
  recomputeMatches();
  updateStats();
  renderJobs();
});

/* ---------- Preview modal ---------- */
function openPreview(id) {
  const r = resumes.find(x => x.id === id);
  if (!r) return;
  $("#previewTitle").textContent = r.filename;
  $("#previewSkills").innerHTML = r.keywords.length
    ? r.keywords.map(k => `<span class="skill-chip">${escapeHtml(k)}</span>`).join("")
    : `<span class="skill-chip">No recognized skills — matching will use general text overlap</span>`;
  $("#previewText").textContent = r.text.slice(0, 6000) + (r.text.length > 6000 ? "\n\n… (truncated preview)" : "");
  openModal("#previewModal");
}

function openModal(sel) { $(sel).hidden = false; document.body.style.overflow = "hidden"; }
function closeModal(sel) { $(sel).hidden = true; document.body.style.overflow = ""; }
$$("[data-close]").forEach(el => el.addEventListener("click", e => {
  closeModal(e.target.closest(".modal").id ? "#" + e.target.closest(".modal").id : null);
}));
$$(".modal").forEach(m => m.addEventListener("click", e => {
  if (e.target === m || e.target.classList.contains("modal-backdrop")) closeModal("#" + m.id);
}));
document.addEventListener("keydown", e => {
  if (e.key === "Escape") $$(".modal:not([hidden])").forEach(m => closeModal("#" + m.id));
});

/* ---------- Company tracker UI ---------- */
const COMPANY_PLATFORM_HINTS = {
  greenhouse: `Find the slug in the company's careers URL — <span class="mono">boards.greenhouse.io/<strong>stripe</strong></span>.`,
  lever: `Find the slug in the company's careers URL — <span class="mono">jobs.lever.co/<strong>netflix</strong></span>.`,
  workday: `Paste the <strong>full careers URL</strong> from their site — e.g. <span class="mono">https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite</span>. Best-effort: Workday isn't built for cross-site calls, so some tenants may not load.`
};
$("#companyPlatform").addEventListener("change", updateCompanyFormHint);
function updateCompanyFormHint() {
  const platform = $("#companyPlatform").value;
  $("#companyHint").innerHTML = COMPANY_PLATFORM_HINTS[platform];
  $("#companySlug").placeholder = platform === "workday"
    ? "Full careers URL, e.g. https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite"
    : "Board slug (e.g. stripe)";
}
updateCompanyFormHint();

function parseWorkdayUrl(input) {
  const m = input.trim().match(/^https?:\/\/([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com\/([^\s?#]+)/i);
  if (!m) return null;
  const tenant = m[1];
  const dc = m[2];
  const parts = m[3].replace(/\/$/, "").split("/").filter(Boolean);
  const site = parts.find(p => !/^[a-z]{2}-[A-Z]{2}$/.test(p)) || parts[0];
  if (!site) return null;
  const baseUrl = `https://${tenant}.${dc}.myworkdayjobs.com/${m[3].replace(/\/$/, "")}`;
  return { tenant, dc, site, baseUrl };
}

function renderCompanies() {
  const list = $("#companyList");
  if (!companies.length) {
    list.innerHTML = `<p style="color:var(--text-faint);font-size:13px;margin:6px 0 0;">No companies tracked yet — add one above.</p>`;
    return;
  }
  list.innerHTML = companies.map(c => `
    <div class="company-chip" data-id="${c.id}">
      <span>${escapeHtml(c.name)}</span>
      <span class="platform-tag">${c.platform}</span>
      <button data-remove-company="${c.id}" aria-label="Stop tracking ${escapeHtml(c.name)}" title="Remove">✕</button>
    </div>
  `).join("");
}

$("#companyForm").addEventListener("submit", e => {
  e.preventDefault();
  const name = $("#companyName").value.trim();
  const platform = $("#companyPlatform").value;
  const rawSlug = $("#companySlug").value.trim();
  if (!name || !rawSlug) return;

  let entry = { id: uid(), name, platform };
  if (platform === "workday") {
    const parsed = parseWorkdayUrl(rawSlug);
    if (!parsed) {
      alert("That doesn't look like a Workday careers URL. It should look like:\nhttps://tenant.wd5.myworkdayjobs.com/SiteName");
      return;
    }
    entry = { ...entry, ...parsed, slug: `${parsed.tenant}/${parsed.site}` };
  } else {
    const slug = rawSlug.toLowerCase().replace(/\s+/g, "-");
    entry.slug = slug;
  }

  if (companies.some(c => c.slug === entry.slug && c.platform === platform)) {
    alert("That company board is already being tracked.");
    return;
  }
  companies.push(entry);
  saveCompanies();
  renderCompanies();
  e.target.reset();
  updateCompanyFormHint();
  scanJobs();
});

$("#companyList").addEventListener("click", e => {
  const btn = e.target.closest("[data-remove-company]");
  if (!btn) return;
  companies = companies.filter(c => c.id !== btn.dataset.removeCompany);
  saveCompanies();
  renderCompanies();
  scanJobs();
});

$("#bulkAddBtn").addEventListener("click", () => {
  const raw = $("#bulkCompanyInput").value.trim();
  const resultEl = $("#bulkAddResult");
  if (!raw) return;

  const lines = raw.split("\n").map(l => l.trim()).filter(Boolean);
  let added = 0, skipped = 0, errors = [];

  lines.forEach(line => {
    const parts = line.split(",").map(p => p.trim());
    if (parts.length < 3) { skipped++; errors.push(`"${line}" — needs 3 fields`); return; }
    const [name, platformRaw, rest] = parts;
    const platform = platformRaw.toLowerCase();
    if (!["greenhouse", "lever", "workday"].includes(platform)) {
      skipped++; errors.push(`"${name}" — unknown platform "${platformRaw}"`); return;
    }

    let entry = { id: uid(), name, platform };
    if (platform === "workday") {
      const parsed = parseWorkdayUrl(rest);
      if (!parsed) { skipped++; errors.push(`"${name}" — invalid Workday URL`); return; }
      entry = { ...entry, ...parsed, slug: `${parsed.tenant}/${parsed.site}` };
    } else {
      entry.slug = rest.toLowerCase().replace(/\s+/g, "-");
    }

    if (companies.some(c => c.slug === entry.slug && c.platform === platform)) {
      skipped++; errors.push(`"${name}" — already tracked`); return;
    }
    companies.push(entry);
    added++;
  });

  saveCompanies();
  renderCompanies();
  if (added) scanJobs();

  resultEl.textContent = `Added ${added}${skipped ? `, skipped ${skipped}` : ""}.` +
    (errors.length ? " " + errors.slice(0, 4).join(" · ") : "");
  if (added) $("#bulkCompanyInput").value = "";
});

/* ============================================================
   JOB FETCHING
   ============================================================ */
async function fetchJSON(url) {
  try {
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error("status " + r.status);
    return await r.json();
  } catch (err) {
    // CORS / network fallback via public read-only proxy
    const proxied = "https://api.allorigins.win/raw?url=" + encodeURIComponent(url);
    const r2 = await fetch(proxied);
    if (!r2.ok) throw err;
    return await r2.json();
  }
}

function buildSearchQuery() {
  const active = resumes.find(r => r.id === activeResumeId);
  if (!active || !active.keywords.length) return "";
  return active.keywords.slice(0, 3).join(" ");
}

async function fetchRemotive() {
  const query = buildSearchQuery();
  const url = query
    ? `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(query)}&limit=${CONFIG.maxJobsPerSource}`
    : `https://remotive.com/api/remote-jobs?limit=${CONFIG.maxJobsPerSource}`;
  const data = await fetchJSON(url);
  return (data.jobs || []).map(j => ({
    id: "rm-" + j.id,
    source: "Remotive",
    title: j.title,
    company: j.company_name,
    location: j.candidate_required_location || "Remote",
    tags: (j.tags || []).slice(0, 6),
    url: j.url,
    description: stripHtml(j.description || "").slice(0, 4000),
    date: j.publication_date
  }));
}

async function fetchArbeitnow() {
  const url = "https://www.arbeitnow.com/api/job-board-api";
  const data = await fetchJSON(url);
  return (data.data || []).slice(0, CONFIG.maxJobsPerSource).map(j => ({
    id: "an-" + j.slug,
    source: "Arbeitnow",
    title: j.title,
    company: j.company_name,
    location: j.location || (j.remote ? "Remote" : "On-site"),
    tags: (j.tags || []).slice(0, 6),
    url: j.url,
    description: stripHtml(j.description || "").slice(0, 4000),
    date: j.created_at
      ? new Date(j.created_at * (String(j.created_at).length <= 10 ? 1000 : 1)).toISOString()
      : null
  }));
}

async function fetchGreenhouse(company) {
  const domains = ["boards-api.greenhouse.io", "boards-api.eu.greenhouse.io"];
  let lastErr;
  for (const domain of domains) {
    try {
      const url = `https://${domain}/v1/boards/${encodeURIComponent(company.slug)}/jobs?content=true`;
      const data = await fetchJSON(url);
      const jobs = data.jobs || [];
      if (jobs.length || domain === domains[domains.length - 1]) {
        return jobs.map(j => ({
          id: `gh-${company.slug}-${j.id}`,
          source: `Company · ${company.name}`,
          title: j.title,
          company: company.name,
          location: (j.location && j.location.name) || "See listing",
          tags: [],
          url: j.absolute_url,
          description: stripHtml(j.content || "").slice(0, 4000),
          date: j.updated_at || j.created_at || null
        }));
      }
    } catch (err) {
      lastErr = err; // try the next data-residency domain (e.g. EU-hosted boards)
    }
  }
  if (lastErr) throw lastErr;
  return [];
}

async function fetchLever(company) {
  const url = `https://api.lever.co/v0/postings/${encodeURIComponent(company.slug)}?mode=json`;
  const data = await fetchJSON(url);
  const jobs = Array.isArray(data) ? data : [];
  return jobs.map(j => ({
    id: `lv-${company.slug}-${j.id}`,
    source: `Company · ${company.name}`,
    title: j.text,
    company: company.name,
    location: (j.categories && j.categories.location) || "See listing",
    tags: (j.categories && j.categories.team) ? [j.categories.team] : [],
    url: j.hostedUrl,
    description: stripHtml(j.descriptionPlain || j.description || "").slice(0, 4000),
    date: j.createdAt ? new Date(j.createdAt).toISOString() : null
  }));
}

async function fetchCompanyJobs(company) {
  if (company.platform === "lever") return fetchLever(company);
  if (company.platform === "workday") return fetchWorkday(company);
  return fetchGreenhouse(company);
}

async function fetchJSONPost(url, body) {
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error("status " + r.status);
    return await r.json();
  } catch (err) {
    // Workday's endpoint has no CORS headers for third-party origins,
    // so a browser-to-browser POST proxy is needed most of the time.
    const proxied = "https://corsproxy.io/?url=" + encodeURIComponent(url);
    const r2 = await fetch(proxied, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!r2.ok) throw err;
    return await r2.json();
  }
}

function parseWorkdayPostedOn(str) {
  if (!str) return new Date().toISOString();
  const s = str.toLowerCase();
  if (s.includes("today")) return new Date().toISOString();
  if (s.includes("yesterday")) return new Date(Date.now() - 86400000).toISOString();
  let m = s.match(/(\d+)\+?\s*day/);
  if (m) return new Date(Date.now() - parseInt(m[1], 10) * 86400000).toISOString();
  m = s.match(/(\d+)\+?\s*month/);
  if (m) return new Date(Date.now() - parseInt(m[1], 10) * 30 * 86400000).toISOString();
  return new Date().toISOString(); // unrecognized format — assume recent rather than dropping it
}

async function fetchWorkday(company) {
  const apiUrl = `https://${company.tenant}.${company.dc}.myworkdayjobs.com/wday/cxs/${company.tenant}/${company.site}/jobs`;
  let offset = 0;
  const limit = 20;
  const maxPages = 3; // up to 60 postings per tenant, enough for a personal radar
  let all = [];
  for (let page = 0; page < maxPages; page++) {
    const data = await fetchJSONPost(apiUrl, { appliedFacets: {}, limit, offset, searchText: "" });
    const postings = data.jobPostings || [];
    all = all.concat(postings);
    const total = data.total || postings.length;
    offset += limit;
    if (offset >= total || !postings.length) break;
  }
  return all.map(j => ({
    id: `wd-${company.tenant}-${company.site}-${j.bulletFields?.[0] || j.externalPath}`,
    source: `Company · ${company.name}`,
    title: j.title,
    company: company.name,
    location: j.locationsText || (j.location ? j.location : "See listing"),
    tags: [],
    url: company.baseUrl.replace(/\/[a-z]{2}-[A-Z]{2}$/, "") + j.externalPath,
    description: "",
    date: parseWorkdayPostedOn(j.postedOn)
  }));
}

async function fetchPrebuiltWorkdayJobs() {
  try {
    const res = await fetch("jobs-workday.json", { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    return data.jobs || [];
  } catch {
    return []; // file may not exist yet if the Action hasn't run — fail quietly
  }
}

function scoreJob(job, resumeKeywords) {
  if (!resumeKeywords || !resumeKeywords.length) return null;
  const haystack = (job.title + " " + job.tags.join(" ") + " " + job.description).toLowerCase();
  let hits = 0;
  resumeKeywords.forEach(k => { if (haystack.includes(k)) hits++; });
  return Math.round((hits / resumeKeywords.length) * 100);
}

function dedupe(jobs) {
  const seen = new Set();
  return jobs.filter(j => {
    const key = (j.title + "|" + j.company).toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function scanJobs() {
  if (isScanning) return; // ignore extra clicks/triggers while a scan is already running
  isScanning = true;
  const refreshBtn = $("#refreshBtn");
  const refreshLabel = refreshBtn.innerHTML;
  refreshBtn.disabled = true;
  refreshBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6"/></svg> Scanning…`;

  const statusEl = $("#jobsStatus");
  const listEl = $("#jobsList");
  statusEl.textContent = "Scanning live feeds…";
  listEl.innerHTML = Array.from({ length: 4 }).map(() => `<div class="skeleton"></div>`).join("");
  $("#jobsEmpty").hidden = true;

  try {
    const companyFetches = companies.map(c =>
      fetchCompanyJobs(c).catch(err => { console.warn(`${c.name} (${c.platform}) fetch failed:`, err.message); return []; })
    );
    const results = await Promise.allSettled([fetchRemotive(), fetchArbeitnow(), fetchPrebuiltWorkdayJobs(), ...companyFetches]);
    const [remotive, arbeitnow, prebuiltWorkday, ...companyResults] = results;

    let jobs = [];
    if (remotive.status === "fulfilled") jobs = jobs.concat(remotive.value);
    if (arbeitnow.status === "fulfilled") jobs = jobs.concat(arbeitnow.value);
    if (prebuiltWorkday.status === "fulfilled") jobs = jobs.concat(prebuiltWorkday.value);
    let companiesLoaded = 0;
    companyResults.forEach(r => {
      if (r.status === "fulfilled") {
        jobs = jobs.concat(r.value);
        if (r.value.length) companiesLoaded++;
      }
    });

    jobs = dedupe(jobs).filter(j => j.date && daysAgo(j.date) <= CONFIG.staleAfterDays);

    const active = resumes.find(r => r.id === activeResumeId);
    const keywords = active ? active.keywords : [];
    jobs = jobs.map(j => ({ ...j, match: scoreJob(j, keywords) }));

    allJobs = jobs;
    lastScanAt = new Date();
    visibleCount = CONFIG.pageSize;

    const aggregatorsDown = remotive.status === "rejected" && arbeitnow.status === "rejected";
    const companyNote = companies.length
      ? ` · ${companiesLoaded}/${companies.length} tracked companies responded`
      : "";
    if (aggregatorsDown) {
      statusEl.textContent = `Aggregator feeds were unreachable${companyNote ? companyNote : ""} — check your connection and rescan.`;
    } else if (remotive.status === "rejected" || arbeitnow.status === "rejected") {
      statusEl.textContent = `Loaded ${jobs.length} active postings (one aggregator was unreachable)${companyNote}.`;
    } else {
      statusEl.textContent = `Loaded ${jobs.length} active postings from Remotive, Arbeitnow${companyNote}.`;
    }

    populateLocationFilter();
    renderJobs();
    updateStats();
    saveJobsCache();
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Something went wrong scanning job feeds. Try Rescan.";
    listEl.innerHTML = "";
    $("#jobsEmpty").hidden = false;
  } finally {
    isScanning = false;
    refreshBtn.disabled = false;
    refreshBtn.innerHTML = refreshLabel;
  }
}

/* ---------- Filtering / sorting / rendering ---------- */
function populateLocationFilter() {
  const sel = $("#locationFilter");
  const current = sel.value;
  const locs = new Set();
  allJobs.forEach(j => {
    const loc = (j.location || "").split(",")[0].trim();
    if (loc) locs.add(loc);
  });
  const sorted = Array.from(locs).sort((a, b) => a.localeCompare(b));
  sel.innerHTML = `<option value="">All locations</option>` +
    sorted.map(l => `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join("");
  if (sorted.includes(current)) sel.value = current;
}

function getFilteredSortedJobs() {
  const q = $("#searchBox").value.trim().toLowerCase();
  const loc = $("#locationFilter").value;
  const sortBy = $("#sortSelect").value;
  const strongOnly = $("#strongOnly").checked;

  let list = allJobs.filter(j => {
    if (q && !(j.title.toLowerCase().includes(q) || j.company.toLowerCase().includes(q))) return false;
    if (loc && !(j.location || "").toLowerCase().includes(loc.toLowerCase())) return false;
    if (strongOnly && (j.match === null || j.match < CONFIG.strongMatchThreshold)) return false;
    return true;
  });

  list.sort((a, b) => {
    if (sortBy === "match") {
      const ma = a.match ?? -1, mb = b.match ?? -1;
      if (mb !== ma) return mb - ma;
    }
    return new Date(b.date) - new Date(a.date);
  });

  return list;
}

function renderJobs() {
  const filtered = getFilteredSortedJobs();
  const listEl = $("#jobsList");
  const emptyEl = $("#jobsEmpty");
  const loadMoreWrap = $("#loadMoreWrap");

  if (!filtered.length) {
    listEl.innerHTML = "";
    emptyEl.hidden = false;
    loadMoreWrap.hidden = true;
    return;
  }
  emptyEl.hidden = true;

  const slice = filtered.slice(0, visibleCount);
  listEl.innerHTML = slice.map(jobCardHtml).join("");
  loadMoreWrap.hidden = filtered.length <= visibleCount;
}

function jobCardHtml(j) {
  const hasMatch = j.match !== null && j.match !== undefined;
  const gaugeClass = hasMatch ? "" : "no-match";
  const gaugeLabel = hasMatch ? j.match + "%" : "—";
  return `
    <article class="job-card" data-id="${j.id}">
      <div class="match-gauge ${gaugeClass}" style="--p:${hasMatch ? j.match : 0}">
        <span>${gaugeLabel}</span>
      </div>
      <div class="job-main">
        <div class="job-title-row">
          <a class="job-title" href="#" data-open-job="${j.id}">${escapeHtml(j.title)}</a>
          <span class="job-source-tag">${j.source}</span>
        </div>
        <div class="job-company">${escapeHtml(j.company)} · ${escapeHtml(j.location)}</div>
        ${j.tags.length ? `<div class="job-tags">${j.tags.map(t => `<span class="job-tag">${escapeHtml(t)}</span>`).join("")}</div>` : ""}
      </div>
      <div class="job-side">
        <span class="job-date">${relativeTime(j.date)}</span>
        <div class="job-actions">
          <a class="btn btn-primary btn-sm" href="${j.url}" target="_blank" rel="noopener">Apply ↗</a>
        </div>
      </div>
    </article>
  `;
}

$("#jobsList").addEventListener("click", e => {
  const link = e.target.closest("[data-open-job]");
  if (!link) return;
  e.preventDefault();
  openJobModal(link.dataset.openJob);
});

function openJobModal(id) {
  const j = allJobs.find(x => x.id === id);
  if (!j) return;
  $("#jobModalTitle").textContent = j.title;
  $("#jobModalMeta").innerHTML =
    `${escapeHtml(j.company)} · ${escapeHtml(j.location)} · ${j.source} · posted ${relativeTime(j.date)}` +
    (j.match !== null ? ` · <strong style="color:var(--amber)">${j.match}% match</strong>` : "");
  $("#jobModalDesc").textContent = j.description || "No description provided.";
  $("#jobModalApply").href = j.url;
  openModal("#jobModal");
}

/* ---------- Stats ---------- */
function updateStats() {
  $("#statJobs").textContent = allJobs.length || "0";
  $("#statStrong").textContent = allJobs.filter(j => j.match !== null && j.match >= CONFIG.strongMatchThreshold).length;
  $("#statUpdated").textContent = lastScanAt ? relativeTime(lastScanAt.toISOString()) : "—";
}

/* ---------- Filter bar events ---------- */
$("#searchBox").addEventListener("input", debounce(() => { visibleCount = CONFIG.pageSize; renderJobs(); }, 200));
$("#locationFilter").addEventListener("change", () => { visibleCount = CONFIG.pageSize; renderJobs(); });
$("#sortSelect").addEventListener("change", () => { visibleCount = CONFIG.pageSize; renderJobs(); });
$("#strongOnly").addEventListener("change", () => { visibleCount = CONFIG.pageSize; renderJobs(); });
$("#loadMoreBtn").addEventListener("click", () => { visibleCount += CONFIG.pageSize; renderJobs(); });
$("#refreshBtn").addEventListener("click", scanJobs);

/* ---------- Init ---------- */
(function init() {
  loadState();
  loadCompanies();
  renderResumes();
  renderCompanies();
  updateStats();

  const cache = loadJobsCache();
  if (cache && Array.isArray(cache.jobs) && cache.jobs.length) {
    allJobs = cache.jobs;
    lastScanAt = cache.updatedAt ? new Date(cache.updatedAt) : null;
    if (cache.resumeId !== activeResumeId) recomputeMatches(); // active résumé changed since last cache
    populateLocationFilter();
    renderJobs();
    updateStats();
    $("#jobsStatus").textContent =
      `Showing ${allJobs.length} postings from your last scan (${relativeTime((lastScanAt || new Date()).toISOString())}). Click Rescan for the latest.`;
  } else {
    scanJobs(); // first-ever visit — nothing cached yet, so fetch once
  }
})();
