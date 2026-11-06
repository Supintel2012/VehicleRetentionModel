# Lessons

## 2026-10-28 — Phase 0 review (MCP solve route)

- **Test the MCP client against a stateful server.** The RR Toolbox MCP keeps
  a session open until it is deleted or times out, and `client.close()` sends no
  `DELETE`. Call `transport.terminateSession()` before closing, with a bounded
  wait, and keep a test server with `sessionIdGenerator: randomUUID` so the leak
  cannot return.
- **structuredContent is not always the payload.** With MCP Apps on, the RR
  Toolbox puts a display view-model in structuredContent and the run envelope in
  the text. Pick the source by shape (`raw` present), not by presence, and do not
  copy "structuredContent first" from another client without checking the server.
- **Check that every allowed input can actually be solved.** `d = 0` passed
  validation but gives beta = 1, and the engine then runs to its iteration cap
  (over a minute) and returns garbage. Run the engine at each end of every range
  the wizard offers before calling a range valid.
- **The left-most `X-Forwarded-For` entry belongs to the client.** `next start`
  keeps a client-supplied header (`??=`), so rate-limit on the right-most hop and
  document that self-hosting needs a proxy that sets or appends it.
- **Cap a request body while reading it.** A `Content-Length` check misses
  chunked bodies; count bytes from `request.body` and cancel past the limit
  instead of calling `request.text()` and measuring afterwards.
- **Feature-detect browser APIs Next does not polyfill.** `AbortSignal.timeout`
  is missing in Safari < 16, inside Next 15's default targets; an
  `AbortController` plus `setTimeout` works everywhere.

## 2026-10-28 — Phase 2 (analyst demo)

