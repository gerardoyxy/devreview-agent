import { applyAppearance, defaultAppearance, themeDefaults } from '../../packages/overlay/src/appearance.js';
import { query } from '../../packages/contracts/src/index.js';
import { DevReview } from '../../packages/overlay/src/index.js';
const defaults = document.createElement('style'); defaults.textContent = themeDefaults; document.head.append(defaults);
void applyAppearance(document.documentElement, defaultAppearance());
const token = new URLSearchParams(location.hash.slice(1)).get('token') || sessionStorage.getItem('devreview-token');
if (token) { sessionStorage.setItem('devreview-token', token); history.replaceState(null, '', location.pathname); DevReview.init({ server: location.origin, token, enabled: true }); }
else query(document, '#playground-status').textContent = 'Open this playground from the authenticated NudgeThis dashboard.';
query(document, '[data-testid="create-project"]').onclick = () => { query(document, '#playground-status').textContent = 'Settings saved in this example. Try selecting the button and asking for more space.'; };
