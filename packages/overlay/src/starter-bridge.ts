import { NudgeThis } from './index.js';

// Only development servers load this module. Credentials stay out of project files.
const server = new URL(import.meta.url).origin;
const key = `nudgethis-preview:${server}`;
const params = new URLSearchParams(location.hash.slice(1));
const supplied = params.get('token');
const token = supplied || sessionStorage.getItem(key) || '';
if (supplied) {
  sessionStorage.setItem(key, supplied);
  params.delete('token');
  history.replaceState(null, '', `${location.pathname}${location.search}${params.size ? `#${params}` : ''}`);
}
if (token && !document.querySelector('[data-nudgethis-overlay]')) NudgeThis.init({ server, token, enabled: true });
