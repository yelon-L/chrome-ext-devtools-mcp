# Chrome 实例区分方案

**问题**: 启动多个调试 Chrome，桌面上不容易区分

---

## 🎨 方案 1: 修改窗口标题（推荐）

### 使用 `--class` 参数

```bash
# 9222 端口 - 测试环境
google-chrome \
  --remote-debugging-port=9222 \
  --user-data-dir=/home/p/chrome-test-9222 \
  --class="Chrome-Debug-9222" \
  --new-window

# 9226 端口 - 开发环境
google-chrome \
  --remote-debugging-port=9226 \
  --user-data-dir=/home/p/chrome-multi-tenant-9226 \
  --class="Chrome-Dev-9226" \
  --new-window
```

**效果**: 任务栏和窗口管理器会显示不同的类名

### 使用 `--app` 模式自定义标题

```bash
# 创建自定义启动页
cat > /tmp/chrome-9222-start.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
  <title>🔧 Chrome Debug 9222</title>
  <style>
    body {
      background: #1e1e1e;
      color: #fff;
      font-family: monospace;
      text-align: center;
      padding: 50px;
    }
    h1 { font-size: 48px; }
  </style>
</head>
<body>
  <h1>🔧 Chrome Debug 9222</h1>
  <p>测试环境</p>
</body>
</html>
EOF

# 启动
google-chrome \
  --remote-debugging-port=9222 \
  --user-data-dir=/home/p/chrome-test-9222 \
  --app="file:///tmp/chrome-9222-start.html"
```

---

## 🌈 方案 2: 使用不同的主题配色

### 为每个实例创建不同的配置

```bash
# 9222 - 深蓝色主题
mkdir -p /home/p/chrome-test-9222/Default
cat > /home/p/chrome-test-9222/Default/Preferences << 'EOF'
{
  "extensions": {
    "theme": {
      "colors": {
        "frame": [0, 48, 96],
        "frame_inactive": [0, 32, 64],
        "toolbar": [0, 64, 128]
      }
    }
  }
}
EOF

# 9226 - 深绿色主题
mkdir -p /home/p/chrome-multi-tenant-9226/Default
cat > /home/p/chrome-multi-tenant-9226/Default/Preferences << 'EOF'
{
  "extensions": {
    "theme": {
      "colors": {
        "frame": [0, 96, 48],
        "frame_inactive": [0, 64, 32],
        "toolbar": [0, 128, 64]
      }
    }
  }
}
EOF
```

**效果**: 不同的 Chrome 实例有不同的窗口颜色

---

## 🖼️ 方案 3: 自定义图标和标签

### 使用包装脚本

```bash
# 创建启动脚本
cat > ~/bin/chrome-debug-9222.sh << 'EOF'
#!/bin/bash
# 🔧 Chrome Debug 9222 - 测试环境

PORT=9222
USER_DATA_DIR="$HOME/chrome-test-9222"
TITLE="🔧 Chrome Debug 9222"

# 设置窗口管理器属性
export CHROME_INSTANCE_NAME="Chrome-9222-Test"

google-chrome \
  --remote-debugging-port=$PORT \
  --user-data-dir="$USER_DATA_DIR" \
  --class="$CHROME_INSTANCE_NAME" \
  --new-window \
  --window-name="$TITLE" \
  "$@"
EOF

cat > ~/bin/chrome-debug-9226.sh << 'EOF'
#!/bin/bash
# 🚀 Chrome Debug 9226 - 开发环境

PORT=9226
USER_DATA_DIR="$HOME/chrome-multi-tenant-9226"
TITLE="🚀 Chrome Debug 9226"

export CHROME_INSTANCE_NAME="Chrome-9226-Dev"

google-chrome \
  --remote-debugging-port=$PORT \
  --user-data-dir="$USER_DATA_DIR" \
  --class="$CHROME_INSTANCE_NAME" \
  --new-window \
  --window-name="$TITLE" \
  "$@"
EOF

chmod +x ~/bin/chrome-debug-*.sh
```

**使用**:
```bash
# 启动测试环境
~/bin/chrome-debug-9222.sh

# 启动开发环境
~/bin/chrome-debug-9226.sh
```

---

## 🏷️ 方案 4: 在首页显示标识

### 创建带标识的默认页面

```bash
# 9222 - 蓝色标识页
cat > /home/p/chrome-test-9222/start-page.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
  <title>🔧 Test Environment (9222)</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .banner {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 10px 20px;
      font-size: 16px;
      font-weight: bold;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 99999;
      box-shadow: 0 2px 10px rgba(0,0,0,0.3);
    }
    .content {
      margin-top: 60px;
      padding: 40px;
      text-align: center;
    }
    .port {
      font-size: 72px;
      font-weight: bold;
      color: #667eea;
      margin: 20px 0;
    }
  </style>
</head>
<body>
  <div class="banner">
    🔧 Chrome Debug - Test Environment - Port 9222
  </div>
  <div class="content">
    <div class="port">9222</div>
    <h1>测试环境</h1>
    <p>用于测试和调试</p>
  </div>
</body>
</html>
EOF

# 9226 - 绿色标识页
cat > /home/p/chrome-multi-tenant-9226/start-page.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
  <title>🚀 Dev Environment (9226)</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .banner {
      background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
      color: white;
      padding: 10px 20px;
      font-size: 16px;
      font-weight: bold;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 99999;
      box-shadow: 0 2px 10px rgba(0,0,0,0.3);
    }
    .content {
      margin-top: 60px;
      padding: 40px;
      text-align: center;
    }
    .port {
      font-size: 72px;
      font-weight: bold;
      color: #11998e;
      margin: 20px 0;
    }
  </style>
</head>
<body>
  <div class="banner">
    🚀 Chrome Debug - Development Environment - Port 9226
  </div>
  <div class="content">
    <div class="port">9226</div>
    <h1>开发环境</h1>
    <p>有扩展: Video SRT Ext MVP</p>
  </div>
</body>
</html>
EOF

# 启动时打开标识页
google-chrome \
  --remote-debugging-port=9222 \
  --user-data-dir=/home/p/chrome-test-9222 \
  "file:///home/p/chrome-test-9222/start-page.html"
```

