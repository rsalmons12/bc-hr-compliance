// Manager and admin side: employee list and files, expiring credentials, users and invites.

async function loadCompanyPeople(c) {
  const [people, files, creds, docs] = await Promise.all([
    q(sb.from('profiles').select('id, email, full_name, role, created_at').eq('company_id', c).neq('role', 'admin').order('email')),
    q(sb.from('employee_profiles').select('*').eq('company_id', c)),
    q(sb.from('credentials').select('*').eq('company_id', c)),
    q(sb.from('sign_documents').select('id, title, required_for_onboarding').eq('company_id', c)),
  ]);
  const sigs = docs.length
    ? await q(sb.from('signatures').select('document_id, user_id').in('document_id', docs.map((d) => d.id)))
    : [];
  const fileFor = (id) => files.find((f) => f.user_id === id);
  return { people, files, creds, docs, sigs, fileFor };
}

function displayName(p, file) {
  if (file?.legal_first_name) {
    return `${file.preferred_name || file.legal_first_name} ${file.legal_last_name || ''}`.trim();
  }
  return personName(p);
}

// The soonest-expiring credential decides the badge shown in lists.
function worstExpiry(creds) {
  const dated = creds.filter((c) => c.expiry_date).sort((a, b) => a.expiry_date.localeCompare(b.expiry_date));
  return dated.length ? expiryBadge(dated[0].expiry_date) : '<span class="muted">—</span>';
}

// ---------------------------------------------------------------------------
// Manager dashboard
// ---------------------------------------------------------------------------

async function managerDashboard(view) {
  const c = state.companyId;
  const [data, agency] = await Promise.all([loadCompanyPeople(c), loadAgencyCompliance(c)]);
  const agencyDue = agency.docs.filter((d) => d.expiry_date && daysUntil(d.expiry_date) <= 60);
  const openRevisions = agency.revisions.filter(revisionIsOpen);
  const employees = data.people.filter((p) => p.role === 'employee');
  const toReview = data.files.filter((f) => f.status === 'submitted');
  const expired = data.creds.filter((x) => x.expiry_date && daysUntil(x.expiry_date) < 0);
  const soon = data.creds.filter((x) => x.expiry_date && daysUntil(x.expiry_date) >= 0 && daysUntil(x.expiry_date) <= 30);
  const required = data.docs.filter((d) => d.required_for_onboarding);
  const missingSigs = employees.filter((p) => required.some((d) => !data.sigs.some((s) => s.document_id === d.id && s.user_id === p.id)));
  const personById = (id) => data.people.find((p) => p.id === id);
  const attention = [...expired, ...soon].sort((a, b) => a.expiry_date.localeCompare(b.expiry_date)).slice(0, 8);

  view.innerHTML = `
    ${pageHead('Dashboard', esc(companyName(c)))}
    <div class="stats">
      ${stat('Employees', employees.length, '#/employees')}
      ${stat('Onboarding to review', toReview.length, '#/employees', toReview.length ? 'warn' : '')}
      ${stat('Expired credentials', expired.length, '#/expiring', expired.length ? 'danger' : '')}
      ${stat('Expiring ≤ 30 days', soon.length, '#/expiring', soon.length ? 'warn' : '')}
      ${stat('Missing signatures', missingSigs.length, '#/sign', missingSigs.length ? 'warn' : '')}
      ${stat('Agency items expired or due ≤ 60 days', agencyDue.length, '#/compliance', agencyDue.length ? 'danger' : '')}
      ${stat('Open license revisions', openRevisions.length, '#/compliance/revisions', openRevisions.some(revisionOverdue) ? 'danger' : openRevisions.length ? 'warn' : '')}
    </div>
    <div class="grid2">
      <section class="card">
        <h2>Onboarding waiting for review</h2>
        ${toReview.length ? `<ul class="list">${toReview.map((f) => `
          <li><a href="#/employees/${f.user_id}">${esc(displayName(personById(f.user_id), f))}</a>
            <span class="muted small">submitted ${fmtDate(f.submitted_at)}</span></li>`).join('')}</ul>`
          : '<p class="muted">Nothing waiting.</p>'}
      </section>
      <section class="card">
        <h2>Credentials needing attention</h2>
        ${attention.length ? `<ul class="list">${attention.map((x) => `
          <li><span><a href="#/employees/${x.user_id}">${esc(displayName(personById(x.user_id), data.fileFor(x.user_id)))}</a>
            <span class="muted small">· ${esc(x.name)}</span></span>${expiryBadge(x.expiry_date)}</li>`).join('')}</ul>`
          : '<p class="muted">Nothing expiring in the next 30 days.</p>'}
      </section>
    </div>`;
}

