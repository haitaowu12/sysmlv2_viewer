package Phase1Sample {
    private import Phase1Library::*;

    part def Vehicle {
        port commandPort : CommandPort;
    }

    part vehicle : Vehicle;
}
