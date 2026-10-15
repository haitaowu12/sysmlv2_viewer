package ParcelSortingStudy {
    private import ScalarValues::*;
    doc /* Fictional B1 / PS-ICD R1 / D1 study. Static declarations only; no allocation, physical performance, calibration or commissioning acceptance. */
    item def RouteDispatch { attribute commandId : String; attribute parcelId : String; attribute intendedLane : String; }
    item def RouteAcknowledgement { attribute commandId : String; attribute acknowledged : Boolean; }
    item def JamReport { attribute parcelId : String; attribute affectedDiverter : String; }
    item def ResumeAuthorisation { attribute authorisationId : String; attribute stationId : String; }
    port def StationWarehouseLink {
        in item dispatch : RouteDispatch;
        out item acknowledgement : RouteAcknowledgement;
        out item jam : JamReport;
        in item resume : ResumeAuthorisation;
    }
    interface def StationWarehouseExchange {
        end station : StationWarehouseLink;
        end warehouse : ~StationWarehouseLink;
        flow of RouteDispatch from warehouse.dispatch to station.dispatch;
        flow of RouteAcknowledgement from station.acknowledgement to warehouse.acknowledgement;
        flow of JamReport from station.jam to warehouse.jam;
        flow of ResumeAuthorisation from warehouse.resume to station.resume;
    }
    port def PositionFeedback;
    part def RotaryActuator {
        doc /* B1:physical supplier rotary actuator. Position feedback payload and timing remain unspecified. */
        port feedback : PositionFeedback;
        attribute homeAngle : Real;
        attribute assetTag : String;
    }
    part def Diverter;
    part def Scanner;
    part def Conveyor;
    part def SupervisorController;
    part def Operator;
    part def WarehouseControl { port sorterLink : ~StationWarehouseLink; }
    part def SortingStation { port controlLink : StationWarehouseLink; }
    part sorter : SortingStation {
        part scanner : Scanner;
        part conveyor : Conveyor;
        part supervisorController : SupervisorController;
        part diverterA : Diverter {
            part actuator : RotaryActuator {
                attribute redefines homeAngle = 12.0;
                attribute redefines assetTag = "QA-DA-01";
            }
            attribute outboundLane : String = "Lane-A";
        }
        part diverterB : Diverter {
            part actuator : RotaryActuator {
                doc /* B1:B no calibration certificate or accepted calibration status supplied. */
                attribute redefines homeAngle = -8.0;
                attribute redefines assetTag = "QA-DB-02";
            }
            attribute outboundLane : String = "Lane-B";
        }
        attribute acknowledgementBoundMilliseconds : Integer = 120;
        exhibit state operating : JamRecoveryStory;
    }
    ref part warehouseControl : WarehouseControl;
    ref part operator : Operator;
    part context {
        doc /* View context references the named sorter and external participants; references do not create additional physical equipment. */
        ref part station : SortingStation = ParcelSortingStudy::sorter;
        ref part warehouse : WarehouseControl = ParcelSortingStudy::warehouseControl;
        ref part operator : Operator = ParcelSortingStudy::operator;
        interface controlExchange : StationWarehouseExchange connect station.controlLink to warehouse.sorterLink;
    }
    action def IdentifyParcel;
    action def SelectRoute;
    action def DivertParcel;
    action def ReportRouteAcknowledgement;
    action def ManageJamRecovery;
    state def JamRecoveryStory {
        doc /* B1:jam intended story. Dispatches held while recovery pending; resume needs operator clearance and warehouse authorisation. No actuator movement, protection, internal event routing or executable sequence specified. */
        entry;
        then normalSorting;
        state normalSorting;
        state jamReported;
        state recoveryPending { doc /* Hold new station route dispatches. Preserve parcel identity and intended lane. */ }
        state resumedSorting;
        attribute operatorClearanceReported : Boolean;
        transition jamInterrupt first normalSorting accept JamReport then jamReported;
        transition awaitRecovery first jamReported then recoveryPending;
        transition resumeSorting first recoveryPending accept ResumeAuthorisation if operatorClearanceReported then resumedSorting {
            doc /* Requires operator-reported jam clearance as well. Clearance reporting/event routing is unresolved; this transition alone is not a complete executable recovery sequence. */
        }
    }
    requirement assignedLaneOutcome {
        doc /* B1:boundary identified parcel reaches assigned outbound lane; identity and intended lane retained across jam interruption. Unverified physical outcome. */
        subject sorter : SortingStation;
    }
    requirement acknowledgementTiming {
        doc /* PS-ICD R1 acknowledgement within 120 milliseconds from RouteDispatch receipt. ACK-MEANING-01 OPEN: Operations means completed physical diversion; Controls means accepted dispatch message. No milestone selected. */
        subject sorter : SortingStation;
    }
    verification def PlannedJourneyCheck {
        doc /* Planned check only; no executable procedure, physical observation or commissioning permission supplied. */
        subject sorter : SortingStation;
        objective { verify assignedLaneOutcome; }
    }
}
