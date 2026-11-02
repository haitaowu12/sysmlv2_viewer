package CommunityCounterexamples {
    private import ScalarValues::*;
    part def MyComponent;
    attribute def Region;
    enum def ConditionColor { red; green; yellow; }
    attribute color : ConditionColor = ConditionColor::green;
    attribute count : Integer = 3;
    part components : MyComponent[count];
    part def Container { attribute name; }
}
