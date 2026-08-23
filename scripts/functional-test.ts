import prisma from "../src/lib/prisma";
import crypto from "crypto";

const BASE_URL = "http://localhost:4000";

interface TestReport {
  name: string;
  passed: boolean;
  details?: string;
  error?: string;
}

const reports: TestReport[] = [];

function record(name: string, passed: boolean, details?: string, error?: string) {
  reports.push({ name, passed, details, error });
  if (passed) {
    console.log(`✅ [PASS] ${name}${details ? ` — ${details}` : ""}`);
  } else {
    console.error(`❌ [FAIL] ${name}${error ? ` — ${error}` : ""}`);
  }
}

async function runTestSuite() {
  console.log("🚀 Starting Basera Localhost Functional Verification Suite...\n");

  console.log("--- SECTION 1: DATABASE VERIFICATION ---");
  try {
    const [
      collegesCount,
      domainsCount,
      propertiesCount,
      permissionsCount,
      adminCount,
      roomsCount,
    ] = await Promise.all([
      prisma.college.count(),
      prisma.collegeEmailDomain.count(),
      prisma.property.count(),
      prisma.adminPermission.count(),
      prisma.adminUser.count(),
      prisma.roomInventory.count(),
    ]);

    record(
      "Database Connectivity & Record Seeding",
      collegesCount >= 10 && domainsCount >= 10 && propertiesCount >= 2 && permissionsCount === 19,
      `Colleges: ${collegesCount}, Approved Domains: ${domainsCount}, Properties: ${propertiesCount}, Permissions: ${permissionsCount}, Admins: ${adminCount}, Rooms: ${roomsCount}`
    );
  } catch (err: any) {
    record("Database Connectivity & Record Seeding", false, undefined, err.message);
  }

  console.log("\n--- SECTION 2: PUBLIC API & PROPERTY PRIVACY DTO TEST ---");
  let samplePropSlug = "";
  let samplePropId = "";
  try {
    const res = await fetch(`${BASE_URL}/api/v1/public/properties`);
    const data = (await res.json()) as any;

    const prop = data.properties?.[0];
    samplePropSlug = prop?.slug;
    samplePropId = prop?.id;

    const hasOwnerName = prop && "ownerName" in prop;
    const hasOwnerPhone = prop && "ownerPhone" in prop;
    const hasExactAddress = prop && "exactAddress" in prop;
    const hasInternalNotes = prop && "internalAdminNotes" in prop;

    const isSanitized = !hasOwnerName && !hasOwnerPhone && !hasExactAddress && !hasInternalNotes;

    record(
      "Public Property Search & Privacy DTO Stripping",
      res.status === 200 && data.total > 0 && isSanitized,
      `Found ${data.total} properties. Confidential fields absent: ownerName(${!hasOwnerName}), ownerPhone(${!hasOwnerPhone}), exactAddress(${!hasExactAddress}), internalNotes(${!hasInternalNotes})`
    );

    const detailRes = await fetch(`${BASE_URL}/api/v1/public/properties/${samplePropSlug}`);
    const detailData = (await detailRes.json()) as any;
    const detailProp = detailData.property;

    const detailSanitized =
      detailProp &&
      !("ownerName" in detailProp) &&
      !("ownerPhone" in detailProp) &&
      !("exactAddress" in detailProp);

    record(
      "Public Property Detail by SEO Slug & Code",
      detailRes.status === 200 && detailProp?.propertyCode === "PF#101" && detailSanitized,
      `Code: ${detailProp?.propertyCode}, Slug: ${detailProp?.slug}, Privacy Preserved: ${detailSanitized}`
    );

    const collegesRes = await fetch(`${BASE_URL}/api/v1/public/colleges`);
    const collegesData = (await collegesRes.json()) as any;
    record(
      "Public Colleges Directory",
      collegesRes.status === 200 && collegesData.colleges?.length >= 10,
      `Loaded ${collegesData.colleges?.length} DU Colleges`
    );
  } catch (err: any) {
    record("Public Property API & Privacy DTO", false, undefined, err.message);
  }

  console.log("\n--- SECTION 3: STUDENT AUTHENTICATION FLOW ---");
  const testPhone = "+919876543210";
  let studentCookie = "";
  let studentUserId = "";

  try {
    const sendOtpRes = await fetch(`${BASE_URL}/api/v1/auth/phone/send-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: testPhone }),
    });
    const sendOtpData = (await sendOtpRes.json()) as any;
    record("Student Phone OTP Generation", sendOtpRes.status === 200 && sendOtpData.success);

    const session = await prisma.phoneOtpSession.findFirst({
      where: { phone: testPhone },
      orderBy: { createdAt: "desc" },
    });

    const invalidVerifyRes = await fetch(`${BASE_URL}/api/v1/auth/phone/verify-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: testPhone, otp: "000000" }),
    });
    record(
      "Student Invalid OTP Rejection",
      invalidVerifyRes.status === 400,
      `Received expected HTTP 400 Bad Request`
    );

    const testCode = "123456";
    const testHash = crypto.createHash("sha256").update(testCode).digest("hex");
    if (session) {
      await prisma.phoneOtpSession.update({
        where: { id: session.id },
        data: { otpHash: testHash },
      });
    }

    const verifyRes = await fetch(`${BASE_URL}/api/v1/auth/phone/verify-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: testPhone,
        otp: testCode,
        fullName: "Ananya Sharma",
      }),
    });
    const verifyData = (await verifyRes.json()) as any;
    studentUserId = verifyData.user?.id;

    const rawCookies = verifyRes.headers.get("set-cookie");
    if (rawCookies) {
      studentCookie = rawCookies.split(";")[0] || "";
    }

    record(
      "Student OTP Verification & Session Cookie Issue",
      verifyRes.status === 200 && verifyData.user?.fullName === "Ananya Sharma",
      `Student ID: ${studentUserId}, Cookie: ${studentCookie.slice(0, 30)}...`
    );

    const meRes = await fetch(`${BASE_URL}/api/v1/auth/me`, {
      headers: { Cookie: studentCookie },
    });
    const meData = (await meRes.json()) as any;
    record(
      "Student Session Persistence (/auth/me)",
      meRes.status === 200 && meData.user?.id === studentUserId,
      `Authenticated as ${meData.user?.fullName} (${meData.user?.phone})`
    );
  } catch (err: any) {
    record("Student Auth Flow", false, undefined, err.message);
  }

  console.log("\n--- SECTION 4: COLLEGE EMAIL VERIFICATION ---");
  try {
    const rejectRes = await fetch(`${BASE_URL}/api/v1/student/verify-college-email/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: studentCookie },
      body: JSON.stringify({ collegeEmail: "ananya@gmail.com" }),
    });
    const rejectData = (await rejectRes.json()) as any;
    record(
      "Non-Approved Email Domain Rejection",
      rejectRes.status === 400,
      `Status: ${rejectRes.status}, Message: ${rejectData.error || rejectData.message}`,
      `Expected 400, got ${rejectRes.status}: ${JSON.stringify(rejectData)}`
    );

    const reqRes = await fetch(`${BASE_URL}/api/v1/student/verify-college-email/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: studentCookie },
      body: JSON.stringify({ collegeEmail: "ananya@mirandahouse.ac.in" }),
    });
    const reqData = (await reqRes.json()) as any;
    record(
      "Approved DU Domain Verification Request",
      reqRes.status === 200 && reqData.college?.shortCode === "MH",
      `Target College: ${reqData.college?.name} (${reqData.college?.shortCode})`,
      `Expected 200, got ${reqRes.status}: ${JSON.stringify(reqData)}`
    );

    const tokenRecord = await prisma.emailVerificationToken.findFirst({
      where: { userId: studentUserId },
      orderBy: { createdAt: "desc" },
    });

    const rawToken = "test_verification_token_123456789";
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    if (tokenRecord) {
      await prisma.emailVerificationToken.update({
        where: { id: tokenRecord.id },
        data: { tokenHash },
      });
    }

    const confirmRes = await fetch(
      `${BASE_URL}/api/v1/student/verify-college-email/confirm?token=${rawToken}`
    );
    const confirmData = (await confirmRes.json()) as any;

    record(
      "College Email Verification Token Confirmation",
      confirmRes.status === 200 && confirmData.user?.isCollegeVerified === true,
      `Badge Granted: ${confirmData.user?.isCollegeVerified}, College: ${confirmData.user?.college?.name}`,
      `Expected 200, got ${confirmRes.status}: ${JSON.stringify(confirmData)}`
    );
  } catch (err: any) {
    record("College Email Verification", false, undefined, err.message);
  }

  console.log("\n--- SECTION 5: STUDENT PROFILE & SHORTLIST (FAVOURITES) ---");
  try {
    const updateRes = await fetch(`${BASE_URL}/api/v1/student/profile`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: studentCookie },
      body: JSON.stringify({
        budgetRange: "₹10,000 – ₹15,000",
        gender: "Female",
        preferredLocations: ["Kamla Nagar", "Hudson Lane"],
      }),
    });
    const updateData = (await updateRes.json()) as any;
    record(
      "Student Profile Update & Persistence",
      updateRes.status === 200 && updateData.profile?.budgetRange === "₹10,000 – ₹15,000",
      `Budget: ${updateData.profile?.budgetRange}, Gender: ${updateData.profile?.gender}`
    );

    await prisma.savedListing.deleteMany({
      where: { userId: studentUserId, propertyId: samplePropId },
    });

    const saveRes = await fetch(`${BASE_URL}/api/v1/student/saved/toggle`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: studentCookie },
      body: JSON.stringify({ propertyId: samplePropId }),
    });
    const saveData = (await saveRes.json()) as any;

    const getSavedRes = await fetch(`${BASE_URL}/api/v1/student/saved`, {
      headers: { Cookie: studentCookie },
    });
    const getSavedData = (await getSavedRes.json()) as any;
    const isSavedInDb = getSavedData.properties?.some((p: any) => p.id === samplePropId);

    const unsaveRes = await fetch(`${BASE_URL}/api/v1/student/saved/toggle`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: studentCookie },
      body: JSON.stringify({ propertyId: samplePropId }),
    });
    const unsaveData = (await unsaveRes.json()) as any;

    const getUnsavedRes = await fetch(`${BASE_URL}/api/v1/student/saved`, {
      headers: { Cookie: studentCookie },
    });
    const getUnsavedData = (await getUnsavedRes.json()) as any;
    const isRemovedFromDb = !getUnsavedData.properties?.some((p: any) => p.id === samplePropId);

    record(
      "Shortlist (Favourites) PostgreSQL Persistence & Unsave Cycle",
      saveRes.status === 200 &&
        saveData.saved === true &&
        isSavedInDb &&
        unsaveRes.status === 200 &&
        unsaveData.saved === false &&
        isRemovedFromDb,
      `Successfully saved property, verified in DB (${getSavedData.total}), unsaved and verified removal (${getUnsavedData.total})`
    );
  } catch (err: any) {
    record("Student Profile & Shortlist", false, undefined, err.message);
  }

  console.log("\n--- SECTION 6: VISIT SCHEDULING & STATUS LIFECYCLE ---");
  let visitId = "";
  let bookingCode = "";
  try {
    const bookRes = await fetch(`${BASE_URL}/api/v1/student/visits`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: studentCookie },
      body: JSON.stringify({
        propertyId: samplePropId,
        visitDate: new Date(Date.now() + 86400000).toISOString(),
        timeSlot: "11:30 AM",
        visitorCount: 1,
        studentName: "Ananya Sharma",
        studentPhone: testPhone,
        notes: "Interested in single room with balcony",
      }),
    });
    const bookData = (await bookRes.json()) as any;
    visitId = bookData.visit?.id;
    bookingCode = bookData.visit?.bookingCode;

    record(
      "Visit Scheduling (PENDING Initial State)",
      bookRes.status === 201 && bookData.visit?.status === "PENDING",
      `Booking Code: ${bookingCode}, Status: ${bookData.visit?.status}`
    );

    const studentVisitsRes = await fetch(`${BASE_URL}/api/v1/student/visits`, {
      headers: { Cookie: studentCookie },
    });
    const studentVisitsData = (await studentVisitsRes.json()) as any;
    const hasVisit = studentVisitsData.visits?.some((v: any) => v.id === visitId);

    record(
      "Student Visit List Verification",
      studentVisitsRes.status === 200 && hasVisit,
      `Found ${studentVisitsData.visits?.length} visits for student`
    );
  } catch (err: any) {
    record("Visit Scheduling", false, undefined, err.message);
  }

  console.log("\n--- SECTION 7: ADMIN AUTHENTICATION & RBAC MATRIX ---");
  let adminCookie = "";
  try {
    const adminLoginRes = await fetch(`${BASE_URL}/api/v1/admin/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "admin@baseradu.in",
        password: "AdminPassword123!",
      }),
    });
    const adminLoginData = (await adminLoginRes.json()) as any;
    const rawAdminCookie = adminLoginRes.headers.get("set-cookie");
    if (rawAdminCookie) {
      adminCookie = rawAdminCookie.split(";")[0] || "";
    }

    record(
      "SuperAdmin Login & Permission Bundle",
      adminLoginRes.status === 200 && adminLoginData.admin?.permissions?.length >= 19,
      `Permissions Count: ${adminLoginData.admin?.permissions?.length}`
    );

    const scopedAdmin = await prisma.adminUser.upsert({
      where: { email: "data_manager@baseradu.in" },
      update: {},
      create: {
        email: "data_manager@baseradu.in",
        passwordHash: "$2b$12$e8Y5M5r8K9Iq3z9G1d5mXe.8hWn3A7jK9v1b2c3d4e5f6g7h8i9j0",
        fullName: "Data Manager Staff",
        phone: "+91 98000 11111",
        isActive: true,
      },
    });

    await prisma.adminUserPermission.deleteMany({ where: { adminId: scopedAdmin.id } });
    await prisma.adminUserPermission.create({
      data: { adminId: scopedAdmin.id, permissionId: "properties.read" },
    });
    await prisma.adminUserPermission.create({
      data: { adminId: scopedAdmin.id, permissionId: "properties.bulk_import" },
    });

    const scopedLoginRes = await fetch(`${BASE_URL}/api/v1/admin/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "data_manager@baseradu.in",
        password: "AdminPassword123!",
      }),
    });
    const scopedRawCookie = scopedLoginRes.headers.get("set-cookie")?.split(";")[0] || "";

    const allowedRes = await fetch(`${BASE_URL}/api/v1/admin/properties`, {
      headers: { Cookie: scopedRawCookie },
    });
    record(
      "RBAC: DATA_MANAGER Access to properties.read",
      allowedRes.status === 200,
      "HTTP 200 OK as expected"
    );

    const forbiddenRes = await fetch(`${BASE_URL}/api/v1/admin/visits`, {
      headers: { Cookie: scopedRawCookie },
    });
    record(
      "RBAC: DATA_MANAGER Denied visits.read",
      forbiddenRes.status === 403,
      "Received HTTP 403 Forbidden as expected"
    );

    const studentBlockedRes = await fetch(`${BASE_URL}/api/v1/admin/dashboard/metrics`, {
      headers: { Cookie: studentCookie },
    });
    record(
      "Route Protection: Student Blocked from Admin APIs",
      studentBlockedRes.status === 401 || studentBlockedRes.status === 403,
      `Received HTTP ${studentBlockedRes.status} (Access Denied)`
    );
  } catch (err: any) {
    record("Admin Auth & RBAC", false, undefined, err.message);
  }

  console.log("\n--- SECTION 8: ADMIN VISIT LIFECYCLE ---");
  try {
    const confirmVisitRes = await fetch(`${BASE_URL}/api/v1/admin/visits/${visitId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        status: "CONFIRMED",
        coordinatorNotes: "Assigned to North Campus field coordinator Rohit.",
      }),
    });
    const confirmVisitData = (await confirmVisitRes.json()) as any;

    record(
      "Admin Visit State Transition (CONFIRMED)",
      confirmVisitRes.status === 200 && confirmVisitData.visit?.status === "CONFIRMED",
      `Status updated to: ${confirmVisitData.visit?.status}`
    );

    const completeVisitRes = await fetch(`${BASE_URL}/api/v1/admin/visits/${visitId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        status: "COMPLETED",
        coordinatorNotes: "Visit conducted. Student shortlisted single room.",
      }),
    });
    const completeVisitData = (await completeVisitRes.json()) as any;

    record(
      "Admin Visit State Transition (COMPLETED)",
      completeVisitRes.status === 200 && completeVisitData.visit?.status === "COMPLETED",
      `Status updated to: ${completeVisitData.visit?.status}`
    );
  } catch (err: any) {
    record("Admin Visit Management", false, undefined, err.message);
  }

  console.log("\n--- SECTION 9: BULK INGESTION ENGINE & ATOMICITY ---");
  try {
    const testBatch = [
      {
        publicName: "Chhatra Marg Residency",
        type: "PG",
        gender: "BOYS",
        localityZone: "Chhatra Marg",
        rentMin: 12500,
        rentMax: 16000,
        depositAmount: 20000,
        distanceMin: 5,
        distanceText: "5 min walk to Arts Faculty",
        description: "Premier student PG right across Arts Faculty gate.",
        exactAddress: "18 Chhatra Marg, Delhi University Enclave",
        ownerName: "Satish Bansal",
        ownerPhone: "+91 98110 99999",
        singleRoomRent: 16000,
        doubleRoomRent: 12500,
      },
      {
        publicName: "Invalid Missing Rent PG",
        type: "PG",
        gender: "GIRLS",
        localityZone: "Kamla Nagar",
        rentMin: -500, // Invalid negative rent!
        rentMax: 15000,
        depositAmount: 20000,
        distanceMin: 5,
        distanceText: "5 min walk",
        description: "Invalid listing for test",
        exactAddress: "Address",
      },
    ];

    const previewRes = await fetch(`${BASE_URL}/api/v1/admin/properties/bulk-import`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ rows: testBatch, commit: false }),
    });
    const previewData = (await previewRes.json()) as any;

    record(
      "Bulk Ingestion Row-Level Validation & Error Log",
      previewRes.status === 200 && previewData.summary?.errorCount === 1 && previewData.errors?.length > 0,
      `Identified ${previewData.summary?.errorCount} errors in preview mode without writing to DB`
    );

    const validOnlyBatch = [
      {
        publicName: "Patel Chest Student Home",
        type: "PG",
        gender: "GIRLS",
        localityZone: "Patel Chest",
        rentMin: 13000,
        rentMax: 17500,
        depositAmount: 26000,
        distanceMin: 4,
        distanceText: "4 min walk to Miranda House",
        description: "Serene and secure girls PG right beside Patel Chest Institute.",
        exactAddress: "32 Patel Chest Marg, University Enclave, Delhi",
        ownerName: "Veena Khanna",
        ownerPhone: "+91 98110 88888",
        singleRoomRent: 17500,
        doubleRoomRent: 13000,
      },
    ];

    const commitRes = await fetch(`${BASE_URL}/api/v1/admin/properties/bulk-import`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ rows: validOnlyBatch, commit: true }),
    });
    const commitData = (await commitRes.json()) as any;

    record(
      "Bulk Ingestion Batch Commit & PF# Generation",
      commitRes.status === 200 && commitData.summary?.importedCount === 1,
      `Imported Code: ${commitData.importedCodes?.[0]}`
    );
  } catch (err: any) {
    record("Bulk Ingestion Engine", false, undefined, err.message);
  }

  console.log("\n--- SECTION 10: AUDIT LOGGING VERIFICATION ---");
  try {
    const logs = await prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const actions = logs.map((l) => l.action);
    const hasLogin = actions.includes("ADMIN_LOGIN");
    const hasCollegeVerify = actions.includes("STUDENT_COLLEGE_VERIFIED");
    const hasVisitStatus = actions.includes("VISIT_STATUS_CHANGED");
    const hasBulkImport = actions.includes("PROPERTIES_BULK_IMPORTED");

    record(
      "Audit Logging Engine (PostgreSQL)",
      logs.length >= 4 && hasLogin && hasCollegeVerify && hasVisitStatus && hasBulkImport,
      `Captured ${logs.length} audit logs. Verified actions: ADMIN_LOGIN(${hasLogin}), STUDENT_COLLEGE_VERIFIED(${hasCollegeVerify}), VISIT_STATUS_CHANGED(${hasVisitStatus}), PROPERTIES_BULK_IMPORTED(${hasBulkImport})`
    );
  } catch (err: any) {
    record("Audit Logging Engine", false, undefined, err.message);
  }

  console.log("\n=================================================");
  console.log("FUNCTIONAL VERIFICATION SUMMARY");
  console.log("=================================================");
  const total = reports.length;
  const passed = reports.filter((r) => r.passed).length;
  const failed = reports.filter((r) => !r.passed).length;
  console.log(`Total Checks: ${total} | Passed: ${passed} | Failed: ${failed}`);

  if (failed === 0) {
    console.log("\n🎉 ALL LOCALHOST FUNCTIONAL VERIFICATIONS PASSED SUCCESSFULLY!");
  } else {
    console.error(`\n⚠️ ${failed} tests failed.`);
  }

  await prisma.$disconnect();
}

runTestSuite().catch((e) => {
  console.error("Test runner failed:", e);
  process.exit(1);
});
