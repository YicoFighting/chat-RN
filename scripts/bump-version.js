const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const appJsonPath = path.join(__dirname, "..", "app.json");
const packageJsonPath = path.join(__dirname, "..", "package.json");
const buildGradlePath = path.join(
  __dirname,
  "..",
  "android",
  "app",
  "build.gradle",
);

// Read current version from app.json
const appJson = JSON.parse(fs.readFileSync(appJsonPath, "utf8"));
const currentVersion = appJson.expo.version;
const [major, minor, patch] = currentVersion.split(".").map(Number);

// Bump version: patch max 9, minor max 9, roll over at 10
let newMajor = major;
let newMinor = minor;
let newPatch = patch + 1;

if (newPatch > 9) {
  newPatch = 0;
  newMinor += 1;
}
if (newMinor > 9) {
  newMinor = 0;
  newMajor += 1;
}

const newVersion = `${newMajor}.${newMinor}.${newPatch}`;

// Update app.json
appJson.expo.version = newVersion;
fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + "\n", "utf8");
console.log(`app.json: ${currentVersion} -> ${newVersion}`);

// Update package.json
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
packageJson.version = newVersion;
fs.writeFileSync(
  packageJsonPath,
  JSON.stringify(packageJson, null, 2) + "\n",
  "utf8",
);
console.log(`package.json: ${currentVersion} -> ${newVersion}`);

// Update android/app/build.gradle (if exists)
if (fs.existsSync(buildGradlePath)) {
  let gradleContent = fs.readFileSync(buildGradlePath, "utf8");

  // versionCode = major * 100 + minor * 10 + patch
  const newVersionCode = newMajor * 100 + newMinor * 10 + newPatch;
  gradleContent = gradleContent.replace(
    /versionCode \d+/,
    `versionCode ${newVersionCode}`,
  );
  gradleContent = gradleContent.replace(
    /versionName "[^"]+"/,
    `versionName "${newVersion}"`,
  );

  fs.writeFileSync(buildGradlePath, gradleContent, "utf8");
  console.log(
    `build.gradle: versionCode=${newVersionCode}, versionName="${newVersion}"`,
  );
} else {
  console.log(
    "build.gradle not found (run prebuild first), skipping gradle update",
  );
}

// Git commit
try {
  execSync("git add app.json package.json", { stdio: "ignore" });

  // Also stage build.gradle if it exists and is tracked
  try {
    execSync("git add android/app/build.gradle", { stdio: "ignore" });
  } catch {
    // build.gradle might not be tracked
  }

  const commitMsg = `chore: bump version to ${newVersion}`;
  execSync(`git commit -m "${commitMsg}"`, { stdio: "ignore" });
  console.log(`Committed: "${commitMsg}"`);
} catch (e) {
  console.log("Git commit skipped (no changes or git not available)");
}
