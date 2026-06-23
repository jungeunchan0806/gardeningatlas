# App Store / Play Store Plan

gardeningatlas is already a PWA through `manifest.webmanifest` and `sw.js`.

## Current URLs

- Mobile UI: https://gardeningatlas.com/mobile
- PC UI: https://gardeningatlas.com/pc
- Privacy policy: https://gardeningatlas.com/privacy.html
- Terms: https://gardeningatlas.com/terms.html
- PWA manifest: https://gardeningatlas.com/manifest.webmanifest

## Play Store

Recommended path:

1. Deploy the web app to an HTTPS domain.
2. Use Bubblewrap / Trusted Web Activity to package the PWA.
3. Add app icons, screenshots, privacy policy URL, and store listing text.
4. Submit through Google Play Console.

Prepared local store assets:

- `store-assets/playstore-icon-512.png`
- `store-assets/phone-mobile-ui.png`
- `store-assets/pc-ui.png`

The app now has a stable HTTPS domain for review: https://gardeningatlas.com.

## App Store

Recommended path:

1. Deploy the web app to an HTTPS domain.
2. Wrap it with Capacitor or a native WebView shell.
3. Add iOS icons, splash screens, permission descriptions, screenshots, and privacy policy.
4. Submit through Apple Developer account.

## Important

Apple often rejects apps that are only a thin website wrapper. For a stronger review, add native value later:

- Push notifications for watering reminders
- Camera/photo upload for garden scan
- Offline saved yard map
- Account and subscription management screens
