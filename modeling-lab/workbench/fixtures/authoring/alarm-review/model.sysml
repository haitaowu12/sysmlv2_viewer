package AlarmReview {
    private import ScalarValues::*;
    item def TemperatureReading;
    item def AlarmCommand;
    port def Temperature { out item observation : TemperatureReading; }
    port def Alarm { out item command : AlarmCommand; }
    interface def TemperatureExchange {
        end sender : Temperature;
        end receiver : ~Temperature;
        flow of TemperatureReading from sender.observation to receiver.observation;
    }
    interface def AlarmExchange {
        end sender : Alarm;
        end receiver : ~Alarm;
        flow of AlarmCommand from sender.command to receiver.command;
    }
    part def Probe { port readings : Temperature; }
    part def ColdRoom {
        port readings : Temperature;
        part probeHead : Probe;
        binding observations bind readings = probeHead.readings;
    }
    part def Controller {
        port room0Readings : ~Temperature;
        port room1Readings : ~Temperature;
        port alarm : Alarm;
        attribute sampleCapacity : Integer = 2;
    }
    part def Annunciator { port alarm : ~Alarm; }
    part def MonitoringSystem {
        part coldRoom0 : ColdRoom;
        part coldRoom1 : ColdRoom;
        part controller : Controller;
        part annunciator : Annunciator;
        interface room0Observations : TemperatureExchange connect coldRoom0.readings to controller.room0Readings;
        interface room1Observations : TemperatureExchange connect coldRoom1.readings to controller.room1Readings;
        interface alarmCommands : AlarmExchange connect controller.alarm to annunciator.alarm;
    }
    part monitoringSystem : MonitoringSystem;
    requirement sampleRetention {
        doc /* BR-2: The monitoring controller shall retain at least two samples. */
        subject system : MonitoringSystem;
        require constraint { system.controller.sampleCapacity >= 2 }
    }
    satisfy sampleRetention by monitoringSystem;
    verification def CapacityVerification {
        doc /* BR-2: Planned capacity verification only. No execution occurred. */
        subject system : MonitoringSystem;
        objective { verify sampleRetention; }
    }
}
