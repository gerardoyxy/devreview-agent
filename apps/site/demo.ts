/** One seekable illustration timeline. No application API, agent or model calls. */
const demo = document.querySelector<HTMLElement>('[data-demo]');
if (demo) {
  const select = <T extends HTMLElement = HTMLElement>(selector: string): T => {
    const element = demo.querySelector<T>(selector);
    if (!element) throw new Error(`Missing demonstration control: ${selector}`);
    return element;
  };
  const steps = ['point', 'describe', 'review', 'applied'] as const;
  const starts = [0, 850, 2100, 3600];
  const snapshots = [680, 1950, 3150, 4900];
  const total = 6500;
  const finish = 5500; // Manual playback holds the result, before the loop's reset.
  const captions = ['Point at the part you want to change.', 'Describe it in your own words.', 'Review the proposed change.', 'More space. Softer corners. Your change, applied.'];
  const request = 'More space. Softer corners.';
  const play = select<HTMLButtonElement>('[data-demo-play]');
  const typed = select('[data-demo-request]');
  const announcement = select('[data-demo-announcement]');
  const caption = select('[data-demo-caption]');
  const status = select('[data-demo-status]');
  const buttons = [...demo.querySelectorAll<HTMLButtonElement>('[data-demo-step]')];
  const dots = [...demo.querySelectorAll<HTMLElement>('.demo-thinking i')];
  const pointer = select<SVGElement & HTMLElement>('.demo-pointer');
  const click = select('.demo-click');
  const stage = select('.demo-stage');
  const browser = select('.demo-browser');
  const target = select('[data-demo-target]');
  const targetWrap = select('.demo-target-wrap');
  const conversation = select('.demo-conversation');
  const composer = select('.demo-send');
  const apply = select('[data-demo-apply]');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let elapsed = reduced.matches ? finish : 0;
  let playing = !reduced.matches;
  let looping = !reduced.matches;
  let visible = false;
  let frame = 0;
  let lastTime: number | undefined;
  let renderedStep = -1;
  type Point = { x: number; y: number };
  let points: Record<'origin' | 'target' | 'composer' | 'apply', Point> = {
    origin: { x: 0, y: 0 }, target: { x: 0, y: 0 }, composer: { x: 0, y: 0 }, apply: { x: 0, y: 0 }
  };
  const clamp = (value: number): number => Math.max(0, Math.min(1, value));
  const ease = (value: number): number => 1 - (1 - clamp(value)) ** 3;
  const smooth = (value: number): number => { const t = clamp(value); return t * t * (3 - 2 * t); };
  function valueAt(time: number, keys: [number, number][]): number {
    for (let i = 1; i < keys.length; i++) {
      const [end, to] = keys[i];
      const [start, from] = keys[i - 1];
      if (time <= end) return from + (to - from) * ease((time - start) / (end - start));
    }
    return keys[keys.length - 1][1];
  }

  // Native tracks are seeked by the cursor's clock. Pause/offscreen freezes the scene.
  const tracks: Animation[] = [];
  function track(selector: string, cues: [number, Keyframe][]): void {
    const animation = select(selector).animate(cues.map(([time, key]) => ({ easing: 'cubic-bezier(.16,1,.3,1)', ...key, offset: time / total })), { duration: total, fill: 'both' });
    animation.pause(); animation.currentTime = 0; tracks.push(animation);
  }
  const hidden = { opacity: 0, transform: 'translateY(14px) scale(.96)' };
  const settled = { opacity: 1, transform: 'translateY(0) scale(1)' };
  track('.demo-conversation', [[0, { opacity: .88 }], [650, { opacity: .88 }], [1050, { opacity: 1 }], [5650, { opacity: 1 }], [6150, { opacity: .88 }], [total, { opacity: .88 }]]);
  track('.demo-selection', [[0, { opacity: 0, transform: 'scale(1.16)' }], [370, { opacity: 0, transform: 'scale(1.16)' }], [530, { opacity: 1, transform: 'scale(.98)' }], [720, { opacity: 1, transform: 'scale(1)' }], [3600, { opacity: 1, transform: 'scale(1)' }], [3910, { opacity: 0, transform: 'scale(1.13)' }], [total, { opacity: 0, transform: 'scale(1.16)' }]]);
  track('.demo-user-message', [[0, hidden], [720, hidden], [990, { opacity: 1, transform: 'translateY(-3px) scale(1.015)' }], [1190, settled], [5650, settled], [6090, hidden], [total, hidden]]);
  track('.demo-agent-message', [[0, hidden], [1880, hidden], [2120, settled], [5650, settled], [6020, hidden], [total, hidden]]);
  track('.demo-thinking', [[0, { opacity: 0 }], [1880, { opacity: 0 }], [1970, { opacity: 1 }], [2160, { opacity: 1 }], [2310, { opacity: 0 }], [total, { opacity: 0 }]]);
  track('.demo-reply', [[0, { opacity: 0, transform: 'translateY(9px)' }], [2180, { opacity: 0, transform: 'translateY(9px)' }], [2460, { opacity: 1, transform: 'translateY(0)' }], [total, { opacity: 1, transform: 'translateY(0)' }]]);
  track('.demo-version', [[0, hidden], [2260, hidden], [2560, { opacity: 1, transform: 'translateY(-3px) scale(1.015)' }], [2800, settled], [5610, settled], [6000, hidden], [total, hidden]]);
  track('.demo-send', [[0, { transform: 'scale(1)' }], [1810, { transform: 'scale(1)' }], [1900, { transform: 'scale(.82)' }], [2020, { transform: 'scale(1.12)' }], [2200, { transform: 'scale(1)' }], [total, { transform: 'scale(1)' }]]);
  track('.demo-success', [[0, hidden], [3800, hidden], [4070, { opacity: 1, transform: 'translateY(-3px) scale(1.08)' }], [4310, settled], [5510, settled], [5810, hidden], [total, hidden]]);
  track('.demo-spark', [[0, { opacity: 0, transform: 'scale(.3) rotate(-18deg)' }], [3620, { opacity: 0, transform: 'scale(.3) rotate(-18deg)' }], [3820, { opacity: 1, transform: 'scale(1.2) rotate(8deg)' }], [4230, { opacity: 0, transform: 'scale(1.5) rotate(18deg)' }], [total, { opacity: 0, transform: 'scale(1.5) rotate(18deg)' }]]);

  function measure(): void {
    // Layout coordinates ignore animated transforms, preventing feedback on resize.
    const point = (element: HTMLElement, x = .75, y = .65): Point => {
      const result = { x: element.offsetWidth * x, y: element.offsetHeight * y };
      for (let node: HTMLElement | null = element; node && node !== stage; node = node.offsetParent as HTMLElement | null) {
        result.x += node.offsetLeft; result.y += node.offsetTop;
      }
      return result;
    };
    points = { origin: { x: stage.clientWidth - 40, y: 48 }, target: point(target), composer: point(composer, .5, .5), apply: point(apply) };
    const gap = point(conversation, 0, 0).y - point(targetWrap, .5, 1).y;
    targetWrap.style.setProperty('--connector-length', `${Math.max(0, gap - 16)}px`);
  }
  function render(): void {
    const index = elapsed >= starts[3] ? 3 : elapsed >= starts[2] ? 2 : elapsed >= starts[1] ? 1 : 0;
    const time = reduced.matches ? snapshots[index] : elapsed;
    const phase = clamp((elapsed - starts[index]) / ((starts[index + 1] ?? total) - starts[index]));
    if (index !== renderedStep) {
      renderedStep = index; demo!.dataset.stage = steps[index]; caption.textContent = captions[index];
      select('.demo-apply-label').textContent = index === 2 ? 'Apply change' : 'Review change';
      apply.setAttribute('aria-label', index === 3 ? 'Replay this example change' : 'Apply the example change');
      select('.demo-agent-message').setAttribute('aria-hidden', String(index < 2));
      for (const [i, button] of buttons.entries()) {
        if (i === index) button.setAttribute('aria-current', 'step'); else button.removeAttribute('aria-current');
        button.dataset.complete = String(i < index);
      }
      measure();
    }
    const count = index === 0 ? 0 : index === 1 && !reduced.matches ? Math.floor(clamp((time - 960) / 850) * request.length) : request.length;
    const text = request.slice(0, count);
    if (typed.textContent !== text) typed.textContent = text;
    const label = time > 5880 ? 'Replay' : ['Selecting', 'Writing', 'Reviewing', 'Updated'][index];
    if (status.textContent !== label) status.textContent = label;
    demo!.dataset.typing = String(index === 1 && count < request.length);
    demo!.style.setProperty('--step-progress', String(phase));
    for (const animation of tracks) animation.currentTime = time;

    const browserY = reduced.matches ? 0 : valueAt(time, [[0, 0], [300, -3], [760, 0], [3460, 0], [3690, -7], [4120, 0], [total, 0]]);
    const conversationY = reduced.matches ? 0 : valueAt(time, [[0, 18], [650, 18], [1040, -5], [1230, 0], [5650, 0], [6150, 18], [total, 18]]);
    browser.style.transform = `translateY(${browserY}px)`;
    conversation.style.transform = `translateY(${conversationY}px)`;
    target.style.setProperty('--change', String(valueAt(time, [[0, 0], [3600, 0], [3850, 1.12], [4160, 1], [5700, 1], [6250, 0], [total, 0]])));
    targetWrap.style.setProperty('--connection', String(valueAt(time, [[0, 0], [540, 0], [940, 1], [3480, 1], [3780, 0], [total, 0]])));
    targetWrap.style.setProperty('--flow', String(clamp((time - 590) / 540)));
    targetWrap.style.setProperty('--flow-opacity', String(valueAt(time, [[0, 0], [560, 0], [620, 1], [1020, 1], [1130, 0], [total, 0]])));
    for (const [i, dot] of dots.entries()) dot.style.transform = `translateY(${reduced.matches ? 0 : -3 * Math.max(0, Math.sin((time - 1500) / 95 - i * 1.1))}px)`;

    const targetPoint = { x: points.target.x, y: points.target.y + browserY };
    const composerPoint = { x: points.composer.x, y: points.composer.y + conversationY };
    const applyPoint = { x: points.apply.x, y: points.apply.y + conversationY };
    const route: [number, Point][] = [[0, points.origin], [490, targetPoint], [720, targetPoint], [1280, composerPoint], [2050, composerPoint], [3240, applyPoint], [3690, applyPoint], [4340, targetPoint], [5520, targetPoint], [6240, points.origin], [total, points.origin]];
    let position = points.origin, lean = 0;
    for (let i = 1; i < route.length; i++) {
      const [end, to] = route[i], [start, from] = route[i - 1];
      if (time > end) continue;
      const p = smooth((time - start) / (end - start));
      const arc = Math.hypot(to.x - from.x, to.y - from.y) > 1 ? Math.sin(p * Math.PI) : 0;
      position = { x: from.x + (to.x - from.x) * p + arc * 24, y: from.y + (to.y - from.y) * p - arc * 28 };
      lean = arc * 13 * Math.sign(to.x - from.x); break;
    }
    const press = Math.max(...[490, 1880, 3480].map(at => time >= at && time < at + 250 ? Math.sin((time - at) / 250 * Math.PI) : 0));
    pointer.style.transform = `translate(${position.x - 14.6}px, ${position.y - 13.3}px) rotate(${lean}deg) scale(${1 - press * .22})`;
    const clickAt = [490, 1880, 3480].find(at => time >= at && time < at + 440);
    const ripple = clickAt === undefined ? 1 : (time - clickAt) / 440;
    const anchor = clickAt === 490 ? targetPoint : clickAt === 1880 ? composerPoint : applyPoint;
    click.style.transform = `translate(${anchor.x}px, ${anchor.y}px) scale(${.25 + ease(ripple) * 1.5})`;
    click.style.opacity = reduced.matches || clickAt === undefined ? '0' : String((1 - ripple) * .8);
  }
  function tick(time: number): void {
    frame = 0;
    if (!playing || !visible || document.hidden) { lastTime = undefined; return; }
    if (lastTime !== undefined) elapsed += time - lastTime;
    lastTime = time;
    if (looping && elapsed >= total) elapsed %= total;
    else if (!looping && elapsed >= finish) { elapsed = finish; playing = false; }
    render();
    if (!playing) sync(); else frame = requestAnimationFrame(tick);
  }
  function sync(): void {
    if (frame) cancelAnimationFrame(frame);
    frame = 0; lastTime = undefined;
    const running = playing && visible && !document.hidden;
    demo!.dataset.running = String(running);
    const ended = !looping && elapsed >= finish;
    play.textContent = playing ? 'Pause' : ended ? 'Play again' : 'Play';
    play.setAttribute('aria-label', playing ? 'Pause demonstration' : ended ? 'Play demonstration again' : 'Play demonstration');
    if (running) frame = requestAnimationFrame(tick);
  }
  function startOver(): void {
    elapsed = 0; playing = true; looping = !reduced.matches; render(); sync();
    announcement.textContent = 'Demonstration restarted. Point, describe, review, then apply.';
  }
  play.onclick = () => {
    if (!looping && elapsed >= finish) { startOver(); return; }
    playing = !playing; sync();
    announcement.textContent = `${playing ? 'Playing' : 'Paused'}. ${captions[renderedStep]}`;
  };
  select('[data-demo-replay]').onclick = startOver;
  for (const [index, button] of buttons.entries()) button.onclick = () => {
    elapsed = snapshots[index]; playing = false; looping = false;
    render(); sync(); announcement.textContent = captions[index];
  };
  target.onclick = () => { elapsed = starts[1]; playing = true; looping = false; render(); sync(); };
  apply.onclick = () => {
    if (renderedStep === 3) { startOver(); return; }
    elapsed = starts[3]; playing = true; looping = false; render(); sync();
    announcement.textContent = captions[3];
  };
  reduced.addEventListener('change', () => {
    if (reduced.matches) { playing = false; looping = false; elapsed = finish; render(); sync(); }
  });
  document.addEventListener('visibilitychange', sync);
  const geometry = new ResizeObserver(() => { measure(); render(); });
  geometry.observe(stage); geometry.observe(target); geometry.observe(conversation); geometry.observe(composer); geometry.observe(apply);
  new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting ?? false; sync(); }, { threshold: .15 }).observe(demo);
  select('[data-demo-controls]').hidden = false;
  select('.demo-steps').hidden = false;
  demo.dataset.enhanced = 'true';
  render(); sync();
}
