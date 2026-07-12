package local.sysml.validator;

import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;

final class TextOutputGuard {
    private TextOutputGuard() { }

    static String validate(byte[] bytes) {
        if (bytes.length >= 4
            && (bytes[0] & 0xff) == 0x89 && bytes[1] == 'e' && bytes[2] == 'm' && bytes[3] == 'f') {
            return "serializer produced EMF binary instead of SysML text";
        }
        for (byte value : bytes) {
            if (value == 0) return "serializer produced NUL-containing non-text output";
        }
        try {
            StandardCharsets.UTF_8.newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT)
                .decode(ByteBuffer.wrap(bytes));
        } catch (CharacterCodingException exception) {
            return "serializer produced non-UTF-8 output";
        }
        return null;
    }
}