// ---------------------------------------------------------------------------
// Employees list and file
// ---------------------------------------------------------------------------

const EMPLOYEE_FILTERS = {
  all: 'Everyone',
  submitted: 'Awaiting review',
  in_progress: 'In progress',
  changes_requested: 'Changes requested',
  approved: 'Approved',
  none: 'Not started',
};

VIEWS.employees = async (view, id) => {
  if (id) return employeeDetail(view, id);
  if (needsCompany(view)) return;
  const data = await loadCompanyPeople(state.companyId);
  const required = data.docs.filter((d) => d.required_for_onboarding);
  const filter = sessionStorage.getItem('bc.empFilter') || 'all';
  const statusOf = (p) => data.fileFor(p.id)?.status || 'none';
  const rows = data.people.filter((p) => filter === 'all' || statusOf(p) === filter);

  view.innerHTML = `
    ${pageHead('Employees', `${esc(companyName(state.companyId))} · ${data.people.length} people. <a href="#/users">Add someone →</a>`)}
    <div class="filters">${Object.entries(EMPLOYEE_FILTERS).map(([k, label]) => {
      const n = k === 'all' ? data.people.length : data.people.filter((p) => statusOf(p) === k).length;
      return `<button class="chip ${k === filter ? 'active' : ''}" data-filter="${k}">${esc(label)} <span>${n}</span></button>`;
    }).join('')}</div>
    <section class="card">
      ${rows.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Person</th><th>Job title</th><th>Onboarding</th><th>Credentials</th><th>Required documents</th></tr></thead>
        <tbody>${rows.map((p) => {
          const file = data.fileFor(p.id);
          const creds = data.creds.filter((x) => x.user_id === p.id);
          const signed = required.filter((d) => data.sigs.some((s) => s.document_id === d.id && s.user_id === p.id)).length;
          return `<tr class="clickable" data-open="${p.id}">
            <td><strong>${esc(displayName(p, file))}</strong> ${p.role === 'manager' ? badge('Manager', 'info') : ''}
              <div class="muted small">${esc(p.email)}</div></td>
            <td>${esc(file?.job_title || '—')}</td>
            <td>${onboardingBadge(file?.status)}</td>
            <td>${creds.length} ${creds.length ? worstExpiry(creds) : ''}</td>
            <td>${required.length ? badge(`${signed} of ${required.length} signed`, signed === required.length ? 'ok' : 'warn') : '<span class="muted">—</span>'}</td>
          </tr>`;
        }).join('')}</tbody></table></div>`
        : `<p class="muted">${data.people.length ? 'Nobody matches this filter.' : 'No employees yet. <a href="#/users">Add the first one</a>.'}</p>`}
    </section>`;

  on(view, '[data-filter]', 'click', (e) => {
    sessionStorage.setItem('bc.empFilter', e.currentTarget.dataset.filter);
    renderRoute();
  });
  on(view, '[data-open]', 'click', (e) => { location.hash = `#/employees/${e.currentTarget.dataset.open}`; });
};

