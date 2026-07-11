package local.sysml.validator;

import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

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

public final class Application implements IApplication {
    @Override
    public Object start(IApplicationContext context) throws Exception {
        String[] args = (String[]) context.getArguments().get(IApplicationContext.APPLICATION_ARGS);
        if (args.length == 0) {
            System.err.println("usage: -application local.sysml.validator.application PROJECT_DIR [...]");
            return Integer.valueOf(2);
        }

        IProgressMonitor monitor = new NullProgressMonitor();
        List<IProject> projects = new ArrayList<>();
        for (String raw : args) {
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

        System.out.println("{\"schemaVersion\":\"1.0\",\"tool\":\"official_eclipse_validation\",\"markerCount\":"
            + markers.size() + ",\"errorCount\":" + errors + ",\"markers\":[");
        for (int index = 0; index < markers.size(); index++) {
            IMarker marker = markers.get(index);
            if (index > 0) System.out.println(",");
            System.out.print("{\"resource\":\"" + escape(marker.getResource().getFullPath().toString())
                + "\",\"severity\":" + marker.getAttribute(IMarker.SEVERITY, 0)
                + ",\"line\":" + marker.getAttribute(IMarker.LINE_NUMBER, 0)
                + ",\"message\":\"" + escape(marker.getAttribute(IMarker.MESSAGE, "")) + "\"}");
        }
        System.out.println("]}");
        return Integer.valueOf(errors == 0 ? 0 : 1);
    }

    @Override
    public void stop() { }

    private static String escape(String value) {
        return value.replace("\\", "\\\\")
            .replace("\"", "\\\"")
            .replace("\n", "\\n")
            .replace("\r", "\\r");
    }
}
