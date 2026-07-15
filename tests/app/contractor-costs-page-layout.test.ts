import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Contractor Costs admin layout', () => {
  it('lets the payments overview use the full available admin width', () => {
    const pageSource = readFileSync(
      resolve(process.cwd(), 'src/app/(payload)/admin/contractor-costs/page.tsx'),
      'utf8',
    );

    expect(pageSource).toContain("style={{ width: '100%' }}");
    expect(pageSource).not.toContain('maxWidth: 1440');
  });
});
