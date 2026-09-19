import mark from '../../../assets/brand/nudgethis-icon.svg';

/** The same local SVG is used by the application, landing, favicon and README. */
export const brandLogo = (): string => mark.replace('<svg ', '<svg class="nt-logo" aria-hidden="true" focusable="false" ');

export function mountBrandLogos(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-brand-logo]').forEach(element => {
    element.innerHTML = brandLogo();
  });
}
