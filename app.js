// BC HR & Compliance client portal: core helpers, sign-in, layout and company pages.
// Employee onboarding lives in onboarding.js; employee management in people.js.
// Supabase handles logins, data and files; database security rules
// (supabase/*.sql) decide what each person is allowed to see.

const cfg = window.PORTAL_CONFIG || {};
const configured = !!cfg.supabaseUrl && !cfg.supabaseUrl.startsWith('YOUR_');

// Invite and password-reset email links arrive with "#...&type=invite|recovery".
// Read it before Supabase consumes the link.
const linkType = new URLSearchParams(location.hash.slice(1)).get('type');

const sb = configured ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey) : null;

const state = {
  user: null,
  profile: null,
  emp: null, // the signed-in employee's onboarding file
  companies: [],
  companyId: null,
  needsPassword: linkType === 'invite' || linkType === 'recovery',
  redirected: false,
};

const COMPLAINT_CATEGORIES = [
  'Harassment or bullying',
  'Discrimination',
  'Health and safety',
  'Pay, hours or leave',
  'Misconduct',
  'Other',
];
const TASK_STATUS = { open: 'Open', in_progress: 'In progress', done: 'Done' };
const COMPLAINT_STATUS = { new: 'New', reviewing: 'Under review', closed: 'Closed' };
const ROLE_LABEL = { admin: 'BC HR admin', manager: 'Manager', employee: 'Employee' };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const app = document.getElementById('app');

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// Run a Supabase query and throw on error, so views can use try/catch.
async function q(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

let toastTimer;
function toast(message, kind = 'ok') {
  const t = document.getElementById('toast');
  t.textContent = message;
  t.className = `show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = ''; }, 4000);
}

function on(root, selector, event, handler) {
  root.querySelectorAll(selector).forEach((node) => node.addEventListener(event, handler));
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

// Empty form fields become null so dates and numbers save cleanly.
function nullify(obj) {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, typeof v === 'string' && v.trim() === '' ? null : v]));
}

// Disable a form's submit button while an async action runs.
async function busy(form, action) {
  const button = form.querySelector('button[type="submit"]');
  if (button) button.disabled = true;
  try {
    await action();
  } catch (err) {
    toast(err.message || String(err), 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

function fmtDate(value) {
  if (!value) return '';
  // Plain dates (YYYY-MM-DD) are local calendar days, not UTC midnight.
  const d = value.length === 10 ? new Date(`${value}T00:00`) : new Date(value);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtDateTime(value) {
  return value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '';
}

function fmtSize(bytes) {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysUntil(date) {
  if (!date) return null;
  return Math.round((new Date(`${date}T00:00`) - new Date(`${today()}T00:00`)) / 86400000);
}

function expiryBadge(date) {
  const days = daysUntil(date);
  if (days === null) return '<span class="muted">No expiry</span>';
  if (days < 0) return badge(`Expired ${fmtDate(date)}`, 'danger');
  if (days <= 30) return badge(days === 0 ? 'Expires today' : `Expires in ${days} day${days === 1 ? '' : 's'}`, 'danger');
  if (days <= 90) return badge(`Expires ${fmtDate(date)}`, 'warn');
  return badge(`Expires ${fmtDate(date)}`, 'neutral');
}

const isOverdue = (task) => task.status !== 'done' && task.due_date && task.due_date < today();
const role = () => state.profile?.role;
const isAdmin = () => role() === 'admin';
const isManager = () => role() === 'manager';
const isEmployee = () => role() === 'employee';
const isStaff = () => isAdmin() || isManager();
const companyName = (id) => state.companies.find((c) => c.id === id)?.name || '';
const personName = (p) => p?.full_name || p?.email || 'Unknown';

function badge(text, kind) {
  return `<span class="badge ${kind}">${esc(text)}</span>`;
}

function options(map, selected) {
  return Object.entries(map)
    .map(([value, label]) => `<option value="${esc(value)}"${value === selected ? ' selected' : ''}>${esc(label)}</option>`)
    .join('');
}

function companyOptions(selected) {
  return state.companies
    .map((c) => `<option value="${esc(c.id)}"${c.id === selected ? ' selected' : ''}>${esc(c.name)}</option>`)
    .join('');
}

function brand() {
  return '<div class="brand"><img class="mark" src="brand/mark.svg" alt=""><span>BC HR &amp; Compliance</span></div>';
}

function safeName(name) {
  return name.replace(/[^\w.\-]+/g, '_');
}

async function openSignedFile(bucket, path, name, download = true) {
  // Open the tab during the click itself, so pop-up blockers allow it.
  const tab = download ? null : window.open('', '_blank');
  try {
    const { signedUrl } = await q(sb.storage.from(bucket).createSignedUrl(path, 120, download ? { download: name } : undefined));
    if (tab) {
      tab.opener = null;
      tab.location = signedUrl;
    } else {
      location.href = signedUrl;
    }
  } catch (err) {
    tab?.close();
    toast(err.message, 'error');
  }
}

// ---------------------------------------------------------------------------
// Session handling
// ---------------------------------------------------------------------------

async function start() {
  if (!configured) {
    renderMessage('Portal not connected yet',
      'Add your Supabase project URL and publishable key to <code>config.js</code>. See the README for step-by-step instructions.');
    return;
  }
  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') state.needsPassword = true;
    // Supabase advises against awaiting its own calls inside this callback.
    setTimeout(() => onSession(session), 0);
  });
  window.addEventListener('hashchange', () => { if (state.profile) renderRoute(); });
}

async function loadEmp() {
  state.emp = await q(sb.from('employee_profiles').select('*').eq('user_id', state.user.id).maybeSingle());
}

async function onSession(session) {
  const user = session?.user || null;
  if (user && user.id === state.user?.id && state.profile) return;
  state.user = user;
  state.profile = null;
  if (!user) {
    renderLogin();
    return;
  }
  try {
    state.profile = await q(sb.from('profiles').select('*').eq('id', user.id).single());
    if (isAdmin()) {
      state.companies = await q(sb.from('companies').select('*').order('name'));
      const saved = localStorage.getItem('bc.companyId');
      state.companyId = state.companies.some((c) => c.id === saved) ? saved : state.companies[0]?.id || null;
    } else {
      state.companies = await q(sb.from('companies').select('*'));
      state.companyId = state.profile.company_id;
    }
    if (isEmployee()) await loadEmp();
  } catch (err) {
    renderMessage('Something went wrong', esc(err.message), true);
    return;
  }
  renderApp();
}

async function signOut() {
  await sb.auth.signOut();
  location.hash = '';
}

// ---------------------------------------------------------------------------
// Logged-out screens
// ---------------------------------------------------------------------------

function authCard(inner) {
  app.innerHTML = `
    <div class="auth">
      <div class="auth-card">
        <img class="auth-logo" src="brand/logo.png" alt="BC HR &amp; Compliance">
        ${inner}
      </div>
      <p class="auth-foot">Secure client portal · <a href="privacy.html">Privacy</a></p>
    </div>`;
}

function renderMessage(title, html, withSignOut = false) {
  authCard(`<h1>${esc(title)}</h1><p class="muted">${html}</p>
    ${withSignOut ? '<button class="btn" id="signout">Sign out</button>' : ''}`);
  on(app, '#signout', 'click', signOut);
}

function renderLogin() {
  authCard(`
    <h1>Sign in</h1>
    <p class="muted">Access your onboarding, documents and compliance records.</p>
    <form id="login" class="stack">
      <label>Email<input name="email" type="email" required autocomplete="email"></label>
      <label>Password<input name="password" type="password" required autocomplete="current-password"></label>
      <button type="submit" class="btn">Sign in</button>
    </form>
    <button class="link" id="forgot">Forgot your password?</button>
    <p class="muted small">Accounts are by invitation only. Check your email for an invite, or contact your manager.</p>`);

  on(app, '#login', 'submit', (e) => {
    e.preventDefault();
    const { email, password } = formData(e.target);
    busy(e.target, async () => {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Wrong email or password.' : error.message);
    });
  });
  on(app, '#forgot', 'click', renderForgot);
}

function renderForgot() {
  authCard(`
    <h1>Reset password</h1>
    <p class="muted">Enter your email and we'll send you a link to set a new password.</p>
    <form id="reset" class="stack">
      <label>Email<input name="email" type="email" required autocomplete="email"></label>
      <button type="submit" class="btn">Send reset link</button>
    </form>
    <button class="link" id="back">Back to sign in</button>`);

  on(app, '#reset', 'submit', (e) => {
    e.preventDefault();
    const { email } = formData(e.target);
    busy(e.target, async () => {
      await q(sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }));
      toast('If that email has an account, a reset link is on its way.');
    });
  });
  on(app, '#back', 'click', renderLogin);
}

function renderSetPassword() {
  authCard(`
    <h1>${linkType === 'invite' ? 'Welcome! Choose a password' : 'Choose a new password'}</h1>
    <p class="muted">Signed in as ${esc(state.user.email)}. Use at least 8 characters.</p>
    <form id="setpw" class="stack">
      <label>New password<input name="password" type="password" minlength="8" required autocomplete="new-password"></label>
      <label>Confirm password<input name="confirm" type="password" minlength="8" required autocomplete="new-password"></label>
      <button type="submit" class="btn">Save password</button>
    </form>`);

  on(app, '#setpw', 'submit', (e) => {
    e.preventDefault();
    const { password, confirm } = formData(e.target);
    if (password !== confirm) return toast('The passwords do not match.', 'error');
    busy(e.target, async () => {
      await q(sb.auth.updateUser({ password }));
      state.needsPassword = false;
      history.replaceState(null, '', location.pathname);
      toast('Password saved.');
      renderApp();
    });
  });
}

// ---------------------------------------------------------------------------
// Logged-in shell and routing
// ---------------------------------------------------------------------------

const ALL = ['admin', 'manager', 'employee'];
const STAFF = ['admin', 'manager'];
const NAV = [
  { route: 'dashboard', label: 'Dashboard', roles: ALL },
  { route: 'onboarding', label: 'My onboarding', roles: ['employee'] },
  { route: 'credentials', label: 'My licenses & credentials', roles: ['employee'] },
  { route: 'employees', label: 'Employees', roles: STAFF },
  { route: 'expiring', label: 'Expiring credentials', roles: STAFF },
  { route: 'sign', label: 'Documents to sign', roles: ALL },
  { route: 'policies', label: 'Policies', roles: ALL },
  { route: 'documents', label: 'Company files', roles: ALL },
  { route: 'checklist', label: 'Compliance checklist', roles: STAFF },
  { route: 'complaints', label: 'Complaints & incidents', roles: ALL },
  { route: 'users', label: 'Users & invites', roles: STAFF },
  { route: 'companies', label: 'Client companies', roles: ['admin'] },
  { route: 'account', label: 'My account', roles: ALL },
];

function parseRoute() {
  const [route = 'dashboard', id = null] = location.hash.replace(/^#\/?/, '').split('/');
  const allowed = NAV.some((n) => n.route === route && n.roles.includes(role()));
  return allowed ? { route, id } : { route: 'dashboard', id: null };
}

function renderApp() {
  if (state.needsPassword) {
    renderSetPassword();
    return;
  }
  if (!isAdmin() && !state.profile.company_id) {
    renderMessage('Account not linked yet',
      'Your login works, but your account has not been linked to a company yet. Please contact BC HR &amp; Compliance.', true);
    return;
  }

  // New employees land on their onboarding until it is submitted.
  if (isEmployee() && !state.redirected && !['submitted', 'approved'].includes(state.emp?.status)
      && parseRoute().route === 'dashboard') {
    history.replaceState(null, '', '#/onboarding');
  }
  state.redirected = true;

  const companyPicker = isAdmin()
    ? (state.companies.length
      ? `<label class="picker">Client <select id="company">${companyOptions(state.companyId)}</select></label>`
      : '<span class="muted">No client companies yet</span>')
    : `<strong>${esc(companyName(state.companyId))}</strong>`;

  app.innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        ${brand()}
        <nav id="nav">
          ${NAV.filter((n) => n.roles.includes(role()))
            .map((n) => `<a href="#/${n.route}" data-route="${n.route}">${esc(n.label)}</a>`).join('')}
        </nav>
      </aside>
      <div class="main">
        <header class="topbar">
          <div>${companyPicker}</div>
          <div class="who">
            <span class="muted">${esc(personName(state.profile))}</span>
            ${badge(ROLE_LABEL[role()], isAdmin() ? 'info' : 'neutral')}
            <button class="btn btn-ghost btn-sm" id="signout">Sign out</button>
          </div>
        </header>
        <main id="view" class="view"></main>
      </div>
    </div>`;

  on(app, '#signout', 'click', signOut);
  on(app, '#company', 'change', (e) => selectCompany(e.target.value));
  renderRoute();
}

function selectCompany(id) {
  state.companyId = id;
  localStorage.setItem('bc.companyId', id);
  const picker = document.getElementById('company');
  if (picker) picker.value = id;
  renderRoute();
}

const VIEWS = {};

async function renderRoute() {
  const { route, id } = parseRoute();
  document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.route === route));
  const view = document.getElementById('view');
  if (!view) return;
  view.innerHTML = '<div class="loading">Loading…</div>';
  try {
    await VIEWS[route](view, id);
  } catch (err) {
    view.innerHTML = `<div class="card error">Could not load this page: ${esc(err.message)}</div>`;
  }
  window.scrollTo(0, 0);
}

