import { createHash } from 'node:crypto';
import { loftBody, latheGeometry, chamferedBar, stripAtHeight, roofRail, surfaceBandAtHeights } from './geometry';
import { COACH_SPEC, TRUCK_CAB_SPEC, SEDAN_SPEC } from './specs';
import { wheelParts } from './wheels';
import type { BufferGeometry, BufferAttribute } from 'three';
import { describe, expect, it } from 'vitest';
const cases: Array<[string, BufferGeometry]> = [];
for (const spec of [COACH_SPEC,TRUCK_CAB_SPEC,SEDAN_SPEC]) {
  const loft=loftBody(spec);
  for(const part of ['body','glass','lining','groove'] as const)if(loft[part])cases.push([`${spec.id}/${part}`,loft[part]]);
}
cases.push(['lathe',latheGeometry([[.62,-.1],[1,-.12],[1,.12],[.62,.1]],16)],['chamfer',chamferedBar(1,.1,.1,.01)]);
const rings=loftBody(COACH_SPEC).rings;
cases.push(['strip',stripAtHeight(rings,1.75,.55,8.55,.045,.008)!],['roof-rail',roofRail(COACH_SPEC,rings,.62,1.7,7.5,.012,.045)!],['surface-band',surfaceBandAtHeights(COACH_SPEC,rings,1.78,2.46,.75,8.35,.01)!]);
for(const style of ['cover','steel','whitewall'] as const){const wheel=wheelParts(.42,.14,style);for(const part of ['tyre','face','dark','whitewall'] as const)if(wheel[part])cases.push([`${style}/${part}`,wheel[part]]);}
// Exact b63 pre-fix position/UV bytes: normals may change; shape/counts may not.
const baseline = [
  {
    "name": "nuketown2-coach/body",
    "vertices": 12942,
    "hashes": {
      "position": "6e1eaea53d10b29bc00516e4ee476585bc518c34a5ed8742004b713447b6fa9a",
      "uv": "78aa7c5700faac4a56ec765e4215b677b26fb98ae481b29510fc94c9a1949650"
    }
  },
  {
    "name": "nuketown2-coach/glass",
    "vertices": 1878,
    "hashes": {
      "position": "6786b6d02a365333763f6334b3e6ba60c6eff271ec82c52a42207b50a6c9aafb",
      "uv": "d7348c23de457cc5dfc5a1ccfaf1741ffd1e040138a46c8b63c4b49942eab33a"
    }
  },
  {
    "name": "nuketown2-coach/lining",
    "vertices": 2520,
    "hashes": {
      "position": "062a08b837f724af686edd142a680701001586193cb2ff4ee7e71e753f1feae8",
      "uv": "1303c0e9cbbaa068747fa122479eb448be3fe69f1b6d8f1f242eed12a505554b"
    }
  },
  {
    "name": "nuketown2-coach/groove",
    "vertices": 432,
    "hashes": {
      "position": "c23019d50357e215c9be64b5f6fa24e0d7e6cee60197a8601ec85be8829a00ae",
      "uv": "e64b590b6670c781ed0b32bba70455cd7843c64288f489bb502590bb9e7a5d96"
    }
  },
  {
    "name": "nuketown2-truck-cab/body",
    "vertices": 7296,
    "hashes": {
      "position": "ba44c36fc90ef86eb746f65d2a69ee186cc463fda071ab5cdbd969b112591db6",
      "uv": "14623826d4a23d64350b59afce809f894a349c31d233cff4c67ad706099221fc"
    }
  },
  {
    "name": "nuketown2-truck-cab/glass",
    "vertices": 900,
    "hashes": {
      "position": "5ab774fe6bec6e7349685926d0d346240ad586d1e91681c6e76a3872c0d0fbc9",
      "uv": "d3acfbe9cc2614f8367debb609191db07b1055ee3f64b60cd6d2751244c86338"
    }
  },
  {
    "name": "nuketown2-truck-cab/lining",
    "vertices": 1152,
    "hashes": {
      "position": "f809f5adf078d3e17c37d6b8037031d00089f6972730d70ea7a0e983fda533f7",
      "uv": "174e8ecd31e77218b2473a41510427990515e93653e4f1208385d796a99d3bbe"
    }
  },
  {
    "name": "nuketown2-truck-cab/groove",
    "vertices": 288,
    "hashes": {
      "position": "cf1d2c99c74b9270e2763f746ac3327f49605b38d7a3ee96e1d0a1d8b71684d7",
      "uv": "c0063d193a791740e04ef3a3adac4f446d057c2ad2878797d2848f85b9331342"
    }
  },
  {
    "name": "nuketown2-sedan/body",
    "vertices": 13356,
    "hashes": {
      "position": "cb99e328f249f6397c5f58be4920c3f88bd8bf2aa6157392d376ab8ed9683324",
      "uv": "30702a88db67f0289d5ee62d9daf21671ecb91bbc949b3d8ee5a648eb0c8f6e1"
    }
  },
  {
    "name": "nuketown2-sedan/glass",
    "vertices": 600,
    "hashes": {
      "position": "91145e9f74c84d22ec930b4274e66cb1b60a16f3263a0baef5340d04595b947d",
      "uv": "74f73055e0e4b67869b55219232971134257db55138ebcc6f744b112b498820f"
    }
  },
  {
    "name": "nuketown2-sedan/lining",
    "vertices": 1368,
    "hashes": {
      "position": "c856180f3025b0a7349c231f541682d26fbb8e95c1ed2b0f6b6450232f2bffda",
      "uv": "a7a5dcc7d66ba9ffba098cf917c75096461a0c56a82562240fa2b152db1c8caa"
    }
  },
  {
    "name": "nuketown2-sedan/groove",
    "vertices": 432,
    "hashes": {
      "position": "1cdf8aa9397fb1f97f9599a8a24dc06dbbe05e1c91466df95a701cfd50f61199",
      "uv": "11bda4910c4e691813d7453a3ea56249d320b46c7eecef1e69d75b74b381891c"
    }
  },
  {
    "name": "lathe",
    "vertices": 288,
    "hashes": {
      "position": "8dfdb495e07e204577e188a2538f8c2112fc44e5dacfb48b150fd4c6e7682086",
      "uv": "1e23dc905cf9feddf7a0e7298d5166caf8fbab55372f28a3bf447c541ab53ec6"
    }
  },
  {
    "name": "chamfer",
    "vertices": 96,
    "hashes": {
      "position": "29c13dcdaefd47dda30e51f491d796e1c35965a601cd4db41d579650f5c05814",
      "uv": "646faa4a20fe34e5aa181782545bd05568fb475c652f18ee03ddbfebb4e932b5"
    }
  },
  {
    "name": "strip",
    "vertices": 1176,
    "hashes": {
      "position": "ad571ffc8124831897bd623f212be66b52c7052696634ee3289087cf5639fef5",
      "uv": "bc4cb1ec94656cc9b3b6034bf6028de911007d231d626c983f923493b05202a0"
    }
  },
  {
    "name": "roof-rail",
    "vertices": 930,
    "hashes": {
      "position": "7d044f868c713b6c0a2be1c06065354982fc74627b3f66054ff43c5111f54555",
      "uv": "55a1316274ba59c3d4e7de0f9cfabc6bfa888bdc48828aa8d9bb781ad455b9ef"
    }
  },
  {
    "name": "surface-band",
    "vertices": 552,
    "hashes": {
      "position": "0575c460c1d51c142f102bab4f33495f6923744be03faa0795ac119ec46ee3fc",
      "uv": "bef7da06f83e34d72365fdefc794644ab6018919e334bebe6b79a88aa6f780c5"
    }
  },
  {
    "name": "cover/tyre",
    "vertices": 864,
    "hashes": {
      "position": "0fa18c6ad8e0726dc25c3ed2eacf22f1851f6881b994706aedd833d394f0d96c",
      "uv": "3ec501fefb7bb28b15ff0d46172c222c30381d29a755a01350a984a24f1c9ed7"
    }
  },
  {
    "name": "cover/face",
    "vertices": 576,
    "hashes": {
      "position": "79651aad22909271fd957ed920a0ee4227d32e4e0fe8b4e9303d1df538ef46bb",
      "uv": "5ff4fa5683ab047bd79ef1cc2752fd2eaa686ab487de68e40137d6d6e9053f0a"
    }
  },
  {
    "name": "cover/dark",
    "vertices": 72,
    "hashes": {
      "position": "756c634617443b6ef8e4eeb3045ee88874f8331513f5d9eacf44c3156366e0c7",
      "uv": "8243b60a0a9f95e4b8bc194f851efe4a32fa9bf6a5e879edb07654f274b020e7"
    }
  },
  {
    "name": "steel/tyre",
    "vertices": 864,
    "hashes": {
      "position": "0fa18c6ad8e0726dc25c3ed2eacf22f1851f6881b994706aedd833d394f0d96c",
      "uv": "3ec501fefb7bb28b15ff0d46172c222c30381d29a755a01350a984a24f1c9ed7"
    }
  },
  {
    "name": "steel/face",
    "vertices": 480,
    "hashes": {
      "position": "a0ff03ad749ac272de957d3c782c26330808462918d7375746a2197085c63f72",
      "uv": "22264b0a117bfc3b6e35248a86e22ea98a62d6300e4e376b365bfb7bd3edacef"
    }
  },
  {
    "name": "steel/dark",
    "vertices": 72,
    "hashes": {
      "position": "756c634617443b6ef8e4eeb3045ee88874f8331513f5d9eacf44c3156366e0c7",
      "uv": "8243b60a0a9f95e4b8bc194f851efe4a32fa9bf6a5e879edb07654f274b020e7"
    }
  },
  {
    "name": "whitewall/tyre",
    "vertices": 864,
    "hashes": {
      "position": "0fa18c6ad8e0726dc25c3ed2eacf22f1851f6881b994706aedd833d394f0d96c",
      "uv": "3ec501fefb7bb28b15ff0d46172c222c30381d29a755a01350a984a24f1c9ed7"
    }
  },
  {
    "name": "whitewall/face",
    "vertices": 576,
    "hashes": {
      "position": "79651aad22909271fd957ed920a0ee4227d32e4e0fe8b4e9303d1df538ef46bb",
      "uv": "5ff4fa5683ab047bd79ef1cc2752fd2eaa686ab487de68e40137d6d6e9053f0a"
    }
  },
  {
    "name": "whitewall/dark",
    "vertices": 72,
    "hashes": {
      "position": "756c634617443b6ef8e4eeb3045ee88874f8331513f5d9eacf44c3156366e0c7",
      "uv": "8243b60a0a9f95e4b8bc194f851efe4a32fa9bf6a5e879edb07654f274b020e7"
    }
  },
  {
    "name": "whitewall/whitewall",
    "vertices": 180,
    "hashes": {
      "position": "f345af76bb01d214ffba1a2244cca444b8def19eafc9ede45ccf26c8a1ea06a5",
      "uv": "dd36ea12b29615d2dfba1f238a4d1f08df069db3ef24deba83f86f5792ede837"
    }
  }
];
describe('analytic normals follow the emitted triangle winding', () => {
  it.each(cases)('%s preserves shape and orients every nondegenerate face', (name,g)=>{
  const p=g.getAttribute('position'),n=g.getAttribute('normal'),uv=g.getAttribute('uv');
  const hashes=Object.fromEntries(([['position',p],['uv',uv]] as Array<[string, BufferAttribute]>).map(([key,a])=>[key,createHash('sha256').update(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength)).digest('hex')]));
  let opposing=0,valid=0,minDot=1;
  for(let i=0;i<p.count;i+=3){
    const a=[p.getX(i),p.getY(i),p.getZ(i)],u=[p.getX(i+1)-a[0]!,p.getY(i+1)-a[1]!,p.getZ(i+1)-a[2]!],v=[p.getX(i+2)-a[0]!,p.getY(i+2)-a[1]!,p.getZ(i+2)-a[2]!];
    const c=[u[1]!*v[2]!-u[2]!*v[1]!,u[2]!*v[0]!-u[0]!*v[2]!,u[0]!*v[1]!-u[1]!*v[0]!];
    if(Math.hypot(...c)<1e-10)continue;
    const avg=[0,0,0];for(let j=0;j<3;j++){avg[0]!+=n.getX(i+j);avg[1]!+=n.getY(i+j);avg[2]!+=n.getZ(i+j);}
    const dot=c.reduce((s,x,j)=>s+x*avg[j]!,0)/(Math.hypot(...c)*Math.hypot(...avg));
    valid++;minDot=Math.min(minDot,dot);if(dot < -1e-5)opposing++;
  }
  g.dispose();
  const prior=baseline.find(row=>row.name===name)!;
  expect(p.count).toBe(prior.vertices);
  expect(hashes).toEqual(prior.hashes);
  expect(valid).toBeGreaterThan(0);
  expect(opposing, `opposed faces; minimum dot ${minDot}`).toBe(0);
  });
});
