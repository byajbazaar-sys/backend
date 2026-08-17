import { InternalServerErrorException } from '@nestjs/common';

export class RedisException extends InternalServerErrorException {
  constructor(objectOrError?: string | object, description = 'Redis Service Exception') {
    super(objectOrError ?? description);
  }
}
