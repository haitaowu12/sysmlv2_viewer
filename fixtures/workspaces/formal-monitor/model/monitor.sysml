package MonitorExample {
    private import ScalarValues::*;

    doc /* Illustrative acceptance fixture. No real project architecture or protocol is asserted. */

    item def Sample;

    port def Samples {
        out item sample : Sample;
    }

    interface def SampleTransfer {
        end sender : Samples;
        end receiver : ~Samples;
        flow of Sample from sender.sample to receiver.sample;
    }

    action def Reporting {
        first start;
        then action receiveSample;
        then action forwardSample;
        then done;
    }

    part def Sensor {
        port samples : Samples;
    }

    part def Controller {
        attribute bufferCapacity : Integer = 2;
        port samplesIn : ~Samples;
        port samplesOut : Samples;
        perform action reporting : Reporting;
    }

    part def Recorder {
        port samples : ~Samples;
    }

    part def Monitor {
        part sensor : Sensor;
        part controller : Controller;
        port samples : Samples;
        interface internalTransfer : SampleTransfer
            connect sensor.samples to controller.samplesIn;
        bind controller.samplesOut = samples;
    }

    requirement bufferRequirement {
        doc /* The monitor controller shall buffer at least two samples. */
        subject monitor : Monitor;
        require constraint { monitor.controller.bufferCapacity >= 2 }
    }

    part context {
        part monitor : Monitor;
        part recorder : Recorder;
        interface boundaryTransfer : SampleTransfer
            connect monitor.samples to recorder.samples;
        satisfy bufferRequirement by context.monitor;
    }

    verification def BufferVerification {
        doc /* Planned inspection case. No execution result or pass verdict is asserted. */
        subject testMonitor : Monitor;
        objective capacityObjective {
            verify bufferRequirement;
        }
    }
}
