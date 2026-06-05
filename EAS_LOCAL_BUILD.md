# Expo Android 本地打包环境配置指南

> [!WARNING]
> **重要提示**：EAS 官方的本地构建工具（`eas build --local`）不支持 Windows 原生环境（仅支持 macOS、Linux 或 Windows WSL）。
> 如果要在 Windows 上进行本地打包，我们需要使用 Expo 的 **Prebuild + Gradle** 方式直接进行原生编译。

---

## 1. 软件环境要求

### 已安装/已具备的环境
* **Node.js**: `v22.20.0`
* **npm**: `10.9.3`
* **Java JDK**: 已安装 **JDK 17** (存放于 `D:\jdk`)

### 需配置/安装的环境
* **Android Studio & Android SDK**（可安装于 D 盘）
* **环境变量配置** (`JAVA_HOME`, `ANDROID_HOME`, `Path`)

---

## 2. 详细安装与配置步骤（D盘版）

由于 Android SDK 占用空间较大，建议全部安装并配置在 D 盘。

### 第一步：安装 Android Studio 与 SDK
1. 访问 [Android Studio 官网](https://developer.android.com/studio) 下载安装包。
2. **安装 Android Studio 软件**：
   * 将安装路径修改为：`D:\Android\Android Studio`
3. **设置 Android SDK 路径**（在首次启动引导 `Setup Wizard` 中）：
   * 选择 **`Custom`**（自定义）安装类型。
   * 将 `Android SDK Location` 修改为：`D:\Android\Sdk`（若提示 `Required Component Missing`，直接点击 **OK** 忽略）。
   * 完成下载。

---

### 第二步：配置系统环境变量
在 Windows 搜索栏中输入 **“编辑系统环境变量”** 并打开，点击底部的 **“环境变量”**。

#### 1. 新建 `JAVA_HOME`（指向 JDK）
* **变量名**：`JAVA_HOME`
* **变量值**：`D:\jdk` *(注意：末尾不要带 `\bin`)*

#### 2. 新建 `ANDROID_HOME`（指向 SDK）
* **变量名**：`ANDROID_HOME`
* **变量值**：`D:\Android\Sdk`

#### 3. 编辑 `Path` 变量
* 双击系统变量中的 **`Path`**，点击 **“新建”** 添加以下三行：
  ```text
  %JAVA_HOME%\bin
  %ANDROID_HOME%\platform-tools
  %ANDROID_HOME%\emulator
  ```

---

### 第三步：验证环境配置
重新打开一个新的 CMD 或 PowerShell 窗口，运行以下命令验证：
```bash
java -version
adb version
```

---

## 3. Windows 本地打包步骤 (Prebuild + Gradle)

由于 Windows 无法直接运行 `eas build --local`，我们需要直接调用 Android 的编译工具链进行打包：

### 第一步：生成原生 Android 项目结构
在项目根目录下运行以下命令，将 Expo 项目代码生成为原生 Android 项目：
```bash
npx expo prebuild --platform android
```
运行后，你的项目根目录下会出现一个 `android` 文件夹。

### 第二步：使用 Gradle 编译生成 APK

#### 方案 A：编译 Debug 测试包 (无需签名证书，最简单)
适用于快速安装到真机上测试：
```cmd
# 进入安卓目录
cd android
# 编译 Debug APK
.\gradlew.bat assembleDebug
```
* **输出路径**：`android\app\build\outputs\apk\debug\app-debug.apk`

#### 方案 B：编译 Release 正式包 (需配置签名证书)
适用于生产发布或测试正式签名包：
```cmd
cd android
.\gradlew.bat assembleRelease
```
* **输出路径**：`android\app\build\outputs\apk\release\app-release.apk`
* **默认签名**：默认情况下，本项目的 `release` 构建类型暂时指向了调试签名（`signingConfigs.debug`）。如果仅仅是为了本地安装测试，**直接运行上述命令即可直接编译出可运行安装的 APK**，无需额外配置证书。

---

## 4. 签名证书 (Keystore) 获取与配置

如需在本地生成具备正式签名的 Release 发布包，请参考以下配置：

### 第一步：获取 Keystore 证书和密码
你有以下两种方式来获取签名凭证：

#### 方式一：从 Expo EAS 云端下载 (最推荐，保持与线上签名一致)
若项目之前运行过 `eas build` 云端打包，可以联网从 Expo 服务器拉取证书。请运行以下命令并按提示选择：
1. 运行命令：`npx eas credentials`
2. **Select platform**: 选择 `Android`
3. **Which build profile do you want to configure?**: 选择 `production`（或者你使用的打包 Profile）
4. **What do you want to do?**: 选择 `Keystore: Manage everything needed to build your project`
5. **What do you want to do?**: 选择 `Download existing keystore` *(此时文件会被下载到项目根目录下，通常为一个 `.jks` 格式文件)*
6. **Do you want to display the sensitive information of the Android Keystore?**: 输入 **`Y`** 并回车 *(此时终端会显示出明文密码，用于后续配置)*
7. 记录并保存终端打印出的以下几项关键参数：
   * **Key Alias** (别名)
   * **Keystore Password** (证书库密码)
   * **Key Password** (别名密码)

#### 方式二：在本地生成全新 Keystore 证书
在终端直接运行 JDK 的 `keytool` 工具来生成本地新密钥：
```bash
keytool -genkeypair -v -storetype PKCS12 -keystore my-release-key.keystore -alias my-key-alias -keyalg RSA -keysize 2048 -validity 10000
```
根据提示设定密码，生成后当前目录下会产生一个 `my-release-key.keystore` 文件。

### 第二步：配置到 Android 项目中
1. 将下载或生成的 `.keystore` / `.jks` 文件拷贝到项目的 `android/app/` 目录下（重命名为 `my-release-key.keystore`）。
2. 编辑 `android/gradle.properties`，在最底部加上安全密钥变量：
   ```properties
   MYAPP_RELEASE_STORE_FILE=my-release-key.keystore
   MYAPP_RELEASE_KEY_ALIAS=你的别名
   MYAPP_RELEASE_STORE_PASSWORD=你的证书库密码
   MYAPP_RELEASE_KEY_PASSWORD=你的别名密码
   ```
3. 编辑 [android/app/build.gradle](file:///c:/Users/admin/Desktop/chatRN/android/app/build.gradle)：
   * 在 `signingConfigs` 闭包下添加 `release` 配置：
     ```groovy
     signingConfigs {
         debug {
             storeFile file('debug.keystore')
             storePassword 'android'
             keyAlias 'androiddebugkey'
             keyPassword 'android'
         }
         // 添加这一段
         release {
             if (project.hasProperty('MYAPP_RELEASE_STORE_FILE')) {
                 storeFile file(MYAPP_RELEASE_STORE_FILE)
                 storePassword MYAPP_RELEASE_STORE_PASSWORD
                 keyAlias MYAPP_RELEASE_KEY_ALIAS
                 keyPassword MYAPP_RELEASE_KEY_PASSWORD
             }
         }
     }
     ```
   * 在 `buildTypes.release` 中将签名引用修改为刚才添加的 `release`：
     ```groovy
     buildTypes {
         release {
             // 将 signingConfig signingConfigs.debug 改为 release
             signingConfig signingConfigs.release
             ...
         }
     }
     ```

---

## 4. 常见问题与清理

* **清理编译缓存**：如果打包遇到奇怪的报错，可以清理缓存后再试：
  ```cmd
  cd android
  .\gradlew.bat clean
  ```
* **同步代码修改**：在非 `android` 文件夹修改了 JS/TS 代码后，再次打包时，Gradle 会自动打包最新的 JS Bundle。如果修改了 `app.json` 的配置或增删了原生插件，需要重新运行 `npx expo prebuild --clean` 来刷新 `android` 目录。

