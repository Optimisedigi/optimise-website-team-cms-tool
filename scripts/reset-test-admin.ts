/**
 * Reset the dedicated harness admin user's password in the LOCAL test DB only.
 * Refuses to run against a non-file: DATABASE_URL so it can never touch prod.
 *
 *   npx tsx --env-file=.env --env-file=.env.local scripts/reset-test-admin.ts
 */
import { getPayload } from 'payload';
import config from '../src/payload.config';

const EMAIL = process.env.TEST_ADMIN_EMAIL ?? 'local-admin@example.test';
const PASSWORD = process.env.TEST_ADMIN_PASSWORD ?? 'Test123!Local';

async function main(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL ?? '';
  if (!dbUrl.startsWith('file:')) {
    throw new Error(
      `Refusing to run: DATABASE_URL is not a file: DB (got "${dbUrl}").`,
    );
  }
  if (process.env.DATABASE_AUTH_TOKEN) {
    throw new Error('Refusing to run: DATABASE_AUTH_TOKEN is set (looks like Turso).');
  }

  const payload = await getPayload({ config });
  const existing = await payload.find({
    collection: 'users',
    where: { email: { equals: EMAIL } },
    limit: 1,
    overrideAccess: true,
  });

  if (existing.docs.length === 0) {
    const created = await payload.create({
      collection: 'users',
      data: {
        email: EMAIL,
        name: 'Harness Admin',
        password: PASSWORD,
        role: 'admin',
        setupCompleted: true,
      },
      overrideAccess: true,
    });
    console.log(`created admin ${EMAIL} (id ${created.id})`);
  } else {
    const id = existing.docs[0].id;
    await payload.update({
      collection: 'users',
      id,
      data: { password: PASSWORD } as Record<string, unknown>,
      overrideAccess: true,
    });
    console.log(`reset password for ${EMAIL} (id ${id})`);
  }
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
