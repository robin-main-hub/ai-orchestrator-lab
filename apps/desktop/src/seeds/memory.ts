import { createSeedMemoryRecords } from "../runtime/stage6Memory";
import { now } from "../lib/appConstants";

export const initialMemoryRecords = createSeedMemoryRecords(now);
