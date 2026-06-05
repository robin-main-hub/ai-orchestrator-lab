import { describe, it, expect } from 'vitest';
import { operatorCockpitSnapshotSchema } from '../src/index';

describe('OperatorCockpitSnapshotSchema', () => {
  it('should parse a valid mock snapshot', () => {
    const validSnapshot = {
      id: 'test_1',
      timestamp: new Date().toISOString(),
      fleet: [
        {
          workerId: 'w-1',
          role: 'companion',
          status: 'idle',
          statusRingColor: 'green'
        }
      ],
      approvals: [],
      handoffs: [],
      memory: {
        contextReasons: ['test'],
        macBookAuthorityEnabled: true,
        dgxMirrorHealth: 'healthy',
        contradictionWarnings: []
      },
      routing: {
        selectedModelId: 'test-model',
        fallbackStatus: 'none',
        costBadge: 'low',
        speedBadge: 'fast',
        trustBadge: 'trusted'
      },
      recovery: {
        offlineResumeSupported: true,
        outboxSyncStatus: 'synced',
        healthIndicators: []
      },
      dispatchHistory: []
    };

    const result = operatorCockpitSnapshotSchema.safeParse(validSnapshot);
    expect(result.success).toBe(true);
  });

  it('should reject invalid enum values to prevent taxonomy pollution', () => {
    const invalidSnapshot = {
      id: 'test_2',
      timestamp: new Date().toISOString(),
      fleet: [
        {
          workerId: 'w-1',
          role: 'companion',
          status: 'pending_ci', // Invalid status, must be nested under valid lane
          statusRingColor: 'green'
        }
      ],
      approvals: [],
      handoffs: [],
      memory: {
        contextReasons: [],
        macBookAuthorityEnabled: true,
        dgxMirrorHealth: 'healthy',
        contradictionWarnings: []
      },
      routing: {
        selectedModelId: 'test-model',
        fallbackStatus: 'none',
        costBadge: 'low',
        speedBadge: 'fast',
        trustBadge: 'trusted'
      },
      recovery: {
        offlineResumeSupported: true,
        outboxSyncStatus: 'synced',
        healthIndicators: []
      },
      dispatchHistory: []
    };

    const result = operatorCockpitSnapshotSchema.safeParse(invalidSnapshot);
    expect(result.success).toBe(false);
  });
});
