// Employee side of the portal: onboarding wizard, credentials, direct deposit and
// signing documents. Also the "Documents to sign" pages for managers and admins.

const US_STATES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado',
  CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky',
  LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire',
  NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota',
  OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia',
  WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};

const EDUCATION_LEVELS = [
  'Less than high school',
  'High school diploma or GED',
  'Trade or vocational certificate',
  'Some college, no degree',
  "Associate's degree",
  "Bachelor's degree",
  "Master's degree",
  'Professional degree (MD, JD, PharmD, DPT…)',
  'Doctorate (PhD, EdD…)',
];

const CRED_KINDS = {
  degree: 'Degree or diploma',
  license: 'Professional license',
  certification: 'Certification',
  id: 'Government ID',
  other: 'Other',
};

const ONBOARDING_STATUS = {
  none: ['Not started', 'neutral'],
  in_progress: ['In progress', 'info'],
  submitted: ['Awaiting review', 'warn'],
  changes_requested: ['Changes requested', 'danger'],
  approved: ['Approved', 'ok'],
};

function onboardingBadge(status) {
  const [label, kind] = ONBOARDING_STATUS[status || 'none'];
  return badge(label, kind);
}

const STEPS = [
  { id: 'personal', label: 'Personal details' },
  { id: 'education', label: 'Education' },
  { id: 'credentials', label: 'Licenses & certifications', optional: true },
  { id: 'deposit', label: 'Direct deposit & SSN' },
  { id: 'sign', label: 'Sign documents' },
  { id: 'review', label: 'Review & submit' },
];

const PERSONAL_REQUIRED = [
  'legal_first_name', 'legal_last_name', 'date_of_birth', 'phone',
  'address_line1', 'city', 'state', 'zip', 'emergency_name', 'emergency_phone',
];

const MAX_UPLOAD = 20 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

async function loadOnboarding() {
  const c = state.companyId;
  const uid = state.user.id;
  const [emp, creds, sensitive, docs, sigs, policies, acks] = await Promise.all([
    q(sb.from('employee_profiles').select('*').eq('user_id', uid).maybeSingle()),
    q(sb.from('credentials').select('*').eq('user_id', uid).order('created_at')),
    q(sb.rpc('my_sensitive_summary')),
    q(sb.from('sign_documents').select('*').eq('company_id', c).order('created_at')),
    q(sb.from('signatures').select('*').eq('user_id', uid)),
    q(sb.from('policies').select('id, title, body, created_at').eq('company_id', c).order('created_at')),
    q(sb.from('policy_acknowledgements').select('*').eq('user_id', uid)),
  ]);
  state.emp = emp;
  return { emp, creds, sensitive: sensitive[0] || null, docs, sigs, policies, acks };
}

function stepStatus(d) {
  const e = d.emp || {};
  const unsignedDocs = d.docs.filter((x) => x.required_for_onboarding && !d.sigs.some((s) => s.document_id === x.id));
  const unackedPolicies = d.policies.filter((p) => !d.acks.some((a) => a.policy_id === p.id));
  const st = {
    personal: PERSONAL_REQUIRED.every((k) => e[k]),
    education: !!e.education_level,
    credentials: d.creds.some((c) => c.kind !== 'degree'),
    deposit: !!(e.ssn_on_file && e.bank_on_file),
    sign: !unsignedDocs.length && !unackedPolicies.length,
    review: ['submitted', 'approved'].includes(e.status),
    unsignedDocs,
    unackedPolicies,
  };
  st.ready = st.personal && st.education && st.deposit && st.sign;
  return st;
}

// ---------------------------------------------------------------------------
// Employee dashboard
// ---------------------------------------------------------------------------

async function employeeDashboard(view) {
  const d = await loadOnboarding();
  const st = stepStatus(d);
  const required = ['personal', 'education', 'deposit', 'sign'];
  const done = required.filter((k) => st[k]).length;
  const status = d.emp?.status;
  const expiring = d.creds
    .filter((c) => c.expiry_date && daysUntil(c.expiry_date) <= 90)
    .sort((a, b) => a.expiry_date.localeCompare(b.expiry_date));
  const toSign = st.unsignedDocs.length + st.unackedPolicies.length;
  const name = d.emp?.preferred_name || d.emp?.legal_first_name || (state.profile.full_name || '').split(' ')[0];

  view.innerHTML = `
    ${pageHead(`Welcome${name ? ', ' + name : ''}`, esc(companyName(state.companyId)))}
    <section class="card onboarding-card">
      <div>
        <h2>Your onboarding ${onboardingBadge(status)}</h2>
        ${status === 'approved' ? '<p class="muted">You are all set. Keep your licenses and certifications up to date.</p>'
          : status === 'submitted' ? '<p class="muted">Submitted. Your manager or BC HR will review it shortly.</p>'
          : status === 'changes_requested' ? `<p>Changes were requested: <em>${esc(d.emp.review_notes || '')}</em></p>`
          : `<p class="muted">${done} of ${required.length} required steps complete.</p>`}
        <div class="progress"><span style="width:${Math.round((done / required.length) * 100)}%"></span></div>
      </div>
      <a class="btn" href="#/onboarding">${['submitted', 'approved'].includes(status) ? 'View my onboarding' : 'Continue onboarding'}</a>
    </section>
    <div class="stats">
      ${stat('Documents to sign', toSign, '#/sign', toSign ? 'warn' : '')}
      ${stat('Credentials on file', d.creds.length, '#/credentials')}
      ${stat('Expiring within 90 days', expiring.length, '#/credentials', expiring.length ? 'danger' : '')}
    </div>
    ${expiring.length ? `
    <section class="card">
      <h2>Renew soon</h2>
      <ul class="list">${expiring.map((c) => `<li><span><strong>${esc(c.name)}</strong> <span class="muted small">${esc(CRED_KINDS[c.kind])}</span></span>${expiryBadge(c.expiry_date)}</li>`).join('')}</ul>
      <a href="#/credentials">Upload a renewal →</a>
    </section>` : ''}`;
}

