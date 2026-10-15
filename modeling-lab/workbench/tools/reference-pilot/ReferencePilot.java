import org.omg.sysml.interactive.*;
import org.omg.sysml.lang.sysml.Element;
import org.eclipse.xtext.nodemodel.util.NodeModelUtils;
import com.google.gson.*;
import java.nio.file.*;
import java.util.*;
import java.io.ByteArrayOutputStream;
import net.sourceforge.plantuml.*;

/** Read-only qualification harness over the unmodified official Pilot runtime. */
public class ReferencePilot {
  private static Object referenceValue(Object value) {
    if (value instanceof Element element) {
      var result = new LinkedHashMap<String,Object>();
      result.put("id", element.getElementId());
      result.put("qualifiedName", element.getQualifiedName());
      result.put("name", element.getName());
      result.put("metaclass", element.eClass().getName());
      return result;
    }
    if (value instanceof Collection<?> collection) return collection.stream().map(ReferencePilot::referenceValue).toList();
    if (value instanceof Boolean || value instanceof Number) return value;
    return value == null ? null : value.toString();
  }
  private static Map<String,Object> semantics(Element element) {
    var result = new LinkedHashMap<String,Object>();
    // Read language-engine EMF facts, including derived/inherited values. Never parse labels as semantics.
    var fields = Set.of("owner", "ownedElement", "type", "feature", "ownedFeature", "inheritedFeature",
      "relatedFeature", "connectorEnd", "sourceFeature", "targetFeature", "chainingFeature",
      "referencedFeature", "redefinedFeature", "subsettedFeature", "general", "specific",
      "memberElement", "ownedMemberElement", "direction", "isComposite", "isConjugated", "isAbstract",
      "isEnd", "isOrdered", "isUnique", "isDerived", "isReference", "multiplicity", "bound",
      "value", "valueExpression", "ownedReferenceSubsetting", "ownedRedefinition", "ownedSubsetting",
      "subjectParameter", "objectiveRequirement", "satisfiedRequirement", "satisfyingFeature",
      "verifiedRequirement", "ownedFeatureChaining", "featureTarget", "result", "referent", "operator", "operand",
      "source", "target", "triggerAction", "payloadParameter", "guardExpression", "effectAction",
      "isParallel", "entryAction", "doAction", "exitAction", "performedAction",
      "payloadArgument", "receiverArgument", "senderArgument", "isNegated", "kind", "ownedConstraint", "owningMembership", "documentation", "documentedElement", "body");
    for (var field : element.eClass().getEAllStructuralFeatures()) {
      if (!fields.contains(field.getName())) continue;
      Object value = element.eGet(field);
      if (Set.of("feature", "inheritedFeature").contains(field.getName()) && value instanceof Collection<?> all) {
        var local = all.stream().filter(v -> v instanceof Element e && e.eResource() == element.eResource()).toList();
        result.put(field.getName() + "LibraryExcluded", all.size() - local.size());
        value = local;
      }
      result.put(field.getName(), referenceValue(value));
    }
    return result;
  }

