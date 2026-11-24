# PDFMaster Google Sign-In Setup

Google sign-in is implemented with Firebase Authentication. Complete this one-time setup before testing it.

1. Open the Firebase Console and create a Firebase project for PDFMaster.
2. In Project settings, add a Web app and copy its Firebase web configuration.
3. In Authentication > Sign-in method, enable the Google provider and select a support email.
4. In Authentication > Settings > Authorized domains, add:
   - localhost
   - shushilarehiyan-ctrl.github.io
5. Open `firebase-config.js` on the `PDFmaster-UPGRADE` branch and replace the four empty values (`apiKey`, `authDomain`, `projectId`, `appId`) with the matching values from your Firebase web app.
6. Test locally using VS Code Live Server, then test on the GitHub Pages URL after the Upgrade branch is deliberately published.

Notes:
- Firebase web configuration is designed to be present in browser code. Never add a service-account JSON file, private key, password, or verification code to this repository.
- Google sign-in does not upload PDF files. Existing PDF processing remains browser-based.
- The GitHub Pages site currently serves the default `main` branch. This code is only on `PDFmaster-UPGRADE`; do not change the Pages publishing branch unless you intentionally want to publish the upgrade.