// Admin pages that work on one client need a company to be selected.
function needsCompany(view) {
  if (state.companyId) return false;
  view.innerHTML = `<div class="card empty">Add a client company first on the
    <a href="#/companies">Client companies</a> page.</div>`;
  return true;
}

function pageHead(title, subtitle = '') {
  return `<div class="page-head"><h1>${esc(title)}</h1>${subtitle ? `<p class="muted">${subtitle}</p>` : ''}</div>`;
}

function stat(label, value, href, kind = '') {
  return `<a class="stat ${kind}" href="${href}"><span class="stat-value">${value}</span><span class="stat-label">${esc(label)}</span></a>`;
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

VIEWS.dashboard = (view) => {
  if (isAdmin()) return adminDashboard(view);
  if (isManager()) return managerDashboard(view);
  return employeeDashboard(view);
};

async function adminDashboard(view) {
  const soon = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const [tasks, complaints, files, profiles, expiring] = await Promise.all([
    q(sb.from('tasks').select('company_id, status, due_date')),
    q(sb.from('complaints').select('company_id, status')),
    q(sb.from('employee_profiles').select('company_id, status')),
    q(sb.from('profiles').select('company_id, role')),
    q(sb.from('credentials').select('company_id, expiry_date').lte('expiry_date', soon)),
  ]);
  const count = (rows, id, test = () => true) => rows.filter((r) => r.company_id === id && test(r)).length;
  const toReview = (r) => r.status === 'submitted';
  const isNew = (c) => c.status === 'new';
  const people = profiles.filter((p) => p.role !== 'admin');
  const cell = (n, kind) => (n ? badge(n, kind) : 0);

  view.innerHTML = `
    ${pageHead('Overview', 'All client companies at a glance.')}
    <div class="stats">
      ${stat('Client companies', state.companies.length, '#/companies')}
      ${stat('People', people.length, '#/users')}
      ${stat('Onboarding to review', files.filter(toReview).length, '#/employees', files.some(toReview) ? 'warn' : '')}
      ${stat('Credentials expiring ≤ 30 days', expiring.length, '#/expiring', expiring.length ? 'danger' : '')}
      ${stat('New complaints', complaints.filter(isNew).length, '#/complaints', complaints.some(isNew) ? 'warn' : '')}
    </div>
    <section class="card">
      <h2>Clients</h2>
      ${state.companies.length ? `
      <div class="table-wrap"><table>
        <thead><tr><th>Company</th><th>People</th><th>Onboarding to review</th><th>Expiring ≤ 30 days</th><th>Overdue tasks</th><th>New complaints</th></tr></thead>
        <tbody>${state.companies.map((c) => `
          <tr class="clickable" data-company="${c.id}">
            <td><strong>${esc(c.name)}</strong></td>
            <td>${count(people, c.id)}</td>
            <td>${cell(count(files, c.id, toReview), 'warn')}</td>
            <td>${cell(count(expiring, c.id), 'danger')}</td>
            <td>${cell(count(tasks, c.id, isOverdue), 'danger')}</td>
            <td>${cell(count(complaints, c.id, isNew), 'warn')}</td>
          </tr>`).join('')}
        </tbody>
      </table></div>` : '<p class="muted">No clients yet. <a href="#/companies">Add your first client company</a>.</p>'}
    </section>`;

  on(view, 'tr[data-company]', 'click', (e) => {
    state.companyId = e.currentTarget.dataset.company;
    localStorage.setItem('bc.companyId', state.companyId);
    document.getElementById('company').value = state.companyId;
    location.hash = '#/employees';
  });
}

// ---------------------------------------------------------------------------
// Company files
// ---------------------------------------------------------------------------

VIEWS.documents = async (view) => {
  if (needsCompany(view)) return;
  const c = state.companyId;
  const docs = await q(sb.from('documents').select('*').eq('company_id', c).order('created_at', { ascending: false }));

  view.innerHTML = `
    ${pageHead('Company files', 'Handbooks, forms and other files shared with everyone at your company.')}
    ${isStaff() ? `
    <form id="upload" class="card inline-form">
      <input type="file" name="file" required multiple>
      <button type="submit" class="btn">Upload</button>
    </form>` : ''}
    <section class="card">
      ${docs.length ? `
      <div class="table-wrap"><table>
        <thead><tr><th>Name</th><th>Size</th><th>Uploaded</th><th></th></tr></thead>
        <tbody>${docs.map((d) => `
          <tr>
            <td>${esc(d.name)}</td>
            <td class="muted">${fmtSize(d.size)}</td>
            <td class="muted">${fmtDate(d.created_at)}</td>
            <td class="actions">
              <button class="btn btn-sm btn-ghost" data-download="${d.id}">Download</button>
              ${isStaff() ? `<button class="btn btn-sm btn-danger" data-delete="${d.id}">Delete</button>` : ''}
            </td>
          </tr>`).join('')}
        </tbody>
      </table></div>` : '<p class="muted">No files yet.</p>'}
    </section>`;

  const byId = (id) => docs.find((d) => d.id === id);

  on(view, '#upload', 'submit', (e) => {
    e.preventDefault();
    const files = [...e.target.file.files];
    busy(e.target, async () => {
      for (const file of files) {
        const path = `${c}/${crypto.randomUUID()}-${safeName(file.name)}`;
        await q(sb.storage.from('documents').upload(path, file));
        const { error } = await sb.from('documents').insert({ company_id: c, name: file.name, path, size: file.size });
        if (error) {
          await sb.storage.from('documents').remove([path]);
          throw error;
        }
      }
      toast(files.length === 1 ? 'File uploaded.' : `${files.length} files uploaded.`);
      renderRoute();
    });
  });

  on(view, '[data-download]', 'click', (e) => {
    const doc = byId(e.currentTarget.dataset.download);
    openSignedFile('documents', doc.path, doc.name);
  });

  on(view, '[data-delete]', 'click', async (e) => {
    const doc = byId(e.currentTarget.dataset.delete);
    if (!confirm(`Delete "${doc.name}"? This cannot be undone.`)) return;
    try {
      await q(sb.storage.from('documents').remove([doc.path]));
      await q(sb.from('documents').delete().eq('id', doc.id));
      toast('File deleted.');
      renderRoute();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
};

// ---------------------------------------------------------------------------
// Policies and acknowledgement
// ---------------------------------------------------------------------------

VIEWS.policies = async (view, id) => {
  if (id) return policyDetail(view, id);
  if (needsCompany(view)) return;
  const c = state.companyId;
  const [policies, acks, people] = await Promise.all([
    q(sb.from('policies').select('*').eq('company_id', c).order('created_at', { ascending: false })),
    isStaff()
      ? q(sb.from('policy_acknowledgements').select('policy_id'))
      : q(sb.from('policy_acknowledgements').select('policy_id').eq('user_id', state.user.id)),
    isStaff() ? q(sb.from('profiles').select('id').eq('company_id', c).neq('role', 'admin')) : [],
  ]);
  const ackCount = (pid) => acks.filter((a) => a.policy_id === pid).length;

  view.innerHTML = `
    ${pageHead('Policies', isStaff() ? 'Publish policies and track who has acknowledged them.' : 'Read each policy and confirm you have understood it.')}
    ${isStaff() ? `
    <details class="card">
      <summary class="btn">+ New policy</summary>
      <form id="new-policy" class="stack">
        <label>Title<input name="title" required></label>
        <label>Policy text<textarea name="body" rows="10" required></textarea></label>
        <button type="submit" class="btn">Publish to ${esc(companyName(c))}</button>
      </form>
    </details>` : ''}
    <section class="card">
      ${policies.length ? `<ul class="list">${policies.map((p) => `
        <li>
          <a href="#/policies/${p.id}">${esc(p.title)}</a>
          ${isStaff()
            ? badge(`${ackCount(p.id)} of ${people.length} acknowledged`, ackCount(p.id) >= people.length && people.length ? 'ok' : 'neutral')
            : (ackCount(p.id) ? badge('Acknowledged', 'ok') : badge('Needs acknowledgement', 'warn'))}
        </li>`).join('')}</ul>` : '<p class="muted">No policies yet.</p>'}
    </section>`;

  on(view, '#new-policy', 'submit', (e) => {
    e.preventDefault();
    const { title, body } = formData(e.target);
    busy(e.target, async () => {
      await q(sb.from('policies').insert({ company_id: c, title, body }));
      toast('Policy published.');
      renderRoute();
    });
  });
};

async function policyDetail(view, id) {
  const policy = await q(sb.from('policies').select('*').eq('id', id).single());
  const acks = await q(sb.from('policy_acknowledgements').select('*').eq('policy_id', id));
  const mine = acks.find((a) => a.user_id === state.user.id);

  let signoff = '';
  if (isStaff()) {
    const people = await q(sb.from('profiles').select('id, email, full_name')
      .eq('company_id', policy.company_id).neq('role', 'admin').order('email'));
    signoff = `
      <section class="card">
        <h2>Acknowledgements</h2>
        ${people.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Person</th><th>Status</th></tr></thead>
          <tbody>${people.map((p) => {
            const ack = acks.find((a) => a.user_id === p.id);
            return `<tr><td>${esc(personName(p))}<div class="muted small">${esc(p.email)}</div></td>
              <td>${ack ? badge(`Acknowledged ${fmtDate(ack.acknowledged_at)}`, 'ok') : badge('Not yet', 'warn')}</td></tr>`;
          }).join('')}</tbody>
        </table></div>` : '<p class="muted">No people at this company yet.</p>'}
        <button class="btn btn-danger btn-sm" id="delete-policy">Delete policy</button>
      </section>`;
  }

  view.innerHTML = `
    <a href="${isStaff() ? '#/policies' : '#/sign'}" class="back">← Back</a>
    ${pageHead(policy.title, `Published ${fmtDate(policy.created_at)}`)}
    <article class="card policy-body">${esc(policy.body)}</article>
    ${isStaff() ? signoff : `
      <section class="card ack">
        ${mine
          ? `${badge('Acknowledged', 'ok')} You acknowledged this policy on ${fmtDate(mine.acknowledged_at)}.`
          : `<p>By clicking below you confirm you have read and understood this policy.</p>
             <button class="btn" id="ack">I have read and acknowledge this policy</button>`}
      </section>`}`;

  on(view, '#ack', 'click', async (e) => {
    e.currentTarget.disabled = true;
    try {
      await q(sb.from('policy_acknowledgements').insert({ policy_id: id, user_id: state.user.id }));
      toast('Thank you, your acknowledgement has been recorded.');
      renderRoute();
    } catch (err) {
      toast(err.message, 'error');
      e.currentTarget.disabled = false;
    }
  });

  on(view, '#delete-policy', 'click', async () => {
    if (!confirm('Delete this policy and all its acknowledgements?')) return;
    try {
      await q(sb.from('policies').delete().eq('id', id));
      toast('Policy deleted.');
      location.hash = '#/policies';
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

// ---------------------------------------------------------------------------
// Compliance checklist
// ---------------------------------------------------------------------------

VIEWS.checklist = async (view) => {
  if (needsCompany(view)) return;
  const c = state.companyId;
  const tasks = await q(sb.from('tasks').select('*').eq('company_id', c));
  const order = { open: 0, in_progress: 1, done: 2 };
  tasks.sort((a, b) => order[a.status] - order[b.status] || (a.due_date || '9999').localeCompare(b.due_date || '9999'));

  view.innerHTML = `
    ${pageHead('Compliance checklist', 'Keep track of audits, training renewals and other deadlines.')}
    ${isAdmin() ? `
    <details class="card">
      <summary class="btn">+ New task</summary>
      <form id="new-task" class="stack">
        <label>Task<input name="title" required placeholder="e.g. Annual harassment training"></label>
        <label>Due date<input name="due_date" type="date"></label>
        <label>Details<textarea name="description" rows="3"></textarea></label>
        <button type="submit" class="btn">Add task for ${esc(companyName(c))}</button>
      </form>
    </details>` : ''}
    <section class="card">
      ${tasks.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Task</th><th>Due</th><th>Status</th>${isAdmin() ? '<th></th>' : ''}</tr></thead>
        <tbody>${tasks.map((t) => `
          <tr class="${t.status === 'done' ? 'done' : ''}">
            <td><strong>${esc(t.title)}</strong>${t.description ? `<div class="muted small">${esc(t.description)}</div>` : ''}</td>
            <td>${t.due_date ? badge(fmtDate(t.due_date), isOverdue(t) ? 'danger' : 'neutral') : '<span class="muted">—</span>'}</td>
            <td><select data-status="${t.id}" aria-label="Status">${options(TASK_STATUS, t.status)}</select></td>
            ${isAdmin() ? `<td class="actions"><button class="btn btn-sm btn-danger" data-delete="${t.id}">Delete</button></td>` : ''}
          </tr>`).join('')}
        </tbody>
      </table></div>` : '<p class="muted">No tasks yet.</p>'}
    </section>`;

  on(view, '#new-task', 'submit', (e) => {
    e.preventDefault();
    const { title, due_date, description } = formData(e.target);
    busy(e.target, async () => {
      await q(sb.from('tasks').insert({ company_id: c, title, due_date: due_date || null, description: description || null }));
      toast('Task added.');
      renderRoute();
    });
  });

  on(view, '[data-status]', 'change', async (e) => {
    try {
      await q(sb.from('tasks').update({ status: e.target.value }).eq('id', e.target.dataset.status));
      toast('Status updated.');
      renderRoute();
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  on(view, '[data-delete]', 'click', async (e) => {
    if (!confirm('Delete this task?')) return;
    try {
      await q(sb.from('tasks').delete().eq('id', e.currentTarget.dataset.delete));
      renderRoute();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
};

// ---------------------------------------------------------------------------
// Complaints and incidents
// ---------------------------------------------------------------------------

const complaintBadge = (s) => badge(COMPLAINT_STATUS[s], { new: 'warn', reviewing: 'info', closed: 'neutral' }[s]);

VIEWS.complaints = async (view, id) => {
  if (id) return complaintDetail(view, id);
  if (isAdmin()) return adminComplaints(view);

  const mine = await q(sb.from('complaints').select('*').eq('submitted_by', state.user.id).order('created_at', { ascending: false }));
  view.innerHTML = `
    ${pageHead('Complaints & incidents', 'Reports go confidentially to BC HR &amp; Compliance. Your manager and co-workers cannot see them.')}
    <section class="card">
      <h2>Report a concern</h2>
      <form id="new-complaint" class="stack">
        <label>Type<select name="category" required>
          <option value="">Choose…</option>
          ${COMPLAINT_CATEGORIES.map((c) => `<option>${esc(c)}</option>`).join('')}
        </select></label>
        <label>Short summary<input name="subject" required maxlength="200"></label>
        <label>When did it happen? (optional)<input name="incident_date" type="date" max="${today()}"></label>
        <label>What happened?<textarea name="details" rows="6" required
          placeholder="Include who was involved, where it happened and any witnesses."></textarea></label>
        <button type="submit" class="btn">Submit report</button>
      </form>
    </section>
    <section class="card">
      <h2>Your reports</h2>
      ${mine.length ? `<ul class="list">${mine.map((x) => `
        <li><span>${esc(x.subject)} <span class="muted small">· ${fmtDate(x.created_at)}</span></span>${complaintBadge(x.status)}</li>`).join('')}</ul>`
        : '<p class="muted">You have not submitted any reports.</p>'}
    </section>`;

  on(view, '#new-complaint', 'submit', (e) => {
    e.preventDefault();
    const f = formData(e.target);
    busy(e.target, async () => {
      await q(sb.from('complaints').insert({
        company_id: state.companyId,
        submitted_by: state.user.id,
        category: f.category,
        subject: f.subject,
        details: f.details,
        incident_date: f.incident_date || null,
      }));
      toast('Your report has been submitted confidentially.');
      renderRoute();
    });
  });
};

async function adminComplaints(view) {
  if (needsCompany(view)) return;
  const rows = await q(sb.from('complaints').select('*, profiles(email, full_name)')
    .eq('company_id', state.companyId).order('created_at', { ascending: false }));
  view.innerHTML = `
    ${pageHead('Complaints & incidents', `Confidential reports from ${esc(companyName(state.companyId))}.`)}
    <section class="card">
      ${rows.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Received</th><th>Summary</th><th>Type</th><th>From</th><th>Status</th></tr></thead>
        <tbody>${rows.map((x) => `
          <tr class="clickable" data-open="${x.id}">
            <td class="muted">${fmtDate(x.created_at)}</td>
            <td><strong>${esc(x.subject)}</strong></td>
            <td>${esc(x.category)}</td>
            <td>${esc(x.profiles ? personName(x.profiles) : 'Deleted user')}</td>
            <td>${complaintBadge(x.status)}</td>
          </tr>`).join('')}
        </tbody>
      </table></div>` : '<p class="muted">No reports from this company.</p>'}
    </section>`;
  on(view, '[data-open]', 'click', (e) => { location.hash = `#/complaints/${e.currentTarget.dataset.open}`; });
}

async function complaintDetail(view, id) {
  if (!isAdmin()) {
    location.hash = '#/complaints';
    return;
  }
  const x = await q(sb.from('complaints').select('*, profiles(email, full_name)').eq('id', id).single());
  view.innerHTML = `
    <a href="#/complaints" class="back">← All reports</a>
    ${pageHead(x.subject, `${esc(x.category)} · ${esc(companyName(x.company_id))}`)}
    <section class="card">
      <dl class="meta">
        <dt>From</dt><dd>${esc(x.profiles?.full_name || '')} ${esc(x.profiles?.email || 'Deleted user')}</dd>
        <dt>Received</dt><dd>${fmtDate(x.created_at)}</dd>
        <dt>Incident date</dt><dd>${x.incident_date ? fmtDate(x.incident_date) : '—'}</dd>
      </dl>
      <div class="policy-body">${esc(x.details)}</div>
    </section>
    <form id="review" class="card stack">
      <h2>Review</h2>
      <label>Status<select name="status">${options(COMPLAINT_STATUS, x.status)}</select></label>
      <label>Internal notes (only BC HR staff see these)<textarea name="admin_notes" rows="5">${esc(x.admin_notes)}</textarea></label>
      <button type="submit" class="btn">Save</button>
    </form>`;

  on(view, '#review', 'submit', (e) => {
    e.preventDefault();
    const { status, admin_notes } = formData(e.target);
    busy(e.target, async () => {
      await q(sb.from('complaints').update({ status, admin_notes }).eq('id', id));
      toast('Saved.');
    });
  });
}

// ---------------------------------------------------------------------------
// Admin: client companies
// ---------------------------------------------------------------------------

async function reloadCompanies() {
  state.companies = await q(sb.from('companies').select('*').order('name'));
  if (!state.companies.some((c) => c.id === state.companyId)) state.companyId = state.companies[0]?.id || null;
}

VIEWS.companies = async (view) => {
  view.innerHTML = `
    ${pageHead('Client companies', 'Each company only ever sees its own people, files and records.')}
    <form id="new-company" class="card inline-form">
      <input name="name" required placeholder="Company name">
      <button type="submit" class="btn">Add company</button>
    </form>
    <section class="card">
      ${state.companies.length ? `<ul class="list">${state.companies.map((c) => `
        <li><span><strong>${esc(c.name)}</strong> <span class="muted small">· added ${fmtDate(c.created_at)}</span></span>
          <button class="btn btn-sm btn-danger" data-delete="${c.id}">Delete</button></li>`).join('')}</ul>`
        : '<p class="muted">No client companies yet.</p>'}
    </section>`;

  on(view, '#new-company', 'submit', (e) => {
    e.preventDefault();
    const { name } = formData(e.target);
    busy(e.target, async () => {
      const created = await q(sb.from('companies').insert({ name }).select().single());
      await reloadCompanies();
      state.companyId = created.id;
      localStorage.setItem('bc.companyId', created.id);
      toast(`${name} added.`);
      renderApp();
    });
  });

  on(view, '[data-delete]', 'click', async (e) => {
    const c = state.companies.find((x) => x.id === e.currentTarget.dataset.delete);
    const typed = prompt(`This permanently deletes ${c.name} and ALL its employee files, documents, policies, tasks and reports.\n\nType the company name to confirm:`);
    if (typed !== c.name) return;
    try {
      const files = await q(sb.from('documents').select('path').eq('company_id', c.id));
      const signDocs = await q(sb.from('sign_documents').select('file_path').eq('company_id', c.id));
      const companyFiles = [...files.map((f) => f.path), ...signDocs.map((d) => d.file_path)];
      if (companyFiles.length) await q(sb.storage.from('documents').remove(companyFiles));
      const creds = await q(sb.from('credentials').select('file_path').eq('company_id', c.id).not('file_path', 'is', null));
      if (creds.length) await q(sb.storage.from('employee-files').remove(creds.map((f) => f.file_path)));
      await q(sb.from('companies').delete().eq('id', c.id));
      await reloadCompanies();
      toast(`${c.name} deleted.`);
      renderApp();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
};

// ---------------------------------------------------------------------------
// My account
// ---------------------------------------------------------------------------

VIEWS.account = async (view) => {
  view.innerHTML = `
    ${pageHead('My account')}
    <section class="card">
      <dl class="meta">
        <dt>Name</dt><dd>${esc(state.profile.full_name || '—')}</dd>
        <dt>Email</dt><dd>${esc(state.profile.email)}</dd>
        <dt>Role</dt><dd>${esc(ROLE_LABEL[role()])}</dd>
        <dt>Company</dt><dd>${isAdmin() ? 'BC HR &amp; Compliance' : esc(companyName(state.profile.company_id))}</dd>
      </dl>
    </section>
    <form id="password" class="card stack narrow">
      <h2>Change password</h2>
      <label>New password<input name="password" type="password" minlength="8" required autocomplete="new-password"></label>
      <label>Confirm password<input name="confirm" type="password" minlength="8" required autocomplete="new-password"></label>
      <button type="submit" class="btn">Update password</button>
    </form>`;

  on(view, '#password', 'submit', (e) => {
    e.preventDefault();
    const { password, confirm: again } = formData(e.target);
    if (password !== again) return toast('The passwords do not match.', 'error');
    busy(e.target, async () => {
      await q(sb.auth.updateUser({ password }));
      e.target.reset();
      toast('Password updated.');
    });
  });
};
