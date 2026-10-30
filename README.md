# BC HR & Compliance client portal

A secure portal at **https://bchrfiles.com** for BC HR & Compliance and its client companies.

**Who uses it**

| Role | Can do |
|---|---|
| **BC HR admin** (you) | Everything, for every client company. Only admins can see full SSNs and bank numbers, and every view is logged. |
| **Manager** (agency management) | Everything for their own agency: employees and onboarding, credential expiry, and agency compliance (state licenses, Department of Health revisions, plant & business documents, policies & procedures). |
| **Employee** | Complete onboarding, keep their licenses up to date, sign documents, report concerns. |

**Employee onboarding:** employees are invited by email. On first sign-in they set a password and complete:
1. Personal details: legal name, date of birth, address, emergency contact
2. Education: highest level, school, with optional diploma uploads
3. Licenses and certifications: uploads with numbers and expiry dates
4. Direct deposit and SSN: encrypted, with the routing number checked
5. Signing documents (PDFs signed by typed name) and acknowledging policies
6. Review and submit, after which a manager or admin approves it or requests changes

**Agency compliance (managers and BC HR only):**
- **State licenses:** type, number, issuing agency, state, start and expiration dates, with attachments
- **License revisions:** corrections requested by the Department of Health, tracked through open, in progress, submitted, accepted and closed, with due dates, the agency's letters and plans of correction
- **Plant & business:** business formation (articles, operating agreement, Secretary of State registration, good standing), IRS EIN / SS-4, ownership structure and disclosures, insurance, plus facility certificates (occupancy, fire, HVAC, elevator, boiler, generator…), with expiration or renewal dates
- **Policies & procedures:** manuals and plans, with version and next-review date

Every attachment version is kept and every change is logged (who, what, when). Managers can archive superseded items but cannot delete; only BC HR admins can.

**Also included:** expiring-credential tracking, company files, a compliance checklist, and confidential complaints.

**How it works:** GitHub Pages hosts the site. Supabase handles logins, data and files. The rules in `supabase/*.sql` run inside the database, so nobody can get around them from the browser.

## Files

| File | What it is |
|---|---|
| `index.html`, `app.js`, `onboarding.js`, `compliance.js`, `people.js`, `styles.css` | The portal |
| `config.js` | Supabase project URL and publishable key |
| `supabase/schema.sql` | Step 1 database setup |
| `supabase/002_onboarding.sql` | Step 2 database setup (roles, onboarding, encryption) |
| `supabase/003_agency_compliance.sql` | Step 3 database setup (agency compliance) |
| `supabase/functions/invite-user/index.ts` | Server function that sends invite emails |
| `brand/` | Logo files |

## One-time setup in Supabase

1. **Create a project.** At https://supabase.com/dashboard, click **New project** and name it e.g. `bc-hr-portal`. Save the database password somewhere safe.
2. **Create the database.** Open **SQL Editor**, click **New query**, paste all of `supabase/schema.sql`, and click **Run**. It should say "Success".
3. **Turn off public sign-up.** Go to **Authentication → Sign In / Providers** and switch off **Allow new users to sign up**. Only people you add can get in.
4. **Set the website address.** Go to **Authentication → URL Configuration**:
   - Site URL: `https://bchrfiles.com`
   - Redirect URLs: add `https://bchrfiles.com/**`
5. **Connect the portal.** Go to **Project Settings → API Keys** (or click **Connect** at the top). Copy the **Project URL** and the **publishable** key (it starts with `sb_publishable_`; older projects call it the `anon` key) into `config.js`.
   - **Never** put the `secret` or `service_role` key in this repository.
6. **Make yourself admin.**
   - Go to **Authentication → Users → Add user → Create new user**. Enter your email and a password, and tick **Auto Confirm User**.
   - In **SQL Editor**, run (with your email):
     ```sql
     update public.profiles set role = 'admin' where email = 'your@email.com';
     ```
   - Sign in at https://bchrfiles.com.

## Upgrade: employee onboarding (run once)

1. **Database.** In **SQL Editor → New query**, paste all of `supabase/002_onboarding.sql` and click **Run**. Existing client users become **managers**. Then do the same with `supabase/003_agency_compliance.sql`. Run them in that order, each once.
2. **Invite function.**
   - Go to **Edge Functions → Deploy a new function → Via Editor**.
   - Name it exactly `invite-user`, replace the sample code with `supabase/functions/invite-user/index.ts`, and click **Deploy**.
   - Then open the function's **Details / Settings** and turn **off** **Verify JWT**. The function checks who is calling it itself.
3. **Invite emails.** See "Set up invite emails" below. Without this, invites only reach members of your Supabase team.

## Set up invite emails

Supabase needs your own email sender to send invites and password resets to employees. Resend is free for up to 3,000 emails a month:

1. Sign up at https://resend.com, then go to **Domains → Add domain** and enter `bchrfiles.com`.
2. Add the DNS records Resend shows you in Cloudflare (**DNS → Records**). Resend can do this for you with its **Sign in to Cloudflare** button.
3. In Resend, create an **API key**.
4. In Supabase, go to **Authentication → Emails → SMTP Settings**, turn on **Enable custom SMTP**, and enter:
   - Sender email: `noreply@bchrfiles.com`, Sender name: `BC HR & Compliance`
   - Host: `smtp.resend.com`, Port: `465`, Username: `resend`, Password: your Resend API key
5. Optional: under **Authentication → Emails → Templates → Invite user**, edit the wording of the invite email.

## Adding a client

1. In the portal, go to **Client companies** and add the company.
2. Go to **Users & invites**. Invite the company's contact as a **Manager**.
3. The manager, or you, then invites their employees. Each employee gets an email, sets a password, and starts onboarding.
4. Under **Documents to sign**, upload the PDFs every new hire must sign (offer letter, W-4, I-9, handbook acknowledgement…).

If invite emails aren't set up yet, you can still create a login by hand. Invite the person in the portal first, so their company and role are saved. Then in Supabase go to **Authentication → Users → Add user → Create new user**, tick **Auto Confirm User**, and send them the temporary password.

## Domain (already done)

The domain is managed in Cloudflare, with DNS set to **DNS only** (grey cloud):

| Type | Name | Value |
|---|---|---|
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |
| CNAME | www | rsalmons12.github.io |
