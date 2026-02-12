export const MARS_ROVER_EXAMPLE = `package 'Mars Mission' {

  /* Requirements */
  package Requirements {
    requirement def MissionRequirement {
      doc /* The system shall perform scientific exploration of Mars. */
    }

    requirement def PowerRequirement {
      doc /* The rover shall operate within available power. */
      attribute maxPower : Real;
    }

    requirement 'Explore Mars' : MissionRequirement;
    requirement 'Power Limit' : PowerRequirement {
      attribute maxPower = 500.0;
    }
  }

  /* Domain Model */
  package Domain {
    part def MartianSurface;
    part def Atmosphere;
    
    part def Command;
    part def Telemetry;
  }

  /* System Architecture */
  package System {
    import Domain::*;
    import Requirements::*;

    part def Rover {
      /* Structural decomposition */
      part powerSubsystem : PowerSubsystem;
      part commsSubsystem : CommsSubsystem;
      part navSubsystem : NavigationSubsystem;
      part scienceInstrument : Spectrometer;

      /* Internal connections */
      connect powerSubsystem.powerOut to commsSubsystem.powerIn;
      connect powerSubsystem.powerOut to navSubsystem.powerIn;
      connect commsSubsystem.dataOut to navSubsystem.dataIn;

      /* System States */
      state def RoverStates {
        entry; then Idle;
        state Idle;
        state Moving;
        state Sampling;
        
        transition 'start move' first Idle accept 'drive cmd' then Moving;
        transition 'stop move' first Moving accept 'stop cmd' then Idle;
      }
      
      state roverState : RoverStates;
      
      /* Behaviors */
      action def Drive {
        in targetLocation : Real;
        out reached : Boolean;
      }
      
      action drive : Drive;
    }

    part def PowerSubsystem {
      port powerOut;
    }

    part def CommsSubsystem {
      port powerIn;
      port dataOut;
      port commandIn;
    }

    part def NavigationSubsystem {
      port powerIn;
      port dataIn;
    }

    part def Spectrometer;

    part def MissionControl {
      port commandOut;
      port telemetryIn;
    }

    /* Top Level Context */
    part 'Mars Mission Context' {
      part rover : Rover;
      part missionControl : MissionControl;
      part mars : MartianSurface;

      /* External Interfaces */
      connect missionControl.commandOut to rover.commsSubsystem.commandIn;
      connect rover.commsSubsystem.dataOut to missionControl.telemetryIn;
    }
  }
}
`;
