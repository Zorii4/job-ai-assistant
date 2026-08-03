import { HttpException, HttpStatus } from '@nestjs/common';

export class AnalysisQuotaExceededException extends HttpException {
  constructor() {
    super('Analysis quota exceeded.', HttpStatus.TOO_MANY_REQUESTS);
  }
}
