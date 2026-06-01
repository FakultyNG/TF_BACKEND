import { Type } from "class-transformer";
import { ApiProperty } from "@nestjs/swagger";
import { IsInt, IsNotEmpty, IsObject, IsString, Min } from "class-validator";

export class FxTransferQuoteDto {
  @ApiProperty({ example: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amount: number;

  @ApiProperty({ example: "US" })
  @IsString()
  @IsNotEmpty()
  recipientCountry: string;

  @ApiProperty({ example: "supplier_payment" })
  @IsString()
  @IsNotEmpty()
  purpose: string;

  @ApiProperty({ example: "Invoice #US-9282" })
  @IsString()
  @IsNotEmpty()
  paymentReference: string;

  @ApiProperty({
    example: {
      bankName: "Bank of America",
      accountNumber: "1234567890",
      accountName: "ABC Trading Ltd",
      swiftCode: "BOFAUS3N",
      routingNumber: "026009593"
    }
  })
  @IsObject()
  beneficiary: Record<string, unknown>;
}
