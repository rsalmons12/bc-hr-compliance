// Agency compliance (managers and BC HR admins only): state licenses, Department of
// Health revisions, plant / facility documents, and policies & procedures.
// Attachments keep every version, and the database logs every change.

const COMPLIANCE_TABS = {
  licenses: {
    category: 'state_license',
    label: 'State licenses',
    singular: 'state license',
    numberField: 'number',
    numberLabel: 'License number',
    agencyLabel: 'Issuing agency',
    agencyHint: 'e.g. Department of Health',
    startLabel: 'Start (effective) date',
    expiryLabel: 'Expiration date',
    types: [
      'Home health agency license', 'Hospice license', 'Assisted living facility license',
      'Nursing facility license', 'Personal care services license', 'Adult day care license',
      'Medicare certification', 'Medicaid provider enrollment', 'CLIA certificate',
      'Controlled substance registration', 'Business license', 'Other',
    ],
  },
  plant: {
    category: 'plant',
    label: 'Plant & business',
    singular: 'plant or business document',
    numberField: 'number',
    numberLabel: 'Certificate / permit / ID number',
    agencyLabel: 'Issued by',
    agencyHint: 'e.g. City Fire Marshal, Secretary of State, IRS',
    startLabel: 'Issue / effective date',
    expiryLabel: 'Expiration / renewal date',
    types: [
      // Business formation and ownership
      'Articles of incorporation / organization', 'Certificate of formation', 'Operating agreement / bylaws',
      'Business registration (Secretary of State)', 'Certificate of good standing', 'Assumed name (DBA) certificate',
      'IRS EIN confirmation (Form SS-4 / CP 575)', 'Ownership structure / org chart', 'Ownership disclosure (CMS-855)',
      'Annual report / franchise tax filing', 'NPI confirmation', 'General liability insurance certificate',
      'Professional liability insurance certificate', "Workers' compensation certificate", 'Surety bond',
      // Plant and facility
      'Certificate of occupancy', 'Lease agreement', 'Fire inspection certificate', 'Fire alarm inspection',
      'Sprinkler system inspection', 'Fire extinguisher inspection', 'HVAC certificate', 'Elevator certificate',
      'Boiler certificate', 'Generator inspection', 'Kitchen / food service permit', 'Water testing',
      'Pest control', 'Backflow test', 'Other',
    ],
  },
  procedures: {
    category: 'policy_procedure',
    label: 'Policies & procedures',
    singular: 'policy or procedure',
    numberField: 'version',
    numberLabel: 'Version',
    agencyLabel: 'Approved by',
    agencyHint: 'e.g. Governing body, Administrator',
    startLabel: 'Effective date',
    expiryLabel: 'Next review due',
    types: [
      'Policy & procedure manual', 'Emergency preparedness plan', 'Infection control plan',
      'QAPI plan', 'Grievance policy', 'Patient rights', 'HIPAA / privacy policy',
      'Personnel policies', 'Other',
    ],
  },
};

const tabForCategory = (category) => Object.keys(COMPLIANCE_TABS).find((k) => COMPLIANCE_TABS[k].category === category);

const REVISION_STATUS = {
  open: ['Open', 'warn'],
  in_progress: ['In progress', 'info'],
  submitted: ['Submitted', 'info'],
  accepted: ['Accepted', 'ok'],
  closed: ['Closed', 'neutral'],
};
const revisionIsOpen = (r) => !['accepted', 'closed'].includes(r.status);
// The due date is for getting the correction to the agency, so a submitted revision is no longer overdue.
const revisionOverdue = (r) => ['open', 'in_progress'].includes(r.status) && r.due_date && r.due_date < today();

function revisionBadge(status) {
  const [label, kind] = REVISION_STATUS[status];
  return badge(label, kind);
}

function complianceTabs(active) {
  const tabs = [['', 'Overview'], ['licenses', 'State licenses'], ['revisions', 'License revisions'], ['plant', 'Plant & business'], ['procedures', 'Policies & procedures']];
  return `<nav class="tabs">${tabs.map(([k, label]) => `<a href="#/compliance${k ? '/' + k : ''}" class="${k === active ? 'active' : ''}">${esc(label)}</a>`).join('')}</nav>`;
}

