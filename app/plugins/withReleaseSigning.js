// Signs release builds with the embassy's own keystore (credentials from env vars / gradle props),
// so every future APK installs as an update over the previous one.
const { withAppBuildGradle } = require('@expo/config-plugins');

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let g = cfg.modResults.contents;
    if (g.includes('QE_UPLOAD_STORE_FILE')) return cfg;
    g = g.replace(
      /signingConfigs \{\n(\s*)debug \{/,
      `signingConfigs {
        release {
            if (project.hasProperty('QE_UPLOAD_STORE_FILE')) {
                storeFile file(QE_UPLOAD_STORE_FILE)
                storePassword QE_UPLOAD_STORE_PASSWORD
                keyAlias QE_UPLOAD_KEY_ALIAS
                keyPassword QE_UPLOAD_KEY_PASSWORD
            }
        }
$1debug {`
    );
    g = g.replace(
      /(release \{\n[^}]*?)signingConfig signingConfigs\.debug/,
      `$1signingConfig project.hasProperty('QE_UPLOAD_STORE_FILE') ? signingConfigs.release : signingConfigs.debug`
    );
    cfg.modResults.contents = g;
    return cfg;
  });
};
