use std::{env, fs};

use zed_extension_api::{self as zed, LanguageServerId, Result};

const PACKAGE_NAME: &str = "@santi020k/dep-beacon-lsp";
const SERVER_PATH: &str = "node_modules/@santi020k/dep-beacon-lsp/dist/server.cjs";

struct DepBeaconExtension;

impl DepBeaconExtension {
    fn server_exists() -> bool {
        fs::metadata(SERVER_PATH).is_ok_and(|metadata| metadata.is_file())
    }

    fn server_script_path(language_server_id: &LanguageServerId) -> Result<String> {
        zed::set_language_server_installation_status(
            language_server_id,
            &zed::LanguageServerInstallationStatus::CheckingForUpdate,
        );

        let latest_version = zed::npm_package_latest_version(PACKAGE_NAME)?;
        let installed_version = zed::npm_package_installed_version(PACKAGE_NAME)?;

        if !Self::server_exists() || installed_version.as_deref() != Some(latest_version.as_str()) {
            zed::set_language_server_installation_status(
                language_server_id,
                &zed::LanguageServerInstallationStatus::Downloading,
            );
            zed::npm_install_package(PACKAGE_NAME, &latest_version)?;
        }

        if !Self::server_exists() {
            return Err(format!(
                "installed package '{PACKAGE_NAME}' did not contain expected path '{SERVER_PATH}'"
            ));
        }

        Ok(env::current_dir()
            .map_err(|error| format!("failed to resolve the extension work directory: {error}"))?
            .join(SERVER_PATH)
            .to_string_lossy()
            .into_owned())
    }
}

impl zed::Extension for DepBeaconExtension {
    fn new() -> Self {
        Self
    }

    fn language_server_command(
        &mut self,
        language_server_id: &LanguageServerId,
        _worktree: &zed::Worktree,
    ) -> Result<zed::Command> {
        let server_path = Self::server_script_path(language_server_id)?;

        Ok(zed::Command {
            command: zed::node_binary_path()?,
            args: vec![server_path, "--stdio".into()],
            env: Vec::new(),
        })
    }

    fn language_server_workspace_configuration(
        &mut self,
        _language_server_id: &LanguageServerId,
        worktree: &zed::Worktree,
    ) -> Result<Option<zed::serde_json::Value>> {
        let settings = zed::settings::LspSettings::for_worktree("dep-beacon", worktree)
            .ok()
            .and_then(|settings| settings.settings)
            .unwrap_or_else(|| zed::serde_json::json!({}));

        Ok(Some(zed::serde_json::json!({ "depBeacon": settings })))
    }
}

zed::register_extension!(DepBeaconExtension);