- **Tabular figures change Inter's hyphen.** With `font-variant-numeric:
  tabular-nums` on `body`, every hyphen in running text ("Drive-or-Sell",
  "new-vehicle") and every negative number ("-0.046") rendered with a digit-wide
  gap. Apply tabular figures to numbers only (tables, stat values, chart text)
  and format negatives with the minus sign U+2212.
- **A measured SVG can widen the track it is measured in.** A chart drawn at an
  initial 640 px inside a grid with no explicit columns made the implicit
  `auto` track 640 px wide on a phone, the observer then measured 640, and the
  page scrolled sideways. Give every grid an explicit `grid-cols-1`
  (`minmax(0, 1fr)`) base, draw nothing until measured, and let the drawing
  shrink through its `viewBox` (never enlarge) for print.
- **Print hides the sidebar, not its grid track.** Hiding the assumptions panel
  with `display: none` left the content in the 18.5rem column; print CSS must
  reset the grid to one column and the children's `col-span` too.
- **End-to-end scripts are clients of the rate limit.** Reloading the page for
  every screenshot made one solve per load and hit the 20-per-minute limit;
  drive the page the way a presenter does (switch tabs in place) and count the
  solves the shim receives.
- **`pkill -f <pattern>` can match the shell running it.** The command line of
  the invoking shell contains the pattern; match the process name anchored
  (`pgrep -f "^next-server"`) or kill recorded PIDs.

## 2026-10-28 — Phase 2 completion (review of the cut-off work)

- **"Reset to defaults" must mean the engine's defaults.** The panel carried
  the old wizard's 12,000 reduced miles while ADOS 2026 v1c defaults to 8,000,
  so the Method tab tagged a non-default value as the default run. Take every
  panel default from `ModelInputs` and pin it with a test against the engine's
  `params` echo.
- **Cite only what the source gives.** A reference gained an author initial
  ("Johnson, D.") that no source supports. The ADOS MATLAB header is the source
  for the 2015 ASSA/NAFE paper; quote it as it stands.
- **An exact-count check breaks when a later compaction caps the list.** The
  adapter required `states_changed === changed_states.length`; the RR Toolbox
  API's next compaction (in progress) keeps the first 50 rows. Accept a list
  cut short only when it is marked
  (`changed_states_truncated: true`) and keep the full count for the text.
- **A heading must describe what each data mode shows.** Without the cohort
  output the replacement tab still said "Share of each age cohort that replaces
  its vehicle" over a count of grid states. Derive headings from the response.
- **Report a number field's range error on blur, not per keystroke.** Typing
  "43,000" passes through "4" and "43"; say what is wrong only when the field
  is left. (Corrected in the next round: commit on blur or Enter too, not as
  valid values appear.)
- **`emulateMedia({ media: "screen" })` sticks for `page.pdf()`.** After an
  explicit screen emulation the next PDF used screen CSS; reset with
  `media: null`. Print the PDF from the screen layout, as a presenter's Print
  does, rather than after a print-media emulation that re-measures the charts.

## 2026-10-28 — Phase 2 review round 2

- **A typed prefix is a real input once it is committed.** Committing each
  valid keystroke solved the model at 6,000 miles on the way to 60,000 (out of
  range), and the field then said "the last valid value is still in use" about
  a value nobody entered. Commit a number field on blur or Enter, and name the
  value in use when an entry is refused.
- **Compare requests by what the engine reads.** An engine without the cohort
  output ignores `price_shock`, yet the switch still changed the request, so
  every $250 step re-solved an identical baseline (two solves per step, nine
  steps to the rate limit). Decide "is this already answered?" on the inputs
  that shape the answer, remember answers for the session, and count requests
  per presenter action in every engine mode, in a unit test and end to end.
- **A failure belongs to the tab whose inputs caused it.** A scenario-only
  change that failed wiped every tab, although their figures do not depend on
  the price change. Keep the last good answer for views whose inputs did not
  change.
- **Check the step after an error.** "Try again" showed no progress because
  the status checked the error before the pending request. Report a request in
  flight before an earlier failure, and replace the error notice when a retry
  starts.
- **Per-field ranges do not make a valid combination.** Reduced miles above
  standard miles passed both ranges, and the page then described three times
  more driving as "drive fewer miles". When the copy depends on a relation
  between inputs, validate the relation in the route and in the panel.
- **A runbook number about a range needs a sweep of its corners.** "The 50-row
  cap is not reached" came from defaults and a few runs; the corners of the
  panel's ranges switch up to 78 states. Sweep the ends of every range before
  stating a maximum, and keep a real fixture of the extreme case under test.
- **Flat data needs an axis of its own.** Both paths at zero produced ticks
  "0.00%, 0.00%, -0.00%" (a hyphen, not a minus). Give fitted axes a minimum
  span and a floor, drop repeated labels, never format a negative zero, and
  say in words when there is nothing to draw.

## 2026-11-06 — Buyer cohorts screen and SI design

- **A hidden label inside a scrolling table widens the whole page.** `.visually-hidden`
  is `position: absolute`; inside an `overflow-x-auto` panel it is positioned against
  the page, lands at the cell's x in the unscrolled table and adds to the document's
  scroll width (714 px on a 390 px phone). Give such a label a positioned parent.
  Measure `document.documentElement.scrollWidth` on a phone viewport for every new
  screen, not only the elements' widths.
- **A fixture-driven shim must derive what the engine derives.** A hard-coded
  `query_state` for one grid broke every single-cohort screen as soon as the shim
  served the v1c fixture; compute the matched state from the request and the fixture's
  own grids, as the engine does.
- **Parallel shell calls share one working directory.** Two tool calls that each
  `cd` into a different repo raced and one ran in the other's directory ("No such
  file"). Use absolute paths or `git -C` in anything that may run beside another call.
- **A patch script must write before it can fail.** A multi-replacement script that
  asserted every match and wrote the file at the end lost all its edits when the last
  assertion failed on a string from another repo. Assert and write per file, or write
  before the cross-file step.

## 2026-11-06 — Buyer cohorts review

- **A table of fixed inputs is a claim about the run; check it against the echo.** The
  cohort table showed `VEHICLE_CLASSES` and the 12% trade-in share from `lib/market.ts`
  while the adapter kept each class's echoed `params` without comparing them. Whatever
  the page states as the inputs of a run, read it from the response or refuse a response
  that disagrees, as the single-cohort adapter does with `ECHOED_INPUTS`.
- **A control shared across screens is a request on every screen that reads it.** One
  `delta` for the scenario and the buyer-cohorts screens meant a $250 step on the cohorts
  screen also re-solved the single-cohort request, which that screen never shows. Give
  each screen the state that shapes its own request, or count the requests a step costs
  on every screen that shares the control.
- **Refuse in the route what the adapter will refuse after the call.** A market request
  without `cohorts: true` was forwarded, solved, and then failed on
  `aggregate.cohorts is missing`. Every shape the adapter cannot render should be an
  input error before the engine runs.

## 2026-11-06 — Interactive charts

- **Hand-drawn SVG is fine to look at and useless to read.** Presenters wanted the
  value under the pointer; a chart with no hover layer sends them to the table every
  time. Ship the crosshair and the one-tooltip-for-every-series readout with the
  chart, plus keyboard stepping, and keep the table beside it so the tooltip never
  gates a value.
- **Validate a palette; never pick chart colours by eye.** The SI site's chart colours
  failed the colour-vision and lightness checks (two adjacent cohort hues were
  indistinguishable under protanopia). The validated categorical set replaced them;
  the brand palette stays on the chrome.
- **A hover test must scroll the chart into the viewport first.** `mouse.move` to
  coordinates below the fold hovers nothing and the tooltip "never appears". Also
  scope chart locators to the visible tab panel: hidden panels keep their charts in
  the DOM, so `.first()` may pick an invisible one.
