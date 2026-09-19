import regular from './fonts/archivo-400.woff2';
import bold from './fonts/archivo-700.woff2';
let loading: Promise<void> | undefined;
/** Bundled bytes keep the default face available in overlays without a font request. */
export function loadDefaultFonts(): Promise<void> {
  return loading ??= Promise.all(([['400', regular], ['700', bold]] as const).map(async ([weight, bytes]) => {
    const face = await new FontFace('NudgeThis Archivo', bytes.buffer, { weight, style: 'normal', display: 'swap' }).load();
    document.fonts.add(face);
  })).then(() => {});
}
