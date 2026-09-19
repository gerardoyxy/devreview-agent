import { DevReview } from '/overlay.js';
const token = new URLSearchParams(location.hash.slice(1)).get('token') || sessionStorage.getItem('devreview-token');
if (token) { sessionStorage.setItem('devreview-token', token); history.replaceState(null, '', location.pathname); DevReview.init({ server: location.origin, token, enabled: true }); }
else document.querySelector('#playground-status').textContent = 'Open this playground from the authenticated DevReview dashboard.';
document.querySelector('[data-testid="create-project"]').onclick = () => { document.querySelector('#playground-status').textContent = 'Project created. Try reporting a layout or copy improvement.'; };
