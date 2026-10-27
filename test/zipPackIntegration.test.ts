import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { readZipPack, extractEntryBlob } from '../src/modules/import/zipPackReader';

describe('ZipPack Integration with authentic JB2A WebM ZIP', () => {
  it('reads authentic JB2A zip with BlobReader without decompressing in advance', async () => {
    const zipPath = path.resolve(__dirname, '../scratch/JB2A_DnD5e-main.zip');
    if (!fs.existsSync(zipPath)) {
      console.warn('Test zip not found, skipping integration test');
      return;
    }

    const buffer = fs.readFileSync(zipPath);
    const blob = new Blob([buffer], { type: 'application/zip' });
    const file = new File([blob], 'JB2A_DnD5e-main.zip', { type: 'application/zip' });

    const result = await readZipPack(file);
    expect(result.zipName).toBe('JB2A_DnD5e-main.zip');
    expect(result.totalItems).toBe(6);
    expect(result.folders.length).toBeGreaterThanOrEqual(4);

    // Verify categories
    const campfire = result.items.find((i) => i.filename.includes('Campfire'));
    expect(campfire).toBeDefined();
    expect(campfire?.category).toBe('fire');
    expect(campfire?.emitsLight).toBe(true);

    const brazier = result.items.find((i) => i.filename.includes('Brazier'));
    expect(brazier).toBeDefined();
    expect(brazier?.category).toBe('lights');
    expect(brazier?.emitsLight).toBe(true);

    const smoke = result.items.find((i) => i.filename.includes('Fumes'));
    expect(smoke).toBeDefined();
    expect(smoke?.category).toBe('smoke');
    expect(smoke?.emitsLight).toBe(false);

    const lightning = result.items.find((i) => i.filename.includes('LightningBall'));
    expect(lightning).toBeDefined();
    expect(lightning?.category).toBe('arcane');
    expect(lightning?.emitsLight).toBe(false);

    // Test on-demand blob extraction
    const extractedBlob = await extractEntryBlob(campfire!.entry, campfire!.mimeType);
    expect(extractedBlob).toBeInstanceOf(Blob);
    expect(extractedBlob.type).toBe('video/webm');
    expect(extractedBlob.size).toBeGreaterThan(10000);

    await result.reader.close();
  });
});
