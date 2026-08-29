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

export const GENERIC_INFORMATION_HOLDER = "Relevant public authority";

export function normalizeInformationHolder(name: string | undefined): string {
  const candidate = name?.trim();
  return !candidate ||
    /^(unknown|to be confirmed|not specified|not yet specified|none specified|unspecified|relevant public authority)$/iu.test(
      candidate,
    )
    ? GENERIC_INFORMATION_HOLDER
    : candidate;
}

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
