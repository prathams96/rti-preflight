import { describe, expect, it } from "vitest";
import Home from "./page";

describe("home page", () => {
  it("renders the repository foundation page", () => {
    expect(Home).toBeTypeOf("function");
  });
});
