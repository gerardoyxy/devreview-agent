import { Marked } from 'marked';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';

const pages = [
  ['index', 'docs/index.md', 'Start here', 'Start'],
  ['install', 'docs/install.md', 'Download & open', 'Start'],
  ['terminal-install', 'docs/terminal-install.md', 'Install from the terminal', 'Start'],
  ['wsl', 'docs/wsl.md', 'Windows + WSL', 'Start'],
  ['project-starter', 'docs/project-starter.md', 'Create a project', 'Start'],
  ['overview', 'README.md', 'Use an existing project', 'Work'],
  ['selection-controls', 'docs/selection-controls.md', 'Select elements', 'Work'],
  ['agents', 'docs/agents.md', 'Connect an agent', 'Work'],
  ['my-style', 'docs/my-style.md', 'My Style', 'Work'],
  ['appearance', 'docs/appearance.md', 'Colors & fonts', 'Work'],
  ['route-review', 'docs/route-review.md', 'Routes & devices', 'Work'],
  ['saved-versions', 'docs/saved-versions.md', 'Save versions', 'Work'],
  ['branch-publish', 'docs/branch-publish.md', 'Branches & GitHub', 'Work'],
  ['recovery', 'docs/recovery.md', 'Recovery', 'Reference'],
  ['api', 'docs/api.md', 'API', 'Reference'],
  ['architecture', 'docs/architecture.md', 'Architecture', 'Reference'],
  ['migration', 'docs/migration.md', 'Migration', 'Reference'],
  ['upgrade-0.4', 'docs/upgrade-0.4.md', 'Earlier previews', 'Reference'],
  ['security', 'SECURITY.md', 'Security & privacy', 'Reference'],
  ['roadmap', 'ROADMAP.md', 'Roadmap', 'Reference']
];
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const location = slug => slug === 'index' ? 'docs/index.html' : `docs/${slug}/index.html`;
const relative = (from, to) => path.posix.relative(path.posix.dirname(from), to) || './';
const websitePath = slug => location(slug).replace(/index\.html$/, '');
const guideLink = (from, slug) => {
  const result = path.posix.relative(path.posix.dirname(from), path.posix.dirname(location(slug)));
  return result ? result + '/' : './';
};
const slugify = text => text.toLowerCase().replace(/<[^>]+>/g, '').replace(/[^\p{L}\p{N}_ -]/gu, '').replace(/ /g, '-');

export async function buildDocs(root, output, version) {
  const bySource = new Map(pages.map(([slug, source]) => [source, slug]));
  for (const [slug, source, title] of pages) {
    const file = location(slug), headings = [], counts = new Map(), references = [];
    const link = href => {
      const github = 'https://github.com/gerardoyxy/nudgethis/blob/main/';
      let target = href;
      if (target.startsWith(github)) target = '/' + target.slice(github.length);
      if (/^(?:https?:|mailto:)/i.test(target)) return target;
      if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('//')) throw new Error(`Unsupported URL in ${source}: ${target}`);
      const [pathname, fragment] = target.split('#');
      if (!pathname) return target;
      const resolved = path.posix.normalize(pathname.startsWith('/') ? pathname.slice(1) : path.posix.join(path.posix.dirname(source), decodeURIComponent(pathname)));
      if (resolved.startsWith('../')) throw new Error(`Link escapes the repository: ${target}`);
      references.push(resolved);
      const destination = bySource.get(resolved);
      const url = destination ? guideLink(file, destination) : github + resolved;
      return url + (fragment ? '#' + fragment : '');
    };
    const renderer = {
      heading({ tokens, depth, text }) {
        const base = slugify(text), duplicate = counts.get(base) || 0;
        counts.set(base, duplicate + 1);
        const id = base + (duplicate ? `-${duplicate}` : '');
        if (depth === 2) headings.push({ id, text: text.replace(/[`*_]/g, '') });
        return `<h${depth} id="${escape(id)}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
      },
      link({ href, title: label, tokens }) { return `<a href="${escape(link(href))}"${label ? ` title="${escape(label)}"` : ''}>${this.parser.parseInline(tokens)}</a>`; },
      // Only repository-authored Markdown is built. Raw HTML is displayed as text, never executed.
      html({ text }) { return escape(text); },
      image({ href, text }) { return `<a href="${escape(link(href))}">${escape(text)}</a>`; }
    };
    const markdown = (await readFile(path.join(root, source), 'utf8')).replace(/^<p><img[^\n]+<\/p>\s*/, '');
    const html = new Marked({ renderer, gfm: true }).parse(markdown);
    for (const reference of references) await access(path.join(root, reference));
    const assets = relative(file, 'assets');
    const home = relative(file, 'index.html');
    const navigation = ['Start', 'Work', 'Reference'].map(group => `<p class="docs-nav-group">${group}</p><ul>${pages.filter(p => p[3] === group).map(([key, , label]) => `<li><a href="${escape(guideLink(file, key))}"${slug === key ? ' aria-current="page"' : ''}>${escape(label)}</a></li>`).join('')}</ul>`).join('');
    const contents = headings.map(h => `<li><a href="#${escape(h.id)}">${escape(h.text)}</a></li>`).join('');
    const canonical = `https://nudgethis.click/${websitePath(slug)}`;
    const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark">
<title>${escape(title)} | NudgeThis Docs</title><meta name="description" content="${escape(title)}: NudgeThis setup, workflows and reference documentation."><link rel="canonical" href="${canonical}">
<meta property="og:type" content="website"><meta property="og:title" content="${escape(title)} | NudgeThis Docs"><meta property="og:url" content="${canonical}"><meta property="og:image" content="https://nudgethis.click/assets/social-preview.png"><meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${assets}/favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="${assets}/apple-touch-icon.png"><link rel="stylesheet" href="${assets}/site.css"><script type="module" src="${assets}/site.js"></script></head>
<body class="docs-page"><a class="skip-link" href="#main">Skip to content</a><header class="docs-header wrap"><a class="wordmark" href="${home}"><img class="brand-mark" src="${assets}/favicon.svg" width="32" height="32" alt="">NudgeThis <span>Docs</span></a><nav aria-label="Main navigation"><a href="${home}#download">Download</a><a href="https://github.com/gerardoyxy/nudgethis">GitHub</a><button class="theme-button" type="button" data-theme-toggle hidden>Dark mode</button></nav></header>
<div class="docs-layout wrap"><aside class="docs-sidebar"><details open data-docs-navigation><summary>Browse guides</summary><nav aria-label="Documentation">${navigation}</nav></details><p class="docs-version">v${escape(version)} · Alpha</p></aside>
<main id="main" class="docs-article"><p class="docs-breadcrumb"><a href="${escape(guideLink(file, 'index'))}">Documentation</a> / ${escape(title)}</p>${html}<p class="docs-edit"><a href="https://github.com/gerardoyxy/nudgethis/blob/main/${source}">View this guide on GitHub</a></p></main>
<aside class="docs-contents"><nav aria-label="On this page"><p>On this page</p><ul>${contents}</ul></nav></aside></div><footer class="docs-footer wrap">NudgeThis is open source. Your projects stay on your computer.</footer></body></html>`;
    const destination = path.join(output, file);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, page);
  }
  console.log(`Built ${pages.length} documentation pages from repository Markdown.`);
}
