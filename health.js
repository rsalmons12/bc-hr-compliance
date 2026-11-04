// TB and measles screening (per agency, e.g. New Jersey facilities): employees upload a
// result from the past 12 months or book a test the agency pays for; staff record results.

const HEALTH_SCREENINGS = {
  tb: { label: 'TB test', cleared: 'negative', types: ['TB blood test (IGRA / QuantiFERON)', 'TB skin test (PPD)', 'Chest X-ray'] },
  measles: { label: 'Measles test', cleared: 'immune', types: ['Measles titer (IgG)', 'MMR vaccination record (2 doses)'] },
};
const HEALTH_RESULTS = {
  pending: 'Pending', negative: 'Negative', positive: 'Positive',
  immune: 'Immune', not_immune: 'Not immune', cancelled: 'Cancelled',
};
const healthBadge = (r) => badge(HEALTH_RESULTS[r], {
  pending: 'warn', negative: 'ok', immune: 'ok', positive: 'danger', not_immune: 'danger', cancelled: 'neutral',
}[r]);

const DEFAULT_HEALTH_URL = 'https://www.cvs.com/minuteclinic/services/tb-testing';

// The newest record for each screening.
function latestHealth(rows, kind) {
  return rows.filter((r) => r.screening === kind)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] || null;
}

// Cleared = TB negative / measles immune and still within its 12 months.
function healthCleared(rows, kind) {
  return rows.some((r) => r.screening === kind && r.result === HEALTH_SCREENINGS[kind].cleared
    && (!r.valid_until || r.valid_until >= today()));
}

const healthStepDone = (rows) => Object.keys(HEALTH_SCREENINGS).every((kind) => {
  const r = latestHealth(rows, kind);
  return r && (r.appointment_date || r.source === 'prior_result' || r.result !== 'pending');
});

// ---------------------------------------------------------------------------
// Onboarding step
// ---------------------------------------------------------------------------

STEP_VIEWS.health = (el, d, st) => {
  const company = currentCompany();
  const oldest = new Date();
  oldest.setFullYear(oldest.getFullYear() - 1);
  const minDate = oldest.toISOString().slice(0, 10);

  const card = (kind) => {
    const s = HEALTH_SCREENINGS[kind];
    const r = latestHealth(d.health, kind);
    if (r && r.result !== 'pending') {
      return `<section class="card"><h2>${esc(s.label)}</h2>
        <p>${healthBadge(r.result)} ${r.valid_until ? `Valid until ${fmtDate(r.valid_until)}` : ''}</p></section>`;
    }
    return `
      <section class="card">
        <h2>${esc(s.label)} ${r ? badge(r.source === 'prior_result' ? 'Result uploaded, waiting for review' : `Appointment ${fmtDate(r.appointment_date)}`, 'info') : ''}</h2>
        <div class="choice-row">
          <button type="button" class="btn btn-ghost btn-sm" data-show-form="${kind}-prior">I was tested in the past 12 months</button>
          <button type="button" class="btn btn-ghost btn-sm" data-show-form="${kind}-book">I need to book a test</button>
        </div>
        <form class="stack" data-health="${kind}" data-source="prior_result" id="${kind}-prior" hidden>
          <div class="row">
            <label>Type of test<select name="test_type">${s.types.map((t) => `<option>${esc(t)}</option>`).join('')}</select></label>
            ${input('Test date *', 'test_date', '', `type="date" required min="${minDate}" max="${today()}"`)}
            <label>Result document *<input type="file" name="file" accept="application/pdf,image/*" required></label>
          </div>
          <button type="submit" class="btn">Upload result</button>
        </form>
        <form class="stack" data-health="${kind}" data-source="appointment" id="${kind}-book" hidden>
          <div class="row">
            ${input('Appointment date *', 'appointment_date', r?.appointment_date, `type="date" required min="${today()}"`)}
            ${input('Location', 'appointment_location', r?.appointment_location, 'placeholder="e.g. MinuteClinic, Manahawkin"')}
          </div>
          <button type="submit" class="btn">Save appointment</button>
        </form>
      </section>`;
  };

  el.innerHTML = `
    <section class="card">
      <h2>TB and measles screening</h2>
      <div class="screening-box">
        <p>${esc(company.health_screen_instructions || 'A TB test and a measles test are required before you start. If you were tested in the past 12 months, upload your result. Otherwise, book a test; most people go to a local MinuteClinic.')}</p>
        <dl class="meta"><dt>Cost</dt><dd>${company.health_screen_paid_by_facility === false ? 'See instructions' : 'Paid by the agency'}</dd></dl>
        <a class="btn" href="${esc(company.health_screen_url || DEFAULT_HEALTH_URL)}" target="_blank" rel="noopener">Find a clinic and book ↗</a>
      </div>
    </section>
    ${card('tb')}
    ${card('measles')}
    <form id="cont">${stepActions('health', { continueLabel: 'Continue', disabled: !st.health })}</form>`;

  on(el, '[data-show-form]', 'click', (ev) => {
    const id = ev.currentTarget.dataset.showForm;
    const kind = id.split('-')[0];
    el.querySelectorAll(`form[data-health="${kind}"]`).forEach((f) => { f.hidden = f.id !== id; });
  });

  on(el, 'form[data-health]', 'submit', (ev) => {
    ev.preventDefault();
    const form = ev.target;
    const kind = form.dataset.health;
    const source = form.dataset.source;
    const f = nullify(formData(form));
    delete f.file;
    const file = form.file?.files[0];
    busy(form, async () => {
      const row = { ...f, screening: kind, source, user_id: state.user.id };
      let uploaded = null;
      if (file) {
        if (file.size > MAX_UPLOAD) throw new Error('Files must be smaller than 20 MB.');
        uploaded = `${state.companyId}/${state.user.id}/${crypto.randomUUID()}-${safeName(file.name)}`;
        await q(sb.storage.from('employee-files').upload(uploaded, file));
        Object.assign(row, { file_path: uploaded, file_name: file.name });
      }
      const existing = latestHealth(d.health, kind);
      const { error } = existing && existing.result === 'pending'
        ? await sb.from('health_screenings').update(row).eq('id', existing.id)
        : await sb.from('health_screenings').insert(row);
      if (error) {
        if (uploaded) await sb.storage.from('employee-files').remove([uploaded]);
        throw error;
      }
      toast(source === 'prior_result' ? 'Result uploaded for review.' : 'Appointment saved.');
      renderRoute();
    });
  });
  on(el, '#cont', 'submit', (ev) => { ev.preventDefault(); goStep(nextStep('health')); });
};

