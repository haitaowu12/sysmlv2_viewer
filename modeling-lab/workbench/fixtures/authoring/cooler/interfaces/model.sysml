package CoolerStudy {
    private import ScalarValues::*;
    doc /* Fictional cooler study, source input.csv. Timing, protocol,
         temperature units and failure responses remain unspecified. */

    item def TemperatureReading;
    item def CoolingCommand;
    item def EnableCommand;

    port def Temperature { out item reading : TemperatureReading; }
    port def Cooling { out item command : CoolingCommand; }
    port def Enable { out item command : EnableCommand; }

    interface def TemperatureTransfer {
        end sender : Temperature;
        end receiver : ~Temperature;
        flow of TemperatureReading from sender.reading to receiver.reading;
    }
    interface def CoolingTransfer {
        end sender : Cooling;
        end receiver : ~Cooling;
        flow of CoolingCommand from sender.command to receiver.command;
    }
    interface def EnableTransfer {
        end sender : Enable;
        end receiver : ~Enable;
        flow of EnableCommand from sender.command to receiver.command;
    }

    action def Regulate {
        first start;
        then action acquire;
        then action 'decide';
        then action issue;
        then done;
    }
    part def Probe { port readings : Temperature; }
    part def Controller {
        port readings : ~Temperature;
        port cooling : Cooling;
        port enable : ~Enable;
        attribute sampleCapacity : Integer = 4;
        perform action regulate : Regulate;
    }
    part def Actuator { port cooling : ~Cooling; }
    part def Operator { port enable : Enable; }
    part def Cooler {
        part probe : Probe;
        part controller : Controller;
        part actuator : Actuator;
        port enable : ~Enable;
        interface temperatureTransfer : TemperatureTransfer
            connect probe.readings to controller.readings;
        interface coolingTransfer : CoolingTransfer
            connect controller.cooling to actuator.cooling;
        bind enable = controller.enable;
    }
    requirement capacityRequirement {
        doc /* The cooler controller shall retain at least four samples. */
        subject cooler : Cooler;
        require constraint { cooler.controller.sampleCapacity >= 4 }
    }
    part context {
        part cooler : Cooler;
        ref part operator : Operator;
        interface enableTransfer : EnableTransfer
            connect operator.enable to cooler.enable;
        satisfy capacityRequirement by CoolerStudy::context::cooler;
    }
    verification def CapacityVerification {
        doc /* Planned verification of capacityRequirement; no test executed. */
        subject cooler : Cooler;
        objective capacityObjective { verify capacityRequirement; }
    }
}