// ---------------------------------------------------------------------------
// Onboarding wizard
// ---------------------------------------------------------------------------

VIEWS.onboarding = async (view, step) => {
  const d = await loadOnboarding();
  const st = stepStatus(d);
  if (!STEPS.some((s) => s.id === step)) {
    step = st.review ? 'review' : (STEPS.find((s) => !s.optional && !st[s.id])?.id || 'review');
  }

  view.innerHTML = `
    ${pageHead('My onboarding', `Welcome to ${esc(companyName(state.companyId))}. Your progress saves as you go.`)}
    ${statusNotice(d.emp)}
    <div class="onboarding">
      <ol class="stepper">${STEPS.map((s, i) => `
        <li class="${s.id === step ? 'current' : ''} ${st[s.id] ? 'done' : ''}">
          <a href="#/onboarding/${s.id}"><span class="dot">${st[s.id] ? '✓' : i + 1}</span>
            <span>${esc(s.label)}${s.optional ? ' <span class="opt">optional</span>' : ''}</span></a>
        </li>`).join('')}
      </ol>
      <div id="step"></div>
    </div>`;

  STEP_VIEWS[step](view.querySelector('#step'), d, st);
};

function statusNotice(emp) {
  if (emp?.status === 'changes_requested') {
    return `<div class="notice danger"><strong>Changes requested:</strong> ${esc(emp.review_notes || 'Please review your details.')}
      Update the steps below, then submit again.</div>`;
  }
  if (emp?.status === 'submitted') {
    return `<div class="notice info">Submitted on ${fmtDate(emp.submitted_at)}. You can still update your details while it is being reviewed.</div>`;
  }
  if (emp?.status === 'approved') {
    return '<div class="notice ok">Your onboarding has been approved. You can still update your details at any time.</div>';
  }
  return '';
}

function goStep(id) {
  location.hash = `#/onboarding/${id}`;
}

function nextStep(id) {
  return STEPS[STEPS.findIndex((s) => s.id === id) + 1]?.id || 'review';
}

function prevStep(id) {
  return STEPS[STEPS.findIndex((s) => s.id === id) - 1]?.id;
}

function stepActions(id, { continueLabel = 'Save & continue', submit = true, disabled = false } = {}) {
  const prev = prevStep(id);
  return `<div class="step-actions">
    ${prev ? `<a class="btn btn-ghost" href="#/onboarding/${prev}">← Back</a>` : '<span></span>'}
    <button ${submit ? 'type="submit"' : 'type="button" data-next'} class="btn" ${disabled ? 'disabled' : ''}>${esc(continueLabel)}</button>
  </div>`;
}

function input(label, name, value, attrs = '') {
  return `<label>${label}<input name="${name}" value="${esc(value)}" ${attrs}></label>`;
}

function stateSelect(name, value, required = true) {
  return `<select name="${name}" ${required ? 'required' : ''}>
    <option value="">${required ? 'Choose…' : '—'}</option>
    ${Object.entries(US_STATES).map(([code, label]) => `<option value="${code}"${code === value ? ' selected' : ''}>${esc(label)}</option>`).join('')}
  </select>`;
}

async function saveEmp(fields) {
  state.emp = await q(sb.from('employee_profiles').upsert({ user_id: state.user.id, ...nullify(fields) }).select().single());
}

const STEP_VIEWS = {};

