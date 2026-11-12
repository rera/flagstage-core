import nodemailer from "nodemailer";

export function notifyRecipients(formEmails: string[], envList: string | undefined): string[] {
  const fromEnv = (envList ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.includes("@"));
  return [...new Set([...formEmails.map((item) => item.trim()).filter(Boolean), ...fromEnv])];
}

export function submissionLetter(
  formName: string,
  fields: Record<string, string>
): { subject: string; text: string } {
  const lines = Object.entries(fields).map(([key, value]) => `${key}: ${value}`);
  return {
    subject: `New submission: ${formName}`,
    text: lines.join("\n")
  };
}

export async function sendFormNotice(input: {
  smtpUrl: string;
  from: string;
  to: string[];
  subject: string;
  text: string;
}): Promise<void> {
  const transport = nodemailer.createTransport(input.smtpUrl);
  await transport.sendMail({
    from: input.from,
    to: input.to,
    subject: input.subject,
    text: input.text
  });
}
