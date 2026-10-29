# BC HR & Compliance website

A static website hosted for free on GitHub Pages, served from your own domain.

## Files
- `index.html` is the home page (services, process, FAQ, contact form)
- `privacy.html` is the privacy policy (a template; review it before relying on it)
- `styles.css` holds the styling
- `CNAME` holds your custom domain. Currently set to `bchrfiles.com`.

## Before going live
1. **Domain:** put your domain in `CNAME` (currently `bchrfiles.com`).
2. **Email:** replace `info@example.com` in `index.html` and `privacy.html`.
3. **Contact form:** create a free form at https://formspree.io, then replace `YOUR_FORM_ID` in `index.html`.

## Publish on GitHub Pages
1. Create a new repo on GitHub, for example `bc-hr-compliance`.
2. Push this folder to it:
   ```bash
   git remote add origin https://github.com/rsalmons12/bc-hr-compliance.git
   git push -u origin main
   ```
3. In the repo, go to **Settings → Pages**, then under **Source** choose **Deploy from a branch**, then select `main` and `/ (root)`.
4. Under **Custom domain**, enter your domain and save. Tick **Enforce HTTPS** once it becomes available.

## Point your domain at GitHub (DNS)
At your domain registrar (GoDaddy, Namecheap, Cloudflare, etc.), add these records:

| Type  | Name / Host | Value                     |
|-------|-------------|---------------------------|
| CNAME | `www`       | `rsalmons12.github.io` |
| A     | `@`         | `185.199.108.153`         |
| A     | `@`         | `185.199.109.153`         |
| A     | `@`         | `185.199.110.153`         |
| A     | `@`         | `185.199.111.153`         |

DNS changes can take up to 24 hours to apply. HTTPS is issued automatically after that.
