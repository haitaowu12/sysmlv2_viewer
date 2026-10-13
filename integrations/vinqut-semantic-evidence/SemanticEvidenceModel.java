package org.omg.sysml.lsp;

import java.util.ArrayList;
import java.util.List;

import org.eclipse.lsp4j.Range;

/** Engine-qualified semantic evidence returned by sysml/semanticEvidence. */
public class SemanticEvidenceModel {
    public int schemaVersion = 1;
    public String uri;
    /** The Xtext document version read with the semantic resource. */
    public Integer documentVersion;
    /** SHA-256 of the exact UTF-8 text returned by the same Xtext document. */
    public String documentSha256;
    /** True only after CheckMode.ALL validation completed in the same read. */
    public boolean diagnosticsComplete;
    /** Non-null when authoritative validation could not complete. */
    public String diagnosticsError;
    /** Fresh diagnostics produced by the authoritative Xtext validator. */
    public List<DiagnosticEvidence> diagnostics = new ArrayList<>();
    public List<ElementEvidence> elements = new ArrayList<>();
    public List<RelationshipEvidence> relationships = new ArrayList<>();

    public static class DiagnosticEvidence {
        public String uri;
        public String severity;
        public String code;
        public String message;
        public Range range;
    }

    public static class ElementEvidence {
        public String engineId;
        public String metaclass;
        public String name;
        public String qualifiedName;
        public String ownerEngineId;
        public Range range;
    }

    public static class RelationshipEvidence {
        public String sourceEngineId;
        public String targetEngineId;
        public String targetQualifiedName;
        public String targetUri;
        public String feature;
        public boolean derived;
        public boolean resolved;
        public Range sourceRange;
    }
}
