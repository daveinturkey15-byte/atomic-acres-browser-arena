/**
 * src/map3/technique-lab/manifest.ts — initial public-source manifest (HOST side).
 *
 * Transcribed from the packet's public-source-metadata.json (public source IDs
 * 1–50: titles + URLs only). Every record starts in the explicit
 * 'Pending / Not yet delivered' state. Row 21 aliases row 19, so this file keeps
 * 50 numbered records WITHOUT claiming 50 distinct techniques.
 *
 * Association with this manifest (or a URL) only ever supports the
 * 'Link saved' stage. Nothing here implies source inspection, extraction,
 * implementation or tested results. Demo groups arriving later overlay entries
 * onto these records; absent IDs stay pending.
 */

export type PublicState = 'Pending / Not yet delivered';

export interface PublicRecord {
  sourceId: number;
  title: string;
  sources: string[];
  /** Non-null when this row is an alias of another row (row 21 -> row 19). */
  aliasOf: number | null;
  state: PublicState;
}

const PENDING: PublicState = 'Pending / Not yet delivered';

function rec(
  sourceId: number,
  title: string,
  sources: string[],
  aliasOf: number | null = null,
): PublicRecord {
  return { sourceId, title, sources, aliasOf, state: PENDING };
}

export const PUBLIC_RECORDS: PublicRecord[] = [
  rec(1, 'Mocap to in-game animation', [
    'https://x.com/Graalitoo/status/2089469774602633431',
    'https://github.com/squall01337/mixamo-llm-mocap',
  ]),
  rec(2, 'Spectral FFT ocean', [
    'https://x.com/Graalitoo/status/2089656660981862487',
    'https://github.com/squall01337/abyssal-ocean',
  ]),
  rec(3, 'Stylized water composition', [
    'https://x.com/Graalitoo/status/2077373937449648518',
  ]),
  rec(4, 'Underwater volume and waterline cutting', [
    'https://x.com/gruberbuilds/status/2090235767922512234',
  ]),
  rec(5, 'Local H3 video to sprite animation', [
    'https://x.com/victormustar/status/2089310616854892818',
    'https://www.minimax.io/blog/minimax-h3',
    'https://huggingface.co/MiniMaxAI/MiniMax-H3',
  ]),
  rec(6, 'Image to procedural Three.js model', [
    'https://github.com/img2threejs/img2threejs',
  ]),
  rec(7, 'Code-only procedural scene authoring', [
    'https://x.com/prasenx/status/2087604022849184080',
    'https://github.com/StarKnightt/night-street',
  ]),
  rec(8, 'Fully procedural jungle (same author, earlier)', [
    'https://github.com/StarKnightt/jungle-trail',
  ]),
  rec(9, 'Three.js frame-loop and visual audit', [
    'https://x.com/aidenybai/status/2089400082550620636',
    'https://github.com/millionco/react-doctor',
  ]),
  rec(10, 'Vibe3D asset registry', [
    'https://x.com/DerekBrenner/status/2089780687708856412',
    'https://x.com/alightinastorm/status/2088712139364041161',
    'https://x.com/alightinastorm/status/2097598580546470197',
    'https://github.com/vibe-stack/vibe3d',
    'https://github.com/keysforthewin/thaikit',
  ]),
  rec(11, 'Scaffold in code, generate the hero asset', [
    'https://x.com/filiksyos/status/2089297181026951425',
  ]),
  rec(12, 'Closed-loop asset generation with browser self-verification', [
    'https://x.com/anshuc/status/2065598069790716294',
  ]),
  rec(13, 'Gauntlet loop', [
    'https://somethingbig.ai/gauntlet-loop',
    'https://github.com/mshumer/Claude-of-Duty',
  ]),
  rec(14, 'Modern Claudefare', ['https://www.modernclaudefare.com/']),
  rec(15, 'Native RTX runtime for Three.js (ThreeRuntime)', [
    'https://x.com/samgcoder/status/2091775237646114921',
    'https://github.com/SamG-Coder/threepp',
  ]),
  rec(16, 'Text to character animation, locally (kimodo.cpp)', [
    'https://x.com/stefan_3d_ai/status/2091531702183350276',
    'https://x.com/jichiep/status/2091277918521417834',
    'https://github.com/localai-org/kimodo.cpp',
  ]),
  rec(17, 'Environment-art quality bar (Cadle)', ['https://cadle.gg/']),
  rec(18, 'Procedural grass and landscape systems for Three.js', [
    'https://github.com/CK42BB/procedural-grass-threejs',
  ]),
  rec(19, 'Classic ray tracing in the browser (THREE.js-RayTracing-Renderer)', [
    'https://github.com/erichlof/THREE.js-RayTracing-Renderer',
  ]),
  rec(20, 'Engine-free Three.js armour, ballistics and destructible battlefields (Claude of Tanks)', [
    'https://cot.kevinliu.studio/',
    'https://github.com/Kevin-Liu-01/Claude-of-Tanks',
  ]),
  // Row 21 is an alias of row 19: same technique, kept as its own numbered row.
  rec(21, 'Classic ray tracing as a shipped option - see row 19', [], 19),
  rec(22, 'Environment-art comparators, 2026-08-24 batch', [
    'https://revo-realms.aleksandargjoreski.dev/',
    'https://winchxyz.github.io/moon-rover/',
    'https://yugiriworks.itch.io/sky-fang',
  ]),
  rec(23, 'Hand-written GLSL combat sim with deforming terrain (Battle of Hoth)', [
    'https://battle-of-the-hoth-simulator.vercel.app/',
    'https://github.com/csanz/battle-of-the-hoth-simulator',
  ]),
  rec(24, 'TAKEN - browser survival horror, dense ground cover and night sky (VOIDMODE)', [
    'https://www.taken-game.com/play',
  ]),
  rec(25, 'Browser water with shoreline waves and blending (VOIDMODE)', [
    'https://x.com/voidmode/status/2079334222217588842',
  ]),
  rec(26, 'Arcade attract-loop game-select menu (AMIX GAMES)', [
    'https://amix-design.com/tl/web-g-games/',
  ]),
  rec(27, 'Three.js game skill pack (majidmanzarpour)', [
    'https://github.com/majidmanzarpour/threejs-game-skills',
  ]),
  rec(28, 'WebGPU Claude skill (dgreenheck)', [
    'https://github.com/dgreenheck/webgpu-claude-skill',
  ]),
  rec(29, 'Three.js skills collection (CloudAI-X)', [
    'https://github.com/CloudAI-X/threejs-skills',
  ]),
  rec(30, "Generated video as MOTION REFERENCE, not as the asset (the owner's bridge)", []),
  rec(31, 'Rigged first-person arms, CC0 (para / OpenGameArt)', [
    'https://opengameart.org/content/fps-arms-rigged-only',
  ]),
  rec(32, 'WAN 2.2 - local text-to-video and image-to-video, Apache 2.0', [
    'https://docs.comfy.org/tutorials/video/wan/wan2_2',
  ]),
  rec(33, 'ThreeJS Super Terrain — Partitioned Mesh Terrain with Live CSG & Worker LOD', [
    'https://x.com/alightinastorm/status/2091649089272156592',
    'https://vibe-stack.github.io/super-terrain',
    'https://github.com/vibe-stack/super-terrain',
  ]),
  rec(34, 'Claude-of-Duty - full-procedural FPS from a subsystem-contract prompt', [
    'https://x.com/mattshumer_/status/2081054356405731740',
    'https://github.com/mshumer/Claude-of-Duty',
  ]),
  rec(35, 'gas-station-highway - one-page photoreal-scene brief, all-procedural', [
    'https://x.com/prasenx/status/2093762240361173305',
    'https://github.com/StarKnightt/gas-station-highway',
  ]),
  rec(36, 'Needle Mesh Baker - browser highpoly->lowpoly remesh + texture baking', [
    'https://x.com/hybridherbst/status/2093299068441092380',
    'https://mesh-baker.needle.tools',
    'https://mesh-baker.needle.tools/',
    'https://needle.click/mesh-baker-docs',
    'https://engine.needle.tools/docs/products/needle-mesh-baker',
    'https://issues.chromium.org/issues/338730587',
    'https://issues.chromium.org/issues/42251215',
    'https://needle.tools:443',
    'https://cloud.needle.tools/pricing?source=baker',
  ]),
  rec(37, 'fable-test - WebGPU rebuild of a commercial level from user-owned game data', [
    'https://x.com/samgcoder/status/2093773310203191312',
    'https://github.com/SamG-Coder/fable-test',
  ]),
  rec(38, 'Procedural forest, foliage and tree editor — the SAME artefact as row 33', [
    'https://x.com/alightinastorm/status/2093648383202259325',
    'https://x.com/tokengremlin/status/2094265309360185606',
    'https://github.com/vibe-stack/super-terrain',
  ]),
  rec(39, 'Engine-native procedural level generation over an MCP bridge (Unreal, Unity)', [
    'https://x.com/fabianofirmo/status/2094044844804993523',
    'https://x.com/Stefan_3D_AI',
  ]),
  rec(40, 'Voxel structural failure, topology-derived lighting, and silhouette carving (Voxpolia)', [
    'https://x.com/VoxpoliaGame',
    'https://github.com/endstreet.itch.io/voxpolia',
  ]),
  rec(41, 'The technique-demo hub — a portfolio as a catalogue of self-contained sketches', [
    'https://x.com/curllmooha',
  ]),
  rec(42, 'The vibe-stack shelf — six further MIT Three.js tools by the row 10/33/38 author', [
    'https://x.com/stefan_3d_ai?s=11',
  ]),
  rec(43, 'Image to engine-native editable scene, with lighting kept as a parameter (Lumera)', [
    'https://x.com/stefan_3d_ai/status/2093937170717585657',
  ]),
  rec(44, 'Thin comparators from the 2026-08-31 sweep', [
    'https://x.com/lexnlin/status/2093982122197627217',
    'https://x.com/Stefan_3D_AI',
  ]),
  rec(45, 'Trellis.2 and Pixal3D as CORE ComfyUI nodes - local image-to-3D with a full PBR bake', [
    'https://x.com/comfyui/status/2094561833638404449',
    'https://blog.comfy.org/p/trellis2-and-pixal3d-are-now-native',
    'https://docs.comfy.org/tutorials/3d/trellis2',
    'https://x.com/philippsieben/status/2095440655170294085',
    'https://github.com/comfyanonymous/ComfyUI',
    'https://github.com/microsoft/TRELLIS.2',
    'https://github.com/TencentARC/Pixal3D',
  ]),
  rec(46, 'Physically-based FFT ocean, and bubble backscatter as the missing colour term (Three.js Water Pro)', [
    'https://x.com/dangreenheck/status/2095028187063280085',
    'https://docs.threejswaterpro.com/license.html',
    'https://github.com/dgreenheck/webgpu-water',
  ]),
  rec(47, 'GTA-style open-world city art - a bar, not a pipeline (the loop is already rows 13 and 34)', [
    'https://x.com/mattshumer_/status/2095187868746383758',
    'https://somethingbig.ai/gauntlet-loop',
  ]),
  rec(48, 'The dark-interior look bought with no lighting technology at all (browser subway FPS)', [
    'https://x.com/bijanbowen/status/2094931925513261273',
    'https://api.fxtwitter.com/bijanbowen/status/2094931925513261273',
  ]),
  rec(49, 'MotionBricks - a realtime motion PLANNER, with Kimodo as its authoring input (motion-bricks.cpp)', [
    'https://x.com/jichiep/status/2095157236658315288',
    'https://github.com/localai-org/motion-bricks.cpp',
  ]),
  rec(50, 'fable51-worlds - agent-swarm-built explorable cities, and a world QA harness that is mechanical', [
    'https://github.com/PhiloLabs/fable51-worlds',
    'https://x.com/superalesha/status/2089126766854238421',
    'https://x.com/cdngdev/status/2097339677128982873',
    'https://x.com/chooi_jeq/status/2096064315115839904',
    'https://x.com/robbyant_brain',
  ]),
];
