// Resume, work history and employment verification. Employees upload a resume and list
// previous employers during onboarding; the agency verifies each job and records who it
// spoke to, the dates and full-time / part-time status confirmed, and when.

const EMPLOYMENT_TYPES = { full_time: 'Full-time', part_time: 'Part-time' };
const VERIFICATION_STATUS = {
  not_started: 'Not verified yet',
  verified: 'Verified',
  unable_to_verify: 'Unable to verify',
  discrepancy: 'Discrepancy found',
};
const verificationBadge = (s) => badge(VERIFICATION_STATUS[s], {
  not_started: 'warn', verified: 'ok', unable_to_verify: 'neutral', discrepancy: 'danger',
}[s]);

const workDates = (from, to) => `${from ? fmtDate(from) : '?'} – ${to ? fmtDate(to) : 'present'}`;

// Resume uploaded, and either at least one previous job listed or "no previous employment".
const workStepDone = (emp, jobs) => !!(emp?.resume_path && (jobs.length || emp.no_prior_employment));

// Every listed job has a verification outcome recorded.
const workVerified = (emp, jobs) => workStepDone(emp, jobs) && jobs.every((j) => j.verification_status !== 'not_started');

function jobFields(j = {}) {
  return `
    <div class="row">
      ${input('Employer *', 'employer_name', j.employer_name, 'required')}
      ${input('Your job title', 'job_title', j.job_title)}
      ${input('Employer phone', 'employer_phone', j.employer_phone, 'type="tel"')}
    </div>
    <div class="row">
      ${input('From', 'start_date', j.start_date, 'type="date"')}
      ${input('To (blank if you still work there)', 'end_date', j.end_date, 'type="date"')}
      <label>Full-time or part-time<select name="employment_type">
        <option value="">—</option>${options(EMPLOYMENT_TYPES, j.employment_type)}</select></label>
    </div>`;
}

// ---------------------------------------------------------------------------
// Onboarding step
// ---------------------------------------------------------------------------