async function employeeDetail(view, id) {
  const p = await q(sb.from('profiles').select('*').eq('id', id).single());
  const [file, creds, docs, sigs, policies, acks] = await Promise.all([
    q(sb.from('employee_profiles').select('*').eq('user_id', id).maybeSingle()),
    q(sb.from('credentials').select('*').eq('user_id', id).order('expiry_date', { nullsFirst: false })),
    q(sb.from('sign_documents').select('*').eq('company_id', p.company_id).order('created_at')),
    q(sb.from('signatures').select('*').eq('user_id', id)),
    q(sb.from('policies').select('id, title').eq('company_id', p.company_id).order('created_at')),
    q(sb.from('policy_acknowledgements').select('*').eq('user_id', id)),
  ]);
  const e = file || {};
  const dl = (pairs) => `<dl class="meta">${pairs.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v ? esc(v) : '<span class="muted">—</span>'}</dd>`).join('')}</dl>`;
  const address = [e.address_line1, e.address_line2, [e.city, e.state, e.zip].filter(Boolean).join(', ')].filter(Boolean).join('\n');

  view.innerHTML = `
    <a href="#/employees" class="back">← All employees</a>
    ${pageHead(displayName(p, file), `${esc(p.email)} · ${esc(ROLE_LABEL[p.role])} · ${esc(companyName(p.company_id))}`)}

    <form id="review" class="card stack">
      <h2>Onboarding ${onboardingBadge(file?.status)}</h2>
      ${file?.submitted_at ? `<p class="muted small">Submitted ${fmtDateTime(file.submitted_at)}${file.reviewed_at ? ` · last reviewed ${fmtDateTime(file.reviewed_at)}` : ''}</p>` : ''}
      ${file ? '' : '<p class="muted">This person has not started onboarding yet.</p>'}
      <div class="row">
        ${input('Job title', 'job_title', e.job_title)}
        ${input('Start date', 'start_date', e.start_date, 'type="date"')}
      </div>
      <label>Notes to the employee (shown when you request changes)<textarea name="review_notes" rows="2">${esc(e.review_notes)}</textarea></label>
      <div class="button-row">
        <button type="submit" class="btn btn-ghost" data-action="save">Save job details</button>
        ${file ? `
          <button type="submit" class="btn btn-danger" data-action="changes_requested">Request changes</button>
          <button type="submit" class="btn" data-action="approved">Approve onboarding</button>` : ''}
      </div>
    </form>

    <div class="grid2">
      <section class="card">
        <h2>Personal details</h2>
        ${dl([
          ['Legal name', [e.legal_first_name, e.legal_middle_name, e.legal_last_name].filter(Boolean).join(' ')],
          ['Preferred name', e.preferred_name],
          ['Date of birth', fmtDate(e.date_of_birth)],
          ['Phone', e.phone],
          ['Address', address],
          ['Emergency contact', [e.emergency_name, e.emergency_relationship && `(${e.emergency_relationship})`, e.emergency_phone].filter(Boolean).join(' ')],
        ])}
      </section>
      <section class="card">
        <h2>Education</h2>
        ${dl([
          ['Highest level', e.education_level],
          ['School', e.school_name],
          ['Field of study', e.field_of_study],
          ['Year completed', e.graduation_year],
        ])}
      </section>
    </div>

    <section class="card">
      <h2>Licenses, certifications &amp; degrees</h2>
      ${creds.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Credential</th><th>Number</th><th>Expiry</th><th>Verified</th><th></th></tr></thead>
        <tbody>${creds.map((c) => `
          <tr>
            <td><strong>${esc(c.name)}</strong><div class="muted small">${esc([CRED_KINDS[c.kind], c.issuer, c.issuing_state].filter(Boolean).join(' · '))}</div></td>
            <td>${esc(c.number || '—')}</td>
            <td>${expiryBadge(c.expiry_date)}</td>
            <td>${c.verified_at ? badge(`Verified ${fmtDate(c.verified_at)}`, 'ok') : badge('Not verified', 'warn')}</td>
            <td class="actions">
              ${c.file_path ? `<button class="btn btn-sm btn-ghost" data-file="${c.id}">View file</button>` : badge('No file', 'warn')}
              ${c.verified_at
                ? `<button class="btn btn-sm btn-ghost" data-verify="${c.id}" data-value="">Un-verify</button>`
                : `<button class="btn btn-sm" data-verify="${c.id}" data-value="1">Verify</button>`}
            </td>
          </tr>`).join('')}
        </tbody></table></div>` : '<p class="muted">None uploaded.</p>'}
    </section>

    <section class="card">
      <h2>Payroll</h2>
      <dl class="meta">
        <dt>Direct deposit</dt><dd>${e.bank_on_file ? badge('On file', 'ok') : badge('Missing', 'warn')}</dd>
        <dt>SSN</dt><dd>${e.ssn_on_file ? badge('On file', 'ok') : badge('Missing', 'warn')}</dd>
      </dl>
      ${isAdmin() && (e.bank_on_file || e.ssn_on_file) ? `
        <div id="sensitive"><button class="btn btn-ghost btn-sm" id="reveal">🔒 Show full SSN &amp; bank details (this view is logged)</button></div>`
        : (!isAdmin() ? '<p class="muted small">Full numbers are visible to BC HR &amp; Compliance payroll admins only.</p>' : '')}
    </section>

    <section class="card">
      <h2>Signed documents &amp; policies</h2>
      ${docs.length || policies.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Item</th><th>Status</th></tr></thead>
        <tbody>
          ${docs.map((d) => {
            const s = sigs.find((x) => x.document_id === d.id);
            return `<tr><td>📄 ${esc(d.title)} ${d.required_for_onboarding ? '' : '<span class="muted small">(optional)</span>'}</td>
              <td>${s ? `${badge('Signed', 'ok')} <em>${esc(s.typed_name)}</em> <span class="muted small">${fmtDateTime(s.signed_at)}</span>` : badge('Not signed', 'warn')}</td></tr>`;
          }).join('')}
          ${policies.map((pol) => {
            const a = acks.find((x) => x.policy_id === pol.id);
            return `<tr><td>📘 ${esc(pol.title)}</td>
              <td>${a ? `${badge('Acknowledged', 'ok')} <span class="muted small">${fmtDate(a.acknowledged_at)}</span>` : badge('Not yet', 'warn')}</td></tr>`;
          }).join('')}
        </tbody></table></div>` : '<p class="muted">Nothing to sign at this company yet.</p>'}
    </section>`;

  on(view, '#review', 'submit', (ev) => {
    ev.preventDefault();
    const action = ev.submitter?.dataset.action || 'save';
    const f = nullify(formData(ev.target));
    if (action === 'changes_requested' && !f.review_notes) {
      toast('Add a note telling the employee what to change.', 'error');
      return;
    }
    busy(ev.target, async () => {
      const update = { job_title: f.job_title, start_date: f.start_date, review_notes: f.review_notes };
      if (action !== 'save') {
        Object.assign(update, { status: action, reviewed_at: new Date().toISOString(), reviewed_by: state.user.id });
      }
      if (file) await q(sb.from('employee_profiles').update(update).eq('user_id', id));
      else await q(sb.from('employee_profiles').insert({ user_id: id, ...update }));
      toast(action === 'approved' ? 'Onboarding approved.' : action === 'changes_requested' ? 'Changes requested.' : 'Saved.');
      renderRoute();
    });
  });

  on(view, '[data-file]', 'click', (ev) => {
    const c = creds.find((x) => x.id === ev.currentTarget.dataset.file);
    openSignedFile('employee-files', c.file_path, c.file_name, false);
  });

  on(view, '[data-verify]', 'click', async (ev) => {
    const verify = !!ev.currentTarget.dataset.value;
    try {
      await q(sb.from('credentials').update({
        verified_at: verify ? new Date().toISOString() : null,
        verified_by: verify ? state.user.id : null,
      }).eq('id', ev.currentTarget.dataset.verify));
      toast(verify ? 'Marked as verified.' : 'Verification removed.');
      renderRoute();
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  on(view, '#reveal', 'click', async () => {
    if (!confirm('This view of their SSN and bank details will be recorded in the access log. Continue?')) return;
    const box = view.querySelector('#sensitive');
    try {
      const [rows, log] = await Promise.all([
        q(sb.rpc('admin_reveal_sensitive', { target: id })),
        q(sb.rpc('admin_sensitive_log', { target: id })),
      ]);
      const s = rows[0] || {};
      const ssn = s.ssn ? `${s.ssn.slice(0, 3)}-${s.ssn.slice(3, 5)}-${s.ssn.slice(5)}` : '';
      box.innerHTML = `
        <div class="reveal">
          <dl class="meta">
            <dt>SSN</dt><dd class="mono">${esc(ssn || '—')}</dd>
            <dt>Bank</dt><dd>${esc(s.bank_name || '—')}</dd>
            <dt>Account holder</dt><dd>${esc(s.account_holder || '—')}</dd>
            <dt>Routing number</dt><dd class="mono">${esc(s.routing_number || '—')}</dd>
            <dt>Account number</dt><dd class="mono">${esc(s.account_number || '—')}</dd>
            <dt>Account type</dt><dd>${esc(s.account_type || '—')}</dd>
            <dt>Last updated</dt><dd>${fmtDateTime(s.updated_at)}</dd>
          </dl>
          <button class="btn btn-ghost btn-sm" id="hide">Hide</button>
        </div>
        <p class="muted small">Recent views: ${log.map((l) => `${esc(l.viewer_email)} (${fmtDateTime(l.viewed_at)})`).join(', ')}</p>`;
      on(box, '#hide', 'click', () => renderRoute());
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

// ---------------------------------------------------------------------------
// Expiring credentials
// ---------------------------------------------------------------------------

const EXPIRY_WINDOWS = { 30: 'Next 30 days', 60: 'Next 60 days', 90: 'Next 90 days', 365: 'Next 12 months', all: 'All with an expiry date' };

VIEWS.expiring = async (view) => {
  const allCompanies = isAdmin() && sessionStorage.getItem('bc.expAll') === '1';
  if (!allCompanies && needsCompany(view)) return;
  const windowKey = sessionStorage.getItem('bc.expWindow') || '90';

  let credsQuery = sb.from('credentials').select('*').not('expiry_date', 'is', null).order('expiry_date');
  let peopleQuery = sb.from('profiles').select('id, email, full_name, company_id');
  if (!allCompanies) {
    credsQuery = credsQuery.eq('company_id', state.companyId);
    peopleQuery = peopleQuery.eq('company_id', state.companyId);
  }
  if (windowKey !== 'all') {
    const until = new Date(Date.now() + Number(windowKey) * 86400000).toISOString().slice(0, 10);
    credsQuery = credsQuery.lte('expiry_date', until);
  }
  const [creds, people] = await Promise.all([q(credsQuery), q(peopleQuery)]);
  const person = (uid) => people.find((p) => p.id === uid);
  const expiredCount = creds.filter((c) => daysUntil(c.expiry_date) < 0).length;

  view.innerHTML = `
    ${pageHead('Expiring credentials', `${allCompanies ? 'All client companies' : esc(companyName(state.companyId))} · expired items are always shown.`)}
    <div class="filters">
      ${Object.entries(EXPIRY_WINDOWS).map(([k, label]) => `<button class="chip ${k === windowKey ? 'active' : ''}" data-window="${k}">${esc(label)}</button>`).join('')}
      ${isAdmin() ? `<label class="check chip-check"><input type="checkbox" id="all" ${allCompanies ? 'checked' : ''}> <span>All companies</span></label>` : ''}
    </div>
    ${expiredCount ? `<div class="notice danger"><strong>${expiredCount} expired.</strong> These people may not be allowed to work in roles that need them.</div>` : ''}
    <section class="card">
      ${creds.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Person</th>${allCompanies ? '<th>Company</th>' : ''}<th>Credential</th><th>Number</th><th>Expiry</th><th>Verified</th></tr></thead>
        <tbody>${creds.map((c) => {
          const p = person(c.user_id);
          return `<tr class="clickable" data-open="${c.user_id}" data-company="${c.company_id}">
            <td><strong>${esc(personName(p))}</strong><div class="muted small">${esc(p?.email || '')}</div></td>
            ${allCompanies ? `<td>${esc(companyName(c.company_id))}</td>` : ''}
            <td>${esc(c.name)}<div class="muted small">${esc([CRED_KINDS[c.kind], c.issuing_state].filter(Boolean).join(' · '))}</div></td>
            <td>${esc(c.number || '—')}</td>
            <td>${expiryBadge(c.expiry_date)}</td>
            <td>${c.verified_at ? badge('Verified', 'ok') : badge('Not verified', 'neutral')}</td>
          </tr>`;
        }).join('')}</tbody></table></div>` : '<p class="muted">Nothing expiring in this period. 🎉</p>'}
    </section>`;

  on(view, '[data-window]', 'click', (e) => {
    sessionStorage.setItem('bc.expWindow', e.currentTarget.dataset.window);
    renderRoute();
  });
  on(view, '#all', 'change', (e) => {
    sessionStorage.setItem('bc.expAll', e.target.checked ? '1' : '0');
    renderRoute();
  });
  on(view, '[data-open]', 'click', (e) => {
    if (isAdmin() && e.currentTarget.dataset.company !== state.companyId) {
      state.companyId = e.currentTarget.dataset.company;
      localStorage.setItem('bc.companyId', state.companyId);
      document.getElementById('company').value = state.companyId;
    }
    location.hash = `#/employees/${e.currentTarget.dataset.open}`;
  });
};