  public static void main(String[] args) throws Exception {
    Path output = Path.of(args[3]);
    Files.createDirectories(output);
    Gson gson = new GsonBuilder().setPrettyPrinting().create();
    var report = new LinkedHashMap<String,Object>();
    report.put("profile", "formal-2.0-reference-candidate");
    report.put("authorityLimit", "Static checks for this input; no full conformance, engineering acceptance, or execution verdict");
    var engine = SysMLInteractive.getInstance();
    engine.loadLibrary(args[0]);
    var result = engine.process(Files.readString(Path.of(args[1])));
    report.put("diagnostics", result.getIssues().stream().map(issue -> {
      var item = new LinkedHashMap<String,Object>();
      item.put("severity", issue.getSeverity().toString());
      item.put("code", issue.getCode());
      item.put("message", issue.getMessage());
      item.put("line", issue.getLineNumber());
      item.put("column", issue.getColumn());
      return item;
    }).toList());
    report.put("staticChecksPassed", !result.hasErrors() && result.getException() == null);
    report.put("execution", "not-evaluated");
    report.put("behaviorFieldsVersion", 1);
    if (result.getException() != null) report.put("exception", result.formatException());
    var elements = new ArrayList<Map<String,Object>>();
    if (engine.getResource() != null) {
      var contents = engine.getResource().getAllContents();
      while(contents.hasNext()) {
        var value = contents.next();
        if (!(value instanceof Element element)) continue;
        var node = NodeModelUtils.getNode(element);
        if (node == null) continue;
        var item = new LinkedHashMap<String,Object>();
        item.put("sessionElementId", element.getElementId());
        item.put("name", element.getName());
        item.put("semantics", semantics(element));
        item.put("qualifiedName", element.getQualifiedName());
        item.put("metaclass", element.eClass().getName());
        item.put("line", node.getStartLine());
        item.put("endLine", node.getEndLine());
        item.put("source", node.getText());
        elements.add(item);
      }
    }
    report.put("elements", elements);
    report.put("identityLimit", "Pilot session identities link these views; cross-reload reconciliation is not claimed");
    var views = new ArrayList<Map<String,Object>>();
    boolean failed = result.hasErrors() || result.getException() != null;
    if (!failed && !args[2].equals("-")) {
      var requests = JsonParser.parseString(Files.readString(Path.of(args[2]))).getAsJsonArray();
      for (var request : requests) {
        var input = request.getAsJsonObject();
        String id = input.get("id").getAsString();
        if (!id.matches("[a-z][a-z0-9-]{0,63}")) throw new IllegalArgumentException("Invalid view ID");
        List<String> names = new ArrayList<>();
        input.getAsJsonArray("names").forEach(name -> names.add(name.getAsString()));
        List<String> styles = new ArrayList<>();
        input.getAsJsonArray("styles").forEach(style -> styles.add(style.getAsString()));
        String mode = input.get("view").getAsString();
        var rendered = engine.viz(names, List.of(mode), styles, List.of());
        var view = new LinkedHashMap<String,Object>();
        view.put("id", id); view.put("targets", names); view.put("view", mode); view.put("styles", styles);
        if (rendered.hasException() || rendered.getSVG() == null) {
          view.put("error", rendered.toString()); failed = true;
        } else {
          Files.writeString(output.resolve(id + "-raw.svg"), rendered.getSVG());
          String svg = rendered.getSVG();
          if (mode.equals("INTERCONNECTION") || mode.equals("STATE")) {
            var codeStyles = new ArrayList<>(styles); codeStyles.add("PUMLCODE");
            String rawCode = engine.viz(names, List.of(mode), codeStyles, List.of()).getPlantUML();
            Files.writeString(output.resolve(id + "-raw.puml"), rawCode);
            String spacedCode = rawCode.replaceAll("(?m)^skinparam (ranksep|nodesep) \\d+", "").replace("@startuml", "@startuml\nskinparam ranksep 180\nskinparam nodesep 60");
            Files.writeString(output.resolve(id + "-layout.puml"), spacedCode);
            var bytes = new ByteArrayOutputStream();
            new SourceStringReader(spacedCode).outputImage(bytes, new FileFormatOption(FileFormat.SVG));
            svg = bytes.toString(java.nio.charset.StandardCharsets.UTF_8);
            view.put("layoutAdjustment", "ranksep 180, nodesep 60; engine-generated model and labels unchanged");
          }
          Files.writeString(output.resolve(id + ".svg"), svg);
          view.put("rawFile", id + "-raw.svg");
          view.put("file", id + ".svg");
          view.put("visualAcceptance", "requires-inspection");
        }
        views.add(view);
      }
    }
    report.put("views", views);
    Files.writeString(output.resolve("report.json"), gson.toJson(report));
    System.exit(failed ? 2 : 0);
  }
}
