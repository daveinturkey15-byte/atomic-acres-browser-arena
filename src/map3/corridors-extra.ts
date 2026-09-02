/**
 * map3/corridors-extra.ts — corridors 4, 5 and 6.
 *
 *   4. WATER    — Gerstner shoreline, physics buoyancy, floating crates/buoys/barrels,
 *                 and vehicle water interaction with rooster tails & bow splashes.
 *   5. WEATHER  — Seasons & weather table with heavy torrential storm, turbulent
 *                 wind drift, and ground splash rings & puddles.
 *   6. VOLUME   — Volumetric god rays with true sun back-projection, clerestory
 *                 roof apertures, and dust motes.
 */

export { createWaterCorridor } from './corridor-water';
export { createWeatherCorridor } from './corridor-weather';
export { createVolumeCorridor } from './corridor-volume';
