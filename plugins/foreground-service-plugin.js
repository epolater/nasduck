const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withForegroundServiceType(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const app = manifest.manifest.application[0];
    if (!app.service) app.service = [];

    function ensureService(name, extra = {}) {
      const existing = app.service.find((s) => s.$?.['android:name'] === name);
      if (!existing) {
        app.service.push({ $: { 'android:name': name, 'android:foregroundServiceType': 'dataSync', 'android:exported': 'false', ...extra } });
      } else {
        existing.$['android:foregroundServiceType'] = 'dataSync';
        Object.assign(existing.$, extra);
      }
    }

    // Persistent notification service — keeps the process alive while scanning
    ensureService('com.supersami.foregroundservice.ForegroundService');

    // Headless JS task runner — required for runTask() called inside start()
    // Note: no android:permission here — HeadlessJsTaskService is not a JobService
    ensureService('com.supersami.foregroundservice.ForegroundServiceTask');

    return config;
  });
};
