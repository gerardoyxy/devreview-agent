import { query } from '../../packages/contracts/src/index.js';
import { DevReview } from '../../packages/overlay/src/index.js';
const token = new URLSearchParams(location.hash.slice(1)).get('token') || sessionStorage.getItem('devreview-token');
if (token) { sessionStorage.setItem('devreview-token', token); history.replaceState(null, '', location.pathname); DevReview.init({ server: location.origin, token, enabled: true }); }
else query(document, '#playground-status').textContent = 'Open this playground from the authenticated DevReview dashboard.';
query(document, '[data-testid="create-project"]').onclick = () => { query(document, '#playground-status').textContent = 'Project created. Try reporting a layout or copy improvement.'; };
