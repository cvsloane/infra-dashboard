import { describe, it, expect } from 'vitest';
import { classifyAge, worstStatus, DEFAULT_BACKUP_THRESHOLDS } from './postgres';

describe('postgres backups helpers', () => {
  it('classifyAge returns unknown when metric missing', () => {
    expect(classifyAge(null, 10, 20)).toBe('unknown');
  });

  it('classifyAge respects warning/error thresholds', () => {
    expect(classifyAge(0, 10, 20)).toBe('ok');
    expect(classifyAge(9, 10, 20)).toBe('ok');
    expect(classifyAge(10, 10, 20)).toBe('warning');
    expect(classifyAge(19, 10, 20)).toBe('warning');
    expect(classifyAge(20, 10, 20)).toBe('error');
  });

  it('worstStatus orders ok < unknown < warning < error', () => {
    expect(worstStatus(['ok', 'ok'])).toBe('ok');
    expect(worstStatus(['ok', 'unknown'])).toBe('unknown');
    expect(worstStatus(['unknown', 'warning'])).toBe('warning');
    expect(worstStatus(['warning', 'error'])).toBe('error');
  });

  it('default thresholds are internally consistent', () => {
    expect(DEFAULT_BACKUP_THRESHOLDS.walWarnSec).toBeLessThan(DEFAULT_BACKUP_THRESHOLDS.walErrorSec);
    expect(DEFAULT_BACKUP_THRESHOLDS.logicalWarnSec).toBeLessThan(DEFAULT_BACKUP_THRESHOLDS.logicalErrorSec);
    expect(DEFAULT_BACKUP_THRESHOLDS.restoreDrillWarnSec).toBeLessThan(DEFAULT_BACKUP_THRESHOLDS.restoreDrillErrorSec);
    expect(DEFAULT_BACKUP_THRESHOLDS.basebackupWarnSec).toBeLessThan(DEFAULT_BACKUP_THRESHOLDS.basebackupErrorSec);
    expect(DEFAULT_BACKUP_THRESHOLDS.basebackupCheckedWarnSec).toBeLessThan(DEFAULT_BACKUP_THRESHOLDS.basebackupCheckedErrorSec);
  });
});