STEP_VIEWS.work = (el, d, st) => {
  const e = d.emp || {};
  const jobs = d.work;
  el.innerHTML = `
    <section class="card">
      <h2>Resume</h2>
      ${e.resume_path ? `<p>${badge('Uploaded', 'ok')} <button class="link" id="view-resume">${esc(e.resume_file_name)}</button>
        <span class="muted small">· ${fmtDate(e.resume_uploaded_at)}</span></p>` : '<p class="muted">Upload your current resume (PDF or Word).</p>'}
      <form id="resume" class="inline-form">
        <input type="file" name="file" accept="application/pdf,.doc,.docx,image/*" required>
        <button type="submit" class="btn">${e.resume_path ? 'Replace resume' : 'Upload resume'}</button>
      </form>
    </section>
    <section class="card">
      <h2>Work history</h2>
      <p class="muted small">List your previous employers. The agency will contact them to verify your employment.</p>
      ${jobs.length ? `<ul class="list">${jobs.map((j) => `
        <li><span><strong>${esc(j.employer_name)}</strong> ${j.job_title ? `· ${esc(j.job_title)}` : ''}
            <span class="muted small">· ${workDates(j.start_date, j.end_date)}${j.employment_type ? ` · ${EMPLOYMENT_TYPES[j.employment_type]}` : ''}</span></span>
          <span class="button-row">${verificationBadge(j.verification_status)}
            ${j.verification_status === 'not_started' ? `<button class="btn btn-sm btn-danger" data-remove-job="${j.id}">Remove</button>` : ''}</span></li>`).join('')}</ul>`
        : `<label class="check"><input type="checkbox" id="no-prior" ${e.no_prior_employment ? 'checked' : ''}>
            <span>I have no previous employment to list</span></label>`}
      <details class="cred-form" ${jobs.length || e.no_prior_employment ? '' : 'open'}>
        <summary class="btn btn-ghost">+ Add an employer</summary>
        <form id="add-job" class="stack">${jobFields()}<button type="submit" class="btn">Add employer</button></form>
      </details>
    </section>
    <form id="cont">${stepActions('work', { continueLabel: 'Continue', disabled: !st.work })}</form>`;

  on(el, '#view-resume', 'click', () => openSignedFile('employee-files', e.resume_path, e.resume_file_name, false));
  on(el, '#resume', 'submit', (ev) => {
    ev.preventDefault();
    const file = ev.target.file.files[0];
    busy(ev.target, async () => {
      if (file.size > MAX_UPLOAD) throw new Error('Files must be smaller than 20 MB.');
      const path = `${state.companyId}/${state.user.id}/${crypto.randomUUID()}-${safeName(file.name)}`;
      await q(sb.storage.from('employee-files').upload(path, file));
      await saveEmp({ resume_path: path, resume_file_name: file.name, resume_uploaded_at: new Date().toISOString() });
      toast('Resume uploaded.');
      renderRoute();
    });
  });
  on(el, '#no-prior', 'change', async (ev) => {
    try {
      await saveEmp({ no_prior_employment: ev.target.checked });
      renderRoute();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  on(el, '#add-job', 'submit', (ev) => {
    ev.preventDefault();
    busy(ev.target, async () => {
      await q(sb.from('employment_history').insert({ ...nullify(formData(ev.target)), user_id: state.user.id }));
      if (e.no_prior_employment) await saveEmp({ no_prior_employment: false });
      toast('Employer added.');
      renderRoute();
    });
  });
  on(el, '[data-remove-job]', 'click', async (ev) => {
    try {
      await q(sb.from('employment_history').delete().eq('id', ev.currentTarget.dataset.removeJob));
      renderRoute();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  on(el, '#cont', 'submit', (ev) => { ev.preventDefault(); goStep(nextStep('work')); });
};

// ---------------------------------------------------------------------------
// Employee file section (staff): resume and employment verification
// ---------------------------------------------------------------------------

function employmentSectionHtml(file, jobs, people) {
  const e = file || {};
  return `
    <section class="card">
      <h2>Resume &amp; employment verification
        ${workVerified(file, jobs) ? badge('Complete', 'ok') : badge('Required before approval', 'warn')}</h2>
      <p>${e.resume_path
        ? `Resume: <button class="link" id="staff-resume">${esc(e.resume_file_name)}</button> <span class="muted small">uploaded ${fmtDate(e.resume_uploaded_at)}</span>`
        : badge('No resume uploaded', 'warn')}
        ${e.no_prior_employment ? badge('Employee reports no previous employment', 'info') : ''}</p>
      ${jobs.length ? jobs.map((j) => `
        <article class="verify-card">
          <div class="verify-head">
            <div><strong>${esc(j.employer_name)}</strong> ${j.job_title ? `· ${esc(j.job_title)}` : ''}
              <div class="muted small">As given by employee: ${workDates(j.start_date, j.end_date)}
                ${j.employment_type ? ` · ${EMPLOYMENT_TYPES[j.employment_type]}` : ''}${j.employer_phone ? ` · ${esc(j.employer_phone)}` : ''}</div></div>
            ${verificationBadge(j.verification_status)}
          </div>
          ${j.verification_status !== 'not_started' ? `
          <dl class="meta">
            <dt>Spoke with</dt><dd>${esc([j.verified_contact_name, j.verified_contact_title].filter(Boolean).join(', ') || '—')}</dd>
            <dt>Their phone</dt><dd>${esc(j.verified_contact_phone || '—')}</dd>
            <dt>Dates confirmed</dt><dd>${j.verified_start_date || j.verified_end_date ? workDates(j.verified_start_date, j.verified_end_date) : '—'}</dd>
            <dt>Full / part-time</dt><dd>${j.verified_employment_type ? EMPLOYMENT_TYPES[j.verified_employment_type] : '—'}</dd>
            <dt>Date verified</dt><dd>${fmtDate(j.verified_on) || '—'}</dd>
            <dt>Verified by</dt><dd>${esc(people[j.verified_by] || 'BC HR & Compliance')}</dd>
            ${j.verification_notes ? `<dt>Notes</dt><dd>${esc(j.verification_notes)}</dd>` : ''}
          </dl>` : ''}
          <button class="btn btn-sm ${j.verification_status === 'not_started' ? '' : 'btn-ghost'}" data-verify-job="${j.id}">
            ${j.verification_status === 'not_started' ? 'Record verification' : 'Update verification'}</button>
        </article>`).join('') : '<p class="muted">No previous employers listed yet.</p>'}
      <details class="cred-form" id="verify-wrap">
        <summary class="btn btn-ghost">+ Add an employer and verification</summary>
        ${verifyForm({})}
      </details>
    </section>`;
}

function verifyForm(j) {
  const isNew = !j.id;
  return `
    <form class="stack" id="verify-form" data-id="${j.id || ''}">
      ${isNew ? jobFields() : ''}
      <h3>Verification</h3>
      <div class="row">
        ${input('Person spoken to *', 'verified_contact_name', j.verified_contact_name, 'required')}
        ${input('Their title', 'verified_contact_title', j.verified_contact_title, 'placeholder="e.g. HR Manager"')}
        ${input('Their phone', 'verified_contact_phone', j.verified_contact_phone || j.employer_phone, 'type="tel"')}
      </div>
      <div class="row">
        ${input('Employed from', 'verified_start_date', j.verified_start_date || j.start_date, 'type="date"')}
        ${input('Employed to', 'verified_end_date', j.verified_end_date || j.end_date, 'type="date"')}
        <label>Full-time or part-time<select name="verified_employment_type">
          <option value="">—</option>${options(EMPLOYMENT_TYPES, j.verified_employment_type || j.employment_type)}</select></label>
      </div>
      <div class="row">
        ${input('Date verified *', 'verified_on', j.verified_on || today(), `type="date" required max="${today()}"`)}
        <label>Outcome *<select name="verification_status" required>
          ${options({ verified: 'Verified', unable_to_verify: 'Unable to verify', discrepancy: 'Discrepancy found' }, j.verification_status === 'not_started' ? 'verified' : j.verification_status)}
        </select></label>
      </div>
      <label>Notes<textarea name="verification_notes" rows="2" placeholder="e.g. eligible for rehire; dates differ from resume">${esc(j.verification_notes)}</textarea></label>
      <button type="submit" class="btn">Save verification</button>
    </form>`;
}

function bindEmploymentSection(view, p, file, jobs) {
  const bindForm = () => on(view, '#verify-form', 'submit', (ev) => {
    ev.preventDefault();
    const f = nullify(formData(ev.target));
    const id = ev.target.dataset.id;
    busy(ev.target, async () => {
      if (id) await q(sb.from('employment_history').update(f).eq('id', id));
      else await q(sb.from('employment_history').insert({ ...f, user_id: p.id }));
      toast('Verification saved.');
      renderRoute();
    });
  });
  bindForm();

  on(view, '[data-verify-job]', 'click', (ev) => {
    const j = jobs.find((x) => x.id === ev.currentTarget.dataset.verifyJob);
    const wrap = view.querySelector('#verify-wrap');
    wrap.querySelector('summary').textContent = `Verification: ${j.employer_name}`;
    wrap.querySelector('#verify-form').outerHTML = verifyForm(j);
    wrap.open = true;
    bindForm();
    wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  on(view, '#staff-resume', 'click', () => openSignedFile('employee-files', file.resume_path, file.resume_file_name, false));
}

// ---------------------------------------------------------------------------
// Employee page: resume and work history (same as the onboarding step, any time)
// ---------------------------------------------------------------------------

VIEWS.resume = async (view) => {
  const d = await loadOnboarding();
  const st = stepStatus(d);
  view.innerHTML = `
    ${pageHead('My resume & work history', 'Upload your resume and list your previous employers. This also counts toward your onboarding.')}
    <div id="work"></div>`;
  const el = view.querySelector('#work');
  STEP_VIEWS.work(el, d, st);
  el.querySelector('#cont')?.remove();
};
