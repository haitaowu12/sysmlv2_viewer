package ContributorPilot {
    private import ScalarValues::*;

    doc /* CP-A / fictional infrastructure-control contributor pilot. The model is a
       source-backed workflow fixture, not an accepted project design or physical
       performance result. Baseline A carries a 120 ms response provision. */

    item def ControlRequest {
        attribute commandId : String;
        attribute equipmentId : String;
        attribute requestedState : String;
    }
    item def ControlAcknowledgement {
        attribute commandId : String;
        attribute accepted : Boolean;
    }
    port def ControlLink {
        in item request : ControlRequest;
        out item acknowledgement : ControlAcknowledgement;
    }
    interface def ControllerFieldExchange {
        end controller : ControlLink;
        end field : ~ControlLink;
        flow of ControlRequest from controller.request to field.request;
        flow of ControlAcknowledgement from field.acknowledgement to controller.acknowledgement;
    }

    port def EquipmentFeedback;
    part def FieldEquipment {
        port control : ~ControlLink;
        port feedback : EquipmentFeedback;
        attribute equipmentId : String;
    }
    part def ControlController {
        port fieldALink : ControlLink;
        port fieldBLink : ControlLink;
        attribute responseLimitMs : ScalarValues::Real = 120;
        doc /* HIST-A-01: Baseline A recorded 95 ms at field A. This historical
           observation is retained for applicability review; it is not an accepted
           requirement result, current performance claim or verification pass. */
        attribute historicalObservedResponseMillisecondsAtA : ScalarValues::Real = 95;
    }
    part def InfrastructureControlSystem {
        part controller : ControlController;
        part fieldA : FieldEquipment {
            attribute redefines equipmentId = "FIELD-A";
        }
        part fieldB : FieldEquipment {
            attribute redefines equipmentId = "FIELD-B";
        }
        interface fieldAExchange : ControllerFieldExchange connect controller.fieldALink to fieldA.control;
        interface fieldBExchange : ControllerFieldExchange connect controller.fieldBLink to fieldB.control;
    }

    part def Operator;
    part context {
        part system : InfrastructureControlSystem;
        ref part operator : Operator;
        doc /* CP-CONTEXT-01: The context supports reader and contributor views;
           it does not introduce another controller or field asset. */
    }

    state def UnrelatedAdvancedLifecycle {
        doc /* UNRELATED-ADVANCED-01: Preserve this advanced state declaration and
           its comment when a contributor edits the requirement/interface workflow. */
        entry;
        then idle;
        state idle;
        state active;
        transition begin first idle then active;
    }

    requirement responseWithinBound {
        doc /* CP-RQ-01 / Baseline A: the controller shall return a control
           acknowledgement within 120 ms of request receipt. ACK-MEANING-01 is
           OPEN: acknowledgement may mean an accepted dispatch message or a
           completed field action. This fixture selects neither interpretation. */
        subject controller : ControlController;
    }
    verification def AcknowledgementTimingCheck {
        doc /* Planned verification only. No procedure, instrumentation,
           calibration applicability, execution or acceptance is supplied. */
        subject controller : ControlController;
        objective { verify responseWithinBound; }
    }
}
