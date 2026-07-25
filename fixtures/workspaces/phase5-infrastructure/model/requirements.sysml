package InfrastructureRequirements {
    private import InfrastructureLibrary::*;

    requirement telemetryAvailability {
        subject station : RemoteStation;
        doc /* The remote station shall provide operational telemetry to the control centre. */
    }

    requirement remoteCommand {
        subject station : RemoteStation;
        doc /* The control centre shall deliver authenticated commands to the remote station. */
    }

    requirement failoverNotification {
        subject carrier : NetworkCarrier;
        doc /* The network carrier shall notify both owning parties when the primary path fails. */
    }
}
