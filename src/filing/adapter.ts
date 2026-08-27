import type { CitizenConfirmed, DemoAcknowledgement } from "./types";

export interface FilingAdapter {
  submit(input: CitizenConfirmed): Promise<DemoAcknowledgement>;
}

export class DemoAdapter implements FilingAdapter {
  async submit(input: CitizenConfirmed): Promise<DemoAcknowledgement> {
    return {
      registrationNumber: "DEMO-RTI-2026-0042",
      disclosure:
        "No request, payment, or personal information was sent to a government system.",
      holder: input.package.holder.canonicalName,
      route: input.package.route.officialUrl,
      submittedDraft: input.package.draft.text,
      fee: input.confirmation.payment,
      submittedAt: "2026-08-27T00:00:00.000Z",
    };
  }
}
