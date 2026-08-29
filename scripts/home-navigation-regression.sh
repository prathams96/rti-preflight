#!/usr/bin/env bash
set -euo pipefail

# Browser regression coverage for the logo's non-destructive Home navigation.
# Run with the app available at BASE_URL (defaults to the local dev server).
# PLAYWRIGHT_CLI may point at the repository's existing Playwright wrapper.

BASE_URL="${BASE_URL:-http://localhost:3000}"
SESSION="${PLAYWRIGHT_CLI_SESSION:-home-navigation-regression}"

if [[ -n "${PLAYWRIGHT_CLI:-}" ]]; then
  pw() {
    "$PLAYWRIGHT_CLI" --session "$SESSION" "$@"
  }
else
  pw() {
    npx --yes --package @playwright/cli playwright-cli --session "$SESSION" "$@"
  }
fi

pw delete-data
pw open "$BASE_URL"

pw run-code 'async (page) => {
  await page.getByRole("heading", { name: "Find out before you file an RTI" }).waitFor();
  const input = page.getByRole("textbox", { name: "What public information are you looking for?" });
  await input.fill("How much was spent maintaining lifts and escalators at New Delhi Railway Station during FY 2024–25, and which contractors received the work?");
  await page.getByRole("button", { name: "Check before filing an RTI →" }).click();
  await page.getByRole("heading", { name: "Check what we understood" }).waitFor();
  const prepare = page.getByRole("button", { name: /Prepare an RTI/ });
  if (await prepare.count()) {
    await prepare.first().click();
  } else {
    await page.getByRole("button", { name: "Looks right — search" }).click();
    await page.getByRole("heading", { name: "What we found" }).waitFor();
    await page.getByRole("button", { name: /Prepare an RTI/ }).first().click();
  }
  await page.getByRole("heading", { name: "Your RTI draft" }).waitFor();
  const draft = page.getByRole("textbox", { name: "RTI request" });
  await draft.fill(`${await draft.inputValue()}\nHOME_EDIT_MARKER_MUST_NOT_LEAK`);
  await page.getByRole("button", { name: "RTI Tathya home" }).click();
  await page.getByRole("heading", { name: "Find out before you file an RTI" }).waitFor();
  if ((await input.inputValue()) !== "") throw new Error("Home retained the previous question");
  if ((await page.getByRole("textbox", { name: "RTI request" }).count()) !== 0) throw new Error("Home retained the edited draft");
  if ((await page.locator("body").innerText()).includes("HOME_EDIT_MARKER_MUST_NOT_LEAK")) throw new Error("Edited draft leaked after Home");

  await input.fill("What are the number of MSMEs shut in 2026 from 2025");
  await page.getByRole("button", { name: "Check before filing an RTI →" }).click();
  await page.getByRole("heading", { name: "Check what we understood" }).waitFor();
  const secondPrepare = page.getByRole("button", { name: /Prepare an RTI/ });
  if (await secondPrepare.count()) {
    await secondPrepare.first().click();
  } else {
    await page.getByRole("button", { name: "Looks right — search" }).click();
    await page.getByRole("heading", { name: "What we found" }).waitFor();
    await page.getByRole("button", { name: /Prepare an RTI/ }).first().click();
  }
  await page.getByRole("heading", { name: "Your RTI draft" }).waitFor();
  const questionBDraftText = await page.getByRole("textbox", { name: "RTI request" }).inputValue();
  if (!/MSME/i.test(questionBDraftText) || !(questionBDraftText.includes("2025") && questionBDraftText.includes("2026"))) throw new Error("Question-B draft omitted the requested MSME years");
  const questionBPageText = await page.locator("body").innerText();
  if (!questionBPageText.includes("Demo route") || !questionBPageText.includes("Continue to filing demo") || (await page.getByRole("button", { name: "Continue to filing demo" }).isDisabled())) throw new Error("Question-B draft did not expose the unverified demo route and filing CTA");
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.waitForTimeout(250);
  await page.getByRole("button", { name: "RTI Tathya home" }).click();
  await page.getByRole("heading", { name: "Find out before you file an RTI" }).waitFor();
  const keys = await page.evaluate(() => ({
    activeResearch: localStorage.getItem("rti-preflight-state-v2"),
    activeFiling: sessionStorage.getItem("rti-preflight-filing-v2"),
    legacyResearch: localStorage.getItem("rti-preflight-draft"),
    legacyFiling: sessionStorage.getItem("rti-preflight-filing"),
    saved: localStorage.getItem("rti-preflight-saved"),
  }));
  if (keys.activeResearch || keys.activeFiling || keys.legacyResearch || keys.legacyFiling) throw new Error("Home left an active session that can restore");
  if (!keys.saved) throw new Error("Home deleted Saved checks");
  await page.reload();
  await page.getByRole("heading", { name: "Find out before you file an RTI" }).waitFor();
  if ((await page.getByRole("heading", { name: "Your RTI draft" }).count()) !== 0) throw new Error("Reload restored the old draft");
  if ((await page.getByRole("heading", { name: "Filing demo" }).count()) !== 0) throw new Error("Reload restored the filing demo");
  if ((await page.getByRole("textbox", { name: "What public information are you looking for?" }).inputValue()) !== "") throw new Error("Reload restored the old question");
  if (!(await page.locator("body").innerText()).includes("Saved checks")) throw new Error("Saved checks did not survive Home and reload");
  console.log("A: edited draft cleared; arbitrary draft path available");
  console.log("C/D: active session cleared; Saved checks survived reload");
}'
echo "home-navigation regression A/C/D passed"

