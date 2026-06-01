import { TransfersService } from "../src/transfers/transfers.service";

describe("NGN bank suggestions", () => {
  it("delegates account-number-only bank suggestions to the NGN provider and returns top 3 by confidence", async () => {
    const ngnProvider = {
      suggestBanksByAccountNumber: jest.fn().mockResolvedValue([
        {
          accountName: "JOHN DOE",
          accountNumber: "0123456789",
          bankCode: "035",
          bankName: "Wema Bank",
          confidence: 70
        },
        {
          accountName: "JOHN DOE",
          accountNumber: "0123456789",
          bankCode: "999",
          bankName: "OPay",
          confidence: 60
        },
        {
          accountName: "JOHN DOE",
          accountNumber: "0123456789",
          bankCode: "044",
          bankName: "Access Bank",
          confidence: 95
        },
        {
          accountName: "JOHN DOE",
          accountNumber: "0123456789",
          bankCode: "058",
          bankName: "GTBank",
          confidence: 88
        }
      ])
    };
    const service = new TransfersService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      ngnProvider as never,
      {} as never
    );

    await expect(service.suggestBanksByAccountNumber("0123456789")).resolves.toEqual({
      accountNumber: "0123456789",
      suggestions: [
        {
          accountName: "JOHN DOE",
          accountNumber: "0123456789",
          bankCode: "044",
          bankName: "Access Bank",
          confidence: 95
        },
        {
          accountName: "JOHN DOE",
          accountNumber: "0123456789",
          bankCode: "058",
          bankName: "GTBank",
          confidence: 88
        },
        {
          accountName: "JOHN DOE",
          accountNumber: "0123456789",
          bankCode: "035",
          bankName: "Wema Bank",
          confidence: 70
        }
      ]
    });
    expect(ngnProvider.suggestBanksByAccountNumber).toHaveBeenCalledWith("0123456789");
  });
});