STEP_VIEWS.personal = (el, d) => {
  const e = d.emp || {};
  const adult = new Date();
  adult.setFullYear(adult.getFullYear() - 14);
  el.innerHTML = `
    <form id="personal" class="card stack">
      <h2>Personal details</h2>
      <p class="muted small">Use your legal name exactly as it appears on your government ID.</p>
      <div class="row">
        ${input('Legal first name *', 'legal_first_name', e.legal_first_name, 'required autocomplete="given-name"')}
        ${input('Middle name', 'legal_middle_name', e.legal_middle_name, 'autocomplete="additional-name"')}
        ${input('Legal last name *', 'legal_last_name', e.legal_last_name, 'required autocomplete="family-name"')}
      </div>
      <div class="row">
        ${input('Preferred name', 'preferred_name', e.preferred_name, 'placeholder="If different"')}
        ${input('Date of birth *', 'date_of_birth', e.date_of_birth, `type="date" required max="${adult.toISOString().slice(0, 10)}" autocomplete="bday"`)}
        ${input('Phone *', 'phone', e.phone, 'type="tel" required autocomplete="tel" placeholder="(555) 555-5555"')}
      </div>
      <h3>Home address</h3>
      ${input('Street address *', 'address_line1', e.address_line1, 'required autocomplete="address-line1"')}
      ${input('Apartment, suite, etc.', 'address_line2', e.address_line2, 'autocomplete="address-line2"')}
      <div class="row">
        ${input('City *', 'city', e.city, 'required autocomplete="address-level2"')}
        <label>State *${stateSelect('state', e.state)}</label>
        ${input('ZIP code *', 'zip', e.zip, 'required pattern="\\d{5}(-\\d{4})?" inputmode="numeric" autocomplete="postal-code" title="5-digit ZIP code"')}
      </div>
      <h3>Emergency contact</h3>
      <div class="row">
        ${input('Name *', 'emergency_name', e.emergency_name, 'required')}
        ${input('Relationship', 'emergency_relationship', e.emergency_relationship, 'placeholder="e.g. Spouse, Parent"')}
        ${input('Phone *', 'emergency_phone', e.emergency_phone, 'type="tel" required')}
      </div>
      ${stepActions('personal')}
    </form>`;

  on(el, '#personal', 'submit', (ev) => {
    ev.preventDefault();
    busy(ev.target, async () => {
      await saveEmp(formData(ev.target));
      toast('Saved.');
      goStep('education');
    });
  });
};

STEP_VIEWS.education = (el, d) => {
  const e = d.emp || {};
  const year = new Date().getFullYear();
  el.innerHTML = `
    <form id="education" class="card stack">
      <h2>Education</h2>
      <label>Highest level of education completed *
        <select name="education_level" required>
          <option value="">Choose…</option>
          ${EDUCATION_LEVELS.map((l) => `<option${l === e.education_level ? ' selected' : ''}>${esc(l)}</option>`).join('')}
        </select>
      </label>
      <div class="row">
        ${input('School or institution', 'school_name', e.school_name)}
        ${input('Field of study', 'field_of_study', e.field_of_study, 'placeholder="e.g. Nursing"')}
        ${input('Year completed', 'graduation_year', e.graduation_year, `type="number" min="1940" max="${year + 6}"`)}
      </div>
      ${stepActions('education')}
    </form>
    <section class="card">
      <h2>Diplomas &amp; degrees</h2>
      <p class="muted small">Upload a copy of your diploma, degree or transcript if your role requires it.</p>
      <div id="degrees"></div>
    </section>`;

  credentialManager(el.querySelector('#degrees'), d.creds, {
    kinds: ['degree'], addLabel: '+ Upload a diploma or degree', onChange: renderRoute,
  });

  on(el, '#education', 'submit', (ev) => {
    ev.preventDefault();
    busy(ev.target, async () => {
      await saveEmp(formData(ev.target));
      toast('Saved.');
      goStep('credentials');
    });
  });
};

STEP_VIEWS.credentials = (el, d) => {
  el.innerHTML = `
    <section class="card">
      <h2>Licenses &amp; certifications</h2>
      <p class="muted small">Add each professional license, certification (CPR, BLS…) or ID your role requires, with its expiry date.
        We'll track the dates and remind you before anything expires. Skip this step if none apply.</p>
      <div id="creds"></div>
    </section>
    <form id="cont">${stepActions('credentials', { continueLabel: 'Continue', submit: true })}</form>`;

  credentialManager(el.querySelector('#creds'), d.creds, {
    kinds: ['license', 'certification', 'id', 'other'], addLabel: '+ Add a license or certification', onChange: renderRoute,
  });
  on(el, '#cont', 'submit', (ev) => { ev.preventDefault(); goStep('deposit'); });
};

