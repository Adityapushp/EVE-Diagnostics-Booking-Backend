const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const centre = await prisma.diagnosticCentre.create({
    data: {
      name: 'Sunrise Diagnostics',
      location: 'Bhubaneswar',
      tests: {
        create: [
          { name: 'Complete Blood Count', price: 300 },
          { name: 'Lipid Profile', price: 650 },
          { name: 'Thyroid Panel', price: 900 },
        ],
      },
    },
  });

  const centre2 = await prisma.diagnosticCentre.create({
    data: {
      name: 'MetroPath Labs',
      location: 'Patna',
      tests: {
        create: [
          { name: 'Complete Blood Count', price: 280 },
          { name: 'HbA1c', price: 500 },
        ],
      },
    },
  });

  console.log('Seeded centres:', centre.name, centre2.name);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
