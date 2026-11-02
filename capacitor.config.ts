import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.studyspace',
  appName: 'Study Space',
  webDir: 'dist',
  // Dark behind the WebView, so a cold start or a redraw never shows a white or black flash
  // that does not match the theme. The page itself paints its own background at once.
  backgroundColor: '#0B0D12',
  android: {
    backgroundColor: '#0B0D12',
  },
  // The launch screen and system bars are dark in android/app/src/main/res/values/styles.xml.
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_timer',
      iconColor: '#F5A35C',
    },
  },
};

export default config;
