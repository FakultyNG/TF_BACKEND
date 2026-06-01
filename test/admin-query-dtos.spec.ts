import { DECORATORS } from "@nestjs/swagger/dist/constants";
import { AdminDvaQueryDto } from "../src/admin/dto/admin-dva-query.dto";
import { AdminPaginationDto } from "../src/admin/dto/admin-pagination.dto";
import { AdminTransactionQueryDto } from "../src/admin/dto/admin-transaction-query.dto";

const readSwaggerMetadata = (target: object, propertyKey: string) =>
  Reflect.getMetadata(DECORATORS.API_MODEL_PROPERTIES, target, propertyKey);

describe("admin query DTO Swagger metadata", () => {
  it.each([AdminPaginationDto, AdminDvaQueryDto, AdminTransactionQueryDto])(
    "%p documents take and skip as numeric query params with defaults",
    (Dto) => {
      const take = readSwaggerMetadata(Dto.prototype, "take");
      const skip = readSwaggerMetadata(Dto.prototype, "skip");

      expect(take).toMatchObject({
        type: Number,
        default: 50,
        minimum: 1,
        maximum: 100,
        required: false
      });
      expect(skip).toMatchObject({
        type: Number,
        default: 0,
        minimum: 0,
        required: false
      });
    }
  );
});
