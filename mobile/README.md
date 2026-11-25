# FITWORX mobile app

This Expo / React Native app is separate from the Vite website and uses the same
Express API and database. It includes member registration and sign-in, membership
pass, QR pass, attendance and payment records, and renewal requests.
Registration collects personal details, gender, a required street/barangay/city
address, and emergency contact, and uses month/day/year birth-date pickers.
After creating an account, members sign in and choose a membership plan from the
Renew tab. The membership becomes active after staff confirms payment. Members
can reset their portal password with a one-time email code; the API requires
working `SMTP_*` settings for this feature.

The API must be updated and restarted/deployed as well as installing a new APK.
An older API may still reject registration without a membership plan.

## Run locally

Use a Node.js release supported by the installed Expo SDK (Node 24 LTS is
recommended; Node 25 is outside its supported engine range).

1. Install the mobile dependencies from the repository root:

   ```bash
   npm ci --prefix mobile
   ```

2. Copy `mobile/.env.example` to `mobile/.env` and set
   `EXPO_PUBLIC_API_URL`:

   ```powershell
   Copy-Item mobile/.env.example mobile/.env
   ```

   - Physical phone: use the computer's IPv4 address, for example
     `http://192.168.1.25:3001/api`. Keep both devices on the same trusted Wi-Fi.
   - Android emulator: use `http://10.0.2.2:3001/api`.
   - Production: use the deployed API's HTTPS URL ending in `/api`.

   Do not use `localhost` on a physical phone; it refers to the phone itself.
   The API must be reachable from the device, and Windows Firewall may need to
   allow Node.js on private networks. Android permits HTTP traffic for local API
   testing; use an HTTPS API URL for production.

3. Start the API and website from the repository root in separate terminals:

   ```bash
   npm run server
   npm run dev
   ```

4. Build a standalone Android APK (requires Android Studio/SDK):

   ```bash
   npm run mobile:apk
   ```

   The APK is written to
   `mobile/android/app/build/outputs/apk/release/app-release.apk` and includes
   the JavaScript bundle, so Metro does not need to be running after install.
   The API URL is embedded at build time from `mobile/.env`.

5. For Android hot-reload development, connect an emulator or USB-connected
   device and run:

   ```bash
   npm run mobile:android
   npm run mobile
   ```

   iOS simulator builds require macOS.

Member requests use `/api/member-portal/*`; the JWT is stored with Expo SecureStore
and sent as a Bearer token. The website's Vite `/api` proxy is not used by the
native app.
