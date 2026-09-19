import { query } from '../../packages/contracts/src/index.js';
import { NudgeThis } from '../../packages/overlay/src/index.js';
const token = new URLSearchParams(location.hash.slice(1)).get('token') || sessionStorage.getItem('nudgethis-token');
if (token) { sessionStorage.setItem('nudgethis-token', token); history.replaceState(null, '', location.pathname); NudgeThis.init({ server: location.origin, token, enabled: true }); }
else query(document, '#playground-status').textContent = 'Open this playground from the authenticated NudgeThis dashboard.';
query(document, '[data-testid="create-project"]').onclick = () => { query(document, '#playground-status').textContent = 'Project created. Try reporting a layout or copy improvement.'; };
