/** Deterministic illustrations only; profile selection never connects to an agent. */
const scenes = [...document.querySelectorAll<HTMLElement>('[data-profile-scene]')];
const profiles = [...document.querySelectorAll<HTMLButtonElement>('[data-profile]')];
const introductions: Record<string, { title: string[]; description: string; steps: [string, string][] }> = {
  idea: { title: ['Idea to', 'first', 'page.'], description: 'Tell us what you want to make. Find a starting point. See it on your computer.', steps: [['Describe', 'Start with your goal and who it is for.'], ['Choose', 'Pick a starter with clear requirements.'], ['Make it yours', 'Preview locally and save your first version.']] },
  ai: { title: ['That bit.', 'Make it', 'better.'], description: 'Point at your UI. Tell your agent what to change.', steps: [['Point', 'Select the part you want to change.'], ['Tell', 'Describe it in your own words.'], ['Review', 'Check the changes, then apply.']] },
  code: { title: ['Review it.', 'Then', 'ship it.'], description: 'Keep the conversation, inspect the diff and move from a local version to a reviewed proposal.', steps: [['Branch', 'Choose a separate line of work.'], ['Review', 'Inspect the change and save a version.'], ['Propose', 'Publish your branch and open a pull request.']] }
};
for (const button of profiles) button.addEventListener('click', () => {
  const id = button.dataset.profile!, intro = introductions[id]; if (!intro) return;
  for (const choice of profiles) choice.setAttribute('aria-pressed', String(choice === button));
  for (const scene of scenes) { scene.hidden = scene.dataset.profileScene !== id; scene.dispatchEvent(new Event('profilechange')); }
  const title = document.querySelector<HTMLElement>('#hero-title')!; title.replaceChildren();
  intro.title.forEach((line, i) => { if (i) title.append(document.createElement('br')); title.append(document.createTextNode(line)); });
  document.querySelector<HTMLElement>('.hero')!.dataset.profile = id;
  document.querySelector('.hero-description')!.textContent = intro.description;
  document.querySelectorAll('.workflow-list li').forEach((row, i) => { row.querySelector('h2')!.textContent = intro.steps[i][0]; row.querySelector('p')!.textContent = intro.steps[i][1]; });
});

for (const scene of scenes.filter(s => s.dataset.profileScene !== 'ai')) {
  const panes = [...scene.querySelectorAll<HTMLElement>('[data-scene-step]')];
  const buttons = [...scene.querySelectorAll<HTMLButtonElement>('[data-journey-step]')];
  const play = scene.querySelector<HTMLButtonElement>('[data-journey-play]')!;
  const announcement = scene.querySelector<HTMLElement>('[data-journey-announcement]')!;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const duration = 7200, holds = [0, 1500, 3200, 4850], end = 6600;
  let elapsed = reduced.matches ? end : 0, playing = !reduced.matches, looping = !reduced.matches, visible = false, frame = 0, last: number | undefined;
  const captions = scene.dataset.profileScene === 'idea'
    ? ['Describe your idea in everyday words.', 'Get a starter recommendation with clear requirements.', 'Review the files and create a new local folder.', 'Open your preview and make the first page yours.']
    : ['Create a working branch before making a change.', 'Inspect the proposed files and their conversation.', 'Save approved changes as a local version.', 'Publish the branch, propose changes and review merge readiness.'];
  function render() {
    const index = elapsed >= holds[3] ? 3 : elapsed >= holds[2] ? 2 : elapsed >= holds[1] ? 1 : 0;
    const local = elapsed - holds[index], phase = Math.min(1, local / 440), enter = reduced.matches ? 1 : 1 - (1 - phase) ** 3;
    scene.dataset.step = String(index); scene.style.setProperty('--scene-enter', String(enter));
    scene.style.setProperty('--journey-progress', String(Math.min(1, elapsed / end)));
    scene.style.setProperty('--branch-grow', String(reduced.matches ? 1 : Math.min(1, local / 700)));
    panes.forEach((pane, i) => { pane.hidden = i !== index; });
    buttons.forEach((button, i) => { if (i === index) button.setAttribute('aria-current', 'step'); else button.removeAttribute('aria-current'); });
    scene.querySelector<HTMLElement>('[data-journey-caption]')!.textContent = captions[index];
    scene.querySelectorAll<HTMLElement>('.example-files span').forEach((row, i) => { const value = reduced.matches ? 1 : Math.max(0, Math.min(1, (local - i * 130) / 260)); row.style.opacity = String(value); row.style.transform = `translateX(${(1 - value) * 18}px)`; });
  }
  function sync() {
    cancelAnimationFrame(frame); frame = 0; last = undefined;
    const running = playing && visible && !scene.hidden && !document.hidden;
    scene.dataset.running = String(running);
    play.textContent = playing ? 'Pause' : elapsed >= end && !looping ? 'Play again' : 'Play';
    play.setAttribute('aria-label', playing ? 'Pause demonstration' : 'Play demonstration');
    if (running) frame = requestAnimationFrame(tick);
  }
  function tick(time: number) {
    if (!playing || !visible || scene.hidden || document.hidden) { sync(); return; }
    if (last !== undefined) elapsed += time - last; last = time;
    if (looping && elapsed >= duration) elapsed %= duration;
    else if (!looping && elapsed >= end) { elapsed = end; playing = false; }
    render(); if (playing) frame = requestAnimationFrame(tick); else sync();
  }
  function replay() { elapsed = 0; playing = true; looping = !reduced.matches; render(); sync(); announcement.textContent = 'Demonstration restarted.'; }
  play.onclick = () => { if (!looping && elapsed >= end) { replay(); return; } playing = !playing; sync(); announcement.textContent = playing ? 'Playing demonstration.' : 'Demonstration paused.'; };
  scene.querySelector<HTMLButtonElement>('[data-journey-replay]')!.onclick = replay;
  buttons.forEach((button, i) => { button.onclick = () => { elapsed = holds[i] + 900; playing = false; looping = false; render(); sync(); announcement.textContent = captions[i]; }; });
  scene.addEventListener('profilechange', () => { if (!scene.hidden) { elapsed = reduced.matches ? end : 0; playing = !reduced.matches; looping = !reduced.matches; render(); } sync(); });
  reduced.addEventListener('change', () => { if (reduced.matches) { elapsed = end; playing = false; looping = false; render(); sync(); } });
  document.addEventListener('visibilitychange', sync);
  new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting ?? false; sync(); }, { threshold: .15 }).observe(scene);
  render(); sync();
}
