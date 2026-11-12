import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";

export async function probeBedrock(input: {
  region: string;
  modelId: string;
  send?: (region: string, modelId: string) => Promise<void>;
}): Promise<{ ok: boolean; detail: string }> {
  if (!input.region || !input.modelId) {
    return { ok: false, detail: "Bedrock region and model id are required." };
  }
  const send =
    input.send ??
    (async (region: string, modelId: string) => {
      const client = new BedrockRuntimeClient({ region });
      await client.send(
        new ConverseCommand({
          modelId,
          messages: [{ role: "user", content: [{ text: "ping" }] }],
          inferenceConfig: { maxTokens: 1 }
        })
      );
    });
  try {
    await send(input.region, input.modelId);
    return { ok: true, detail: "Bedrock answered." };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bedrock did not answer.";
    return { ok: false, detail: message };
  }
}
