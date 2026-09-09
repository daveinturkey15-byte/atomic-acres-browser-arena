# PASS 94 HF-467 stop-class hotfix

## Scope and claim states

- **VERIFIED** — Work was performed in the new worktree `C:/Users/david/projects/aa-claude-hf467` on `contrib/dave-gaming-pc/claude/hf467-stop-class`, initially at `baece3b1b6e47369a3ddbba2a3f9f19ffe439bd3`, with the requested `node_modules` junction to `aa-claude-chopper`.
- **VERIFIED** — The only runtime rule change is in `src/ballistics.ts`: one stop-class hit charges at least `BALLISTIC_STOP_MINIMUM_THICKNESS_METERS = 0.6` metres of that material. The physical interval and reported stop depth remain based on the authored surface thickness.
- **VERIFIED** — The floor applies only when `ballisticMaterialClass(material) === 'stop'`; `penetrate`, `perforate`, and `shatter` materials retain their actual traversal thickness charge.
- **VERIFIED** — Concrete remains explicitly rated `concrete`; no Nuke Town surface was re-rated as `earth` and no probe contract was changed.
- **VERIFIED** — Brick remains the retained `stop` class required by the executable lab/probe contract. Carbine and sniper still cross the existing rifle-through-brick case when their energy clears the brick toll; `stop` is cover pricing, not absolute immunity.
- **VERIFIED** — The new unit coverage asserts 0.12 m concrete stops pistol and carbine, a sniper clears the stop floor, thick concrete uses its physical thickness, and wood/thin-metal/glass do not receive the floor.

## Mechanical evidence

- **VERIFIED** — `npx tsc --noEmit` exited 0.
- **VERIFIED** — The explicitly expanded PowerShell equivalent of the requested named Vitest set ran 7 files and passed 100 tests. The literal quoted wildcard invocation ran 3 files and passed 77 tests because PowerShell/Vitest did not expand the wildcard; the four matching shed test files were then named explicitly.
- **VERIFIED** — `npm run build` exited 0 and produced `dist`.
- **VERIFIED** — The requested preview was started on `127.0.0.1:4303` as Vite PID 59396 with a hidden window. It was stopped after the browser gates; `:4303` had zero listeners afterward and the owner’s `:4300` listener remained present.
- **VERIFIED** — The browser gates used installed Chrome headless on hardware NVIDIA WebGPU. ComfyUI was empty and NVIDIA free memory was above 3000 MiB at each admitted run. Other headless Chrome contention was allowed to clear by one-minute polls; no unrelated process was terminated.

## Quoted probe lines

**VERIFIED — `verify-hf467-material-classes-cdp.mjs --dist dist --url http://127.0.0.1:4303 --arenas nuketown2,gun-range`:**

```text
[hf467] backend=webgpu gpu={"secureContext":true,"navigatorGpu":true,"vendor":"nvidia","hasDevice":true}
[hf467] nuketown2      OK 50454 ms pistolCrossed={"interior-wall":1578,"vehicle":103,"wood":165,"glass":68,"thin-metal":68,"structural-metal":7,"fence":8} pistolStopped={"concrete":273,"earth":208,"interior-wall":763,"vehicle":308,"wood":200,"glass":29,"thin-metal":64,"structural-metal":17,"fence":4}
[hf467] gun-range      OK 56922 ms pistolCrossed={"interior-wall":1099,"structural-metal":217,"wood":84,"glass":26,"thin-metal":4} pistolStopped={"concrete":654,"structural-metal":435,"interior-wall":413,"wood":19,"glass":4,"thin-metal":2,"brick":10}
{
  "verdict": "PASS",
  "backend": "webgpu",
  "failedArenas": []
}
```

**VERIFIED — `verify-hf390-ballistics-cdp.mjs --url http://127.0.0.1:4303 --arenas nuketown2`:**

```text
[hf390] backend=webgpu gpu={"secureContext":true,"navigatorGpu":true,"vendor":"nvidia","hasDevice":true}
[hf390] nuketown2          OK 133400 ms impacts=280/360 penetratingTraces=213 families={"interior-wall":243,"vehicle":36,"glass":10,"wood":14,"fence":16,"concrete":8,"thin-metal":1}
{
  "verdict": "PASS",
  "backend": "webgpu",
  "failedArenas": []
}
```

## Preflight and residuals

- **VERIFIED** — `npm run pipeline:preflight -- --machine dave-gaming-pc --harness claude` passed on the requested `claude` contribution branch, including lockfile verification and current `origin/main` ancestry.
- **VERIFIED** — `npm run pipeline:preflight -- --machine dave-gaming-pc --harness Codex` was attempted as documented but the repository guard rejects uppercase/non-slug harness values; the branch prefix is also `claude`, so the matching lowercase lane invocation above was used. No verifier was weakened.
- **OPEN** — The global AKP audit still reports unrelated stale/expired rows for other trusted or quarantined harnesses; the Codex-on-dave-gaming-pc row was absent from the audit failure output and its direct check passed.
