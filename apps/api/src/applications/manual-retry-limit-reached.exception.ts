import { HttpException, HttpStatus } from '@nestjs/common';

export class ManualRetryLimitReachedException extends HttpException {
  constructor() {
    super('Manual retry limit has been reached.', HttpStatus.TOO_MANY_REQUESTS);
  }
}
