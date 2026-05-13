# Poker RNG for Mac

类似 Windows 上 Jurojin 的 Poker 随机数生成器，专为 Mac 用户打造。

## 功能特性

### 核心功能
- **随机数生成**: 使用密码学安全随机数（crypto.randomBytes），确保真正随机
- **可调范围**: 默认 1-100，支持自定义范围
- **悬浮窗模式**: Always-on-Top，可在打牌时始终显示在最前
- **GTO 决策助手**: 输入频率阈值，自动判断执行 Action A 还是 Action B
- **历史记录**: 保留最近 50 次结果，含统计数据（均值/最小/最大/次数）

### 快捷键
| 快捷键 | 功能 |
|--------|------|
| `⌘+Shift+R` | 生成随机数（全局热键，任何应用中都可触发） |
| `⌘+Shift+H` | 显示/隐藏窗口 |
| `Space` / `Enter` | 在窗口内快速 Roll |
| 双击数字区域 | 快速 Roll |

### 界面功能
- 🎯 可视化进度条显示当前数字在范围中的位置
- 📌 窗口置顶开关（绿色圆点）
- 🔲 透明度调节，不遮挡扑克桌面
- 📊 滚动动画效果
- 🖥️ 跨所有桌面/全屏空间可见

### GTO 辅助说明
Solver 建议以某个频率执行某个动作时（如 70% call, 30% fold），设置 GTO Decision Helper 的频率为 70：
- RNG ≤ 70 → 执行 Action A (Call)
- RNG > 70 → 执行 Action B (Fold)

## 快速启动

```bash
cd poker-rng
npm install
npm start
```

或者直接运行：
```bash
./start.sh
```

## 打包为 .app

```bash
npm run build
```
打包后的 .app 文件在 `dist/` 目录中。

## 系统要求
- macOS 10.15+
- Node.js 16+

## 技术栈
- Electron 33
- 密码学安全随机数生成器 (crypto.randomBytes)
- macOS vibrancy 效果
- 全局快捷键注册
