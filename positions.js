// Positions (job descriptions), job description sign-off with supervisor countersignature,
// the background check (employee books it) and drug screening (staff perform and record it).

const SCREEN_TYPES = {
  pre_employment: 'Pre-employment',
  random: 'Random',
  reasonable_suspicion: 'Reasonable suspicion',
  post_incident: 'Post-incident',
  return_to_duty: 'Return to duty',
};
const SCREEN_RESULTS = {
  pending: 'Pending',
  negative: 'Negative',
  positive: 'Positive',
  dilute: 'Dilute (retest)',
  refused: 'Refused',
  cancelled: 'Cancelled',
};
const screenBadge = (r) => badge(SCREEN_RESULTS[r], { pending: 'warn', negative: 'ok', positive: 'danger', dilute: 'warn', refused: 'danger', cancelled: 'neutral' }[r]);

const currentCompany = () => state.companies.find((c) => c.id === state.companyId) || {};

// The job description itself, from a position row or the snapshot kept with a signature.
function jobDescriptionHtml(p) {
  const rows = [
    ['Position', p.title], ['Regulation', p.regulation], ['Reports to', p.reports_to],
    ['Supervises', p.supervises], ['Status', p.employment_status],
  ].filter(([, v]) => v);
  return `
    <table class="jd-table"><tbody>${rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</tbody></table>
    ${p.summary ? `<h3>Position summary</h3><p>${esc(p.summary)}</p>` : ''}
    ${p.description ? `<div class="policy-body jd-body">${esc(p.description)}</div>` : ''}`;
}

// ---------------------------------------------------------------------------
// Staff: positions for the selected agency
// ---------------------------------------------------------------------------

VIEWS.positions = async (view, id) => {
  if (needsCompany(view)) return;
  if (id) return positionDetail(view, id);
  const c = state.companyId;
  const [positions, files, acks] = await Promise.all([
    q(sb.from('positions').select('*').eq('company_id', c).order('title')),
    q(sb.from('employee_profiles').select('user_id, position_id').eq('company_id', c)),
    q(sb.from('position_acknowledgements').select('position_id, countersigned_at').eq('company_id', c)),
  ]);
  const assigned = (pid) => files.filter((f) => f.position_id === pid).length;
  const signed = (pid) => acks.filter((a) => a.position_id === pid).length;

  view.innerHTML = `
    ${pageHead('Positions', `${esc(companyName(c))} · job descriptions employees acknowledge during onboarding.`)}
    <p><a class="btn" href="#/positions/new">+ New position</a></p>
    <section class="card">
      ${positions.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Position</th><th>Reports to</th><th>Status</th><th>People</th><th>Signed</th></tr></thead>
        <tbody>${positions.map((p) => `
          <tr class="clickable ${p.active ? '' : 'done'}" data-open="${p.id}">
            <td><strong>${esc(p.title)}</strong> ${p.active ? '' : badge('Inactive', 'neutral')}
              ${p.regulation ? `<div class="muted small">${esc(p.regulation)}</div>` : ''}</td>
            <td>${esc(p.reports_to || '—')}</td>
            <td>${esc(p.employment_status || '—')}</td>
            <td>${assigned(p.id)}</td>
            <td>${assigned(p.id) ? badge(`${signed(p.id)} of ${assigned(p.id)}`, signed(p.id) >= assigned(p.id) ? 'ok' : 'warn') : '—'}</td>
          </tr>`).join('')}
        </tbody></table></div>` : '<p class="muted">No positions yet. Add each role at this agency with its job description.</p>'}
    </section>`;

  on(view, '[data-open]', 'click', (e) => { location.hash = `#/positions/${e.currentTarget.dataset.open}`; });
};

