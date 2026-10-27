import { describe, it, expect } from 'vitest';
import { deduceCategoryAndLight } from '../src/modules/import/zipPackReader';

describe('zipPackReader - Deduction and Category Heuristics', () => {
  it('deduces lights category and enables emitsLight for torches, lanterns, and candles', () => {
    const torch = deduceCategoryAndLight('Library/Generic/Torch/Torch_01_Regular_Orange_300x300.webm');
    expect(torch.category).toBe('lights');
    expect(torch.emitsLight).toBe(true);
    expect(torch.flicker).toBe(true);

    const candle = deduceCategoryAndLight('Objects/Candles/Candle_White_Lit.webm');
    expect(candle.category).toBe('lights');
    expect(candle.emitsLight).toBe(true);

    const lantern = deduceCategoryAndLight('Light/Farol_Antiguo.png');
    expect(lantern.category).toBe('lights');
    expect(lantern.emitsLight).toBe(true);
  });

  it('deduces fire category and enables emitsLight for fire, flames, campfires, and explosions', () => {
    const campfire = deduceCategoryAndLight('Library/Generic/Fire/Campfire_01_Regular_Orange_400x400.webm');
    expect(campfire.category).toBe('fire');
    expect(campfire.emitsLight).toBe(true);
    expect(campfire.flicker).toBe(true);

    const explosion = deduceCategoryAndLight('Spells/Level_3/Fireball_Explosion_Orange.webm');
    expect(explosion.category).toBe('fire');
    expect(explosion.emitsLight).toBe(true);
  });

  it('deduces smoke category and disables emitsLight for smoke, clouds, and fog', () => {
    const smoke = deduceCategoryAndLight('Library/Generic/Smoke/SmokePuff01_01_Regular_Grey_400x400.webm');
    expect(smoke.category).toBe('smoke');
    expect(smoke.emitsLight).toBe(false);

    const fog = deduceCategoryAndLight('Environment/Fog_Cloud_Dense.webm');
    expect(fog.category).toBe('smoke');
    expect(fog.emitsLight).toBe(false);
  });

  it('deduces arcane category for magic, ice, runes, lightning, and fallback items', () => {
    const lightning = deduceCategoryAndLight('Spells/Level_1/WitchBolt_Lightning_Blue.webm');
    expect(lightning.category).toBe('arcane');
    expect(lightning.emitsLight).toBe(false);

    const ice = deduceCategoryAndLight('Template/Circle/Ice_Zone_Cold.webm');
    expect(ice.category).toBe('arcane');
    expect(ice.emitsLight).toBe(false);

    const portal = deduceCategoryAndLight('Library/Portals/DarkPortal_Loop.webm');
    expect(portal.category).toBe('arcane');
    expect(portal.emitsLight).toBe(false);

    const unknown = deduceCategoryAndLight('Custom/Various/StrangeAsset.webm');
    expect(unknown.category).toBe('arcane');
    expect(unknown.emitsLight).toBe(false);
  });
});