STEP_VIEWS.deposit = (el, d, st) => {
  const e = d.emp || {};
  const s = d.sensitive || {};
  el.innerHTML = `
    <div class="notice info">🔒 These details are encrypted. Only BC HR &amp; Compliance payroll admins can see the full numbers,
      and every view is logged. Your manager only sees that they are on file.</div>
    <section class="card">
      <h2>Direct deposit</h2>
      ${e.bank_on_file ? `
        <dl class="meta">
          <dt>Bank</dt><dd>${esc(s.bank_name)}</dd>
          <dt>Account holder</dt><dd>${esc(s.account_holder)}</dd>
          <dt>Routing number</dt><dd>${esc(s.routing_number)}</dd>
          <dt>Account</dt><dd>${esc(s.account_type === 'savings' ? 'Savings' : 'Checking')} ending in ${esc(s.account_last4)}</dd>
        </dl>
        <button class="btn btn-ghost btn-sm" data-show="bank">Change bank details</button>` : ''}
      <form id="bank" class="stack" ${e.bank_on_file ? 'hidden' : ''}>
        <div class="row">
          ${input('Bank name *', 'bank_name', '', 'required placeholder="e.g. Chase"')}
          ${input('Name on the account *', 'account_holder', '', 'required autocomplete="name"')}
        </div>
        <div class="row">
          ${input('Routing number (9 digits) *', 'routing_number', '', 'required inputmode="numeric" pattern="\\d{9}" maxlength="9" autocomplete="off"')}
          <label>Account type *<select name="account_type" required>
            <option value="checking">Checking</option><option value="savings">Savings</option>
          </select></label>
        </div>
        <div class="row">
          ${input('Account number *', 'account_number', '', 'required inputmode="numeric" pattern="\\d{4,17}" maxlength="17" autocomplete="off"')}
          ${input('Confirm account number *', 'account_confirm', '', 'required inputmode="numeric" maxlength="17" autocomplete="off"')}
        </div>
        <p class="muted small">Find these at the bottom of a check, or in your bank's app under account details.</p>
        <button type="submit" class="btn">Save bank details</button>
      </form>
    </section>
    <section class="card">
      <h2>Social Security number</h2>
      ${e.ssn_on_file ? `
        <p>On file: <strong>•••-••-${esc(s.ssn_last4)}</strong></p>
        <button class="btn btn-ghost btn-sm" data-show="ssn">Change SSN</button>` : ''}
      <form id="ssn" class="stack" ${e.ssn_on_file ? 'hidden' : ''}>
        <p class="muted small">Required for payroll and tax reporting (Form W-2).</p>
        <div class="row">
          ${input('SSN *', 'ssn', '', 'type="password" required inputmode="numeric" pattern="\\d{3}-?\\d{2}-?\\d{4}" maxlength="11" autocomplete="off" placeholder="123-45-6789"')}
          ${input('Confirm SSN *', 'ssn_confirm', '', 'type="password" required inputmode="numeric" maxlength="11" autocomplete="off"')}
        </div>
        <button type="submit" class="btn">Save SSN</button>
      </form>
    </section>
    <form id="cont">${stepActions('deposit', { continueLabel: 'Continue', disabled: !st.deposit })}</form>`;

  on(el, '[data-show]', 'click', (ev) => {
    el.querySelector(`#${ev.currentTarget.dataset.show}`).hidden = false;
    ev.currentTarget.hidden = true;
  });

  on(el, '#bank', 'submit', (ev) => {
    ev.preventDefault();
    const f = formData(ev.target);
    if (f.account_number !== f.account_confirm) return toast('The account numbers do not match.', 'error');
    if (!validRouting(f.routing_number)) return toast('That routing number is not valid. Please check it.', 'error');
    busy(ev.target, async () => {
      await q(sb.rpc('save_my_bank', {
        bank_name: f.bank_name, account_holder: f.account_holder, routing_number: f.routing_number,
        account_number: f.account_number, account_type: f.account_type,
      }));
      toast('Bank details saved securely.');
      renderRoute();
    });
  });

  on(el, '#ssn', 'submit', (ev) => {
    ev.preventDefault();
    const f = formData(ev.target);
    if (f.ssn.replace(/\D/g, '') !== f.ssn_confirm.replace(/\D/g, '')) return toast('The SSNs do not match.', 'error');
    busy(ev.target, async () => {
      await q(sb.rpc('save_my_ssn', { ssn: f.ssn }));
      toast('SSN saved securely.');
      renderRoute();
    });
  });

  on(el, '#cont', 'submit', (ev) => { ev.preventDefault(); goStep('sign'); });
};

// ABA routing number checksum, so typos are caught before saving.
function validRouting(value) {
  if (!/^\d{9}$/.test(value)) return false;
  const n = [...value].map(Number);
  return (3 * (n[0] + n[3] + n[6]) + 7 * (n[1] + n[4] + n[7]) + (n[2] + n[5] + n[8])) % 10 === 0;
}

STEP_VIEWS.sign = (el, d, st) => {
  el.innerHTML = `<div id="signables"></div>
    <form id="cont">${stepActions('sign', { continueLabel: 'Continue', disabled: !st.sign })}</form>`;
  renderSignables(el.querySelector('#signables'), d, renderRoute);
  on(el, '#cont', 'submit', (ev) => { ev.preventDefault(); goStep('review'); });
};

