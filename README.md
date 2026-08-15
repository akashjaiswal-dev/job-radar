# Job Radar Portfolio

Mobile-friendly GitHub Pages job dashboard. Upload multiple resume profiles, switch the active resume, and rank collected jobs against it.

## Deploy
1. Create a GitHub repo, e.g. `job-radar`.
2. Upload these files to `main`.
3. Settings → Pages → Deploy from branch → `main` → `/ (root)`.
4. Open the Pages URL from your phone.
5. Actions → Update job feed → Run workflow once.

## Sources
The included collector uses public/permitted job feeds (Remotive and Arbeitnow). LinkedIn/Naukri are intentionally not scraped or bypassed. Their alerts can be used alongside the dashboard; compliant APIs/connectors can be added later.

## Resume privacy
The starter frontend stores resume text locally in the browser. It does not upload resume contents to GitHub. For PDF/DOCX parsing, the next upgrade should add PDF.js/Mammoth in-browser parsing; TXT works in this starter.

## Next upgrades
- Full PDF/DOCX parsing
- Email/Telegram alerts
- Application tracking
- More compliant job connectors
- Backend/database for cross-device resume profiles
- AI resume-to-job matching