// ---------------------------------------------------------------------------
// Employee file section (staff)
// ---------------------------------------------------------------------------

function healthSectionHtml(rows) {
  const cleared = Object.keys(HEALTH_SCREENINGS).every((k) => healthCleared(rows, k));
  return `
    <section class="card">
      <h2>TB &amp; measles ${cleared ? badge('Cleared', 'ok') : badge('Required before approval', 'warn')}</h2>
      ${rows.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Screening</th><th>Test / appointment</th><th>Result</th><th></th></tr></thead>
        <tbody>${rows.map((r) => `
          <tr>
            <td><strong>${esc(HEALTH_SCREENINGS[r.screening].label)}</strong>
              <div class="muted small">${r.source === 'prior_result' ? 'Uploaded previous result' : 'Booked test'}</div></td>
            <td>${esc(r.test_type || '')}
              <div class="muted small">${r.test_date ? `Tested ${fmtDate(r.test_date)}` : r.appointment_date ? `Appointment ${fmtDate(r.appointment_date)} ${esc(r.appointment_location || '')}` : ''}</div></td>
            <td>${healthBadge(r.result)} ${r.valid_until ? `<div class="muted small">${expiryBadge(r.valid_until)}</div>` : ''}
              ${r.notes ? `<div class="muted small">${esc(r.notes)}</div>` : ''}</td>
            <td class="actions">
              ${r.file_path ? `<button class="btn btn-sm btn-ghost" data-health-file="${r.id}">View result</button>` : ''}
              <button class="btn btn-sm" data-health-edit="${r.id}">Record result</button>
            </td>
          </tr>`).join('')}
        </tbody></table></div>` : '<p class="muted">Nothing booked or uploaded yet.</p>'}
      <details class="cred-form" id="health-form-wrap">
        <summary class="btn btn-ghost">+ Add a TB or measles record</summary>
        ${healthForm({})}
      </details>
    </section>`;
}

function healthForm(r) {
  const types = [...HEALTH_SCREENINGS.tb.types, ...HEALTH_SCREENINGS.measles.types];
  return `
    <form class="stack" id="health-form" data-id="${r.id || ''}">
      <div class="row">
        <label>Screening<select name="screening">${options({ tb: 'TB test', measles: 'Measles test' }, r.screening || 'tb')}</select></label>
        <label>Type of test<select name="test_type"><option value="">—</option>${types.map((t) => `<option${t === r.test_type ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
        ${input('Test date', 'test_date', r.test_date, 'type="date"')}
      </div>
      <div class="row">
        <label>Result<select name="result">${options(HEALTH_RESULTS, r.result || 'pending')}</select></label>
        ${input('Valid until', 'valid_until', r.valid_until, 'type="date"')}
        <label>Result document<input type="file" name="file" accept="application/pdf,image/*"></label>
      </div>
      <p class="muted small">Leave "Valid until" blank and it is set to 12 months after the test date when the result is negative or immune.</p>
      <label>Notes (staff only)<textarea name="notes" rows="2" placeholder="e.g. positive TB: chest X-ray referral">${esc(r.notes)}</textarea></label>
      <button type="submit" class="btn">Save</button>
    </form>`;
}

function bindHealthSection(view, p, rows) {
  const bindForm = () => on(view, '#health-form', 'submit', (ev) => {
    ev.preventDefault();
    const f = nullify(formData(ev.target));
    const file = ev.target.file.files[0];
    const existingId = ev.target.dataset.id;
    delete f.file;
    busy(ev.target, async () => {
      if (file) {
        if (file.size > MAX_UPLOAD) throw new Error('Files must be smaller than 20 MB.');
        f.file_path = `${p.company_id}/${p.id}/${crypto.randomUUID()}-${safeName(file.name)}`;
        f.file_name = file.name;
        await q(sb.storage.from('employee-files').upload(f.file_path, file));
      }
      if (existingId) await q(sb.from('health_screenings').update(f).eq('id', existingId));
      else await q(sb.from('health_screenings').insert({ ...f, user_id: p.id, source: 'appointment' }));
      toast('Saved.');
      renderRoute();
    });
  });
  bindForm();

  on(view, '[data-health-edit]', 'click', (ev) => {
    const r = rows.find((x) => x.id === ev.currentTarget.dataset.healthEdit);
    const wrap = view.querySelector('#health-form-wrap');
    wrap.querySelector('summary').textContent = `Record ${HEALTH_SCREENINGS[r.screening].label} result`;
    wrap.querySelector('#health-form').outerHTML = healthForm(r);
    wrap.open = true;
    bindForm();
    wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  on(view, '[data-health-file]', 'click', (ev) => {
    const r = rows.find((x) => x.id === ev.currentTarget.dataset.healthFile);
    openSignedFile('employee-files', r.file_path, r.file_name, false);
  });
}

// ---------------------------------------------------------------------------
// Admin: per-agency settings (shown on Client companies)
// ---------------------------------------------------------------------------

function healthSettingsForm(c) {
  return `
    <form class="stack health-settings" data-company="${c.id}">
      <label class="check"><input type="checkbox" name="health_screen_required" ${c.health_screen_required ? 'checked' : ''}>
        <span>Require TB and measles screening during onboarding (e.g. New Jersey facilities)</span></label>
      <label>Instructions for employees<textarea name="health_screen_instructions" rows="2"
        placeholder="A TB test and a measles test are required before you start…">${esc(c.health_screen_instructions)}</textarea></label>
      <div class="row">
        ${input('Booking link', 'health_screen_url', c.health_screen_url, `type="url" placeholder="${DEFAULT_HEALTH_URL}"`)}
      </div>
      <label class="check"><input type="checkbox" name="health_screen_paid_by_facility" ${c.health_screen_paid_by_facility !== false ? 'checked' : ''}>
        <span>The agency covers the cost</span></label>
      <button type="submit" class="btn btn-sm">Save TB &amp; measles settings</button>
    </form>`;
}

function bindHealthSettings(view) {
  on(view, 'form.health-settings', 'submit', (ev) => {
    ev.preventDefault();
    const f = nullify(formData(ev.target));
    busy(ev.target, async () => {
      await q(sb.from('companies').update({
        health_screen_required: !!f.health_screen_required,
        health_screen_paid_by_facility: !!f.health_screen_paid_by_facility,
        health_screen_instructions: f.health_screen_instructions,
        health_screen_url: f.health_screen_url,
      }).eq('id', ev.target.dataset.company));
      await reloadCompanies();
      toast('TB & measles settings saved.');
    });
  });
}
