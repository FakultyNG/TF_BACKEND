import { success } from "../src/common/api-response";
import { normalizePhoneNumber } from "../src/common/utils/phone.util";

describe("contract helpers", () => {
  it("wraps success responses in the API contract envelope", () => {
    expect(success("Request successful", { ok: true })).toEqual({
      success: true,
      message: "Request successful",
      data: { ok: true }
    });
  });

  it("normalizes Nigerian local phone numbers to 234 format", () => {
    expect(normalizePhoneNumber("08103100000")).toBe("2348103100000");
  });
});
