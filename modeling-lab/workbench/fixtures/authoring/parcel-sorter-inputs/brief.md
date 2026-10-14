# Parcel sorting station — fictional study brief, revision B1

[B1:boundary] East Quay Parcel Hub wants a sorting station called `sorter` to direct each identified parcel to its assigned outbound lane and to retain the parcel identity and intended lane when a jam interrupts the journey. The warehouse-control system, `warehouseControl`, is outside the station boundary. The operator is an external participant.

[B1:functions] For this study, the required functional responsibilities are IdentifyParcel, SelectRoute, DivertParcel, ReportRouteAcknowledgement and ManageJamRecovery. These are responsibilities to model, not an agreed logical decomposition. The supplied documents do not allocate those responsibilities to physical parts.

[B1:physical] The selected physical arrangement contains one scanner, one conveyor, one station supervisor controller, and two diverter modules named `diverterA` and `diverterB`. Each diverter module contains its own actuator occurrence named `actuator`; both actuator occurrences use the same `RotaryActuator` definition. The shared definition is described as a supplier rotary actuator with a position-feedback interface. Two usages do not mean two different definitions or the same physical actuator.

[B1:A] `diverterA::actuator` has the occurrence setting homeAngle = 12 degrees and asset tag QA-DA-01. Its outbound lane is Lane-A.

[B1:B] `diverterB::actuator` has the occurrence setting homeAngle = -8 degrees and asset tag QA-DB-02. Its outbound lane is Lane-B. No calibration certificate or accepted calibration status has been supplied for this occurrence.

[B1:jam] The declared operational story has normal sorting, a jam-reported condition, recovery-pending, and resumed-sorting. A jam report identifies the affected diverter and the parcel, and new route dispatches for the station are held while recovery is pending. Resume is expected only after an operator reports the jam condition cleared and warehouseControl supplies a resume authorisation. This story does not specify actuator movements, protective functions, event routing inside the controller, or an executable recovery sequence.

[B1:interfaces] The station endpoint is `sorter.controlLink`; the external endpoint is `warehouseControl.sorterLink`. They are opposite roles of the same station/warehouse exchange: route dispatch and resume authorisation enter the station, while route acknowledgement and jam reports leave it. The interface table specifies exchanged messages; endpoint connectivity alone is not evidence that every exchange occurs.

[B1:limits] Supplier response time, parcel travel time, throughput, timing margins, completed-diversion evidence, and commissioning readiness are not established by these inputs. Physical performance and delivery acceptance remain unassessed.
