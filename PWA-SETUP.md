# Progressive Web App (PWA) Setup - StudyCircus

Your StudyCircus website is now configured as a Progressive Web App! Users can install it on their devices.

## What was added:

### 1. **manifest.json**
Contains app metadata including:
- App name, description, and icons
- Display mode (standalone - looks like a native app)
- Theme colors
- App shortcuts
- Categories and screenshots

### 2. **service-worker.js**
Enables offline functionality:
- Caches essential files on first visit
- Serves cached content when offline
- Handles font caching from external CDN
- Automatically updates cache when new versions are available

### 3. **Updated index.html**
Added PWA support features:
- Meta tags for iOS and Android
- Theme color configuration
- App icons and branding
- Manifest file link
- Service worker registration script

## How to Test (Local Development):

### Option 1: Using a Local Server
You must serve the files over HTTP/HTTPS (not `file://`):

```powershell
# Using Python 3
python -m http.server 8000

# Using Node.js http-server
npx http-server

# Using PHP
php -S localhost:8000
```

Then visit: `http://localhost:8000`

### Option 2: Using VS Code Live Server
Install "Live Server" extension and right-click `index.html` → "Open with Live Server"

## Installation on Different Devices:

### **Desktop (Chrome/Edge/Brave)**
1. Visit your website
2. Click the **Install** button in the address bar (+ icon)
3. Click "Install"

### **Android (Chrome)**
1. Visit your website
2. Tap the menu (⋮)
3. Tap "Install app" or "Add to Home screen"

### **iPhone/iPad (iOS)**
1. Open in Safari
2. Tap **Share** button
3. Tap **Add to Home Screen**
4. Tap **Add**

## Features Now Available:

✅ **Installable** - Users can add to home screen  
✅ **Offline Support** - Works without internet  
✅ **App-like Experience** - No browser UI when installed  
✅ **Fast Loading** - Service worker caches files  
✅ **Branded** - Custom splash screen and icons  
✅ **Discoverable** - Google Play Store eligible (with additional setup)  

## Deployment Notes:

For production:
1. **HTTPS Required** - Service workers only work over HTTPS (except localhost)
2. **Domain Setup** - Deploy to a real domain with SSL certificate
3. **Testing** - Use Chrome DevTools > Application > Service Workers to debug
4. **Icons** - Consider replacing SVG icons with actual PNG files (192x192, 512x512)

## Usage Tips:

- Users can uninstall like any app (Settings > Apps)
- App data persists (localStorage is preserved)
- Can work offline but needs internet for external content (like Google Fonts)
- Service worker updates in the background

---

**Your app is now PWA-ready and downloadable!** 🎪
