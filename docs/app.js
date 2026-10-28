/* Repo Doctor - GitHub repository health checker */
const API = 'https://api.github.com';
const state = { model: null, repo: null, tree: null, readme: '', release: null, result: null, full: '' };

const els = {
  form: document.getElementById('repoForm'),
  input: document.getElementById('repoInput'),
  status: document.getElementById('status'),
  report: document.getElementById('report'),
  avatar: document.getElementById('avatar'),
  repoName: document.getElementById('repoName'),
  repoDesc: document.getElementById('repoDesc'),
  repoFacts: document.getElementById('repoFacts'),
  scoreRing: document.getElementById('scoreRing'),
  scoreNumber: document.getElementById('scoreNumber'),
  scoreLevel: document.getElementById('scoreLevel'),
  scoreSummary: document.getElementById('scoreSummary'),
  passSummary: document.getElementById('passSummary'),
  categoryBars: document.getElementById('categoryBars'),
  checkList: document.getElementById('checkList'),
  fixList: document.getElementById('fixList'),
  copyBadge: document.getElementById('copyBadge'),
  copyReport: document.getElementById('copyReport'),
};

function showStatus(message, error = false) {
  els.status.hidden = false;
  els.status.className = error ? 'status error' : 'status';
  els.status.innerHTML = message;
}

function hideStatus() {
  els.status.hidden = true;
  els.status.innerHTML = '';
}

