import { PrismaClient, PropertyLifecycle, PropertyType, GenderCategory, SharingType } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding Basera Database...");

  console.log("Creating Admin Permissions...");
  const permissions = [
    { id: "properties.read", category: "properties", description: "View all property records including internal data" },
    { id: "properties.create", category: "properties", description: "Create individual properties" },
    { id: "properties.edit", category: "properties", description: "Edit property metadata, pricing and rooms" },
    { id: "properties.delete", category: "properties", description: "Delete property records" },
    { id: "properties.bulk_import", category: "properties", description: "Execute bulk CSV/XLSX property imports" },
    { id: "properties.verify", category: "properties", description: "Approve and issue Basera Verified badges" },
    { id: "properties.archive", category: "properties", description: "Archive or pause active listings" },
    { id: "visits.read", category: "visits", description: "View student visit schedule and requests" },
    { id: "visits.manage", category: "visits", description: "Manage visit states (confirm, cancel, reschedule)" },
    { id: "visits.assign", category: "visits", description: "Assign field coordinators to visit slots" },
    { id: "visits.complete", category: "visits", description: "Mark visits completed and record notes" },
    { id: "students.read", category: "students", description: "View student profile and booking histories" },
    { id: "students.manage", category: "students", description: "Manage student verification and notes" },
    { id: "verification.read", category: "verification", description: "View verification checklists and logs" },
    { id: "verification.manage", category: "verification", description: "Manage college email domain whitelists" },
    { id: "team.read", category: "team", description: "View internal admin staff members" },
    { id: "team.manage", category: "team", description: "Manage admin accounts and assign permissions" },
    { id: "analytics.read", category: "analytics", description: "View operational metrics and performance charts" },
    { id: "system.manage", category: "system", description: "Configure system-wide settings and integrations" },
  ];

  for (const p of permissions) {
    await prisma.adminPermission.upsert({
      where: { id: p.id },
      update: { description: p.description, category: p.category },
      create: p,
    });
  }

  console.log("Creating SuperAdmin account...");
  const devPasswordHash = "$2b$12$e8Y5M5r8K9Iq3z9G1d5mXe.8hWn3A7jK9v1b2c3d4e5f6g7h8i9j0";
  const superAdmin = await prisma.adminUser.upsert({
    where: { email: "admin@baseradu.in" },
    update: {},
    create: {
      email: "admin@baseradu.in",
      passwordHash: devPasswordHash,
      fullName: "Basera System Administrator",
      phone: "+91 98110 00000",
      isActive: true,
    },
  });

  for (const p of permissions) {
    await prisma.adminUserPermission.upsert({
      where: {
        adminId_permissionId: {
          adminId: superAdmin.id,
          permissionId: p.id,
        },
      },
      update: {},
      create: {
        adminId: superAdmin.id,
        permissionId: p.id,
      },
    });
  }

  console.log("Seeding DU Colleges and Approved Email Domains...");
  const colleges = [
    {
      id: "hindu",
      name: "Hindu College",
      shortCode: "HC",
      campusZone: "North Campus",
      area: "Maurice Nagar",
      description: "Tree-lined lanes, the Ridge nearby and Kamla Nagar a short walk away.",
      domains: ["hinducollege.ac.in", "hindu.du.ac.in"],
    },
    {
      id: "miranda-house",
      name: "Miranda House",
      shortCode: "MH",
      campusZone: "North Campus",
      area: "Patel Chest",
      description: "Quiet girls-first neighbourhoods with well-lit streets and late study cafés.",
      domains: ["mirandahouse.ac.in", "mh.du.ac.in"],
    },
    {
      id: "hansraj",
      name: "Hansraj College",
      shortCode: "HR",
      campusZone: "North Campus",
      area: "Mahatma Hansraj Marg",
      description: "Minutes from Hudson Lane, the most walkable student pocket in Delhi.",
      domains: ["hansrajcollege.ac.in", "hansraj.du.ac.in"],
    },
    {
      id: "kmc",
      name: "Kirori Mal College",
      shortCode: "KMC",
      campusZone: "North Campus",
      area: "University Enclave",
      description: "Theatre, sport and a steady supply of well-kept co-living houses.",
      domains: ["kmc.du.ac.in"],
    },
    {
      id: "ramjas",
      name: "Ramjas College",
      shortCode: "RJ",
      campusZone: "North Campus",
      area: "University Enclave",
      description: "Central to the North Campus loop with quick metro access.",
      domains: ["ramjas.du.ac.in"],
    },
    {
      id: "srcc",
      name: "SRCC",
      shortCode: "SRCC",
      campusZone: "North Campus",
      area: "Maurice Nagar",
      description: "Commerce corridor — premium PGs and serviced flats within 500 metres.",
      domains: ["srcc.du.ac.in", "srcc.edu"],
    },
    {
      id: "daulat-ram",
      name: "Daulat Ram College",
      shortCode: "DRC",
      campusZone: "North Campus",
      area: "Maurice Nagar",
      description: "Homely girls PGs with meals included, right beside the campus gate.",
      domains: ["drc.du.ac.in"],
    },
    {
      id: "lsr",
      name: "Lady Shri Ram",
      shortCode: "LSR",
      campusZone: "South Campus",
      area: "Lajpat Nagar IV",
      description: "South Delhi calm — leafy blocks, cafés and secure girls-only residences.",
      domains: ["lsr.edu.in", "lsr.du.ac.in"],
    },
    {
      id: "venky",
      name: "Sri Venkateswara College",
      shortCode: "SVC",
      campusZone: "South Campus",
      area: "Satya Niketan",
      description: "Satya Niketan market, student cafés and direct footbridge to Dhaula Kuan.",
      domains: ["svc.ac.in"],
    },
    {
      id: "sgtb-khalsa",
      name: "SGTB Khalsa",
      shortCode: "KHALSA",
      campusZone: "North Campus",
      area: "Mall Road",
      description: "Quiet green pocket on Mall Road, two minutes from Vishwavidyalaya Metro.",
      domains: ["sgtbkhalsadu.ac.in", "khalsa.du.ac.in"],
    },
  ];

  for (const c of colleges) {
    const college = await prisma.college.upsert({
      where: { id: c.id },
      update: {
        name: c.name,
        shortCode: c.shortCode,
        campusZone: c.campusZone,
        area: c.area,
        description: c.description,
      },
      create: {
        id: c.id,
        name: c.name,
        shortCode: c.shortCode,
        campusZone: c.campusZone,
        area: c.area,
        description: c.description,
      },
    });

    for (const d of c.domains) {
      await prisma.collegeEmailDomain.upsert({
        where: { domain: d },
        update: { collegeId: college.id, isActive: true },
        create: {
          collegeId: college.id,
          domain: d,
          isActive: true,
        },
      });
    }
  }

  await prisma.collegeEmailDomain.upsert({
    where: { domain: "du.ac.in" },
    update: { collegeId: "hindu", isActive: true },
    create: {
      collegeId: "hindu",
      domain: "du.ac.in",
      isActive: true,
    },
  });

  console.log("Seeding Initial Verified Properties...");
  const initialProperties = [
    {
      propertyCode: "PF#101",
      slug: "pf-101-the-study-house-kamla-nagar",
      publicName: "The Study House",
      type: PropertyType.PG,
      gender: GenderCategory.GIRLS,
      localityZone: "Kamla Nagar",
      rentMin: 11200,
      rentMax: 14500,
      depositAmount: 21750,
      distanceMin: 8,
      distanceText: "8 min walk to North Campus",
      description: "The Study House is a carefully verified PG in Kamla Nagar, built around how students actually live — quiet study hours, warm natural light, and a common room worth sitting in. Every room is inspected by a Basera coordinator before it is listed.",
      rules: [
        "Entry until 11:00 PM, extendable with prior notice",
        "No smoking inside the premises",
        "Guests allowed in the common lounge until 8:00 PM",
        "Monthly rent due on the 5th of each month",
      ],
      foodPolicy: "Three home-style vegetarian meals daily, with a non-vegetarian option twice a week. Kitchen access for late-night study nights.",
      securityDetails: "Biometric entry, 24×7 CCTV on all common floors, and a resident warden on site.",
      amenities: ["Wi-Fi", "Meals included", "Study desk", "24×7 security", "Housekeeping"],
      lifecycleStatus: PropertyLifecycle.PUBLISHED,
      isVerified: true,
      verifiedAt: new Date("2026-08-10"),
      isFeatured: true,
      internalPropertyName: "Shree Ganesh Kripa Niwas",
      exactAddress: "Plot 14/B, Block 8, Near Chache Di Hatti, Kamla Nagar, Delhi 110007",
      ownerName: "Harish Chawla",
      ownerPhone: "+91 98110 54321",
      internalSource: "Direct Scouting",
      internalAdminNotes: "High demand during admission month. Landlord cooperative.",
      rooms: [
        { label: "Single room", sharingType: SharingType.SINGLE, occupancyText: "1 student", rent: 14500, deposit: 21750, totalUnits: 6, availableUnits: 2 },
        { label: "Double sharing", sharingType: SharingType.DOUBLE, occupancyText: "2 students", rent: 11200, deposit: 16800, totalUnits: 8, availableUnits: 3 },
      ],
      images: [
        "/images/properties/property-1.jpg",
        "/images/properties/property-2.jpg",
        "/images/properties/property-3.jpg",
      ],
    },
    {
      propertyCode: "PF#102",
      slug: "pf-102-hudson-residences-hudson-lane",
      publicName: "Hudson Residences",
      type: PropertyType.FLAT,
      gender: GenderCategory.CO_ED,
      localityZone: "Hudson Lane",
      rentMin: 14500,
      rentMax: 18900,
      depositAmount: 28350,
      distanceMin: 12,
      distanceText: "12 min to North Campus gate",
      description: "Hudson Residences offers modern serviced flat living right on Hudson Lane, surrounded by student cafés and peaceful residential lanes.",
      rules: [
        "Quiet hours after 11:30 PM",
        "Housekeeping access permitted during daytime slots",
      ],
      foodPolicy: "Self-cooking kitchen fully equipped with gas hob, refrigerator, and microwave.",
      securityDetails: "Electronic keycard entry and round-the-clock security guard.",
      amenities: ["Wi-Fi", "AC", "Power backup", "Housekeeping", "Parking"],
      lifecycleStatus: PropertyLifecycle.PUBLISHED,
      isVerified: true,
      verifiedAt: new Date("2026-08-12"),
      isFeatured: true,
      internalPropertyName: "Hudson Heights Block D",
      exactAddress: "D-18, Hudson Lane, Kingsway Camp, Delhi 110009",
      ownerName: "Sunil Aggarwal",
      ownerPhone: "+91 98111 87654",
      internalSource: "Field Coordinator",
      internalAdminNotes: "Separate electric meters per unit.",
      rooms: [
        { label: "2 BHK serviced flat", sharingType: SharingType.DOUBLE, occupancyText: "2 students", rent: 18900, deposit: 28350, totalUnits: 4, availableUnits: 1 },
      ],
      images: [
        "/images/properties/property-2.jpg",
        "/images/properties/property-3.jpg",
        "/images/properties/property-1.jpg",
      ],
    },
  ];

  for (const p of initialProperties) {
    const createdProp = await prisma.property.upsert({
      where: { propertyCode: p.propertyCode },
      update: {
        slug: p.slug,
        publicName: p.publicName,
        type: p.type,
        gender: p.gender,
        localityZone: p.localityZone,
        rentMin: p.rentMin,
        rentMax: p.rentMax,
        depositAmount: p.depositAmount,
        distanceMin: p.distanceMin,
        distanceText: p.distanceText,
        description: p.description,
        rules: p.rules,
        foodPolicy: p.foodPolicy,
        securityDetails: p.securityDetails,
        amenities: p.amenities,
        lifecycleStatus: p.lifecycleStatus,
        isVerified: p.isVerified,
        verifiedAt: p.verifiedAt,
        isFeatured: p.isFeatured,
        internalPropertyName: p.internalPropertyName,
        exactAddress: p.exactAddress,
        ownerName: p.ownerName,
        ownerPhone: p.ownerPhone,
        internalSource: p.internalSource,
        internalAdminNotes: p.internalAdminNotes,
      },
      create: {
        propertyCode: p.propertyCode,
        slug: p.slug,
        publicName: p.publicName,
        type: p.type,
        gender: p.gender,
        localityZone: p.localityZone,
        rentMin: p.rentMin,
        rentMax: p.rentMax,
        depositAmount: p.depositAmount,
        distanceMin: p.distanceMin,
        distanceText: p.distanceText,
        description: p.description,
        rules: p.rules,
        foodPolicy: p.foodPolicy,
        securityDetails: p.securityDetails,
        amenities: p.amenities,
        lifecycleStatus: p.lifecycleStatus,
        isVerified: p.isVerified,
        verifiedAt: p.verifiedAt,
        isFeatured: p.isFeatured,
        internalPropertyName: p.internalPropertyName,
        exactAddress: p.exactAddress,
        ownerName: p.ownerName,
        ownerPhone: p.ownerPhone,
        internalSource: p.internalSource,
        internalAdminNotes: p.internalAdminNotes,
      },
    });

    for (const r of p.rooms) {
      await prisma.roomInventory.create({
        data: {
          propertyId: createdProp.id,
          label: r.label,
          sharingType: r.sharingType,
          occupancyText: r.occupancyText,
          rent: r.rent,
          deposit: r.deposit,
          totalUnits: r.totalUnits,
          availableUnits: r.availableUnits,
        },
      });
    }

    for (let i = 0; i < p.images.length; i++) {
      await prisma.propertyMedia.create({
        data: {
          propertyId: createdProp.id,
          mediaUrl: p.images[i]!,
          displayOrder: i,
          isPrimary: i === 0,
        },
      });
    }
  }

  console.log("✅ Database seeding completed successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
