package CapacityMembership {
    private import ScalarValues::*;
    part def System { attribute count : Integer = 2; }
    requirement required { subject system : System; require constraint { system.count >= 3 } }
    requirement assumed { subject system : System; assume constraint { system.count >= 3 } }
}
