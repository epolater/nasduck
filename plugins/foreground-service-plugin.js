const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withForegroundServiceType(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const app = manifest.manifest.application[0];
    if (!app.service) app.service = [];

    const existing = app.service.find(
      (s) => s.$?.['android:name']?.includes('ForegroundService')
    );
    if (!existing) {
      app.service.push({
        $: {
          'android:name': 'com.supersami.foregroundservice.ForegroundService',
          'android:foregroundServiceType': 'dataSync',
          'android:exported': 'false',
        },
      });
    } else {
      existing.$['android:foregroundServiceType'] = 'dataSync';
    }
    return config;
  });
};
