use std::{env, fs};

use zed_extension_api::{self as zed, LanguageServerId, Result};

const PACKAGE_NAME: &str = "@santi020k/dep-beacon-lsp";
const SERVER_PATH: &str = "node_modules/@santi020k/dep-beacon-lsp/dist/server.cjs";

struct DepBeaconExtension;

impl DepBeaconExtension {
    fn configured_command(settings: zed::settings::CommandSettings) -> Option<zed::Command> {
        let path = settings.path.filter(|path| !path.trim().is_empty())?;

        Some(zed::Command {
            command: path,
            args: settings.arguments.unwrap_or_else(|| vec!["--stdio".into()]),
            env: settings.env.unwrap_or_default().into_iter().collect(),
        })
    }

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
        worktree: &zed::Worktree,
    ) -> Result<zed::Command> {
        let binary = zed::settings::LspSettings::for_worktree("dep-beacon", worktree)
            .ok()
            .and_then(|settings| settings.binary);

        if let Some(command) = binary.and_then(Self::configured_command) {
            return Ok(command);
        }

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

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn configured_binary_preserves_arguments_and_environment() {
        let command = DepBeaconExtension::configured_command(zed::settings::CommandSettings {
            path: Some("/usr/bin/node".into()),
            arguments: Some(vec!["/tmp/server.cjs".into(), "--stdio".into()]),
            env: Some(HashMap::from([("TEST_MODE".into(), "true".into())])),
        })
        .expect("configured binary should create a command");

        assert_eq!(command.command, "/usr/bin/node");
        assert_eq!(command.args, vec!["/tmp/server.cjs", "--stdio"]);
        assert_eq!(command.env, vec![("TEST_MODE".into(), "true".into())]);
    }

    #[test]
    fn configured_binary_defaults_to_stdio_and_ignores_empty_paths() {
        let command = DepBeaconExtension::configured_command(zed::settings::CommandSettings {
            path: Some("/tmp/dep-beacon-lsp".into()),
            arguments: None,
            env: None,
        })
        .expect("configured binary should create a command");

        assert_eq!(command.args, vec!["--stdio"]);
        assert!(command.env.is_empty());

        for path in [None, Some(" ".into())] {
            assert!(
                DepBeaconExtension::configured_command(zed::settings::CommandSettings {
                    path,
                    arguments: None,
                    env: None,
                })
                .is_none()
            );
        }
    }
}
