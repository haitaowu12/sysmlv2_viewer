package DocumentationOwnership {
    private import ScalarValues::*;
    requirement childOnly {
        attribute detail : Integer { doc /* Child statement only. */ }
    }
    requirement parentAndChild {
        doc /* Parent statement. */
        attribute detail : Integer { doc /* Other child statement. */ }
    }
    requirement empty;
}
