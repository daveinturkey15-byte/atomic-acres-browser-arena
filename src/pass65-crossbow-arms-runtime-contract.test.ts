import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Pass 65 crossbow and first-person arms runtime selection', () => {
  it('selects the project-original crossbow instead of the former pistol derivative', () => {
    const modelSource = readFileSync('src/weapon-model.ts', 'utf8');
    const presentationSource = readFileSync('src/weapon-presentation.ts', 'utf8');
    expect(modelSource).toContain("'explosive-crossbow': PASS65_CROSSBOW_URLS.world");
    expect(modelSource).toContain('pass65-crossbow-fp-lod0.glb');
    expect(modelSource).toContain('pass65-crossbow-world-lod0.glb');
    expect(modelSource).toContain('pass65-crossbow-drop-lod0.glb');
    expect(modelSource).not.toMatch(/'explosive-crossbow':\s*['"].*Pistol\.glb/);
    expect(presentationSource).toContain("createPass65CrossbowModel(this.flattenMaterials, 'first-person')");
    expect(presentationSource).toContain('await Promise.all([loadPass65CrossbowAssets(), loadFirstPersonArmsAsset()])');
  });

  it('replaces the procedural fallback with the dedicated opaque skinned arm asset before readiness', () => {
    const operatorSource = readFileSync('src/operator-model.ts', 'utf8');
    const presentationSource = readFileSync('src/weapon-presentation.ts', 'utf8');
    expect(operatorSource).toContain("pass65-first-person-arms-lod0.glb");
    expect(operatorSource).not.toContain('Swat_FirstPersonArms.glb');
    expect(operatorSource).toContain("visual.name = 'authored-first-person-arms-visual'");
    expect(operatorSource).toContain('result.transparent = false');
    expect(operatorSource).toContain('result.depthWrite = true');
    expect(presentationSource).toContain('this.root.remove(fallbackArms)');
    expect(presentationSource).toContain('this.armRigs.length = 0');
    expect(presentationSource).toContain('this.riggedArmRigs.push');
  });
});
