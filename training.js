// Training: modules employees complete in the portal (content, video, PDF and a quiz
// graded in the database), training completed elsewhere, certificates, and a status grid
// for managers and BC HR admins.

const RENEWAL_CHOICES = { '': 'Never (one-time)', 6: 'Every 6 months', 12: 'Every year', 24: 'Every 2 years', 36: 'Every 3 years' };

// Newest passed record for a module, or the newest attempt if none passed.
function trainingStatus(module, completions) {
  const mine = completions
    .filter((c) => c.module_id === module.id)
    .sort((a, b) => b.completed_at.localeCompare(a.completed_at) || b.created_at.localeCompare(a.created_at));
  const passed = mine.find((c) => c.passed);
  if (passed) {
    if (passed.expires_at && passed.expires_at < today()) return { key: 'expired', record: passed };
    return { key: 'complete', record: passed };
  }
  return { key: mine.length ? 'failed' : 'todo', record: mine[0] || null };
}

function trainingBadge(status) {
  const r = status.record;
  if (status.key === 'complete') {
    if (!r.expires_at) return badge('Completed', 'ok');
    return daysUntil(r.expires_at) <= 30
      ? badge(`Renew by ${fmtDate(r.expires_at)}`, 'warn')
      : badge(`Valid until ${fmtDate(r.expires_at)}`, 'ok');
  }
  if (status.key === 'expired') return badge(`Expired ${fmtDate(r.expires_at)}`, 'danger');
  if (status.key === 'failed') return badge('Not passed yet', 'warn');
  return badge('Not started', 'neutral');
}

const isRequiredFor = (module, roleName) => module.active && module.required_for.includes(roleName);

async function loadTrainingModules() {
  let query = sb.from('training_modules').select('*').order('title');
  if (isAdmin()) query = query.or(`company_id.is.null,company_id.eq.${state.companyId}`);
  return q(query);
}

VIEWS.training = async (view, id, sub) => {
  if (id === 'take' && sub) return takeTraining(view, sub);
  if (id === 'certificate' && sub) return trainingCertificate(view, sub);
  if (id === 'mine') return myTraining(view);
  if (isStaff()) {
    if (needsCompany(view)) return;
    if (id === 'edit' && sub) return editTraining(view, sub);
    if (id === 'status') return trainingMatrix(view);
    return trainingLibrary(view);
  }
  return myTraining(view);
};

function trainingTabs(active) {
  return `<nav class="tabs">
    <a href="#/training" class="${active === 'modules' ? 'active' : ''}">Modules</a>
    <a href="#/training/status" class="${active === 'status' ? 'active' : ''}">Employee status</a>
    ${isManager() ? `<a href="#/training/mine" class="${active === 'mine' ? 'active' : ''}">My training</a>` : ''}
  </nav>`;
}

// ---------------------------------------------------------------------------
// Employee: my training
// ---------------------------------------------------------------------------

async function myTraining(view) {
  const [modules, completions] = await Promise.all([
    q(sb.from('training_modules').select('*').eq('active', true).order('title')),
    q(sb.from('training_completions').select('*').eq('user_id', state.user.id).order('completed_at', { ascending: false })),
  ]);
  const required = modules.filter((m) => isRequiredFor(m, role()));
  const optional = modules.filter((m) => !isRequiredFor(m, role()));
  const outside = completions.filter((c) => c.source === 'external');

  const card = (m) => {
    const st = trainingStatus(m, completions);
    const action = st.key === 'complete' ? 'Review' : st.key === 'todo' ? 'Start' : 'Retake';
    return `
      <article class="training-card">
        <div>
          <h3>${esc(m.title)}</h3>
          ${m.description ? `<p class="muted">${esc(m.description)}</p>` : ''}
          <p class="small">${trainingBadge(st)}
            ${m.renew_months ? `<span class="muted">· renews ${esc(RENEWAL_CHOICES[m.renew_months] || `every ${m.renew_months} months`).toLowerCase()}</span>` : ''}</p>
        </div>
        <div class="button-row">
          ${st.key === 'complete' ? `<a class="btn btn-ghost btn-sm" href="#/training/certificate/${st.record.id}">Certificate</a>` : ''}
          <a class="btn btn-sm ${st.key === 'complete' ? 'btn-ghost' : ''}" href="#/training/take/${m.id}">${action}</a>
        </div>
      </article>`;
  };

  view.innerHTML = `
    ${pageHead('My training', 'Complete required training here. Certificates are saved to your file.')}
    ${isManager() ? trainingTabs('mine') : ''}
    <section class="card">
      <h2>Required training</h2>
      ${required.length ? required.map(card).join('') : '<p class="muted">No required training right now.</p>'}
    </section>
    ${optional.length ? `<section class="card"><h2>Other training available</h2>${optional.map(card).join('')}</section>` : ''}
    <section class="card">
      <h2>Training completed elsewhere</h2>
      <p class="muted small">CPR, BLS, in-service or other classes you took outside the portal. Attach the certificate.</p>
      ${outside.length ? outsideTable(outside) : ''}
      <details class="cred-form" ${outside.length ? '' : 'open'}>
        <summary class="btn btn-ghost">+ Add training completed elsewhere</summary>
        ${outsideForm(false)}
      </details>
    </section>`;

  bindOutside(view, outside, state.user.id);
}

