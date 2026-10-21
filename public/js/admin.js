import { initStarfield } from './starfield.js';
import { escapeHtml, formatDate, safeUrl } from './markdown.js';
import { renderMarkdown } from './markdown.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const state = {
  data: null,
  panel: 'overview'
};

const PANEL_TITLES = {
  overview: '概览',
  profile: '个人信息',
  skills: '技能管理',
  projects: '项目管理',
  posts: '博客文章',
  messages: '留言收件箱',
  settings: '设置'
};

const ICONS = {
  pencil:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"/></svg>',
  trash:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5"/></svg>',
  eye:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>'
};

initStarfield($('#stars'));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
let toastTimer = 0;
function toast(message, type = 'success') {
  const el = $('#toast');
  if (!el) return;
  el.textContent = message;
  el.classList.toggle('error', type === 'error');
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('show'), 4200);
}

async function api(path, { method = 'GET', body } = {}) {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401) {
    showLogin();
    throw new Error(payload.error || '登录状态已失效，请重新登录');
  }
  if (!response.ok) throw new Error(payload.error || '操作失败，请稍后再试');
  return payload;
}

function field(form, name) {
  return form.elements.namedItem(name);
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function toDateInput(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function todayInput() {
  return toDateInput(new Date().toISOString());
}

function setBusy(button, busy, label) {
  if (!button) return;
  if (busy) {
    button.dataset.original = button.innerHTML;
    button.disabled = true;
    button.textContent = label || '保存中…';
  } else {
    button.disabled = false;
    if (button.dataset.original) {
      button.innerHTML = button.dataset.original;
      delete button.dataset.original;
    }
  }
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------
function showLogin() {
  $('#loginView').hidden = false;
  $('#adminApp').hidden = true;
  $('#bootScreen')?.setAttribute('hidden', '');
  $('#loginError').textContent = '';
  document.title = '登录 · 管理后台';
  window.setTimeout(() => $('#loginForm input[name="username"]')?.focus(), 60);
}

function showApp(username) {
  $('#loginView').hidden = true;
  $('#adminApp').hidden = false;
  $('#bootScreen')?.setAttribute('hidden', '');
  $('#adminUser').textContent = username || 'admin';
  $('#settingsUsername').textContent = username || 'admin';
  document.title = '概览 · 管理后台';
  setPanel(state.panel || 'overview');
}

function setPanel(panel, { silent = false } = {}) {
  state.panel = panel;
  $$('.side-link[data-panel]').forEach((button) => {
    button.classList.toggle('active', button.dataset.panel === panel);
  });
  $$('.panel').forEach((section) => {
    section.hidden = section.id !== `panel-${panel}`;
  });
  $('#panelTitle').textContent = PANEL_TITLES[panel] || '概览';
  document.title = `${PANEL_TITLES[panel] || '概览'} · 管理后台`;
  closeSidebar();
  if (!silent) {
    const main = $('.admin-main');
    if (main) main.scrollTo({ top: 0, behavior: 'smooth' });
    if (panel === 'profile') updateAvatarPreview(field($('#profileForm'), 'avatar_url')?.value);
    if (panel === 'settings') $('#settingsUsername').textContent = state.data?.admin?.username || 'admin';
  }
}

function closeSidebar() {
  $('#adminApp')?.classList.remove('sidebar-open');
  const scrim = $('#sidebarScrim');
  if (scrim) scrim.hidden = true;
  $('#sidebarToggle')?.setAttribute('aria-expanded', 'false');
}

// ---------------------------------------------------------------------------
// State loading & overview
// ---------------------------------------------------------------------------
async function loadState() {
  state.data = await api('/api/admin/state');
  renderAll();
}

function renderAll() {
  const data = state.data;
  if (!data) return;

  $$('[data-stat]').forEach((el) => {
    const key = el.dataset.stat;
    el.textContent = String(data.counts[key] ?? 0);
  });

  const unread = data.counts.unread || 0;
  const badge = $('#sidebarUnread');
  if (badge) {
    badge.hidden = unread === 0;
    badge.textContent = String(unread);
  }

  renderOverview();
  renderProfileForm();
  renderSkills();
  renderProjects();
  renderPosts();
  renderMessages();
  $('#settingsUsername').textContent = data.admin?.username || 'admin';
}

function renderOverview() {
  const data = state.data;
  const posts = data.posts.slice(0, 3);
  const messages = data.messages.slice(0, 3);

  $('#overviewPosts').innerHTML = posts.length
    ? posts
        .map(
          (post) => `
      <div class="mini-item">
        <div class="mini-item-main">
          <p class="mini-item-title">${escapeHtml(post.title)}</p>
          <p class="mini-item-sub">${escapeHtml(formatDate(post.created_at, { short: true }))} · ${
            post.published ? '已发布' : '草稿'
          }</p>
        </div>
        <span class="mini-item-badge">${post.read_minutes} min</span>
      </div>`
        )
        .join('')
    : '<p class="empty-inline">还没有文章，写一篇试试。</p>';

  $('#overviewMessages').innerHTML = messages.length
    ? messages
        .map(
          (message) => `
      <div class="mini-item">
        <div class="mini-item-main">
          <p class="mini-item-title">${escapeHtml(message.name)}<span class="mini-item-badge ${
            message.is_read ? '' : 'unread'
          }">${message.is_read ? '' : ' · 未读'}</span></p>
          <p class="mini-item-sub">${escapeHtml(message.content.slice(0, 48))}${
            message.content.length > 48 ? '…' : ''
          }</p>
        </div>
        <span class="mini-item-badge">${escapeHtml(formatDate(message.created_at, { short: true }))}</span>
      </div>`
        )
        .join('')
    : '<p class="empty-inline">暂时没有新留言。</p>';
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------
function updateAvatarPreview(url) {
  const container = $('#avatarPreview');
  if (!container) return;
  const src = safeUrl(url, '/assets/avatar.svg');
  container.innerHTML = `<img src="${escapeHtml(src)}" alt="头像预览">`;
}

function addSocialRow(label = '', url = '') {
  const editor = $('#socialEditor');
  if (!editor) return;
  if (editor.children.length >= 8) {
    toast('最多添加 8 个社交链接', 'error');
    return;
  }
  const row = document.createElement('div');
  row.className = 'social-edit-row';
  row.innerHTML = `
    <input type="text" data-social-label maxlength="20" placeholder="名称，如 GitHub">
    <input type="text" data-social-url maxlength="600" placeholder="https://… 或 mailto:…">
    <button class="remove-row" type="button" aria-label="删除链接">×</button>
  `;
  row.querySelector('[data-social-label]').value = label;
  row.querySelector('[data-social-url]').value = url;
  row.querySelector('.remove-row').addEventListener('click', () => row.remove());
  editor.append(row);
}

function renderProfileForm() {
  const form = $('#profileForm');
  if (!form || !state.data) return;
  const profile = state.data.profile;
  ['name', 'role', 'location', 'status', 'email', 'resume_url', 'tagline', 'avatar_url', 'bio'].forEach(
    (key) => {
      const input = field(form, key);
      if (input) input.value = profile[key] || '';
    }
  );
  updateAvatarPreview(profile.avatar_url);

  const editor = $('#socialEditor');
  if (editor) {
    editor.innerHTML = '';
    const socials = profile.socials?.length ? profile.socials : [{ label: '', url: '' }];
    socials.forEach((social) => addSocialRow(social.label, social.url));
  }
}

async function saveProfile(event) {
  event.preventDefault();
  const form = $('#profileForm');
  if (!form.reportValidity()) return;

  const socials = $$('.social-edit-row', $('#socialEditor'))
    .map((row) => ({
      label: row.querySelector('[data-social-label]').value.trim(),
      url: row.querySelector('[data-social-url]').value.trim()
    }))
    .filter((item) => item.label && item.url);

  const payload = {
    name: field(form, 'name').value,
    role: field(form, 'role').value,
    location: field(form, 'location').value,
    status: field(form, 'status').value,
    email: field(form, 'email').value,
    resume_url: field(form, 'resume_url').value,
    tagline: field(form, 'tagline').value,
    avatar_url: field(form, 'avatar_url').value,
    bio: field(form, 'bio').value,
    socials
  };

  const button = form.querySelector('button[type="submit"]');
  setBusy(button, true, '保存中…');
  try {
    await api('/api/admin/profile', { method: 'PUT', body: payload });
    await loadState();
    toast('个人信息已更新');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    setBusy(button, false);
  }
}

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------
function renderSkills() {
  const data = state.data;
  if (!data) return;
  const list = $('#skillsAdminList');
  const summary = $('#skillsSummary');
  if (!list) return;
  if (summary) summary.textContent = `共 ${data.skills.length} 项技能，按分类分组展示，可调整顺序。`;

  if (!data.skills.length) {
    list.innerHTML = '<p class="empty-inline">还没有技能，点击右上角添加。</p>';
    return;
  }

  list.innerHTML = data.skills
    .map(
      (skill, index) => `
    <div class="admin-row" data-id="${skill.id}">
      <div class="row-order">
        <button class="order-btn" type="button" data-action="up" aria-label="上移" ${
          index === 0 ? 'disabled' : ''
        }>▲</button>
        <button class="order-btn" type="button" data-action="down" aria-label="下移" ${
          index === data.skills.length - 1 ? 'disabled' : ''
        }>▼</button>
      </div>
      <div class="row-main">
        <div class="row-title">${escapeHtml(skill.name)}<span class="category-chip">${escapeHtml(
          skill.category
        )}</span></div>
        <div class="row-sub">熟练度 ${skill.level}%</div>
      </div>
      <div class="level-mini">
        <div class="level-mini-label">${skill.level}%</div>
        <div class="level-mini-track"><span style="width:${Math.max(
          0,
          Math.min(100, skill.level)
        )}%"></span></div>
      </div>
      <div class="row-actions">
        <button class="icon-btn" type="button" data-action="edit" aria-label="编辑技能">${ICONS.pencil}</button>
        <button class="icon-btn icon-btn--danger" type="button" data-action="delete" aria-label="删除技能">${ICONS.trash}</button>
      </div>
    </div>`
    )
    .join('');
}

function openSkillDialog(skill = null) {
  const dialog = $('#skillDialog');
  const form = $('#skillForm');
  form.reset();
  field(form, 'id').value = skill?.id || '';
  $('#skillDialogTitle').textContent = skill ? '编辑技能' : '新增技能';

  const categories = [...new Set((state.data?.skills || []).map((item) => item.category))];
  $('#categoryOptions').innerHTML = categories
    .map((category) => `<option value="${escapeHtml(category)}"></option>`)
    .join('');

  field(form, 'category').value = skill?.category || '';
  field(form, 'name').value = skill?.name || '';
  field(form, 'level').value = skill?.level ?? 80;
  $('#skillLevelOut').textContent = `${skill?.level ?? 80}%`;

  if (dialog.open) dialog.close();
  dialog.showModal();
  window.setTimeout(() => field(form, 'name').focus(), 40);
}

async function submitSkill(event) {
  event.preventDefault();
  const form = $('#skillForm');
  if (!form.reportValidity()) return;
  const id = field(form, 'id').value;
  const payload = {
    category: field(form, 'category').value,
    name: field(form, 'name').value,
    level: Number(field(form, 'level').value)
  };
  const button = form.querySelector('button[type="submit"]');
  setBusy(button, true, '保存中…');
  try {
    await api(id ? `/api/admin/skills/${id}` : '/api/admin/skills', {
      method: id ? 'PUT' : 'POST',
      body: payload
    });
    $('#skillDialog').close();
    await loadState();
    toast(id ? '技能已更新' : '技能已添加');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    setBusy(button, false);
  }
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------
function renderProjects() {
  const data = state.data;
  if (!data) return;
  const list = $('#projectsAdminList');
  if (!list) return;

  if (!data.projects.length) {
    list.innerHTML = '<p class="empty-inline">还没有项目，添加第一个吧。</p>';
    return;
  }

  list.innerHTML = data.projects
    .map((project, index) => {
      const cover = safeUrl(project.cover_url);
      return `
      <div class="admin-row" data-id="${project.id}">
        <div class="row-order">
          <button class="order-btn" type="button" data-action="up" aria-label="上移" ${
            index === 0 ? 'disabled' : ''
          }>▲</button>
          <button class="order-btn" type="button" data-action="down" aria-label="下移" ${
            index === data.projects.length - 1 ? 'disabled' : ''
          }>▼</button>
        </div>
        ${
          cover
            ? `<img class="project-thumb" src="${escapeHtml(cover)}" alt="" loading="lazy">`
            : '<div class="project-thumb" aria-hidden="true"></div>'
        }
        <div class="row-main">
          <div class="row-title">${escapeHtml(project.title)}${
            project.featured ? '<span class="featured-chip">精选</span>' : ''
          }</div>
          <div class="row-sub">${[project.year, (project.tech || []).join(' · ')]
            .filter(Boolean)
            .map(escapeHtml)
            .join(' · ') || '未填写技术栈'}</div>
        </div>
        <div class="row-actions">
          <button class="icon-btn" type="button" data-action="edit" aria-label="编辑项目">${ICONS.pencil}</button>
          <button class="icon-btn icon-btn--danger" type="button" data-action="delete" aria-label="删除项目">${ICONS.trash}</button>
        </div>
      </div>`;
    })
    .join('');
}

function updateCoverPreview(container, url) {
  if (!container) return;
  const safe = safeUrl(url);
  container.innerHTML = safe
    ? `<img src="${escapeHtml(safe)}" alt="封面预览">`
    : '<span>暂无封面</span>';
}

function openProjectDialog(project = null) {
  const dialog = $('#projectDialog');
  const form = $('#projectForm');
  form.reset();
  field(form, 'id').value = project?.id || '';
  $('#projectDialogTitle').textContent = project ? '编辑项目' : '新增项目';
  field(form, 'title').value = project?.title || '';
  field(form, 'year').value = project?.year || String(new Date().getFullYear());
  field(form, 'summary').value = project?.summary || '';
  field(form, 'tech').value = (project?.tech || []).join(', ');
  field(form, 'cover_url').value = project?.cover_url || '';
  field(form, 'demo_url').value = project?.demo_url || '';
  field(form, 'repo_url').value = project?.repo_url || '';
  field(form, 'description').value = project?.description || '';
  field(form, 'featured').checked = !!project?.featured;
  updateCoverPreview($('#projectCoverPreview'), project?.cover_url);

  if (dialog.open) dialog.close();
  dialog.showModal();
  window.setTimeout(() => field(form, 'title').focus(), 40);
}

async function submitProject(event) {
  event.preventDefault();
  const form = $('#projectForm');
  if (!form.reportValidity()) return;
  const id = field(form, 'id').value;
  const payload = {
    title: field(form, 'title').value,
    year: field(form, 'year').value,
    summary: field(form, 'summary').value,
    tech: field(form, 'tech').value,
    cover_url: field(form, 'cover_url').value,
    demo_url: field(form, 'demo_url').value,
    repo_url: field(form, 'repo_url').value,
    description: field(form, 'description').value,
    featured: field(form, 'featured').checked
  };
  const button = form.querySelector('button[type="submit"]');
  setBusy(button, true, '保存中…');
  try {
    await api(id ? `/api/admin/projects/${id}` : '/api/admin/projects', {
      method: id ? 'PUT' : 'POST',
      body: payload
    });
    $('#projectDialog').close();
    await loadState();
    toast(id ? '项目已更新' : '项目已添加');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    setBusy(button, false);
  }
}

// ---------------------------------------------------------------------------
// Posts
// ---------------------------------------------------------------------------
function renderPosts() {
  const data = state.data;
  if (!data) return;
  const list = $('#postsAdminList');
  if (!list) return;
  $('#postsSummary').textContent = `共 ${data.counts.posts} 篇文章，其中 ${data.counts.published} 篇已发布。草稿仅后台可见。`;

  if (!data.posts.length) {
    list.innerHTML = '<p class="empty-inline">还没有文章，写下第一篇吧。</p>';
    return;
  }

  list.innerHTML = data.posts
    .map(
      (post) => `
    <div class="admin-row" data-id="${post.id}">
      <div class="row-main">
        <div class="row-title">
          ${escapeHtml(post.title)}
          <span class="status-chip ${post.published ? 'status-chip--on' : 'status-chip--off'}">${
            post.published ? '已发布' : '草稿'
          }</span>
        </div>
        <div class="row-sub">${escapeHtml(post.slug)} · ${post.read_minutes} 分钟阅读${
          post.tags?.length ? ` · ${post.tags.map(escapeHtml).join(' / ')}` : ''
        }</div>
      </div>
      <span class="post-row-date">${escapeHtml(formatDate(post.created_at, { short: true }))}</span>
      <div class="row-actions">
        ${
          post.published
            ? `<a class="icon-btn" href="/#/post/${encodeURIComponent(
                post.slug
              )}" target="_blank" rel="noopener" aria-label="预览文章">${ICONS.eye}</a>`
            : ''
        }
        <button class="icon-btn" type="button" data-action="edit" aria-label="编辑文章">${ICONS.pencil}</button>
        <button class="icon-btn icon-btn--danger" type="button" data-action="delete" aria-label="删除文章">${ICONS.trash}</button>
      </div>
    </div>`
    )
    .join('');
}

function openPostDialog(post = null) {
  const dialog = $('#postDialog');
  const form = $('#postForm');
  form.reset();
  field(form, 'id').value = post?.id || '';
  $('#postDialogTitle').textContent = post ? '编辑文章' : '写文章';
  field(form, 'title').value = post?.title || '';
  field(form, 'slug').value = post?.slug || '';
  field(form, 'date').value = post ? toDateInput(post.created_at) : todayInput();
  field(form, 'excerpt').value = post?.excerpt || '';
  field(form, 'tags').value = (post?.tags || []).join(', ');
  field(form, 'cover_url').value = post?.cover_url || '';
  field(form, 'content').value = post?.content || '';
  field(form, 'published').checked = !!post?.published;

  updateCoverPreview($('#postCoverPreview'), post?.cover_url);
  $('#postPreview').hidden = true;
  $('#postContent').hidden = false;
  $$('.editor-tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.editorTab === 'write');
  });
  updateWordCount();

  if (dialog.open) dialog.close();
  dialog.showModal();
  window.setTimeout(() => field(form, 'title').focus(), 40);
}

function updateWordCount() {
  const content = $('#postContent')?.value || '';
  const count = content.replace(/\s/g, '').length;
  const el = $('#postWordCount');
  if (el) el.textContent = `${count} 字`;
}

function switchEditorTab(tab) {
  const preview = $('#postPreview');
  const textarea = $('#postContent');
  $$('.editor-tab').forEach((button) => {
    button.classList.toggle('active', button.dataset.editorTab === tab);
  });
  if (tab === 'preview') {
    preview.innerHTML =
      renderMarkdown(textarea.value) || '<p class="empty-inline">还没有内容可以预览。</p>';
    preview.hidden = false;
    textarea.hidden = true;
  } else {
    preview.hidden = true;
    textarea.hidden = false;
    textarea.focus();
  }
}

async function submitPost(event) {
  event.preventDefault();
  const form = $('#postForm');
  if (!form.reportValidity()) return;
  const id = field(form, 'id').value;
  const date = field(form, 'date').value;
  const payload = {
    title: field(form, 'title').value,
    slug: field(form, 'slug').value,
    excerpt: field(form, 'excerpt').value,
    tags: field(form, 'tags').value,
    cover_url: field(form, 'cover_url').value,
    content: field(form, 'content').value,
    published: field(form, 'published').checked,
    created_at: date || undefined
  };
  const button = form.querySelector('button[type="submit"]');
  setBusy(button, true, '保存中…');
  try {
    await api(id ? `/api/admin/posts/${id}` : '/api/admin/posts', {
      method: id ? 'PUT' : 'POST',
      body: payload
    });
    $('#postDialog').close();
    await loadState();
    toast(id ? '文章已更新' : '文章已保存');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    setBusy(button, false);
  }
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------
function renderMessages() {
  const data = state.data;
  if (!data) return;
  const list = $('#messagesAdminList');
  if (!list) return;

  const count = data.messages.length;
  const unread = data.counts.unread || 0;
  $('#messagesCount').textContent = count ? `${count} 条 · ${unread} 未读` : '0 条';

  if (!count) {
    list.innerHTML = '<p class="empty-inline">收件箱还是空的，等第一条留言吧。</p>';
    return;
  }

  list.innerHTML = data.messages
    .map(
      (message) => `
    <article class="message-card ${message.is_read ? '' : 'unread'}">
      <div class="message-head">
        <div class="message-who">
          ${message.is_read ? '' : '<span class="unread-dot" aria-label="未读"></span>'}
          <span class="message-name">${escapeHtml(message.name)}</span>
          ${
            message.email
              ? `<a class="message-mail" href="mailto:${escapeHtml(message.email)}">${escapeHtml(
                  message.email
                )}</a>`
              : ''
          }
        </div>
        <span class="message-date">${escapeHtml(formatDate(message.created_at, { short: true }))}</span>
      </div>
      <p class="message-body">${escapeHtml(message.content)}</p>
      <div class="message-actions">
        <button class="small-btn" type="button" data-message-action="toggle-read" data-id="${
          message.id
        }">${message.is_read ? '标为未读' : '标为已读'}</button>
        ${
          message.email
            ? `<a class="small-btn" href="mailto:${escapeHtml(message.email)}">回复邮件</a>`
            : ''
        }
        <button class="small-btn small-btn--danger" type="button" data-message-action="delete" data-id="${
          message.id
        }">删除</button>
      </div>
    </article>`
    )
    .join('');
}

// ---------------------------------------------------------------------------
// Event wiring
// ---------------------------------------------------------------------------
function initDialogs() {
  $$('[data-close]').forEach((button) => {
    button.addEventListener('click', () => {
      button.closest('dialog')?.close();
    });
  });
  $$('dialog').forEach((dialog) => {
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
    });
  });
}

function initSidebar() {
  $('#sidebarToggle')?.addEventListener('click', () => {
    const app = $('#adminApp');
    const open = !app.classList.contains('sidebar-open');
    app.classList.toggle('sidebar-open', open);
    $('#sidebarScrim').hidden = !open;
    $('#sidebarToggle').setAttribute('aria-expanded', String(open));
  });
  $('#sidebarScrim')?.addEventListener('click', closeSidebar);
  $$('.side-link[data-panel]').forEach((button) => {
    button.addEventListener('click', () => setPanel(button.dataset.panel));
  });
  $$('[data-goto]').forEach((button) => {
    button.addEventListener('click', () => setPanel(button.dataset.goto));
  });
}

function initOverview() {
  $$('[data-quick]').forEach((button) => {
    button.addEventListener('click', () => {
      if (button.dataset.quick === 'post') {
        setPanel('posts');
        openPostDialog();
      } else if (button.dataset.quick === 'project') {
        setPanel('projects');
        openProjectDialog();
      } else {
        setPanel('profile');
      }
    });
  });
}

function initProfile() {
  const form = $('#profileForm');
  form?.addEventListener('submit', saveProfile);
  $('#addSocialBtn')?.addEventListener('click', () => addSocialRow());

  field(form, 'avatar_url')?.addEventListener('input', (event) => {
    updateAvatarPreview(event.target.value);
  });
}

function initSkills() {
  $('#addSkillBtn')?.addEventListener('click', () => openSkillDialog());
  $('#skillForm')?.addEventListener('submit', submitSkill);
  field($('#skillForm'), 'level')?.addEventListener('input', (event) => {
    $('#skillLevelOut').textContent = `${event.target.value}%`;
  });

  $('#skillsAdminList')?.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const row = button.closest('[data-id]');
    const id = Number(row?.dataset.id);
    const skill = state.data?.skills.find((item) => item.id === id);
    if (!skill) return;

    if (button.dataset.action === 'edit') return openSkillDialog(skill);
    if (button.dataset.action === 'delete') {
      if (!window.confirm(`确定删除技能「${skill.name}」吗？`)) return;
      try {
        await api(`/api/admin/skills/${id}`, { method: 'DELETE' });
        await loadState();
        toast('技能已删除');
      } catch (error) {
        toast(error.message, 'error');
      }
      return;
    }
    if (button.dataset.action === 'up' || button.dataset.action === 'down') {
      try {
        await api(`/api/admin/skills/${id}/move`, {
          method: 'POST',
          body: { direction: button.dataset.action }
        });
        await loadState();
      } catch (error) {
        toast(error.message, 'error');
      }
    }
  });
}

function initProjects() {
  $('#addProjectBtn')?.addEventListener('click', () => openProjectDialog());
  $('#projectForm')?.addEventListener('submit', submitProject);

  $('#projectCoverUrl')?.addEventListener('input', (event) => {
    updateCoverPreview($('#projectCoverPreview'), event.target.value);
  });

  $('#projectsAdminList')?.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const row = button.closest('[data-id]');
    const id = Number(row?.dataset.id);
    const project = state.data?.projects.find((item) => item.id === id);
    if (!project) return;

    if (button.dataset.action === 'edit') return openProjectDialog(project);
    if (button.dataset.action === 'delete') {
      if (!window.confirm(`确定删除项目「${project.title}」吗？`)) return;
      try {
        await api(`/api/admin/projects/${id}`, { method: 'DELETE' });
        await loadState();
        toast('项目已删除');
      } catch (error) {
        toast(error.message, 'error');
      }
      return;
    }
    if (button.dataset.action === 'up' || button.dataset.action === 'down') {
      try {
        await api(`/api/admin/projects/${id}/move`, {
          method: 'POST',
          body: { direction: button.dataset.action }
        });
        await loadState();
      } catch (error) {
        toast(error.message, 'error');
      }
    }
  });
}

function initPosts() {
  $('#addPostBtn')?.addEventListener('click', () => openPostDialog());
  $('#postForm')?.addEventListener('submit', submitPost);
  $('#postContent')?.addEventListener('input', updateWordCount);

  $$('.editor-tab').forEach((button) => {
    button.addEventListener('click', () => switchEditorTab(button.dataset.editorTab));
  });

  $('#postCoverUrl')?.addEventListener('input', (event) => {
    updateCoverPreview($('#postCoverPreview'), event.target.value);
  });

  $('#postsAdminList')?.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const row = button.closest('[data-id]');
    const id = Number(row?.dataset.id);
    const post = state.data?.posts.find((item) => item.id === id);
    if (!post) return;

    if (button.dataset.action === 'edit') return openPostDialog(post);
    if (button.dataset.action === 'delete') {
      if (!window.confirm(`确定删除文章「${post.title}」吗？此操作无法撤销。`)) return;
      try {
        await api(`/api/admin/posts/${id}`, { method: 'DELETE' });
        await loadState();
        toast('文章已删除');
      } catch (error) {
        toast(error.message, 'error');
      }
    }
  });
}

function initMessages() {
  $('#messagesAdminList')?.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-message-action]');
    if (!button) return;
    const id = Number(button.dataset.id);
    const message = state.data?.messages.find((item) => item.id === id);
    if (!message) return;

    if (button.dataset.messageAction === 'delete') {
      if (!window.confirm(`确定删除来自「${message.name}」的留言吗？`)) return;
      try {
        await api(`/api/admin/messages/${id}`, { method: 'DELETE' });
        await loadState();
        toast('留言已删除');
      } catch (error) {
        toast(error.message, 'error');
      }
      return;
    }

    if (button.dataset.messageAction === 'toggle-read') {
      try {
        await api(`/api/admin/messages/${id}`, {
          method: 'PUT',
          body: { is_read: !message.is_read }
        });
        await loadState();
      } catch (error) {
        toast(error.message, 'error');
      }
    }
  });
}

function initSettings() {
  $('#passwordForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const current = field(form, 'current').value;
    const next = field(form, 'next').value;
    const confirm = field(form, 'confirm').value;
    if (next !== confirm) {
      toast('两次输入的新密码不一致', 'error');
      return;
    }
    const button = form.querySelector('button[type="submit"]');
    setBusy(button, true, '更新中…');
    try {
      await api('/api/admin/password', { method: 'PUT', body: { current, next } });
      form.reset();
      toast('密码已更新，其他设备已退出登录');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy(button, false);
    }
  });
}

function initAuth() {
  $('#loginForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const errorEl = $('#loginError');
    errorEl.textContent = '';
    const button = form.querySelector('button[type="submit"]');
    setBusy(button, true, '登录中…');
    try {
      const result = await api('/api/auth/login', {
        method: 'POST',
        body: {
          username: field(form, 'username').value.trim(),
          password: field(form, 'password').value
        }
      });
      form.reset();
      showApp(result.username);
      await loadState();
      setPanel(state.panel || 'overview');
    } catch (error) {
      errorEl.textContent = error.message;
    } finally {
      setBusy(button, false);
    }
  });

  $('#logoutButton')?.addEventListener('click', async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch {
      /* Already signed out. */
    }
    state.data = null;
    showLogin();
  });
}

async function boot() {
  initDialogs();
  initSidebar();
  initOverview();
  initProfile();
  initSkills();
  initProjects();
  initPosts();
  initMessages();
  initSettings();
  initAuth();

  try {
    const me = await api('/api/auth/me');
    if (me.authed) {
      showApp(me.username);
      await loadState();
      setPanel(state.panel || 'overview', { silent: true });
    } else {
      showLogin();
    }
  } catch (error) {
    showLogin();
    if (error.message) $('#loginError').textContent = '';
  }
}

boot();
