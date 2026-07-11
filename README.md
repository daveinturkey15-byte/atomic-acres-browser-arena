# Cul-de-Sac 2025

Browser-based original FPS arena inspired by fast classic two-house suburban arena flow. No ripped assets, names, logos, or proprietary map geometry.

Run locally:

```bash
npm install
npm run dev
```

Build for GitHub Pages:

```bash
npm run build
```

## Current stability fixes

- Reload timing uses the main frame delta only; HUD no longer consumes a second clock delta.
- Movement uses a small fixed-step accumulator for more stable collision and jump feel.
- Remote players interpolate toward network targets and stale peers are removed after 10 seconds.
- Vite is configured for vanilla TypeScript; unused React plugin dependency removed.
