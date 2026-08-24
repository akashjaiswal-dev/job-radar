# Job Radar — v2

A complete rebuild of the Job Radar GitHub Pages site: dynamic résumé‑matched live job feed, no demo data, no build step.

## What changed from v1
- **No hard-coded demo jobs.** Every job comes live from Remotive + Arbeitnow public APIs, plus any company boards you track directly (see below).
- **Jobs are cached, not re-fetched on every visit.** The app scans live sources once, then reuses that result on every reopen — no network calls, no wait — until you either click **Rescan** or upload a new résumé, both of which trigger a fresh fetch. Switching your *active* résumé among ones already uploaded re-scores the cached jobs instantly with no network call at all. The status line under the filters always tells you whether you're looking at a live scan or a cached one, and how old it is.
- **Official company career pages, not just aggregators.** A new "Companies" section lets you track any employer that runs its job board on Greenhouse or Lever — the two most common platforms. This reads straight from the company's own live board, so a role vanishes here the instant they close it — no staleness heuristic needed for these.
- **Real PDF/DOCX/TXT parsing**, done fully in the browser with pdf.js and mammoth.js — no server, no upload of your résumé anywhere.
- **Upload progress bar** with stages (Reading → Extracting → Analyzing skills → Done) and clear error state if a file can't be parsed.
- **Multiple résumé profiles**: switch the active one, **Preview** extracted text + detected skills, **remove one** résumé, or **remove all**.
- **Dynamic matching**: skills are extracted from your résumé text against a ~150-term dictionary (languages, frameworks, cloud, data, methodology) and used both to build the live search query and to score every job 0–100%.
- **Only active postings**: jobs older than 45 days are filtered out (`CONFIG.staleAfterDays` in `app.js`).
- **Sorted newest-first by default**, with a toggle for best-match-first, a location filter, free-text search, and a "strong matches only" switch.
- **Job detail modal** with description + a real "Apply" link that opens the source posting in a new tab.
- Fully responsive, keyboard-accessible, dark "radar" themed UI — no framework, so it runs directly on GitHub Pages with zero build step.

## Files
```
index.html                            – structure
styles.css                            – design system + responsive layout
app.js                                – all logic (parsing, matching, fetching, rendering)
jobs-workday.json                     – auto-refreshed MNC jobs (written by the Action, ships empty)
scripts/fetch-workday.mjs             – server-side Workday fetcher used by the Action
.github/workflows/refresh-workday.yml – schedules the refresh
```

## Deploy
1. Replace the files at the root of your `job-radar` repo (or wherever GitHub Pages is serving `main` from) with these — including the `.github/workflows/` folder and `jobs-workday.json`.
2. Commit and push to `main`.
3. GitHub Pages rebuilds automatically — refresh the site in ~30–60 seconds.
4. **One-time step:** go to the repo's **Actions** tab, open *Refresh Workday MNC jobs*, and click *Run workflow* so `jobs-workday.json` fills in immediately instead of waiting up to 6 hours for the first scheduled run.

No `npm install`, no secrets required — the workflow uses the repo's built-in `GITHUB_TOKEN` to commit.

## Personalize
Open `app.js` and edit the top of the file:
```js
const CONFIG = {
  ownerName: "Akash Jaiswal",
  ownerTitle: "Java Backend Developer",
  ...
  staleAfterDays: 45,        // how old a posting can be before it's hidden
  strongMatchThreshold: 55,  // % score that counts as a "strong match"
  pageSize: 12               // jobs per "Load more" page
};
```