STEP_VIEWS.review = (el, d, st) => {
  const e = d.emp || {};
  const row = (id, label, detail) => `
    <li><span>${st[id] ? '✅' : '⬜️'} <strong>${esc(label)}</strong> <span class="muted small">${detail}</span></span>
      <a href="#/onboarding/${id}">${st[id] ? 'Edit' : 'Complete'}</a></li>`;
  const canSubmit = st.ready && ['in_progress', 'changes_requested'].includes(e.status || 'in_progress');

  el.innerHTML = `
    <section class="card">
      <h2>Review &amp; submit</h2>
      <ul class="list">
        ${row('personal', 'Personal details', esc([e.legal_first_name, e.legal_last_name].filter(Boolean).join(' ')))}
        ${row('education', 'Education', esc(e.education_level || ''))}
        <li><span>${d.creds.length ? '✅' : '➖'} <strong>Licenses &amp; certifications</strong>
          <span class="muted small">${d.creds.length} on file</span></span><a href="#/onboarding/credentials">Edit</a></li>
        ${row('deposit', 'Direct deposit & SSN', e.bank_on_file && e.ssn_on_file ? 'On file' : 'Missing')}
        ${row('sign', 'Documents & policies', st.sign ? 'All signed' : `${st.unsignedDocs.length + st.unackedPolicies.length} still to sign`)}
      </ul>
    </section>
    ${['submitted', 'approved'].includes(e.status) ? `
      <section class="card">${onboardingBadge(e.status)}
        <p>${e.status === 'approved' ? 'Your onboarding is complete.' : `Submitted ${fmtDate(e.submitted_at)}. We'll let you know if anything else is needed.`}</p>
      </section>` : `
      <section class="card stack">
        <p>By submitting, you confirm the information you provided is true and complete to the best of your knowledge.</p>
        <button class="btn" id="submit" ${canSubmit ? '' : 'disabled'}>Submit my onboarding</button>
        ${canSubmit ? '' : '<p class="muted small">Complete the steps marked ⬜️ first.</p>'}
      </section>`}`;

  on(el, '#submit', 'click', async (ev) => {
    ev.currentTarget.disabled = true;
    try {
      state.emp = await q(sb.from('employee_profiles').update({ status: 'submitted' }).eq('user_id', state.user.id).select().single());
      toast('Onboarding submitted. Thank you!');
      renderRoute();
    } catch (err) {
      toast(err.message, 'error');
      ev.currentTarget.disabled = false;
    }
  });
};

// ---------------------------------------------------------------------------
// Credentials (used in onboarding and on "My licenses & credentials")
// ---------------------------------------------------------------------------

VIEWS.credentials = async (view) => {
  const creds = await q(sb.from('credentials').select('*').eq('user_id', state.user.id).order('expiry_date', { nullsFirst: false }));
  view.innerHTML = `
    ${pageHead('My licenses & credentials', 'Keep these current. When you renew something, click Update and upload the new copy.')}
    <section class="card"><div id="creds"></div></section>`;
  credentialManager(view.querySelector('#creds'), creds, {
    kinds: Object.keys(CRED_KINDS), addLabel: '+ Add a credential', onChange: renderRoute,
  });
};

