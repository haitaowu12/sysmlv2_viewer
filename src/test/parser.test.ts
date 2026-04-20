import { describe, it, expect } from 'vitest';
import { parseSysML } from '../parser/parser';

describe('parseSysML', () => {
  it('parses an empty input', () => {
    const result = parseSysML('');
    expect(result.children).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('parses a package', () => {
    const result = parseSysML("package 'TestPackage' {\n}");
    expect(result.errors).toHaveLength(0);
    expect(result.children).toHaveLength(1);
    expect(result.children[0].kind).toBe('Package');
    expect(result.children[0].name).toBe('TestPackage');
  });

  it('parses a part def', () => {
    const result = parseSysML('part def Vehicle {\n}');
    expect(result.errors).toHaveLength(0);
    expect(result.children).toHaveLength(1);
    expect(result.children[0].kind).toBe('PartDef');
    expect(result.children[0].name).toBe('Vehicle');
  });

  it('parses a part usage', () => {
    const result = parseSysML('part engine : Engine;');
    expect(result.errors).toHaveLength(0);
    expect(result.children).toHaveLength(1);
    expect(result.children[0].kind).toBe('PartUsage');
    expect(result.children[0].name).toBe('engine');
  });

  it('parses a port def', () => {
    const result = parseSysML('port def PowerPort;');
    expect(result.errors).toHaveLength(0);
    expect(result.children).toHaveLength(1);
    expect(result.children[0].kind).toBe('PortDef');
  });

  it('parses a port usage', () => {
    const result = parseSysML('port p : PowerPort;');
    expect(result.errors).toHaveLength(0);
    expect(result.children).toHaveLength(1);
    expect(result.children[0].kind).toBe('PortUsage');
  });

  it('parses an action def', () => {
    const result = parseSysML('action def StartEngine {\n}');
    expect(result.errors).toHaveLength(0);
    expect(result.children).toHaveLength(1);
    expect(result.children[0].kind).toBe('ActionDef');
  });

  it('parses a state def with states', () => {
    const result = parseSysML('state def VehicleStates {\n\tentry; then off;\n\tstate off;\n\tstate on;\n}');
    expect(result.errors).toHaveLength(0);
    expect(result.children).toHaveLength(1);
    expect(result.children[0].kind).toBe('StateDef');
  });

  it('parses a requirement def', () => {
    const result = parseSysML('requirement def SafetyReq {\n\tdoc /* Must be safe */\n}');
    expect(result.errors).toHaveLength(0);
    expect(result.children).toHaveLength(1);
    expect(result.children[0].kind).toBe('RequirementDef');
  });

  it('parses a constraint def', () => {
    const result = parseSysML('constraint def MaxSpeed {\n}');
    expect(result.errors).toHaveLength(0);
    expect(result.children).toHaveLength(1);
    expect(result.children[0].kind).toBe('ConstraintDef');
  });

  it('parses an attribute usage', () => {
    const result = parseSysML('attribute speed : SI::Speed;');
    expect(result.errors).toHaveLength(0);
    expect(result.children).toHaveLength(1);
    expect(result.children[0].kind).toBe('AttributeUsage');
  });

  it('parses an item def', () => {
    const result = parseSysML('item def Fuel;');
    expect(result.errors).toHaveLength(0);
    expect(result.children).toHaveLength(1);
    expect(result.children[0].kind).toBe('ItemDef');
  });

  it('parses an enum def', () => {
    const result = parseSysML('enum def Color {\n\tred;\n\tgreen;\n\tblue;\n}');
    expect(result.errors).toHaveLength(0);
    expect(result.children).toHaveLength(1);
    expect(result.children[0].kind).toBe('EnumDef');
  });

  it('parses a connection def', () => {
    const result = parseSysML('connection def PowerConnection {\n\tend source;\n\tend target;\n}');
    expect(result.errors).toHaveLength(0);
    expect(result.children).toHaveLength(1);
    expect(result.children[0].kind).toBe('ConnectionDef');
  });

  it('parses an interface def', () => {
    const result = parseSysML('interface def IPower {\n\tend a;\n\tend b;\n}');
    expect(result.errors).toHaveLength(0);
    expect(result.children).toHaveLength(1);
    expect(result.children[0].kind).toBe('InterfaceDef');
  });

  it('parses an import', () => {
    const result = parseSysML('import ScalarValues::*;');
    expect(result.errors).toHaveLength(0);
    expect(result.children).toHaveLength(1);
    expect(result.children[0].kind).toBe('Import');
  });

  it('parses a doc annotation', () => {
    const result = parseSysML("part def Vehicle {\n\tdoc /* A vehicle */\n}");
    expect(result.errors).toHaveLength(0);
    expect(result.children).toHaveLength(1);
  });

  it('parses nested elements', () => {
    const result = parseSysML("part def Vehicle {\n\tpart engine : Engine;\n\tpart wheels : Wheel[4];\n}");
    expect(result.errors).toHaveLength(0);
    expect(result.children).toHaveLength(1);
    expect(result.children[0].children.length).toBeGreaterThanOrEqual(2);
  });

  it('produces errors for invalid input', () => {
    const result = parseSysML('partdef Vehicle {\n}');
    expect(result.errors.length + result.children.filter(c => c.kind === 'Unknown').length).toBeGreaterThan(0);
  });

  it('recovers from errors and continues parsing', () => {
    const result = parseSysML('invalid here\npart def Vehicle {\n}');
    expect(result.children.length).toBeGreaterThanOrEqual(1);
  });

  it('parses line comments', () => {
    const result = parseSysML('// This is a comment\npart def Vehicle {\n}');
    expect(result.errors).toHaveLength(0);
    expect(result.children).toHaveLength(1);
  });

  it('parses block comments', () => {
    const result = parseSysML('/* Block comment */\npart def Vehicle {\n}');
    expect(result.errors).toHaveLength(0);
    expect(result.children).toHaveLength(1);
  });

  it('parses nested block comments', () => {
    const result = parseSysML('/* Outer /* inner */ still outer */\npart def Vehicle {\n}');
    expect(result.errors).toHaveLength(0);
    expect(result.children).toHaveLength(1);
  });

  it('parses a verification def', () => {
    const result = parseSysML('verification def TestSafety {\n}');
    expect(result.errors).toHaveLength(0);
    expect(result.children).toHaveLength(1);
    expect(result.children[0].kind).toBe('VerificationDef');
  });

  it('parses an analysis def', () => {
    const result = parseSysML('analysis def PerformanceAnalysis {\n}');
    expect(result.errors).toHaveLength(0);
    expect(result.children).toHaveLength(1);
    expect(result.children[0].kind).toBe('AnalysisDef');
  });

  it('parses a viewpoint def', () => {
    const result = parseSysML('viewpoint def StakeholderView {\n}');
    expect(result.errors).toHaveLength(0);
    expect(result.children).toHaveLength(1);
    expect(result.children[0].kind).toBe('ViewpointDef');
  });

  it('parses a use case def', () => {
    const result = parseSysML('use case def OperateVehicle {\n}');
    expect(result.errors).toHaveLength(0);
    expect(result.children).toHaveLength(1);
    expect(result.children[0].kind).toBe('UseCaseDef');
  });

  it('parses a metadata def', () => {
    const result = parseSysML('metadata def SafetyLevel {\n}');
    expect(result.errors).toHaveLength(0);
    expect(result.children).toHaveLength(1);
    expect(result.children[0].kind).toBe('MetadataDef');
  });

  it('parses an allocation def', () => {
    const result = parseSysML('allocation def AssignHardware {\n}');
    expect(result.errors).toHaveLength(0);
    expect(result.children).toHaveLength(1);
    expect(result.children[0].kind).toBe('AllocationDef');
  });

  it('parses a dependency usage', () => {
    const result = parseSysML('dependency from A to B;');
    expect(result.errors).toHaveLength(0);
    expect(result.children).toHaveLength(1);
    expect(result.children[0].kind).toBe('DependencyUsage');
  });

  it('parses a flow usage', () => {
    const result = parseSysML('flow from A to B;');
    expect(result.errors).toHaveLength(0);
    expect(result.children).toHaveLength(1);
    expect(result.children[0].kind).toBe('FlowUsage');
  });

  it('parses a binding usage', () => {
    const result = parseSysML('bind a = b;');
    expect(result.errors).toHaveLength(0);
    expect(result.children).toHaveLength(1);
    expect(result.children[0].kind).toBe('BindingUsage');
  });
});
