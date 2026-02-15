export async function sendDiscordWebhook(
  webhookUrl: string,
  content: string,
): Promise<void> {
  if (!webhookUrl) throw new Error("Missing Discord webhook URL");
  if (!content) throw new Error("Missing content");

  const resp = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
    cache: "no-store",
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(
      `Discord webhook failed ${resp.status}: ${text.slice(0, 300)}`,
    );
  }
}

