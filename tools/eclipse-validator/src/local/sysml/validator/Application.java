package local.sysml.validator;

import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.HashSet;
import java.util.Set;

import com.google.inject.AbstractModule;
import com.google.inject.Guice;
import com.google.inject.Injector;
import com.google.inject.util.Modules;
import org.eclipse.core.resources.IFile;
import org.eclipse.core.resources.IMarker;
import org.eclipse.core.resources.IProject;
import org.eclipse.core.resources.IProjectDescription;
import org.eclipse.core.resources.IResource;
import org.eclipse.core.resources.IncrementalProjectBuilder;
import org.eclipse.core.resources.ResourcesPlugin;
import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.core.runtime.NullProgressMonitor;
import org.eclipse.core.runtime.jobs.Job;
import org.eclipse.equinox.app.IApplication;
import org.eclipse.equinox.app.IApplicationContext;
import org.eclipse.emf.ecore.resource.Resource;
import org.eclipse.emf.ecore.EObject;
import org.eclipse.emf.ecore.EStructuralFeature;
import org.eclipse.xtext.resource.XtextResourceSet;
import org.eclipse.xtext.conversion.IValueConverter;
import org.eclipse.xtext.conversion.IValueConverterService;
import org.eclipse.xtext.conversion.ValueConverter;
import org.eclipse.xtext.nodemodel.INode;
import org.eclipse.xtext.serializer.sequencer.ITransientValueService;
import org.eclipse.xtext.serializer.sequencer.TransientValueService;
import org.omg.kerml.xtext.conversion.KerMLValueConverterService;
import org.omg.sysml.xtext.SysMLStandaloneSetup;
import org.omg.sysml.xtext.SysMLRuntimeModule;

public final class Application implements IApplication {
    private static final String SYSML_METAMODEL_NS_URI =
        "https://www.omg.org/spec/SysML/20250201";

