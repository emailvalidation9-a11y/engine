/**
 * Packaged executable entry point.
 * This file is used by pkg to build the standalone .exe.
 * It sets up paths correctly for the packaged environment
 * and then loads the main application.
 *
 * Usage:
 *   EmailValidator.exe              - Start the server
 *   EmailValidator.exe --install    - Add to Windows startup
 *   EmailValidator.exe --uninstall  - Remove from Windows startup
 */
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

// Fix paths for the packaged environment
const exeDir = path.dirname(process.execPath);
const exePath = process.execPath;

// ---- Handle --install / --uninstall flags ----
const args = process.argv.slice(2);

if (args.includes('--install')) {
  // Add to Windows startup via Registry
  try {
    const regKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
    const regName = 'EmailValidator';
    execSync(`reg add "${regKey}" /v "${regName}" /t REG_SZ /d "\\"${exePath}\\"" /f`, { stdio: 'pipe' });
    console.log('');
    console.log('============================================================');
    console.log('  Email Validator added to Windows Startup!');
    console.log('  It will start automatically when you log in.');
    console.log('');
    console.log('  To remove from startup, run:');
    console.log('    EmailValidator.exe --uninstall');
    console.log('============================================================');
    console.log('');
  } catch (err) {
    console.error('Failed to add to startup:', err.message);
  }
  process.exit(0);
}

if (args.includes('--uninstall')) {
  // Remove from Windows startup
  try {
    const regKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
    const regName = 'EmailValidator';
    execSync(`reg delete "${regKey}" /v "${regName}" /f`, { stdio: 'pipe' });
    console.log('');
    console.log('============================================================');
    console.log('  Email Validator removed from Windows Startup.');
    console.log('============================================================');
    console.log('');
  } catch (err) {
    console.error('Failed to remove from startup:', err.message);
  }
  process.exit(0);
}

// ---- Normal startup ----

// Ensure uploads directory exists next to the .exe
const uploadsDir = path.join(exeDir, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Override the working directory so relative paths resolve next to the .exe
process.chdir(exeDir);

console.log('');
console.log('============================================================');
console.log('  Email Validation Engine');
console.log('============================================================');
console.log(`  Executable: ${exePath}`);
console.log(`  Working dir: ${exeDir}`);
console.log(`  Uploads dir: ${uploadsDir}`);
console.log('');

// Load the main application
require('./app');

// Auto-open browser after server starts
setTimeout(() => {
  const PORT = process.env.PORT || 3000;
  const { exec } = require('child_process');
  exec(`start http://localhost:${PORT}`);
}, 2000);