function credentialManager(el, allCreds, { kinds, addLabel, onChange }) {
  const creds = allCreds.filter((c) => kinds.includes(c.kind));

  el.innerHTML = `
    ${creds.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Credential</th><th>Number</th><th>Expiry</th><th>Status</th><th></th></tr></thead>
      <tbody>${creds.map((c) => `
        <tr>
          <td><strong>${esc(c.name)}</strong>
            <div class="muted small">${esc([CRED_KINDS[c.kind], c.issuer, c.issuing_state].filter(Boolean).join(' · '))}</div></td>
          <td>${esc(c.number || '—')}</td>
          <td>${expiryBadge(c.expiry_date)}</td>
          <td>${c.verified_at ? badge('Verified', 'ok') : badge('Pending review', 'neutral')}</td>
          <td class="actions">
            ${c.file_path ? `<button class="btn btn-sm btn-ghost" data-file="${c.id}">View</button>` : badge('No file', 'warn')}
            <button class="btn btn-sm btn-ghost" data-edit="${c.id}">Update</button>
            <button class="btn btn-sm btn-danger" data-remove="${c.id}">Remove</button>
          </td>
        </tr>`).join('')}
      </tbody></table></div>` : '<p class="muted">None added yet.</p>'}
    <details class="cred-form" ${creds.length ? '' : 'open'}>
      <summary class="btn btn-ghost">${esc(addLabel)}</summary>
      <div class="cred-form-body">${credentialForm(null, kinds)}</div>
    </details>`;

  const byId = (id) => creds.find((c) => c.id === id);
  const bindForm = (existing) => {
    on(el, 'form[data-cred]', 'submit', (ev) => {
      ev.preventDefault();
      busy(ev.target, async () => {
        await saveCredential(ev.target, existing);
        toast(existing ? 'Credential updated.' : 'Credential added.');
        onChange();
      });
    });
  };
  bindForm(null);

  on(el, '[data-edit]', 'click', (ev) => {
    const c = byId(ev.currentTarget.dataset.edit);
    const details = el.querySelector('.cred-form');
    details.querySelector('summary').textContent = `Update ${c.name}`;
    details.querySelector('.cred-form-body').innerHTML = credentialForm(c, kinds);
    details.open = true;
    bindForm(c);
    details.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  on(el, '[data-file]', 'click', (ev) => {
    const c = byId(ev.currentTarget.dataset.file);
    openSignedFile('employee-files', c.file_path, c.file_name, false);
  });

  on(el, '[data-remove]', 'click', async (ev) => {
    const c = byId(ev.currentTarget.dataset.remove);
    if (!confirm(`Remove "${c.name}"?`)) return;
    try {
      if (c.file_path) await q(sb.storage.from('employee-files').remove([c.file_path]));
      await q(sb.from('credentials').delete().eq('id', c.id));
      toast('Removed.');
      onChange();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

function credentialForm(c, kinds) {
  const v = c || {};
  const kindField = kinds.length === 1
    ? `<input type="hidden" name="kind" value="${kinds[0]}">`
    : `<label>Type *<select name="kind" required>${kinds.map((k) => `<option value="${k}"${k === v.kind ? ' selected' : ''}>${esc(CRED_KINDS[k])}</option>`).join('')}</select></label>`;
  const isDegree = kinds.length === 1 && kinds[0] === 'degree';
  return `
    <form class="stack" data-cred>
      ${kindField}
      <div class="row">
        ${input('Name *', 'name', v.name, `required placeholder="${isDegree ? "e.g. Bachelor of Science in Nursing" : 'e.g. Registered Nurse (RN), BLS'}"`)}
        ${input(isDegree ? 'School' : 'Issued by', 'issuer', v.issuer, `placeholder="${isDegree ? '' : 'e.g. Texas Board of Nursing'}"`)}
      </div>
      ${isDegree ? '' : `
      <div class="row">
        ${input('License / certificate number', 'number', v.number)}
        <label>Issuing state${stateSelect('issuing_state', v.issuing_state, false)}</label>
      </div>`}
      <div class="row">
        ${input(isDegree ? 'Date awarded' : 'Issue date', 'issue_date', v.issue_date, 'type="date"')}
        ${isDegree ? '' : input('Expiry date', 'expiry_date', v.expiry_date, 'type="date"')}
      </div>
      ${isDegree ? '' : '<p class="muted small">Leave the expiry date blank if it never expires.</p>'}
      <label>${c?.file_path ? `Replace file (current: ${esc(c.file_name)})` : 'Upload a copy (PDF or photo)'}
        <input type="file" name="file" accept="application/pdf,image/*" ${c ? '' : 'required'}></label>
      <button type="submit" class="btn">${c ? 'Save changes' : 'Add'}</button>
    </form>`;
}

async function saveCredential(form, existing) {
  const f = formData(form);
  const file = form.file.files[0];
  const row = nullify({
    kind: f.kind, name: f.name, issuer: f.issuer, number: f.number,
    issuing_state: f.issuing_state, issue_date: f.issue_date, expiry_date: f.expiry_date,
  });
  let uploaded = null;
  if (file) {
    if (file.size > MAX_UPLOAD) throw new Error('Files must be smaller than 20 MB.');
    uploaded = `${state.companyId}/${state.user.id}/${crypto.randomUUID()}-${safeName(file.name)}`;
    await q(sb.storage.from('employee-files').upload(uploaded, file));
    row.file_path = uploaded;
    row.file_name = file.name;
  }
  try {
    if (existing) await q(sb.from('credentials').update(row).eq('id', existing.id));
    else await q(sb.from('credentials').insert({ user_id: state.user.id, ...row }));
  } catch (err) {
    if (uploaded) await sb.storage.from('employee-files').remove([uploaded]);
    throw err;
  }
  if (uploaded && existing?.file_path) await sb.storage.from('employee-files').remove([existing.file_path]);
}

// ---------------------------------------------------------------------------
// Signing documents and acknowledging policies
// ---------------------------------------------------------------------------

function renderSignables(el, d, onChange) {
  const sigFor = (id) => d.sigs.find((s) => s.document_id === id);
  const legalName = [d.emp?.legal_first_name, d.emp?.legal_middle_name, d.emp?.legal_last_name].filter(Boolean).join(' ');

  el.innerHTML = `
    <section class="card">
      <h2>Documents to sign</h2>
      ${d.docs.length ? d.docs.map((doc) => {
        const sig = sigFor(doc.id);
        return `
        <article class="sign-card">
          <div class="sign-head">
            <div><h3>${esc(doc.title)}</h3>${doc.description ? `<p class="muted">${esc(doc.description)}</p>` : ''}</div>
            ${sig ? badge('Signed', 'ok') : doc.required_for_onboarding ? badge('Required', 'warn') : badge('Optional', 'neutral')}
          </div>
          <button class="btn btn-ghost btn-sm" data-open-doc="${doc.id}">📄 Open ${esc(doc.file_name)}</button>
          ${sig ? `<p class="signed">✓ Signed as <em>${esc(sig.typed_name)}</em> on ${fmtDateTime(sig.signed_at)}</p>` : `
          <form class="stack sign-form" data-sign="${doc.id}">
            ${input('Type your full legal name to sign *', 'typed_name', legalName, 'required minlength="2" autocomplete="name"')}
            <label class="check"><input type="checkbox" name="agree" required>
              <span>I have read this document and agree that typing my name above is my legal electronic signature.</span></label>
            <button type="submit" class="btn" disabled>Sign document</button>
            <p class="muted small hint">Open the document first.</p>
          </form>`}
        </article>`;
      }).join('') : '<p class="muted">There are no documents for you to sign right now.</p>'}
    </section>
    <section class="card">
      <h2>Policies to acknowledge</h2>
      ${d.policies.length ? d.policies.map((p) => {
        const ack = d.acks.find((a) => a.policy_id === p.id);
        return `
        <details class="policy-item">
          <summary><span>${esc(p.title)}</span>${ack ? badge('Acknowledged', 'ok') : badge('Read & acknowledge', 'warn')}</summary>
          <div class="policy-body">${esc(p.body)}</div>
          ${ack ? `<p class="signed">✓ Acknowledged ${fmtDate(ack.acknowledged_at)}</p>`
            : `<button class="btn" data-ack="${p.id}">I have read and acknowledge this policy</button>`}
        </details>`;
      }).join('') : '<p class="muted">No policies to acknowledge.</p>'}
    </section>`;

  on(el, '[data-open-doc]', 'click', (ev) => {
    const doc = d.docs.find((x) => x.id === ev.currentTarget.dataset.openDoc);
    openSignedFile('documents', doc.file_path, doc.file_name, false);
    const form = el.querySelector(`form[data-sign="${doc.id}"]`);
    if (form) {
      form.querySelector('button[type="submit"]').disabled = false;
      form.querySelector('.hint').hidden = true;
    }
  });

  on(el, 'form[data-sign]', 'submit', (ev) => {
    ev.preventDefault();
    const doc = d.docs.find((x) => x.id === ev.target.dataset.sign);
    const { typed_name } = formData(ev.target);
    busy(ev.target, async () => {
      await q(sb.from('signatures').insert({
        document_id: doc.id,
        user_id: state.user.id,
        typed_name: typed_name.trim(),
        document_sha256: await fileHash('documents', doc.file_path),
        user_agent: navigator.userAgent.slice(0, 300),
      }));
      toast(`Signed: ${doc.title}`);
      onChange();
    });
  });

  on(el, '[data-ack]', 'click', async (ev) => {
    ev.currentTarget.disabled = true;
    try {
      await q(sb.from('policy_acknowledgements').insert({ policy_id: ev.currentTarget.dataset.ack, user_id: state.user.id }));
      toast('Acknowledged.');
      onChange();
    } catch (err) {
      toast(err.message, 'error');
      ev.currentTarget.disabled = false;
    }
  });
}

// SHA-256 of the exact file that was signed, kept as evidence of what the person agreed to.
async function fileHash(bucket, path) {
  const { signedUrl } = await q(sb.storage.from(bucket).createSignedUrl(path, 60));
  const res = await fetch(signedUrl);
  if (!res.ok) throw new Error('Could not load the document to sign. Please try again.');
  const digest = await crypto.subtle.digest('SHA-256', await res.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------
// Documents to sign: employee view, and management for admins and managers
// ---------------------------------------------------------------------------

VIEWS.sign = async (view, id) => {
  if (isEmployee()) {
    const d = await loadOnboarding();
    view.innerHTML = `${pageHead('Documents to sign', 'Offer letters, agreements, tax forms and policies that need your signature.')}<div id="signables"></div>`;
    renderSignables(view.querySelector('#signables'), d, renderRoute);
    return;
  }
  if (needsCompany(view)) return;
  if (id) return signDocDetail(view, id);

  const c = state.companyId;
  const [docs, employees] = await Promise.all([
    q(sb.from('sign_documents').select('*').eq('company_id', c).order('created_at', { ascending: false })),
    q(sb.from('profiles').select('id').eq('company_id', c).eq('role', 'employee')),
  ]);
  const sigs = docs.length ? await q(sb.from('signatures').select('document_id').in('document_id', docs.map((x) => x.id))) : [];
  const signedCount = (docId) => sigs.filter((s) => s.document_id === docId).length;

  view.innerHTML = `
    ${pageHead('Documents to sign', `PDFs that employees at ${esc(companyName(c))} sign inside the portal.`)}
    <details class="card">
      <summary class="btn">+ Add a document</summary>
      <form id="new-doc" class="stack">
        <div class="row">
          <label>Title *<input name="title" required placeholder="e.g. Offer letter, Form W-4, Confidentiality agreement"></label>
          <label>PDF file *<input type="file" name="file" accept="application/pdf" required></label>
        </div>
        <label>Instructions for the employee<textarea name="description" rows="2"></textarea></label>
        <label class="check"><input type="checkbox" name="required" checked> <span>Required to complete onboarding</span></label>
        <button type="submit" class="btn">Add document</button>
      </form>
    </details>
    <section class="card">
      ${docs.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Document</th><th>Required</th><th>Signed</th><th>Added</th></tr></thead>
        <tbody>${docs.map((x) => `
          <tr class="clickable" data-open="${x.id}">
            <td><strong>${esc(x.title)}</strong><div class="muted small">${esc(x.file_name)}</div></td>
            <td>${x.required_for_onboarding ? badge('Required', 'warn') : badge('Optional', 'neutral')}</td>
            <td>${badge(`${signedCount(x.id)} of ${employees.length}`, signedCount(x.id) >= employees.length && employees.length ? 'ok' : 'neutral')}</td>
            <td class="muted">${fmtDate(x.created_at)}</td>
          </tr>`).join('')}
        </tbody></table></div>` : '<p class="muted">No documents yet. Add an offer letter, W-4, I-9 or any agreement as a PDF.</p>'}
    </section>`;

  on(view, '#new-doc', 'submit', (ev) => {
    ev.preventDefault();
    const f = formData(ev.target);
    const file = ev.target.file.files[0];
    busy(ev.target, async () => {
      if (file.type !== 'application/pdf') throw new Error('Please upload a PDF.');
      if (file.size > MAX_UPLOAD) throw new Error('Files must be smaller than 20 MB.');
      const path = `${c}/sign/${crypto.randomUUID()}-${safeName(file.name)}`;
      await q(sb.storage.from('documents').upload(path, file, { contentType: 'application/pdf' }));
      const { error } = await sb.from('sign_documents').insert({
        company_id: c, title: f.title, description: f.description || null,
        file_path: path, file_name: file.name, required_for_onboarding: !!f.required,
      });
      if (error) {
        await sb.storage.from('documents').remove([path]);
        throw error;
      }
      toast('Document added. Employees will see it on their sign page.');
      renderRoute();
    });
  });
  on(view, '[data-open]', 'click', (ev) => { location.hash = `#/sign/${ev.currentTarget.dataset.open}`; });
};

