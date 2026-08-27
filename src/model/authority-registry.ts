export type AuthorityRecord = {
  id: string;
  name: string;
  aliases: ReadonlyArray<string>;
};

export const AUTHORITY_REGISTRY: ReadonlyArray<AuthorityRecord> = [
  { id: "ncrb", name: "National Crime Records Bureau", aliases: ["ncrb"] },
  {
    id: "epfo",
    name: "Employees' Provident Fund Organisation",
    aliases: [
      "epfo",
      "employees provident fund organisation",
      "employees provident fund organization",
    ],
  },
  { id: "cpcb", name: "Central Pollution Control Board", aliases: ["cpcb"] },
  {
    id: "northern-railway",
    name: "Northern Railway",
    aliases: ["northern railway"],
  },
];

export function resolveAuthorityName(
  name: string,
): AuthorityRecord | undefined {
  const normalized = name.trim().toLocaleLowerCase();
  return AUTHORITY_REGISTRY.find(
    (authority) =>
      authority.name.toLocaleLowerCase() === normalized ||
      authority.aliases.includes(normalized),
  );
}
