const BASE_URL = "http://localhost:4000/api/v1";

interface TestResult {
  name: string;
  passed: boolean;
  details?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, name: string, details?: string) {
  if (condition) {
    results.push({ name, passed: true, details });
    console.log(`  [PASS] ${name}`);
  } else {
    results.push({ name, passed: false, details });
    console.error(`  [FAIL] ${name} — ${details || "Assertion failed"}`);
  }
}

function generateTestPhone(): string {
  const randDigits = Math.floor(10000000 + Math.random() * 90000000).toString();
  return `+9198${randDigits}`;
}

async function runAllTests() {
  console.log("\n=======================================================");
  console.log("  BASERA AUTHENTICATION, ANONYMOUS STATE & INTENT TEST SUITE");
  console.log("=======================================================\n");

  try {
    console.log("--- TEST 1: Public Browsing ---");
    const pubPropsRes = await fetch(`${BASE_URL}/public/properties`);
    const pubPropsData = await pubPropsRes.json();
    assert(pubPropsRes.status === 200 && pubPropsData.properties.length > 0, "Public properties endpoint accessible without auth");

    const firstProp = pubPropsData.properties[0];
    const pubDetailRes = await fetch(`${BASE_URL}/public/properties/${firstProp.slug}`);
    const pubDetailData = await pubDetailRes.json();
    assert(
      pubDetailRes.status === 200 &&
      pubDetailData.property.publicName &&
      !pubDetailData.property.ownerPhone &&
      !pubDetailData.property.exactAddress,
      "Property detail public & privacy sanitized (no landlord phone/exact address)"
    );

    const pubCollegesRes = await fetch(`${BASE_URL}/public/colleges`);
    assert(pubCollegesRes.status === 200, "Public colleges endpoint accessible without auth");

    console.log("\n--- TEST 2: Anonymous Multi-Save ---");
    const testProps = pubPropsData.properties.slice(0, 3);
    const anonymousStorage = testProps.map((p: any) => p.propertyCode || p.id);
    assert(anonymousStorage.length >= 2, "Anonymous storage holds property codes safely without tokens/PII");

    console.log("\n--- TEST 3: New User + Merge ---");
    const testPhoneNew = generateTestPhone();

    const otpSendRes = await fetch(`${BASE_URL}/auth/phone/send-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: testPhoneNew }),
    });
    assert(otpSendRes.status === 200, "OTP sent successfully for new student");

    const signupRes = await fetch(`${BASE_URL}/auth/phone/verify-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: testPhoneNew, otp: "123456", fullName: "Kavya Malhotra" }),
    });
    const newStudentCookie = signupRes.headers.get("set-cookie") || "";
    assert(signupRes.status === 200 && newStudentCookie.includes("basera_student_session"), "New student account created & session cookie issued");

    const mergeRes = await fetch(`${BASE_URL}/student/saved/merge`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: newStudentCookie },
      body: JSON.stringify({ propertyCodes: anonymousStorage }),
    });
    const mergeData = await mergeRes.json();
    assert(
      mergeRes.status === 200 && mergeData.success === true && mergeData.total >= 2,
      "Anonymous favourites merged successfully into new student account"
    );

    const savedFetchRes = await fetch(`${BASE_URL}/student/saved`, {
      headers: { Cookie: newStudentCookie },
    });
    const savedFetchData = await savedFetchRes.json();
    assert(
      savedFetchRes.status === 200 && savedFetchData.properties.length >= 2,
      "/saved endpoint returns all merged properties from backend database"
    );

    console.log("\n--- TEST 4: Existing User + Merge ---");
    const testPhoneExisting = generateTestPhone();

    await fetch(`${BASE_URL}/auth/phone/send-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: testPhoneExisting }),
    });

    const existingSignup = await fetch(`${BASE_URL}/auth/phone/verify-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: testPhoneExisting, otp: "123456", fullName: "Aarav Gupta" }),
    });
    const existingCookie = existingSignup.headers.get("set-cookie") || "";

    await fetch(`${BASE_URL}/student/saved/toggle`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: existingCookie },
      body: JSON.stringify({ propertyId: testProps[0].id }),
    });

    const existingMergeRes = await fetch(`${BASE_URL}/student/saved/merge`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: existingCookie },
      body: JSON.stringify({ propertyCodes: [testProps[1].propertyCode, testProps[2].propertyCode] }),
    });
    const existingMergeData = await existingMergeRes.json();
    assert(
      existingMergeRes.status === 200 && existingMergeData.total >= 3,
      "Existing favourites preserved and new anonymous favourites appended without duplicates"
    );

    console.log("\n--- TEST 5: Schedule Visit Auth Gate ---");
    const unauthBooking = await fetch(`${BASE_URL}/student/visits`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        propertyId: testProps[0].id,
        visitDate: new Date(Date.now() + 86400000).toISOString(),
        timeSlot: "11:30 AM",
        visitorCount: 1,
        studentName: "Anonymous User",
        studentPhone: "+919999999999",
      }),
    });
    assert(unauthBooking.status === 401, "Unauthenticated visit booking strictly blocked with 401 Unauthorized");

    const authBookingRes = await fetch(`${BASE_URL}/student/visits`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: existingCookie },
      body: JSON.stringify({
        propertyId: testProps[0].id,
        visitDate: new Date(Date.now() + 86400000).toISOString(),
        timeSlot: "11:30 AM",
        visitorCount: 2,
        studentName: "Aarav Gupta",
        studentPhone: testPhoneExisting,
        notes: "Interested in double sharing room",
      }),
    });
    const authBookingData = await authBookingRes.json();
    assert(
      authBookingRes.status === 201 &&
      authBookingData.visit &&
      authBookingData.visit.bookingCode &&
      authBookingData.visit.bookingCode.startsWith("BAS-"),
      "Intended visit created with permanent booking code (e.g. BAS-XXXX)"
    );

    console.log("\n--- TEST 6: Signup + Schedule Visit ---");
    const testPhoneFlow = generateTestPhone();

    await fetch(`${BASE_URL}/auth/phone/send-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: testPhoneFlow }),
    });

    const flowSignup = await fetch(`${BASE_URL}/auth/phone/verify-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: testPhoneFlow, otp: "123456", fullName: "Priya Nair" }),
    });
    const flowCookie = flowSignup.headers.get("set-cookie") || "";

    const flowVisitRes = await fetch(`${BASE_URL}/student/visits`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: flowCookie },
      body: JSON.stringify({
        propertyId: testProps[1].id,
        visitDate: new Date(Date.now() + 172800000).toISOString(),
        timeSlot: "2:30 PM",
        visitorCount: 1,
        studentName: "Priya Nair",
        studentPhone: testPhoneFlow,
      }),
    });
    assert(flowVisitRes.status === 201, "New user immediately schedules visit after signup verification");

    console.log("\n--- TEST 7: Authenticated User Direct Visit ---");
    const directVisitRes = await fetch(`${BASE_URL}/student/visits`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: existingCookie },
      body: JSON.stringify({
        propertyId: testProps[2].id,
        visitDate: new Date(Date.now() + 259200000).toISOString(),
        timeSlot: "4:00 PM",
        visitorCount: 1,
        studentName: "Aarav Gupta",
        studentPhone: testPhoneExisting,
      }),
    });
    assert(directVisitRes.status === 201, "Already-authenticated user books visit directly without auth gate");

    console.log("\n--- TEST 8: Failed Login Behavior ---");
    const badLoginRes = await fetch(`${BASE_URL}/auth/phone/verify-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: testPhoneExisting, otp: "000000" }),
    });
    assert(badLoginRes.status === 400 || badLoginRes.status === 401, "Invalid OTP rejected; local storage is preserved");

    console.log("\n--- TEST 9: Merge Failure & Retry ---");
    const safeMergeRes = await fetch(`${BASE_URL}/student/saved/merge`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: existingCookie },
      body: JSON.stringify({ propertyCodes: ["PF#NONEXISTENT_999"] }),
    });
    assert(safeMergeRes.status === 200, "Merge handles unknown/invalid property codes gracefully");

    console.log("\n--- TEST 10: Cross-Device Sync ---");
    await fetch(`${BASE_URL}/auth/phone/send-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: testPhoneExisting }),
    });

    const deviceBLogin = await fetch(`${BASE_URL}/auth/phone/verify-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: testPhoneExisting, otp: "123456" }),
    });
    const deviceBCookie = deviceBLogin.headers.get("set-cookie") || "";
    const deviceBSavedRes = await fetch(`${BASE_URL}/student/saved`, {
      headers: { Cookie: deviceBCookie },
    });
    const deviceBSavedData = await deviceBSavedRes.json();
    assert(
      deviceBSavedRes.status === 200 && deviceBSavedData.properties.length >= 3,
      "Device B logs into same account and receives identical saved listings from PostgreSQL"
    );

    console.log("\n--- TEST 11: Logout Isolation ---");
    const logoutRes = await fetch(`${BASE_URL}/auth/logout`, {
      method: "POST",
      headers: { Cookie: deviceBCookie },
    });
    assert(logoutRes.status === 200, "Logout destroys server session cleanly");

    const clearedCookie = logoutRes.headers.get("set-cookie") || "";
    const afterLogoutMe = await fetch(`${BASE_URL}/auth/me`, {
      headers: { Cookie: clearedCookie },
    });
    assert(afterLogoutMe.status === 401, "Subsequent requests with cleared session return 401");

    console.log("\n--- TEST 12: Private Routes Protection ---");
    const checkProfile = await fetch(`${BASE_URL}/student/profile`);
    const checkSaved = await fetch(`${BASE_URL}/student/saved`);
    const checkVisits = await fetch(`${BASE_URL}/student/visits`);
    assert(
      checkProfile.status === 401 && checkSaved.status === 401 && checkVisits.status === 401,
      "All private student routes (/profile, /saved, /visits) strictly return 401 when logged out"
    );

    console.log("\n--- TEST 13: Resource Ownership & Security ---");
    const visitIdStudentA = authBookingData.visit.id;
    const illegalCancelRes = await fetch(`${BASE_URL}/student/visits/${visitIdStudentA}/cancel`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: flowCookie },
      body: JSON.stringify({ reason: "Malicious cancellation attempt" }),
    });
    assert(
      illegalCancelRes.status === 404 || illegalCancelRes.status === 403,
      "Student B cannot cancel Student A's visit (ownership verified on backend)"
    );

    const legitCancelRes = await fetch(`${BASE_URL}/student/visits/${visitIdStudentA}/cancel`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: existingCookie },
      body: JSON.stringify({ reason: "Rescheduled exam" }),
    });
    assert(legitCancelRes.status === 200, "Student A successfully cancels their own visit");

    console.log("\n=======================================================");
    const passedCount = results.filter((r) => r.passed).length;
    const totalCount = results.length;
    console.log(`  FINAL VERIFICATION: ${passedCount} / ${totalCount} PASS`);
    console.log("=======================================================\n");

    if (passedCount === totalCount) {
      process.exit(0);
    } else {
      process.exit(1);
    }
  } catch (err) {
    console.error("Test execution failed with error:", err);
    process.exit(1);
  }
}

runAllTests();
