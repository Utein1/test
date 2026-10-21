import { initStarfield } from './starfield.js';
import {
  escapeHtml,
  formatDate,
  readingMinutes,
  renderMarkdown,
  safeUrl
} from './markdown.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const state = {
  data: null,
  cache: new Map(),
  lastFocus: null,
  scrollY: 0,
  currentSlug: null
};

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------
const ICONS = {
  github:
    '<path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.55v-2.1c-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.05 11.05 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.38-5.26 5.67.41.35.78 1.05.78 2.12v3.14c0 .3.21.67.8.55A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z"/>',
  mail:
    '<path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Zm-.4 3.2L12 12.4 4.4 7.2V6.4l7.6 5.2 7.6-5.2v.8Z"/>',
  x:
    '<path d="M18.9 2H22l-6.77 7.74L23.2 22h-6.23l-4.88-6.39L6.5 22H3.4l7.24-8.28L2.8 2h6.39l4.41 5.83L18.9 2Zm-1.1 18.2h1.73L8.28 3.7H6.43L17.8 20.2Z"/>',
  bilibili:
    '<path d="M17.8 4.5H21a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2h3.2L4.1 2.4 5.5 1l3.4 3.5h6.2L18.5 1l1.4 1.4-2.1 2.1ZM4 6.5v11h16v-11H4Zm4 4h2v4H8v-4Zm6 0h2v4h-2v-4Z"/>',
  rss:
    '<path d="M4 11a9 9 0 0 1 9 9h-3a6 6 0 0 0-6-6v-3Zm0-6a15 15 0 0 1 15 15h-3A12 12 0 0 0 4 8V5Zm2.5 11a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Z"/>',
  link:
    '<path d="M10.6 13.4a1 1 0 0 1 0-1.4l1.6-1.6a3 3 0 0 1 4.2 4.2l-1.7 1.7a1 1 0 1 1-1.4-1.4l1.7-1.7a1 1 0 0 0-1.4-1.4l-1.6 1.6a1 1 0 0 1-1.4 0Zm2.8-2.8a1 1 0 0 1 0 1.4l-1.6 1.6a3 3 0 0 1-4.2-4.2l1.7-1.7a1 1 0 1 1 1.4 1.4L9 10.8a1 1 0 0 0 1.4 1.4l1.6-1.6a1 1 0 0 1 1.4 0Z"/>'
};

function iconFor(label) {
  const value = String(label || '').toLowerCase();
  if (value.includes('git')) return 'github';
  if (value.includes('mail') || value.includes('email') || value.includes('邮')) return 'mail';
  if (value.includes('bilibili') || value.includes('b站')) return 'bilibili';
  if (value === 'x' || value.includes('twitter') || value.includes('推特')) return 'x';
  if (value.includes('rss') || value.includes('订阅')) return 'rss';
  return 'link';
}

