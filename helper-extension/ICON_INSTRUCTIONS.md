# 图标文件说明

需要创建三个图标文件：
- `icon16.png` - 16x16 像素
- `icon48.png` - 48x48 像素  
- `icon128.png` - 128x128 像素

## 图标设计建议

**主题：** Service Worker 激活器

**配色：**
- 主色：蓝色 (#4285F4) - 代表激活
- 辅色：绿色 (#34A853) - 代表成功
- 背景：白色或透明

**图形元素：**
- 齿轮图标（代表 Service Worker）
- 闪电符号（代表激活）
- 或者：播放按钮（代表启动）

## 临时解决方案

如果暂时没有图标，可以使用纯色占位：

### 使用 Canvas 生成（Node.js）

```javascript
const { createCanvas } = require('canvas');
const fs = require('fs');

function createIcon(size, filename) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  
  // 背景
  ctx.fillStyle = '#4285F4';
  ctx.fillRect(0, 0, size, size);
  
  // 闪电符号（简化）
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `${size * 0.6}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('⚡', size / 2, size / 2);
  
  // 保存
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(filename, buffer);
}

createIcon(16, 'icon16.png');
createIcon(48, 'icon48.png');
createIcon(128, 'icon128.png');
```

### 使用在线工具

1. 访问 https://www.favicon-generator.org/
2. 上传一个图片或使用文字
3. 生成并下载 16x16, 48x48, 128x128
4. 重命名为对应文件名
5. 放入 `helper-extension/` 目录

## 或者使用 Emoji

创建一个简单的 HTML 文件生成：

```html
<!DOCTYPE html>
<html>
<head>
  <style>
    canvas { border: 1px solid #ccc; margin: 10px; }
  </style>
</head>
<body>
  <canvas id="icon16" width="16" height="16"></canvas>
  <canvas id="icon48" width="48" height="48"></canvas>
  <canvas id="icon128" width="128" height="128"></canvas>
  
  <script>
    function drawIcon(canvasId, size) {
      const canvas = document.getElementById(canvasId);
      const ctx = canvas.getContext('2d');
      
      // 蓝色背景
      ctx.fillStyle = '#4285F4';
      ctx.fillRect(0, 0, size, size);
      
      // 白色闪电
      ctx.font = `${size * 0.6}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⚡', size / 2, size / 2);
    }
    
    drawIcon('icon16', 16);
    drawIcon('icon48', 48);
    drawIcon('icon128', 128);
    
    // 右键点击图片 -> 保存为 PNG
  </script>
</body>
</html>
```

打开这个 HTML，右键保存三个 canvas 为对应文件名。