    @Override
    public Object start(IApplicationContext context) throws Exception {
        String[] args = (String[]) context.getArguments().get(IApplicationContext.APPLICATION_ARGS);
        Path roundTripOutput = null;
        String roundTripMode = "stock";
        List<String> projectArgs = new ArrayList<>();
        for (int index = 0; index < args.length; index++) {
            if ("--roundtrip-output".equals(args[index])) {
                if (++index >= args.length) {
                    throw new IllegalArgumentException("--roundtrip-output requires a directory");
                }
                roundTripOutput = Path.of(args[index]).toAbsolutePath().normalize();
            } else if ("--roundtrip-mode".equals(args[index])) {
                if (++index >= args.length) {
                    throw new IllegalArgumentException("--roundtrip-mode requires stock or bridge-filtered");
                }
                roundTripMode = args[index];
                if (!"stock".equals(roundTripMode) && !"bridge-filtered".equals(roundTripMode)) {
                    throw new IllegalArgumentException("--roundtrip-mode must be stock or bridge-filtered");
                }
            } else {
                projectArgs.add(args[index]);
            }
        }
        if (projectArgs.isEmpty()) {
            System.err.println("usage: -application local.sysml.validator.application [--roundtrip-output DIR] [--roundtrip-mode stock|bridge-filtered] PROJECT_DIR [...]");
            return Integer.valueOf(2);
        }
        if (roundTripOutput == null && !"stock".equals(roundTripMode)) {
            throw new IllegalArgumentException("--roundtrip-mode requires --roundtrip-output");
        }

        IProgressMonitor monitor = new NullProgressMonitor();
        List<IProject> projects = new ArrayList<>();
        for (String raw : projectArgs) {
            Path directory = Path.of(raw).toAbsolutePath().normalize();
            Path descriptionPath = directory.resolve(".project");
            if (!Files.isRegularFile(descriptionPath)) {
                throw new IllegalArgumentException("missing .project: " + directory);
            }
            IProjectDescription description = ResourcesPlugin.getWorkspace().loadProjectDescription(
                new org.eclipse.core.runtime.Path(descriptionPath.toString()));
            description.setLocationURI(URI.create(directory.toUri().toString()));
            IProject project = ResourcesPlugin.getWorkspace().getRoot().getProject(description.getName());
            if (!project.exists()) project.create(description, monitor);
            if (!project.isOpen()) project.open(monitor);
            project.refreshLocal(IResource.DEPTH_INFINITE, monitor);
            projects.add(project);
        }

        ResourcesPlugin.getWorkspace().build(IncrementalProjectBuilder.CLEAN_BUILD, monitor);
        Job.getJobManager().join(ResourcesPlugin.FAMILY_AUTO_BUILD, monitor);

        List<IMarker> markers = new ArrayList<>();
        for (IProject project : projects) {
            for (IMarker marker : project.findMarkers(IMarker.PROBLEM, true, IResource.DEPTH_INFINITE)) {
                IResource resource = marker.getResource();
                if (resource instanceof IFile file && "sysml".equalsIgnoreCase(file.getFileExtension())) {
                    markers.add(marker);
                }
            }
        }
        markers.sort(Comparator
            .comparing((IMarker marker) -> marker.getResource().getFullPath().toString())
            .thenComparingInt(marker -> marker.getAttribute(IMarker.LINE_NUMBER, 0))
            .thenComparing(marker -> marker.getAttribute(IMarker.MESSAGE, "")));
        long errors = markers.stream()
            .filter(marker -> marker.getAttribute(IMarker.SEVERITY, 0) == IMarker.SEVERITY_ERROR)
            .count();

        List<String> serialized = new ArrayList<>();
        List<String> roundTripErrors = new ArrayList<>();
        if (errors == 0 && roundTripOutput != null) {
            Files.createDirectories(roundTripOutput);
            Injector injector = "bridge-filtered".equals(roundTripMode)
                ? new FilteredSysMLStandaloneSetup().createInjectorAndDoEMFRegistration()
                : new SysMLStandaloneSetup().createInjectorAndDoEMFRegistration();
            XtextResourceSet resourceSet = injector.getInstance(XtextResourceSet.class);
            IProject modelProject = projects.get(projects.size() - 1);
            for (IResource member : modelProject.members()) {
                serializeSysML(member, modelProject, roundTripOutput, resourceSet, serialized, roundTripErrors);
            }
            serialized.sort(String::compareTo);
            roundTripErrors.sort(String::compareTo);
        }

        System.out.println("{\"schemaVersion\":\"1.0\",\"tool\":\"official_eclipse_validation\",\"markerCount\":"
            + markers.size() + ",\"errorCount\":" + errors + ",\"roundTripOutput\":"
            + (roundTripOutput == null ? "null" : "\"" + escape(roundTripOutput.toString()) + "\"")
            + ",\"roundTripMode\":\"" + escape(roundTripMode) + "\""
            + ",\"serializedResources\":[");
        for (int index = 0; index < serialized.size(); index++) {
            if (index > 0) System.out.print(",");
            System.out.print("\"" + escape(serialized.get(index)) + "\"");
        }
        System.out.print("],\"roundTripErrors\":[");
        for (int index = 0; index < roundTripErrors.size(); index++) {
            if (index > 0) System.out.print(",");
            System.out.print("\"" + escape(roundTripErrors.get(index)) + "\"");
        }
        System.out.println("],\"markers\":[");
        for (int index = 0; index < markers.size(); index++) {
            IMarker marker = markers.get(index);
            if (index > 0) System.out.println(",");
            System.out.print("{\"resource\":\"" + escape(marker.getResource().getFullPath().toString())
                + "\",\"severity\":" + marker.getAttribute(IMarker.SEVERITY, 0)
                + ",\"line\":" + marker.getAttribute(IMarker.LINE_NUMBER, 0)
                + ",\"message\":\"" + escape(marker.getAttribute(IMarker.MESSAGE, "")) + "\"}");
        }
        System.out.println("]}");
        return Integer.valueOf(errors == 0 && roundTripErrors.isEmpty() ? 0 : 1);
    }

    @Override
    public void stop() { }

    private static void serializeSysML(IResource member, IProject project, Path outputRoot,
                                       XtextResourceSet resourceSet, List<String> serialized,
                                       List<String> roundTripErrors) throws Exception {
        if (member instanceof org.eclipse.core.resources.IContainer container) {
            for (IResource child : container.members()) {
                serializeSysML(child, project, outputRoot, resourceSet, serialized, roundTripErrors);
            }
            return;
        }
        if (!(member instanceof IFile file) || !"sysml".equalsIgnoreCase(file.getFileExtension())) return;
        Path source = Path.of(file.getLocationURI()).toAbsolutePath().normalize();
        Resource resource = resourceSet.getResource(
            org.eclipse.emf.common.util.URI.createFileURI(source.toString()), true);
        ByteArrayOutputStream stream = new ByteArrayOutputStream();
        try {
            resource.save(stream, Collections.emptyMap());
        } catch (RuntimeException exception) {
            roundTripErrors.add(file.getProjectRelativePath() + ": " + exception.getMessage());
            return;
        }
        byte[] bytes = stream.toByteArray();
        String textError = TextOutputGuard.validate(bytes);
        if (textError != null) {
            roundTripErrors.add(file.getProjectRelativePath() + ": " + textError);
            return;
        }
        Path relative = Path.of(project.getName()).resolve(file.getProjectRelativePath().toString());
        Path output = outputRoot.resolve(relative);
        Files.createDirectories(output.getParent());
        Files.write(output, bytes);
        serialized.add(relative.toString());
    }

