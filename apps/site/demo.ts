/** A scripted illustration of the workflow. No application API or model calls. */
const demo = document.querySelector<HTMLElement>('[data-demo]');
if (demo) {
  const select = <T extends HTMLElement = HTMLElement>(selector: string): T => {
    const element = demo.querySelector<T>(selector);
    if (!element) throw new Error(`Missing demonstration control: ${selector}`);
    return element;
  };
  const steps = ['point', 'describe', 'review', 'applied'] as const;
  const durations = [2300, 3900, 3300, 3500];
  const starts = [0, 2300, 6200, 9500];
  const total = 13000;
  const captions = [
    'Point at the part you want to change.',
    'Describe it in your own words.',
    'Read the reply and review the proposed change.',
    'The same button, with your change applied.'
  ];
  const request = 'Make this button green and round the corners.';
  const controls = select('[data-demo-controls]');
  const play = select<HTMLButtonElement>('[data-demo-play]');
  const replay = select<HTMLButtonElement>('[data-demo-replay]');
  const typed = select('[data-demo-request]');
  const caption = select('[data-demo-caption]');
  const announcement = select('[data-demo-announcement]');
  const buttons = [...demo.querySelectorAll<HTMLButtonElement>('[data-demo-step]')];
  const pointer = select<SVGElement & HTMLElement>('.demo-pointer');
  const stage = select('.demo-stage');
  const target = select('[data-demo-target]');
  const apply = select('[data-demo-apply]');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let elapsed = reduced.matches ? total : 0;
  let playing = !reduced.matches;
  let visible = false;
  let frame = 0;
  let lastTime: number | undefined;
  let renderedStep = -1;
  let pointerTarget = { x: 0, y: 0 };

  function positionPointer(): void {
    const base = stage.getBoundingClientRect();
    const rect = (renderedStep < 2 ? target : apply).getBoundingClientRect();
    pointerTarget = { x: rect.left - base.left + rect.width * .75, y: rect.top - base.top + rect.height * .65 };
  }
  function render(): void {
    const index = elapsed >= starts[3] ? 3 : elapsed >= starts[2] ? 2 : elapsed >= starts[1] ? 1 : 0;
    const phase = Math.max(0, Math.min(1, (elapsed - starts[index]) / durations[index]));
    if (index !== renderedStep) {
      renderedStep = index;
      demo!.dataset.stage = steps[index];
      caption.textContent = captions[index];
      for (const [i, button] of buttons.entries()) {
        if (i === index) button.setAttribute('aria-current', 'step');
        else button.removeAttribute('aria-current');
      }
      positionPointer();
    }
    const count = index === 0 ? 0 : index === 1 ? Math.min(request.length, Math.floor(phase * request.length * 1.5)) : request.length;
    const text = request.slice(0, count);
    if (typed.textContent !== text) typed.textContent = text;
    demo!.dataset.typing = String(index === 1 && count < request.length);
    const entry = reduced.matches ? 1 : Math.min(1, phase * 3);
    const remaining = (1 - entry) ** 3;
    pointer.style.transform = `translate(${pointerTarget.x - 45 * remaining}px, ${pointerTarget.y + 55 * remaining}px)`;
  }
  function tick(time: number): void {
    frame = 0;
    if (!playing || !visible || document.hidden) { lastTime = undefined; return; }
    if (lastTime !== undefined) elapsed = Math.min(total, elapsed + time - lastTime);
    lastTime = time;
    render();
    if (elapsed >= total) { playing = false; sync(); }
    else frame = requestAnimationFrame(tick);
  }
  function sync(): void {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    lastTime = undefined;
    const running = playing && visible && !document.hidden;
    demo!.dataset.running = String(running);
    play.textContent = playing ? 'Pause' : elapsed >= total ? 'Play again' : 'Play';
    play.setAttribute('aria-label', playing ? 'Pause demonstration' : elapsed >= total ? 'Play demonstration again' : 'Play demonstration');
    if (running) frame = requestAnimationFrame(tick);
  }
  function startOver(): void {
    elapsed = 0; playing = true; render(); sync();
    announcement.textContent = 'Demonstration restarted. Point, describe, review, then apply.';
  }
  play.onclick = () => {
    if (elapsed >= total) { startOver(); return; }
    playing = !playing; sync();
    announcement.textContent = `${playing ? 'Playing' : 'Paused'}. ${captions[renderedStep]}`;
  };
  replay.onclick = startOver;
  for (const [index, button] of buttons.entries()) button.onclick = () => {
    elapsed = starts[index] + durations[index] * .8; playing = false;
    render(); sync(); announcement.textContent = captions[index];
  };
  reduced.addEventListener('change', () => {
    if (reduced.matches) { playing = false; elapsed = total; render(); sync(); }
  });
  document.addEventListener('visibilitychange', sync);
  new ResizeObserver(() => { positionPointer(); render(); }).observe(stage);
  new IntersectionObserver(entries => {
    visible = entries[0]?.isIntersecting ?? false; sync();
  }, { threshold: 0.15 }).observe(demo);
  controls.hidden = false;
  render(); sync();
}
