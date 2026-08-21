#!/usr/bin/env bash
set -e

SDK="D:/mkeapp/android-sdk"
BT="$SDK/build-tools/34.0.0"
PLAT="$SDK/platforms/android-34/android.jar"
JAVA_HOME="D:/mkeapp/jdk/jdk-17.0.20+8"
JAVAC="$JAVA_HOME/bin/javac.exe"
KEYTOOL="$JAVA_HOME/bin/keytool.exe"
JAVA="$JAVA_HOME/bin/java.exe"
NODE="/c/Users/DELL/.workbuddy/binaries/node/versions/22.22.2/node.exe"

ROOT="D:/mkeapp/tetris-game"
APP="$ROOT/apk-build/app"
SRC="$ROOT/public"
OUT="$ROOT/apk-build/out"

echo "== 复制前端资源到 assets =="
# 沙箱可能拦截 rm，删除失败不影响构建：cp -r 会覆盖刷新已有文件并新增文件
rm -rf "$APP/assets" 2>/dev/null || true
mkdir -p "$APP/assets"
cp -r "$SRC/." "$APP/assets/"

echo "== 剥离 PWA 相关（WebView 用不到）=="
"$NODE" "$ROOT/apk-build/transform.js"

echo "== 清理输出目录 =="
rm -rf "$OUT" 2>/dev/null || true
mkdir -p "$OUT/compiled" "$OUT/obj" "$OUT/dex" "$OUT/gen"

echo "== 1. aapt2 编译资源 =="
"$BT/aapt2.exe" compile -o "$OUT/compiled" --dir "$APP/res"

echo "== 2. aapt2 链接资源 + 生成 R.java =="
"$BT/aapt2.exe" link -o "$OUT/base.apk" -I "$PLAT" \
  --manifest "$APP/AndroidManifest.xml" \
  -R "$OUT/compiled/"*.flat \
  --java "$OUT/gen"

echo "== 3. javac 编译 Java =="
"$JAVAC" -encoding UTF-8 -cp "$PLAT" -d "$OUT/obj" \
  "$APP/src/com/hwyw/tetris/MainActivity.java" \
  "$OUT/gen/com/hwyw/tetris/R.java"

echo "== 4. d8 生成 classes.dex =="
CLASSES=$(find "$OUT/obj" -name '*.class')
"$JAVA" -cp "$BT/lib/d8.jar" com.android.tools.r8.D8 --lib "$PLAT" --output "$OUT/dex" $CLASSES

echo "== 5. 注入 classes.dex 与 assets =="
cp "$OUT/dex/classes.dex" "$OUT/classes.dex"
"$JAVA_HOME/bin/jar.exe" u0f "$OUT/base.apk" -C "$OUT" classes.dex
"$JAVA_HOME/bin/jar.exe" uf "$OUT/base.apk" -C "$APP" assets

echo "== 6. zipalign 对齐 =="
"$BT/zipalign.exe" -p 4 "$OUT/base.apk" "$OUT/aligned.apk"

echo "== 7. 生成签名密钥库 =="
if [ ! -f "$OUT/keystore.jks" ]; then
  "$KEYTOOL" -genkeypair -v \
    -keystore "$OUT/keystore.jks" -keyalg RSA -keysize 2048 -validity 10000 \
    -alias hwywtetris -storepass android -keypass android \
    -dname "CN=HWYW,O=HWYW,C=CN"
fi

echo "== 8. apksigner 签名 =="
"$JAVA" -jar "$BT/lib/apksigner.jar" sign \
  --ks "$OUT/keystore.jks" --ks-pass pass:android --key-pass pass:android \
  --out "$OUT/tetris-hwyw.apk" "$OUT/aligned.apk"

echo "== 构建完成 =="
ls -la "$OUT/tetris-hwyw.apk"

# 复制 APK 到 public 供扫码下载
cp "$OUT/tetris-hwyw.apk" "$SRC/tetris-hwyw.apk"
echo "== 已复制 APK 到 public/tetris-hwyw.apk =="
