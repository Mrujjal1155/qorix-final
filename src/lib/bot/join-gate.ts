export type JoinChannel = { chat: string; label: string; url: string; required: boolean };

/** The fourth field is optional|required; legacy rows retain their existing gate. */
export function parseJoinChannels(raw: string | undefined): JoinChannel[] {
  return (raw ?? "").split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
    const [chat = "", label = "", invite = "", mode = ""] = line.split("|").map((part) => part.trim());
    const required = mode === "optional" ? false : mode === "required" ? true : chat.toLowerCase() !== "@qorixstoreupdate";
    return { chat, label: label || chat, url: invite || (chat.startsWith("@") ? `https://t.me/${chat.slice(1)}` : ""), required };
  }).filter((channel) => Boolean(channel.chat));
}

export function serializeJoinChannels(rows: JoinChannel[]): string {
  return rows.filter((row) => row.chat.trim()).map((row) =>
    `${row.chat.trim()}|${row.label}|${row.url.trim()}|${row.required ? "required" : "optional"}`,
  ).join("\n");
}

export function requiredJoinChannels(settings: Record<string, string>): JoinChannel[] {
  return parseJoinChannels(settings["join_channels"]).filter((channel) => channel.required);
}