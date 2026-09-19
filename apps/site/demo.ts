/** A scripted illustration of the workflow. No application API or model calls. */
const demo = document.querySelector<HTMLElement>('[data-demo]');
if (demo) {
  const select = <T extends HTMLElement = HTMLElement>(selector: string): T => {
    const element = demo.querySelector<T>(selector);
    if (!element) throw new Error(`Missing demonstration control: ${selector}`);
    return element;
  };
  const steps = ['point', 'describe', 'review', 'applied'] as const;
  const durations = [700, 1500, 2000, 1800];
  const starts = durations.map((_, index) => durations.slice(0, index).reduce((sum, duration) => sum + duration, 0));
  const total = durations.reduce((sum, duration) => sum + duration, 0);
  const captions = [
    'Point at the part you want to change.',
    'Describe it in your own words.',
    'Read the reply and review the proposed change.',
    'The same button, with your change applied.'
  ];
  const request = 'Give this more space.';
  const controls = select('[data-demo-controls]');
  const play = select<HTMLButtonElement>('[data-demo-play]');
  const replay = select<HTMLButtonElement>('[data-demo-replay]');
  const typed = select('[data-demo-request]');
  const caption = select('[data-demo-caption]');
  const announcement = select('[data-demo-announcement]');
  const applyLabel = select('.demo-apply-label');
  const buttons = [...demo.querySelectorAll<HTMLButtonElement>('[data-demo-step]')];
  const pointer = select<SVGElement & HTMLElement>('.demo-pointer');
  const click = select('.demo-click');
  const stage = select('.demo-stage');
  const target = select('[data-demo-target]');
  const targetWrap = select('.demo-target-wrap');
  const conversation = select('.demo-conversation');
  const apply = select('[data-demo-apply]');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let elapsed = reduced.matches ? total : 0;
  let playing = !reduced.matches;
  let looping = !reduced.matches;
  let visible = false;
  let frame = 0;
  let lastTime: number | undefined;
  let renderedStep = -1;
  let pointerTargets = { target: { x: 0, y: 0 }, apply: { x: 0, y: 0 } };
  const clamp = (value: number): number => Math.max(0, Math.min(1, value));
  const ease = (value: number): number => 1 - (1 - clamp(value)) ** 3;

  function positionPointer(): void {
    const gap = conversation.getBoundingClientRect().top - targetWrap.getBoundingClientRect().bottom;
    targetWrap.style.setProperty('--connector-length', `${Math.max(0, gap - 16)}px`);
    const base = stage.getBoundingClientRect();
    const point = (element: HTMLElement): { x: number; y: number } => {
      const rect = element.getBoundingClientRect();
      return { x: rect.left - base.left + rect.width * .75, y: rect.top - base.top + rect.height * .65 };
    };
    pointerTargets = { target: point(target), apply: point(apply) };
  }
  function render(): void {
    const index = elapsed >= starts[3] ? 3 : elapsed >= starts[2] ? 2 : elapsed >= starts[1] ? 1 : 0;
    const phase = Math.max(0, Math.min(1, (elapsed - starts[index]) / durations[index]));
    if (index !== renderedStep) {
      renderedStep = index;
      demo!.dataset.stage = steps[index];
      caption.textContent = captions[index];
      applyLabel.textContent = index === 2 ? 'Apply change' : 'Review change';
      apply.setAttribute('aria-label', index === 3 ? 'Replay this example change' : index === 2 ? 'Apply the example change' : 'Review the example change');
      for (const [i, button] of buttons.entries()) {
        if (i === index) button.setAttribute('aria-current', 'step');
        else button.removeAttribute('aria-current');
        button.dataset.complete = String(i < index);
      }
      positionPointer();
    }
    const count = index === 0 ? 0 : index === 1 ? Math.min(request.length, Math.floor(phase * request.length * 1.5)) : request.length;
    const text = request.slice(0, count);
    if (typed.textContent !== text) typed.textContent = text;
    demo!.dataset.typing = String(index === 1 && count < request.length);
    demo!.style.setProperty('--step-progress', String(phase));
    const entry = index === 0 && !reduced.matches ? 1 - ease(phase / .58) : 0;
    const travel = index >= 2 ? ease((phase - .2) / .58) : 0;
    const from = pointerTargets.target;
    const to = pointerTargets.apply;
    const x = from.x + (to.x - from.x) * travel - 58 * entry;
    const y = from.y + (to.y - from.y) * travel + 42 * entry;
    const clickPhase = index === 0 ? (phase - .58) / .42 : index === 2 ? (phase - .84) / .16 : -1;
    const clicking = playing && !reduced.matches && clickPhase >= 0 && clickPhase <= 1;
    pointer.style.transform = `translate(${x}px, ${y}px) rotate(${index === 2 ? -8 * Math.sin(travel * Math.PI) : 0}deg) scale(${clicking ? 1 - .12 * Math.sin(clickPhase * Math.PI) : 1})`;
    click.style.transform = `translate(${x + 3}px, ${y + 2}px) scale(${.4 + clamp(clickPhase) * 1.2})`;
    click.style.opacity = clicking ? String((1 - clickPhase) * .7) : '0';
  }
  function tick(time: number): void {
    frame = 0;
    if (!playing || !visible || document.hidden) { lastTime = undefined; return; }
    if (lastTime !== undefined) elapsed += time - lastTime;
    lastTime = time;
    if (elapsed >= total) {
      if (looping && !reduced.matches) elapsed %= total;
      else { elapsed = total; playing = false; }
    }
    render();
    if (!playing) sync();
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
    elapsed = 0; playing = true; looping = !reduced.matches; render(); sync();
    announcement.textContent = 'Demonstration restarted. Point, describe, review, then apply.';
  }
  play.onclick = () => {
    if (elapsed >= total) { startOver(); return; }
    playing = !playing; sync();
    announcement.textContent = `${playing ? 'Playing' : 'Paused'}. ${captions[renderedStep]}`;
  };
  replay.onclick = startOver;
  for (const [index, button] of buttons.entries()) button.onclick = () => {
    elapsed = starts[index] + durations[index] * .8; playing = false; looping = false;
    render(); sync(); announcement.textContent = captions[index];
  };
  target.onclick = () => { elapsed = starts[1]; playing = true; looping = false; render(); sync(); };
  apply.onclick = () => {
    if (renderedStep === 3) { startOver(); return; }
    elapsed = total; playing = false; looping = false; render(); sync();
    announcement.textContent = captions[3];
  };
  reduced.addEventListener('change', () => {
    if (reduced.matches) { playing = false; looping = false; elapsed = total; render(); sync(); }
  });
  document.addEventListener('visibilitychange', sync);
  const geometry = new ResizeObserver(() => { positionPointer(); render(); });
  geometry.observe(stage); geometry.observe(target);
  new IntersectionObserver(entries => {
    visible = entries[0]?.isIntersecting ?? false; sync();
  }, { threshold: 0.15 }).observe(demo);
  controls.hidden = false;
  select('.demo-steps').hidden = false;
  render(); sync();
}