async function signDocDetail(view, id) {
  const doc = await q(sb.from('sign_documents').select('*').eq('id', id).single());
  const [employees, sigs] = await Promise.all([
    q(sb.from('profiles').select('id, email, full_name').eq('company_id', doc.company_id).eq('role', 'employee').order('full_name')),
    q(sb.from('signatures').select('*').eq('document_id', id)),
  ]);

  view.innerHTML = `
    <a href="#/sign" class="back">← All documents</a>
    ${pageHead(doc.title, `${doc.required_for_onboarding ? 'Required for onboarding' : 'Optional'} · added ${fmtDate(doc.created_at)}`)}
    <section class="card">
      <button class="btn btn-ghost btn-sm" id="open">📄 Open ${esc(doc.file_name)}</button>
      ${doc.description ? `<p class="muted">${esc(doc.description)}</p>` : ''}
    </section>
    <section class="card">
      <h2>Signatures</h2>
      ${employees.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Employee</th><th>Status</th><th>Signed as</th><th>Document fingerprint</th></tr></thead>
        <tbody>${employees.map((p) => {
          const s = sigs.find((x) => x.user_id === p.id);
          return `<tr>
            <td>${esc(personName(p))}<div class="muted small">${esc(p.email)}</div></td>
            <td>${s ? badge(`Signed ${fmtDateTime(s.signed_at)}`, 'ok') : badge('Not signed', 'warn')}</td>
            <td>${s ? `<em>${esc(s.typed_name)}</em>` : ''}</td>
            <td class="mono small" title="SHA-256 of the PDF that was signed">${s ? esc(s.document_sha256.slice(0, 16)) + '…' : ''}</td>
          </tr>`;
        }).join('')}</tbody></table></div>` : '<p class="muted">No employees at this company yet.</p>'}
      <button class="btn btn-danger btn-sm" id="delete">Delete document</button>
    </section>`;

  on(view, '#open', 'click', () => openSignedFile('documents', doc.file_path, doc.file_name, false));
  on(view, '#delete', 'click', async () => {
    if (!confirm(`Delete "${doc.title}" and all ${sigs.length} signature records? This cannot be undone.`)) return;
    try {
      await q(sb.from('sign_documents').delete().eq('id', id));
      await sb.storage.from('documents').remove([doc.file_path]);
      toast('Document deleted.');
      location.hash = '#/sign';
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}
