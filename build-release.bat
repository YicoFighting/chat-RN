@echo off
setlocal

echo ==========================================
echo   ChatMe Android Release Build
echo ==========================================
echo.

REM Step 1: Bump version and commit
echo [1/4] Bumping version...
node scripts\bump-version.js
if %errorlevel% neq 0 (
    echo Version bump failed!
    exit /b 1
)
echo.

REM Step 2: Push version commit
echo [2/4] Pushing version commit...
git push
if %errorlevel% neq 0 (
    echo Git push failed! Continuing with build...
)
echo.

REM Step 3: Prebuild Android
echo [3/4] Running expo prebuild...
call npx expo prebuild --platform android
if %errorlevel% neq 0 (
    echo Prebuild failed!
    exit /b 1
)
echo.

REM Step 4: Build Release APK
echo [4/4] Building Release APK...
call android\gradlew.bat -p android assembleRelease
if %errorlevel% neq 0 (
    echo Build failed!
    exit /b 1
)

echo.
echo ==========================================
echo   BUILD SUCCESSFUL!
echo   APK: android\app\build\outputs\apk\release\
echo ==========================================

endlocal
