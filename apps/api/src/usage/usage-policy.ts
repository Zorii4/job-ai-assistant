import { PlanCode } from '../generated/prisma/client.js';

export type UsagePolicy = {
  productUnitLimit: number;
};

const USAGE_POLICIES: Record<PlanCode, UsagePolicy> = {
  [PlanCode.ALPHA]: {
    productUnitLimit: 10,
  },
};

export function getUsagePolicy(planCode: PlanCode): UsagePolicy {
  return USAGE_POLICIES[planCode];
}
