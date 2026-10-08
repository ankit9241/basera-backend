/**
 * Email Service Utility for Basera
 * Handles transactional and contact notification emails via Resend API.
 */

interface SendEmailParams {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}

export async function sendEmail({
  to,
  subject,
  text,
  html,
  replyTo,
}: SendEmailParams): Promise<{ success: boolean; id?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const configuredFrom = process.env.EMAIL_FROM?.trim();

  // Resend requires sending from a verified domain or "onboarding@resend.dev" in sandbox.
  // Public domains like @gmail.com cannot be used directly as the 'from' address in Resend.
  let fromAddress =
    configuredFrom && !configuredFrom.includes("@gmail.com") && !configuredFrom.includes("@yahoo.com")
      ? configuredFrom
      : "Basera <onboarding@resend.dev>";

  const toList = Array.isArray(to) ? to : [to];

  // If no Resend API key is configured (local development / testing fallback)
  if (!apiKey || apiKey.trim() === "") {
    console.log("\n📧 [Email Service Mock — Resend API key not configured]");
    console.log(`  To: ${toList.join(", ")}`);
    console.log(`  From: ${fromAddress}`);
    if (replyTo) console.log(`  Reply-To: ${replyTo}`);
    console.log(`  Subject: ${subject}`);
    console.log(`  Body:\n${text}\n`);
    return { success: true, id: "mock-resend-id" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress,
        to: toList,
        subject,
        text,
        html: html || text,
        reply_to: replyTo,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error(`[Resend API Error ${response.status}]:`, errBody);

      // If custom from address failed and was not onboarding@resend.dev, attempt retry with sandbox sender
      if (fromAddress !== "Basera <onboarding@resend.dev>") {
        const retryRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey.trim()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "Basera <onboarding@resend.dev>",
            to: toList,
            subject,
            text,
            html: html || text,
            reply_to: replyTo,
          }),
        });
        if (retryRes.ok) {
          const retryData = (await retryRes.json()) as { id?: string };
          return { success: true, id: retryData.id };
        }
      }
      return { success: false };
    }

    const data = (await response.json()) as { id?: string };
    return { success: true, id: data.id };
  } catch (error: any) {
    console.error("[Email Service Delivery Error]:", error?.message || error);
    return { success: false };
  }
}
