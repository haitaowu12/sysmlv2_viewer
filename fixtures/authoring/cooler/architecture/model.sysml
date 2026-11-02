package CoolerStudy {
    private import ScalarValues::*;

    item def TemperatureReading;
    item def CoolingCommand;
    item def EnableCommand;

    port def Temperature { out item observation : TemperatureReading; }
    port def Cooling { out item command : CoolingCommand; }
    port def Enable { out item command : EnableCommand; }

    interface def TemperatureExchange {
        end source : Temperature;
        end target : ~Temperature;
        flow of TemperatureReading from source.observation to target.observation;
    }
    interface def CoolingExchange {
        end source : Cooling;
        end target : ~Cooling;
        flow of CoolingCommand from source.command to target.command;
    }
    interface def EnableExchange {
        end source : Enable;
        end target : ~Enable;
        flow of EnableCommand from source.command to target.command;
    }

    part def Operator { port enable : Enable; }
    part def Probe { port readings : Temperature; }
    part def Actuator { port cooling : ~Cooling; }
    part def Controller {
        port readings : ~Temperature;
        port cooling : Cooling;
        port enable : ~Enable;
        attribute sampleCapacity : Integer = 4;
        perform action regulate : Regulate;
    }
    part def Cooler {
        port enable : ~Enable;
        part probe : Probe;
        part controller : Controller;
        part actuator : Actuator;
        interface observations : TemperatureExchange connect probe.readings to controller.readings;
        interface commands : CoolingExchange connect controller.cooling to actuator.cooling;
        binding enableForwarding bind enable = controller.enable;
    }
    part context {
        part cooler : Cooler;
        ref part operator : Operator;
        interface operatorCommand : EnableExchange connect operator.enable to cooler.enable;
    }

    action def Regulate {
        first start;
        then action acquire;
        then action 'decide';
        then action issue;
        then done;
    }

    requirement capacityRequirement {
        doc /* The cooler controller shall retain at least four samples. */
        subject cooler : Cooler;
        require constraint { cooler.controller.sampleCapacity >= 4 }
    }
    satisfy capacityRequirement by context.cooler;

    verification def CapacityVerification {
        doc /* Planned capacity verification only. No execution occurred. */
        subject cooler : Cooler;
        objective {
            verify capacityRequirement;
        }
    }
}