function outsideTable(rows) {
  return `<div class="table-wrap"><table>
    <thead><tr><th>Training</th><th>Completed</th><th>Valid until</th><th></th></tr></thead>
    <tbody>${rows.map((c) => `
      <tr>
        <td><strong>${esc(c.title)}</strong>${c.provider ? `<div class="muted small">${esc(c.provider)}</div>` : ''}</td>
        <td>${fmtDate(c.completed_at)}</td>
        <td>${c.expires_at ? expiryBadge(c.expires_at) : '<span class="muted">No expiry</span>'}</td>
        <td class="actions">${c.file_path ? `<button class="btn btn-sm btn-ghost" data-cert="${c.id}">Certificate</button>` : badge('No file', 'warn')}</td>
      </tr>`).join('')}
    </tbody></table></div>`;
}

function outsideForm(forStaff, people = []) {
  return `
    <form class="stack" id="outside">
      ${forStaff ? `<label>Employee *<select name="user_id" required>
        <option value="">Choose…</option>
        ${people.map((p) => `<option value="${p.id}">${esc(personName(p))}</option>`).join('')}
      </select></label>` : ''}
      <div class="row">
        ${input('Training *', 'title', '', 'required placeholder="e.g. CPR / BLS for Healthcare Providers"')}
        ${input('Provider', 'provider', '', 'placeholder="e.g. American Heart Association"')}
      </div>
      <div class="row">
        ${input('Date completed *', 'completed_at', today(), `type="date" required max="${today()}"`)}
        ${input('Valid until', 'expires_at', '', 'type="date"')}
        <label>Certificate${forStaff ? '' : ' *'}<input type="file" name="file" accept="application/pdf,image/*" ${forStaff ? '' : 'required'}></label>
      </div>
      <button type="submit" class="btn">Save</button>
    </form>`;
}

function bindOutside(view, rows, fixedUserId) {
  on(view, '#outside', 'submit', (e) => {
    e.preventDefault();
    const f = nullify(formData(e.target));
    const file = e.target.file.files[0];
    const userId = fixedUserId || f.user_id;
    busy(e.target, async () => {
      const row = {
        user_id: userId, title: f.title, provider: f.provider, source: 'external',
        completed_at: f.completed_at, expires_at: f.expires_at,
      };
      let uploaded = null;
      if (file) {
        if (file.size > MAX_UPLOAD) throw new Error('Files must be smaller than 20 MB.');
        uploaded = `${state.companyId}/${userId}/${crypto.randomUUID()}-${safeName(file.name)}`;
        await q(sb.storage.from('employee-files').upload(uploaded, file));
        Object.assign(row, { file_path: uploaded, file_name: file.name });
      }
      const { error } = await sb.from('training_completions').insert(row);
      if (error) {
        if (uploaded) await sb.storage.from('employee-files').remove([uploaded]);
        throw error;
      }
      toast('Training saved.');
      renderRoute();
    });
  });
  on(view, '[data-cert]', 'click', (e) => {
    const c = rows.find((x) => x.id === e.currentTarget.dataset.cert);
    openSignedFile('employee-files', c.file_path, c.file_name, false);
  });
}

