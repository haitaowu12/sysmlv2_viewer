package Phase2Assurance {
    private import Phase2Library::*;

    item def Command;
    port def CommandPort;
    part def Vehicle;

    requirement commandRequirement {
        subject vehicle : Vehicle;
        doc /* The vehicle shall accept commands. */
    }

    part vehicle : Vehicle {
        port commandIn : CommandPort;
        port commandOut : CommandPort;

        interface commandInterface connect commandIn to commandOut;
        flow of Command from commandIn to commandOut;
    }

    part designContext {
        ref design :> vehicle;
        satisfy commandRequirement by design;
    }

    verification def CommandVerification {
        subject testVehicle : Vehicle;
        objective commandObjective {
            verify commandRequirement;
        }
    }
}