function normalizeRepo(value) {
  const text = String(value || '').trim();
  if (!text) throw new Error('请输入 GitHub 仓库地址。');
  let match = text.match(/^https?:\/\/(?:www\.)?github\.com\/([^\/\s]+)\/([^\/\s#?]+?)(?:\.git)?\/?(?:[?#].*)?$/i);
  if (match) return `${match[1]}/${match[2]}`;
  match = text.match(/^https?:\/\/api\.github\.com\/repos\/([^\/\s]+)\/([^\/\s#?]+?)(?:\/.*)?(?:[?#].*)?$/i);
  if (match) return `${match[1]}/${match[2]}`;
  match = text.match(/^([\w.-]+)\/([\w.-]+)$/);
  if (match) return `${match[1]}/${match[2]}`;
  throw new Error('无法识别仓库地址，请使用 https://github.com/owner/repo 或 owner/repo。');
}

async function gh(path, allow404 = true) {
  const response = await fetch(`${API}${path}`, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (allow404 && response.status === 404) return null;
  if (!response.ok) {
    if (response.status === 403 || response.status === 429) {
      const remaining = response.headers.get('X-RateLimit-Remaining');
      throw new Error(`GitHub API 请求额度不足${remaining ? `（剩余 ${remaining}）` : ''}，请稍后再试。`);
    }
    throw new Error(`GitHub API 错误：HTTP ${response.status}`);
  }
  return response.json();
}

function decodeBase64Utf8(content) {
  const binary = atob(String(content).replace(/\n/g, ''));
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodePath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

function daysSince(dateString) {
  const time = Date.parse(dateString);
  if (!Number.isFinite(time)) return Infinity;
  return Math.max(0, (Date.now() - time) / 86400000);
}

function treeHas(tree, candidates) {
  if (!tree) return false;
  return candidates.some(candidate => tree.some(item => item.path.toLowerCase() === candidate.toLowerCase()));
}

function includesAny(text, terms) {
  const lower = text.toLowerCase();
  return terms.some(term => lower.includes(term));
}

function result(check, status, note, partial = 0) {
  let score = 0;
  if (status === 'pass') score = check.weight;
  if (status === 'warn') score = Math.round(check.weight * (partial || 0.6));
  return { id: check.id, status, score: Math.min(score, check.weight), note };
}

function evaluateCheck(check) {
  const repo = state.repo;
  const readme = state.readme;
  const tree = state.tree;

  switch (check.id) {
    case 'readme-quality':
      if (!readme) return result(check, 'fail', '未找到 README。');
      if (readme.length >= 500) return result(check, 'pass', `README 约 ${readme.length.toLocaleString()} 字符，内容充分。`);
      if (readme.length >= 150) return result(check, 'warn', 'README 偏短，建议补充使用说明、截图和路线图。');
      return result(check, 'fail', 'README 过短，无法体现项目价值。');

    case 'quickstart':
      if (!readme) return result(check, 'fail', '缺少 README，无法判断安装与使用方式。');
      if (includesAny(readme, ['quickstart', 'getting started', 'installation', 'usage', 'how to install', '快速开始', '快速上手', '安装方法', '安装指南', '使用方法', '使用说明'])) {
        return result(check, 'pass', '找到安装、快速开始或使用说明。');
      }
      if (includesAny(readme, ['npm install', 'pip install', 'docker', 'git clone', 'npm ', 'pip ', 'yarn '])) {
        return result(check, 'warn', 'README 有安装命令，但缺少清晰的快速开始章节。');
      }
      return result(check, 'fail', '没有找到安装或使用说明，新用户难以起步。');

    case 'visual-demo':
      if (readme && /!\[[^\]]*\]\(/i.test(readme)) return result(check, 'pass', 'README 中包含截图或视觉示例。');
      if (readme && /<img/i.test(readme)) return result(check, 'pass', 'README 中包含图片元素。');
      if (repo.homepage && /^https?:\/\//i.test(repo.homepage)) return result(check, 'warn', '主页链接可承担演示作用，建议 README 也加入截图。', 0.75);
      if (treeHas(tree, ['docs/index.html', 'demo/index.html', 'examples'])) return result(check, 'warn', '仓库中有演示文件，建议在 README 顶部突出入口。', 0.75);
      return result(check, 'fail', '缺少截图、演示链接或视觉示例。');

    case 'repo-metadata': {
      const hasDesc = Boolean(repo.description);
      const hasHome = Boolean(repo.homepage);
      if (hasDesc && hasHome) return result(check, 'pass', '描述和主页字段均已配置。');
      if (hasDesc || hasHome) return result(check, 'warn', '描述或主页字段仍缺失一项。');
      return result(check, 'fail', '仓库描述和主页字段均为空。');
    }

    case 'readme-badges':
      if (includesAny(readme, ['img.shields.io', 'badgen.net', 'flat.badgen.net', 'badge.svg'])) {
        return result(check, 'pass', 'README 使用了状态徽章。');
      }
      return result(check, 'fail', 'README 未使用徽章，建议加入 License、版本或构建状态。');

    case 'license':
      if (repo.license) return result(check, 'pass', `检测到 ${repo.license.name || '许可证'}。`);
      if (treeHas(tree, ['license', 'license.md', 'license.txt', 'copying'])) return result(check, 'pass', '检测到许可证文件。');
      return result(check, 'fail', '未检测到许可证，企业用户通常不敢直接采用。');

    case 'recent-activity': {
      const days = daysSince(repo.pushed_at);
      if (days <= 180) return result(check, 'pass', `最近一次推送距今约 ${Math.round(days)} 天。`);
      return result(check, 'fail', `仓库超过 ${Math.round(days)} 天没有代码更新。`);
    }

    case 'release-history':
      if (state.release) return result(check, 'pass', `最新 Release：${state.release.tag_name || '未命名版本'}。`);
      if (treeHas(tree, ['changelog', 'changelog.md', 'changes.md', 'history.md'])) return result(check, 'pass', '未找到 Release，但检测到 CHANGELOG。');
      return result(check, 'fail', '缺少 Release 和 CHANGELOG，用户难以判断版本变化。');

    case 'security-policy':
      if (treeHas(tree, ['security.md', 'security', 'docs/security.md', '.github/security.md'])) return result(check, 'pass', '检测到安全披露政策。');
      return result(check, 'fail', '缺少 SECURITY.md，漏洞报告缺少明确路径。');

    case 'topics': {
      const count = Array.isArray(repo.topics) ? repo.topics.length : 0;
      if (count >= 3) return result(check, 'pass', `已设置 ${count} 个 Topics。`);
      return result(check, 'fail', `Topics 仅 ${count} 个，建议至少设置 3-5 个核心关键词。`);
    }

    case 'contributing':
      if (treeHas(tree, ['contributing.md', 'docs/contributing.md', '.github/contributing.md'])) return result(check, 'pass', '检测到贡献指南。');
      return result(check, 'fail', '缺少 CONTRIBUTING.md，首次贡献者不知道如何参与。');

    case 'issue-templates': {
      const has = treeHas(tree, ['.github/issue_template', '.github/issue_template.md', '.github/issue_template.yml', '.github/issue_templates']);
      const hasModern = state.tree.some(item => item.path.toLowerCase().startsWith('.github/issue_template'));
      if (hasModern || has) return result(check, 'pass', '检测到 Issue 模板。');
      return result(check, 'fail', '缺少 Issue 模板，用户反馈质量难控制。');
    }

    case 'pr-template': {
      const has = treeHas(tree, ['.github/pull_request_template.md', '.github/pull_request_template', 'pull_request_template.md', 'docs/pull_request_template.md']);
      if (has) return result(check, 'pass', '检测到 Pull Request 模板。');
      return result(check, 'fail', '缺少 PR 模板，贡献者容易漏写测试和风险说明。');
    }

    case 'code-of-conduct':
      if (treeHas(tree, ['code_of_conduct.md', 'docs/code_of_conduct.md', '.github/code_of_conduct.md'])) return result(check, 'pass', '检测到行为准则。');
      return result(check, 'fail', '缺少 Code of Conduct。');

    case 'funding':
      if (treeHas(tree, ['.github/funding.yml'])) return result(check, 'pass', '检测到赞助或支持入口。');
      return result(check, 'fail', '未配置 FUNDING.yml。');

    case 'bilingual-docs': {
      const hasEnglishFile = state.tree.some(item => /^readme(_|\.)?(en|english)?(\.md)?$/i.test(item.path) && /en|english/i.test(item.path));
      const hasEnglishSection = /english|中文|简体中文|chinese|日本語|日本語/.test(readme);
      const englishWords = (readme.match(/\b[a-zA-Z]{3,}\b/g) || []).length;
      if (hasEnglishFile) return result(check, 'pass', '检测到英文或双语 README 文件。');
      if (hasEnglishSection && englishWords >= 40) return result(check, 'pass', 'README 中包含中英双语说明。');
      if (englishWords >= 80) return result(check, 'pass', 'README 主体为英文，便于国际传播。');
      return result(check, 'fail', '缺少英文或双语说明，国际传播受限。');
    }

    case 'share-ready-description': {
      const desc = String(repo.description || '').trim();
      if (desc.length >= 30 && desc.length <= 160 && !/todo|tbd|placeholder|your /i.test(desc)) {
        return result(check, 'pass', '描述长度适中，适合搜索和社交分享。');
      }
      if (desc) return result(check, 'warn', '描述长度不适合分享卡片，建议控制在 30-160 字符。');
      return result(check, 'fail', '仓库描述为空，分享卡片缺少核心卖点。');
    }

    default:
      return result(check, 'fail', '该检查项尚未实现。');
  }
}

function scoreColor(score) {
  if (score >= 90) return 'brightgreen';
  if (score >= 75) return 'green';
  if (score >= 60) return 'yellow';
  if (score >= 40) return 'orange';
  return 'red';
}

function scoreLevel(score) {
  if (score >= 90) return '优秀';
  if (score >= 75) return '良好';
  if (score >= 60) return '基础合格';
  if (score >= 40) return '需要改进';
  return '存在硬伤';
}

function checkModel(model) {
  const errors = [];
  const checkIds = new Set();
  const categoryIds = new Set(model.categories.map(category => category.id));
  let total = 0;
  model.checks.forEach(check => {
    if (checkIds.has(check.id)) errors.push(`重复检查项：${check.id}`);
    checkIds.add(check.id);
    if (!categoryIds.has(check.category)) errors.push(`未知分类：${check.id}`);
    if (!Number.isInteger(check.weight) || check.weight <= 0) errors.push(`权重无效：${check.id}`);
    total += check.weight;
  });
  if (total !== model.maxScore) errors.push(`权重总和 ${total} 不等于 ${model.maxScore}`);
  if (errors.length) throw new Error(errors.join('；'));
}

async function loadModel() {
  const response = await fetch('checks.json');
  if (!response.ok) throw new Error(`无法加载检查模型：HTTP ${response.status}`);
  const model = await response.json();
  checkModel(model);
  state.model = model;
}

async function analyze(input) {
  state.full = normalizeRepo(input);
  hideStatus();
  els.report.hidden = true;

  showStatus('正在读取 GitHub 仓库与文件结构……');
  const repo = await gh(`/repos/${encodePath(state.full)}`, false);
  state.repo = repo;
  const branch = repo.default_branch || 'main';

  showStatus('正在解析 README、Release 和检查文件……');
  const [treeData, readmeData, release] = await Promise.all([
    gh(`/repos/${encodePath(state.full)}/git/trees/${encodeURIComponent(branch)}?recursive=1`),
    gh(`/repos/${encodePath(state.full)}/readme`),
    gh(`/repos/${encodePath(state.full)}/releases/latest`),
  ]);
  state.tree = treeData?.tree || [];
  state.readme = readmeData?.content ? decodeBase64Utf8(readmeData.content) : '';
  state.release = release;

  const details = state.model.checks.map(check => ({ ...check, ...evaluateCheck(check) }));
  const score = details.reduce((sum, item) => sum + item.score, 0);
  state.result = { details, score };

  renderReport();
  hideStatus();
  updateQuery();
}

function renderReport() {
  const repo = state.repo;
  const details = state.result.details;
  const score = state.result.score;
  const pass = details.filter(item => item.status === 'pass').length;
  const warn = details.filter(item => item.status === 'warn').length;
  const fail = details.filter(item => item.status === 'fail').length;

  els.report.hidden = false;
  els.avatar.src = repo.owner?.avatar_url || '';
  els.avatar.alt = `${repo.full_name} avatar`;
  els.repoName.innerHTML = `<a href="${repo.html_url}" target="_blank" rel="noopener">${repo.full_name}</a>`;
  els.repoDesc.textContent = repo.description || '暂无描述';
  els.repoFacts.innerHTML = [
    `⭐ ${repo.stargazers_count ?? 0}`,
    `🍴 ${repo.forks_count ?? 0}`,
    `🐞 Issues ${(repo.open_issues_count ?? 0).toLocaleString()}`,
    `🌿 ${repo.default_branch || 'main'}`,
    `📅 更新 ${new Date(repo.pushed_at).toLocaleDateString('zh-CN')}`,
  ].map(value => `<span>${value}</span>`).join('');

  els.scoreRing.style.setProperty('--score', `${score}%`);
  els.scoreRing.style.background = `conic-gradient(var(--green) ${score}%, rgba(255,255,255,.1) 0)`;
  els.scoreNumber.textContent = score;
  els.scoreLevel.textContent = scoreLevel(score);
  els.scoreSummary.textContent = `${pass} 项通过，${warn} 项部分通过，${fail} 项未通过。`;
  els.passSummary.textContent = `满分 100，当前 ${score} 分`;

  els.categoryBars.innerHTML = state.model.categories.map(category => {
    const items = details.filter(item => item.category === category.id);
    const actual = items.reduce((sum, item) => sum + item.score, 0);
    const max = items.reduce((sum, item) => sum + item.weight, 0);
    const percent = max ? Math.round((actual / max) * 100) : 0;
    return `<article class="catbar"><strong><span>${category.icon} ${category.name}</span><span>${actual}/${max}</span></strong><div class="track"><div class="fill" style="width:${percent}%"></div></div><p class="label">${category.description}</p></article>`;
  }).join('');

  const labels = { pass: '✓', warn: '!', fail: '×' };
  els.checkList.innerHTML = details.map(item => `
    <article class="check-item ${item.status}">
      <div class="check-icon">${labels[item.status]}</div>
      <div>
        <h4>${item.title}</h4>
        <p>${item.note}</p>
        <p>${item.why}</p>
      </div>
      <div class="weight">${item.score}/${item.weight}</div>
    </article>`).join('');

  const fixes = details
    .filter(item => item.status !== 'pass')
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 6)
    .map(item => `<li><strong>${item.title}</strong> — ${item.note}</li>`);
  els.fixList.innerHTML = fixes.length ? fixes.join('') : '<li>没有明显硬伤，继续保持更新节奏即可。</li>';
}

function updateQuery() {
  const url = new URL(window.location.href);
  url.searchParams.set('repo', state.full);
  history.replaceState(null, '', url);
}

function reportUrl() {
  const url = new URL('https://anonymousleejj.github.io/repo-doctor/');
  url.searchParams.set('repo', state.full);
  return url.toString();
}

function badgeMarkdown() {
  const score = state.result.score;
  const color = scoreColor(score);
  return `[![Repo Doctor](https://img.shields.io/badge/Repo_Doctor-${score}%2F100-${color})](${reportUrl()})`;
}

async function copy(text, button, original) {
  await navigator.clipboard.writeText(text);
  button.textContent = '已复制';
  setTimeout(() => { button.textContent = original; }, 1200);
}

els.form.addEventListener('submit', event => {
  event.preventDefault();
  analyze(els.input.value).catch(error => {
    showStatus(String(error.message || error), true);
  });
});

document.querySelectorAll('[data-example]').forEach(button => {
  button.addEventListener('click', () => {
    els.input.value = button.dataset.example;
    analyze(button.dataset.example).catch(error => showStatus(String(error.message || error), true));
  });
});

els.copyBadge.addEventListener('click', () => {
  if (!state.result) return;
  copy(badgeMarkdown(), els.copyBadge, '复制 Markdown 徽章').catch(() => showStatus('浏览器拒绝了剪贴板权限。', true));
});

els.copyReport.addEventListener('click', () => {
  if (!state.result) return;
  copy(reportUrl(), els.copyReport, '复制报告链接').catch(() => showStatus('浏览器拒绝了剪贴板权限。', true));
});

async function boot() {
  try {
    await loadModel();
    const initial = new URLSearchParams(window.location.search).get('repo');
    if (initial) {
      els.input.value = initial;
      await analyze(initial);
    }
  } catch (error) {
    showStatus(String(error.message || error), true);
  }
}

boot();
