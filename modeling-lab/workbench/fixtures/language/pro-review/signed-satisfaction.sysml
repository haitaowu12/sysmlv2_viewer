package SignedSatisfaction {
    part def System;
    part system : System;
    requirement obligation { subject system : System; }
    satisfy obligation by system;
    not satisfy obligation by system;
}