// ---------------------------------------------------------------------------
// Taking a module
// ---------------------------------------------------------------------------

// YouTube and Vimeo links become an embedded player; anything else is a plain link.
function videoEmbed(url) {
  if (!url) return '';
  let src = null;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') src = `https://www.youtube-nocookie.com/embed/${u.pathname.slice(1)}`;
    else if (host.endsWith('youtube.com')) {
      const vid = u.searchParams.get('v') || u.pathname.split('/').filter(Boolean).pop();
      src = `https://www.youtube-nocookie.com/embed/${vid}`;
    } else if (host === 'vimeo.com') src = `https://player.vimeo.com/video/${u.pathname.split('/').filter(Boolean)[0]}`;
    else if (/\.(mp4|webm)$/i.test(u.pathname)) return `<video class="video" controls src="${esc(url)}"></video>`;
  } catch {
    return '';
  }
  return src
    ? `<div class="video"><iframe src="${esc(src)}" title="Training video" allow="fullscreen; picture-in-picture" allowfullscreen></iframe></div>`
    : `<p><a href="${esc(url)}" target="_blank" rel="noopener">▶ Watch the training video</a></p>`;
}

async function takeTraining(view, id) {
  const module = await q(sb.from('training_modules').select('*').eq('id', id).single());
  const [questions, completions] = await Promise.all([
    q(sb.from('training_questions').select('*').eq('module_id', id).order('position')),
    q(sb.from('training_completions').select('*').eq('user_id', state.user.id).eq('module_id', id)),
  ]);
  const st = trainingStatus(module, completions);

  view.innerHTML = `
    <a href="${isManager() ? '#/training/mine' : '#/training'}" class="back">← Training</a>
    ${pageHead(module.title, module.description ? esc(module.description) : '')}
    ${st.key === 'complete' ? `<div class="notice ok">You completed this on ${fmtDate(st.record.completed_at)}
      ${st.record.score != null ? `with ${st.record.score}%` : ''}. <a href="#/training/certificate/${st.record.id}">View certificate</a></div>` : ''}
    ${!module.active ? '<div class="notice warn">This module is inactive and cannot be completed right now.</div>' : ''}
    ${isAdmin() ? '<div class="notice info">Preview: this is what employees see. Admins cannot submit the quiz.</div>' : ''}
    <section class="card">
      <h2>Lesson</h2>
      ${videoEmbed(module.video_url)}
      ${module.file_path ? `<p><button class="btn btn-ghost btn-sm" id="pdf">📄 Open ${esc(module.file_name)}</button></p>` : ''}
      ${module.content ? `<div class="policy-body lesson">${esc(module.content)}</div>` : ''}
      ${!module.content && !module.video_url && !module.file_path ? '<p class="muted">No lesson content was added to this module.</p>' : ''}
    </section>
    <form id="quiz" class="card stack">
      <h2>${questions.length ? `Quiz <span class="muted small">· ${questions.length} question${questions.length === 1 ? '' : 's'}, pass mark ${module.passing_score}%</span>` : 'Confirm completion'}</h2>
      ${questions.map((qn, i) => `
        <fieldset class="question">
          <legend>${i + 1}. ${esc(qn.question)}</legend>
          ${qn.options.map((opt, j) => `
            <label class="check"><input type="radio" name="${qn.id}" value="${j}" required> <span>${esc(opt)}</span></label>`).join('')}
        </fieldset>`).join('')}
      ${questions.length ? '' : `<label class="check"><input type="checkbox" required>
        <span>I have read and understood this training.</span></label>`}
      <div id="result"></div>
      <button type="submit" class="btn" ${module.active && !isAdmin() ? '' : 'disabled'}>${questions.length ? 'Submit answers' : 'Mark as complete'}</button>
    </form>`;

  on(view, '#pdf', 'click', () => openSignedFile('training-files', module.file_path, module.file_name, false));
  on(view, '#quiz', 'submit', (e) => {
    e.preventDefault();
    const answers = {};
    questions.forEach((qn) => { answers[qn.id] = Number(e.target.querySelector(`input[name="${qn.id}"]:checked`).value); });
    busy(e.target, async () => {
      const [r] = await q(sb.rpc('submit_training_quiz', { module: id, answers }));
      const box = view.querySelector('#result');
      if (r.result_passed) {
        box.innerHTML = `<div class="notice ok"><strong>Passed${questions.length ? ` with ${r.result_score}%` : ''}.</strong>
          ${r.result_expires ? `Valid until ${fmtDate(r.result_expires)}.` : ''}
          <a href="#/training/certificate/${r.completion_id}">View your certificate →</a></div>`;
        e.target.querySelector('button[type="submit"]').hidden = true;
      } else {
        box.innerHTML = `<div class="notice danger"><strong>You scored ${r.result_score}%</strong> (${r.result_correct} of ${r.result_total} correct).
          You need ${module.passing_score}% to pass. Review the lesson and try again.</div>`;
      }
      box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });
}

// ---------------------------------------------------------------------------
// Certificate
// ---------------------------------------------------------------------------

async function trainingCertificate(view, id) {
  const c = await q(sb.from('training_completions').select('*').eq('id', id).single());
  let name = personName(state.profile);
  if (c.user_id !== state.user.id) {
    const p = await q(sb.from('profiles').select('full_name, email').eq('id', c.user_id).maybeSingle());
    name = personName(p);
  }
  const file = await q(sb.from('employee_profiles').select('legal_first_name, legal_last_name').eq('user_id', c.user_id).maybeSingle());
  if (file?.legal_first_name) name = `${file.legal_first_name} ${file.legal_last_name || ''}`.trim();

  view.innerHTML = `
    <div class="no-print button-row">
      <a href="${c.user_id === state.user.id ? (isManager() ? '#/training/mine' : '#/training') : `#/employees/${c.user_id}`}" class="back">← Back</a>
      <button class="btn btn-sm" id="print">Print / save as PDF</button>
    </div>
    <article class="certificate">
      <img src="brand/logo.png" alt="BC HR &amp; Compliance">
      <p class="cert-kicker">Certificate of completion</p>
      <p class="muted">This certifies that</p>
      <h1>${esc(name)}</h1>
      <p class="muted">has successfully completed</p>
      <h2>${esc(c.title)}</h2>
      <dl class="cert-meta">
        <div><dt>Completed</dt><dd>${fmtDate(c.completed_at)}</dd></div>
        ${c.score != null ? `<div><dt>Score</dt><dd>${c.score}%</dd></div>` : ''}
        ${c.expires_at ? `<div><dt>Valid until</dt><dd>${fmtDate(c.expires_at)}</dd></div>` : ''}
        <div><dt>Agency</dt><dd>${esc(companyName(c.company_id) || '—')}</dd></div>
      </dl>
      <p class="muted small">Record ID ${esc(c.id)}${c.provider ? ` · Provider: ${esc(c.provider)}` : ''}</p>
    </article>`;
  on(view, '#print', 'click', () => window.print());
}

// ---------------------------------------------------------------------------
// Staff: module library and editor
// ---------------------------------------------------------------------------

async function trainingLibrary(view) {
  const modules = await loadTrainingModules();
  const questions = modules.length
    ? await q(sb.from('training_questions').select('module_id').in('module_id', modules.map((m) => m.id)))
    : [];
  const qCount = (mid) => questions.filter((x) => x.module_id === mid).length;
  const scope = (m) => (m.company_id ? esc(companyName(m.company_id)) : 'All agencies');
  const roles = (m) => m.required_for.map((r) => (r === 'employee' ? 'Employees' : 'Managers')).join(', ') || 'Optional';

  view.innerHTML = `
    ${pageHead('Training', `${esc(companyName(state.companyId))} · modules employees complete in the portal.`)}
    ${trainingTabs('modules')}
    <p><a class="btn" href="#/training/edit/new">+ New module</a></p>
    <section class="card">
      ${modules.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Module</th><th>Available to</th><th>Required for</th><th>Renews</th><th>Quiz</th></tr></thead>
        <tbody>${modules.map((m) => `
          <tr class="clickable ${m.active ? '' : 'done'}" data-open="${m.id}">
            <td><strong>${esc(m.title)}</strong> ${m.active ? '' : badge('Inactive', 'neutral')}
              ${m.description ? `<div class="muted small">${esc(m.description)}</div>` : ''}</td>
            <td>${scope(m)}</td>
            <td>${roles(m)}</td>
            <td>${esc(RENEWAL_CHOICES[m.renew_months ?? ''] || `Every ${m.renew_months} months`)}</td>
            <td>${qCount(m.id) ? `${qCount(m.id)} questions · pass ${m.passing_score}%` : '<span class="muted">No quiz</span>'}</td>
          </tr>`).join('')}
        </tbody></table></div>`
        : '<p class="muted">No training modules yet. Create your first one, e.g. "Bloodborne Pathogens" or "HIPAA Basics".</p>'}
    </section>`;

  on(view, '[data-open]', 'click', (e) => { location.hash = `#/training/edit/${e.currentTarget.dataset.open}`; });
}

async function editTraining(view, id) {
  const isNew = id === 'new';
  const m = isNew
    ? { title: '', required_for: ['employee'], passing_score: 80, renew_months: 12, active: true, company_id: isAdmin() ? null : state.companyId }
    : await q(sb.from('training_modules').select('*').eq('id', id).single());
  const canEdit = isAdmin() || (m.company_id && m.company_id === state.profile.company_id);
  const questions = isNew ? [] : await q(sb.from('training_questions').select('*').eq('module_id', id).order('position'));
  const keys = questions.length && canEdit
    ? await q(sb.from('training_answer_keys').select('*').in('question_id', questions.map((x) => x.id)))
    : [];
  const keyFor = (qid) => keys.find((k) => k.question_id === qid)?.correct_index;
  const dis = canEdit ? '' : 'disabled';

  view.innerHTML = `
    <a href="#/training" class="back">← Training modules</a>
    ${pageHead(isNew ? 'New training module' : m.title, canEdit ? '' : 'Created by BC HR &amp; Compliance. You can preview it but not change it.')}
    <form id="module" class="card stack">
      <h2>Module</h2>
      ${input('Title *', 'title', m.title, `required ${dis} placeholder="e.g. Bloodborne Pathogens"`)}
      <label>Short description<input name="description" value="${esc(m.description)}" ${dis}></label>
      <div class="row">
        ${isAdmin() ? `<label>Available to<select name="company_id" ${dis}>
          <option value="">All agencies</option>
          <option value="${esc(state.companyId)}"${m.company_id === state.companyId ? ' selected' : ''}>${esc(companyName(state.companyId))} only</option>
        </select></label>` : ''}
        <label>Renewal<select name="renew_months" ${dis}>${options(RENEWAL_CHOICES, String(m.renew_months ?? ''))}</select></label>
        ${input('Pass mark (%)', 'passing_score', m.passing_score, `type="number" min="0" max="100" required ${dis}`)}
      </div>
      <fieldset class="checks"><legend>Required for</legend>
        <label class="check"><input type="checkbox" name="req_employee" ${m.required_for.includes('employee') ? 'checked' : ''} ${dis}> <span>Employees</span></label>
        <label class="check"><input type="checkbox" name="req_manager" ${m.required_for.includes('manager') ? 'checked' : ''} ${dis}> <span>Managers</span></label>
      </fieldset>
      ${input('Video link (YouTube, Vimeo or .mp4)', 'video_url', m.video_url, `type="url" ${dis} placeholder="https://www.youtube.com/watch?v=…"`)}
      <label>${m.file_path ? `Replace PDF (current: ${esc(m.file_name)})` : 'PDF handout (optional)'}<input type="file" name="file" accept="application/pdf" ${dis}></label>
      <label>Lesson text<textarea name="content" rows="10" ${dis} placeholder="The training content employees read before the quiz">${esc(m.content)}</textarea></label>
      <label class="check"><input type="checkbox" name="active" ${m.active ? 'checked' : ''} ${dis}> <span>Active (employees can take it)</span></label>
      ${canEdit ? `<div class="button-row">
        <button type="submit" class="btn">${isNew ? 'Create module' : 'Save module'}</button>
        ${isNew ? '' : `<a class="btn btn-ghost" href="#/training/take/${id}">Preview as employee</a>`}
        ${isNew ? '' : '<button type="button" class="btn btn-danger" id="delete">Delete module</button>'}
      </div>` : `<a class="btn btn-ghost" href="#/training/take/${id}">Preview</a>`}
    </form>
    ${isNew ? '<p class="muted">Save the module first, then add quiz questions.</p>' : `
    <section class="card">
      <h2>Quiz questions</h2>
      ${questions.length ? `<ol class="quiz-list">${questions.map((qn) => `
        <li>
          <div class="quiz-head"><strong>${esc(qn.question)}</strong>
            ${canEdit ? `<button class="btn btn-sm btn-danger" data-delq="${qn.id}">Remove</button>` : ''}</div>
          <ul>${qn.options.map((opt, j) => `<li class="${keyFor(qn.id) === j ? 'correct' : ''}">${esc(opt)}${keyFor(qn.id) === j ? ' ✓' : ''}</li>`).join('')}</ul>
        </li>`).join('')}</ol>` : '<p class="muted">No questions yet. Without questions, employees just confirm they completed the lesson.</p>'}
      ${canEdit ? `
      <details class="cred-form" ${questions.length ? '' : 'open'}>
        <summary class="btn btn-ghost">+ Add a question</summary>
        <form id="question" class="stack">
          ${input('Question *', 'question', '', 'required')}
          <p class="muted small">Fill in 2 to 6 answers and select the correct one.</p>
          ${[0, 1, 2, 3, 4, 5].map((j) => `
            <div class="answer-row">
              <input type="radio" name="correct" value="${j}" ${j === 0 ? 'required' : ''} aria-label="Correct answer ${j + 1}">
              <input name="opt${j}" placeholder="Answer ${j + 1}${j < 2 ? ' *' : ''}" ${j < 2 ? 'required' : ''}>
            </div>`).join('')}
          <button type="submit" class="btn">Add question</button>
        </form>
      </details>` : ''}
    </section>`}`;

  on(view, '#module', 'submit', (e) => {
    e.preventDefault();
    const f = formData(e.target);
    const file = e.target.file.files[0];
    const required_for = [f.req_employee && 'employee', f.req_manager && 'manager'].filter(Boolean);
    const row = nullify({
      title: f.title, description: f.description, content: f.content, video_url: f.video_url,
      passing_score: Number(f.passing_score), renew_months: f.renew_months ? Number(f.renew_months) : null,
      active: !!f.active,
    });
    row.required_for = required_for;
    row.company_id = isAdmin() ? (f.company_id || null) : state.profile.company_id;
    busy(e.target, async () => {
      let uploaded = null;
      if (file) {
        if (file.size > MAX_UPLOAD) throw new Error('Files must be smaller than 20 MB.');
        uploaded = `${row.company_id || 'all'}/${crypto.randomUUID()}-${safeName(file.name)}`;
        await q(sb.storage.from('training-files').upload(uploaded, file, { contentType: 'application/pdf' }));
        Object.assign(row, { file_path: uploaded, file_name: file.name });
      }
      try {
        const saved = isNew
          ? await q(sb.from('training_modules').insert(row).select().single())
          : await q(sb.from('training_modules').update(row).eq('id', id).select().single());
        if (uploaded && m.file_path) await sb.storage.from('training-files').remove([m.file_path]);
        toast(isNew ? 'Module created. Now add quiz questions.' : 'Saved.');
        if (isNew) location.hash = `#/training/edit/${saved.id}`;
        else renderRoute();
      } catch (err) {
        if (uploaded) await sb.storage.from('training-files').remove([uploaded]);
        throw err;
      }
    });
  });

  on(view, '#question', 'submit', (e) => {
    e.preventDefault();
    const f = formData(e.target);
    const filled = [0, 1, 2, 3, 4, 5].map((j) => ({ j, text: (f[`opt${j}`] || '').trim() })).filter((x) => x.text);
    const correct = filled.findIndex((x) => String(x.j) === f.correct);
    if (correct < 0) return toast('Select the correct answer next to a filled-in option.', 'error');
    busy(e.target, async () => {
      const created = await q(sb.from('training_questions').insert({
        module_id: id, position: questions.length, question: f.question.trim(), options: filled.map((x) => x.text),
      }).select().single());
      const { error } = await sb.from('training_answer_keys').insert({ question_id: created.id, correct_index: correct });
      if (error) {
        await sb.from('training_questions').delete().eq('id', created.id);
        throw error;
      }
      toast('Question added.');
      renderRoute();
    });
  });

  on(view, '[data-delq]', 'click', async (e) => {
    if (!confirm('Remove this question?')) return;
    try {
      await q(sb.from('training_questions').delete().eq('id', e.currentTarget.dataset.delq));
      renderRoute();
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  on(view, '#delete', 'click', async () => {
    if (!confirm(`Delete "${m.title}"? Employees' completion records and certificates are kept.`)) return;
    try {
      await q(sb.from('training_modules').delete().eq('id', id));
      if (m.file_path) await sb.storage.from('training-files').remove([m.file_path]);
      toast('Module deleted.');
      location.hash = '#/training';
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

// ---------------------------------------------------------------------------
// Staff: who has completed what
// ---------------------------------------------------------------------------

async function trainingMatrix(view) {
  const c = state.companyId;
  const [modules, people, completions] = await Promise.all([
    loadTrainingModules(),
    q(sb.from('profiles').select('id, email, full_name, role').eq('company_id', c).neq('role', 'admin').order('full_name')),
    q(sb.from('training_completions').select('*').eq('company_id', c).order('completed_at', { ascending: false })),
  ]);
  const required = modules.filter((m) => m.active && m.required_for.length);
  const outside = completions.filter((x) => x.source === 'external');
  const personById = (id) => people.find((p) => p.id === id);

  view.innerHTML = `
    ${pageHead('Training', `${esc(companyName(c))} · required training status for each person.`)}
    ${trainingTabs('status')}
    <section class="card">
      ${required.length && people.length ? `<div class="table-wrap"><table class="matrix">
        <thead><tr><th>Person</th>${required.map((m) => `<th>${esc(m.title)}</th>`).join('')}</tr></thead>
        <tbody>${people.map((p) => {
          const theirs = completions.filter((x) => x.user_id === p.id);
          return `<tr>
            <td><a href="#/employees/${p.id}"><strong>${esc(personName(p))}</strong></a><div class="muted small">${esc(ROLE_LABEL[p.role])}</div></td>
            ${required.map((m) => (isRequiredFor(m, p.role)
              ? `<td>${trainingBadge(trainingStatus(m, theirs))}</td>`
              : '<td><span class="muted small">Not required</span></td>')).join('')}
          </tr>`;
        }).join('')}</tbody></table></div>`
        : `<p class="muted">${people.length ? 'No required training modules yet.' : 'No people at this agency yet.'}</p>`}
    </section>
    <section class="card">
      <h2>Training completed elsewhere</h2>
      ${outside.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Person</th><th>Training</th><th>Completed</th><th>Valid until</th><th></th></tr></thead>
        <tbody>${outside.map((x) => `
          <tr>
            <td>${esc(personName(personById(x.user_id)))}</td>
            <td><strong>${esc(x.title)}</strong>${x.provider ? `<div class="muted small">${esc(x.provider)}</div>` : ''}</td>
            <td>${fmtDate(x.completed_at)}</td>
            <td>${x.expires_at ? expiryBadge(x.expires_at) : '<span class="muted">No expiry</span>'}</td>
            <td class="actions">${x.file_path ? `<button class="btn btn-sm btn-ghost" data-cert="${x.id}">Certificate</button>` : ''}</td>
          </tr>`).join('')}
        </tbody></table></div>` : '<p class="muted">None recorded yet.</p>'}
      <details class="cred-form">
        <summary class="btn btn-ghost">+ Record training for an employee</summary>
        ${outsideForm(true, people)}
      </details>
    </section>`;

  bindOutside(view, outside, null);
}

// Summary used on dashboards and employee files.
function requiredTrainingGaps(modules, completions, person) {
  return modules
    .filter((m) => isRequiredFor(m, person.role))
    .filter((m) => trainingStatus(m, completions.filter((x) => x.user_id === person.id)).key !== 'complete');
}