---

## 🔮 方案 5: 使用 Chrome Profiles（最优雅）

### 创建不同的配置文件

```bash
# 为每个环境创建独立的配置
google-chrome \
  --remote-debugging-port=9222 \
  --user-data-dir=/home/p/chrome-profiles/test-env \
  --profile-directory="Test-9222" \
  --class="Chrome-Test-9222"

google-chrome \
  --remote-debugging-port=9226 \
  --user-data-dir=/home/p/chrome-profiles/dev-env \
  --profile-directory="Dev-9226" \
  --class="Chrome-Dev-9226"
```

**优点**:
- Profile 名称会显示在标题栏
- 可以为每个 Profile 设置不同的图标
- 配置完全隔离

---

## 🎯 推荐组合方案

### 完整的启动脚本（推荐使用）

```bash
#!/bin/bash
# 文件: ~/bin/start-chrome-env.sh

case "$1" in
  test)
    PORT=9222
    USER_DATA_DIR="$HOME/chrome-test-9222"
    PROFILE="Test-Env-9222"
    TITLE="🔧 Chrome Test (9222)"
    START_PAGE="file://$HOME/chrome-test-9222/start-page.html"
    CLASS="Chrome-Test-9222"
    ;;
  dev)
    PORT=9226
    USER_DATA_DIR="$HOME/chrome-multi-tenant-9226"
    PROFILE="Dev-Env-9226"
    TITLE="🚀 Chrome Dev (9226)"
    START_PAGE="file://$HOME/chrome-multi-tenant-9226/start-page.html"
    CLASS="Chrome-Dev-9226"
    ;;
  *)
    echo "Usage: $0 {test|dev}"
    echo "  test - Start test environment (9222)"
    echo "  dev  - Start development environment (9226)"
    exit 1
    ;;
esac

echo "🚀 Starting Chrome: $TITLE"
echo "   Port: $PORT"
echo "   Profile: $PROFILE"
echo ""

mkdir -p "$USER_DATA_DIR"

google-chrome \
  --remote-debugging-port=$PORT \
  --user-data-dir="$USER_DATA_DIR" \
  --profile-directory="$PROFILE" \
  --class="$CLASS" \
  --new-window \
  --autoplay-policy=no-user-gesture-required \
  "$START_PAGE" \
  &

PID=$!
echo "✅ Chrome started with PID: $PID"
echo "   Debug URL: http://localhost:$PORT"
```

**使用方式**:
```bash
# 启动测试环境
~/bin/start-chrome-env.sh test

# 启动开发环境
~/bin/start-chrome-env.sh dev
```

---

## 📊 方案对比

| 方案 | 可见性 | 易用性 | 持久性 | 推荐度 |
|------|--------|--------|--------|--------|
| 修改窗口标题 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| 不同主题配色 | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| 自定义图标 | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| 标识页面 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Chrome Profiles | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

---

## 🔧 实施步骤

### 1. 创建启动脚本

```bash
# 复制上面的完整脚本到文件
vi ~/bin/start-chrome-env.sh

# 添加执行权限
chmod +x ~/bin/start-chrome-env.sh
```

### 2. 创建标识页面

```bash
# 为两个环境创建标识页（使用上面方案 4 的代码）
```

### 3. 添加桌面快捷方式（可选）

```bash
# 测试环境快捷方式
cat > ~/.local/share/applications/chrome-test-9222.desktop << 'EOF'
[Desktop Entry]
Version=1.0
Type=Application
Name=Chrome Test (9222)
Comment=Chrome Debug - Test Environment
Icon=google-chrome
Exec=/home/p/bin/start-chrome-env.sh test
Terminal=false
Categories=Development;
EOF

# 开发环境快捷方式
cat > ~/.local/share/applications/chrome-dev-9226.desktop << 'EOF'
[Desktop Entry]
Version=1.0
Type=Application
Name=Chrome Dev (9226)
Comment=Chrome Debug - Development Environment
Icon=google-chrome
Exec=/home/p/bin/start-chrome-env.sh dev
Terminal=false
Categories=Development;
EOF

# 更新桌面数据库
update-desktop-database ~/.local/share/applications/
```

---

## ✅ 验证

启动后检查：

```bash
# 查看进程
ps aux | grep chrome | grep remote-debugging-port

# 检查窗口类名
wmctrl -l -x | grep Chrome

# 测试连接
curl http://localhost:9222/json/version | jq .Browser
curl http://localhost:9226/json/version | jq .Browser
```

---

## 📝 最佳实践建议

1. **使用启动脚本** - 统一管理所有启动参数
2. **添加标识页面** - 打开浏览器立即知道是哪个环境
3. **设置不同的类名** - 在窗口管理器中易于区分
4. **使用 Profile** - 彻底隔离不同环境的配置
5. **文档化** - 记录每个端口的用途

---

## 🎨 视觉效果示例

完成后，你会看到：

```
任务栏:
├─ 🔧 Chrome Test (9222)   [蓝色标题栏]
└─ 🚀 Chrome Dev (9226)    [绿色标题栏]

浏览器标签:
├─ 🔧 Test Environment (9222) | Start Page
└─ 🚀 Dev Environment (9226) | Start Page
```

---

**文档完成**: 2025-10-16 14:10  
**推荐方案**: 启动脚本 + 标识页面 + Profile

