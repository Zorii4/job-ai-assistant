import { HttpException, HttpStatus } from '@nestjs/common';

export class AnalysisCapacityExceededException extends HttpException {
  constructor() {
    super('At most two initial analyses can be active at once.', HttpStatus.CONFLICT);
  }
}
