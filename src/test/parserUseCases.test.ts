import { describe, expect, it } from 'vitest';
import { parseSysML } from '../parser/parser';

describe('official-pattern SysML v2 use cases', () => {
  it('captures subject, actors, multiplicity, and objective', () => {
    const parsed = parseSysML(`
      part def Vehicle;
      part def Person;
      use case def Transportation {
        subject vehicle : Vehicle;
        actor driver : Person;
        actor passengers : Person[0..4];
        objective { doc /* Transport occupants to destination. */ }
      }
    `);
    expect(parsed.errors).toEqual([]);
    expect(parsed.children.find((node) => node.kind === 'UseCaseDef')).toMatchObject({
      subject: { name: 'vehicle', typeName: 'Vehicle' },
      actors: [
        { name: 'driver', typeName: 'Person' },
        { name: 'passengers', typeName: 'Person', multiplicity: '0..4' },
      ],
      objective: 'Transport occupants to destination.',
    });
  });

  it('parses official first/then/include structure and actor bindings', () => {
    const parsed = parseSysML(`
      use case transportation {
        subject vehicle;
        first start;
        then include use case enterVehicle {
          subject vehicle;
          actor driver = transportation::driver;
        }
        then include addFuel[0..*] {
          subject vehicle;
          actor fueler = driver;
        }
        then done;
      }
    `);
    expect(parsed.errors).toEqual([]);
    const useCase = parsed.children[0];
    expect(useCase.children).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'TransitionUsage', source: '__initial__', target: 'start' }),
      expect.objectContaining({ kind: 'UseCaseUsage', name: 'enterVehicle', includeKind: 'include' }),
      expect.objectContaining({ kind: 'UseCaseUsage', name: 'addFuel', includeKind: 'include', multiplicity: '0..*' }),
      expect.objectContaining({ kind: 'ActionUsage', name: 'done' }),
    ]));
    const enter = useCase.children.find((node) => node.name === 'enterVehicle');
    expect(enter).toMatchObject({
      actors: [{ name: 'driver', bindingRef: 'transportation::driver' }],
    });
  });
});
