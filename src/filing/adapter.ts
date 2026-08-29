import type { CitizenConfirmed, DemoAcknowledgement } from "./types";

export const systemNow = () => new Date().toISOString();

export interface FilingAdapter {
  submit(input: CitizenConfirmed): Promise<DemoAcknowledgement>;
}

export class DemoAdapter implements FilingAdapter {
  constructor(private readonly now: () => string = systemNow) {}

  async submit(input: CitizenConfirmed): Promise<DemoAcknowledgement> {
    const submittedAt = this.now();
    const routeName =
      input.package.route.authority.portalNames[input.package.route.id] ??
      input.package.route.authority.canonicalName;
    return {
      registrationNumber: `DEMO-RTI-${input.package.route.id.toUpperCase()}-${submittedAt.replace(/\D/g, "").slice(-10)}`,
      disclosure:
        "No request, payment, or personal information was sent to a government system.",
      holder: input.package.holder.canonicalName,
      route: input.package.route.officialUrl ?? routeName,
      submittedDraft: input.package.draft.text,
      fee: input.confirmation.payment,
      submittedAt,
    };
  }
}
