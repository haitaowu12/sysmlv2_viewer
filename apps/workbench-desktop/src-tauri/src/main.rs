use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;
use tauri::path::BaseDirectory;
use tauri::{Manager, State};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};

const READY_TIMEOUT: Duration = Duration::from_secs(120);

#[derive(Default)]
struct ServiceProcess(Mutex<Option<CommandChild>>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopBootstrap {
    service_origin: String,
    pairing_code: String,
    pairing_expires_at: String,
    workspace_file: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReadyEvent {
    event: String,
    address: String,
    port: u16,
    pairing_code: String,
    pairing_expires_at: String,
}

#[tauri::command]
async fn start_desktop_service(
    app: tauri::AppHandle,
    state: State<'_, ServiceProcess>,
    workspace_file: String,
) -> Result<DesktopBootstrap, String> {
    let workspace_file = validate_workspace_file(&workspace_file)?;
    let workspace_root = workspace_file
        .parent()
        .ok_or_else(|| "Workspace file has no parent directory".to_string())?
        .to_path_buf();

    stop_service(&state)?;

    let resource_root = app
        .path()
        .resolve(".", BaseDirectory::Resource)
        .map_err(|error| format!("Cannot resolve desktop resources: {error}"))?;
    let bundle_root = resource_root.join("workbench");
    let service_entry = bundle_root.join("service/apps/workbench-service/src/main.js");
    let verifier = bundle_root.join("bin/verify-bundle.mjs");
    let semantic_artifact = bundle_root.join("runtime/semantic/sysmlv2-lsp-server.jar");
    let authoring_artifact = find_authoring_artifact(&bundle_root)?;
    let library_root = bundle_root.join("runtime/libraries/sysml.library");
    let java_command = resource_root.join("runtime/java/bin/java");
    for required in [
        &service_entry,
        &verifier,
        &semantic_artifact,
        &authoring_artifact,
        &java_command,
    ] {
        require_regular_file(required)?;
    }

    let verify_output = app
        .shell()
        .sidecar("workbench-node")
        .map_err(|error| format!("Cannot resolve bundled Node runtime: {error}"))?
        .arg(&verifier)
        .current_dir(&bundle_root)
        .output()
        .await
        .map_err(|error| format!("Bundle integrity verification failed: {error}"))?;
    if !verify_output.status.success() {
        return Err(format!(
            "Bundle integrity verification failed: {}",
            String::from_utf8_lossy(&verify_output.stderr).trim()
        ));
    }

    let semantic_arguments =
        serde_json::to_string(&vec!["-jar".to_string(), path_text(&semantic_artifact)?])
            .map_err(|error| format!("Cannot encode semantic runtime arguments: {error}"))?;
    let authoring_arguments = serde_json::to_string(&vec![
        "lsp".to_string(),
        "--stdlib-path".to_string(),
        path_text(&library_root)?,
    ])
    .map_err(|error| format!("Cannot encode authoring runtime arguments: {error}"))?;

    let service_command = app
        .shell()
        .sidecar("workbench-node")
        .map_err(|error| format!("Cannot resolve bundled Node runtime: {error}"))?
        .args([
            path_text(&service_entry)?,
            "--loopback".to_string(),
            "--qualified-runtime".to_string(),
            "--workspace-root".to_string(),
            path_text(&workspace_root)?,
            "--address".to_string(),
            "127.0.0.1".to_string(),
            "--port".to_string(),
            "0".to_string(),
            "--origin".to_string(),
            "tauri://localhost".to_string(),
            "--origin".to_string(),
            "http://tauri.localhost".to_string(),
            "--candidate-manifest".to_string(),
            path_text(&bundle_root.join("config/language-engine-candidates.json"))?,
            "--runtime-lock".to_string(),
            path_text(&bundle_root.join("config/language-engine-runtime-lock.json"))?,
        ])
        .env("SYSML_WORKBENCH_SEMANTIC_ARTIFACT", &semantic_artifact)
        .env("SYSML_WORKBENCH_AUTHORING_ARTIFACT", &authoring_artifact)
        .env("SYSML_WORKBENCH_VINQUT_COMMAND", &java_command)
        .env("SYSML_WORKBENCH_VINQUT_ARGUMENTS_JSON", semantic_arguments)
        .env("SYSML_WORKBENCH_SPEC42_COMMAND", &authoring_artifact)
        .env("SYSML_WORKBENCH_SPEC42_ARGUMENTS_JSON", authoring_arguments)
        .current_dir(&bundle_root);

    let (mut events, child) = service_command
        .spawn()
        .map_err(|error| format!("Cannot start Workbench Service: {error}"))?;
    let ready = tokio::time::timeout(READY_TIMEOUT, async {
        while let Some(event) = events.recv().await {
            match event {
                CommandEvent::Stderr(bytes) => {
                    for line in String::from_utf8_lossy(&bytes).lines() {
                        if let Ok(event) = serde_json::from_str::<ReadyEvent>(line) {
                            if event.event == "workbench-service-ready" {
                                return Ok(event);
                            }
                        }
                    }
                }
                CommandEvent::Error(message) => {
                    return Err(format!("Workbench Service failed: {message}"));
                }
                CommandEvent::Terminated(payload) => {
                    return Err(format!(
                        "Workbench Service exited before readiness: {:?}",
                        payload.code
                    ));
                }
                _ => {}
            }
        }
        Err("Workbench Service event channel closed before readiness".to_string())
    })
    .await
    .map_err(|_| "Workbench Service readiness timed out".to_string())??;

    tauri::async_runtime::spawn(async move { while events.recv().await.is_some() {} });
    *state
        .0
        .lock()
        .map_err(|_| "Workbench Service state lock is poisoned".to_string())? = Some(child);

    Ok(DesktopBootstrap {
        service_origin: format!("http://{}:{}", ready.address, ready.port),
        pairing_code: ready.pairing_code,
        pairing_expires_at: ready.pairing_expires_at,
        workspace_file: path_text(&workspace_file)?,
    })
}

#[tauri::command]
fn stop_desktop_service(state: State<'_, ServiceProcess>) -> Result<(), String> {
    stop_service(&state)
}

fn stop_service(state: &State<'_, ServiceProcess>) -> Result<(), String> {
    if let Some(child) = state
        .0
        .lock()
        .map_err(|_| "Workbench Service state lock is poisoned".to_string())?
        .take()
    {
        child
            .kill()
            .map_err(|error| format!("Cannot stop Workbench Service: {error}"))?;
    }
    Ok(())
}

fn validate_workspace_file(value: &str) -> Result<PathBuf, String> {
    let path = Path::new(value)
        .canonicalize()
        .map_err(|error| format!("Cannot resolve workspace file: {error}"))?;
    require_regular_file(&path)?;
    if path.file_name().and_then(|name| name.to_str()) != Some("sysml-workspace.yaml") {
        return Err("Select a sysml-workspace.yaml file".to_string());
    }
    Ok(path)
}

fn find_authoring_artifact(bundle_root: &Path) -> Result<PathBuf, String> {
    let root = bundle_root.join("runtime/authoring");
    let mut candidates = std::fs::read_dir(&root)
        .map_err(|error| format!("Cannot read authoring runtime: {error}"))?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.is_file())
        .collect::<Vec<_>>();
    candidates.sort();
    if candidates.len() != 1 {
        return Err(format!(
            "Expected one authoring runtime, found {}",
            candidates.len()
        ));
    }
    Ok(candidates.remove(0))
}

fn require_regular_file(path: &Path) -> Result<(), String> {
    let metadata = path
        .symlink_metadata()
        .map_err(|error| format!("Required runtime file is unavailable: {error}"))?;
    if !metadata.file_type().is_file() || metadata.file_type().is_symlink() {
        return Err(format!(
            "Required runtime path is not a regular file: {}",
            path.display()
        ));
    }
    Ok(())
}

fn path_text(path: &Path) -> Result<String, String> {
    path.to_str()
        .map(str::to_owned)
        .ok_or_else(|| format!("Runtime path is not valid UTF-8: {}", path.display()))
}

fn main() {
    let application = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(ServiceProcess::default())
        .invoke_handler(tauri::generate_handler![
            start_desktop_service,
            stop_desktop_service
        ])
        .build(tauri::generate_context!())
        .expect("failed to build SysML Engineering Workbench");
    application.run(|app_handle, event| {
        if matches!(
            event,
            tauri::RunEvent::Exit | tauri::RunEvent::ExitRequested { .. }
        ) {
            let state = app_handle.state::<ServiceProcess>();
            let _ = stop_service(&state);
        }
    });
}