## How matching works
1. On upload, your résumé text is scanned against a skill dictionary (`SKILL_DICTIONARY` in `app.js`) — add or remove terms there to tune it for your field.
2. The top 3 detected skills are used to query Remotive's search API; Arbeitnow's full public feed is pulled and filtered client-side.
3. Every job gets a match score = (skills found in that job's title/tags/description) ÷ (skills detected in your résumé), shown as the ring badge on each card.
4. If no résumé is active, jobs still show (sorted by newest) with a `—` badge instead of a score.

## Tracking a company's own board
Under **Companies**, add a display name, pick a platform, and give the board identifier:
- **Greenhouse**: slug from `boards.greenhouse.io/stripe` → `stripe`
- **Lever**: slug from `jobs.lever.co/netflix` → `netflix`
- **Workday**: paste the **full careers URL**, e.g. `https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite`. Workday runs the careers sites for most large enterprises (a lot of Indian and multinational employers included), but its JSON endpoint isn't built for cross-origin browser calls the way Greenhouse/Lever's are, so it's routed through a public POST-forwarding proxy (`corsproxy.io`) and is best-effort — some tenants sit behind bot protection and may not respond. It also only gives a relative date ("Posted 3 Days Ago"), so sort position for Workday postings is an estimate, not exact.

**Adding several at once:** open "Add multiple companies at once" and paste one company per line as `Name, platform, slug` (for Workday, the third field is the full URL instead of a slug). It reports how many were added vs. skipped and why.

Not every company uses one of these three — some run SmartRecruiters, a custom ATS, etc., which have no public API and can't be tracked this way without a backend. There's also no directory API that lists "every company on Greenhouse/Lever/Workday" — each platform only serves one company's board at a time by its exact slug, so *some* list is unavoidable; this is why the app ships a starter set instead of discovering companies automatically.

A default starter list ships in `DEFAULT_COMPANIES` in `app.js` — fintech + insurtech across India, the US, and Europe, chosen for a **3–6 yr Java + Spring Boot backend profile** specifically, not just brand recognition. Currently: **Razorpay**, **PayPay India**, **Next Insurance**, **Ethos Life**, **Modulr**, **Bitpanda**, **N26** (Greenhouse) and **Tala**, **Stable Money** (Lever). All nine are confirmed real boards with current backend roles — deliberately underrated/less-competitive picks rather than the usual unicorn names (Stripe, Netflix, Airbnb, Wise, Klarna are real boards too, but their bar skews senior/elite enough that even a well-matched résumé is unlikely to see honest 90%-type fits there).

Note on Greenhouse's EU data residency: some European companies (Bitpanda included) host their board on Greenhouse's EU cluster, which uses a different API domain (`boards-api.eu.greenhouse.io` instead of `boards-api.greenhouse.io`). `fetchGreenhouse()` in `app.js` tries both automatically, so you don't need to know which cluster a company is on when adding one yourself.

Edit `DEFAULT_COMPANIES` for a different starting set, or just manage it from the UI — anything you add or remove there is saved to `localStorage` and persists across visits. If you have specific target companies in mind, share the names and I'll check whether each one is actually verifiable on Greenhouse/Lever/Workday before adding — better than a slug that silently fails.

### Want Workday to be fully reliable instead of best-effort?
This repo already ships that upgrade for a starter set — no extra setup needed, and you can add more. Currently: **Accenture**, NVIDIA, Salesforce, Adobe, HP.

## Companies confirmed **not** trackable this way
Worth knowing so you don't waste time trying: **Cognizant, Wipro, Infosys, TCS, Capgemini, HCL, Tech Mahindra** — the major IT services / staffing firms as a category — all run custom in-house career portals, not Greenhouse, Lever, or Workday. Pulling from those would mean reverse-engineering each company's own site individually (different tech, different structure, no shared pattern), which is a much bigger, more fragile undertaking than this app's current approach. If you want, name one specifically and I'll check whether its portal happens to expose a discoverable JSON API worth building a one-off scraper for — some corporate sites do, even when they're not on a shared ATS platform.


- `scripts/fetch-workday.mjs` fetches jobs **server-side** from GitHub Actions (no CORS issue there) for the companies listed in its `COMPANIES` array — currently NVIDIA, Salesforce, Adobe, and HP. **Note:** these were picked to prove out the pipeline, not for backend-Java fit — like the elite Greenhouse names above, they skew senior. Swap them in `scripts/fetch-workday.mjs` for companies that actually match your level; I can help verify the right `tenant`/`dc`/`site` for specific ones if you name them, since a wrong value there fails the whole tenant rather than degrading gracefully.
- `.github/workflows/refresh-workday.yml` runs that script every 6 hours (and on-demand from the **Actions** tab → *Refresh Workday MNC jobs* → *Run workflow*) and commits the result to `jobs-workday.json`.
- `app.js` fetches that same-origin JSON file on every scan and merges it into the feed — no proxy, no CORS, no flakiness.

**To add more MNCs to the reliable path:** open `scripts/fetch-workday.mjs`, add an entry to `COMPANIES` with `{ name, tenant, dc, site }` read off that company's careers URL (`https://{tenant}.{dc}.myworkdayjobs.com/{site}`), commit, then either wait for the next scheduled run or trigger it manually from the Actions tab.

**First run:** `jobs-workday.json` ships as an empty placeholder so the site never 404s. It fills in after the workflow runs once — trigger it manually the first time so you don't have to wait up to 6 hours.

Companies you add through the in-app **Companies** form under the Workday platform still go through the best-effort browser-side proxy path described above — that's for quick one-off tracking without touching the repo. The two approaches work side by side.


## Sources & compliance
Remotive, Arbeitnow, and any Greenhouse/Lever company boards you track are fetched programmatically — all publish free, public, CORS-friendly JSON APIs meant for exactly this kind of use. LinkedIn and Naukri are shown as manual outbound links only; nothing scrapes or bypasses their protections.

If a browser or network blocks a direct cross-origin request to any of these, `app.js` automatically retries once through a public read-only CORS proxy (`api.allorigins.win`) so the feed still loads on GitHub Pages.

## Known limits worth knowing
- Matching is keyword-overlap based (not an LLM), so it's fast and free but literal — a résumé that says "Spring Boot" will score higher against a job that also says "Spring Boot" than one that only says "backend framework."
- "Active" is inferred from how recently a posting appeared in the feed, since neither public API exposes a hard close date.
- If both source APIs are briefly down, the status line under the filters will say so — hit **Rescan**.
