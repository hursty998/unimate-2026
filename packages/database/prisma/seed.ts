import { AuthProvider } from "../src/generated/prisma/client.js";
import { createDatabaseClient } from "../src/index.js";

const connectionString = process.env["DATABASE_URL"];

if (!connectionString) {
  throw new Error("DATABASE_URL is required to seed the local database.");
}

const prisma = createDatabaseClient({ connectionString });
type SeedTransaction = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

const universitySlug = "unimate-development-university";
const affiliatedSubject = "local:unimate:development-affiliated-user";
const externalSubject = "local:unimate:development-external-user";

async function upsertIdentity(
  transaction: SeedTransaction,
  providerSubject: string,
) {
  return transaction.authIdentity.upsert({
    where: {
      provider_providerSubject: {
        provider: AuthProvider.SUPABASE,
        providerSubject,
      },
    },
    create: {
      provider: AuthProvider.SUPABASE,
      providerSubject,
      user: { create: {} },
    },
    update: {},
  });
}

try {
  await prisma.$transaction(async (transaction) => {
    const university = await transaction.university.upsert({
      where: { slug: universitySlug },
      create: {
        name: "UniMate Development University",
        slug: universitySlug,
      },
      update: { name: "UniMate Development University" },
    });

    const affiliatedIdentity = await upsertIdentity(
      transaction,
      affiliatedSubject,
    );

    await transaction.universityAffiliation.upsert({
      where: {
        userId_universityId: {
          userId: affiliatedIdentity.userId,
          universityId: university.id,
        },
      },
      create: {
        userId: affiliatedIdentity.userId,
        universityId: university.id,
      },
      update: {},
    });

    const externalIdentity = await upsertIdentity(transaction, externalSubject);

    await transaction.universityAffiliation.deleteMany({
      where: { userId: externalIdentity.userId },
    });
  });

  console.info("Seeded the deterministic UniMate development fixtures.");
} finally {
  await prisma.$disconnect();
}