// ---------------------------------------------------------------------------
// Users and invites
// ---------------------------------------------------------------------------

// Creates a login through the invite-user Edge Function. With a password, the account
// is ready immediately and nothing is emailed; the person picks their own password on
// first sign-in.
async function addUser(body) {
  const { data, error } = await sb.functions.invoke('invite-user', {
    body: { ...body, redirect_to: location.origin + location.pathname },
  });
  if (error) {
    let message = error.message;
    try {
      const reply = await error.context.json();
      if (reply.error) message = reply.error;
    } catch {
      // Not a JSON error response; keep the original message.
    }
    if (error.name === 'FunctionsFetchError' || error.name === 'FunctionsRelayError' || /not found/i.test(message)) {
      message = 'The "invite-user" function is not set up in Supabase yet. See step 2 of "Upgrade" in the README.';
    }
    throw new Error(message);
  }
  return data;
}

// Readable temporary passwords, without look-alike characters.
function tempPassword() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const raw = [...bytes].map((b) => chars[b % chars.length]).join('');
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
}

function loginMessage({ full_name, email, password }) {
  return `Hi${full_name ? ' ' + full_name.split(' ')[0] : ''},

Your BC HR & Compliance portal account is ready.

Sign in at: https://bchrfiles.com
Email: ${email}
Temporary password: ${password}

You'll be asked to choose your own password when you first sign in.`;
}

