# Fictional intake dialogue — D1

## Initial intake

[D1:01] Operations lead: The required outcome is that an identified parcel reaches its assigned outbound lane. When I say the route is acknowledged, I mean the parcel has actually been diverted. I expect acknowledgement within the interface timing bound.

[D1:02] Controls engineer: Our use of acknowledgement is that the supervisor has accepted the dispatch message. Completion of the physical diversion is later, and we have not supplied a measured bound for that. The ICD does not define the acknowledgement milestone clearly enough to settle the disagreement.

[D1:03] Interface coordinator: Use PS-ICD R1 for the initial study. The current bound is 120 ms from station receipt of RouteDispatch. Do not assume which of the two milestones it constrains. I can confirm the bound and endpoints, but I cannot approve the disputed meaning on behalf of both teams.

[D1:04] Maintenance representative: For the review, select the actuator inside diverterB. Its asset tag is QA-DB-02 and its home angle is minus eight degrees. The actuator inside diverterA has a different home setting even though the supplier definition is shared. I have not supplied installation or calibration evidence.

## One clarification response — deliver only after the acknowledgement question

[D1:C1] Interface coordinator: I asked both teams. Operations still means completed physical diversion and Controls still means accepted message. Neither team has authorised changing the other meaning. Please keep ACK-MEANING-01 open, show both interpretations and identify the owner decision needed. A valid syntax check or the old mock-link observation will not answer the question.

[D1:C2] Operations lead: The jam/recovery story in the brief is our intended operating outcome. The supplied story and planned check do not demonstrate recovery, completed diversion or permission to commission equipment. No physical-component allocation decision has been made in this clarification.
