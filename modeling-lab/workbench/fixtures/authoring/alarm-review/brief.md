# Cold-room alarm review: fictional training brief

This is an authored evaluation case, not an operating specification, approved design or field evidence. Source labels below identify statements in this brief.

- BR-1: Model a monitoring system containing Cold Room 0 and Cold Room 1, each using a probe head; a central controller receives their temperature readings. The controller sends an alarm command to an annunciator. These are declared connections/transfers, not evidence that equipment exists or works.
- BR-2: The controller's declared sample capacity is two. The initial retention requirement is at least two samples. A capacity verification case is planned only; no test has run.
- CR-1: For this exercise, revise the requirement to retain at least three samples, keeping the declared capacity of two unchanged. Record this change request as the basis. Do not invent a hardware change or a passing result.
- CR-2: Add a maintenance panel inside Monitoring System. Only its existence is requested. No ports, relationships or performance allocation are supplied.
- CR-3: Add a Review Temperature Alarm scenario with ordered steps: receive alarm, inspect temperature, notify operator. Assign the controller to perform the whole scenario. This does not allocate individual steps or define timing.
- OPEN-1: A note says “acknowledge the alarm before restoring cooling.” The actor, acknowledgement conditions and restoration conditions are unspecified. Keep this unresolved in project notes; do not create a safeguard, timing rule or restoration behavior from it.

Review questions: What changed? Does the declared design meet the new minimum? Which relationships and responsibilities were explicitly modeled? Which decisions and verification evidence remain missing?