VIEWS.compliance = async (view, id, sub) => {
  if (needsCompany(view)) return;
  if (id === 'item' && sub) return complianceItem(view, sub);
  if (id === 'revision' && sub) return revisionDetail(view, sub);
  if (id === 'revisions') return revisionsList(view);
  if (COMPLIANCE_TABS[id]) return complianceList(view, id);
  return complianceOverview(view);
};

async function loadAgencyCompliance(c) {
  const [docs, revisions] = await Promise.all([
    q(sb.from('compliance_documents').select('*').eq('company_id', c).eq('archived', false)),
    q(sb.from('license_revisions').select('*').eq('company_id', c)),
  ]);
  return { docs, revisions };
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

async function complianceOverview(view) {
  const c = state.companyId;
  const { docs, revisions } = await loadAgencyCompliance(c);
  const dated = docs.filter((d) => d.expiry_date).sort((a, b) => a.expiry_date.localeCompare(b.expiry_date));
  const expired = dated.filter((d) => daysUntil(d.expiry_date) < 0);
  const soon = dated.filter((d) => daysUntil(d.expiry_date) >= 0 && daysUntil(d.expiry_date) <= 60);
  const open = revisions.filter(revisionIsOpen);
  const overdue = open.filter(revisionOverdue);
  const upcoming = dated.filter((d) => daysUntil(d.expiry_date) <= 90);
  const licenseName = (lid) => docs.find((d) => d.id === lid)?.title || '';

  view.innerHTML = `
    ${pageHead('Agency compliance', `${esc(companyName(c))} · visible to managers and BC HR &amp; Compliance only.`)}
    ${complianceTabs('')}
    <div class="stats">
      ${stat('State licenses', docs.filter((d) => d.category === 'state_license').length, '#/compliance/licenses')}
      ${stat('Expired', expired.length, '#/compliance', expired.length ? 'danger' : '')}
      ${stat('Expiring ≤ 60 days', soon.length, '#/compliance', soon.length ? 'warn' : '')}
      ${stat('Open revisions', open.length, '#/compliance/revisions', open.length ? 'warn' : '')}
      ${stat('Overdue revisions', overdue.length, '#/compliance/revisions', overdue.length ? 'danger' : '')}
    </div>
    <div class="grid2">
      <section class="card">
        <h2>Expired or due within 90 days</h2>
        ${upcoming.length ? `<ul class="list">${upcoming.map((d) => `
          <li><span><a href="#/compliance/item/${d.id}">${esc(d.title)}</a>
            <span class="muted small">· ${esc(COMPLIANCE_TABS[tabForCategory(d.category)].label)}</span></span>
            ${expiryBadge(d.expiry_date)}</li>`).join('')}</ul>`
          : '<p class="muted">Nothing expiring in the next 90 days.</p>'}
      </section>
      <section class="card">
        <h2>Open license revisions</h2>
        ${open.length ? `<ul class="list">${open.sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999')).map((r) => `
          <li><span><a href="#/compliance/revision/${r.id}">${esc(r.title)}</a>
            <span class="muted small">${r.license_id ? '· ' + esc(licenseName(r.license_id)) : ''}</span></span>
            ${r.due_date ? badge(`Due ${fmtDate(r.due_date)}`, revisionOverdue(r) ? 'danger' : 'neutral') : revisionBadge(r.status)}</li>`).join('')}</ul>`
          : '<p class="muted">No open revisions.</p>'}
      </section>
    </div>`;
}

// ---------------------------------------------------------------------------
// State licenses, plant & facility, policies & procedures
// ---------------------------------------------------------------------------

function complianceFields(tab, d = {}) {
  const t = COMPLIANCE_TABS[tab];
  const listId = `types-${tab}`;
  return `
    <div class="row">
      <label>Type *<input name="doc_type" list="${listId}" value="${esc(d.doc_type)}" required placeholder="Choose or type">
        <datalist id="${listId}">${t.types.map((x) => `<option value="${esc(x)}">`).join('')}</datalist></label>
      ${input('Title *', 'title', d.title, `required placeholder="${tab === 'licenses' ? 'e.g. Home Health Agency License – Main office' : ''}"`)}
    </div>
    <div class="row">
      ${input(t.numberLabel, t.numberField, d[t.numberField])}
      ${input(t.agencyLabel, 'issuing_agency', d.issuing_agency, `placeholder="${esc(t.agencyHint)}"`)}
      <label>State${stateSelect('state', d.state, false)}</label>
    </div>
    <div class="row">
      ${input(t.startLabel, 'effective_date', d.effective_date, 'type="date"')}
      ${input(t.expiryLabel, 'expiry_date', d.expiry_date, 'type="date"')}
    </div>
    <label>Notes<textarea name="notes" rows="2">${esc(d.notes)}</textarea></label>`;
}

async function complianceList(view, tab) {
  const t = COMPLIANCE_TABS[tab];
  const c = state.companyId;
  const showArchived = sessionStorage.getItem('bc.showArchived') === '1';
  let query = sb.from('compliance_documents').select('*').eq('company_id', c).eq('category', t.category)
    .order('expiry_date', { nullsFirst: false });
  if (!showArchived) query = query.eq('archived', false);
  const [docs, files] = await Promise.all([
    q(query),
    q(sb.from('compliance_files').select('document_id').eq('company_id', c).not('document_id', 'is', null)),
  ]);
  const fileCount = (id) => files.filter((f) => f.document_id === id).length;

  view.innerHTML = `
    ${pageHead('Agency compliance', esc(companyName(c)))}
    ${complianceTabs(tab)}
    <details class="card">
      <summary class="btn">+ Add ${esc(t.singular)}</summary>
      <form id="new-item" class="stack">
        ${complianceFields(tab)}
        <div class="row">
          <label>Attachment<input type="file" name="file" accept="application/pdf,image/*,.doc,.docx"></label>
          ${input('Attachment note', 'file_note', '', 'placeholder="e.g. 2026 renewal certificate"')}
        </div>
        <button type="submit" class="btn">Save</button>
      </form>
    </details>
    <div class="filters">
      <label class="check chip-check"><input type="checkbox" id="archived" ${showArchived ? 'checked' : ''}> <span>Show archived</span></label>
    </div>
    <section class="card">
      ${docs.length ? `<div class="table-wrap"><table>
        <thead><tr><th>${esc(t.label)}</th><th>${esc(t.numberLabel)}</th><th>${esc(t.agencyLabel)}</th><th>${esc(t.expiryLabel)}</th><th>Files</th></tr></thead>
        <tbody>${docs.map((d) => `
          <tr class="clickable ${d.archived ? 'done' : ''}" data-open="${d.id}">
            <td><strong>${esc(d.title)}</strong> ${d.archived ? badge('Archived', 'neutral') : ''}
              <div class="muted small">${esc([d.doc_type, d.state].filter(Boolean).join(' · '))}</div></td>
            <td>${esc(d[t.numberField] || '—')}</td>
            <td>${esc(d.issuing_agency || '—')}</td>
            <td>${expiryBadge(d.expiry_date)}</td>
            <td>${fileCount(d.id) ? fileCount(d.id) : badge('None', 'warn')}</td>
          </tr>`).join('')}
        </tbody></table></div>` : `<p class="muted">No ${esc(t.label.toLowerCase())} yet.</p>`}
    </section>`;

  on(view, '#archived', 'change', (e) => {
    sessionStorage.setItem('bc.showArchived', e.target.checked ? '1' : '0');
    renderRoute();
  });
  on(view, '[data-open]', 'click', (e) => { location.hash = `#/compliance/item/${e.currentTarget.dataset.open}`; });
  on(view, '#new-item', 'submit', (e) => {
    e.preventDefault();
    const f = nullify(formData(e.target));
    const file = e.target.file.files[0];
    busy(e.target, async () => {
      const { file_note, file: _file, ...fields } = f;
      const created = await q(sb.from('compliance_documents').insert({ ...fields, company_id: c, category: t.category }).select().single());
      if (file) await uploadComplianceFile({ file, note: file_note, documentId: created.id });
      toast('Saved.');
      location.hash = `#/compliance/item/${created.id}`;
    });
  });
}

async function complianceItem(view, id) {
  const d = await q(sb.from('compliance_documents').select('*').eq('id', id).single());
  const tab = tabForCategory(d.category);
  const t = COMPLIANCE_TABS[tab];
  const isLicense = d.category === 'state_license';
  const [files, activity, revisions] = await Promise.all([
    q(sb.from('compliance_files').select('*').eq('document_id', id).order('uploaded_at', { ascending: false })),
    q(sb.from('compliance_activity').select('*').eq('document_id', id).order('at', { ascending: false })),
    isLicense ? q(sb.from('license_revisions').select('*').eq('license_id', id).order('created_at', { ascending: false })) : [],
  ]);
  const people = await actorNames([...files.map((f) => f.uploaded_by), ...activity.map((a) => a.actor)]);

  view.innerHTML = `
    <a href="#/compliance/${tab}" class="back">← ${esc(t.label)}</a>
    <div class="page-head">
      <h1>${esc(d.title)}</h1>
      <p class="muted">${esc(d.doc_type)} · ${expiryBadge(d.expiry_date)} ${d.archived ? badge('Archived', 'neutral') : ''}</p>
    </div>
    <form id="item" class="card stack">
      <h2>Details</h2>
      ${complianceFields(tab, d)}
      <div class="button-row">
        <button type="submit" class="btn">Save changes</button>
        <button type="button" class="btn btn-ghost" id="archive">${d.archived ? 'Restore from archive' : 'Archive (superseded)'}</button>
        ${isAdmin() ? '<button type="button" class="btn btn-danger" id="delete">Delete permanently</button>' : ''}
      </div>
    </form>
    <section class="card">
      <h2>Attachments</h2>
      <div id="files"></div>
    </section>
    ${isLicense ? `
    <section class="card">
      <h2>License revisions</h2>
      ${revisions.length ? `<ul class="list">${revisions.map((r) => `
        <li><span><a href="#/compliance/revision/${r.id}">${esc(r.title)}</a>
          <span class="muted small">· ${esc(r.requested_by)}${r.requested_date ? ', ' + fmtDate(r.requested_date) : ''}</span></span>
          ${revisionBadge(r.status)}</li>`).join('')}</ul>` : '<p class="muted">No revisions for this license.</p>'}
      <details class="cred-form">
        <summary class="btn btn-ghost">+ New revision for this license</summary>
        ${revisionForm({ license_id: id }, [d])}
      </details>
    </section>` : ''}
    <section class="card">
      <h2>History</h2>
      ${activityList(activity, people)}
    </section>`;

  renderAttachments(view.querySelector('#files'), files, people, { documentId: id });

  on(view, '#item', 'submit', (e) => {
    e.preventDefault();
    busy(e.target, async () => {
      await q(sb.from('compliance_documents').update(nullify(formData(e.target))).eq('id', id));
      toast('Saved.');
      renderRoute();
    });
  });
  on(view, '#archive', 'click', async () => {
    try {
      await q(sb.from('compliance_documents').update({ archived: !d.archived }).eq('id', id));
      toast(d.archived ? 'Restored.' : 'Archived. It stays on file for your records.');
      renderRoute();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  on(view, '#delete', 'click', async () => {
    if (prompt(`This permanently deletes "${d.title}", its ${files.length} attachment(s) and its revisions.\n\nType DELETE to confirm:`) !== 'DELETE') return;
    try {
      const revFiles = revisions.length
        ? await q(sb.from('compliance_files').select('file_path').in('revision_id', revisions.map((r) => r.id)))
        : [];
      const paths = [...files.map((f) => f.file_path), ...revFiles.map((f) => f.file_path)];
      await q(sb.from('license_revisions').delete().eq('license_id', id));
      await q(sb.from('compliance_documents').delete().eq('id', id));
      if (paths.length) await sb.storage.from('compliance-files').remove(paths);
      toast('Deleted.');
      location.hash = `#/compliance/${tab}`;
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  bindRevisionForm(view, (created) => { location.hash = `#/compliance/revision/${created.id}`; });
}

// ---------------------------------------------------------------------------
// License revisions (Department of Health corrections)
// ---------------------------------------------------------------------------

function revisionForm(r = {}, licenses) {
  return `
    <form class="stack" data-revision>
      <div class="row">
        <label>State license<select name="license_id">
          <option value="">— Not linked to a license —</option>
          ${licenses.map((l) => `<option value="${l.id}"${l.id === r.license_id ? ' selected' : ''}>${esc(l.title)}${l.number ? ` (${esc(l.number)})` : ''}</option>`).join('')}
        </select></label>
        ${input('What needs to be corrected? *', 'title', r.title, 'required placeholder="e.g. Update administrator name on license"')}
      </div>
      <div class="row">
        ${input('Requested by', 'requested_by', r.requested_by || 'Department of Health')}
        ${input('Date requested', 'requested_date', r.requested_date, 'type="date"')}
        ${input('Due date', 'due_date', r.due_date, 'type="date"')}
      </div>
      <label>Details<textarea name="description" rows="3" placeholder="Citation, deficiency or change requested">${esc(r.description)}</textarea></label>
      <button type="submit" class="btn">Open revision</button>
    </form>`;
}

function bindRevisionForm(view, after) {
  on(view, 'form[data-revision]', 'submit', (e) => {
    e.preventDefault();
    busy(e.target, async () => {
      const created = await q(sb.from('license_revisions')
        .insert({ ...nullify(formData(e.target)), company_id: state.companyId }).select().single());
      toast('Revision opened.');
      after(created);
    });
  });
}

async function revisionsList(view) {
  const c = state.companyId;
  const showAll = sessionStorage.getItem('bc.revAll') === '1';
  const [revisions, licenses, files] = await Promise.all([
    q(sb.from('license_revisions').select('*').eq('company_id', c).order('created_at', { ascending: false })),
    q(sb.from('compliance_documents').select('id, title, number').eq('company_id', c).eq('category', 'state_license').order('title')),
    q(sb.from('compliance_files').select('revision_id').eq('company_id', c).not('revision_id', 'is', null)),
  ]);
  const rows = showAll ? revisions : revisions.filter(revisionIsOpen);
  const licenseTitle = (lid) => licenses.find((l) => l.id === lid)?.title || '—';
  const fileCount = (rid) => files.filter((f) => f.revision_id === rid).length;

  view.innerHTML = `
    ${pageHead('Agency compliance', esc(companyName(c)))}
    ${complianceTabs('revisions')}
    <details class="card">
      <summary class="btn">+ New license revision</summary>
      ${revisionForm({}, licenses)}
    </details>
    <div class="filters">
      <button class="chip ${showAll ? '' : 'active'}" data-show="0">Open <span>${revisions.filter(revisionIsOpen).length}</span></button>
      <button class="chip ${showAll ? 'active' : ''}" data-show="1">All <span>${revisions.length}</span></button>
    </div>
    <section class="card">
      ${rows.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Revision</th><th>License</th><th>Requested</th><th>Due</th><th>Status</th><th>Files</th></tr></thead>
        <tbody>${rows.map((r) => `
          <tr class="clickable" data-open="${r.id}">
            <td><strong>${esc(r.title)}</strong></td>
            <td>${esc(licenseTitle(r.license_id))}</td>
            <td>${esc(r.requested_by)}<div class="muted small">${fmtDate(r.requested_date)}</div></td>
            <td>${r.due_date ? badge(fmtDate(r.due_date), revisionOverdue(r) ? 'danger' : 'neutral') : '—'}</td>
            <td>${revisionBadge(r.status)}</td>
            <td>${fileCount(r.id) || '—'}</td>
          </tr>`).join('')}
        </tbody></table></div>`
        : `<p class="muted">${showAll ? 'No revisions recorded yet.' : 'No open revisions.'}</p>`}
    </section>`;

  on(view, '[data-show]', 'click', (e) => {
    sessionStorage.setItem('bc.revAll', e.currentTarget.dataset.show);
    renderRoute();
  });
  on(view, '[data-open]', 'click', (e) => { location.hash = `#/compliance/revision/${e.currentTarget.dataset.open}`; });
  bindRevisionForm(view, (created) => { location.hash = `#/compliance/revision/${created.id}`; });
}

async function revisionDetail(view, id) {
  const r = await q(sb.from('license_revisions').select('*').eq('id', id).single());
  const [licenses, files, activity] = await Promise.all([
    q(sb.from('compliance_documents').select('id, title, number').eq('company_id', r.company_id).eq('category', 'state_license').order('title')),
    q(sb.from('compliance_files').select('*').eq('revision_id', id).order('uploaded_at', { ascending: false })),
    q(sb.from('compliance_activity').select('*').eq('revision_id', id).order('at', { ascending: false })),
  ]);
  const people = await actorNames([...files.map((f) => f.uploaded_by), ...activity.map((a) => a.actor)]);
  const statusOptions = Object.fromEntries(Object.entries(REVISION_STATUS).map(([k, [label]]) => [k, label]));

  view.innerHTML = `
    <a href="#/compliance/revisions" class="back">← License revisions</a>
    <div class="page-head">
      <h1>${esc(r.title)}</h1>
      <p class="muted">${revisionBadge(r.status)} ${revisionOverdue(r) ? badge(`Overdue since ${fmtDate(r.due_date)}`, 'danger') : ''}</p>
    </div>
    <form id="revision" class="card stack">
      <h2>Revision</h2>
      <div class="row">
        <label>State license<select name="license_id">
          <option value="">— Not linked —</option>
          ${licenses.map((l) => `<option value="${l.id}"${l.id === r.license_id ? ' selected' : ''}>${esc(l.title)}${l.number ? ` (${esc(l.number)})` : ''}</option>`).join('')}
        </select></label>
        ${input('What needs to be corrected? *', 'title', r.title, 'required')}
      </div>
      <div class="row">
        ${input('Requested by', 'requested_by', r.requested_by)}
        ${input('Date requested', 'requested_date', r.requested_date, 'type="date"')}
        ${input('Due date', 'due_date', r.due_date, 'type="date"')}
      </div>
      <label>Details<textarea name="description" rows="3">${esc(r.description)}</textarea></label>
      <div class="row">
        <label>Status<select name="status">${options(statusOptions, r.status)}</select></label>
        ${input('Date submitted to agency', 'submitted_date', r.submitted_date, 'type="date"')}
        ${input('Date accepted / closed', 'closed_date', r.closed_date, 'type="date"')}
      </div>
      <label>How it was corrected<textarea name="resolution" rows="3" placeholder="What was changed and submitted">${esc(r.resolution)}</textarea></label>
      <div class="button-row">
        <button type="submit" class="btn">Save changes</button>
        ${r.license_id ? `<a class="btn btn-ghost" href="#/compliance/item/${r.license_id}">Open license</a>` : ''}
        ${isAdmin() ? '<button type="button" class="btn btn-danger" id="delete">Delete permanently</button>' : ''}
      </div>
    </form>
    <section class="card">
      <h2>Attachments</h2>
      <p class="muted small">Keep the agency's letter, your corrected documents and the plan of correction here.</p>
      <div id="files"></div>
    </section>
    <section class="card">
      <h2>History</h2>
      ${activityList(activity, people)}
    </section>`;

  renderAttachments(view.querySelector('#files'), files, people, { revisionId: id });

  on(view, '#revision', 'submit', (e) => {
    e.preventDefault();
    const f = nullify(formData(e.target));
    // Fill in the milestone dates when the status moves on and they were left blank.
    if (f.status === 'submitted' && !f.submitted_date) f.submitted_date = today();
    if (['accepted', 'closed'].includes(f.status) && !f.closed_date) f.closed_date = today();
    busy(e.target, async () => {
      await q(sb.from('license_revisions').update(f).eq('id', id));
      toast('Saved.');
      renderRoute();
    });
  });
  on(view, '#delete', 'click', async () => {
    if (prompt(`This permanently deletes this revision and its ${files.length} attachment(s).\n\nType DELETE to confirm:`) !== 'DELETE') return;
    try {
      await q(sb.from('license_revisions').delete().eq('id', id));
      if (files.length) await sb.storage.from('compliance-files').remove(files.map((f) => f.file_path));
      toast('Deleted.');
      location.hash = '#/compliance/revisions';
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

// ---------------------------------------------------------------------------
// Attachments and history
// ---------------------------------------------------------------------------

async function uploadComplianceFile({ file, note, documentId, revisionId }) {
  if (file.size > MAX_UPLOAD) throw new Error('Files must be smaller than 20 MB.');
  const path = `${state.companyId}/${documentId || revisionId}/${crypto.randomUUID()}-${safeName(file.name)}`;
  await q(sb.storage.from('compliance-files').upload(path, file));
  const { error } = await sb.from('compliance_files').insert({
    company_id: state.companyId,
    document_id: documentId || null,
    revision_id: revisionId || null,
    file_path: path,
    file_name: file.name,
    size: file.size,
    note: note || null,
  });
  if (error) {
    await sb.storage.from('compliance-files').remove([path]);
    throw error;
  }
}

function renderAttachments(el, files, people, target) {
  el.innerHTML = `
    <form class="inline-form upload-row" id="attach">
      <input type="file" name="file" required accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx">
      <input name="note" placeholder="Note, e.g. 2027 renewal">
      <button type="submit" class="btn">Upload</button>
    </form>
    ${files.length ? `<div class="table-wrap"><table>
      <thead><tr><th>File</th><th>Uploaded</th><th></th></tr></thead>
      <tbody>${files.map((f, i) => `
        <tr>
          <td><strong>${esc(f.file_name)}</strong> ${i === 0 ? badge('Current', 'ok') : badge('Previous version', 'neutral')}
            ${f.note ? `<div class="muted small">${esc(f.note)}</div>` : ''}</td>
          <td>${fmtDateTime(f.uploaded_at)}<div class="muted small">${esc(people[f.uploaded_by] || 'BC HR & Compliance')} · ${fmtSize(f.size)}</div></td>
          <td class="actions">
            <button class="btn btn-sm btn-ghost" data-view="${f.id}">View</button>
            ${isAdmin() ? `<button class="btn btn-sm btn-danger" data-delete="${f.id}">Delete</button>` : ''}
          </td>
        </tr>`).join('')}
      </tbody></table></div>` : '<p class="muted">No attachments yet.</p>'}
    <p class="muted small">Uploading a new file keeps the earlier versions on record.</p>`;

  on(el, '#attach', 'submit', (e) => {
    e.preventDefault();
    const file = e.target.file.files[0];
    busy(e.target, async () => {
      await uploadComplianceFile({ file, note: e.target.note.value.trim(), ...target });
      toast('Uploaded.');
      renderRoute();
    });
  });
  on(el, '[data-view]', 'click', (e) => {
    const f = files.find((x) => x.id === e.currentTarget.dataset.view);
    openSignedFile('compliance-files', f.file_path, f.file_name, false);
  });
  on(el, '[data-delete]', 'click', async (e) => {
    const f = files.find((x) => x.id === e.currentTarget.dataset.delete);
    if (!confirm(`Permanently delete "${f.file_name}"? It will no longer be part of the record.`)) return;
    try {
      await q(sb.from('compliance_files').delete().eq('id', f.id));
      await sb.storage.from('compliance-files').remove([f.file_path]);
      toast('Deleted.');
      renderRoute();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

// Names for the people in a history list. Managers cannot look up BC HR staff,
// so anyone not found is shown as BC HR & Compliance.
async function actorNames(ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return {};
  const rows = await q(sb.from('profiles').select('id, full_name, email').in('id', unique));
  return Object.fromEntries(rows.map((p) => [p.id, personName(p)]));
}

function activityList(activity, people) {
  if (!activity.length) return '<p class="muted">No changes recorded yet.</p>';
  return `<ul class="timeline">${activity.map((a) => `
    <li><span class="when">${fmtDateTime(a.at)}</span>
      <span><strong>${esc(people[a.actor] || 'BC HR & Compliance')}</strong> · ${esc(a.action)}</span></li>`).join('')}</ul>`;
}
