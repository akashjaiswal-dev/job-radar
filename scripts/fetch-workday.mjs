// scripts/fetch-workday.mjs
// Runs inside GitHub Actions (Node 20+, native fetch). Calls each tracked
// Workday tenant's own CXS jobs endpoint SERVER-SIDE — no CORS restriction
// applies here the way it does from a browser — and writes the normalized
// results to jobs-workday.json at the repo root, which the static site
// then just fetches like any other same-origin file.
//
// Add or remove MNCs by editing the COMPANIES array below. Find a
// company's {tenant, dc, site} by opening their careers page and reading
// it off the URL: https://{tenant}.{dc}.myworkdayjobs.com/{site}

const COMPANIES = [
  { name: "Accenture", tenant: "accenture", dc: "wd103", site: "AccentureCareers" },
  { name: "NVIDIA", tenant: "nvidia", dc: "wd5", site: "NVIDIAExternalCareerSite" },
  { name: "Salesforce", tenant: "salesforce", dc: "wd12", site: "External_Career_Site" },
  { name: "Adobe", tenant: "adobe", dc: "wd5", site: "external_experienced" },
  { name: "HP", tenant: "hp", dc: "wd5", site: "ExternalCareerSite" }
];

function parsePostedOn(str) {
  if (!str) return new Date().toISOString();
  const s = str.toLowerCase();
  if (s.includes("today")) return new Date().toISOString();
  if (s.includes("yesterday")) return new Date(Date.now() - 86400000).toISOString();
  let m = s.match(/(\d+)\+?\s*day/);
  if (m) return new Date(Date.now() - parseInt(m[1], 10) * 86400000).toISOString();
  m = s.match(/(\d+)\+?\s*month/);
  if (m) return new Date(Date.now() - parseInt(m[1], 10) * 30 * 86400000).toISOString();
  return new Date().toISOString();
}

function normalize(j, c) {
  return {
    id: `wd-${c.tenant}-${c.site}-${(j.bulletFields && j.bulletFields[0]) || j.externalPath}`,
    source: `Company · ${c.name}`,
    title: j.title,
    company: c.name,
    location: j.locationsText || "See listing",
    tags: [],
    url: `https://${c.tenant}.${c.dc}.myworkdayjobs.com/${c.site}${j.externalPath}`,
    description: "",
    date: parsePostedOn(j.postedOn)
  };
}

async function fetchTenant(c) {
  const url = `https://${c.tenant}.${c.dc}.myworkdayjobs.com/wday/cxs/${c.tenant}/${c.site}/jobs`;
  const limit = 20;
  const maxPages = 5; // up to 100 postings per tenant
  let offset = 0;
  let all = [];
  for (let page = 0; page < maxPages; page++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appliedFacets: {}, limit, offset, searchText: "" })
    });
    if (!res.ok) {
      console.warn(`[${c.name}] HTTP ${res.status} — skipping (may be blocked or renamed).`);
      break;
    }
    const data = await res.json();
    const postings = data.jobPostings || [];
    all = all.concat(postings.map(j => normalize(j, c)));
    const total = data.total ?? postings.length;
    offset += limit;
    if (offset >= total || postings.length === 0) break;
  }
  console.log(`[${c.name}] ${all.length} postings.`);
  return all;
}

const results = await Promise.allSettled(COMPANIES.map(fetchTenant));
let jobs = [];
results.forEach((r, i) => {
  if (r.status === "fulfilled") jobs = jobs.concat(r.value);
  else console.warn(`[${COMPANIES[i].name}] failed:`, r.reason?.message || r.reason);
});

const output = { updatedAt: new Date().toISOString(), jobs };
const fs = await import("node:fs");
fs.writeFileSync(new URL("../jobs-workday.json", import.meta.url), JSON.stringify(output, null, 2));
console.log(`Wrote ${jobs.length} total jobs from ${COMPANIES.length} tenants to jobs-workday.json`);