pw delete-data
pw open "$BASE_URL"

pw run-code 'async (page) => {
  await page.getByRole("heading", { name: "Find out before you file an RTI" }).waitFor();
  const input = page.getByRole("textbox", { name: "What public information are you looking for?" });
  await input.fill("Between 2021 and 2023, which States/UTs reported an increase in the value of property stolen but a decline in the percentage recovered?");
  await page.getByRole("button", { name: "Check before filing an RTI →" }).click();
  await page.getByRole("heading", { name: "Check what we understood" }).waitFor();
  await page.getByRole("button", { name: "Looks right — search" }).click();
  await page.getByRole("heading", { name: "What we found" }).waitFor();
  const resultText = await page.locator("body").innerText();
  if (!resultText.includes("Karnataka")) throw new Error("Seeded result marker was not visible");
  await page.getByRole("button", { name: "RTI Tathya home" }).click();
  await page.getByRole("heading", { name: "Find out before you file an RTI" }).waitFor();
  if ((await page.locator("body").innerText()).includes("Karnataka")) throw new Error("Old result leaked after Home");
  await input.fill("What are the number of MSMEs shut in 2026 from 2025");
  await page.getByRole("button", { name: "Check before filing an RTI →" }).click();
  await page.getByRole("heading", { name: "Check what we understood" }).waitFor();
  const finalPrepare = page.getByRole("button", { name: /Prepare an RTI/ });
  if (await finalPrepare.count()) {
    await finalPrepare.first().click();
  } else {
    await page.getByRole("button", { name: "Looks right — search" }).click();
    await page.getByRole("heading", { name: "What we found" }).waitFor();
    await page.getByRole("button", { name: /Prepare an RTI/ }).first().click();
  }
  await page.getByRole("heading", { name: "Your RTI draft" }).waitFor();
  const questionBDraftText = await page.getByRole("textbox", { name: "RTI request" }).inputValue();
  if (!/MSME/i.test(questionBDraftText) || !(questionBDraftText.includes("2025") && questionBDraftText.includes("2026"))) throw new Error("Question-B draft omitted the requested MSME years");
  const questionBPageText = await page.locator("body").innerText();
  if (!questionBPageText.includes("Demo route") || !questionBPageText.includes("Continue to filing demo") || (await page.getByRole("button", { name: "Continue to filing demo" }).isDisabled())) throw new Error("Question-B draft did not expose the unverified demo route and filing CTA");
  if ((await page.locator("body").innerText()).includes("Karnataka")) throw new Error("Old NCRB result remained in the new draft or its back destination");
  console.log("B: old result cleared; new draft has no stale Back to results destination");
}'
echo "home-navigation regression B passed"

pw close
