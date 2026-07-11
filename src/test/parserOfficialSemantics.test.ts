import { describe, expect, it } from 'vitest';
import { parseSysML } from '../parser/parser';

describe('official-pattern SysML v2 semantic constructs', () => {
  it('parses directed item features, interface endpoint bindings, and state successions', () => {
    const parsed = parseSysML(`
      item def Request;
      item def Authorization;
      port def RequesterPort {
        out item request : Request;
        in item authorization : Authorization;
      }
      port def ControllerPort {
        in item request : Request;
        out item authorization : Authorization;
      }
      interface def Coordination {
        end requester : RequesterPort;
        end controller : ControllerPort;
        flow requester.request to controller.request;
      }
      part def System;
      part system : System {
        port requester : RequesterPort;
        port controller : ControllerPort;
        interface coordination : Coordination connect
          requester ::> system.requester to
          controller ::> system.controller;
      }
      state def Lifecycle {
        first start then waiting;
        state waiting;
          then active;
        state active;
      }
    `);

    expect(parsed.errors).toEqual([]);
    const system = parsed.children.find((node) => node.kind === 'PartUsage');
    expect(system?.children).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'InterfaceUsage',
        name: 'coordination',
        source: 'system.requester',
        target: 'system.controller',
      }),
    ]));
    const lifecycle = parsed.children.find((node) => node.kind === 'StateDef');
    expect(lifecycle?.children).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'TransitionUsage', source: 'start', target: 'waiting' }),
      expect.objectContaining({ kind: 'TransitionUsage', target: 'active' }),
    ]));
  });

  it('parses named verification objectives, qualified verify targets, and subject bindings', () => {
    const parsed = parseSysML(`
      part def System;
      part system : System;
      requirement systemRequirement { subject system : System; }
      verification def EvidenceReview {
        subject system : System;
        objective evidenceObjective {
          verify system::systemRequirement;
        }
      }
      verification review : EvidenceReview {
        subject system :> Example::system;
      }
    `);

    expect(parsed.errors).toEqual([]);
    const verification = parsed.children.find((node) => node.kind === 'VerificationDef');
    expect(verification?.children).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'VerificationUsage', name: 'evidenceObjective' }),
    ]));
    const objective = verification?.children.find((node) => node.name === 'evidenceObjective');
    expect(objective?.children).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'VerificationUsage', targetRef: 'system::systemRequirement' }),
    ]));
  });
});
