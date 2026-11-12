import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

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

export async function sendEmail(input: {
  region: string;
  from: string;
  to: string[];
  subject: string;
  text: string;
  send?: (message: {
    region: string;
    from: string;
    to: string[];
    subject: string;
    text: string;
  }) => Promise<void>;
}): Promise<void> {
  if (input.to.length === 0) return;
  const send =
    input.send ??
    (async (message: {
      region: string;
      from: string;
      to: string[];
      subject: string;
      text: string;
    }) => {
      const client = new SESv2Client({ region: message.region });
      await client.send(
        new SendEmailCommand({
          FromEmailAddress: message.from,
          Destination: { ToAddresses: message.to },
          Content: {
            Simple: {
              Subject: { Data: message.subject },
              Body: { Text: { Data: message.text } }
            }
          }
        })
      );
    });
  await send({
    region: input.region,
    from: input.from,
    to: input.to,
    subject: input.subject,
    text: input.text
  });
}
