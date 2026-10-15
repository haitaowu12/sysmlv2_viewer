# Fictional modeling conversation
User: Let's model a cooler, package CoolerStudy. The context has cooler of type Cooler and an external operator of type Operator.
Analyst: What does Cooler own?
User: probe:Probe, controller:Controller, actuator:Actuator. Keep those role/type names.
Analyst: What crosses their interfaces?
User: Probe sends TemperatureReading to Controller, then Controller sends CoolingCommand to Actuator. Name those ports readings and cooling respectively. Their channel types are Temperature and Cooling, with an output item at the sender and the conjugate type at the receiver. Use typed interfaces with directed flows.
Analyst: External commands?
User: Operator outputs EnableCommand through enable, typed by an Enable channel. Cooler receives it through a conjugated enable boundary port. Controller has a conjugated enable port too. The boundary and controller ports are bound to each other. The context interface connects operator.enable to cooler.enable with the directed item flow.
Analyst: Storage and behavior?
User: Controller sampleCapacity is Integer 4. It performs Regulate: start -> acquire -> decide -> issue -> done. Those are abstract actions only.
Analyst: Requirement and verification?
User: capacityRequirement says the cooler controller shall retain at least four samples. Use a Cooler subject and controller.sampleCapacity >= 4. Assert satisfaction by context.cooler. Plan CapacityVerification to verify it. Nothing has been executed or passed.
Analyst: Any timing, protocol, temperature units or failure response?
User: All unspecified. Keep them open. Build and validate the model, show context, decomposition, interconnection, behavior, requirements and verification as different views of the same model. Record this conversation as evidence.
