import { NUKETOWN2_BOUNDS, NUKETOWN2_SECTION, NUKETOWN2_STREET_LENGTH, NUKETOWN2_SPAWN_LAYOUT } from '../../src/nuketown2-arena';
console.log('bounds', JSON.stringify(NUKETOWN2_BOUNDS));
console.log('section', JSON.stringify(NUKETOWN2_SECTION));
console.log('L', NUKETOWN2_STREET_LENGTH);
const s = NUKETOWN2_SECTION as any;
const backWall = s.streetHalfWidth + s.frontVergeDepth + s.houseDepth;
console.log('backWall', backWall, 'fence', backWall + s.yardDepth, 'outer', backWall + s.yardDepth + s.sidePathDepth);
console.log('spawns0', JSON.stringify(NUKETOWN2_SPAWN_LAYOUT[0]));
