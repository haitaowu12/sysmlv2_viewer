package org.omg.sysml.lsp;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CompletableFuture;

import org.eclipse.emf.common.util.EList;
import org.eclipse.emf.ecore.EObject;
import org.eclipse.emf.ecore.EReference;
import org.eclipse.emf.ecore.resource.Resource;
import org.eclipse.lsp4j.Position;
import org.eclipse.lsp4j.Range;
import org.eclipse.lsp4j.jsonrpc.services.JsonRequest;
import org.eclipse.xtext.ide.server.ILanguageServerAccess;
import org.eclipse.xtext.nodemodel.INode;
import org.eclipse.xtext.nodemodel.util.NodeModelUtils;
import org.omg.sysml.lang.sysml.Element;

/** Read-only semantic evidence endpoint over the resolved OMG Pilot EMF model. */
public class SemanticEvidenceService {

    private final DiagramLanguageServer languageServer;

    public SemanticEvidenceService(DiagramLanguageServer languageServer) {
        this.languageServer = languageServer;
    }

    @JsonRequest("sysml/semanticEvidence")
    public CompletableFuture<SemanticEvidenceModel> semanticEvidence(DiagramParams params) {
        ILanguageServerAccess access = languageServer.access();
        if (access == null || params == null || params.uri == null) {
            return CompletableFuture.completedFuture(new SemanticEvidenceModel());
        }
        return access.doRead(params.uri, ctx -> build(ctx, params.uri));
    }

    private SemanticEvidenceModel build(ILanguageServerAccess.Context ctx, String uri) {
        SemanticEvidenceModel model = new SemanticEvidenceModel();
        model.uri = uri;
        Resource resource = ctx.getResource();
        if (resource == null) {
            return model;
        }
        String text = ctx.getDocument() == null ? null : ctx.getDocument().getContents();
        List<Element> elements = sourceElements(resource);
        for (Element element : elements) {
            SemanticEvidenceModel.ElementEvidence evidence =
                    new SemanticEvidenceModel.ElementEvidence();
            evidence.engineId = element.getElementId();
            evidence.metaclass = element.eClass().getName();
            evidence.name = element.getName();
            evidence.qualifiedName = element.getQualifiedName();
            evidence.ownerEngineId = owningElementId(element);
            evidence.range = rangeOf(element, text);
            model.elements.add(evidence);
        }

        Set<String> seen = new HashSet<>();
        for (Element source : elements) {
            if (source.getElementId() == null) {
                continue;
            }
            for (EReference reference : source.eClass().getEAllReferences()) {
                if (reference.isContainment() || reference.isContainer() || reference.isDerived()) {
                    continue;
                }
                Object value;
                try {
                    value = source.eGet(reference, true);
                } catch (RuntimeException exception) {
                    continue;
                }
                if (value instanceof EList<?>) {
                    for (Object target : (EList<?>) value) {
                        appendRelationship(model, seen, source, reference, target, text);
                    }
                } else {
                    appendRelationship(model, seen, source, reference, value, text);
                }
            }
        }
        return model;
    }

    private void appendRelationship(
            SemanticEvidenceModel model,
            Set<String> seen,
            Element source,
            EReference reference,
            Object targetValue,
            String text) {
        if (!(targetValue instanceof EObject)) {
            return;
        }
        EObject targetObject = (EObject) targetValue;
        String targetId = null;
        String targetQualifiedName = null;
        if (targetObject instanceof Element) {
            Element target = (Element) targetObject;
            targetId = target.getElementId();
            targetQualifiedName = target.getQualifiedName();
        }
        String targetUri = targetObject.eResource() == null
                ? null
                : targetObject.eResource().getURI().toString();
        boolean resolved = !targetObject.eIsProxy() && targetId != null;
        String key = source.getElementId() + "\0" + reference.getName() + "\0"
                + targetId + "\0" + targetQualifiedName + "\0" + targetUri;
        if (!seen.add(key)) {
            return;
        }
        SemanticEvidenceModel.RelationshipEvidence evidence =
                new SemanticEvidenceModel.RelationshipEvidence();
        evidence.sourceEngineId = source.getElementId();
        evidence.targetEngineId = targetId;
        evidence.targetQualifiedName = targetQualifiedName;
        evidence.targetUri = targetUri;
        evidence.feature = reference.getName();
        evidence.derived = reference.isDerived();
        evidence.resolved = resolved;
        evidence.sourceRange = rangeOf(source, text);
        model.relationships.add(evidence);
    }

    private List<Element> sourceElements(Resource resource) {
        LinkedHashMap<String, Element> result = new LinkedHashMap<>();
        for (EObject root : resource.getContents()) {
            if (root instanceof Element) {
                appendSourceElement(result, (Element) root);
            }
        }
        for (Iterator<EObject> iterator = resource.getAllContents(); iterator.hasNext();) {
            EObject object = iterator.next();
            if (object instanceof Element) {
                appendSourceElement(result, (Element) object);
            }
        }
        return new ArrayList<>(result.values());
    }

    private void appendSourceElement(LinkedHashMap<String, Element> result, Element element) {
        String elementId = element.getElementId();
        if (elementId != null) {
            result.putIfAbsent(elementId, element);
        }
    }

    private String owningElementId(EObject object) {
        for (EObject owner = object.eContainer(); owner != null; owner = owner.eContainer()) {
            if (owner instanceof Element) {
                return ((Element) owner).getElementId();
            }
        }
        return null;
    }

    private Range rangeOf(EObject object, String text) {
        if (object == null || text == null) {
            return null;
        }
        INode node = NodeModelUtils.findActualNodeFor(object);
        if (node == null) {
            return null;
        }
        return new Range(
                offsetToPosition(text, node.getOffset()),
                offsetToPosition(text, node.getEndOffset()));
    }

    private Position offsetToPosition(String text, int offset) {
        int line = 0;
        int column = 0;
        int end = Math.min(offset, text.length());
        for (int index = 0; index < end; index++) {
            if (text.charAt(index) == '\n') {
                line++;
                column = 0;
            } else {
                column++;
            }
        }
        return new Position(line, column);
    }
}
