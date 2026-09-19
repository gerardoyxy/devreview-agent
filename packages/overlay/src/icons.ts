const paths = {
  color: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>',
  size: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M3 3l6 6m12-6-6 6M3 21l6-6m12 6-6-6"/>',
  spacing: '<path d="M3 4v16m18-16v16M7 12h10m-7-3-3 3 3 3m4-6 3 3-3 3"/>',
  corners: '<path d="M4 14V9a5 5 0 0 1 5-5h5M4 18v2h2m4 0h4m4 0h2v-2m0-4v-4m0-4V4h-2"/>',
  multiple: '<rect x="3" y="4" width="7" height="16" rx="1"/><rect x="14" y="4" width="7" height="16" rx="1"/>',
  area: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M11 3h2M3 11v2m18-2v2m-10 8h2"/>',
  controls: '<path d="M4 7h6m4 0h6M4 17h10m4 0h2"/><circle cx="12" cy="7" r="2"/><circle cx="16" cy="17" r="2"/>',
  text: '<path d="M4 6V4h16v2M12 4v16m-4 0h8"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-7 5 8"/>',
  star: '<path d="m12 3 2.8 5.6L21 9.5 16.5 14l1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.5l6.2-.9z"/>',
  palette: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 17.5h7m-3.5-3.5v7"/>',
  pointer: '<path d="m5 3 14 11-7 1-3 6z"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  queue: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  branch: '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M6 7v10m12-10c0 6-12 4-12 10"/>'
};
export const icon = (name: keyof typeof paths): string => `<svg class="nt-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths[name]}</svg>`;
