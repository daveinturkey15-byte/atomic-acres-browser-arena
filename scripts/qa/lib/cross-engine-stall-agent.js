// ===========================================================================
// CROSS-ENGINE STALL AGENT. The half of the instrument that runs INSIDE the
// page, in whatever engine opened it.
//
// WHY IT LIVES IN THE PAGE AND NOT IN A DRIVER
// --------------------------------------------
// Installed Firefox cannot be puppeteered on this machine (Playwright ships its
// own patched Gecko; stock Firefox needs geckodriver, and a disposable
// `-profile` costs the content document its focus, which is the exact state the
// game refuses to render in - see installed-browser-lanes.mjs). Any instrument
// that reaches in from outside therefore measures Chrome and guesses about the
// other two, which is how a cap tuned only on Chrome shipped to everyone.
//
// So the page measures itself and POSTs the series home. This file is injected
// verbatim by scripts/qa/measure-cross-engine-stalls.mjs into the real shipped
// document - the published build's own bytes, not a rebuild - so all three
// engines run identical code and their numbers are comparable.
//
// WHAT IT MEASURES
// ----------------
//   presented - frames the GPU CONFIRMED retired (completedSequence advances),
//               stamped with the runtime's own lastCompletedAt clock. This is
//               what the owner sees. rAF ticks are NOT this: submitFrame()
//               returns false at the in-flight cap while rAF keeps firing, so
//               an rAF sampler reports a healthy cadence over a frozen picture.
//   rAF       - callback timestamps, recorded ONLY as the discriminator below.
//
// THE DISCRIMINATOR. A freeze has two possible shapes and they have opposite
// fixes:
//   main-thread block  - rAF gap AND presented gap together (shader/pipeline
//                        compile, GC, a texture upload, a long script).
//   presentation-only  - rAF cadence normal, presented gap large (queue
//                        backpressure: admission is refusing frames).
// Recording both series is what lets the harness say which one Firefox has
// instead of assuming it is the one Chrome had.
// ===========================================================================
(function crossEngineStallAgent() {
  var params = new URLSearchParams(window.location.search);
  if (params.get('xstall') !== '1') return;

  // The receiver is always same-origin (the mirror server serves this page and
  // collects the result), so the measurement can never leave this machine and
  // there is no CORS surface at all.
  var ENDPOINT = '/__xstall';
  var ARENA = params.get('xstallArena') || 'atomic-acres';
  var LANE = params.get('xstallLane') || 'unknown';
  var WARMUP_MS = Math.max(0, Number(params.get('xstallWarmupMs') || 12000));
  var SAMPLE_MS = Math.max(5000, Number(params.get('xstallSampleMs') || 180000));
  var BOOT_TIMEOUT_MS = Math.max(60000, Number(params.get('xstallBootMs') || 300000));
  var IDLE = params.get('xstallIdle') === '1';

  var errors = [];
  function recordError(text) {
    if (errors.length >= 40) return;
    errors.push(String(text).slice(0, 220));
  }
  window.addEventListener('error', function (event) { recordError('error: ' + String((event && event.message) || event)); });
  window.addEventListener('unhandledrejection', function (event) { recordError('rejection: ' + String((event && event.reason) || 'unknown')); });

  function post(payload, big) {
    var body = JSON.stringify(payload);
    try {
      return fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: body,
        // keepalive caps the body at 64 KB in every engine; the final series is
        // far larger than that, so only the small beacons may use it.
        keepalive: !big,
      }).catch(function () { /* receiver gone */ });
    } catch (ignored) {
      return Promise.resolve();
    }
  }

  function status(stage, extra) {
    var payload = { lane: LANE, arena: ARENA, stage: stage };
    if (extra) for (var key in extra) payload[key] = extra[key];
    return post(payload, false);
  }

  function sleep(ms) {
    return new Promise(function (settle) { window.setTimeout(settle, ms); });
  }

  function waitFor(condition, timeoutMs) {
    return new Promise(function (settle) {
      var startedAt = performance.now();
      var tick = function () {
        var met = false;
        try { met = Boolean(condition()); } catch (ignored) { met = false; }
        if (met) { settle(true); return; }
        if (performance.now() - startedAt > timeoutMs) { settle(false); return; }
        window.setTimeout(tick, 200);
      };
      tick();
    });
  }

  var debug = function () { return window.__ATOMIC_ACRES_DEBUG__; };
  var canvas = function () { return document.querySelector('canvas'); };
  var menuHidden = function () {
    var menu = document.querySelector('#menu');
    return menu === null || menu.classList.contains('hidden');
  };

  // PLAYABILITY, and why focus is half of it.
  //
  // The renderer refuses to author a frame unless the document owns the
  // foreground (browserOwnsForegroundPresentation), so a run whose window is
  // stolen - by another QA lane, an installer, a notification - stops
  // presenting BY DESIGN. Measured 2026-08-31: a lane that lost the foreground
  // one second into sampling reported 4.6 presented fps and a 1.9-second
  // "stall" that was entirely the harness's own fault.
  //
  // Refreshed on the animation callback and cached, so the 4 ms counter sampler
  // can read it without calling into the browser 250 times a second.
  var playableNow = true;
  var refreshPlayable = function () {
    playableNow = menuHidden()
      && document.visibilityState === 'visible'
      && (typeof document.hasFocus !== 'function' || document.hasFocus());
    return playableNow;
  };

  // -------------------------------------------------------------------------
  // Sampler
  // -------------------------------------------------------------------------
  function installSampler() {
    var api = debug();
    if (!api || !api.samplePresentationCounters) throw new Error('samplePresentationCounters unavailable: build predates the presented-frame instrument');

    // Parallel arrays, not objects: a three-minute run at 165 Hz is ~30k frames
    // per series and an array of objects turns that into a multi-megabyte POST
    // whose serialisation cost lands inside the window it is measuring.
    var presentedAt = [];
    var presentedAdvance = [];
    var presentedPlayable = [];
    var latencyMs = [];
    var submittedAt = [];
    var rafAt = [];
    var rafPlayable = [];
    var seconds = [];
    var longTasks = [];
    var inFlightHistogram = {};
    var lastCompleted = -1;
    var lastSubmitted = -1;
    var firstCounters = null;
    var lastCounters = null;
    var unplayableSamples = 0;
    var running = true;
    var round2 = function (value) { return Math.round(value * 100) / 100; };

    var sample = function () {
      var counters = api.samplePresentationCounters();
      var playable = playableNow;
      if (!playable) unplayableSamples += 1;
      if (firstCounters === null) firstCounters = counters;
      lastCounters = counters;
      if (counters.completedSequence !== lastCompleted) {
        if (lastCompleted >= 0 && counters.lastCompletedAt !== null) {
          presentedAt.push(round2(counters.lastCompletedAt));
          presentedAdvance.push(counters.completedSequence - lastCompleted);
          presentedPlayable.push(playable ? 1 : 0);
          if (playable && counters.lastCompletionLatencyMs !== null) latencyMs.push(round2(counters.lastCompletionLatencyMs));
        }
        lastCompleted = counters.completedSequence;
      }
      if (counters.submissionSequence !== lastSubmitted) {
        if (lastSubmitted >= 0 && counters.lastSubmittedAt !== null) submittedAt.push(round2(counters.lastSubmittedAt));
        lastSubmitted = counters.submissionSequence;
      }
      if (playable) {
        var depth = String(counters.inFlightSubmissions);
        inFlightHistogram[depth] = (inFlightHistogram[depth] || 0) + 1;
      }
    };

    // One row per wall-clock second. The Chrome collapse is a TIME SERIES
    // phenomenon - completion latency walks from 5 ms to 48 ms over three
    // seconds and never returns - and a window average erases it entirely.
    var secondStartedAt = performance.now();
    var secondBaseline = null;
    var closeSecond = function (now) {
      if (lastCounters === null) return;
      if (secondBaseline === null) secondBaseline = lastCounters;
      if (now - secondStartedAt < 1000) return;
      var elapsed = (now - secondStartedAt) / 1000;
      var surface = canvas();
      var hud = document.querySelector('#fps-counter b');
      seconds.push({
        second: seconds.length,
        atMs: Math.round(now),
        presentedHz: round2((lastCounters.completedSequence - secondBaseline.completedSequence) / elapsed),
        submittedHz: round2((lastCounters.submissionSequence - secondBaseline.submissionSequence) / elapsed),
        refusedHz: round2((lastCounters.skippedSubmissions - secondBaseline.skippedSubmissions) / elapsed),
        completionLatencyMs: lastCounters.lastCompletionLatencyMs === null ? null : round2(lastCounters.lastCompletionLatencyMs),
        inFlight: lastCounters.inFlightSubmissions,
        maxInFlight: lastCounters.maximumInFlightSubmissions,
        outstandingProbes: lastCounters.outstandingCompletionProbes,
        starvationRecoveries: lastCounters.starvationRecoveries,
        consecutiveRefused: lastCounters.consecutiveRefusedSubmissions,
        calls: lastCounters.calls,
        triangles: lastCounters.triangles,
        // The adaptive-quality hypothesis, tested for free: an oscillating
        // pixel-ratio controller shows up as a drawing buffer that changes size
        // mid-match. Read off the canvas, so it costs nothing - snapshot() is
        // far too expensive to call on a timer inside its own measurement.
        bufferWidth: surface ? surface.width : null,
        bufferHeight: surface ? surface.height : null,
        devicePixelRatio: window.devicePixelRatio,
        playable: playableNow,
        hasFocus: typeof document.hasFocus === 'function' ? document.hasFocus() : null,
        visibility: document.visibilityState,
        pointerLocked: document.pointerLockElement !== null,
        hudFps: hud ? Number(hud.textContent) : null,
        // Chromium only. A heap that saw-tooths in step with the stalls is the
        // GC hypothesis; a flat heap rules it out.
        heapMb: (performance.memory && performance.memory.usedJSHeapSize)
          ? Math.round(performance.memory.usedJSHeapSize / 1048576)
          : null,
      });
      secondStartedAt = now;
      secondBaseline = lastCounters;
    };

    var tick = function (now) {
      if (!running) return;
      refreshPlayable();
      rafAt.push(Math.round(now * 100) / 100);
      rafPlayable.push(playableNow ? 1 : 0);
      sample();
      closeSecond(performance.now());
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    // 4 ms is far below any presentation interval this game can produce, and a
    // counter read is a handful of property loads, so a presented frame that
    // lands between two rAF callbacks is still seen without perturbing the
    // thing being measured.
    var timer = window.setInterval(sample, 4);

    var observer = null;
    try {
      // Chromium only (Gecko does not implement longtask). Where it exists it
      // names the main-thread blocks directly; where it does not, the rAF gap
      // series carries the same signal engine-agnostically.
      observer = new PerformanceObserver(function (list) {
        var entries = list.getEntries();
        for (var i = 0; i < entries.length; i += 1) {
          if (longTasks.length >= 500) break;
          longTasks.push({ atMs: Math.round(entries[i].startTime), durationMs: Math.round(entries[i].duration) });
        }
      });
      observer.observe({ entryTypes: ['longtask'] });
    } catch (ignored) { observer = null; }

    return {
      stop: function () {
        running = false;
        window.clearInterval(timer);
        if (observer) { try { observer.disconnect(); } catch (ignored) { /* gone */ } }
        return {
          presentedAt: presentedAt,
          presentedAdvance: presentedAdvance,
          presentedPlayable: presentedPlayable,
          latencyMs: latencyMs,
          submittedAt: submittedAt,
          rafAt: rafAt,
          rafPlayable: rafPlayable,
          seconds: seconds,
          longTasks: longTasks,
          longTaskSupported: observer !== null,
          inFlightHistogram: inFlightHistogram,
          unplayableSamples: unplayableSamples,
          first: firstCounters,
          last: lastCounters,
        };
      },
    };
  }

  // -------------------------------------------------------------------------
  // Combat driver.
  //
  // A standing camera does not reproduce what the owner is reporting, and it
  // does not exercise the paths (muzzle flashes, impact decals, tracer pooling,
  // bot animation) that plausibly compile pipelines mid-match.
  //
  // Movement and trigger go through the debug hooks, which write the real input
  // state and work with or without pointer lock. Look needs pointer lock: the
  // game reads event.movementX and ignores mousemove unless the canvas holds
  // the lock, so a synthetic mousemove steers only when the harness's real
  // click won the lock. That is reported, never assumed.
  // -------------------------------------------------------------------------
  function startCombatDriver() {
    var api = debug();
    var step = 0;
    var recoveries = 0;
    var lookApplied = 0;
    var deadSince = null;
    var aliveCache = null;

    var key = function (type, code) {
      try {
        window.dispatchEvent(new KeyboardEvent(type, { code: code, key: code, bubbles: true, cancelable: true }));
      } catch (ignored) { /* engine refused a synthetic key */ }
    };

    var timer = window.setInterval(function () {
      step += 1;
      try {
        // Focus loss opens the pause menu by design, and the renderer then
        // stops presenting on purpose. Left unhandled it reads exactly like the
        // freeze being hunted.
        if (typeof document.hasFocus === 'function' && !document.hasFocus()) return;
        if (!menuHidden()) {
          var resume = document.querySelector('#resume');
          if (resume) { resume.click(); recoveries += 1; }
          return;
        }

        // NEVER call snapshot() on the hot path. Measured 2026-08-31: the
        // driver polled it every 50 ms for an aliveness check and dragged the
        // whole animation callback down to exactly 20 Hz in Chrome AND Edge -
        // an instrument-shaped "stall" that looked like a renderer defect in
        // both engines at once. snapshot() walks the scene, the post chain and
        // the material compatibility table; it is a teardown tool, not a
        // sampler. Twice a second is affordable and is all an aliveness check
        // needs.
        if (step % 40 === 0) {
          try { aliveCache = api.snapshot().player.alive; } catch (ignored) { aliveCache = null; }
        }
        if (aliveCache === false) {
          if (deadSince === null) deadSince = performance.now();
          if (performance.now() - deadSince > 3000) {
            try { api.respawn(); } catch (ignored) { /* respawn refused */ }
            deadSince = null;
          }
          return;
        }
        deadSince = null;

        // Forward, with a sprint burst every other second.
        if (api.setMovement) api.setMovement(true, step % 40 < 12);

        // Strafe pulses. These need gameplayInputEnabled(), which needs the
        // pointer lock; harmless no-ops without it.
        if (step % 20 === 0) key('keydown', 'KeyA');
        if (step % 20 === 6) key('keyup', 'KeyA');
        if (step % 20 === 10) key('keydown', 'KeyD');
        if (step % 20 === 16) key('keyup', 'KeyD');
        if (step % 60 === 30) { key('keydown', 'Space'); key('keyup', 'Space'); }

        // Look. Sweeps rather than spins, so the camera keeps facing arena
        // geometry instead of the sky.
        if (document.pointerLockElement !== null) {
          var surface = canvas();
          if (surface) {
            try {
              surface.dispatchEvent(new MouseEvent('mousemove', {
                bubbles: true,
                movementX: Math.round(Math.sin(step / 9) * 26),
                movementY: Math.round(Math.cos(step / 17) * 5),
              }));
              window.dispatchEvent(new MouseEvent('mousemove', {
                bubbles: true,
                movementX: Math.round(Math.sin(step / 9) * 26),
                movementY: Math.round(Math.cos(step / 17) * 5),
              }));
              lookApplied += 1;
            } catch (ignored) { /* engine refused a synthetic mouse move */ }
          }
        } else if (step % 25 === 0 && api.aimAtBot) {
          // No lock: swing the camera onto a bot instead, so the run still
          // changes what is on screen and still shoots at something.
          try { api.aimAtBot(); } catch (ignored) { /* no bot staged yet */ }
        }

        // Fire in bursts, and reload when the burst pattern says to.
        if (step % 16 === 0 && api.setTriggerHeld) api.setTriggerHeld(true);
        if (step % 16 === 9 && api.setTriggerHeld) api.setTriggerHeld(false);
        if (step % 200 === 150 && api.reload) { try { api.reload(); } catch (ignored) { /* reload refused */ } }
        if (step % 300 === 250 && api.melee) { try { api.melee(); } catch (ignored) { /* melee refused */ } }
      } catch (error) {
        recordError('combat: ' + String(error));
      }
    }, 50);

    return {
      stop: function () {
        window.clearInterval(timer);
        try { if (debug().setTriggerHeld) debug().setTriggerHeld(false); } catch (ignored) { /* gone */ }
        try { if (debug().setMovement) debug().setMovement(false, false); } catch (ignored) { /* gone */ }
        return { pauseMenuRecoveries: recoveries, lookApplied: lookApplied };
      },
    };
  }

  // -------------------------------------------------------------------------
  // Run
  // -------------------------------------------------------------------------
  (async function run() {
    try {
      await status('armed', { userAgent: navigator.userAgent, webgpuAvailable: Boolean(navigator.gpu) });

      var reachedMenu = await waitFor(function () {
        var solo = document.querySelector('#solo');
        return solo !== null && !solo.disabled;
      }, BOOT_TIMEOUT_MS);
      if (!reachedMenu) { await post({ lane: LANE, arena: ARENA, error: 'bootstrap-timeout', errors: errors }, false); return; }
      await status('bootstrap-ready', { backend: document.documentElement.dataset.renderBackend || null });

      var card = document.querySelector('.map-card[data-arena-id="' + ARENA + '"]');
      if (card) card.click();
      var nameField = document.querySelector('#player-name');
      if (nameField) nameField.value = 'Stall Probe';
      await sleep(400);
      document.querySelector('#solo').click();

      var active = await waitFor(function () {
        var snapshot = debug() && debug().snapshot();
        return Boolean(snapshot && snapshot.matchPhase === 'active' && snapshot.gameStarted === true);
      }, BOOT_TIMEOUT_MS);
      if (!active) { await post({ lane: LANE, arena: ARENA, error: 'match-start-timeout', errors: errors }, false); return; }
      await status('match-active', { backend: document.documentElement.dataset.renderBackend || null });

      // Warmup is excluded on purpose. Cold pipeline creation and arena
      // streaming are real costs but they are not the steady state the owner
      // is describing, and they would dominate the first seconds of any window.
      await sleep(WARMUP_MS);

      var context = {
        backend: document.documentElement.dataset.renderBackend || null,
        pointerLocked: document.pointerLockElement !== null,
        hasFocus: typeof document.hasFocus === 'function' ? document.hasFocus() : null,
        visibility: document.visibilityState,
        devicePixelRatio: window.devicePixelRatio,
        bufferWidth: canvas() ? canvas().width : null,
        bufferHeight: canvas() ? canvas().height : null,
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        userAgent: navigator.userAgent,
      };
      await status('sampling', context);

      var sampler = installSampler();
      var combat = IDLE ? null : startCombatDriver();
      await sleep(SAMPLE_MS);
      var driver = combat ? combat.stop() : { pauseMenuRecoveries: 0, lookApplied: 0 };
      var series = sampler.stop();

      var endState = {
        pointerLocked: document.pointerLockElement !== null,
        hasFocus: typeof document.hasFocus === 'function' ? document.hasFocus() : null,
        visibility: document.visibilityState,
        menuHidden: menuHidden(),
        bufferWidth: canvas() ? canvas().width : null,
        bufferHeight: canvas() ? canvas().height : null,
      };
      try { endState.presentation = debug().samplePresentationTelemetry(); } catch (ignored) { endState.presentation = null; }
      try {
        var snapshot = debug().snapshot();
        endState.matchPhase = snapshot.matchPhase;
        endState.alive = snapshot.player ? snapshot.player.alive : null;
        endState.pixelRatio = snapshot.render ? snapshot.render.pixelRatio : null;
        endState.drawingBuffer = snapshot.render ? snapshot.render.drawingBuffer : null;
      } catch (ignored) { /* snapshot unavailable at teardown */ }

      await post({
        lane: LANE,
        arena: ARENA,
        stage: 'result',
        context: context,
        endState: endState,
        driver: driver,
        errors: errors,
        series: series,
      }, true);
      await status('complete', {});
    } catch (error) {
      await post({ lane: LANE, arena: ARENA, error: String(error).slice(0, 400), errors: errors }, false);
    }
  }());
}());
