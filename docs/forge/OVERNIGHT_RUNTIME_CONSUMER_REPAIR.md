# Runtime asset integration checkpoint

13 September 2026. Local preview only; production release and concept-quality visual acceptance remain open.

The authored Blender assets were present on disk and worked in the gallery, but the game constructed its arena in a staging scene and immediately detached it before live adoption. The presentation loaders incorrectly treated that move as terminal disposal. Browser inspection confirmed an empty, disposed house handle and permanently loading PBR/vehicle statuses, with no JavaScript exception. Earlier successful screenshot capture was not proof that these assets appeared in gameplay.

Fable authored house substitution and its load-failure repairs. Muse traced and repaired staging adoption. Integration review added two-phase retirement behind the GPU fence, preserved exact-generation cache eviction, and corrected missing-audit visibility. The real browser then exposed another mismatch: GLTFLoader inserts a scene wrapper and sanitizes names. House metadata is now located by its exact authored semantic partition, with missing or duplicate metadata rejected.

Verified on the final review candidate: 91 focused tests across seven files, TypeScript, Vite, and real Chrome WebGPU in Quality and Performance. Both houses report substituted; PBR textures and Blender vehicles report ready. Forty independent dynamic windows remain authoritative, break and disappear. Normal detach retains loaded resources; explicit retirement hides the generation, and resources release after the actual GPU queue fence. The GLB's merged glass remains hidden because its 22 markers per house cannot represent the game's 20 independently breakable panes per house.

Visual review remains open. Close-up siding exhibits excessive repetition, lighting and background detail remain below the supplied concepts, and Blender interior furniture and new props still need safe world placement. This checkpoint fixes consumption of authored work; it does not claim AAA quality or complete use of every ingested technique.

Local evidence is retained under `work/overnight-20260912`: `lifecycle-import-receipt.json`, `build15-focused-tests.log`, the before/after staging receipts, and `captures/build15-house-final-review/receipt.json`. The native Muse wrapper's failed status caused by a tool error is preserved separately from the subsequently verified contribution. Its isolated stub-based checks were superseded by checks in the real integration tree.