async function positionDetail(view, id) {
  const isNew = id === 'new';
  const p = isNew ? { active: true } : await q(sb.from('positions').select('*').eq('id', id).single());
  const [people, acks] = isNew ? [[], []] : await Promise.all([
    q(sb.from('employee_profiles').select('user_id, legal_first_name, legal_last_name').eq('position_id', id)),
    q(sb.from('position_acknowledgements').select('*').eq('position_id', id)),
  ]);
  const profiles = people.length
    ? await q(sb.from('profiles').select('id, email, full_name').in('id', people.map((x) => x.user_id)))
    : [];

  view.innerHTML = `
    <a href="#/positions" class="back">← Positions</a>
    ${pageHead(isNew ? 'New position' : p.title, isNew ? esc(companyName(state.companyId)) : '')}
    <form id="position" class="card stack">
      <h2>Job description</h2>
      <div class="row">
        ${input('Position title *', 'title', p.title, 'required')}
        ${input('Regulation', 'regulation', p.regulation, 'placeholder="e.g. N.J.A.C. 8:43K-6.5"')}
      </div>
      <div class="row">
        ${input('Reports to', 'reports_to', p.reports_to)}
        ${input('Supervises', 'supervises', p.supervises)}
        ${input('Status', 'employment_status', p.employment_status, 'placeholder="e.g. Full-time, exempt"')}
      </div>
      <label>Position summary<textarea name="summary" rows="3">${esc(p.summary)}</textarea></label>
      <label>Duties, qualifications and working conditions
        <textarea name="description" rows="16" placeholder="Use a heading line, then lines starting with - for bullets">${esc(p.description)}</textarea></label>
      <div class="row">
        ${input('Countersigned by (title)', 'signer_title', p.signer_title, 'placeholder="e.g. Program Director"')}
      </div>
      <label class="check"><input type="checkbox" name="active" ${p.active ? 'checked' : ''}> <span>Active (can be assigned to employees)</span></label>
      <p class="muted small">Editing a job description does not change copies people already signed; they keep the version they signed.</p>
      <div class="button-row">
        <button type="submit" class="btn">${isNew ? 'Create position' : 'Save changes'}</button>
        ${!isNew && isAdmin() ? '<button type="button" class="btn btn-danger" id="delete">Delete position</button>' : ''}
      </div>
    </form>
    ${isNew ? '' : `
    <section class="card">
      <h2>People in this position</h2>
      ${people.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Person</th><th>Employee signature</th><th>${esc(p.signer_title || 'Supervisor')} signature</th><th></th></tr></thead>
        <tbody>${people.map((x) => {
          const prof = profiles.find((pr) => pr.id === x.user_id);
          const a = acks.find((k) => k.user_id === x.user_id);
          return `<tr>
            <td><a href="#/employees/${x.user_id}">${esc(personName(prof))}</a></td>
            <td>${a ? `${badge('Signed', 'ok')} <span class="muted small">${fmtDate(a.signed_at)}</span>` : badge('Not yet', 'warn')}</td>
            <td>${a?.countersigned_at ? `${badge('Countersigned', 'ok')} <span class="muted small">${esc(a.countersigner_name)}</span>` : a ? badge('Needs countersignature', 'warn') : '—'}</td>
            <td class="actions">${a ? `<a class="btn btn-sm btn-ghost" href="#/jobdescription/${a.id}">Open</a>` : ''}</td>
          </tr>`;
        }).join('')}</tbody></table></div>` : '<p class="muted">Nobody is assigned to this position yet. Assign positions on each employee\'s file or when adding them on the Users page.</p>'}
    </section>`}`;

  on(view, '#position', 'submit', (e) => {
    e.preventDefault();
    const f = nullify(formData(e.target));
    const row = { ...f, active: !!f.active, company_id: isNew ? state.companyId : p.company_id };
    busy(e.target, async () => {
      const saved = isNew
        ? await q(sb.from('positions').insert(row).select().single())
        : await q(sb.from('positions').update(row).eq('id', id).select().single());
      toast(isNew ? 'Position created.' : 'Saved.');
      if (isNew) location.hash = `#/positions/${saved.id}`;
      else renderRoute();
    });
  });
  on(view, '#delete', 'click', async () => {
    if (!confirm(`Delete "${p.title}"? People in it will have no position. Signed copies are kept.`)) return;
    try {
      await q(sb.from('positions').delete().eq('id', id));
      toast('Position deleted.');
      location.hash = '#/positions';
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

// ---------------------------------------------------------------------------
// Signed job description (printable), with countersignature for staff
// ---------------------------------------------------------------------------

VIEWS.jobdescription = async (view, id) => {
  const a = await q(sb.from('position_acknowledgements').select('*').eq('id', id).single());
  const s = a.snapshot || {};
  const canCountersign = isStaff() && a.user_id !== state.user.id && !a.countersigned_at;
  const back = a.user_id === state.user.id ? '#/onboarding/job' : `#/employees/${a.user_id}`;

  view.innerHTML = `
    <div class="no-print button-row">
      <a href="${back}" class="back">← Back</a>
      <button class="btn btn-sm" id="print">Print / save as PDF</button>
    </div>
    <article class="card jd-print">
      <p class="muted small">${esc(companyName(a.company_id))}</p>
      <h1>Job Description: ${esc(s.title)}</h1>
      ${jobDescriptionHtml(s)}
      <h3>Acknowledgment</h3>
      <p>I have read this job description, understand it, and agree to perform the duties of this position.</p>
      <div class="sig-grid">
        <div><span class="sig">${esc(a.typed_name)}</span><span class="muted small">Employee signature (typed) · ${fmtDateTime(a.signed_at)}</span></div>
        <div>${a.countersigned_at
          ? `<span class="sig">${esc(a.countersigner_name)}</span><span class="muted small">${esc(a.countersigner_title || s.signer_title || 'Supervisor')} signature (typed) · ${fmtDateTime(a.countersigned_at)}</span>`
          : `<span class="sig muted">Awaiting signature</span><span class="muted small">${esc(s.signer_title || 'Supervisor')} signature</span>`}</div>
      </div>
      <p class="muted small">Record ${esc(a.id)} · fingerprint ${esc((a.content_sha256 || '').slice(0, 16))}…</p>
    </article>
    ${canCountersign ? `
    <form id="countersign" class="card stack no-print">
      <h2>Countersign</h2>
      <div class="row">
        ${input('Your full name *', 'countersigner_name', state.profile.full_name, 'required minlength="2"')}
        ${input('Your title', 'countersigner_title', s.signer_title)}
      </div>
      <label class="check"><input type="checkbox" required> <span>Typing my name is my electronic signature on this job description.</span></label>
      <button type="submit" class="btn">Countersign</button>
    </form>` : ''}`;

  on(view, '#print', 'click', () => window.print());
  on(view, '#countersign', 'submit', (e) => {
    e.preventDefault();
    const f = formData(e.target);
    busy(e.target, async () => {
      await q(sb.from('position_acknowledgements').update({
        countersigner_name: f.countersigner_name.trim(), countersigner_title: f.countersigner_title || null,
      }).eq('id', id));
      toast('Countersigned.');
      renderRoute();
    });
  });
};

// ---------------------------------------------------------------------------
// Onboarding steps: job description and drug screening
// ---------------------------------------------------------------------------

STEP_VIEWS.job = (el, d, st) => {
  const p = d.position;
  const ack = p && d.positionAcks.find((a) => a.position_id === p.id);
  const legalName = [d.emp?.legal_first_name, d.emp?.legal_middle_name, d.emp?.legal_last_name].filter(Boolean).join(' ');
  if (!p) {
    el.innerHTML = `
      <section class="card"><h2>Job description</h2>
        <p class="muted">Your manager has not assigned your position yet. You can continue with the other steps; this one
          will be ready once your position is set.</p></section>
      <form id="cont">${stepActions('job', { continueLabel: 'Continue' })}</form>`;
    on(el, '#cont', 'submit', (ev) => { ev.preventDefault(); goStep(nextStep('job')); });
    return;
  }
  el.innerHTML = `
    <section class="card">
      <h2>Your job description</h2>
      ${jobDescriptionHtml(p)}
    </section>
    <section class="card">
      ${ack ? `<p class="signed">✓ Signed as <em>${esc(ack.typed_name)}</em> on ${fmtDateTime(ack.signed_at)}.</p>
        <p>${ack.countersigned_at ? `Countersigned by ${esc(ack.countersigner_name)}.` : `Waiting for your ${esc(p.signer_title || 'supervisor')} to countersign.`}
          <a href="#/jobdescription/${ack.id}">View signed copy</a></p>` : `
      <form id="sign-jd" class="stack">
        <h2>Acknowledgment</h2>
        ${input('Type your full legal name to sign *', 'typed_name', legalName, 'required minlength="2" autocomplete="name"')}
        <label class="check"><input type="checkbox" required> <span>I have read this job description, understand it, and agree to perform
          the duties of this position. Typing my name is my electronic signature.</span></label>
        <button type="submit" class="btn">Sign job description</button>
      </form>`}
    </section>
    <form id="cont">${stepActions('job', { continueLabel: 'Continue', disabled: !st.job })}</form>`;

  on(el, '#sign-jd', 'submit', (ev) => {
    ev.preventDefault();
    const { typed_name } = formData(ev.target);
    busy(ev.target, async () => {
      await q(sb.from('position_acknowledgements').insert({ position_id: p.id, user_id: state.user.id, typed_name: typed_name.trim() }));
      toast('Job description signed.');
      renderRoute();
    });
  });
  on(el, '#cont', 'submit', (ev) => { ev.preventDefault(); goStep(nextStep('job')); });
};

// ---------------------------------------------------------------------------
// Background check (employee books it during onboarding; staff record the result)
// ---------------------------------------------------------------------------

const BACKGROUND_RESULTS = { pending: 'Pending', cleared: 'Cleared', not_cleared: 'Not cleared', cancelled: 'Cancelled' };
const backgroundBadge = (r) => badge(BACKGROUND_RESULTS[r], { pending: 'warn', cleared: 'ok', not_cleared: 'danger', cancelled: 'neutral' }[r]);

function backgroundInstructions(company) {
  if (!company.background_url && !company.background_instructions) {
    return `<div class="screening-box"><p>A background check is required for all employees. Your manager or BC HR &amp; Compliance
      will tell you how to schedule it. Once you have an appointment, enter it below.</p></div>`;
  }
  return `
    <div class="screening-box">
      ${company.background_instructions ? `<p>${esc(company.background_instructions)}</p>` : ''}
      <dl class="meta">
        ${company.background_service_code ? `<dt>Service code</dt><dd class="mono">${esc(company.background_service_code)}</dd>` : ''}
        ${company.background_case_number ? `<dt>Case number</dt><dd class="mono">${esc(company.background_case_number)}</dd>` : ''}
        <dt>Cost</dt><dd>${company.background_paid_by_facility ? 'Paid by the facility' : 'See instructions'}</dd>
      </dl>
      ${company.background_url ? `<a class="btn" href="${esc(company.background_url)}" target="_blank" rel="noopener">Schedule my appointment ↗</a>` : ''}
    </div>`;
}

STEP_VIEWS.background = (el, d, st) => {
  const company = currentCompany();
  const check = d.background[0];
  el.innerHTML = `
    <section class="card">
      <h2>Background check</h2>
      ${backgroundInstructions(company)}
    </section>
    <form id="appointment" class="card stack">
      <h2>Your appointment</h2>
      ${check && check.result !== 'pending'
        ? `<p>Result recorded: ${backgroundBadge(check.result)} ${check.result_date ? fmtDate(check.result_date) : ''}</p>`
        : `<p class="muted small">After you book, enter your appointment here so your manager knows it is scheduled.</p>
      <div class="row">
        ${input('Appointment date *', 'appointment_date', check?.appointment_date, `type="date" required min="${today()}"`)}
        ${input('Location', 'appointment_location', check?.appointment_location, 'placeholder="e.g. IdentoGO, Manahawkin"')}
      </div>
      <button type="submit" class="btn">${check ? 'Update appointment' : 'Save appointment'}</button>`}
    </form>
    <form id="cont">${stepActions('background', { continueLabel: 'Continue', disabled: !st.background })}</form>`;

  on(el, '#appointment', 'submit', (ev) => {
    ev.preventDefault();
    const f = nullify(formData(ev.target));
    busy(ev.target, async () => {
      if (check) await q(sb.from('background_checks').update(f).eq('id', check.id));
      else await q(sb.from('background_checks').insert({ ...f, user_id: state.user.id }));
      toast('Appointment saved.');
      renderRoute();
    });
  });
  on(el, '#cont', 'submit', (ev) => { ev.preventDefault(); goStep(nextStep('background')); });
};

// Employee's own drug screening results (read-only; managers perform and record them).
function myDrugResultsHtml(screens) {
  if (!screens.length) return '';
  return `
    <section class="card">
      <h2>My drug screening results</h2>
      <div class="table-wrap"><table>
        <thead><tr><th>Type</th><th>Date</th><th>Result</th></tr></thead>
        <tbody>${screens.map((s) => `
          <tr><td>${esc(SCREEN_TYPES[s.screen_type])}</td>
            <td>${fmtDate(s.result_date || s.appointment_date) || '—'}</td>
            <td>${screenBadge(s.result)}</td></tr>`).join('')}
        </tbody></table></div>
    </section>`;
}

// ---------------------------------------------------------------------------
// Employee file sections (staff)
// ---------------------------------------------------------------------------

async function loadPositionAndScreening(p) {
  const [positions, acks, screens, background] = await Promise.all([
    q(sb.from('positions').select('*').eq('company_id', p.company_id).order('title')),
    q(sb.from('position_acknowledgements').select('*').eq('user_id', p.id).order('signed_at', { ascending: false })),
    q(sb.from('drug_screens').select('*').eq('user_id', p.id).order('created_at', { ascending: false })),
    q(sb.from('background_checks').select('*').eq('user_id', p.id).order('created_at', { ascending: false })),
  ]);
  return { positions, acks, screens, background };
}

function positionSectionHtml(file, data) {
  const current = data.positions.find((x) => x.id === file?.position_id);
  const ack = current && data.acks.find((a) => a.position_id === current.id);
  const older = data.acks.filter((a) => a !== ack);
  return `
    <section class="card">
      <h2>Position &amp; job description</h2>
      <form id="assign-position" class="inline-form">
        <select name="position_id" aria-label="Position">
          <option value="">— No position —</option>
          ${data.positions.filter((x) => x.active || x.id === file?.position_id).map((x) => `<option value="${x.id}"${x.id === file?.position_id ? ' selected' : ''}>${esc(x.title)}</option>`).join('')}
        </select>
        <button type="submit" class="btn btn-ghost">Save position</button>
      </form>
      ${current ? `<p>${ack
        ? `${badge('Employee signed', 'ok')} ${fmtDate(ack.signed_at)} ·
           ${ack.countersigned_at ? `${badge('Countersigned', 'ok')} ${esc(ack.countersigner_name)}` : badge('Needs countersignature', 'warn')}
           · <a href="#/jobdescription/${ack.id}">${ack.countersigned_at ? 'Open signed copy' : 'Open and countersign'}</a>`
        : badge('Employee has not signed yet', 'warn')}</p>` : '<p class="muted">Assign a position so the employee can sign their job description.</p>'}
      ${older.length ? `<p class="muted small">Earlier signed job descriptions: ${older.map((a) => `<a href="#/jobdescription/${a.id}">${esc(a.snapshot?.title || 'Position')} (${fmtDate(a.signed_at)})</a>`).join(', ')}</p>` : ''}
    </section>`;
}

function backgroundSectionHtml(data) {
  const cleared = data.background.some((b) => b.result === 'cleared');
  return `
    <section class="card">
      <h2>Background check ${cleared ? badge('Cleared', 'ok') : badge('Required before approval', 'warn')}</h2>
      ${data.background.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Appointment</th><th>Result</th><th></th></tr></thead>
        <tbody>${data.background.map((b) => `
          <tr>
            <td>${b.appointment_date ? fmtDate(b.appointment_date) : '—'}<div class="muted small">${esc(b.appointment_location || '')}</div></td>
            <td>${backgroundBadge(b.result)} ${b.result_date ? `<span class="muted small">${fmtDate(b.result_date)}</span>` : ''}
              ${b.notes ? `<div class="muted small">${esc(b.notes)}</div>` : ''}</td>
            <td class="actions">
              ${b.file_path ? `<button class="btn btn-sm btn-ghost" data-bg-file="${b.id}">Result file</button>` : ''}
              <button class="btn btn-sm" data-bg-edit="${b.id}">Record result</button>
            </td>
          </tr>`).join('')}
        </tbody></table></div>` : '<p class="muted">The employee has not booked their background check yet.</p>'}
      <details class="cred-form" id="bg-form-wrap">
        <summary class="btn btn-ghost">+ Add a background check record</summary>
        ${backgroundForm({})}
      </details>
    </section>`;
}

function backgroundForm(b) {
  return `
    <form class="stack" id="bg-form" data-id="${b.id || ''}">
      <div class="row">
        ${input('Appointment date', 'appointment_date', b.appointment_date, 'type="date"')}
        ${input('Location', 'appointment_location', b.appointment_location)}
      </div>
      <div class="row">
        <label>Result<select name="result">${options(BACKGROUND_RESULTS, b.result || 'pending')}</select></label>
        ${input('Result date', 'result_date', b.result_date, 'type="date"')}
        <label>Result document<input type="file" name="file" accept="application/pdf,image/*"></label>
      </div>
      <label>Notes (staff only)<textarea name="notes" rows="2">${esc(b.notes)}</textarea></label>
      <button type="submit" class="btn">Save</button>
    </form>`;
}

function drugSectionHtml(data) {
  return `
    <section class="card">
      <h2>Drug screening ${data.screens.some((s) => s.result === 'negative') ? badge('Cleared', 'ok') : badge('Required before approval', 'warn')}</h2>
      <p class="muted small">Performed by the manager or BC HR. The employee can see the results on their dashboard.</p>
      ${data.screens.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Type</th><th>Collected</th><th>Result</th><th></th></tr></thead>
        <tbody>${data.screens.map((s) => `
          <tr>
            <td>${esc(SCREEN_TYPES[s.screen_type])}</td>
            <td>${s.appointment_date ? fmtDate(s.appointment_date) : '—'}<div class="muted small">${esc(s.appointment_location || '')}</div></td>
            <td>${screenBadge(s.result)} ${s.result_date ? `<span class="muted small">${fmtDate(s.result_date)}</span>` : ''}
              ${s.notes ? `<div class="muted small">${esc(s.notes)}</div>` : ''}</td>
            <td class="actions">
              ${s.file_path ? `<button class="btn btn-sm btn-ghost" data-screen-file="${s.id}">Result file</button>` : ''}
              <button class="btn btn-sm" data-screen-edit="${s.id}">Update</button>
            </td>
          </tr>`).join('')}
        </tbody></table></div>` : '<p class="muted">No drug screen documented yet.</p>'}
      <details class="cred-form" id="screen-form-wrap">
        <summary class="btn btn-ghost">+ Document a drug screen</summary>
        ${screenForm({})}
      </details>
    </section>`;
}

function screenForm(s) {
  return `
    <form class="stack" id="screen-form" data-id="${s.id || ''}">
      <div class="row">
        <label>Type<select name="screen_type">${options(SCREEN_TYPES, s.screen_type || 'pre_employment')}</select></label>
        ${input('Date collected', 'appointment_date', s.appointment_date || (s.id ? '' : today()), 'type="date"')}
        ${input('Collected by / where', 'appointment_location', s.appointment_location, 'placeholder="e.g. On site, Maria Lopez"')}
      </div>
      <div class="row">
        <label>Result<select name="result">${options(SCREEN_RESULTS, s.result || 'pending')}</select></label>
        ${input('Result date', 'result_date', s.result_date, 'type="date"')}
        <label>Result document<input type="file" name="file" accept="application/pdf,image/*"></label>
      </div>
      <label>Notes (staff only)<textarea name="notes" rows="2">${esc(s.notes)}</textarea></label>
      <button type="submit" class="btn">Save</button>
    </form>`;
}

// One handler for the staff record forms (drug screen and background check).
function bindRecordForm(view, { formId, wrapId, table, rows, editAttr, fileAttr, editTitle, p }) {
  const bindForm = () => on(view, `#${formId}`, 'submit', (ev) => {
    ev.preventDefault();
    const f = nullify(formData(ev.target));
    const fileInput = ev.target.file.files[0];
    const existingId = ev.target.dataset.id;
    delete f.file;
    busy(ev.target, async () => {
      if (fileInput) {
        if (fileInput.size > MAX_UPLOAD) throw new Error('Files must be smaller than 20 MB.');
        f.file_path = `${p.company_id}/${p.id}/${crypto.randomUUID()}-${safeName(fileInput.name)}`;
        f.file_name = fileInput.name;
        await q(sb.storage.from('employee-files').upload(f.file_path, fileInput));
      }
      if (existingId) await q(sb.from(table).update(f).eq('id', existingId));
      else await q(sb.from(table).insert({ ...f, user_id: p.id }));
      toast('Saved.');
      renderRoute();
    });
  });
  bindForm();

  on(view, `[${editAttr}]`, 'click', (ev) => {
    const r = rows.find((x) => x.id === ev.currentTarget.getAttribute(editAttr));
    const wrap = view.querySelector(`#${wrapId}`);
    wrap.querySelector('summary').textContent = editTitle;
    wrap.querySelector(`#${formId}`).outerHTML = table === 'drug_screens' ? screenForm(r) : backgroundForm(r);
    wrap.open = true;
    bindForm();
    wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  on(view, `[${fileAttr}]`, 'click', (ev) => {
    const r = rows.find((x) => x.id === ev.currentTarget.getAttribute(fileAttr));
    openSignedFile('employee-files', r.file_path, r.file_name, false);
  });
}

function bindPositionAndScreening(view, p, file, data) {
  on(view, '#assign-position', 'submit', (ev) => {
    ev.preventDefault();
    const positionId = ev.target.position_id.value || null;
    const position = data.positions.find((x) => x.id === positionId);
    busy(ev.target, async () => {
      const update = { position_id: positionId, job_title: position ? position.title : file?.job_title || null };
      if (file) await q(sb.from('employee_profiles').update(update).eq('user_id', p.id));
      else await q(sb.from('employee_profiles').insert({ user_id: p.id, ...update }));
      toast('Position saved.');
      renderRoute();
    });
  });

  bindRecordForm(view, {
    formId: 'screen-form', wrapId: 'screen-form-wrap', table: 'drug_screens', rows: data.screens,
    editAttr: 'data-screen-edit', fileAttr: 'data-screen-file', editTitle: 'Update drug screen', p,
  });
  bindRecordForm(view, {
    formId: 'bg-form', wrapId: 'bg-form-wrap', table: 'background_checks', rows: data.background,
    editAttr: 'data-bg-edit', fileAttr: 'data-bg-file', editTitle: 'Record background check result', p,
  });
}

// ---------------------------------------------------------------------------
// Admin: per-agency background check settings (shown on Client companies)
// ---------------------------------------------------------------------------

function backgroundSettingsForm(c) {
  return `
    <form class="stack background-settings" data-company="${c.id}">
      <p class="muted small">The background check is a required onboarding step for every employee. Add where and how this
        agency's employees schedule it (e.g. IdentoGO fingerprinting).</p>
      <label>Instructions for employees<textarea name="background_instructions" rows="2">${esc(c.background_instructions)}</textarea></label>
      <div class="row">
        ${input('Scheduling link', 'background_url', c.background_url, 'type="url" placeholder="https://…"')}
        ${input('Service code', 'background_service_code', c.background_service_code)}
        ${input('Case number', 'background_case_number', c.background_case_number)}
      </div>
      <label class="check"><input type="checkbox" name="background_paid_by_facility" ${c.background_paid_by_facility ? 'checked' : ''}>
        <span>The facility covers the cost</span></label>
      <button type="submit" class="btn btn-sm">Save background check settings</button>
    </form>`;
}

function bindBackgroundSettings(view) {
  on(view, 'form.background-settings', 'submit', (ev) => {
    ev.preventDefault();
    const f = nullify(formData(ev.target));
    const row = {
      background_paid_by_facility: !!f.background_paid_by_facility,
      background_instructions: f.background_instructions,
      background_url: f.background_url,
      background_service_code: f.background_service_code,
      background_case_number: f.background_case_number,
    };
    busy(ev.target, async () => {
      await q(sb.from('companies').update(row).eq('id', ev.target.dataset.company));
      await reloadCompanies();
      toast('Background check settings saved.');
    });
  });
}
