package org.omg.sysml.lsp;

import java.util.ArrayList;
import java.util.List;

import org.eclipse.lsp4j.Range;

/** Engine-qualified semantic evidence returned by sysml/semanticEvidence. */
public class SemanticEvidenceModel {
    public int schemaVersion = 1;
    public String uri;
    public List<ElementEvidence> elements = new ArrayList<>();
    public List<RelationshipEvidence> relationships = new ArrayList<>();

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
