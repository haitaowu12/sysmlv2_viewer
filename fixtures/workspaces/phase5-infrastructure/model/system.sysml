package InfrastructurePilot {
    private import InfrastructureLibrary::*;
    private import InfrastructureRequirements::*;

    part controlCentre : ControlCentre {
        port telemetryIn : TelemetryPort;
        port commandOut : CommandPort;
    }

    part remoteStation : RemoteStation {
        port telemetryOut : TelemetryPort;
        port commandIn : CommandPort;
    }

    part carrier : NetworkCarrier {
        port controlBoundary : CommandPort;
        port stationBoundary : TelemetryPort;
    }

    interface telemetryInterface connect remoteStation.telemetryOut to controlCentre.telemetryIn;
    flow of TelemetryFrame from remoteStation.telemetryOut to controlCentre.telemetryIn;

    interface commandInterface connect controlCentre.commandOut to remoteStation.commandIn;
    flow of ControlCommand from controlCentre.commandOut to remoteStation.commandIn;

    part designContext {
        ref stationDesign :> remoteStation;
        ref centreDesign :> controlCentre;
        satisfy telemetryAvailability by stationDesign;
        satisfy remoteCommand by centreDesign;
    }

    verification def TelemetryVerification {
        subject testStation : RemoteStation;
        objective telemetryObjective {
            verify telemetryAvailability;
        }
    }

    state def OperatingMode {
        state normal;
        state degraded;
    }
}