function socialHtml(socials = []) {
  return socials
    .map((social) => {
      const url = safeUrl(social.url);
      if (!url) return '';
      const external = /^https?:/i.test(url);
      const icon = ICONS[iconFor(social.label)];
      return `<a class="social-link" href="${escapeHtml(url)}"${
        external ? ' target="_blank" rel="noopener noreferrer"' : ''
      } aria-label="${escapeHtml(social.label)}" title="${escapeHtml(social.label)}"><svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg></a>`;
    })
    .join('');
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------
let toastTimer = 0;
function showToast(message, type = 'success') {
  const toast = $('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.toggle('error', type === 'error');
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 4200);
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------
function setText(selector, value) {
  $$(selector).forEach((element) => {
    element.textContent = value ?? '';
  });
}

function renderProfile(profile) {
  setText('[data-profile-name]', profile.name || '于典');
  setText('[data-profile-role]', profile.role);
  setText('[data-profile-tagline]', profile.tagline);
  setText('[data-profile-location]', profile.location || '—');
  setText('[data-profile-status]', profile.status || '保持在线');

  $$('[data-profile-name]').forEach((el) => {
    if (el.closest('.brand-text')) el.textContent = profile.name || '于典';
  });

  const avatar = $('#profileAvatar');
  if (avatar) {
    avatar.src = safeUrl(profile.avatar_url, '/assets/avatar.svg');
    avatar.alt = `${profile.name || '于典'}的头像`;
    avatar.addEventListener(
      'error',
      () => {
        avatar.src = '/assets/avatar.svg';
      },
      { once: true }
    );
  }

  $$('[data-socials]').forEach((el) => {
    el.innerHTML = socialHtml(profile.socials);
  });

  const email = String(profile.email || '').trim();
  $$('[data-profile-email]').forEach((link) => {
    if (email) {
      link.href = `mailto:${email}`;
      link.textContent = email;
    } else {
      link.href = '#contact';
      link.textContent = '通过下方表单联系';
    }
  });

  const bio = $('[data-profile-bio]');
  if (bio) {
    bio.innerHTML = renderMarkdown(profile.bio) || '<p>这个人很神秘，还没有写下自我介绍。</p>';
  }

  const resume = $('#resumeLink');
  if (resume) {
    const url = safeUrl(profile.resume_url);
    if (url) {
      resume.href = url;
      resume.hidden = false;
    } else {
      resume.hidden = true;
    }
  }

  const name = profile.name || '于典';
  $$('.brand-mark').forEach((mark) => {
    mark.textContent = name.trim().slice(0, 1) || '于';
  });
  document.title = `${name}${profile.role ? ` · ${profile.role}` : ' · 个人网站'}`;
  const meta = document.querySelector('meta[name="description"]');
  if (meta) meta.setAttribute('content', `${name} — ${profile.tagline || '个人网站'}`);

  $$('[data-year]').forEach((el) => {
    el.textContent = String(new Date().getFullYear());
  });
}

function countUp(element, target) {
  const value = Number(target) || 0;
  if (reduceMotion) {
    element.textContent = String(value);
    return;
  }
  const duration = 900;
  const started = performance.now();
  function tick(now) {
    const progress = Math.min(1, (now - started) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    element.textContent = String(Math.round(value * eased));
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------
function renderSkills(skills = []) {
  const grid = $('#skillsGrid');
  if (!grid) return;

  if (!skills.length) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1">还没有添加技能，去后台加几个吧。</div>';
    return;
  }

  const groups = new Map();
  for (const skill of skills) {
    const category = skill.category || '其他';
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(skill);
  }

  grid.innerHTML = Array.from(groups.entries())
    .map(
      ([category, items], index) => `
      <article class="skill-group reveal" style="--delay:${index * 0.06}s">
        <header class="skill-group-head">
          <h3>${escapeHtml(category)}</h3>
          <span class="skill-count">${String(items.length).padStart(2, '0')}</span>
        </header>
        <div class="skill-list">
          ${items
            .map(
              (skill) => `
            <div class="skill-row">
              <div class="skill-top">
                <span class="skill-name">${escapeHtml(skill.name)}</span>
                <span class="skill-level">${skill.level}%</span>
              </div>
              <div class="skill-bar" role="presentation">
                <span style="--level:${Math.max(0, Math.min(100, skill.level))}%"></span>
              </div>
            </div>`
            )
            .join('')}
        </div>
      </article>`
    )
    .join('');
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------
function projectLinks(project) {
  const demo = safeUrl(project.demo_url);
  const repo = safeUrl(project.repo_url);
  const links = [];
  if (demo) {
    links.push(
      `<a class="project-link" href="${escapeHtml(demo)}" target="_blank" rel="noopener noreferrer"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>在线预览</a>`
    );
  }
  if (repo) {
    links.push(
      `<a class="project-link" href="${escapeHtml(repo)}" target="_blank" rel="noopener noreferrer"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>查看源码</a>`
    );
  }
  return links.length ? `<div class="project-links">${links.join('')}</div>` : '';
}

function techHtml(tech = []) {
  if (!tech.length) return '';
  return `<div class="tech-list">${tech
    .map((item) => `<span class="tech-chip">${escapeHtml(item)}</span>`)
    .join('')}</div>`;
}

function coverHtml(project, { hero = false } = {}) {
  if (project.cover_url) {
    return `<img src="${escapeHtml(safeUrl(project.cover_url))}" alt="${escapeHtml(
      project.title
    )} 的项目封面" loading="${hero ? 'eager' : 'lazy'}">`;
  }
  return `<div class="${
    hero ? 'project-hero-cover ' : 'project-cover '
  }project-cover--fallback"><span>${escapeHtml(
    (project.title || '项').trim().slice(0, 1)
  )}</span></div>`;
}

function renderProjects(projects = []) {
  const container = $('#projectsList');
  if (!container) return;

  if (!projects.length) {
    container.innerHTML = '<div class="empty-state">项目还在路上，稍后再来看看。</div>';
    return;
  }

  const heroProject = projects.find((project) => project.featured) || projects[0];
  const rest = projects.filter((project) => project.id !== heroProject.id);

  const heroMeta = [
    heroProject.featured ? '<span class="project-badge">精选项目</span>' : '',
    heroProject.year ? `<span>${escapeHtml(heroProject.year)}</span>` : ''
  ]
    .filter(Boolean)
    .join('');

  container.innerHTML = `
    <article class="project-hero reveal">
      <div class="project-hero-cover">
        ${coverHtml(heroProject, { hero: true })}
        <span class="cover-overlay" aria-hidden="true"></span>
      </div>
      <div class="project-hero-body">
        <div class="project-meta">${heroMeta}</div>
        <h3>${escapeHtml(heroProject.title)}</h3>
        <p class="project-summary">${escapeHtml(heroProject.summary)}</p>
        ${techHtml(heroProject.tech)}
        ${projectLinks(heroProject)}
      </div>
    </article>
    ${
      rest.length
        ? `<div class="projects-grid">${rest
            .map(
              (project, index) => `
          <article class="project-card reveal" style="--delay:${index * 0.06}s">
            <div class="project-cover">${coverHtml(project)}</div>
            <div class="project-body">
              <div class="project-meta">
                ${project.year ? `<span>${escapeHtml(project.year)}</span>` : ''}
                ${project.featured ? '<span class="project-badge">精选</span>' : ''}
              </div>
              <h3>${escapeHtml(project.title)}</h3>
              <p class="project-summary">${escapeHtml(project.summary)}</p>
              ${techHtml(project.tech)}
              ${projectLinks(project)}
            </div>
          </article>`
            )
            .join('')}</div>`
        : ''
    }
  `;
}

// ---------------------------------------------------------------------------
// Blog
// ---------------------------------------------------------------------------
function renderPosts(posts = []) {
  const grid = $('#postsGrid');
  if (!grid) return;

  if (!posts.length) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1">还没有发布文章。</div>';
    return;
  }

  grid.innerHTML = posts
    .map(
      (post, index) => `
      <a class="post-card reveal" href="#/post/${encodeURIComponent(post.slug)}" style="--delay:${
        Math.min(index, 5) * 0.05
      }s">
        <div class="post-card-top">
          <span>${escapeHtml(formatDate(post.created_at, { short: true }) || '—')}</span>
          <span class="post-card-index">${String(index + 1).padStart(2, '0')}</span>
        </div>
        <h3>${escapeHtml(post.title)}</h3>
        <p class="post-card-excerpt">${escapeHtml(post.excerpt)}</p>
        <div class="post-card-foot">
          <div class="post-tags">${post.tags
            .slice(0, 2)
            .map((tag) => `<span class="post-tag">${escapeHtml(tag)}</span>`)
            .join('')}<span class="post-tag">${post.read_minutes} 分钟</span></div>
          <span class="post-arrow" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M7 17 17 7M8 7h9v9"/></svg></span>
        </div>
      </a>`
    )
    .join('');
}

// ---------------------------------------------------------------------------
// Reveal on scroll
// ---------------------------------------------------------------------------
const revealObserver =
  'IntersectionObserver' in window
    ? new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add('in');
              revealObserver.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.08, rootMargin: '0px 0px -36px 0px' }
      )
    : null;

function observeReveals(root = document) {
  if (!revealObserver) {
    $$('.reveal', root).forEach((el) => el.classList.add('in'));
    return;
  }
  $$('.reveal', root).forEach((el) => revealObserver.observe(el));
}

// ---------------------------------------------------------------------------
// Article reader
// ---------------------------------------------------------------------------
const reader = $('#reader');
const readerProgress = $('#readerProgress');

function setArticleMeta(post) {
  $('[data-article-date]').textContent = formatDate(post.created_at);
  $('[data-article-time]').textContent = `${post.read_minutes || readingMinutes(post.content)} 分钟阅读`;
  $('[data-article-title]').textContent = post.title;
  $('[data-article-excerpt]').textContent = post.excerpt || '';
  $('[data-article-tags]').innerHTML = (post.tags || [])
    .map((tag) => `<span class="post-tag">${escapeHtml(tag)}</span>`)
    .join('');
}

function renderRelated(post) {
  const section = $('#relatedPosts');
  if (!section || !state.data) return;
  const related = state.data.posts
    .filter((item) => item.slug !== post.slug)
    .slice(0, 2);
  if (!related.length) {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  $('.related-grid', section).innerHTML = related
    .map(
      (item) => `
      <a class="related-card" href="#/post/${encodeURIComponent(item.slug)}">
        <span>${escapeHtml(formatDate(item.created_at, { short: true }))}</span>
        <h3>${escapeHtml(item.title)}</h3>
      </a>`
    )
    .join('');
}

function updateReadingProgress() {
  if (!reader || !readerProgress) return;
  const max = reader.scrollHeight - reader.clientHeight;
  const progress = max > 0 ? Math.min(1, reader.scrollTop / max) : 0;
  readerProgress.style.width = `${progress * 100}%`;
}

async function openPost(slug) {
  if (!reader || !slug) return;
  state.currentSlug = slug;

  if (!reader.classList.contains('open')) {
    state.lastFocus = document.activeElement;
    state.scrollY = window.scrollY;
    reader.classList.add('open');
    reader.setAttribute('aria-hidden', 'false');
    document.body.classList.add('no-scroll');
    setBackgroundInert(true);
    reader.scrollTop = 0;
    if (!reduceMotion) {
      window.setTimeout(() => $('#readerBack')?.focus({ preventScroll: true }), 50);
    }
  }

  const meta = state.data?.posts.find((post) => post.slug === slug);
  if (meta) setArticleMeta(meta);
  $('[data-article-title]').textContent = meta?.title || '加载中…';
  $('[data-article-body]').innerHTML = '<p>正在加载文章…</p>';
  const related = $('#relatedPosts');
  if (related) related.hidden = true;

  try {
    let post = state.cache.get(slug);
    if (!post) {
      const response = await fetch(`/api/posts/${encodeURIComponent(slug)}`, {
        headers: { Accept: 'application/json' }
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || '文章加载失败');
      post = payload.post;
      state.cache.set(slug, post);
    }

    setArticleMeta(post);
    $('[data-article-body]').innerHTML =
      renderMarkdown(stripLeadingHeading(post.content)) || '<p>这篇文章还在酝酿中。</p>';
    renderRelated(post);
    document.title = `${post.title} · ${state.data?.profile?.name || '于典'}`;
  } catch (error) {
    $('[data-article-body]').innerHTML = `<p>${escapeHtml(error.message)}</p>`;
    showToast(error.message, 'error');
  }

  reader.scrollTop = 0;
  updateReadingProgress();
}

function closeReader() {
  if (!reader || !reader.classList.contains('open')) return;
  reader.classList.remove('open');
  reader.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('no-scroll');
  setBackgroundInert(false);
  state.currentSlug = null;
  const name = state.data?.profile?.name || '于典';
  document.title = `${name} · 个人网站`;
  if (state.lastFocus && typeof state.lastFocus.focus === 'function') {
    state.lastFocus.focus({ preventScroll: true });
  }
}

function setBackgroundInert(value) {
  ['#main', '.site-header', '.site-footer'].forEach((selector) => {
    const element = $(selector);
    if (!element) return;
    if (value) element.setAttribute('inert', '');
    else element.removeAttribute('inert');
  });
}

function stripLeadingHeading(content) {
  const lines = String(content || '').replace(/\r\n?/g, '\n').split('\n');
  let index = 0;
  while (index < lines.length && !lines[index].trim()) index += 1;
  if (index < lines.length && /^#\s+/.test(lines[index])) {
    lines.splice(index, 1);
  }
  return lines.join('\n');
}

function backToBlog() {
  if (location.hash.startsWith('#/post/')) {
    location.hash = '#blog';
  } else {
    closeReader();
  }
}

function handleRoute() {
  if (!reader) return;
  const match = location.hash.match(/^#\/post\/(.+)$/);
  if (match) {
    let slug = match[1];
    try {
      slug = decodeURIComponent(slug);
    } catch {
      /* keep raw slug */
    }
    openPost(slug);
  } else {
    closeReader();
  }
}

// ---------------------------------------------------------------------------
// Header, navigation, reveal
// ---------------------------------------------------------------------------
function initChrome() {
  const header = $('#siteHeader');
  const toggle = $('#menuToggle');
  const nav = $('#siteNav');

  const onScroll = () => {
    header?.classList.toggle('scrolled', window.scrollY > 16);
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  const closeMenu = () => {
    document.body.classList.remove('nav-open');
    header?.classList.remove('nav-visible');
    toggle?.setAttribute('aria-expanded', 'false');
    toggle?.setAttribute('aria-label', '打开菜单');
  };

  toggle?.addEventListener('click', () => {
    const open = !document.body.classList.contains('nav-open');
    document.body.classList.toggle('nav-open', open);
    header?.classList.toggle('nav-visible', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? '关闭菜单' : '打开菜单');
  });

  $$('a', nav).forEach((link) => link.addEventListener('click', closeMenu));

  document.addEventListener('click', (event) => {
    if (!document.body.classList.contains('nav-open')) return;
    if (header && !header.contains(event.target)) closeMenu();
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeMenu();
      if (reader?.classList.contains('open')) backToBlog();
    }
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 880) closeMenu();
  });

  // Scroll spy
  const sections = ['about', 'skills', 'projects', 'blog', 'contact']
    .map((id) => document.getElementById(id))
    .filter(Boolean);
  const links = $$('[data-nav]');

  if ('IntersectionObserver' in window && sections.length) {
    const spy = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          links.forEach((link) => {
            link.classList.toggle('active', link.dataset.nav === entry.target.id);
          });
        });
      },
      { rootMargin: '-40% 0px -54% 0px', threshold: 0 }
    );
    sections.forEach((section) => spy.observe(section));
  }

  observeReveals();
}

