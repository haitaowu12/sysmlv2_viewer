/**
 * Release-grounded SysML v2 starter model.
 *
 * Kept inside the viewer's strongest roundtrip subset while following the
 * current SysML v2 textual style: packages, definitions/usages, requirements,
 * verification, and trace relationships.
 */
export const VEHICLE_SYSTEM_EXAMPLE = `package 'Vehicle System' {
  private import ScalarValues::*;
  private import SI::*;

  item def Fuel;
  item def ElectricalPower;

  port def FuelPort;
  port def ElectricalPort;

  part def Engine {
    port fuelIn : FuelPort;
    port powerOut : ElectricalPort;
    attribute mass : Real;
  }

  part def Battery {
    port powerOut : ElectricalPort;
    attribute stateOfCharge : Real;
  }

  part def Controller {
    port powerIn : ElectricalPort;
    attribute softwareVersion : String;
  }

  part def Vehicle {
    part engine : Engine;
    part battery : Battery;
    part controller : Controller;

    connect battery.powerOut to controller.powerIn;
    connect engine.powerOut to controller.powerIn;
  }

  requirement def MassRequirement {
    doc /* The vehicle mass shall remain within the allocated mass budget. */
    subject vehicle : Vehicle;
    require constraint { vehicle.engine.mass <= 450.0 }
  }

  requirement def ControlPowerRequirement {
    doc /* The controller shall receive electrical power from an onboard source. */
    subject vehicle : Vehicle;
  }

  verification def VehicleInspection {
    subject vehicle : Vehicle;
  }

  part vehicle : Vehicle {
    satisfy MassRequirement;
    satisfy ControlPowerRequirement;
    verify MassRequirement;
  }
}
`;
