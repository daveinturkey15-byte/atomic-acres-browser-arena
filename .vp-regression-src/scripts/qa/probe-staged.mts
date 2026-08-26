import { probeH264Mp4 } from '../../scripts/qa/pass66-killstreak-demo-video-probe';
const result = await probeH264Mp4('artifacts/pass66/killstreak-demo-capture/staged/care-package.mp4');
console.log(JSON.stringify(result, null, 2));
