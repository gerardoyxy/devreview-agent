# Landing browser demonstration

Mode: Persuade. Target: apps/site/public/index.html and apps/site/demo.ts.

User-pinned concept: a miniature browser window containing an example web page,
animated to show an edit as if NudgeThis were operating on it. This scoped addition
now uses the approved blue Reference desk identity shared with the application.

Focal moment: the pointer selects Save changes; a plain-English request appears
in the adjacent conversation; the proposed change is reviewed, then explicitly
applied and the same button gains padding.
Continuity: the example page and conversation stay visible together; the page
changes only after the Apply step. A four-step control lets the visitor inspect
any point in the sequence, and a one-shot autoplay can be paused or replayed.
Feedback: the current step and caption explain the visible change. The simulation
is labeled and never invokes an agent or a local service.
Budget: native TypeScript/CSS, no dependency, no media downloads or canvas; stop
animation clocks when hidden/offscreen, honor reduced-motion with a static final
state plus manual navigation. The no-script view is the final result.
