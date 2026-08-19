// ============================================================================
// Database Seed Script
// Creates the three default branches (Dar es Salaam, Dodoma, Arusha), one
// bootstrap ADMIN account, sample rooms (with room numbers), a service
// catalog, a couple of CASHIER/STAFF accounts per branch, and a
// staff/service roster per room so the timer flow works immediately.
//
// Run with: npm run seed   (see package.json)
// ============================================================================

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

const SALT_ROUNDS = 10;

async function main() {
  console.log("Seeding branches...");

  const branchSeeds = [
    { name: "Dar es Salaam", code: "DSM", address: "Dar es Salaam, Tanzania" },
    { name: "Dodoma", code: "DOD", address: "Dodoma, Tanzania" },
    { name: "Arusha", code: "ARS", address: "Arusha, Tanzania" },
  ];

  const branches = {};
  for (const b of branchSeeds) {
    const branch = await prisma.branch.upsert({
      where: { name: b.name },
      update: {},
      create: b,
    });
    branches[b.name] = branch;
    console.log(`  ✓ Branch ready: ${branch.name} (${branch.code})`);
  }

  // ---------------------------------------------------------------------
  // Bootstrap admin account.
  // ---------------------------------------------------------------------
  const adminLastName = "Admin";
  const defaultPassword = adminLastName.toLowerCase();
  const hashedPassword = await bcrypt.hash(defaultPassword, SALT_ROUNDS);

  const admin = await prisma.user.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      username: "admin",
      password: hashedPassword,
      firstName: "System",
      lastName: adminLastName,
      role: "ADMIN",
      branchId: branches["Dar es Salaam"].id,
      mustChangePassword: true,
    },
  });
  console.log(`  ✓ Admin user ready: ${admin.username} (default password: "${defaultPassword}")`);

  // ---------------------------------------------------------------------
  // Default service catalog per branch.
  // ---------------------------------------------------------------------
  console.log("Seeding services...");
  const serviceSeeds = [
    { name: "Haircut", price: 15000, durationMins: 30 },
    { name: "Full Body Massage", price: 45000, durationMins: 60 },
    { name: "Manicure", price: 12000, durationMins: 40 },
    { name: "Facial Treatment", price: 25000, durationMins: 45 },
  ];
  const servicesByBranch = {};
  for (const branch of Object.values(branches)) {
    servicesByBranch[branch.id] = [];
    for (const svc of serviceSeeds) {
      const service = await prisma.service.upsert({
        where: { branchId_name: { branchId: branch.id, name: svc.name } },
        update: {},
        create: { ...svc, branchId: branch.id },
      });
      servicesByBranch[branch.id].push(service);
    }
    console.log(`  ✓ ${serviceSeeds.length} services ready for ${branch.name}`);
  }

  // ---------------------------------------------------------------------
  // Default rooms per branch — each with a room number.
  // ---------------------------------------------------------------------
  console.log("Seeding rooms...");
  const roomSeeds = [
    { roomNumber: "R-01", name: "Room 1" },
    { roomNumber: "R-02", name: "Room 2" },
    { roomNumber: "R-03", name: "Room 3" },
    { roomNumber: "R-04", name: "Room 4" },
  ];
  const roomsByBranch = {};
  for (const branch of Object.values(branches)) {
    roomsByBranch[branch.id] = [];
    for (const r of roomSeeds) {
      const room = await prisma.room.upsert({
        where: { branchId_name: { branchId: branch.id, name: r.name } },
        update: { roomNumber: r.roomNumber },
        create: { branchId: branch.id, name: r.name, roomNumber: r.roomNumber, status: "AVAILABLE" },
      });
      roomsByBranch[branch.id].push(room);
    }
    console.log(`  ✓ ${roomSeeds.length} rooms ready for ${branch.name}`);
  }

  // ---------------------------------------------------------------------
  // Sample cashier + staff accounts per branch, so the roster below has
  // real staff to assign. lastName doubles as the default password. Each
  // branch gets its own distinct staff names — deliberately not reusing
  // the same name across branches, since two same-named accounts in
  // different branches (each a separate person/login) reads as a bug even
  // though it isn't one.
  // ---------------------------------------------------------------------
  console.log("Seeding sample cashiers and staff...");
  const staffByBranch = {};
  const staffSeedsByBranchName = {
    "Dar es Salaam": [
      { firstName: "Amina", lastName: "Juma" },
      { firstName: "Baraka", lastName: "Mushi" },
    ],
    Dodoma: [
      { firstName: "Neema", lastName: "Kapinga" },
      { firstName: "Elias", lastName: "Mwakalindile" },
    ],
    Arusha: [
      { firstName: "Zawadi", lastName: "Massawe" },
      { firstName: "Godfrey", lastName: "Temba" },
    ],
  };

  for (const branch of Object.values(branches)) {
    staffByBranch[branch.id] = [];

    const cashierUsername = `cashier.${branch.code.toLowerCase()}`;
    const cashierPassword = await bcrypt.hash("cashier", SALT_ROUNDS);
    await prisma.user.upsert({
      where: { username: cashierUsername },
      update: {},
      create: {
        username: cashierUsername,
        password: cashierPassword,
        firstName: "Front",
        lastName: "Cashier",
        role: "CASHIER",
        branchId: branch.id,
        mustChangePassword: true,
      },
    });

    const staffSeeds = staffSeedsByBranchName[branch.name] || [
      { firstName: "Sample", lastName: "Staff" },
    ];
    for (const s of staffSeeds) {
      const username = `${s.firstName.toLowerCase()}.${branch.code.toLowerCase()}`;
      const password = await bcrypt.hash(s.lastName.toLowerCase(), SALT_ROUNDS);
      const staffUser = await prisma.user.upsert({
        where: { username },
        update: {},
        create: {
          username,
          password,
          firstName: s.firstName,
          lastName: s.lastName,
          role: "STAFF",
          branchId: branch.id,
          mustChangePassword: true,
        },
      });
      staffByBranch[branch.id].push(staffUser);
    }
    console.log(`  ✓ Cashier + ${staffSeeds.length} staff ready for ${branch.name}`);
  }

  // ---------------------------------------------------------------------
  // Room roster: assign each room's first two services to the two staff
  // members at that branch (different staff per service in the same room).
  // ---------------------------------------------------------------------
  console.log("Seeding room assignments...");
  for (const branch of Object.values(branches)) {
    const rooms = roomsByBranch[branch.id];
    const services = servicesByBranch[branch.id];
    const staff = staffByBranch[branch.id];

    for (const room of rooms) {
      for (let i = 0; i < Math.min(2, services.length, staff.length); i++) {
        await prisma.roomAssignment.upsert({
          where: { roomId_serviceId: { roomId: room.id, serviceId: services[i].id } },
          update: { staffId: staff[i].id },
          create: { roomId: room.id, serviceId: services[i].id, staffId: staff[i].id },
        });
      }
    }
    console.log(`  ✓ Room roster ready for ${branch.name}`);
  }

  console.log("Seeding complete.");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