// ---------------------------------------------------------------------------
// Reader chrome
// ---------------------------------------------------------------------------
function initReader() {
  reader?.addEventListener('scroll', updateReadingProgress, { passive: true });
  $('#readerBack')?.addEventListener('click', backToBlog);
  $('#articleBack')?.addEventListener('click', () => closeReader());
  $('#articleContact')?.addEventListener('click', () => closeReader());
  $('.reader-brand')?.addEventListener('click', (event) => {
    event.preventDefault();
    closeReader();
    location.hash = '#top';
  });
  window.addEventListener('hashchange', handleRoute);
}

// ---------------------------------------------------------------------------
// Contact form
// ---------------------------------------------------------------------------
function initContactForm() {
  const form = $('#contactForm');
  if (!form) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = $('button[type="submit"]', form);
    const payload = {
      name: form.elements.name.value.trim(),
      email: form.elements.email.value.trim(),
      content: form.elements.content.value.trim(),
      website: form.elements.website.value
    };

    if (!payload.name) {
      showToast('请先告诉我怎么称呼你', 'error');
      form.elements.name.focus();
      return;
    }
    if (payload.content.length < 5) {
      showToast('留言内容太短啦，至少写 5 个字', 'error');
      form.elements.content.focus();
      return;
    }

    button.disabled = true;
    const original = button.innerHTML;
    button.innerHTML = '<span>发送中…</span>';
    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || '发送失败，请稍后再试');
      form.reset();
      showToast('留言已送达，谢谢你 ✦');
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      button.disabled = false;
      button.innerHTML = original;
    }
  });
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------
async function loadSite() {
  try {
    const response = await fetch('/api/site', { headers: { Accept: 'application/json' } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || '内容加载失败');

    state.data = data;
    renderProfile(data.profile);
    renderSkills(data.skills);
    renderProjects(data.projects);
    renderPosts(data.posts);

    countUp($('[data-count-skills]'), data.counts.skills);
    countUp($('[data-count-projects]'), data.counts.projects);
    countUp($('[data-count-posts]'), data.counts.posts);

    observeReveals();
    handleRoute();
  } catch (error) {
    showToast(error.message || '网站内容加载失败，请刷新重试', 'error');
    const message = '<div class="empty-state">内容加载失败，请刷新页面重试。</div>';
    const skills = $('#skillsGrid');
    const projects = $('#projectsList');
    const posts = $('#postsGrid');
    if (skills) skills.innerHTML = message;
    if (projects) projects.innerHTML = message;
    if (posts) posts.innerHTML = message;
  }
}

initStarfield($('#stars'));
initChrome();
initReader();
initContactForm();
loadSite();
