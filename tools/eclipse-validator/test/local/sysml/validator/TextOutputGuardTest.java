package local.sysml.validator;

import java.nio.charset.StandardCharsets;

public final class TextOutputGuardTest {
    public static void main(String[] args) {
        expect(null, TextOutputGuard.validate("package Test;\n".getBytes(StandardCharsets.UTF_8)));
        expect("serializer produced EMF binary instead of SysML text",
            TextOutputGuard.validate(new byte[] {(byte) 0x89, 'e', 'm', 'f', 0x01}));
        expect("serializer produced NUL-containing non-text output",
            TextOutputGuard.validate(new byte[] {'p', 0, 'q'}));
        expect("serializer produced non-UTF-8 output",
            TextOutputGuard.validate(new byte[] {(byte) 0xc3, 0x28}));
        System.out.println("PASS: Eclipse serializer text-output guards");
    }

    private static void expect(String expected, String actual) {
        if (expected == null ? actual != null : !expected.equals(actual)) {
            throw new AssertionError("expected=" + expected + " actual=" + actual);
        }
    }
}