    static boolean isImpliedPortConjugationEndpoint(EObject owner, EStructuralFeature feature) {
        var ownerClass = owner.eClass();
        return "PortConjugation".equals(ownerClass.getName())
            && ownerClass.getEPackage() != null
            && SYSML_METAMODEL_NS_URI.equals(ownerClass.getEPackage().getNsURI())
            && feature.getEContainingClass() == ownerClass
            && feature == ownerClass.getEStructuralFeature("originalPortDefinition");
    }

    private static final class ElementIdTransientValueService extends TransientValueService {
        private boolean isRelationshipEndpoint(EObject owner, EStructuralFeature feature) {
            boolean relationshipOwner = "Relationship".equals(owner.eClass().getName())
                || owner.eClass().getEAllSuperTypes().stream()
                    .anyMatch(type -> "Relationship".equals(type.getName()));
            if (!relationshipOwner) return false;
            if ("source".equals(feature.getName()) || "target".equals(feature.getName())) return true;
            return refinesRelationshipSource(feature, new HashSet<>());
        }

        private boolean refinesRelationshipSource(EStructuralFeature feature, Set<EStructuralFeature> seen) {
            if (!seen.add(feature)) return false;
            for (var annotation : feature.getEAnnotations()) {
                if (!"subsets".equals(annotation.getSource())
                    && !"redefines".equals(annotation.getSource())) continue;
                for (EObject reference : annotation.getReferences()) {
                    if (!(reference instanceof EStructuralFeature referencedFeature)) continue;
                    if ("source".equals(referencedFeature.getName())
                        && referencedFeature.getEContainingClass() != null
                        && "Relationship".equals(referencedFeature.getEContainingClass().getName())) {
                        return true;
                    }
                    if (refinesRelationshipSource(referencedFeature, seen)) return true;
                }
            }
            return false;
        }

        @Override
        public ITransientValueService.ListTransient isListTransient(
            EObject owner, EStructuralFeature feature) {
            if (isRelationshipEndpoint(owner, feature)) {
                return ITransientValueService.ListTransient.YES;
            }
            return super.isListTransient(owner, feature);
        }

        @Override
        public ITransientValueService.ValueTransient isValueTransient(
            EObject owner, EStructuralFeature feature) {
            String ownerType = feature.getEContainingClass() == null
                ? "" : feature.getEContainingClass().getName();
            boolean toolingElementId = "Element".equals(ownerType)
                && "elementId".equals(feature.getName());
            if (toolingElementId || isRelationshipEndpoint(owner, feature)
                || isImpliedPortConjugationEndpoint(owner, feature)) {
                return ITransientValueService.ValueTransient.YES;
            }
            return super.isValueTransient(owner, feature);
        }
    }

    private static final class FilteredSysMLStandaloneSetup extends SysMLStandaloneSetup {
        @Override
        public Injector createInjector() {
            return Guice.createInjector(Modules.override(new SysMLRuntimeModule()).with(
                new AbstractModule() {
                    @Override
                    protected void configure() {
                        bind(ITransientValueService.class).to(ElementIdTransientValueService.class);
                        bind(IValueConverterService.class).to(FilteredValueConverterService.class);
                    }
                }
            ));
        }
    }

    public static final class FilteredValueConverterService extends KerMLValueConverterService {
        private static final IValueConverter<String> REGULAR_COMMENT_CONVERTER = new IValueConverter<>() {
            @Override
            public String toValue(String token, INode node) {
                if (token != null && token.startsWith("/*") && token.endsWith("*/")) {
                    return token.substring(2, token.length() - 2);
                }
                return token;
            }

            @Override
            public String toString(String value) {
                String safe = value == null ? "" : value.replace("*/", "* /");
                return "/*" + safe + "*/";
            }
        };

        @ValueConverter(rule = "REGULAR_COMMENT")
        public IValueConverter<String> regularComment() {
            return REGULAR_COMMENT_CONVERTER;
        }
    }

    private static String escape(String value) {
        return value.replace("\\", "\\\\")
            .replace("\"", "\\\"")
            .replace("\n", "\\n")
            .replace("\r", "\\r");
    }
}
