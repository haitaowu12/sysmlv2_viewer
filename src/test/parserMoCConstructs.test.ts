import { describe, expect, it } from 'vitest';
import { parseSysML } from '../parser/parser';

function expectUnsupported(source: string, kind: string, code: string) {
  const result = parseSysML(source);
  expect(result.children).toHaveLength(1);
  expect(result.children[0].kind).toBe(kind);
  expect(result.errors).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        code,
        severity: 'warning',
      }),
    ])
  );
  return result.children[0];
}

describe('SysML v2 MoC construct recovery', () => {
  it('parses alias definitions without losing the target reference', () => {
    const result = parseSysML('alias BatteryAlias for Vehicle::Battery;');

    expect(result.errors).toHaveLength(0);
    expect(result.children[0]).toMatchObject({
      kind: 'Alias',
      name: 'BatteryAlias',
      targetRef: 'Vehicle::Battery',
    });
  });

  it('keeps calc definitions visible with unsupported diagnostics', () => {
    expectUnsupported('calc def MassRollup;', 'CalcDef', 'unsupported:calc');
  });

  it('keeps individual and occurrence constructs visible', () => {
    expectUnsupported('individual vehicle1 : Vehicle;', 'IndividualUsage', 'unsupported:individual');
    expectUnsupported('occurrence ignitionEvent;', 'OccurrenceUsage', 'unsupported:occurrence');
  });

  it('keeps snapshot and time slice references visible', () => {
    expect(expectUnsupported('snapshot vehicleSnapshot of vehicle1;', 'SnapshotUsage', 'unsupported:snapshot')).toMatchObject({
      snapshotOf: 'vehicle1',
    });
    expect(expectUnsupported('time slice activeSlice of vehicle1;', 'TimeSliceUsage', 'unsupported:time-slice')).toMatchObject({
      timeSliceOf: 'vehicle1',
    });
  });

  it('keeps variation and variant constructs visible', () => {
    expectUnsupported('variation def VehicleOptions;', 'VariationDef', 'unsupported:variation');
    expect(expectUnsupported('variant electric of VehicleOptions;', 'VariantUsage', 'unsupported:variant')).toMatchObject({
      variantOf: 'VehicleOptions',
    });
  });

  it('keeps metadata about relations visible', () => {
    expect(expectUnsupported('metadata Risk about vehicle1;', 'MetadataUsage', 'unsupported:metadata-about')).toMatchObject({
      about: 'vehicle1',
    });
  });

  it('consumes richer satisfy and verify requirement syntax as one relation node', () => {
    const satisfy = parseSysML('satisfy requirement massReq by vehicle1;');
    expect(satisfy.errors).toHaveLength(0);
    expect(satisfy.children).toHaveLength(1);
    expect(satisfy.children[0]).toMatchObject({
      kind: 'RequirementUsage',
      name: 'massReq',
      sourceRef: 'vehicle1',
      targetRef: 'massReq',
    });

    const verify = parseSysML('verify requirement massReq;');
    expect(verify.errors).toHaveLength(0);
    expect(verify.children).toHaveLength(1);
    expect(verify.children[0]).toMatchObject({
      kind: 'VerificationUsage',
      name: 'massReq',
      targetRef: 'massReq',
    });
  });

  it('keeps message and event constructs visible', () => {
    expect(expectUnsupported('send StatusPacket to receiver;', 'MessageUsage', 'unsupported:message')).toMatchObject({
      payloadType: 'StatusPacket',
      target: 'receiver',
    });
    expectUnsupported('event occurrence ignition;', 'EventOccurrenceUsage', 'unsupported:event-occurrence');
  });
});
