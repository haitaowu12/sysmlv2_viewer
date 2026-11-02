package PumpStationStudy {
    private import ScalarValues::*;

    item def StartRequest;
    item def StopRequest;
    item def FaultNotice;
    item def ResetRequest;
    port def Command { out item request : StartRequest; }
    interface def CommandExchange {
        end source : Command;
        end target : ~Command;
        flow of StartRequest from source.request to target.request;
    }

    part def Operator { port request : Command; }
    part def Motor {
        port command : ~Command;
        exhibit state operating : MotorStates;
    }
    part def PumpSkid {
        port command : ~Command;
        part motor : Motor;
        binding commandForwarding bind command = motor.command;
    }
    part def Controller {
        port request : ~Command;
        port dutyCommand : Command;
        port standbyCommand : Command;
    }
    part def Station {
        port request : ~Command;
        part controller : Controller;
        part duty : PumpSkid;
        part standby : PumpSkid;
        attribute installedPumpCount : Integer = 2;
        attribute maximumRunningPumps : Integer = 1;
        binding requestForwarding bind request = controller.request;
        interface dutyLink : CommandExchange connect controller.dutyCommand to duty.command;
        interface standbyLink : CommandExchange connect controller.standbyCommand to standby.command;
    }
    part context {
        part station : Station;
        ref part operator : Operator;
        interface requestLink : CommandExchange connect operator.request to station.request;
    }

    state def MotorStates {
        entry;
        then stopped;
        state stopped;
        state running;
        state tripped;
        transition startMotor first stopped accept StartRequest then running;
        transition stopMotor first running accept StopRequest then stopped;
        transition tripMotor first running accept FaultNotice then tripped;
        transition resetMotor first tripped accept ResetRequest then stopped;
    }

    requirement installedCapacity {
        doc /* PS-CAP-01: The station shall have an installed pump capacity of at least two units. */
        subject station : Station;
        require constraint { station.installedPumpCount >= 2 }
    }
    satisfy installedCapacity by context.station;
    verification def InstalledCapacityVerification {
        doc /* Planned design count check; no execution or physical performance claim. */
        subject station : Station;
        objective { verify installedCapacity; }
    }
}
