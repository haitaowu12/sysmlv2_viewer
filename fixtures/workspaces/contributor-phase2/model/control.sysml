package ContributorPhase2 {
    private import ScalarValues::*;
    doc /* Fictional engineering change fixture. No project acceptance or
       physical verification is established by this model. */

    enum def AgreementStatus { draft; proposed; agreed; rejected; }
    item def ControlRequest;
    port def ControlLink { out item request : ControlRequest; }
    port def TelemetryLink;
    part def FieldEquipment;
    part def Operator;

    part system {
        attribute responseTime : ISQ::DurationValue = 120 [SI::milli * SI::s];
        attribute cableLength : ISQ::LengthValue = 2 [SI::m];
        attribute equipmentMass : ISQ::MassValue = 3 [SI::kg];
        attribute historicalObservation : ISQ::DurationValue = 95 [SI::milli * SI::s];
        part fieldA : FieldEquipment;
        part fieldB : FieldEquipment;
        part operator : Operator;
        ref part selectedField : FieldEquipment = fieldA;
        port sender : ControlLink;
        port senderB : ControlLink;
        port receiver : ~ControlLink;
        port receiverB : ~ControlLink;
        port telemetry : TelemetryLink;
        interface controlAgreement connect sender to receiver {
            doc /* ACK-MEANING-01 remains open. An agreement status is a
               recorded disposition, not proof of authenticated approval. */
            attribute agreementStatus : AgreementStatus = AgreementStatus::draft;
            attribute agreementOwner : ScalarValues::String = "Interface working group";
            attribute agreementRationale : ScalarValues::String = "Initial discussion; acknowledgement meaning remains open.";
        }
        state def UnrelatedLifecycle {
            doc /* UNRELATED: Preserve nested statements and comments exactly. */
            entry;
            then idle;
            state idle;
        }
    }
}
