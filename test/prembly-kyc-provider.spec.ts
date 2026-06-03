import { mapPremblyBvnResponse, mapPremblyBvnWithFaceResponse } from "../src/providers/prembly/prembly.mapper";

describe("Prembly KYC mapper", () => {
  it("normalizes BVN Advance responses without exposing raw BVN", () => {
    const result = mapPremblyBvnResponse(
      {
        status: true,
        response_code: "00",
        data: {
          bvn: "22289000017",
          firstName: "Ada",
          middleName: "Ngozi",
          lastName: "Okafor",
          dateOfBirth: "2-Aug-1990",
          email: "",
          gender: "Female",
          phoneNumber1: "07030500002",
          nationality: "Nigeria",
          nin: "12345678901"
        },
        verification: { reference: "prembly_ref_1" }
      },
      "12345678901"
    );

    expect(result).toMatchObject({
      provider: "prembly",
      providerReference: "prembly_ref_1",
      bvnVerified: true,
      firstName: "Ada",
      middleName: "Ngozi",
      lastName: "Okafor",
      phoneNumber: "07030500002",
      country: "Nigeria",
      bvnMasked: "*******8901",
      ninMasked: "*******8901"
    });
    expect(JSON.stringify(result.rawProviderResponse)).not.toContain("22289000017");
    expect(JSON.stringify(result.rawProviderResponse)).not.toContain("12345678901");
  });

  it("uses the configured face match threshold for BVN face validation", () => {
    const result = mapPremblyBvnWithFaceResponse(
      {
        status: true,
        response_code: "00",
        data: {
          firstName: "Ada",
          lastName: "Okafor",
          face_data: { status: true, confidence: 94.9 }
        },
        verification: { reference: "prembly_ref_2" }
      },
      "12345678901",
      95
    );

    expect(result.provider).toBe("prembly");
    expect(result.providerReference).toBe("prembly_ref_2");
    expect(result.faceMatch).toBe(false);
    expect(result.selfieVerified).toBe(false);
    expect(result.confidenceScore).toBe(94.9);
  });
});
