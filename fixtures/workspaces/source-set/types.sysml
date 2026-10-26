package SensorLibrary {
    item def Reading;
    port def Readings { out item reading : Reading; }
    part def Sensor { port readings : Readings; }
}
