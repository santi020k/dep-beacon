use zed_extension_api::{self as zed, LanguageServerId, Result};

const BINARY_NAME: &str = "dep-beacon-lsp";
const PACKAGE_NAME: &str = "@santi020k/zed-dep-beacon";
const SERVER_PATH: &str = "node_modules/@santi020k/zed-dep-beacon/dist/server.cjs";

struct DepBeaconExtension;

impl DepBeaconExtension {
    fn install_language_server(language_server_id: &LanguageServerId) -> Result<()> {
        zed::set_language_server_installation_status(
            language_server_id,
            &zed::LanguageServerInstallationStatus::CheckingForUpdate,
        );

        let latest_version = zed::npm_package_latest_version(PACKAGE_NAME)?;
        let installed_version = zed::npm_package_installed_version(PACKAGE_NAME)?;

        if installed_version.as_deref() != Some(latest_version.as_str()) {
            zed::set_language_server_installation_status(
                language_server_id,
                &zed::LanguageServerInstallationStatus::Downloading,
            );
            zed::npm_install_package(PACKAGE_NAME, &latest_version)?;
        }

        Ok(())
    }
}

impl zed::Extension for DepBeaconExtension {
    fn new() -> Self {
        Self
    }

    fn language_server_command(
        &mut self,
        language_server_id: &LanguageServerId,
        worktree: &zed::Worktree,
    ) -> Result<zed::Command> {
        if let Some(command) = worktree.which(BINARY_NAME) {
            return Ok(zed::Command {
                command,
                args: vec!["--stdio".into()],
                env: Vec::new(),
            });
        }

        Self::install_language_server(language_server_id)?;

        Ok(zed::Command {
            command: zed::node_binary_path()?,
            args: vec![SERVER_PATH.into(), "--stdio".into()],
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
