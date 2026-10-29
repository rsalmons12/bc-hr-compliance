# BC HR & Compliance client portal

A secure portal at **https://bchrfiles.com** where client companies log in to:

- **Documents**: upload and download HR files, private to each company
- **Policies**: read policies and sign them off; admins see who has signed
- **Compliance checklist**: tasks with due dates, with overdue ones highlighted
- **Complaints & incidents**: confidential reports that only BC HR staff can read

BC HR & Compliance staff (admins) see every client. Client users only ever see their own company.

**How it works:** GitHub Pages hosts the pages. Supabase handles logins, data and file storage. The security rules in `supabase/schema.sql` run inside the database, so nobody can get around them from the browser.

## Files

| File | What it is |
|---|---|
| `index.html`, `app.js`, `styles.css` | The portal |
| `config.js` | Your Supabase project URL and publishable key |
| `supabase/schema.sql` | Database tables and security rules (run once) |
| `privacy.html` | Privacy policy (a template to review) |
| `CNAME` | The custom domain (`bchrfiles.com`) |

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

## Adding a client

1. In the portal, go to **Client companies** and add the company.
2. Go to **Users → Add a person**. Enter their email, name and company.
3. In Supabase, go to **Authentication → Users → Add user → Create new user**. Use the same email, a temporary password, and tick **Auto Confirm User**.
4. Send them the temporary password. They sign in at https://bchrfiles.com and change it under **My account**.

They are linked to their company automatically. You can change someone's company or role at any time on the **Users** page.

### Optional: send invite and password-reset emails

Supabase's built-in email only delivers to members of your own Supabase team, so "Forgot password" and **Send invitation** won't reach clients until you add your own email sender. To set one up:

1. Create a free account with an email service such as Resend or Brevo, and verify `bchrfiles.com` with them.
2. In Supabase, go to **Authentication → Emails → SMTP Settings** and enter the details they give you.

After that you can use **Add user → Send invitation**, and clients can reset their own passwords.

## Domain (already done)

The domain is managed in Cloudflare, with DNS set to **DNS only** (grey cloud):

| Type | Name | Value |
|---|---|---|
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |
| CNAME | www | rsalmons12.github.io |