VIEWS.users = async (view) => {
  if (needsCompany(view)) return;
  const peopleQuery = isAdmin()
    ? sb.from('profiles').select('*').order('email')
    : sb.from('profiles').select('*').eq('company_id', state.companyId).order('email');
  const [people, pending] = await Promise.all([q(peopleQuery), q(sb.from('invites').select('*').order('created_at'))]);
  const unassigned = '<option value="">— No company —</option>';
  const roleChoices = isAdmin()
    ? { employee: 'Employee', manager: 'Manager (agency management)' }
    : { employee: 'Employee' };

  view.innerHTML = `
    ${pageHead('Users', 'Create a login, then send the person their email and temporary password yourself.')}
    <section class="card">
      <h2>Add a person</h2>
      <form id="add-user" class="stack">
        <div class="row">
          <label>Email *<input name="email" type="email" required autocomplete="off"></label>
          <label>Full name *<input name="full_name" required autocomplete="off"></label>
        </div>
        <div class="row">
          <label>Role *<select name="role" required>${options(roleChoices, 'employee')}</select></label>
          ${isAdmin()
            ? `<label>Company *<select name="company_id" required>${companyOptions(state.companyId)}</select></label>`
            : `<input type="hidden" name="company_id" value="${esc(state.companyId)}">`}
          <label>Temporary password *
            <span class="input-with-button">
              <input name="password" required minlength="8" autocomplete="off" value="${tempPassword()}">
              <button type="button" class="btn btn-ghost btn-sm" id="regen">New</button>
            </span>
          </label>
        </div>
        <p class="muted small"><strong>Employees</strong> complete onboarding and see only their own file.
          <strong>Managers</strong> see their agency's employees and agency compliance.
          ${isAdmin() ? 'To make someone a BC HR admin, add them here, then change their role below.' : ''}</p>
        <button type="submit" class="btn">Create login</button>
      </form>
      <div id="created"></div>
    </section>
    ${pending.length ? `
    <section class="card">
      <h2>Waiting for a login</h2>
      <p class="muted small">These people have a role and company assigned but no login yet. Add them again above to create one.</p>
      <ul class="list">${pending.map((i) => `
        <li><span>${esc(i.full_name || '')} <span class="muted">${esc(i.email)}</span>
            ${badge(ROLE_LABEL[i.role] || 'Employee', 'neutral')}
            ${isAdmin() ? `<span class="muted small">→ ${esc(companyName(i.company_id))}</span>` : ''}</span>
          <button class="btn btn-sm btn-danger" data-cancel="${esc(i.email)}">Remove</button></li>`).join('')}</ul>
    </section>` : ''}
    <section class="card">
      <h2>People with access</h2>
      <div class="table-wrap"><table>
        <thead><tr><th>Person</th>${isAdmin() ? '<th>Company</th>' : ''}<th>Role</th></tr></thead>
        <tbody>${people.map((p) => `
          <tr>
            <td>${esc(p.full_name || '')}<div class="muted small">${esc(p.email)}</div></td>
            ${isAdmin() ? `
              <td><select data-company="${p.id}" aria-label="Company">${unassigned}${companyOptions(p.company_id)}</select></td>
              <td><select data-role="${p.id}" aria-label="Role" ${p.id === state.user.id ? 'disabled' : ''}>
                ${options(ROLE_LABEL, p.role)}</select></td>`
              : `<td>${badge(ROLE_LABEL[p.role], p.role === 'manager' ? 'info' : 'neutral')}</td>`}
          </tr>`).join('')}
        </tbody>
      </table></div>
    </section>`;

  on(view, '#regen', 'click', () => { view.querySelector('#add-user [name=password]').value = tempPassword(); });

  on(view, '#add-user', 'submit', (e) => {
    e.preventDefault();
    const f = formData(e.target);
    f.email = f.email.trim().toLowerCase();
    busy(e.target, async () => {
      const result = await addUser(f);
      const box = view.querySelector('#created');
      if (result?.existing) {
        box.innerHTML = `<div class="notice info">${esc(f.email)} already has a login. Their role and company have been updated;
          their password was not changed.</div>`;
      } else {
        box.innerHTML = `
          <div class="notice ok created">
            <strong>Login created for ${esc(f.full_name)} (${esc(ROLE_LABEL[f.role])}).</strong>
            Copy this and send it to them by text or email. The password is not shown again.
            <textarea readonly rows="9" id="message">${esc(loginMessage(f))}</textarea>
            <button type="button" class="btn btn-sm" id="copy">Copy message</button>
          </div>`;
        on(box, '#copy', 'click', async () => {
          const text = box.querySelector('#message');
          try {
            await navigator.clipboard.writeText(text.value);
          } catch {
            text.select();
            document.execCommand('copy');
          }
          toast('Copied.');
        });
      }
      e.target.reset();
      e.target.password.value = tempPassword();
      await refreshPeopleTable(view);
    });
  });

  bindPeopleTable(view);
};

