import { Prisma } from '@/generated/prisma/client';
import { db } from '@/lib/db';

type SettingsClient = Pick<typeof db, 'storeSettings'>;

export async function getStoreSettings(client: SettingsClient = db) {
  const existing = await client.storeSettings.findUnique({ where: { id: 'store' } });
  if (existing) return existing;
  try {
    return await client.storeSettings.create({ data: { id: 'store' } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return client.storeSettings.findUniqueOrThrow({ where: { id: 'store' } });
    }
    throw error;
  }
}