// Re-render everything but keep the "login created" message on screen.
async function refreshPeopleTable(view) {
  const created = view.querySelector('#created').innerHTML;
  await VIEWS.users(view);
  const box = view.querySelector('#created');
  box.innerHTML = created;
  on(box, '#copy', 'click', async () => {
    const text = box.querySelector('#message');
    try {
      await navigator.clipboard.writeText(text.value);
    } catch {
      text.select();
      document.execCommand('copy');
    }
    toast('Copied.');
  });
}

function bindPeopleTable(view) {
  on(view, '[data-cancel]', 'click', async (e) => {
    try {
      await q(sb.from('invites').delete().eq('email', e.currentTarget.dataset.cancel));
      renderRoute();
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  on(view, '[data-company]', 'change', async (e) => {
    try {
      await q(sb.from('profiles').update({ company_id: e.target.value || null }).eq('id', e.target.dataset.company));
      toast('Company updated.');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  on(view, '[data-role]', 'change', async (e) => {
    if (e.target.value === 'admin' && !confirm('BC HR admins can see every client company, including SSNs and bank details. Continue?')) {
      renderRoute();
      return;
    }
    try {
      await q(sb.from('profiles').update({ role: e.target.value }).eq('id', e.target.dataset.role));
      toast('Role updated.');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

start();
